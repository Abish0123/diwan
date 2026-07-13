import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";

// useSubmissions.ts itself is a thin `useContext(SubmissionContext)` wrapper
// (throws outside a provider, otherwise returns the context value). The real
// business logic — role-based scoping, firestore/local-db branching, CRUD —
// lives in SubmissionProvider (src/contexts/SubmissionContext.tsx). To test
// useSubmissions' actual behavior (including the scoping it exposes to
// consumers) we render it through the real SubmissionProvider and mock only
// the genuine external boundaries: firebase/firestore, @/firebase and
// @/lib/localDb, plus @/hooks/useAuth (a different hook/context than the one
// under test).

const firestoreState = vi.hoisted(() => ({
  isFirestoreWorking: true,
}));

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

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firestoreState.isFirestoreWorking;
  },
}));

const smartDbGetAllMock = vi.fn();
const smartDbCreateMock = vi.fn();
const smartDbUpdateMock = vi.fn();
const smartDbDeleteMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => smartDbGetAllMock(...args),
    create: (...args: unknown[]) => smartDbCreateMock(...args),
    update: (...args: unknown[]) => smartDbUpdateMock(...args),
    delete: (...args: unknown[]) => smartDbDeleteMock(...args),
  },
}));

const useAuthMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { SubmissionProvider } from "@/contexts/SubmissionContext";
import { useSubmissions } from "./useSubmissions";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SubmissionProvider, null, children);
}

