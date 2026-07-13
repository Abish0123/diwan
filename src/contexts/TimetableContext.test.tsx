import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

// Controllable auth state used by the mocked useAuth hook.
const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, isMockSession: authMocks.isMockSession }),
}));

// Controllable firestore-working flag + firestore error handler.
const firestoreMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firestoreMocks.isFirestoreWorking;
  },
}));

// firebase/firestore SDK — only collection/query/where/onSnapshot are used here.
const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));
const queryMock = vi.fn((col: unknown, ...clauses: unknown[]) => ({ __query: col, clauses }));
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  query: (...args: unknown[]) => queryMock(...(args as [unknown, ...unknown[]])),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
}));

// smartDb — the local/MySQL-backed data layer used in the non-firestore path.
const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

// sonner toast — capture calls, don't render real toasts.
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
    info: (...args: unknown[]) => toastMocks.info(...args),
    loading: (...args: unknown[]) => toastMocks.loading(...args),
    dismiss: (...args: unknown[]) => toastMocks.dismiss(...args),
  },
}));

import { TimetableProvider, useTimetable } from "./TimetableContext";

// TimetableContext.tsx previously omitted the `useContext` import (now
// fixed — see "throws the intended friendly error" below). This wrapper is
// kept so the many call sites below didn't need touching; it now just
// delegates to the real, working useTimetable() hook.
function useTimetableViaContext() {
  return useTimetable();
}
import type { TimetableEntry } from "@/types/timetable";

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <TimetableProvider>{children}</TimetableProvider>;
  };
}

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

