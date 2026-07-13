import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
import { WeeklyGrid } from "./WeeklyGrid";
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

function renderGrid(props: Partial<React.ComponentProps<typeof WeeklyGrid>> = {}) {
  const onCellClick = vi.fn();
  const onGoLive = vi.fn();
  const utils = render(
    <TimetableProvider>
      <WeeklyGrid
        onCellClick={onCellClick}
        onGoLive={onGoLive}
        selectedClass="C1"
        selectedSection="A"
        {...props}
      />
    </TimetableProvider>
  );
  return { ...utils, onCellClick, onGoLive };
}

describe("WeeklyGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([]);
  });

  it("renders the day headers and time slot rows from the shared timetable reference data", async () => {
    renderGrid();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  it("only renders entries matching the selected class + section", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeEntry({ id: "e1", classId: "C1", sectionId: "A", subjectId: "S1" }),
      makeEntry({ id: "e2", classId: "C2", sectionId: "B", subjectId: "S2", day: "Tuesday" }),
    ]);
    renderGrid({ selectedClass: "C1", selectedSection: "A" });
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Science")).not.toBeInTheDocument();
  });

  it("shows teacher name, room, subject code, and time range for a placed entry", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeEntry()]);
    renderGrid();
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Mr. Smith")).toBeInTheDocument();
    expect(screen.getByText("Room 101")).toBeInTheDocument();
    expect(screen.getByText("MATH")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 09:00")).toBeInTheDocument();
  });

  it("falls back to 'N/A' for the room when the entry has no roomId", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeEntry({ roomId: undefined })]);
    renderGrid();
    expect(await screen.findByText("N/A")).toBeInTheDocument();
  });

  it("invokes onCellClick with day/slot/entry when a filled cell is clicked (not read-only)", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeEntry()]);
    const { onCellClick } = renderGrid();
    const subjectEl = await screen.findByText("Mathematics");
    fireEvent.click(subjectEl);
    expect(onCellClick).toHaveBeenCalledWith("Monday", "SL1", expect.objectContaining({ id: "e1" }));
  });

  it("invokes onGoLive (via the Go Live button) without triggering onCellClick, due to stopPropagation", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeEntry()]);
    const { onCellClick, onGoLive } = renderGrid();
    const goLiveBtn = await screen.findByTitle("Go Live Now");
    fireEvent.click(goLiveBtn);
    expect(onGoLive).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
    expect(onCellClick).not.toHaveBeenCalled();
  });

  it("does not render the Go Live button, and disables cell click, in readOnly mode", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeEntry()]);
    const { onCellClick } = renderGrid({ readOnly: true });
    const subjectEl = await screen.findByText("Mathematics");
    expect(screen.queryByTitle("Go Live Now")).not.toBeInTheDocument();
    fireEvent.click(subjectEl);
    expect(onCellClick).not.toHaveBeenCalled();
  });

  it("shows a conflict indicator (AlertCircle) on entries flagged in the conflicts list", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T1", classId: "C9", sectionId: "Z" }),
    ]);
    const { container } = renderGrid({ selectedClass: "C1", selectedSection: "A" });
    await screen.findByText("Mathematics");
    // e1 conflicts with e2 (same teacher/day/slot) -> ring classes applied to the Card.
    await waitFor(() => {
      expect(container.querySelector(".ring-rose-500")).toBeInTheDocument();
    });
  });

  it("renders an empty-slot add button for cells with no entry (non-read-only)", async () => {
    renderGrid();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    // 6 days * 7 slots = 42 empty-cell add buttons when there are no entries.
    const addButtons = document.querySelectorAll("button svg.lucide-plus");
    expect(addButtons.length).toBe(42);
  });
});
