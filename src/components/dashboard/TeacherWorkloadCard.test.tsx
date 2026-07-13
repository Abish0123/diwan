import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

import { TeacherWorkloadCard } from "./TeacherWorkloadCard";

const emptyData = { avgLoadPct: 0, full: 0, medium: 0, low: 0 };

describe("TeacherWorkloadCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading message while loading", () => {
    render(
      <MemoryRouter>
        <TeacherWorkloadCard data={emptyData} loading />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no subject assignments", () => {
    render(
      <MemoryRouter>
        <TeacherWorkloadCard data={emptyData} />
      </MemoryRouter>
    );
    expect(screen.getByText("No subject assignments recorded yet.")).toBeInTheDocument();
  });

  it("renders the workload chips with counts and percentages", () => {
    render(
      <MemoryRouter>
        <TeacherWorkloadCard data={{ avgLoadPct: 72, full: 6, medium: 3, low: 1 }} />
      </MemoryRouter>
    );
    expect(screen.getByText(/Full Load/)).toBeInTheDocument();
    expect(screen.getByText("6 (60%)")).toBeInTheDocument();
    expect(screen.getByText("3 (30%)")).toBeInTheDocument();
    expect(screen.getByText("1 (10%)")).toBeInTheDocument();
  });

  it("navigates to /hr/staff when the workload report link is clicked", () => {
    render(
      <MemoryRouter>
        <TeacherWorkloadCard data={{ avgLoadPct: 50, full: 1, medium: 0, low: 0 }} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("View workload report"));
    expect(navigateMock).toHaveBeenCalledWith("/hr/staff");
  });
});
