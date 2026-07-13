import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KpiTrendArea } from "./KpiTrendArea";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

// jsdom reports 0 for layout dimensions, which makes recharts'
// ResponsiveContainer (it reads getBoundingClientRect) skip rendering its
// children entirely. Give it a realistic size so the underlying <svg>
// actually mounts.
Element.prototype.getBoundingClientRect = () =>
  ({ width: 300, height: 56, top: 0, left: 0, right: 300, bottom: 56, x: 0, y: 0, toJSON() {} }) as DOMRect;

describe("KpiTrendArea", () => {
  it("renders an area chart for a real multi-point series", () => {
    const { container } = render(<KpiTrendArea values={[1, 5, 3, 8]} color="#9810fa" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a flat two-point line when given fewer than 2 values (no fabricated shape)", () => {
    const { container } = render(<KpiTrendArea values={[7]} color="#9810fa" />);
    // Should still render without crashing, with a synthetic flat series.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("handles an empty values array by falling back to 0", () => {
    const { container } = render(<KpiTrendArea values={[]} color="#10b981" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("uses the height prop for the chart container", () => {
    const { container } = render(<KpiTrendArea values={[1, 2]} color="#10b981" height={100} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("100px");
  });
});
