/**
 * Integration tests — AuthContext + API roundtrip
 *
 * Tests that the AuthContext correctly wires the React state layer to the
 * real /api/session/login endpoint. Unlike the AuthContext unit tests (which
 * mock every fetch call individually), these tests verify the full chain:
 *
 *   loginWithEmail()  →  fetch('/api/session/login')  →  React state update
 *   logout()          →  sessionStorage cleared        →  user becomes null
 *   token persistence →  sessionStorage.getItem()      →  token is set after login
 *   error propagation →  server 401                    →  toast.error() called
 *   photo fallback    →  no photoURL in response       →  dicebear URL generated
 *   photo override    →  photoURL in response          →  real URL used
 *
 * Fetch is still mocked (no real server) because the goal is to test that
 * AuthContext correctly interprets what the API returns — not to re-test the
 * API itself (that is done in api-session.integration.test.ts).
 *
 * This file re-uses the same render harness as AuthContext.test.tsx but
 * focuses on the FULL login → state → session flow as one cohesive path
 * rather than testing individual methods in isolation.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, AuthContext } from "@/contexts/AuthContext";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => {
    cb(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  // signOut must return a Promise — AuthContext calls signOut(auth).catch(()=>{})
  // and if signOut returns undefined that .catch() call throws TypeError.
  signOut: vi.fn(() => Promise.resolve()),
  GoogleAuthProvider: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  auth: {},
  db: {},
  isFirestoreWorking: vi.fn(async () => false),
  handleFirestoreError: vi.fn(),
  OperationType: {},
}));

vi.mock("@/lib/localDb", () => ({ smartDb: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/roles", () => ({ isCentralAdmin: vi.fn(() => false) }));
vi.mock("@/lib/admin-emails", () => ({ isDefaultAdminEmail: vi.fn(() => false) }));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), info: vi.fn() } }));

// ── render harness ────────────────────────────────────────────────────────────

/**
 * Renders AuthProvider and exposes reactive state through data-testid spans.
 * This is the integration harness — it renders the REAL AuthProvider, not a
 * mock, so every internal effect and callback is exercised.
 */
function Consumer({ onLogin, onLogout }: { onLogin?: (email: string) => void; onLogout?: () => void }) {
  const ctx = React.useContext(AuthContext);
  return (
    <div>
      <span data-testid="uid">{ctx.user?.uid ?? "null"}</span>
      <span data-testid="role">{ctx.role ?? "null"}</span>
      <span data-testid="isMock">{String(ctx.isMockSession)}</span>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <button
        onClick={() => ctx.loginWithEmail("admin@eduerp.com", "admin123")}
        data-testid="btn-login"
      >
        login
      </button>
      <button onClick={() => ctx.logout()} data-testid="btn-logout">
        logout
      </button>
    </div>
  );
}

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function mockLoginSuccess(overrides: Record<string, unknown> = {}) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      user: {
        uid: "u-001",
        email: "admin@eduerp.com",
        displayName: "Admin User",
        role: "admin",
        ...overrides,
      },
      token: "tok-integration-test",
    }),
  } as unknown as Response);
}

function mockLoginFailure(errorMessage: string, status = 401) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    status,
    headers: { get: () => "application/json" },
    json: async () => ({ error: errorMessage }),
  } as unknown as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("AuthContext + loginWithEmail — full roundtrip", () => {
  it("user is null and loading is false before any login attempt", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("uid").textContent).toBe("null");
  });

  it("a successful login sets user.uid in the context", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("u-001"));
  });

  it("a successful login sets the role in the context", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
  });

  it("isMockSession is true after a successful email/password login", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("isMock").textContent).toBe("true"));
  });

  it("persists the token in sessionStorage after login", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("u-001"));
    expect(sessionStorage.getItem("sd_token")).toBe("tok-integration-test");
  });

  it("persists the role in sessionStorage after login", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("u-001"));
    expect(sessionStorage.getItem("sd_role")).toBe("admin");
  });
});

describe("AuthContext + loginWithEmail — error propagation", () => {
  it("calls toast.error with the server error message on a 401 response", async () => {
    mockLoginFailure("Incorrect password.");
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Incorrect password."));
  });

  it("user remains null after a failed login", async () => {
    mockLoginFailure("User not found.");
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByTestId("uid").textContent).toBe("null");
  });

  it("shows a clear message when the server returns HTML (non-JSON 500)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => "text/html" },
      json: async () => { throw new SyntaxError("Unexpected token"); },
      text: async () => "A server error occurred.",
    } as unknown as Response);
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The error message must mention server or API — not a raw JSON parse trace
    const msg = String(toastError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/server|api|500/);
  });

  it("does not persist a token when login fails", async () => {
    mockLoginFailure("Wrong password.");
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(sessionStorage.getItem("sd_token")).toBeNull();
  });
});

describe("AuthContext + logout — session teardown", () => {
  it("clears the user from context after logout", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("u-001"));

    screen.getByTestId("btn-logout").click();
    await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("null"));
  });

  it("clears the token from sessionStorage after logout", async () => {
    mockLoginSuccess();
    renderProvider();
    screen.getByTestId("btn-login").click();
    await waitFor(() => expect(sessionStorage.getItem("sd_token")).toBe("tok-integration-test"));

    screen.getByTestId("btn-logout").click();
    await waitFor(() => expect(sessionStorage.getItem("sd_token")).toBeNull());
  });
});

describe("AuthContext — photoURL fallback integration", () => {
  it("generates a dicebear placeholder when the server returns no photoURL", async () => {
    // Render via a dedicated consumer that reads photoURL
    mockLoginSuccess({ photoURL: undefined });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let capturedPhoto = "";
    function PhotoConsumer() {
      const ctx = React.useContext(AuthContext);
      capturedPhoto = (ctx.user as any)?.photoURL ?? "";
      return (
        <button
          onClick={() => ctx.loginWithEmail("admin@eduerp.com", "admin123")}
          data-testid="photo-login"
        >
          go
        </button>
      );
    }
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <PhotoConsumer />
        </AuthProvider>
      </QueryClientProvider>
    );
    screen.getByTestId("photo-login").click();
    await waitFor(() => expect(capturedPhoto).toContain("dicebear.com"));
    expect(capturedPhoto).toContain("u-001");
  });

  it("uses the real photoURL when the server returns one", async () => {
    const realPhoto = "https://cdn.example.com/avatar.png";
    mockLoginSuccess({ photoURL: realPhoto });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let capturedPhoto = "";
    function PhotoConsumer2() {
      const ctx = React.useContext(AuthContext);
      capturedPhoto = (ctx.user as any)?.photoURL ?? "";
      return (
        <button
          onClick={() => ctx.loginWithEmail("admin@eduerp.com", "admin123")}
          data-testid="photo-login2"
        >
          go
        </button>
      );
    }
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <PhotoConsumer2 />
        </AuthProvider>
      </QueryClientProvider>
    );
    screen.getByTestId("photo-login2").click();
    await waitFor(() => expect(capturedPhoto).toBe(realPhoto));
  });
});
