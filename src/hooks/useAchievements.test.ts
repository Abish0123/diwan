import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const firestoreState = vi.hoisted(() => ({
  isFirestoreWorking: true,
  currentUser: null as { uid: string } | null,
}));

const addDocMock = vi.fn().mockResolvedValue({ id: "new-id" });
const setDocMock = vi.fn().mockResolvedValue(undefined);
const deleteDocMock = vi.fn().mockResolvedValue(undefined);
const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));
const docMock = vi.fn((_db: unknown, path: string, id?: string) => ({ __doc: `${path}/${id}` }));
const queryMock = vi.fn((col: unknown, ...clauses: unknown[]) => ({ __query: col, clauses }));
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string?])),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  query: (...args: unknown[]) => queryMock(...(args as [unknown, ...unknown[]])),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  serverTimestamp: () => "__server_timestamp__",
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  get auth() {
    return { currentUser: firestoreState.currentUser };
  },
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

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => smartDbGetAllMock(...args),
  },
}));

const useAuthMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useAchievements } from "./useAchievements";

describe("useAchievements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreState.isFirestoreWorking = true;
    firestoreState.currentUser = null;
    smartDbGetAllMock.mockResolvedValue([]);
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({ docs: [] });
      return () => {};
    });
  });

  // ── No user ────────────────────────────────────────────────────────────
  it("returns empty achievements and stops loading when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.achievements).toEqual([]);
    expect(smartDbGetAllMock).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  // ── Mock / local-db path ──────────────────────────────────────────────
  it("uses smartDb (local) path when auth.currentUser is null, even if isFirestoreWorking", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-1" } });
    firestoreState.currentUser = null; // no real firebase auth user -> isMock true
    firestoreState.isFirestoreWorking = true;
    smartDbGetAllMock.mockResolvedValue([
      { id: "a1", uid: "user-1", title: "Science Fair Winner" },
    ]);

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Achievement", "user-1");
    expect(result.current.achievements).toEqual([
      { id: "a1", uid: "user-1", title: "Science Fair Winner" },
    ]);
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses smartDb (local) path for demo- prefixed uids even with a real firebase auth user", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "demo-student" } });
    firestoreState.currentUser = { uid: "demo-student" };
    firestoreState.isFirestoreWorking = true;
    smartDbGetAllMock.mockResolvedValue([{ id: "d1", uid: "demo-student", title: "Demo Badge" }]);

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Achievement", "demo-student");
    expect(result.current.achievements).toEqual([{ id: "d1", uid: "demo-student", title: "Demo Badge" }]);
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses smartDb (local) path when isFirestoreWorking is false", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-2" } });
    firestoreState.currentUser = { uid: "user-2" };
    firestoreState.isFirestoreWorking = false;
    smartDbGetAllMock.mockResolvedValue([{ id: "a2", uid: "user-2", title: "Chess Champion" }]);

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("Achievement", "user-2");
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  // ── Real firestore path ────────────────────────────────────────────────
  it("subscribes via onSnapshot for a real (non-demo) authenticated user when firestore is working", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "real-user" } });
    firestoreState.currentUser = { uid: "real-user" };
    firestoreState.isFirestoreWorking = true;

    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({
        docs: [
          { id: "doc1", data: () => ({ title: "Math Olympiad", uid: "real-user" }) },
        ],
      });
      return () => {};
    });

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(whereMock).toHaveBeenCalledWith("uid", "==", "real-user");
    expect(result.current.achievements).toEqual([
      { id: "doc1", title: "Math Olympiad", uid: "real-user" },
    ]);
    expect(smartDbGetAllMock).not.toHaveBeenCalled();
  });

  it("handles onSnapshot errors by calling handleFirestoreError and clearing loading", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "real-user-2" } });
    firestoreState.currentUser = { uid: "real-user-2" };
    firestoreState.isFirestoreWorking = true;

    const boom = new Error("permission-denied");
    onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
      onError(boom);
      return () => {};
    });

    const { result } = renderHook(() => useAchievements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "list", "achievements");
  });

  it("unsubscribes the firestore listener on unmount", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "real-user-3" } });
    firestoreState.currentUser = { uid: "real-user-3" };
    firestoreState.isFirestoreWorking = true;

    const unsubscribeMock = vi.fn();
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext({ docs: [] });
      return unsubscribeMock;
    });

    const { result, unmount } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  // ── addAchievement ─────────────────────────────────────────────────────
  it("addAchievement is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addAchievement({ title: "X" } as never);
    });

    expect(addDocMock).not.toHaveBeenCalled();
  });

  it("addAchievement writes to firestore with uid and a server timestamp", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-3" } });
    firestoreState.currentUser = { uid: "user-3" };
    firestoreState.isFirestoreWorking = true;

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addAchievement({ title: "New Trophy" } as never);
    });

    expect(addDocMock).toHaveBeenCalledWith(
      { __col: "achievements" },
      { title: "New Trophy", uid: "user-3", createdAt: "__server_timestamp__" }
    );
  });

  it("addAchievement reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-4" } });
    firestoreState.currentUser = { uid: "user-4" };
    firestoreState.isFirestoreWorking = true;
    const boom = new Error("write failed");
    addDocMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.addAchievement({ title: "X" } as never)).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "achievements");
  });

  // ── updateAchievement ────────────────────────────────────────────────
  it("updateAchievement is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateAchievement("id1", { title: "Y" });
    });

    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("updateAchievement merges partial data into the existing doc", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-5" } });
    firestoreState.currentUser = { uid: "user-5" };
    firestoreState.isFirestoreWorking = true;

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateAchievement("ach-1", { title: "Updated" });
    });

    expect(setDocMock).toHaveBeenCalledWith(
      { __doc: "achievements/ach-1" },
      { title: "Updated" },
      { merge: true }
    );
  });

  it("updateAchievement reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-6" } });
    firestoreState.currentUser = { uid: "user-6" };
    firestoreState.isFirestoreWorking = true;
    const boom = new Error("update failed");
    setDocMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.updateAchievement("ach-2", { title: "Z" })
      ).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "update", "achievements");
  });

  // ── deleteAchievement ────────────────────────────────────────────────
  it("deleteAchievement is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteAchievement("id1");
    });

    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("deleteAchievement removes the doc by id", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-7" } });
    firestoreState.currentUser = { uid: "user-7" };
    firestoreState.isFirestoreWorking = true;

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteAchievement("ach-3");
    });

    expect(deleteDocMock).toHaveBeenCalledWith({ __doc: "achievements/ach-3" });
  });

  it("deleteAchievement reports errors via handleFirestoreError instead of throwing", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-8" } });
    firestoreState.currentUser = { uid: "user-8" };
    firestoreState.isFirestoreWorking = true;
    const boom = new Error("delete failed");
    deleteDocMock.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useAchievements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteAchievement("ach-4")).resolves.toBeUndefined();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "delete", "achievements");
  });
});
