import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "teacher-1" } as { uid: string } | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

const firebaseMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  auth: { __fakeAuth: true },
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
const queryMock = vi.fn((col: unknown) => col);
const orderByMock = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  Timestamp: {},
  FieldValue: {},
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

import { LiveClassProvider, useLiveClasses } from "./LiveClassContext";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { liveClasses, loading, addLiveClass, updateLiveClass, deleteLiveClass } = useLiveClasses();
  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "loaded"}</div>
      <div data-testid="count">{liveClasses.length}</div>
      <ul>
        {liveClasses.map(c => (
          <li key={c.id} data-testid="liveclass">{c.id}:{c.title ?? ""}</li>
        ))}
      </ul>
      <button onClick={() => addLiveClass({ title: "New Class" } as never)}>add</button>
      <button onClick={() => updateLiveClass("1", { title: "Updated" })}>update</button>
      <button onClick={() => deleteLiveClass("1")}>delete</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <LiveClassProvider>
      <Consumer />
    </LiveClassProvider>
  );
}

describe("LiveClassContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "teacher-1" };
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useLiveClasses is used outside of LiveClassProvider", () => {
    function Bare() {
      useLiveClasses();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useLiveClasses must be used within a LiveClassProvider");
    spy.mockRestore();
  });

  it("starts in loading state and then loads live classes via smartDb when firestore is not working", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "c1", title: "Math Live", uid: "teacher-1" },
      { id: "c2", title: "Science Live", uid: "teacher-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("LiveClass", undefined);
  });

  // Live classes are broadcast to every enrolled student, so fetchLiveClasses
  // must NOT scope by the viewer's own uid — classes scheduled by other
  // teachers must still show up for everyone.
  it("does not filter live classes down to only the current user's uid (broadcast to all enrolled)", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "c1", title: "Math Live", uid: "teacher-1" },
      { id: "c2", title: "Other Teacher Live", uid: "teacher-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    const items = screen.getAllByTestId("liveclass").map(li => li.textContent);
    expect(items).toContain("c2:Other Teacher Live");
  });

  it("uses the firestore onSnapshot path when isFirestoreWorking is true and uid is not demo-prefixed", async () => {
    firebaseMocks.isFirestoreWorking = true;

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
          { id: "b1", data: () => ({ title: "Live Broadcast" }) },
        ],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("loading").textContent).toBe("loaded");
    expect(screen.getAllByTestId("liveclass")[0].textContent).toBe("b1:Live Broadcast");
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "fallback1", title: "Fallback Live", uid: "teacher-1" }]);

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
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("LiveClass", undefined);
  });

  it("uses the local smartDb path (not onSnapshot) for demo- prefixed uids even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-teacher" };
    smartDbMocks.getAll.mockResolvedValue([{ id: "demo1", title: "Demo Live", uid: "demo-teacher" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("resets live classes to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps count at zero and logs the error when smartDb.getAll rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching live classes:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("addLiveClass calls smartDb.create with a generated jitsiRoom, the user's uid and a createdAt timestamp", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "new1", title: "New Class", uid: "teacher-1" }]);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "LiveClass",
      expect.objectContaining({
        title: "New Class",
        uid: "teacher-1",
        createdAt: expect.any(String),
        jitsiRoom: expect.stringMatching(/^StudentDiwan-New-Class-[a-z0-9]+$/),
      })
    );

    // Since isFirestoreWorking is false, addLiveClass re-fetches via smartDb.getAll.
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("addLiveClass is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addLiveClass reports the create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "LiveClass");
  });

  it("updateLiveClass calls smartDb.update with the merged fields and an updatedAt timestamp, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "1", title: "Updated", uid: "teacher-1" }]);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "LiveClass",
      "1",
      expect.objectContaining({ title: "Updated", updatedAt: expect.any(String) })
    );
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("updateLiveClass reports the update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "LiveClass/1");
  });

  it("deleteLiveClass calls smartDb.delete with the given id and re-fetches when firestore is not working", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([]);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("LiveClass", "1");
  });

  it("deleteLiveClass reports the delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "LiveClass/1");
  });

  it("does not re-fetch via smartDb after create/update/delete when isFirestoreWorking is true", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-teacher" }; // forces smartDb path for the initial load only
    smartDbMocks.getAll.mockResolvedValue([{ id: "1", title: "Initial", uid: "demo-teacher" }]);

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
