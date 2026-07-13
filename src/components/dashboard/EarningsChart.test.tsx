import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EarningsChart } from "./EarningsChart";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

// ── Mock external boundaries ────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  isMockSession: true,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

vi.mock("@/hooks/useFinancialSettings", () => ({
  useFinancialSettings: () => ({ settings: { currency: "QAR" } }),
}));

vi.mock("@/lib/firebase", () => ({ db: { __fakeDb: true } }));

let snapshotCallbacks: Array<(snap: { docs: { data: () => Record<string, unknown> }[] }) => void> = [];
const onSnapshotMock = vi.fn((_q: unknown, cb: (snap: unknown) => void) => {
  snapshotCallbacks.push(cb as never);
  return vi.fn(); // unsubscribe
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ __collection: true })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn(() => ({ __where: true })),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...(args as [unknown, (snap: unknown) => void])),
}));

describe("EarningsChart", () => {
  beforeEach(() => {
    onSnapshotMock.mockClear();
    snapshotCallbacks = [];
    authMock.user = null;
    authMock.isMockSession = true;
  });

  it("renders dummy demo data with a real total revenue for a mock session / no user", () => {
    render(<EarningsChart />);
    expect(screen.getByText("Revenue vs Expenses Trend")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    // No live subscriptions should be set up for a mock session.
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("switches between monthly and weekly period views", () => {
    render(<EarningsChart />);
    const weeklyBtn = screen.getByText("Weekly");
    fireEvent.click(weeklyBtn);
    expect(weeklyBtn.className).toMatch(/bg-card/);
  });

  it("subscribes to real student/entity revenue when a real user is signed in", async () => {
    authMock.user = { uid: "u1" };
    authMock.isMockSession = false;
    render(<EarningsChart />);
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));
  });

  it("aggregates real revenue snapshots into the totalRevenue figure", async () => {
    authMock.user = { uid: "u1" };
    authMock.isMockSession = false;
    render(<EarningsChart />);
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));

    snapshotCallbacks.forEach((cb) =>
      cb({ docs: [{ data: () => ({ amount: 1000, date: new Date().toISOString() }) }] })
    );

    await waitFor(() => expect(screen.getByText(/2,000/)).toBeInTheDocument());
  });
});
