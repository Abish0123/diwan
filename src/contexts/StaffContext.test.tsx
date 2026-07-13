import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

// Controllable auth state used by the mocked useAuth hook.
const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user }),
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

// firebase/firestore SDK — imported by the source file but unused in the
// actual logic path (all reads/writes go through smartDb). Stub it out.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-ts"),
  where: vi.fn(),
}));

// smartDb — the local/MySQL-backed data layer used by this file.
const smartDbMocks = vi.hoisted(() => ({
  getAllLatest: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

// userRepository — used by updateStaff to mirror status onto the real login.
const userRepositoryMocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: userRepositoryMocks,
}));

import { StaffProvider, useStaff } from "./StaffContext";

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <StaffProvider>{children}</StaffProvider>;
  };
}

const sampleStaff = [
  { id: "st1", name: "Alice", uid: "someone-else", email: "alice@school.edu", status: "Active" },
  { id: "st2", name: "Bob", uid: "another-admin", email: "bob@school.edu", status: "Active" },
];

// Capture the watch callback so tests can drive it manually.
type WatchCb = (data: unknown[]) => void;
function captureWatch() {
  const callbacks: WatchCb[] = [];
  smartDbMocks.watch.mockImplementation((_entity: string, _q: unknown, cb: WatchCb) => {
    callbacks.push(cb);
    return vi.fn(); // unsubscribe
  });
  return callbacks;
}