describe("useSubmissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreState.isFirestoreWorking = true;
    smartDbGetAllMock.mockResolvedValue([]);
    smartDbCreateMock.mockResolvedValue(undefined);
    smartDbUpdateMock.mockResolvedValue(undefined);
    smartDbDeleteMock.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({ docs: [] });
      return () => {};
    });
  });

  // ── Guard clause ─────────────────────────────────────────────────────────
  it("throws when used outside of a SubmissionProvider", () => {
    // Suppress the expected console.error from React about the thrown error.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSubmissions())).toThrow(
      "useSubmissions must be used within a SubmissionProvider"
    );
    spy.mockRestore();
  });

  // ── No user ──────────────────────────────────────────────────────────────
  it("returns empty submissions and stops loading when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, role: "student", isMockSession: false });

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.submissions).toEqual([]);
    expect(smartDbGetAllMock).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  // ── Role-based scoping (student vs staff) via local/mock path ───────────
  it("scopes to the student's own uid when role is 'student'", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "student-1" },
      role: "student",
      isMockSession: true,
    });
    smartDbGetAllMock.mockResolvedValue([
      { id: "s1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" },
    ]);

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", "student-1");
    expect(result.current.submissions).toEqual([
      { id: "s1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" },
    ]);
  });

  it("does not scope by uid for non-student roles (e.g. staff grading all submissions)", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "teacher-1" },
      role: "staff",
      isMockSession: true,
    });
    smartDbGetAllMock.mockResolvedValue([
      { id: "s1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" },
      { id: "s2", assignmentId: "a1", studentId: "student-2", status: "Pending", uid: "student-2" },
    ]);

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", undefined);
    expect(result.current.submissions).toHaveLength(2);
  });

  // ── mock/local-db path selection ────────────────────────────────────────
  it("uses smartDb (local) path for demo- prefixed uids even when firestore is working", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "demo-student" },
      role: "student",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = true;
    smartDbGetAllMock.mockResolvedValue([
      { id: "d1", assignmentId: "a1", studentId: "demo-student", status: "Late", uid: "demo-student" },
    ]);

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", "demo-student");
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses smartDb (local) path when isFirestoreWorking is false", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "student-2" },
      role: "student",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = false;
    smartDbGetAllMock.mockResolvedValue([]);

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", "student-2");
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  // ── Real firestore path ──────────────────────────────────────────────────
  it("subscribes via onSnapshot scoped to the student's uid for a real authenticated student", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "real-student" },
      role: "student",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = true;

    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({
        docs: [
          {
            id: "doc1",
            data: () => ({ assignmentId: "a1", studentId: "real-student", status: "Submitted", uid: "real-student" }),
          },
        ],
      });
      return () => {};
    });

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(whereMock).toHaveBeenCalledWith("uid", "==", "real-student");
    expect(result.current.submissions).toEqual([
      { id: "doc1", assignmentId: "a1", studentId: "real-student", status: "Submitted", uid: "real-student" },
    ]);
    expect(smartDbGetAllMock).not.toHaveBeenCalled();
  });

  it("subscribes via onSnapshot to the unfiltered query for a real authenticated staff user", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "real-staff" },
      role: "staff",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = true;

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(whereMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledWith({ __col: "Submission" });
  });

  it("falls back to smartDb fetch when the onSnapshot listener errors", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "real-student-2" },
      role: "student",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = true;
    smartDbGetAllMock.mockResolvedValue([
      { id: "fallback1", assignmentId: "a2", studentId: "real-student-2", status: "Pending", uid: "real-student-2" },
    ]);

    onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
      onError(new Error("permission-denied"));
      return () => {};
    });

    const { result } = renderHook(() => useSubmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", "real-student-2");
    expect(result.current.submissions).toEqual([
      { id: "fallback1", assignmentId: "a2", studentId: "real-student-2", status: "Pending", uid: "real-student-2" },
    ]);
  });

  it("unsubscribes the firestore listener on unmount", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "real-student-3" },
      role: "student",
      isMockSession: false,
    });
    firestoreState.isFirestoreWorking = true;

    const unsubscribeMock = vi.fn();
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({ docs: [] });
      return unsubscribeMock;
    });

    const { result, unmount } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  // ── addSubmission ────────────────────────────────────────────────────────
  it("addSubmission is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, role: "student", isMockSession: false });
    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addSubmission({
        assignmentId: "a1",
        studentId: "student-1",
        status: "Submitted",
      });
    });

    expect(smartDbCreateMock).not.toHaveBeenCalled();
  });

  it("addSubmission writes to smartDb with the current user's uid and a createdAt timestamp", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "student-3" },
      role: "student",
      isMockSession: true,
    });

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addSubmission({
        assignmentId: "a1",
        studentId: "student-3",
        status: "Submitted",
      });
    });

    expect(smartDbCreateMock).toHaveBeenCalledTimes(1);
    const [entity, payload] = smartDbCreateMock.mock.calls[0];
    expect(entity).toBe("Submission");
    expect(payload).toMatchObject({
      assignmentId: "a1",
      studentId: "student-3",
      status: "Submitted",
      uid: "student-3",
    });
    expect(typeof payload.createdAt).toBe("string");
  });

  it("addSubmission reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "student-4" },
      role: "student",
      isMockSession: true,
    });
    const boom = new Error("create failed");
    smartDbCreateMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.addSubmission({
          assignmentId: "a1",
          studentId: "student-4",
          status: "Pending",
        })
      ).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "Submission");
  });

  // ── updateSubmission ─────────────────────────────────────────────────────
  it("updateSubmission is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, role: "student", isMockSession: false });
    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSubmission("sub-1", { status: "Late" });
    });

    expect(smartDbUpdateMock).not.toHaveBeenCalled();
  });

  it("updateSubmission passes the id and partial data through to smartDb", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "teacher-2" },
      role: "staff",
      isMockSession: true,
    });

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSubmission("sub-2", { status: "Late" });
    });

    expect(smartDbUpdateMock).toHaveBeenCalledWith("Submission", "sub-2", { status: "Late" });
  });

  it("updateSubmission reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "teacher-3" },
      role: "staff",
      isMockSession: true,
    });
    const boom = new Error("update failed");
    smartDbUpdateMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.updateSubmission("sub-3", { status: "Submitted" })
      ).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "update", "Submission");
  });

  // ── deleteSubmission ─────────────────────────────────────────────────────
  it("deleteSubmission is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, role: "student", isMockSession: false });
    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSubmission("sub-4");
    });

    expect(smartDbDeleteMock).not.toHaveBeenCalled();
  });

  it("deleteSubmission removes the doc by id", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "teacher-4" },
      role: "staff",
      isMockSession: true,
    });

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSubmission("sub-5");
    });

    expect(smartDbDeleteMock).toHaveBeenCalledWith("Submission", "sub-5");
  });

  it("deleteSubmission reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "teacher-5" },
      role: "staff",
      isMockSession: true,
    });
    const boom = new Error("delete failed");
    smartDbDeleteMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteSubmission("sub-6")).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "delete", "Submission");
  });

  // ── refetch after mutation when firestore is not the source of truth ────
  it("refetches submissions via smartDb after addSubmission when isFirestoreWorking is false", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "student-5" },
      role: "student",
      isMockSession: true,
    });
    firestoreState.isFirestoreWorking = false;

    const { result } = renderHook(() => useSubmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    smartDbGetAllMock.mockClear();

    await act(async () => {
      await result.current.addSubmission({
        assignmentId: "a1",
        studentId: "student-5",
        status: "Submitted",
      });
    });

    expect(smartDbGetAllMock).toHaveBeenCalledWith("Submission", "student-5");
  });
});
