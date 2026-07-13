import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { StaticKpiCard } from "./StaticKpiCard";

// ResponsiveContainer relies on ResizeObserver, which jsdom doesn't provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

describe("StaticKpiCard", () => {
  it("renders the title, description and the real numeric value immediately (no animateOnMount)", () => {
    render(<StaticKpiCard title="Total Students" value={482} icon={Users} description="Across all grades" />);
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("Across all grades")).toBeInTheDocument();
    // StaticKpiCard passes animateOnMount to CountUpNumber, which starts the
    // tween from 0 rather than showing the real value immediately.
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders a non-numeric value verbatim instead of animating it", () => {
    render(<StaticKpiCard title="Status" value="Excellent" icon={Users} />);
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("renders the trend text with an up arrow for trendType 'up'", () => {
    render(<StaticKpiCard title="Revenue" value={100} icon={Users} trend="+12%" trendType="up" />);
    expect(screen.getByText("+12% ↑")).toBeInTheDocument();
  });

  it("renders the trend text with a down arrow for trendType 'down'", () => {
    render(<StaticKpiCard title="Attendance" value={90} icon={Users} trend="-3%" trendType="down" />);
    expect(screen.getByText("-3% ↓")).toBeInTheDocument();
  });

  it("renders the trend text with no arrow for the default neutral trendType", () => {
    render(<StaticKpiCard title="Neutral" value={50} icon={Users} trend="0%" />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("does not render a trend badge when no trend is provided", () => {
    render(<StaticKpiCard title="No Trend" value={5} icon={Users} />);
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument();
  });
});