describe("TimetableContext / useTimetable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    authMocks.isMockSession = true;
    firestoreMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
  });

  // TimetableContext.tsx previously omitted the `useContext` import, so
  // useTimetable() threw a raw ReferenceError instead of this intended
  // friendly error for every caller (a real, now-fixed production bug —
  // see TimetableContext.tsx's import line). Confirms the fix.
  it("throws the intended friendly error when used outside a TimetableProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTimetable())).toThrow(/useTimetable must be used within a TimetableProvider/);
    spy.mockRestore();
  });

  it("exposes the static reference data (subjects, teachers, rooms, timeSlots, days)", async () => {
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.subjects.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(result.current.teachers.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);
    expect(result.current.rooms.map((r) => r.id)).toEqual(["R101", "R102", "R103", "LAB1", "GYM"]);
    expect(result.current.timeSlots).toHaveLength(7);
    expect(result.current.days).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(result.current.isPublished).toBe(false);
  });

  it("starts in loading state and loads entries via smartDb in mock-session mode", async () => {
    const entries = [makeEntry()];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual(entries);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("TimetableEntry", "admin-1");
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("resets entries to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("does not subscribe to firestore onSnapshot when in a mock session, even if firestore is 'working'", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("uses smartDb fetch (not onSnapshot) for demo- uids even outside a mock session when firestore is working", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    authMocks.user = { uid: "demo-123" };

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("TimetableEntry", "demo-123");
  });

  it("subscribes via firestore onSnapshot when firestore is working and not a mock/demo session", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    authMocks.user = { uid: "real-uid" };

    let capturedCb: ((snap: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_q: unknown, cb: (snap: unknown) => void) => {
      capturedCb = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalledWith("uid", "==", "real-uid");

    const fakeDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
    act(() => {
      capturedCb!({ docs: [fakeDoc("e9", { day: "Tuesday", slotId: "SL2" })] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([{ id: "e9", day: "Tuesday", slotId: "SL2" }]);
  });

  it("recovers from a getAll rejection by clearing the loading flag (and logs the error)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error fetching timetable entries:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  // ── Conflict detection (real business logic) ──────────────────────────────

  it("detects a teacher conflict when two entries share day+slot+teacher", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R102", classId: "C2", sectionId: "B" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0]).toMatchObject({
      type: "teacher",
      entryId: "e1",
      conflictingEntryId: "e2",
    });
    expect(result.current.conflicts[0].message).toContain("Mr. Smith");
  });

  it("detects a room conflict when two entries share day+slot+room but different teachers/classes", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T2", roomId: "R101", classId: "C2", sectionId: "B" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].type).toBe("room");
    expect(result.current.conflicts[0].message).toContain("Room 101");
  });

  it("detects a class/section conflict when two entries share day+slot+class+section", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T2", roomId: "R102", classId: "C1", sectionId: "A" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].type).toBe("class");
  });

  it("reports no conflicts for entries on different days/slots", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1" }),
      makeEntry({ id: "e2", day: "Tuesday", slotId: "SL1", teacherId: "T1" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conflicts).toEqual([]);
  });

  it("checkConflicts can be invoked manually and recomputes the same result", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R101", classId: "C1", sectionId: "A" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T1", roomId: "R102", classId: "C2", sectionId: "B" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conflicts).toHaveLength(1);

    act(() => {
      result.current.checkConflicts();
    });
    expect(result.current.conflicts).toHaveLength(1);
  });

  // ── CRUD actions ────────────────────────────────────────────────────────

  it("addEntry stamps uid, resolves the subject color, persists via smartDb, and refetches (mock-session)", async () => {
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAll.mockClear();

    await act(async () => {
      await result.current.addEntry({
        day: "Monday",
        slotId: "SL1",
        subjectId: "S1",
        teacherId: "T1",
        roomId: "R101",
        classId: "C1",
        sectionId: "A",
      });
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "TimetableEntry",
      expect.objectContaining({
        subjectId: "S1",
        uid: "admin-1",
        color: expect.stringContaining("purple"),
        createdAt: expect.any(String),
      })
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Period added successfully");
    // isFirestoreWorking is false, so it refetches after the write.
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
  });

  it("addEntry is a no-op (does not call smartDb) when there is no user", async () => {
    authMocks.user = null;
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntry({
        day: "Monday",
        slotId: "SL1",
        subjectId: "S1",
        teacherId: "T1",
        classId: "C1",
        sectionId: "A",
      });
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("routes addEntry errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("write failed");
    smartDbMocks.create.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntry({
        day: "Monday",
        slotId: "SL1",
        subjectId: "S1",
        teacherId: "T1",
        classId: "C1",
        sectionId: "A",
      });
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "TimetableEntry");
  });

  it("updateEntry persists the partial update with an updatedAt timestamp", async () => {
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateEntry("e1", { roomId: "R102" });
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "TimetableEntry",
      "e1",
      expect.objectContaining({ roomId: "R102", updatedAt: expect.any(String) })
    );
    expect(toastMocks.info).toHaveBeenCalledWith("Period updated");
  });

  it("deleteEntry calls smartDb.delete with the given id", async () => {
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteEntry("e1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("TimetableEntry", "e1");
    expect(toastMocks.error).toHaveBeenCalledWith("Period removed");
  });

  // ── publishTimetable business rule ─────────────────────────────────────

  it("publishTimetable sets isPublished=true and succeeds when there are no conflicts", async () => {
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.publishTimetable();
    });

    expect(result.current.isPublished).toBe(true);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Timetable published to students and teachers!"
    );
  });

  it("publishTimetable refuses to publish (and does not flip isPublished) when conflicts exist", async () => {
    const entries = [
      makeEntry({ id: "e1", day: "Monday", slotId: "SL1", teacherId: "T1" }),
      makeEntry({ id: "e2", day: "Monday", slotId: "SL1", teacherId: "T1" }),
    ];
    smartDbMocks.getAll.mockResolvedValue(entries);

    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conflicts.length).toBeGreaterThan(0);

    act(() => {
      result.current.publishTimetable();
    });

    expect(result.current.isPublished).toBe(false);
    expect(toastMocks.error).toHaveBeenCalledWith("Cannot publish with active conflicts!");
  });

  // ── generateAITimetable ─────────────────────────────────────────────────

  it("generateAITimetable creates one entry per day for the first 4 time slots, tagged with the given class/section", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimetableViaContext(), { wrapper: makeWrapper() });
    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });

    const genPromise = act(async () => {
      const p = result.current.generateAITimetable({ classId: "C9", sectionId: "Z" });
      await vi.advanceTimersByTimeAsync(2000);
      await p;
    });
    await genPromise;

    // 6 days * 4 slots = 24 created entries
    expect(smartDbMocks.create).toHaveBeenCalledTimes(24);
    const firstCallArgs = smartDbMocks.create.mock.calls[0];
    expect(firstCallArgs[0]).toBe("TimetableEntry");
    expect(firstCallArgs[1]).toMatchObject({ classId: "C9", sectionId: "Z", day: "Monday" });
    expect(toastMocks.loading).toHaveBeenCalledWith("AI is generating an optimized timetable...");
    expect(toastMocks.dismiss).toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith("AI Timetable generated successfully!");

    vi.useRealTimers();
  }, 10000);
});
