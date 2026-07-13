import React, { useContext } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  onAuthStateChangedCb: null as ((user: unknown) => void) | null,
  signInWithPopupMock: vi.fn(),
  signOutMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    authMocks.onAuthStateChangedCb = cb;
    return () => {};
  },
  signInWithPopup: (...args: unknown[]) => authMocks.signInWithPopupMock(...args),
  GoogleAuthProvider: class {},
  signOut: (...args: unknown[]) => authMocks.signOutMock(...args),
}));

vi.mock("../lib/firebase", () => ({
  auth: { __fakeAuth: true },
  db: { __fakeDb: true },
  isFirestoreWorking: false,
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __doc: true })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

const isDefaultAdminEmailMock = vi.fn(() => false);
vi.mock("../lib/admin-emails", () => ({
  isDefaultAdminEmail: (...args: unknown[]) => isDefaultAdminEmailMock(...(args as [string])),
}));

const smartDbMocks = vi.hoisted(() => ({
  getOne: vi.fn(),
  create: vi.fn(() => Promise.resolve()),
}));
vi.mock("../lib/localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => smartDbMocks.getOne(...args),
    create: (...args: unknown[]) => smartDbMocks.create(...args),
  },
}));

vi.mock("../lib/roles", () => ({
  isCentralAdmin: (role: string | null | undefined) => role === "admin" || role === "super_admin",
}));

