import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useDashboardStatsMock = vi.fn();
vi.mock("@/hooks/useDashboardStats", () => ({
  useDashboardStats: () => useDashboardStatsMock(),
}));

import { StudentHealthOverview } from "./StudentHealthOverview";

describe("StudentHealthOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading placeholder while dashboard stats are loading", () => {
    useDashboardStatsMock.mockReturnValue({ totalStudents: 0, loading: true });
    render(<StudentHealthOverview />);
    expect(screen.getByText("Analyzing student data...")).toBeInTheDocument();
  });

  it("derives at-risk / needs-attention / performing-well counts from totalStudents", () => {
    useDashboardStatsMock.mockReturnValue({ totalStudents: 200, loading: false });
    render(<StudentHealthOverview />);
    // Math.round(200*0.03)=6, Math.round(200*0.06)=12, Math.round(200*0.91)=182
    expect(screen.getByText("6 At Risk")).toBeInTheDocument();
    expect(screen.getByText("12 Need Attention")).toBeInTheDocument();
    expect(screen.getByText("182 Performing Well")).toBeInTheDocument();
    expect(screen.getByText("+6 more at risk")).toBeInTheDocument();
  });

  it("renders zeros gracefully when there are no students yet", () => {
    useDashboardStatsMock.mockReturnValue({ totalStudents: 0, loading: false });
    render(<StudentHealthOverview />);
    expect(screen.getByText("0 At Risk")).toBeInTheDocument();
    expect(screen.getByText("0 Need Attention")).toBeInTheDocument();
    expect(screen.getByText("0 Performing Well")).toBeInTheDocument();
  });
});
