import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

// firebase/firestore SDK — stub doc/onSnapshot used for the live-sync effect.
const onSnapshotMock = vi.fn();
const docMock = vi.fn((_db: unknown, path: string, id?: string) => ({ __doc: `${path}/${id}` }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string?])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
}));

// @/firebase — mutable isFirestoreWorking flag via a hoisted box so each test
// can flip it, mirroring the pattern used in src/lib/localDb.test.ts.
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
    GET: "get",
    WRITE: "write",
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firebaseMocks.isFirestoreWorking;
  },
}));

// @/lib/localDb — smartDb boundary.
const getOneMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => getOneMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

// sonner toast.
const toastSuccessMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}));

// useAuth — a different hook than the one under test, mocked as an external
// boundary so we can control `user` / `isMockSession`.
const useAuthMock = vi.fn();
vi.mock("./useAuth", () => ({
  useAuth: (...args: unknown[]) => useAuthMock(...args),
}));

import { useFinancialSettings } from "./useFinancialSettings";

const DEFAULT_SETTINGS = {
  openingBalance: 0,
  initialCapital: 0,
  bankLoan: 0,
  retainedEarnings: 0,
  currency: "BHD",
  targetUtilization: 90,
  maxCombinedDiscountPct: 100,
  uid: "",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFinancialSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.isFirestoreWorking = false;
    onSnapshotMock.mockImplementation(() => () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns DEFAULT_SETTINGS and not loading when there is no user (query disabled)", async () => {
    useAuthMock.mockReturnValue({ user: null, isMockSession: false });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.loading).toBe(false);
    expect(getOneMock).not.toHaveBeenCalled();
  });

  it("fetches settings via smartDb.getOne when the user is a mock session, and exposes the loaded data", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-1" }, isMockSession: true });
    const loaded = { ...DEFAULT_SETTINGS, currency: "USD", openingBalance: 500, uid: "user-1" };
    getOneMock.mockResolvedValue(loaded);

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    // Loading should be true synchronously before the fetch resolves.
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getOneMock).toHaveBeenCalledWith("FinancialSettings", "user-1");
    expect(result.current.settings).toEqual(loaded);
  });

  it("falls back to DEFAULT_SETTINGS when smartDb.getOne resolves null (no record yet)", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-2" }, isMockSession: true });
    getOneMock.mockResolvedValue(null);

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("does not query smartDb when there IS a user but isMockSession is false and Firestore is 'working'", async () => {
    // enabled = !!user && (isMockSession || !isFirestoreWorking)
    // isMockSession=false, isFirestoreWorking=true -> !isFirestoreWorking=false -> disabled
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-3" }, isMockSession: false });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    // Query disabled: loading stays false and getOne is never invoked.
    expect(result.current.loading).toBe(false);
    expect(getOneMock).not.toHaveBeenCalled();
  });

  it("queries smartDb when the user exists and Firestore is not working, even without a mock session", async () => {
    firebaseMocks.isFirestoreWorking = false;
    useAuthMock.mockReturnValue({ user: { uid: "user-4" }, isMockSession: false });
    getOneMock.mockResolvedValue({ ...DEFAULT_SETTINGS, uid: "user-4" });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    await waitFor(() => expect(getOneMock).toHaveBeenCalledWith("FinancialSettings", "user-4"));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("subscribes to onSnapshot for real-time updates only when user exists, not a mock session, and Firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-5" }, isMockSession: false });

    renderHook(() => useFinancialSettings(), { wrapper });

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1));
    expect(docMock).toHaveBeenCalledWith({ __fakeDb: true }, "financial_settings", "user-5");
  });

  it("does not subscribe to onSnapshot when isMockSession is true (even if Firestore is 'working')", () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-6" }, isMockSession: true });

    renderHook(() => useFinancialSettings(), { wrapper });

    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not subscribe to onSnapshot when there is no user", () => {
    useAuthMock.mockReturnValue({ user: null, isMockSession: false });

    renderHook(() => useFinancialSettings(), { wrapper });

    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("calls handleFirestoreError and invalidates the query when onSnapshot reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-7" }, isMockSession: false });

    let errorCb: ((err: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_docRef, _onNext, onError) => {
      errorCb = onError;
      return () => {};
    });

    renderHook(() => useFinancialSettings(), { wrapper });

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    const boom = new Error("permission-denied");
    act(() => {
      errorCb?.(boom);
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
      boom,
      "get",
      "financial_settings"
    );
  });

  it("updates the react-query cache with live snapshot data when onSnapshot fires with an existing doc", async () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-8" }, isMockSession: false });
    getOneMock.mockResolvedValue(DEFAULT_SETTINGS);

    let nextCb: ((snap: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_docRef, onNext) => {
      nextCb = onNext;
      return () => {};
    });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    const liveData = { ...DEFAULT_SETTINGS, currency: "EUR" };
    act(() => {
      nextCb?.({ exists: () => true, data: () => liveData });
    });

    await waitFor(() => expect(result.current.settings.currency).toBe("EUR"));
  });

  it("ignores onSnapshot callbacks where the doc does not exist", async () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-9" }, isMockSession: false });

    let nextCb: ((snap: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_docRef, onNext) => {
      nextCb = onNext;
      return () => {};
    });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      nextCb?.({ exists: () => false, data: () => ({ currency: "SHOULD_NOT_APPLY" }) });
    });

    expect(result.current.settings.currency).not.toBe("SHOULD_NOT_APPLY");
  });

  it("unsubscribes from onSnapshot on unmount", async () => {
    firebaseMocks.isFirestoreWorking = true;
    useAuthMock.mockReturnValue({ user: { uid: "user-10" }, isMockSession: false });
    const unsubMock = vi.fn();
    onSnapshotMock.mockReturnValue(unsubMock);

    const { unmount } = renderHook(() => useFinancialSettings(), { wrapper });
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    unmount();

    expect(unsubMock).toHaveBeenCalled();
  });

  it("updateSettings is a no-op when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, isMockSession: false });

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });

    await act(async () => {
      await result.current.updateSettings({ currency: "GBP" });
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("updateSettings writes via smartDb.update with uid + updatedAt merged in, and shows a success toast", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-11" }, isMockSession: true });
    getOneMock.mockResolvedValue(DEFAULT_SETTINGS);
    updateMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSettings({ targetUtilization: 75 });
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [entity, uid, payload] = updateMock.mock.calls[0];
    expect(entity).toBe("FinancialSettings");
    expect(uid).toBe("user-11");
    expect(payload).toMatchObject({ targetUtilization: 75, uid: "user-11" });
    expect(typeof payload.updatedAt).toBe("string");
    expect(toastSuccessMock).toHaveBeenCalledWith("Financial settings updated");
  });

  it("updateSettings calls handleFirestoreError when smartDb.update throws, and does not toast success", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-12" }, isMockSession: true });
    getOneMock.mockResolvedValue(DEFAULT_SETTINGS);
    const boom = new Error("write failed");
    updateMock.mockRejectedValue(boom);

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSettings({ currency: "KWD" });
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(boom, "write", "FinancialSettings");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("updateCurrency delegates to updateSettings with only the currency field", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-13" }, isMockSession: true });
    getOneMock.mockResolvedValue(DEFAULT_SETTINGS);
    updateMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFinancialSettings(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateCurrency("JPY");
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, , payload] = updateMock.mock.calls[0];
    expect(payload).toMatchObject({ currency: "JPY", uid: "user-13" });
  });
});
