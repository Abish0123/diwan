import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { KpiCard } from "./KpiCard";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

describe("KpiCard", () => {
  it("renders the title and animates a numeric value via CountUpNumber", () => {
    render(<KpiCard title="Total Students" value={1234} icon={Users} />);
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders a pre-formatted string value as-is without CountUpNumber", () => {
    render(<KpiCard title="Status" value="Active" icon={Users} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies value prefix/suffix only for numeric values", () => {
    render(<KpiCard title="Attendance" value={92} icon={Users} valueSuffix="%" />);
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("shows trend text and description when trend is provided", () => {
    render(
      <KpiCard
        title="Revenue"
        value={5000}
        icon={Users}
        trend="+12%"
        trendType="up"
        description="vs last month"
      />
    );
    expect(screen.getByText("+12%")).toBeInTheDocument();
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });

  it("does not render a trend row when trend is omitted", () => {
    render(<KpiCard title="Revenue" value={5000} icon={Users} />);
    expect(screen.queryByText("vs last month")).not.toBeInTheDocument();
  });
});
