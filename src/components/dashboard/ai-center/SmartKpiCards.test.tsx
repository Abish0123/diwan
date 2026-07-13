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

import { SmartKpiCards } from "./SmartKpiCards";

describe("SmartKpiCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialSettingsMock.mockReturnValue({ settings: { currency: "BHD" } });
  });

  it("renders 4 loading placeholders while dashboard stats are loading", () => {
    useDashboardStatsMock.mockReturnValue({
      revenueThisMonth: 0, collectionRate: 0, totalStudents: 0, avgAttendance: 0, loading: true,
    });
    const { container } = render(<SmartKpiCards />);
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(4);
  });

  it("renders all four KPI cards with formatted values once loaded", () => {
    useDashboardStatsMock.mockReturnValue({
      revenueThisMonth: 125000, collectionRate: 88, totalStudents: 640, avgAttendance: 91, loading: false,
    });
    render(<SmartKpiCards />);
    expect(screen.getByText("Revenue This Month")).toBeInTheDocument();
    // toLocaleString() grouping is locale-dependent (e.g. Indian digit
    // grouping renders 125000 as "1,25,000") — compute the expected string
    // the same way the component does instead of hardcoding US grouping.
    expect(screen.getByText(`BHD${(125000).toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByText("Collection Rate")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("640")).toBeInTheDocument();
    expect(screen.getByText("Avg Attendance")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });
});
