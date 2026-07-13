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
import { TimetableEditor } from "./TimetableEditor";
import type { TimetableEntry } from "@/types/timetable";

function makeEntry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  return {
    id: "e1",
    day: "Monday",
    slotId: "SL1",
    subjectId: "S1",
    teacherId: "T1",
    roomId: "R101",
    classId: "C1",
    sectionId: "A",
    ...overrides,
  };
}

function renderEditor(props: Partial<React.ComponentProps<typeof TimetableEditor>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <TimetableProvider>
      <TimetableEditor
        open={true}
        onOpenChange={onOpenChange}
        day="Monday"
        slotId="SL1"
        entry={null}
        classId="C1"
        sectionId="A"
        {...props}
      />
    </TimetableProvider>
  );
  return { ...utils, onOpenChange };
}

describe("TimetableEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
  });

  it("shows 'Assign Period' title and defaults start/end time from the slot when creating a new entry", async () => {
    renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    expect(screen.getByText("Assign Period")).toBeInTheDocument();
    expect(screen.getByText("Select Subject")).toBeInTheDocument();
    expect(screen.getByText("Select Teacher")).toBeInTheDocument();
    const startInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(startInput.value).toBe("08:00");
  });

  it("does not render a delete button when creating a new entry", async () => {
    renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    // Only the subject/teacher combobox buttons + cancel/save should exist — no trash icon button.
    expect(document.querySelector("svg.lucide-trash2")).not.toBeInTheDocument();
  });

  it("shows 'Edit Period' title, prefilled subject/teacher, and a delete button when editing an existing entry", async () => {
    renderEditor({ entry: makeEntry() });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    expect(screen.getByText("Edit Period")).toBeInTheDocument();
    expect(screen.getByText("Mathematics (MATH)")).toBeInTheDocument();
    expect(screen.getByText("Mr. Smith")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-trash2")).toBeInTheDocument();
  });

  it("calls deleteEntry and closes the dialog when the delete button is clicked", async () => {
    const { onOpenChange } = renderEditor({ entry: makeEntry() });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    const deleteBtn = document.querySelector("svg.lucide-trash2")!.closest("button")!;
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(smartDbMocks.delete).toHaveBeenCalledWith("TimetableEntry", "e1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows conflict messages for the entry being edited", async () => {
    const entries = [
      makeEntry({ id: "e1", teacherId: "T1", day: "Monday", slotId: "SL1", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", teacherId: "T1", day: "Monday", slotId: "SL1", classId: "C2", sectionId: "B" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);
    renderEditor({ entry: entries[0] });
    expect(await screen.findByText("Conflict Detected")).toBeInTheDocument();
    expect(screen.getByText(/Mr. Smith is already assigned at this time/)).toBeInTheDocument();
  });

  it("opens the Subject picker and selects a subject, updating the trigger label", async () => {
    renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Select Subject"));
    const option = await screen.findByText("Science (SCI)");
    fireEvent.click(option);
    await waitFor(() => expect(screen.getByText("Science (SCI)", { selector: "div" })).toBeInTheDocument());
  });

  it("opens the Teacher picker and selects a teacher, updating the trigger label", async () => {
    renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Select Teacher"));
    const option = await screen.findByText("Ms. Johnson");
    fireEvent.click(option);
    await waitFor(() => {
      // Trigger button now shows the selected teacher's name.
      expect(screen.getAllByText("Ms. Johnson").length).toBeGreaterThan(0);
    });
  });

  it("updates the start/end time inputs on change", async () => {
    renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    const timeInputs = document.querySelectorAll('input[type="time"]');
    fireEvent.change(timeInputs[0], { target: { value: "07:30" } });
    fireEvent.change(timeInputs[1], { target: { value: "08:15" } });
    expect((timeInputs[0] as HTMLInputElement).value).toBe("07:30");
    expect((timeInputs[1] as HTMLInputElement).value).toBe("08:15");
  });

  it("calls addEntry with the form data and day/slot/class/section on submit for a new entry", async () => {
    renderEditor({ classId: "C3", sectionId: "C" });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Select Subject"));
    fireEvent.click(await screen.findByText("English (ENG)"));
    await waitFor(() => expect(screen.getByText("English (ENG)", { selector: "div" })).toBeInTheDocument());

    fireEvent.click(screen.getByText("Select Teacher"));
    const davisOption = await screen.findByText("Ms. Davis");
    fireEvent.click(davisOption);
    await waitFor(() => expect(screen.getAllByText("Ms. Davis").length).toBeGreaterThan(0));

    const submitBtn = screen.getByText("Save Period").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalled());
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "TimetableEntry",
      expect.objectContaining({
        subjectId: "S3",
        teacherId: "T3",
        day: "Monday",
        slotId: "SL1",
        classId: "C3",
        sectionId: "C",
      })
    );
  });

  it("calls updateEntry with the entry id and formData on submit when editing", async () => {
    renderEditor({ entry: makeEntry() });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    const submitBtn = screen.getByText("Update Period").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => expect(smartDbMocks.update).toHaveBeenCalled());
    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "TimetableEntry",
      "e1",
      expect.objectContaining({ subjectId: "S1", teacherId: "T1" })
    );
  });

  it("closes the dialog via onOpenChange after a successful submit", async () => {
    const { onOpenChange } = renderEditor({ entry: makeEntry() });
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Update Period").closest("button")!);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("calls onOpenChange(false) when Cancel is clicked without submitting", async () => {
    const { onOpenChange } = renderEditor();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("does not render form content while closed", () => {
    renderEditor({ open: false });
    expect(screen.queryByText("Assign Period")).not.toBeInTheDocument();
  });
});
