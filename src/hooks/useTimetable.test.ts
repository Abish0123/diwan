import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// useTimetable.ts (the file under test) is a thin useContext wrapper around
// TimetableContext. The real, meaningful logic (fetching entries, computing
// conflicts, add/update/delete, AI generation, publish gating) lives in
// TimetableProvider in src/contexts/TimetableContext.tsx. To exercise
// useTimetable.ts in a way that tests real behavior (not just "returns an
// object"), we render it inside the real TimetableProvider and mock only the
// genuine external boundaries: smartDb, useAuth, sonner's toast, and the
// firebase module (onSnapshot etc.).

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/firebase", () => ({
  db: {},
  isFirestoreWorking: false,
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", GET: "get", WRITE: "write" },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handleFirestoreError } from "@/firebase";
import { TimetableContext, TimetableProvider } from "@/contexts/TimetableContext";
import { useTimetable } from "./useTimetable";

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetAll = vi.mocked(smartDb.getAll);
const mockedCreate = vi.mocked(smartDb.create);
const mockedUpdate = vi.mocked(smartDb.update);
const mockedDelete = vi.mocked(smartDb.delete);
const mockedHandleFirestoreError = vi.mocked(handleFirestoreError);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(TimetableProvider, null, children);
}

describe("useTimetable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when rendered outside a TimetableProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTimetable())).toThrow(
      "useTimetable must be used within a TimetableProvider"
    );
    spy.mockRestore();
  });

  it("returns the exact context value supplied by a raw TimetableContext.Provider", () => {
    const fakeValue = {
      entries: [{ id: "e1" }],
      subjects: [],
      teachers: [],
      rooms: [],
      timeSlots: [],
      days: [],
      conflicts: [],
      addEntry: vi.fn(),
      updateEntry: vi.fn(),
      deleteEntry: vi.fn(),
      generateAITimetable: vi.fn(),
      checkConflicts: vi.fn(),
      publishTimetable: vi.fn(),
      isPublished: false,
      loading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const { result } = renderHook(() => useTimetable(), {
      wrapper: ({ children }) =>
        React.createElement(TimetableContext.Provider, { value: fakeValue }, children),
    });

    expect(result.current).toBe(fakeValue);
    expect(result.current.entries).toEqual([{ id: "e1" }]);
  });

  it("starts loading and populates static lookup data (subjects/teachers/rooms/timeSlots/days) regardless of user", async () => {
    mockedUseAuth.mockReturnValue({ user: null, isMockSession: false } as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.subjects.map((s: any) => s.code)).toEqual([
      "MATH", "SCI", "ENG", "HIST", "CS", "PE",
    ]);
    expect(result.current.teachers).toHaveLength(6);
    expect(result.current.rooms.map((r: any) => r.id)).toEqual([
      "R101", "R102", "R103", "LAB1", "GYM",
    ]);
    expect(result.current.timeSlots).toHaveLength(7);
    expect(result.current.days).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ]);
  });

  it("clears entries and stops loading when there is no authenticated user (no smartDb call)", async () => {
    mockedUseAuth.mockReturnValue({ user: null, isMockSession: false } as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(mockedGetAll).not.toHaveBeenCalled();
  });

  it("fetches entries via smartDb for a mock session user (isFirestoreWorking is false)", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const entries = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
    ];
    mockedGetAll.mockResolvedValue(entries as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedGetAll).toHaveBeenCalledWith("TimetableEntry", "admin-1");
    expect(result.current.entries).toEqual(entries);
  });

  it("keeps entries empty and stops loading (does not throw) when smartDb.getAll rejects", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGetAll.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useTimetable(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error fetching timetable entries:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("detects a teacher conflict when two entries share the same day/slot/teacher", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const entries = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
      { id: "e2", day: "Monday", slotId: "SL1", subjectId: "S2", teacherId: "T1", roomId: "R102", classId: "C2", sectionId: "B" },
    ];
    mockedGetAll.mockResolvedValue(entries as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const teacherConflicts = result.current.conflicts.filter((c: any) => c.type === "teacher");
    expect(teacherConflicts).toHaveLength(1);
    expect(teacherConflicts[0].message).toContain("Mr. Smith");
    expect(teacherConflicts[0].entryId).toBe("e1");
    expect(teacherConflicts[0].conflictingEntryId).toBe("e2");
  });

  it("detects a room conflict when two entries share the same day/slot/room but different teachers", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const entries = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
      { id: "e2", day: "Monday", slotId: "SL1", subjectId: "S2", teacherId: "T2", roomId: "R101", classId: "C2", sectionId: "B" },
    ];
    mockedGetAll.mockResolvedValue(entries as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const roomConflicts = result.current.conflicts.filter((c: any) => c.type === "room");
    expect(roomConflicts).toHaveLength(1);
    expect(roomConflicts[0].message).toContain("Room 101");
  });

  it("detects a class/section conflict when two entries share the same day/slot/classId/sectionId", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const entries = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
      { id: "e2", day: "Monday", slotId: "SL1", subjectId: "S2", teacherId: "T2", roomId: "R102", classId: "C1", sectionId: "A" },
    ];
    mockedGetAll.mockResolvedValue(entries as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const classConflicts = result.current.conflicts.filter((c: any) => c.type === "class");
    expect(classConflicts).toHaveLength(1);
    expect(classConflicts[0].message).toContain("C1-A");
  });

  it("reports no conflicts when entries don't overlap in day/slot", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const entries = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
      { id: "e2", day: "Tuesday", slotId: "SL2", subjectId: "S2", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
    ];
    mockedGetAll.mockResolvedValue(entries as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conflicts).toEqual([]);
  });

  it("addEntry stamps uid, subject color, and createdAt, then refetches and toasts success", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-42" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "new-1" } as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntry({
        day: "Monday",
        slotId: "SL1",
        subjectId: "S1",
        teacherId: "T1",
        roomId: "R101",
        classId: "C1",
        sectionId: "A",
      } as any);
    });

    expect(mockedCreate).toHaveBeenCalledWith(
      "TimetableEntry",
      expect.objectContaining({
        uid: "admin-42",
        color: "bg-purple-500/10 text-purple-600 border-purple-200",
        createdAt: expect.any(String),
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Period added successfully");
    // refetch happens because isFirestoreWorking is mocked false
    expect(mockedGetAll).toHaveBeenCalledWith("TimetableEntry", "admin-42");
  });

  it("addEntry is a no-op (does not call smartDb) when there is no authenticated user", async () => {
    mockedUseAuth.mockReturnValue({ user: null, isMockSession: false } as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntry({ day: "Monday" } as any);
    });

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("addEntry routes smartDb failures to handleFirestoreError instead of throwing", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-42" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);
    const err = new Error("create failed");
    mockedCreate.mockRejectedValue(err);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntry({ day: "Monday", subjectId: "S1" } as any);
    });

    expect(mockedHandleFirestoreError).toHaveBeenCalledWith(err, "create", "TimetableEntry");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("updateEntry calls smartDb.update with stamped updatedAt and toasts info", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateEntry("e1", { roomId: "R102" });
    });

    expect(mockedUpdate).toHaveBeenCalledWith(
      "TimetableEntry",
      "e1",
      expect.objectContaining({ roomId: "R102", updatedAt: expect.any(String) })
    );
    expect(toast.info).toHaveBeenCalledWith("Period updated");
  });

  it("deleteEntry calls smartDb.delete and toasts an error-style removal notice", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteEntry("e1");
    });

    expect(mockedDelete).toHaveBeenCalledWith("TimetableEntry", "e1");
    expect(toast.error).toHaveBeenCalledWith("Period removed");
  });

  it("publishTimetable sets isPublished true and toasts success when there are no conflicts", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPublished).toBe(false);

    act(() => {
      result.current.publishTimetable();
    });

    expect(result.current.isPublished).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Timetable published to students and teachers!");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("publishTimetable refuses to publish and toasts an error when conflicts exist", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    const conflicting = [
      { id: "e1", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" },
      { id: "e2", day: "Monday", slotId: "SL1", subjectId: "S2", teacherId: "T1", roomId: "R102", classId: "C2", sectionId: "B" },
    ];
    mockedGetAll.mockResolvedValue(conflicting as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.conflicts.length).toBeGreaterThan(0));

    act(() => {
      result.current.publishTimetable();
    });

    expect(result.current.isPublished).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Cannot publish with active conflicts!");
  });

  it("generateAITimetable creates entries for every day x first-4-slots combination and toasts success", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: true } as any);
    mockedGetAll.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "gen-1" } as any);

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.generateAITimetable({ classId: "C1", sectionId: "A" });
    });

    // 6 days * 4 slots = 24 generated entries, each persisted via addEntry -> smartDb.create
    expect(mockedCreate).toHaveBeenCalledTimes(24);
    expect(mockedCreate.mock.calls.every(([entity]) => entity === "TimetableEntry")).toBe(true);
    expect(mockedCreate.mock.calls.every(([, payload]: any) => payload.classId === "C1" && payload.sectionId === "A")).toBe(true);
    expect(toast.loading).toHaveBeenCalledWith("AI is generating an optimized timetable...");
    expect(toast.dismiss).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("AI Timetable generated successfully!");
  }, 10000);
});