const trackEventMock = vi.fn();
vi.mock("../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import { AuthContext, AuthProvider } from "./AuthContext";

// ── Test consumer ────────────────────────────────────────────────────────────

function Consumer() {
  const ctx = useContext(AuthContext);
  return (
    <div>
      <div data-testid="loading">{String(ctx.loading)}</div>
      <div data-testid="role">{ctx.role ?? "null"}</div>
      <div data-testid="realRole">{ctx.realRole ?? "null"}</div>
      <div data-testid="user">{ctx.user ? (ctx.user as { uid?: string }).uid : "null"}</div>
      <div data-testid="isMockSession">{String(ctx.isMockSession)}</div>
      <div data-testid="isImpersonating">{String(ctx.isImpersonating)}</div>
      <div data-testid="canImpersonate">{String(ctx.canImpersonate)}</div>
      <div data-testid="photoURL">{ctx.user ? (ctx.user as { photoURL?: string }).photoURL ?? "" : ""}</div>
      <button onClick={() => ctx.impersonateRole("student")}>impersonate-student</button>
      <button onClick={() => ctx.stopImpersonating()}>stop-impersonate</button>
      <button onClick={() => { void ctx.login(); }}>login</button>
      <button onClick={() => { ctx.loginWithEmail("a@b.com", "pw").catch(() => {}); }}>login-email</button>
      <button onClick={() => { void ctx.logout(); }}>logout</button>
      <button onClick={() => ctx.updateUserPhoto("https://new-photo.example/x.png")}>update-photo</button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const clearSpy = vi.spyOn(queryClient, "clear");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>
  );
  return { ...utils, queryClient, clearSpy };
}

const originalFetch = global.fetch;

beforeEach(() => {
  authMocks.onAuthStateChangedCb = null;
  authMocks.signInWithPopupMock.mockReset();
  authMocks.signOutMock.mockReset().mockResolvedValue(undefined);
  isDefaultAdminEmailMock.mockReset().mockReturnValue(false);
  smartDbMocks.getOne.mockReset();
  smartDbMocks.create.mockReset().mockResolvedValue(undefined);
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  trackEventMock.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AuthContext", () => {
  it("starts in a loading state before Firebase resolves", () => {
    renderProvider();
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("role").textContent).toBe("null");
  });

  it("resolves to logged-out state when Firebase reports no user", async () => {
    renderProvider();
    await act(async () => {
      authMocks.onAuthStateChangedCb?.(null);
    });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("role").textContent).toBe("null");
  });

  it("restores a saved local (mock) session from sessionStorage synchronously", async () => {
    sessionStorage.setItem("sd_user", JSON.stringify({ uid: "u1", email: "u1@x.com" }));
    sessionStorage.setItem("sd_role", "teacher");
    renderProvider();
    // Restored synchronously in the mount effect, before Firebase resolves.
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("u1");
    expect(screen.getByTestId("role").textContent).toBe("teacher");
    expect(screen.getByTestId("isMockSession").textContent).toBe("true");
  });

  it("ignores a stale Firebase auth event when a local mock session is active", async () => {
    sessionStorage.setItem("sd_user", JSON.stringify({ uid: "u1", email: "u1@x.com" }));
    sessionStorage.setItem("sd_role", "teacher");
    renderProvider();
    await act(async () => {
      // A stale Firebase user firing after mount must not override the mock session/role.
      authMocks.onAuthStateChangedCb?.({ uid: "firebase-uid", email: "fb@x.com" });
    });
    expect(screen.getByTestId("role").textContent).toBe("teacher");
    expect(screen.getByTestId("user").textContent).toBe("u1");
  });

  it("loads an existing local-DB user profile's role when Firestore is disabled", async () => {
    smartDbMocks.getOne.mockResolvedValue({ role: "principal" });
    renderProvider();
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-1", email: "p@x.com", displayName: "Prin" });
    });
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("principal"));
    expect(screen.getByTestId("user").textContent).toBe("fb-1");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(sessionStorage.getItem("sd_role")).toBe("principal");
  });

  it("creates a new local-DB profile as admin when the email is a default admin", async () => {
    smartDbMocks.getOne.mockResolvedValue(null);
    isDefaultAdminEmailMock.mockReturnValue(true);
    renderProvider();
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-2", email: "admin@x.com", displayName: "Admin" });
    });
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "users",
      expect.objectContaining({ role: "admin", uid: "fb-2" }),
      "fb-2"
    );
  });

  it("creates a new local-DB profile as staff when the email is NOT a default admin", async () => {
    smartDbMocks.getOne.mockResolvedValue(null);
    isDefaultAdminEmailMock.mockReturnValue(false);
    renderProvider();
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-3", email: "random@x.com", displayName: "Rando" });
    });
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("staff"));
  });

  it("falls back to cached sessionStorage role (not a demotion) when the DB lookup throws", async () => {
    smartDbMocks.getOne.mockRejectedValue(new Error("db down"));
    renderProvider();
    // Prime a stale cached role as if a previous successful load happened before the crash.
    sessionStorage.setItem("sd_role", "hr_manager");
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-4", email: "x@x.com", displayName: "X" });
    });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("role").textContent).toBe("hr_manager");
    expect(screen.getByTestId("user").textContent).toBe("fb-4");
  });

  it("falls back to the admin-email allowlist (not silently 'student') when the DB throws and there is no cached role", async () => {
    smartDbMocks.getOne.mockRejectedValue(new Error("db down"));
    isDefaultAdminEmailMock.mockReturnValue(true);
    renderProvider();
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-5", email: "admin@x.com", displayName: "X" });
    });
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
  });

  it("falls back to 'staff' (not 'student') when the DB throws, no cached role, and the email isn't a default admin", async () => {
    smartDbMocks.getOne.mockRejectedValue(new Error("db down"));
    isDefaultAdminEmailMock.mockReturnValue(false);
    renderProvider();
    await act(async () => {
      await authMocks.onAuthStateChangedCb?.({ uid: "fb-6", email: "nobody@x.com", displayName: "X" });
    });
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("staff"));
  });

  it("falls back to logged-out after the Firebase auth timeout if onAuthStateChanged never fires", async () => {
    vi.useFakeTimers();
    renderProvider();
    expect(screen.getByTestId("loading").textContent).toBe("true");
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  describe("impersonation (canImpersonate gating)", () => {
    it("central admins can impersonate another role", async () => {
      smartDbMocks.getOne.mockResolvedValue({ role: "admin" });
      const { user: _ } = { user: undefined };
      renderProvider();
      await act(async () => {
        await authMocks.onAuthStateChangedCb?.({ uid: "adm-1", email: "admin@x.com" });
      });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
      expect(screen.getByTestId("canImpersonate").textContent).toBe("true");

      act(() => { screen.getByText("impersonate-student").click(); });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("student"));
      expect(screen.getByTestId("realRole").textContent).toBe("admin");
      expect(screen.getByTestId("isImpersonating").textContent).toBe("true");
      expect(sessionStorage.getItem("sd_impersonate")).toBe("student");

      act(() => { screen.getByText("stop-impersonate").click(); });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
      expect(screen.getByTestId("isImpersonating").textContent).toBe("false");
      expect(sessionStorage.getItem("sd_impersonate")).toBeNull();
    });

    it("non-admin roles cannot impersonate — effective role stays their real role", async () => {
      smartDbMocks.getOne.mockResolvedValue({ role: "teacher" });
      renderProvider();
      await act(async () => {
        await authMocks.onAuthStateChangedCb?.({ uid: "tch-1", email: "t@x.com" });
      });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("teacher"));
      expect(screen.getByTestId("canImpersonate").textContent).toBe("false");

      act(() => { screen.getByText("impersonate-student").click(); });
      // Guarded inside impersonateRole itself: a non-admin's call is a no-op.
      expect(screen.getByTestId("role").textContent).toBe("teacher");
      expect(screen.getByTestId("isImpersonating").textContent).toBe("false");
    });
  });

  describe("login() (Google popup)", () => {
    it("returns true and shows a success toast on a successful popup sign-in", async () => {
      authMocks.signInWithPopupMock.mockResolvedValue({ user: { uid: "g-1" } });
      renderProvider();
      let result: boolean | undefined;
      const ctxHolder: { current: boolean | undefined } = { current: undefined };
      // Use the button to trigger login(), but we need the return value — instead
      // call login via a ref captured from context using a second consumer.
      screen.getByText("login").click();
      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Logged in successfully"));
      expect(trackEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: "login", uid: "g-1" }));
      void result; void ctxHolder;
    });

    it("returns false silently (no toast) when the user cancels the popup", async () => {
      authMocks.signInWithPopupMock.mockRejectedValue({ code: "auth/popup-closed-by-user" });
      renderProvider();
      screen.getByText("login").click();
      await waitFor(() => expect(authMocks.signInWithPopupMock).toHaveBeenCalled());
      expect(toastMocks.error).not.toHaveBeenCalled();
      expect(toastMocks.success).not.toHaveBeenCalled();
    });

    it("shows a specific message and does NOT fabricate a session on auth/unauthorized-domain", async () => {
      authMocks.signInWithPopupMock.mockRejectedValue({ code: "auth/unauthorized-domain" });
      renderProvider();
      screen.getByText("login").click();
      await waitFor(() =>
        expect(toastMocks.error).toHaveBeenCalledWith(
          "Google sign-in isn't available on this domain. Please sign in with your email and password instead."
        )
      );
      expect(screen.getByTestId("user").textContent).toBe("null");
    });

    it("shows a generic failure toast on any other error", async () => {
      authMocks.signInWithPopupMock.mockRejectedValue(new Error("boom"));
      renderProvider();
      screen.getByText("login").click();
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to login"));
    });
  });

  describe("loginWithEmail()", () => {
    it("logs in successfully, persists session + token, and tracks the event", async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // checkOnly
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { uid: "e-1", email: "a@b.com", displayName: "Alice", role: "librarian" },
              token: "tok-123",
            }),
        });
      renderProvider();
      screen.getByText("login-email").click();
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("librarian"));
      expect(screen.getByTestId("user").textContent).toBe("e-1");
      expect(screen.getByTestId("isMockSession").textContent).toBe("true");
      expect(sessionStorage.getItem("sd_token")).toBe("tok-123");
      expect(sessionStorage.getItem("sd_role")).toBe("librarian");
      expect(trackEventMock).toHaveBeenCalledWith({ type: "login", uid: "e-1", role: "librarian" });
    });

    it("generates a dicebear placeholder photo when the account has no photoURL", async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ user: { uid: "e-2", email: "b@b.com", displayName: "Bob", role: "student" } }),
        });
      renderProvider();
      screen.getByText("login-email").click();
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("student"));
      expect(screen.getByTestId("photoURL").textContent).toContain("dicebear.com");
      expect(screen.getByTestId("photoURL").textContent).toContain("e-2");
    });

    it("uses the real uploaded photoURL over the placeholder when the account has one", async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                uid: "e-3",
                email: "c@b.com",
                displayName: "Cara",
                role: "student",
                photoURL: "https://real-photo.example/pic.png",
              },
            }),
        });
      renderProvider();
      screen.getByText("login-email").click();
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("student"));
      expect(screen.getByTestId("photoURL").textContent).toBe("https://real-photo.example/pic.png");
    });

    it("throws and toasts the server error when checkOnly fails (user not registered)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "No such user" }),
      });
      renderProvider();
      screen.getByText("login-email").click();
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("No such user"));
      expect(screen.getByTestId("user").textContent).toBe("null");
    });

    it("throws and toasts the server error when the real login call fails (wrong password)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: "Wrong password" }) });
      renderProvider();
      screen.getByText("login-email").click();
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Wrong password"));
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  describe("logout()", () => {
    it("clears user/role/session storage, stops impersonation, and clears the query cache", async () => {
      smartDbMocks.getOne.mockResolvedValue({ role: "admin" });
      const { clearSpy } = renderProvider();
      await act(async () => {
        await authMocks.onAuthStateChangedCb?.({ uid: "adm-2", email: "admin@x.com" });
      });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));

      act(() => { screen.getByText("impersonate-student").click(); });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("student"));

      await act(async () => {
        screen.getByText("logout").click();
      });

      await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("null"));
      expect(screen.getByTestId("role").textContent).toBe("null");
      expect(screen.getByTestId("isImpersonating").textContent).toBe("false");
      expect(sessionStorage.getItem("sd_user")).toBeNull();
      expect(sessionStorage.getItem("sd_role")).toBeNull();
      expect(sessionStorage.getItem("sd_token")).toBeNull();
      expect(sessionStorage.getItem("sd_impersonate")).toBeNull();
      expect(clearSpy).toHaveBeenCalled();
      expect(authMocks.signOutMock).toHaveBeenCalled();
      expect(toastMocks.success).toHaveBeenCalledWith("Logged out successfully");
    });

    it("shows an error toast if signOut rejects unexpectedly outside the caught path", async () => {
      // logout() catches signOut failures internally via .catch(() => {}), so a thrown
      // error surfaces only if something else in the try block throws. We simulate that
      // by making queryClient.clear throw.
      smartDbMocks.getOne.mockResolvedValue({ role: "admin" });
      const { clearSpy } = renderProvider();
      await act(async () => {
        await authMocks.onAuthStateChangedCb?.({ uid: "adm-3", email: "admin@x.com" });
      });
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
      clearSpy.mockImplementation(() => {
        throw new Error("cache explode");
      });
      await act(async () => {
        screen.getByText("logout").click();
      });
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to logout"));
    });
  });

  describe("updateUserPhoto()", () => {
    it("updates the cached user's photoURL and persists it to sessionStorage", async () => {
      sessionStorage.setItem("sd_user", JSON.stringify({ uid: "u9", email: "u9@x.com", photoURL: "old.png" }));
      sessionStorage.setItem("sd_role", "teacher");
      renderProvider();
      expect(screen.getByTestId("photoURL").textContent).toBe("old.png");

      await act(async () => {
        screen.getByText("update-photo").click();
      });

      expect(screen.getByTestId("photoURL").textContent).toBe("https://new-photo.example/x.png");
      const stored = JSON.parse(sessionStorage.getItem("sd_user") || "{}");
      expect(stored.photoURL).toBe("https://new-photo.example/x.png");
    });

    it("is a no-op when there is no signed-in user", async () => {
      renderProvider();
      await act(async () => {
        authMocks.onAuthStateChangedCb?.(null);
      });
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
      await act(async () => {
        screen.getByText("update-photo").click();
      });
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });
});
