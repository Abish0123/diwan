import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { ReactNode } from "react";

// ── Mock external boundaries ────────────────────────────────────────────────
const authMock = vi.hoisted(() => ({
  user: null as { uid: string } | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user }),
}));

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}));

import { BranchProvider, useBranch } from "./BranchContext";

const STORAGE_KEY = "sd_active_branch_id";

// Small test consumer that surfaces context state onto the DOM so we can
// assert on it via RTL queries.
function Consumer() {
  const { branches, activeBranchId, activeBranch, setActiveBranchId, loading } = useBranch();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="branch-count">{branches.length}</div>
      <div data-testid="active-id">{activeBranchId ?? "none"}</div>
      <div data-testid="active-name">{activeBranch?.name ?? "none"}</div>
      <ul>
        {branches.map(b => (
          <li key={b.id}>{b.name}</li>
        ))}
      </ul>
      <button onClick={() => setActiveBranchId("b1")}>select-b1</button>
      <button onClick={() => setActiveBranchId("b2")}>select-b2</button>
      <button onClick={() => setActiveBranchId(null)}>clear</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <BranchProvider>
      <Consumer />
    </BranchProvider>
  );
}

describe("BranchContext", () => {
  beforeEach(() => {
    authMock.user = null;
    getAllMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when useBranch is used outside a BranchProvider", () => {
    function Bare() {
      useBranch();
      return null;
    }
    // Suppress React's console.error noise for the expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useBranch must be used within a BranchProvider");
    spy.mockRestore();
  });

  it("has no user: skips fetching branches and immediately clears loading", async () => {
    authMock.user = null;
    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(getAllMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("branch-count").textContent).toBe("0");
  });

  it("loads branches from smartDb when a user is present", async () => {
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([
      { id: "b1", name: "Downtown Campus" },
      { id: "b2", name: "North Campus" },
    ]);

    renderWithProvider();

    expect(screen.getByTestId("loading").textContent).toBe("true");

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(getAllMock).toHaveBeenCalledWith("Branch", undefined);
    expect(screen.getByTestId("branch-count").textContent).toBe("2");
    expect(screen.getByText("Downtown Campus")).toBeInTheDocument();
    expect(screen.getByText("North Campus")).toBeInTheDocument();
  });

  it("handles smartDb.getAll errors by logging and clearing loading with empty branches", async () => {
    authMock.user = { uid: "u1" };
    getAllMock.mockRejectedValue(new Error("network down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("branch-count").textContent).toBe("0");
    expect(errSpy).toHaveBeenCalledWith("Error loading branches:", expect.any(Error));
    errSpy.mockRestore();
  });

  it("derives activeBranch from activeBranchId and branches list", async () => {
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([
      { id: "b1", name: "Downtown Campus" },
      { id: "b2", name: "North Campus" },
    ]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("active-id").textContent).toBe("none");
    expect(screen.getByTestId("active-name").textContent).toBe("none");

    act(() => {
      fireEvent.click(screen.getByText("select-b2"));
    });

    expect(screen.getByTestId("active-id").textContent).toBe("b2");
    expect(screen.getByTestId("active-name").textContent).toBe("North Campus");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("b2");
  });

  // KNOWN BUG: the "drop stale selection" effect (branches.length <= 1 check)
  // runs against the initial `branches` state, which starts as `[]` before the
  // async smartDb.getAll() fetch resolves. Since 0 <= 1 is true, it immediately
  // clears ANY persisted activeBranchId from localStorage on every mount,
  // even when that branch id is valid and branches.length will end up > 1
  // once loaded. This defeats the entire "persisted per-browser" purpose of
  // the context described in its own header comment. It is a functional bug,
  // not a security/access-control issue (worst case: a valid branch selection
  // is not restored on reload), so we document the actual current behavior
  // here rather than assert the intended behavior.
  it("KNOWN BUG: does not actually restore a valid activeBranchId from localStorage on mount", async () => {
    localStorage.setItem(STORAGE_KEY, "b1");
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([
      { id: "b1", name: "Downtown Campus" },
      { id: "b2", name: "North Campus" },
    ]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    // Intended behavior would be "b1" / "Downtown Campus" — actual behavior
    // wipes the selection before branches ever load.
    expect(screen.getByTestId("active-id").textContent).toBe("none");
    expect(screen.getByTestId("active-name").textContent).toBe("none");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears the active branch and localStorage when setActiveBranchId(null) is called", async () => {
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([
      { id: "b1", name: "Downtown Campus" },
      { id: "b2", name: "North Campus" },
    ]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    // Select b1 only after branches have finished loading, so the selection
    // actually sticks (see KNOWN BUG test above for the mount-time race).
    act(() => {
      fireEvent.click(screen.getByText("select-b1"));
    });
    expect(screen.getByTestId("active-id").textContent).toBe("b1");

    act(() => {
      fireEvent.click(screen.getByText("clear"));
    });

    expect(screen.getByTestId("active-id").textContent).toBe("none");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops a stale activeBranchId once branches load and it no longer exists (deleted branch)", async () => {
    localStorage.setItem(STORAGE_KEY, "ghost-branch");
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([
      { id: "b1", name: "Downtown Campus" },
      { id: "b2", name: "North Campus" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("active-id").textContent).toBe("none"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops the active selection when the school only has a single branch", async () => {
    localStorage.setItem(STORAGE_KEY, "b1");
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([{ id: "b1", name: "Only Campus" }]);

    renderWithProvider();

    // Even though b1 is a real branch, a single-branch school has nothing
    // meaningful to scope by, so the selection should be dropped.
    await waitFor(() => expect(screen.getByTestId("active-id").textContent).toBe("none"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears branches and stops loading when the user logs out after branches were loaded", async () => {
    authMock.user = { uid: "u1" };
    getAllMock.mockResolvedValue([{ id: "b1", name: "Downtown Campus" }]);

    const { rerender } = render(
      <BranchProvider>
        <Consumer />
      </BranchProvider>
    );
    await waitFor(() => expect(screen.getByTestId("branch-count").textContent).toBe("1"));

    authMock.user = null;
    rerender(
      <BranchProvider>
        <Consumer />
      </BranchProvider>
    );

    await waitFor(() => expect(screen.getByTestId("branch-count").textContent).toBe("0"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
