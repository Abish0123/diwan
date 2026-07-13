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

// firebase/firestore SDK — only onSnapshot/collection/etc are used by this file.
const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-ts"),
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

import { ClassProvider, useClasses } from "./ClassContext";

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ClassProvider>{children}</ClassProvider>;
  };
}

const sampleClasses = [{ id: "c1", name: "Grade 5", uid: "someone-else" }];
const sampleSections = [{ id: "s1", name: "Section A", classId: "c1", uid: "someone-else" }];
const sampleEnrollments = [{ id: "e1", studentId: "stu1", classId: "c1", uid: "someone-else" }];
const sampleYears = [{ id: "y1", name: "2025-2026", uid: "someone-else" }];
const sampleSlots = [{ id: "t1", day: "Mon", uid: "someone-else" }];

function mockGetAllDefaults() {
  smartDbMocks.getAll.mockImplementation(async (entity: string) => {
    switch (entity) {
      case "Class":
        return sampleClasses;
      case "Section":
        return sampleSections;
      case "Enrollment":
        return sampleEnrollments;
      case "AcademicYear":
        return sampleYears;
      case "TimetableSlot":
        return sampleSlots;
      default:
        return [];
    }
  });
}

describe("ClassContext / useClasses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    authMocks.isMockSession = true;
    firestoreMocks.isFirestoreWorking = false;
    smartDbMocks.create.mockResolvedValue({ id: "new-id" });
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    mockGetAllDefaults();
  });

  it("throws when useClasses is used outside a ClassProvider", () => {
    // Suppress React's error-boundary console noise for this expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useClasses())).toThrow(
      "useClasses must be used within a ClassProvider"
    );
    spy.mockRestore();
  });

  it("starts in a loading state and loads all five collections via smartDb (mock-session path)", async () => {
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual(sampleClasses);
    expect(result.current.sections).toEqual(sampleSections);
    expect(result.current.enrollments).toEqual(sampleEnrollments);
    expect(result.current.academicYears).toEqual(sampleYears);
    expect(result.current.timetableSlots).toEqual(sampleSlots);

    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Class", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Section", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Enrollment", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("AcademicYear", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("TimetableSlot", undefined);

    // Institutional-data business rule: records created by other admins must
    // still surface — the data is NOT filtered down to the viewer's own uid.
    expect(result.current.classes[0].uid).toBe("someone-else");
  });

  it("does not subscribe to firestore onSnapshot when in a mock session, even if firestore is 'working'", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;

    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("resets all collections to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual([]);
    expect(result.current.sections).toEqual([]);
    expect(result.current.enrollments).toEqual([]);
    expect(result.current.academicYears).toEqual([]);
    expect(result.current.timetableSlots).toEqual([]);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("subscribes via firestore onSnapshot when firestore is working and not a mock session", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;

    // Capture the callbacks so we can drive snapshot updates manually.
    const callbacks: Array<(snap: unknown) => void> = [];
    onSnapshotMock.mockImplementation((_col: unknown, cb: (snap: unknown) => void) => {
      callbacks.push(cb);
      return vi.fn(); // unsubscribe fn
    });

    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });

    // 5 onSnapshot subscriptions: classes, sections, enrollments, years, slots
    expect(onSnapshotMock).toHaveBeenCalledTimes(5);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();

    const fakeDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

    act(() => {
      callbacks[0]({ docs: [fakeDoc("c1", { name: "Grade 6" })] }); // classes
      callbacks[1]({ docs: [fakeDoc("s1", { name: "Section B" })] }); // sections
      callbacks[2]({ docs: [] }); // enrollments
      callbacks[3]({ docs: [] }); // years
      callbacks[4]({ docs: [] }); // slots -> this one also flips loading off
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual([{ id: "c1", name: "Grade 6" }]);
    expect(result.current.sections).toEqual([{ id: "s1", name: "Section B" }]);
  });

  it("addClass stamps uid + createdAt, persists via smartDb, and refetches in mock-session mode", async () => {
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAll.mockClear();

    let returnedId: string | undefined;
    await act(async () => {
      returnedId = await result.current.addClass({ name: "Grade 7", gradeLevel: 7 } as never);
    });

    expect(returnedId).toBe("new-id");
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Class",
      expect.objectContaining({ name: "Grade 7", uid: "admin-1", createdAt: expect.any(String) })
    );
    // Mock-session path re-fetches everything after a write.
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
  });

  it("addClass is a no-op (returns undefined, does not call smartDb) when there is no user", async () => {
    authMocks.user = null;
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnedId: string | undefined = "unset" as unknown as string;
    await act(async () => {
      returnedId = await result.current.addClass({ name: "Ghost class" } as never);
    });

    expect(returnedId).toBeUndefined();
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("updateClass persists the partial update with an updatedAt timestamp", async () => {
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateClass("c1", { name: "Renamed" });
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Class",
      "c1",
      expect.objectContaining({ name: "Renamed", updatedAt: expect.any(String) })
    );
  });

  it("deleteClass calls smartDb.delete with the given id", async () => {
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteClass("c1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Class", "c1");
  });

  it("routes create errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("write failed");
    smartDbMocks.create.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEnrollment({ studentId: "stu2", classId: "c1" } as never);
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "enrollments");
  });

  it("addAcademicYear and addTimetableSlot stamp uid + createdAt like the other entities", async () => {
    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addAcademicYear({ name: "2026-2027" } as never);
      await result.current.addTimetableSlot({ day: "Tue" } as never);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "AcademicYear",
      expect.objectContaining({ name: "2026-2027", uid: "admin-1" })
    );
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "TimetableSlot",
      expect.objectContaining({ day: "Tue", uid: "admin-1" })
    );
  });

  it("recovers from a getAll rejection by clearing the loading flag (and logs the error)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    smartDbMocks.getAll.mockReset();
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useClasses(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error fetching academic data:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
