import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", displayName: "Admin One" } as { uid: string; displayName?: string } | null,
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
    LIST: "list",
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
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
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

import { NoticeProvider, useNotices } from "./NoticeContext";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { notices, loading, addNotice, updateNotice, deleteNotice } = useNotices();
  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "loaded"}</div>
      <div data-testid="count">{notices.length}</div>
      <ul>
        {notices.map(n => (
          <li key={n.id} data-testid="notice">{n.id}:{n.title ?? ""}:{n.uid}</li>
        ))}
      </ul>
      <button onClick={() => addNotice({
        title: "New Notice",
        content: "Body",
        category: "General",
        priority: "Low",
        status: "Published",
        targetAudience: "All",
      } as never)}>add</button>
      <button onClick={() => updateNotice("1", { title: "Updated" })}>update</button>
      <button onClick={() => deleteNotice("1")}>delete</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <NoticeProvider>
      <Consumer />
    </NoticeProvider>
  );
}

describe("NoticeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1", displayName: "Admin One" };
    authMocks.isMockSession = false;
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useNotices is used outside of NoticeProvider", () => {
    function Bare() {
      useNotices();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useNotices must be used within a NoticeProvider");
    spy.mockRestore();
  });

  it("starts in loading state and then loads notices via smartDb when firestore is not working", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "n1", title: "Holiday", uid: "admin-1" },
      { id: "n2", title: "Exam Schedule", uid: "admin-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Notice", undefined);
  });

  // notice.uid records who posted the notice, not who it targets. Fetch must
  // not scope by the viewer's own uid, otherwise a viewer would only ever see
  // notices they personally posted (and non-admin viewers would see nothing).
  it("does not filter notices down to only the current user's uid (surfaces notices posted by other admins)", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "n1", title: "From Me", uid: "admin-1" },
      { id: "n2", title: "From Other Admin", uid: "admin-2" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    const items = screen.getAllByTestId("notice").map(li => li.textContent);
    expect(items).toContain("n2:From Other Admin:admin-2");
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
          { id: "live1", data: () => ({ title: "Live Notice", uid: "admin-1" }) },
        ],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("loading").textContent).toBe("loaded");
    expect(screen.getAllByTestId("notice")[0].textContent).toBe("live1:Live Notice:admin-1");
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "fallback1", title: "Fallback Notice", uid: "admin-1" }]);

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
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Notice", undefined);
  });

  it("uses the local smartDb path (not onSnapshot) when isMockSession is true, even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "mock1", title: "Mock Session Notice", uid: "admin-1" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("resets notices to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps notices empty and stops loading when smartDb.getAll rejects, logging the error", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching notices:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("addNotice calls smartDb.create with postedBy from displayName, views 0, the user's uid and a date/createdAt", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "new1", title: "New Notice", uid: "admin-1" }]);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Notice",
      expect.objectContaining({
        title: "New Notice",
        postedBy: "Admin One",
        views: 0,
        uid: "admin-1",
        date: expect.any(String),
        createdAt: expect.any(String),
      })
    );

    // Since isFirestoreWorking is false, addNotice re-fetches via smartDb.getAll.
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("addNotice falls back to postedBy 'Admin' when the user has no displayName", async () => {
    authMocks.user = { uid: "admin-1" };
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Notice",
      expect.objectContaining({ postedBy: "Admin" })
    );
  });

  it("addNotice is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addNotice reports the create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "notices");
  });

  it("updateNotice calls smartDb.update with the merged fields and an updatedAt timestamp, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([{ id: "1", title: "Updated", uid: "admin-1" }]);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Notice",
      "1",
      expect.objectContaining({ title: "Updated", updatedAt: expect.any(String) })
    );
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("updateNotice reports the update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "notices");
  });

  it("deleteNotice calls smartDb.delete with the given id and re-fetches when firestore is not working", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    smartDbMocks.getAll.mockResolvedValue([]);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Notice", "1");
  });

  it("deleteNotice reports the delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "notices");
  });

  it("does not re-fetch via smartDb after update/delete when isFirestoreWorking is true and not a mock session", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    onSnapshotMock.mockImplementation(() => () => {});

    renderWithProvider();
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    smartDbMocks.getAll.mockClear();

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });
});
