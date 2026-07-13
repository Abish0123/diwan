import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "student-1" } as { uid: string } | null,
  role: "student" as string,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role, isMockSession: authMocks.isMockSession }),
}));

const firebaseMocks = vi.hoisted(() => ({
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
    return firebaseMocks.isFirestoreWorking;
  },
}));

const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));
const queryMock = vi.fn((col: unknown, ..._clauses: unknown[]) => col);
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  query: (...args: unknown[]) => queryMock(...(args as [unknown])),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
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

import { SubmissionProvider, useSubmissions } from "./SubmissionContext";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { submissions, loading, addSubmission, updateSubmission, deleteSubmission } = useSubmissions();
  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "loaded"}</div>
      <div data-testid="count">{submissions.length}</div>
      <ul>
        {submissions.map(s => (
          <li key={s.id} data-testid="submission">{s.id}:{s.status}</li>
        ))}
      </ul>
      <button onClick={() => addSubmission({ assignmentId: "a1", studentId: "student-1", status: "Submitted" } as never)}>add</button>
      <button onClick={() => updateSubmission("1", { status: "Late" })}>update</button>
      <button onClick={() => deleteSubmission("1")}>delete</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <SubmissionProvider>
      <Consumer />
    </SubmissionProvider>
  );
}

describe("SubmissionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "student-1" };
    authMocks.role = "student";
    authMocks.isMockSession = false;
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useSubmissions is used outside of SubmissionProvider", () => {
    function Bare() {
      useSubmissions();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useSubmissions must be used within a SubmissionProvider");
    spy.mockRestore();
  });

  it("starts in loading state and then loads submissions via smartDb when firestore is not working", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "s1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" },
      { id: "s2", assignmentId: "a1", studentId: "student-1", status: "Late", uid: "student-1" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    // student role scopes by the viewer's own uid
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Submission", "student-1");
  });

  it("scopes to the student's own uid when role is student (self-scoping)", async () => {
    authMocks.role = "student";
    authMocks.user = { uid: "student-42" };

    renderWithProvider();

    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Submission", "student-42");
  });

  it("does not scope by uid for staff/admin roles (sees every student's submissions)", async () => {
    authMocks.role = "admin";
    smartDbMocks.getAll.mockResolvedValue([
      { id: "s1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" },
      { id: "s2", assignmentId: "a1", studentId: "student-2", status: "Submitted", uid: "student-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Submission", undefined);
  });

  it("uses the firestore onSnapshot path scoped by uid query for a student when isFirestoreWorking is true", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.role = "student";
    authMocks.user = { uid: "student-9" };

    let capturedCallback: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      capturedCallback = onNext;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalledWith("uid", "==", "student-9");

    act(() => {
      capturedCallback?.({
        docs: [
          { id: "b1", data: () => ({ status: "Submitted" }) },
        ],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("loading").textContent).toBe("loaded");
    expect(screen.getAllByTestId("submission")[0].textContent).toBe("b1:Submitted");
  });

  it("uses an unfiltered firestore query (no where clause) for admin/staff roles", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.role = "admin";

    onSnapshotMock.mockImplementation(() => () => {});

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    expect(whereMock).not.toHaveBeenCalled();
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "fallback1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" }]);

    let capturedErrorCallback: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_q: unknown, _onNext: unknown, onError: (e: unknown) => void) => {
      capturedErrorCallback = onError;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      capturedErrorCallback?.(new Error("permission-denied"));
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Submission", "student-1");
  });

  it("uses the local smartDb path (not onSnapshot) when isMockSession is true, even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "mock1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("uses the local smartDb path for demo- prefixed uids even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-student" };
    smartDbMocks.getAll.mockResolvedValue([{ id: "demo1", assignmentId: "a1", studentId: "demo-student", status: "Submitted", uid: "demo-student" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("resets submissions to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps loading resolved and swallows the error when smartDb.getAll rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching submissions:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("addSubmission calls smartDb.create with the user's uid and a createdAt timestamp, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "new1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" }]);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Submission",
      expect.objectContaining({
        assignmentId: "a1",
        studentId: "student-1",
        status: "Submitted",
        uid: "student-1",
        createdAt: expect.any(String),
      })
    );

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("addSubmission is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addSubmission reports the create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "Submission");
  });

  it("updateSubmission calls smartDb.update with the given fields and re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "1", assignmentId: "a1", studentId: "student-1", status: "Late", uid: "student-1" }]);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith("Submission", "1", { status: "Late" });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("updateSubmission is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).not.toHaveBeenCalled();
  });

  it("updateSubmission reports the update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "Submission");
  });

  it("deleteSubmission calls smartDb.delete with the given id and re-fetches when firestore is not working", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([]);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Submission", "1");
  });

  it("deleteSubmission is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).not.toHaveBeenCalled();
  });

  it("deleteSubmission reports the delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "Submission");
  });

  it("does not re-fetch via smartDb after create/update/delete when isFirestoreWorking is true", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true; // forces the smartDb path for the initial load only
    smartDbMocks.getAll.mockResolvedValue([{ id: "1", assignmentId: "a1", studentId: "student-1", status: "Submitted", uid: "student-1" }]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockClear();

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });
});
