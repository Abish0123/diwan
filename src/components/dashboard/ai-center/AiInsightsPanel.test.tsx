import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// useDashboardStats is heavy IO (react-query + firebase + Student/Staff
// contexts) — mocked as the external boundary, same pattern already used for
// useFinancialSettings in src/components/ai-center/Predictions.test.tsx.
const useDashboardStatsMock = vi.fn();
vi.mock("@/hooks/useDashboardStats", () => ({
  useDashboardStats: () => useDashboardStatsMock(),
}));

import { AiInsightsPanel } from "./AiInsightsPanel";

describe("AiInsightsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading placeholder while dashboard stats are loading", () => {
    useDashboardStatsMock.mockReturnValue({ collectionRate: 0, overdueInvoicesCount: 0, loading: true });
    render(<AiInsightsPanel />);
    expect(screen.getByText("Analyzing data...")).toBeInTheDocument();
  });

  it("flags a low collection rate as a warning insight", () => {
    useDashboardStatsMock.mockReturnValue({ collectionRate: 80, overdueInvoicesCount: 0, loading: false });
    render(<AiInsightsPanel />);
    expect(screen.getByText("Fee collection rate is 80%")).toBeInTheDocument();
    expect(screen.getByText("Below the target of 95%. Consider sending reminders.")).toBeInTheDocument();
  });

  it("shows a healthy collection message when the rate is at or above 90%", () => {
    useDashboardStatsMock.mockReturnValue({ collectionRate: 95, overdueInvoicesCount: 0, loading: false });
    render(<AiInsightsPanel />);
    expect(screen.getByText("Fee collection is on track")).toBeInTheDocument();
  });

  it("surfaces overdue invoices and recommends sending reminders", () => {
    useDashboardStatsMock.mockReturnValue({ collectionRate: 95, overdueInvoicesCount: 4, loading: false });
    render(<AiInsightsPanel />);
    expect(screen.getByText("4 overdue invoices detected")).toBeInTheDocument();
    expect(
      screen.getByText("Send reminders for the 4 overdue invoices to improve collection rate.")
    ).toBeInTheDocument();
  });

  it("shows a clean-bill-of-health recommendation when there are no overdue invoices", () => {
    useDashboardStatsMock.mockReturnValue({ collectionRate: 95, overdueInvoicesCount: 0, loading: false });
    render(<AiInsightsPanel />);
    expect(screen.getByText("No overdue invoices")).toBeInTheDocument();
    expect(
      screen.getByText("Continue monitoring academic performance and maintain current collection strategies.")
    ).toBeInTheDocument();
  });
});
