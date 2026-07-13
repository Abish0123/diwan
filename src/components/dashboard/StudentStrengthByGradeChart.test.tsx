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

import { StudentStrengthByGradeChart } from "./StudentStrengthByGradeChart";

describe("StudentStrengthByGradeChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading message while loading", () => {
    render(
      <MemoryRouter>
        <StudentStrengthByGradeChart data={[]} loading />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    render(
      <MemoryRouter>
        <StudentStrengthByGradeChart data={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText("No students enrolled yet.")).toBeInTheDocument();
  });

  it("renders the chart title when data is present", () => {
    render(
      <MemoryRouter>
        <StudentStrengthByGradeChart data={[{ grade: "Grade 1", students: 20 }]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Student Strength by Grade")).toBeInTheDocument();
    expect(screen.queryByText("No students enrolled yet.")).not.toBeInTheDocument();
  });

  it("navigates to /students when 'Details' is clicked", () => {
    render(
      <MemoryRouter>
        <StudentStrengthByGradeChart data={[{ grade: "Grade 1", students: 20 }]} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Details"));
    expect(navigateMock).toHaveBeenCalledWith("/students");
  });
});
