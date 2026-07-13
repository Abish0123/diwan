import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AttendanceOverviewCard } from "./AttendanceOverviewCard";
import { AttendanceBreakdown } from "@/hooks/useDashboardOverview";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const DATA: AttendanceBreakdown = {
  present: 80,
  absent: 15,
  late: 5,
  total: 100,
  presentPct: 80,
  date: "2026-07-13",
};

describe("AttendanceOverviewCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading skeleton", () => {
    render(<MemoryRouter><AttendanceOverviewCard data={{ present: 0, absent: 0, late: 0, total: 0, presentPct: 0, date: null }} loading /></MemoryRouter>);
    expect(screen.getByText("Attendance Overview")).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been marked today", () => {
    render(<MemoryRouter><AttendanceOverviewCard data={{ present: 0, absent: 0, late: 0, total: 0, presentPct: 0, date: null }} /></MemoryRouter>);
    expect(screen.getByText("No attendance marked yet today.")).toBeInTheDocument();
  });

  it("renders the present/absent/late breakdown legend with counts and percentages", () => {
    render(<MemoryRouter><AttendanceOverviewCard data={DATA} /></MemoryRouter>);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Present:/)).toBeInTheDocument();
    expect(screen.getByText(/80 \(80%\)/)).toBeInTheDocument();
    expect(screen.getByText(/15 \(15%\)/)).toBeInTheDocument();
    expect(screen.getByText(/5 \(5%\)/)).toBeInTheDocument();
  });

  it("navigates to /attendance when Today is clicked", () => {
    render(<MemoryRouter><AttendanceOverviewCard data={DATA} /></MemoryRouter>);
    screen.getByText("Today").click();
    expect(navigateMock).toHaveBeenCalledWith("/attendance");
  });
});
