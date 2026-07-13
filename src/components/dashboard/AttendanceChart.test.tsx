import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AttendanceChart } from "./AttendanceChart";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

// jsdom reports 0 for layout dimensions, which makes recharts'
// ResponsiveContainer (it reads getBoundingClientRect) skip rendering its
// children entirely. Give it a realistic size so the chart actually mounts.
Element.prototype.getBoundingClientRect = () =>
  ({ width: 600, height: 220, top: 0, left: 0, right: 600, bottom: 220, x: 0, y: 0, toJSON() {} }) as DOMRect;

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

describe("AttendanceChart", () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  it("shows a loading state before data resolves", () => {
    getAllMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AttendanceChart />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no attendance data", async () => {
    getAllMock.mockResolvedValue([]);
    render(<AttendanceChart />);
    await waitFor(() => expect(screen.getByText("No attendance data to display yet.")).toBeInTheDocument());
    expect(screen.getByText("No attendance recorded yet")).toBeInTheDocument();
  });

  it("shows an empty state gracefully when smartDb.getAll rejects", async () => {
    getAllMock.mockRejectedValue(new Error("db down"));
    render(<AttendanceChart />);
    await waitFor(() => expect(screen.getByText("No attendance data to display yet.")).toBeInTheDocument());
  });

  it("aggregates the latest marked date's attendance by grade", async () => {
    getAllMock.mockResolvedValue([
      { date: "2026-07-10", grade: "5", present: 20, absent: 2, late: 1 },
      { date: "2026-07-10", grade: "6", present: 18, absent: 0, late: 0 },
      // Older date with data should not be used since 07-10 is the latest non-empty one.
      { date: "2026-07-01", grade: "5", present: 5, absent: 5, late: 0 },
      // A more recent date that has zero marked students everywhere is skipped.
      { date: "2026-07-12", grade: "5", present: 0, absent: 0, late: 0 },
    ]);
    const { container } = render(<AttendanceChart />);

    // Present: 20 + 18 = 38, Absent/Late: (2+1) + 0 = 3, total marked = 41 —
    // this confirms the 07-01 and 07-12 rows were correctly excluded in
    // favor of the latest non-empty date (07-10), aggregated across both
    // grades. (Recharts' own SVG tick-label rendering is exercised more
    // reliably at the "two bar groups render" check below than by asserting
    // exact tick text, since jsdom's zero-width text measurement makes
    // recharts collapse/skip overlapping axis ticks.)
    await waitFor(() => expect(screen.getAllByText("38").length).toBeGreaterThan(0));
    expect(screen.getByText(/of 41 on/)).toBeInTheDocument();
    // Two grades' worth of bars (Present + Absent/Late per grade) were drawn.
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(4);
  });
});
