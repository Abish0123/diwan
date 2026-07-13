import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "teacher-1" } as { uid: string } | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, isMockSession: authMocks.isMockSession }),
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

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
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

import { AssignmentProvider, useAssignments } from "./AssignmentContext";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { assignments, loading, addAssignment, updateAssignment, deleteAssignment } = useAssignments();
  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "loaded"}</div>
      <div data-testid="count">{assignments.length}</div>
      <ul>
        {assignments.map(a => (
          <li key={a.id} data-testid="assignment">{a.id}:{a.title ?? ""}</li>
        ))}
      </ul>
      <button onClick={() => addAssignment({ title: "New HW" } as never)}>add</button>
      <button onClick={() => updateAssignment("1", { title: "Updated" })}>update</button>
      <button onClick={() => deleteAssignment("1")}>delete</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AssignmentProvider>
      <Consumer />
    </AssignmentProvider>
  );
}

describe("AssignmentContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "teacher-1" };
    authMocks.isMockSession = false;
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useAssignments is used outside of AssignmentProvider", () => {
    function Bare() {
      useAssignments();
      return null;
    }
    // Suppress React's console.error noise for the expected error boundary throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useAssignments must be used within an AssignmentProvider");
    spy.mockRestore();
  });

  it("starts in loading state and then loads assignments via smartDb when firestore is not working", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "a1", title: "Math HW", uid: "teacher-1" },
      { id: "a2", title: "Science HW", uid: "teacher-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Assignment", undefined);
  });

  // Class-level assignments are shared across every student/co-teacher in the
  // class, so fetchAssignments must NOT scope by the viewer's own uid — it
  // should surface assignments created by other teachers too.
  it("does not filter assignments down to only the current user's uid (class-wide visibility)", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "a1", title: "Math HW", uid: "teacher-1" },
      { id: "a2", title: "Other Teacher HW", uid: "teacher-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    const items = screen.getAllByTestId("assignment").map(li => li.textContent);
    expect(items).toContain("a2:Other Teacher HW");
  });

  it("uses the firestore onSnapshot path when isFirestoreWorking is true and not a mock session", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;

    let capturedCallback: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_col: unknown, onNext: (s: unknown) => void) => {
      capturedCallback = onNext;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();

    act(() => {
      capturedCallback?.({
        docs: [
          { id: "b1", data: () => ({ title: "Live Assignment" }) },
        ],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("loading").textContent).toBe("loaded");
    expect(screen.getAllByTestId("assignment")[0].textContent).toBe("b1:Live Assignment");
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "fallback1", title: "Fallback HW", uid: "teacher-1" }]);

    let capturedErrorCallback: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_col: unknown, _onNext: unknown, onError: (e: unknown) => void) => {
      capturedErrorCallback = onError;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      capturedErrorCallback?.(new Error("permission-denied"));
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Assignment", undefined);
  });

  it("uses the local smartDb path (not onSnapshot) when isMockSession is true, even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "mock1", title: "Mock Session HW", uid: "teacher-1" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("uses the local smartDb path for demo- prefixed uids even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-teacher" };
    smartDbMocks.getAll.mockResolvedValue([{ id: "demo1", title: "Demo HW", uid: "demo-teacher" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("resets assignments to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps loading true and swallows the error when smartDb.getAll rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching assignments:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("addAssignment calls smartDb.create with submissionsCount 0, the user's uid and a createdAt timestamp", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "new1", title: "New HW", uid: "teacher-1" }]);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Assignment",
      expect.objectContaining({
        title: "New HW",
        submissionsCount: 0,
        uid: "teacher-1",
        createdAt: expect.any(String),
      })
    );

    // Since isFirestoreWorking is false, addAssignment re-fetches via smartDb.getAll.
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("addAssignment is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addAssignment reports the create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "Assignment");
  });

  it("updateAssignment calls smartDb.update with the merged fields and an updatedAt timestamp, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "1", title: "Updated", uid: "teacher-1" }]);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Assignment",
      "1",
      expect.objectContaining({ title: "Updated", updatedAt: expect.any(String) })
    );
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("updateAssignment reports the update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "Assignment");
  });

  it("deleteAssignment calls smartDb.delete with the given id and re-fetches when firestore is not working", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([]);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Assignment", "1");
  });

  it("deleteAssignment reports the delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "Assignment");
  });

  it("does not re-fetch via smartDb after create/update/delete when isFirestoreWorking is true", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true; // forces the smartDb path for the initial load only
    smartDbMocks.getAll.mockResolvedValue([{ id: "1", title: "Initial", uid: "teacher-1" }]);

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
