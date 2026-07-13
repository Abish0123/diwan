import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role, isMockSession: authMocks.isMockSession }),
}));

const parentChildrenMocks = vi.hoisted(() => ({
  children: [] as { id: string }[],
}));

vi.mock("@/hooks/useParentChildren", () => ({
  useParentChildren: () => ({ children: parentChildrenMocks.children }),
}));

const branchMocks = vi.hoisted(() => ({
  activeBranchId: null as string | null,
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ activeBranchId: branchMocks.activeBranchId }),
}));

const firestoreMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/lib/firebase", () => ({
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

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getAllByEmail: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

import { StudentProvider, useStudents } from "./StudentContext";

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <StudentProvider>{children}</StudentProvider>;
  };
}

const sampleStudents = [
  { id: "s1", name: "Alice", uid: "someone-else", attendance: 50, feeStatus: "Paid" },
  { id: "s2", name: "Bob", uid: "someone-else", attendance: 50, feeStatus: "Paid" },
];

describe("StudentContext / useStudents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1", email: "admin@school.test" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    parentChildrenMocks.children = [];
    branchMocks.activeBranchId = null;
    firestoreMocks.isFirestoreWorking = false;

    smartDbMocks.create.mockResolvedValue({ id: "new-id" });
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    smartDbMocks.getAllByEmail.mockResolvedValue([]);
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return sampleStudents;
      if (entity === "attendance") return [];
      if (entity === "Invoice") return [];
      return [];
    });
    // Default watch: deliver the roster asynchronously (like the real polling/
    // onSnapshot implementation, which never resolves synchronously within the
    // same tick as the initial render) and return an unsubscribe fn.
    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") queueMicrotask(() => cb(sampleStudents));
      return vi.fn();
    });
  });

  it("throws when useStudents is used outside a StudentProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useStudents())).toThrow(
      "useStudents must be used within a StudentProvider"
    );
    spy.mockRestore();
  });

  it("starts loading and then loads the full roster via smartDb.watch for a non-student role", async () => {
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toHaveLength(2);
    expect(result.current.totalStudents).toBe(2);
    expect(smartDbMocks.watch).toHaveBeenCalledWith("Student", undefined, expect.any(Function));
    expect(smartDbMocks.getAllByEmail).not.toHaveBeenCalled();

    // Institutional roster: records owned by another staff account still show up.
    expect(result.current.students[0].uid).toBe("someone-else");
  });

  it("uses getAllByEmail (one-shot) instead of watch for the student self-view role", async () => {
    authMocks.role = "student";
    authMocks.user = { uid: "stu-uid-1", email: "alice@school.test" };
    smartDbMocks.getAllByEmail.mockResolvedValue([sampleStudents[0]]);

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(smartDbMocks.getAllByEmail).toHaveBeenCalledWith("Student", "alice@school.test");
    expect(smartDbMocks.watch).not.toHaveBeenCalled();
    expect(result.current.students).toEqual([sampleStudents[0]]);
  });

  it("resets to an empty roster and clears loading when there is no user", async () => {
    authMocks.user = null;

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toEqual([]);
    expect(result.current.totalStudents).toBe(0);
    expect(smartDbMocks.watch).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("deduplicates roster records by id, then by normalized name (keeping first occurrence)", async () => {
    const dupById = { id: "s1", name: "Alice Duplicate", uid: "x" }; // same id as s1
    const dupByName = { id: "s3", name: "  alice  ", uid: "x" }; // same normalized name as s1
    const unique = { id: "s4", name: "Charlie", uid: "x" };

    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") cb([sampleStudents[0], dupById, dupByName, unique]);
      return vi.fn();
    });

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.students.map((s) => s.id);
    expect(ids).toEqual(["s1", "s4"]);
    // First occurrence of "s1" wins (original name, not the id-duplicate's name).
    expect(result.current.students.find((s) => s.id === "s1")?.name).toBe("Alice");
  });

  it("filters the roster to the active branch, keeping untagged (no-branchId) records visible", async () => {
    branchMocks.activeBranchId = "branch-A";
    const taggedA = { id: "s10", name: "TaggedA", uid: "x", branchId: "branch-A" };
    const taggedB = { id: "s11", name: "TaggedB", uid: "x", branchId: "branch-B" };
    const untagged = { id: "s12", name: "Untagged", uid: "x" };

    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") cb([taggedA, taggedB, untagged]);
      return vi.fn();
    });

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.students.map((s) => s.id).sort();
    expect(ids).toEqual(["s10", "s12"]);
  });

  it("derives attendance percentage from real attendance records (Present=1, Late=0.5, Absent=0)", async () => {
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return sampleStudents;
      if (entity === "attendance") {
        return [
          { entityType: "student", entityId: "s1", status: "Present" },
          { entityType: "student", entityId: "s1", status: "Late" },
          { entityType: "student", entityId: "s1", status: "Absent" },
          { entityType: "student", entityId: "s1", status: "Present" },
          { entityType: "other", entityId: "s1", status: "Present" }, // wrong entityType, ignored
        ];
      }
      if (entity === "Invoice") return [];
      return [];
    });

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // score = 1 + 0.5 + 0 + 1 = 2.5 over 4 records => 62.5% rounded to 63
    await waitFor(() => {
      const alice = result.current.students.find((s) => s.id === "s1");
      expect(alice?.attendance).toBe(63);
    });

    // Bob has no attendance records — value untouched from raw seed (50).
    const bob = result.current.students.find((s) => s.id === "s2");
    expect(bob?.attendance).toBe(50);
  });

  it("derives fee status from invoices, prioritizing Overdue > Pending > Paid", async () => {
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return sampleStudents;
      if (entity === "attendance") return [];
      if (entity === "Invoice") {
        return [
          { studentId: "s1", status: "Unpaid" },
          { studentId: "s1", status: "Overdue" }, // overdue wins over pending
        ];
      }
      return [];
    });

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });

    await waitFor(() => {
      const alice = result.current.students.find((s) => s.id === "s1");
      expect(alice?.feeStatus).toBe("Overdue");
    });

    // Bob has no invoices — his raw seed value is untouched.
    const bob = result.current.students.find((s) => s.id === "s2");
    expect(bob?.feeStatus).toBe("Paid");
  });

  // KNOWN BUG: fetchSideData reads the student's own id off `rawStudentsRef.current[0]`,
  // but the effect that invokes it only depends on [user, fetchSideData] — not on
  // rawStudents changing. For the student self-view role, rawStudents is populated
  // asynchronously via getAllByEmail, so on mount fetchSideData fires BEFORE that
  // resolves and the ref is still empty. The result: a student's own attendance/fee
  // side-data query goes out with `studentId: undefined` (i.e. unscoped/no params)
  // instead of their own id, and it is never automatically retried once the student
  // record loads — only a later "focus" or "attendance-updated"/"fees-updated" event
  // re-triggers fetchSideData (see the next test), by which point the ref has caught up.
  it("student self-view: initial side-data fetch fires before the student id resolves, so it goes out unscoped", async () => {
    authMocks.role = "student";
    authMocks.user = { uid: "stu-uid-1", email: "alice@school.test" };
    smartDbMocks.getAllByEmail.mockResolvedValue([sampleStudents[0]]);

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => {
      expect(smartDbMocks.getAll).toHaveBeenCalledWith("attendance", undefined, undefined);
    });
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Invoice", undefined, undefined);
  });

  it("student self-view: a later focus event re-runs fetchSideData and now scopes correctly to the student's id", async () => {
    authMocks.role = "student";
    authMocks.user = { uid: "stu-uid-1", email: "alice@school.test" };
    smartDbMocks.getAllByEmail.mockResolvedValue([sampleStudents[0]]);

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Let the initial (unscoped) side-data fetch settle first.
    await waitFor(() => {
      expect(smartDbMocks.getAll).toHaveBeenCalledWith("attendance", undefined, undefined);
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(smartDbMocks.getAll).toHaveBeenCalledWith(
        "attendance",
        undefined,
        { entityId: "s1", entityType: "student" }
      );
    });
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Invoice", undefined, { studentId: "s1" });
  });

  it("fetches side data scoped to all children for the parent role", async () => {
    authMocks.role = "parent";
    parentChildrenMocks.children = [{ id: "c1" }, { id: "c2" }];

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => {
      expect(smartDbMocks.getAll).toHaveBeenCalledWith(
        "attendance",
        undefined,
        { entityId: "c1,c2", entityType: "student" }
      );
    });
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Invoice", undefined, { studentId: "c1,c2" });
  });

  it("refetches side data when an 'attendance-updated' event is dispatched", async () => {
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = smartDbMocks.getAll.mock.calls.filter((c) => c[0] === "attendance").length;

    await act(async () => {
      window.dispatchEvent(new Event("attendance-updated"));
    });

    await waitFor(() => {
      const callsAfter = smartDbMocks.getAll.mock.calls.filter((c) => c[0] === "attendance").length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it("addStudents stamps uid, createdAt, and the active branchId, then persists via smartDb.create", async () => {
    branchMocks.activeBranchId = "branch-Z";
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStudents([{ name: "New Student" } as never]);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Student",
      expect.objectContaining({
        name: "New Student",
        uid: "admin-1",
        branchId: "branch-Z",
        createdAt: expect.any(String),
      }),
      undefined
    );
  });

  it("addStudents does not override an explicitly provided branchId", async () => {
    branchMocks.activeBranchId = "branch-Z";
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStudents([{ name: "New Student", branchId: "branch-Explicit" } as never]);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Student",
      expect.objectContaining({ branchId: "branch-Explicit" }),
      undefined
    );
  });

  it("addStudents is a no-op when there is no user", async () => {
    authMocks.user = null;
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStudents([{ name: "Ghost" } as never]);
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("updateStudent persists the partial update with an updatedAt timestamp", async () => {
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStudent("s1", { name: "Alice Renamed" });
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Student",
      "s1",
      expect.objectContaining({ name: "Alice Renamed", updatedAt: expect.any(String) })
    );
  });

  it("deleteStudent calls smartDb.delete with the given id", async () => {
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteStudent("s1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Student", "s1");
  });

  it("routes create errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("write failed");
    smartDbMocks.create.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStudents([{ name: "Boom" } as never]);
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "Student");
  });

  it("recovers from a fetch rejection by clearing the loading flag (and logs the error) in student self-view", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.role = "student";
    authMocks.user = { uid: "stu-uid-1", email: "alice@school.test" };
    smartDbMocks.getAllByEmail.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching students:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