describe("StaffContext / useStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    firestoreMocks.isFirestoreWorking = false;
    smartDbMocks.getAllLatest.mockResolvedValue(sampleStaff);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    userRepositoryMocks.findByEmail.mockResolvedValue(null);
    userRepositoryMocks.update.mockResolvedValue(undefined);
    // Default watch behavior: deliver sampleStaff immediately, like the real
    // smartDb.watch does once its first snapshot resolves. Tests that need to
    // drive the callback manually call captureWatch() to override this.
    smartDbMocks.watch.mockImplementation((_entity: string, _q: unknown, cb: WatchCb) => {
      cb(sampleStaff);
      return vi.fn();
    });
  });

  it("throws when useStaff is used outside a StaffProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useStaff())).toThrow(
      "useStaff must be used within a StaffProvider"
    );
    spy.mockRestore();
  });

  it("starts in a loading state and populates staff once smartDb.watch delivers data", async () => {
    const callbacks = captureWatch();
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.staff).toEqual([]);

    act(() => {
      callbacks[0](sampleStaff);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff).toEqual(sampleStaff);
    expect(smartDbMocks.watch).toHaveBeenCalledWith("Staff", undefined, expect.any(Function));

    // Institutional-data business rule: staff created by other admins must
    // still surface — data is NOT filtered down to the viewer's own uid.
    expect(result.current.staff.some(s => s.uid === "someone-else")).toBe(true);
  });

  it("resets staff to empty and stops loading, without watching, when there is no user", async () => {
    authMocks.user = null;

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff).toEqual([]);
    expect(smartDbMocks.watch).not.toHaveBeenCalled();
  });

  it("refetchStaff uses getAllLatest and applies the data when non-null (fresh generation)", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedList = [...sampleStaff, { id: "st3", name: "Carol", uid: "admin-1", email: "carol@school.edu", status: "Active" }];
    smartDbMocks.getAllLatest.mockResolvedValueOnce(updatedList);

    await act(async () => {
      await result.current.refetchStaff();
    });

    expect(smartDbMocks.getAllLatest).toHaveBeenCalledWith("Staff", undefined);
    expect(result.current.staff).toEqual(updatedList);
  });

  it("refetchStaff leaves staff unchanged when getAllLatest resolves null (superseded request)", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const priorStaff = result.current.staff;
    smartDbMocks.getAllLatest.mockResolvedValueOnce(null as never);

    await act(async () => {
      await result.current.refetchStaff();
    });

    expect(result.current.staff).toEqual(priorStaff);
  });

  it("refetchStaff clears the loading flag and logs on rejection", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAllLatest.mockRejectedValueOnce(new Error("db down"));

    await act(async () => {
      await result.current.refetchStaff();
    });

    expect(result.current.loading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching staff:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("addStaff is a no-op when there is no user", async () => {
    authMocks.user = null;
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStaff({ name: "New Hire" } as never);
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addStaff stamps uid + createdAt and persists via smartDb.create", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStaff({ name: "New Hire", email: "new@school.edu" } as never);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Staff",
      expect.objectContaining({ name: "New Hire", uid: "admin-1", createdAt: expect.any(String) })
    );
  });

  it("addStaff refetches via getAllLatest when firestore is not working", async () => {
    firestoreMocks.isFirestoreWorking = false;
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAllLatest.mockClear();

    await act(async () => {
      await result.current.addStaff({ name: "New Hire" } as never);
    });

    expect(smartDbMocks.getAllLatest).toHaveBeenCalledWith("Staff", undefined);
  });

  it("addStaff does not refetch when firestore is working", async () => {
    firestoreMocks.isFirestoreWorking = true;
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAllLatest.mockClear();

    await act(async () => {
      await result.current.addStaff({ name: "New Hire" } as never);
    });

    expect(smartDbMocks.getAllLatest).not.toHaveBeenCalled();
  });

  it("addStaff routes create errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("write failed");
    smartDbMocks.create.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addStaff({ name: "Bad Hire" } as never);
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "create", "Staff");
  });

  it("updateStaff persists the partial update with an updatedAt timestamp", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { name: "Alice Renamed" });
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Staff",
      "st1",
      expect.objectContaining({ name: "Alice Renamed", updatedAt: expect.any(String) })
    );
  });

  it("updateStaff mirrors status onto the real login when setting Inactive, using the explicit email", async () => {
    userRepositoryMocks.findByEmail.mockResolvedValueOnce({ id: "user-1", email: "alice@school.edu" });

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { status: "Inactive", email: "alice@school.edu" });
    });

    // findByEmail/update are chained via .then(), not awaited inline — flush microtasks.
    await waitFor(() => expect(userRepositoryMocks.findByEmail).toHaveBeenCalledWith("alice@school.edu"));
    await waitFor(() => expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-1", { status: "Inactive" }));
  });

  it("updateStaff falls back to the existing staff record's email when the update payload has none", async () => {
    const callbacks = captureWatch();
    userRepositoryMocks.findByEmail.mockResolvedValueOnce({ id: "user-2", email: "bob@school.edu" });

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    act(() => callbacks[0](sampleStaff));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st2", { status: "Terminated" });
    });

    await waitFor(() => expect(userRepositoryMocks.findByEmail).toHaveBeenCalledWith("bob@school.edu"));
    await waitFor(() => expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-2", { status: "Inactive" }));
  });

  it("updateStaff reactivates the login (status: Active) when the staff status is set back to Active", async () => {
    userRepositoryMocks.findByEmail.mockResolvedValueOnce({ id: "user-1", email: "alice@school.edu" });

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { status: "Active", email: "alice@school.edu" });
    });

    await waitFor(() => expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-1", { status: "Active" }));
  });

  it("updateStaff does not touch userRepository when status is unrelated to Active/Inactive/Terminated", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { name: "Just a rename" });
    });

    expect(userRepositoryMocks.findByEmail).not.toHaveBeenCalled();
  });

  it("updateStaff does not throw when userRepository.findByEmail returns no user for the email", async () => {
    userRepositoryMocks.findByEmail.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { status: "Inactive", email: "alice@school.edu" });
    });

    await waitFor(() => expect(userRepositoryMocks.findByEmail).toHaveBeenCalled());
    expect(userRepositoryMocks.update).not.toHaveBeenCalled();
  });

  it("updateStaff routes update errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("update failed");
    smartDbMocks.update.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStaff("st1", { name: "Whatever" });
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "update", "Staff");
  });

  it("deleteStaff calls smartDb.delete with the given id and refetches when firestore is not working", async () => {
    firestoreMocks.isFirestoreWorking = false;
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAllLatest.mockClear();

    await act(async () => {
      await result.current.deleteStaff("st1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Staff", "st1");
    expect(smartDbMocks.getAllLatest).toHaveBeenCalledWith("Staff", undefined);
  });

  it("deleteStaff routes delete errors through handleFirestoreError instead of throwing", async () => {
    const boom = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValueOnce(boom);

    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteStaff("st1");
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "delete", "Staff");
  });
});
