import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  // @ts-expect-error jsdom lacks ResizeObserver
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ── Mock external boundaries used transitively by TimetableProvider ────────
const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, isMockSession: authMocks.isMockSession }),
}));

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
  isFirestoreWorking: false,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import { TimetableProvider } from "@/contexts/TimetableContext";
import { AIGeneratorModal } from "./AIGeneratorModal";

function renderModal(props: Partial<React.ComponentProps<typeof AIGeneratorModal>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <TimetableProvider>
      <AIGeneratorModal
        open={true}
        onOpenChange={onOpenChange}
        classId="C1"
        sectionId="A"
        {...props}
      />
    </TimetableProvider>
  );
  return { ...utils, onOpenChange };
}

describe("AIGeneratorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
  });

  it("does not render dialog content when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByText("AI Timetable Generator")).not.toBeInTheDocument();
  });

  it("renders the class/section-specific description and default constraint checkboxes when open", async () => {
    renderModal({ classId: "C9", sectionId: "Z" });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    expect(screen.getByText("AI Timetable Generator")).toBeInTheDocument();
    expect(
      screen.getByText("Generate an optimized, conflict-free timetable for C9-Z.")
    ).toBeInTheDocument();
    expect(screen.getByText("Avoid Consecutive Subjects")).toBeInTheDocument();
    expect(screen.getByText("Balance Teacher Workload")).toBeInTheDocument();
    expect(screen.getByText("Optimize Room Usage")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const { onOpenChange } = renderModal();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a generating state, calls generateAITimetable (creating entries), and closes the dialog on success", async () => {
    vi.useFakeTimers();
    const { onOpenChange } = renderModal({ classId: "C5", sectionId: "B" });
    await vi.waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled(), { timeout: 5000 });

    fireEvent.click(screen.getByText("Generate Timetable"));
    expect(screen.getByText("Generating...")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 5000 });

    // 6 days * first 4 slots = 24 created entries, tagged with the given class/section.
    expect(smartDbMocks.create).toHaveBeenCalledTimes(24);
    expect(smartDbMocks.create.mock.calls[0][1]).toMatchObject({ classId: "C5", sectionId: "B" });

    vi.useRealTimers();
  }, 10000);

  it("disables the Cancel and Generate buttons while generation is in progress", async () => {
    vi.useFakeTimers();
    renderModal();
    await vi.waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled(), { timeout: 5000 });

    fireEvent.click(screen.getByText("Generate Timetable"));
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Generating...").closest("button")).toBeDisabled();

    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
  }, 10000);
});
