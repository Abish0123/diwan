import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PerformanceOverviewCard } from "./PerformanceOverviewCard";

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("PerformanceOverviewCard", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    navigateMock.mockReset();
  });

  it("shows a loading state before data resolves", () => {
    getAllMock.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><PerformanceOverviewCard /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no active appraisal cycle", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    render(<MemoryRouter><PerformanceOverviewCard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No active appraisal cycle yet.")).toBeInTheDocument());
  });

  it("renders completion, avg score, top department and at-risk staff for the latest cycle", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") {
        return Promise.resolve([
          { id: "cycle-1", type: "cycle", title: "2026 Mid-Year Review", startedAt: "2026-06-01" },
          { id: "sc-1", name: "Jane Doe", department: "Academics", overall: 90, status: "Graded", cycleId: "cycle-1" },
          { id: "sc-2", name: "John Roe", department: "Academics", overall: 0, status: "Pending", cycleId: "cycle-1" },
        ]);
      }
      return Promise.resolve([]);
    });
    render(<MemoryRouter><PerformanceOverviewCard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Overall Completion")).toBeInTheDocument());
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText(/Academics/)).toBeInTheDocument();
  });

  it("shows a graded-count-zero summary when the cycle has just started", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") {
        return Promise.resolve([
          { id: "cycle-1", type: "cycle", title: "New Cycle", startedAt: "2026-07-01" },
          { id: "sc-1", name: "Jane Doe", department: "Academics", overall: 0, status: "Pending", cycleId: "cycle-1" },
        ]);
      }
      return Promise.resolve([]);
    });
    render(<MemoryRouter><PerformanceOverviewCard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/no scorecards graded yet/)).toBeInTheDocument());
  });

  it("navigates to /hr/appraisal when Analytics is clicked", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") {
        return Promise.resolve([
          { id: "cycle-1", type: "cycle", title: "Cycle", startedAt: "2026-06-01" },
          { id: "sc-1", name: "Jane Doe", department: "Academics", overall: 90, status: "Graded", cycleId: "cycle-1" },
        ]);
      }
      return Promise.resolve([]);
    });
    render(<MemoryRouter><PerformanceOverviewCard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Analytics")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Analytics"));
    expect(navigateMock).toHaveBeenCalledWith("/hr/appraisal");
  });
});
