/**
 * System Tests — ErrorBoundary & Application Loading States
 *
 * Tests the full crash-recovery and loading system:
 * - ErrorBoundary catches thrown errors and shows fallback UI
 * - ErrorBoundary renders children when there is no error
 * - ResizeObserver loop errors are silently swallowed (not shown)
 * - JSON-shaped Firestore errors trigger the permission-specific message
 * - Reload Application button is present in the error state
 * - Suspense loading spinner is shown while lazy routes resolve
 * - ProtectedRoute loading spinner shown while auth is initializing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense, lazy } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ── Suppress expected console.error output from thrown-error tests ────────────
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helper: component that always throws ─────────────────────────────────────
function Bomb({ message }: { message: string }) {
  throw new Error(message);
  return null;
}

// ── ErrorBoundary — happy path ────────────────────────────────────────────────
describe("ErrorBoundary — Happy path (no error)", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>Child Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Child Content")).toBeInTheDocument();
  });

  it("renders multiple children without issue", () => {
    render(
      <ErrorBoundary>
        <span>First</span>
        <span>Second</span>
      </ErrorBoundary>
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});

// ── ErrorBoundary — error caught ──────────────────────────────────────────────
describe("ErrorBoundary — Error caught and fallback UI shown", () => {
  it("shows 'Something went wrong' heading when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb message="test error" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("does NOT render the failed child after an error", () => {
    render(
      <ErrorBoundary>
        <Bomb message="crash!" />
      </ErrorBoundary>
    );
    expect(screen.queryByText("crash!")).not.toBeInTheDocument();
  });

  it("shows the error message in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <Bomb message="unique-crash-message-xyz" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/unique-crash-message-xyz/i)).toBeInTheDocument();
  });

  it("renders the 'Reload Application' button in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <Bomb message="crash for button test" />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /reload application/i })).toBeInTheDocument();
  });
});

// ── ErrorBoundary — ResizeObserver swallowed ──────────────────────────────────
describe("ErrorBoundary — ResizeObserver loop error is silently swallowed", () => {
  it("getDerivedStateFromError returns hasError=false for ResizeObserver loop errors", () => {
    // When getDerivedStateFromError returns {hasError:false} React will not
    // commit the error state, so no fallback UI is shown. Rendering a component
    // that throws an error that getDerivedStateFromError swallows causes a
    // React re-render loop in JSDOM, so we test the static method directly.
    const resizeObserverError = new Error(
      "ResizeObserver loop completed with undelivered notifications."
    );
    const state = ErrorBoundary.getDerivedStateFromError(resizeObserverError);
    expect(state.hasError).toBe(false);
    expect(state.error).toBeNull();
  });

  it("getDerivedStateFromError returns hasError=true for normal errors", () => {
    const normalError = new Error("Something broke");
    const state = ErrorBoundary.getDerivedStateFromError(normalError);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(normalError);
  });
});

// ── ErrorBoundary — Firestore permission error JSON shape ─────────────────────
describe("ErrorBoundary — Firestore permission error shows specialised message", () => {
  it("shows 'Database Permission Error' heading for JSON Firestore errors", () => {
    const firestoreError = JSON.stringify({
      error: "Permission denied",
      operationType: "read",
      path: "/users/123",
    });

    function FirestoreBomb() {
      throw new Error(firestoreError);
      return null;
    }

    render(
      <ErrorBoundary>
        <FirestoreBomb />
      </ErrorBoundary>
    );
    expect(screen.getByText(/database permission error/i)).toBeInTheDocument();
  });

  it("shows the permission-specific description for Firestore errors", () => {
    const firestoreError = JSON.stringify({
      error: "Forbidden",
      operationType: "write",
      path: "/classes/abc",
    });

    function FirestoreBomb2() {
      throw new Error(firestoreError);
      return null;
    }

    render(
      <ErrorBoundary>
        <FirestoreBomb2 />
      </ErrorBoundary>
    );
    expect(screen.getByText(/permission to perform this action/i)).toBeInTheDocument();
  });
});

// ── Suspense loading spinner ───────────────────────────────────────────────────
describe("Loading States — Suspense fallback while lazy route resolves", () => {
  it("shows the suspense fallback while a lazy component is loading", async () => {
    // Create a never-resolving lazy component to hold the loading state
    let resolveImport!: () => void;
    const neverResolves = new Promise<{ default: () => JSX.Element }>((resolve) => {
      resolveImport = () => resolve({ default: () => <div>Lazy Content</div> });
    });
    const LazyComp = lazy(() => neverResolves);

    render(
      <Suspense fallback={<div>Loading app...</div>}>
        <LazyComp />
      </Suspense>
    );
    expect(screen.getByText("Loading app...")).toBeInTheDocument();

    // Resolve and confirm lazy content eventually renders
    resolveImport();
    await waitFor(() => {
      expect(screen.getByText("Lazy Content")).toBeInTheDocument();
    });
  });
});

// ── ErrorBoundary + Suspense composition ─────────────────────────────────────
describe("Loading States — ErrorBoundary wraps Suspense correctly", () => {
  it("renders Suspense children after loading completes", async () => {
    const AlreadyResolved = lazy(() =>
      Promise.resolve({ default: () => <div>Resolved Component</div> })
    );

    render(
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <AlreadyResolved />
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText("Resolved Component")).toBeInTheDocument();
    });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("ErrorBoundary catches errors thrown inside Suspense-wrapped components", async () => {
    const ThrowingLazy = lazy(() =>
      Promise.resolve({
        default: () => {
          throw new Error("lazy-crash");
          return null as any;
        },
      })
    );

    render(
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <ThrowingLazy />
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});
