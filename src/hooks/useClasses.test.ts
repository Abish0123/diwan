import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// useClasses.ts (the file under test) is a thin useContext wrapper around
// ClassContext. The real, meaningful logic (fetching, CRUD, loading state,
// the "shared institutional data" fetch behavior) lives in ClassProvider in
// src/contexts/ClassContext.tsx. To test useClasses.ts in a way that
// actually exercises its behavior (not just "returns an object"), we render
// it inside the real ClassProvider and mock only the genuine external
// boundaries: smartDb, useAuth, and the firebase module (onSnapshot etc.).

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
  handleFirestoreError: vi.fn((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  }),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", GET: "get", WRITE: "write" },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { ClassContext, ClassProvider } from "../contexts/ClassContext";
import { useClasses } from "./useClasses";

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetAll = vi.mocked(smartDb.getAll);
const mockedCreate = vi.mocked(smartDb.create);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ClassProvider, null, children);
}

describe("useClasses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when rendered outside a ClassProvider", () => {
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useClasses())).toThrow(
      "useClasses must be used within a ClassProvider"
    );
    spy.mockRestore();
  });

  it("returns the exact context value supplied by a raw ClassContext.Provider", () => {
    const fakeValue = {
      classes: [{ id: "c1" }],
      sections: [],
      enrollments: [],
      academicYears: [],
      timetableSlots: [],
      addClass: vi.fn(),
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
      addSection: vi.fn(),
      updateSection: vi.fn(),
      deleteSection: vi.fn(),
      addEnrollment: vi.fn(),
      updateEnrollment: vi.fn(),
      deleteEnrollment: vi.fn(),
      addAcademicYear: vi.fn(),
      updateAcademicYear: vi.fn(),
      deleteAcademicYear: vi.fn(),
      addTimetableSlot: vi.fn(),
      updateTimetableSlot: vi.fn(),
      deleteTimetableSlot: vi.fn(),
      loading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const { result } = renderHook(() => useClasses(), {
      wrapper: ({ children }) =>
        React.createElement(ClassContext.Provider, { value: fakeValue }, children),
    });

    expect(result.current).toBe(fakeValue);
    expect(result.current.classes).toEqual([{ id: "c1" }]);
  });

  it("starts loading and then populates classes/sections/enrollments from smartDb when a user is present", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: false } as any);

    const classes = [{ id: "cl1", name: "Grade 5" }];
    const sections = [{ id: "s1", name: "A" }];
    const enrollments = [{ id: "e1", studentId: "st1" }];
    const years = [{ id: "y1", name: "2026" }];
    const slots = [{ id: "sl1", day: "Mon" }];

    mockedGetAll.mockImplementation(async (entity: string) => {
      switch (entity) {
        case "Class": return classes as any;
        case "Section": return sections as any;
        case "Enrollment": return enrollments as any;
        case "AcademicYear": return years as any;
        case "TimetableSlot": return slots as any;
        default: return [];
      }
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    // Loading should resolve once fetchAllData completes.
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual(classes);
    expect(result.current.sections).toEqual(sections);
    expect(result.current.enrollments).toEqual(enrollments);
    expect(result.current.academicYears).toEqual(years);
    expect(result.current.timetableSlots).toEqual(slots);
  });

  it("clears all data and stops loading when there is no authenticated user", async () => {
    mockedUseAuth.mockReturnValue({ user: null, isMockSession: false } as any);

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual([]);
    expect(result.current.sections).toEqual([]);
    expect(result.current.enrollments).toEqual([]);
    expect(result.current.academicYears).toEqual([]);
    expect(result.current.timetableSlots).toEqual([]);
    // smartDb should never have been queried since there's no user.
    expect(mockedGetAll).not.toHaveBeenCalled();
  });

  it("keeps data empty and stops loading (does not throw) when smartDb.getAll rejects", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-1" }, isMockSession: false } as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGetAll.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error fetching academic data:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("addClass stamps the record with the current user's uid and createdAt, then refetches", async () => {
    mockedUseAuth.mockReturnValue({ user: { uid: "admin-42" }, isMockSession: false } as any);
    mockedGetAll.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "new-class-1" } as any);

    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnedId: string | undefined;
    await waitFor(async () => {
      returnedId = await result.current.addClass({ name: "Grade 9" } as any);
    });

    expect(mockedCreate).toHaveBeenCalledWith(
      "Class",
      expect.objectContaining({ name: "Grade 9", uid: "admin-42", createdAt: expect.any(String) })
    );
    expect(returnedId).toBe("new-class-1");
    // fetchAllData is re-triggered after a successful create (mock path, since
    // isFirestoreWorking is forced false in this app).
    expect(mockedGetAll).toHaveBeenCalledWith("Class", undefined);
  });

  it("addClass is a no-op (does not call smartDb) when there is no authenticated user", async () => {
    mockedUseAuth.mockReturnValue({ user: null, isMockSession: false } as any);

    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const returned = await result.current.addClass({ name: "Grade 9" } as any);

    expect(returned).toBeUndefined();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
