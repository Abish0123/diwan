import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useDashboardStatsMock = vi.fn();
vi.mock("@/hooks/useDashboardStats", () => ({
  useDashboardStats: () => useDashboardStatsMock(),
}));

const useFinancialSettingsMock = vi.fn();
vi.mock("@/hooks/useFinancialSettings", () => ({
  useFinancialSettings: () => useFinancialSettingsMock(),
}));

import { FinanceSnapshot } from "./FinanceSnapshot";

describe("FinanceSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialSettingsMock.mockReturnValue({ settings: { currency: "BHD" } });
  });

  it("shows a loading spinner while dashboard stats are loading", () => {
    useDashboardStatsMock.mockReturnValue({ pendingFees: 0, overdueInvoicesCount: 0, loading: true });
    const { container } = render(<FinanceSnapshot />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Finance Snapshot")).not.toBeInTheDocument();
  });

  it("renders pending fees formatted with the configured currency", () => {
    useDashboardStatsMock.mockReturnValue({ pendingFees: 45000, overdueInvoicesCount: 7, loading: false });
    render(<FinanceSnapshot />);
    expect(screen.getByText("Finance Snapshot")).toBeInTheDocument();
    expect(screen.getByText("BHD45,000")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the Defaulters and Reminders action buttons", () => {
    useDashboardStatsMock.mockReturnValue({ pendingFees: 100, overdueInvoicesCount: 1, loading: false });
    render(<FinanceSnapshot />);
    expect(screen.getByText("View Defaulters")).toBeInTheDocument();
    expect(screen.getByText("Send Reminders")).toBeInTheDocument();
  });
});
