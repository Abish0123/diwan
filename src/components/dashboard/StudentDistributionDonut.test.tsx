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

import { StudentDistributionDonut } from "./StudentDistributionDonut";

function renderChart(props: Partial<React.ComponentProps<typeof StudentDistributionDonut>> = {}) {
  return render(
    <MemoryRouter>
      <StudentDistributionDonut data={[]} {...props} />
    </MemoryRouter>
  );
}

describe("StudentDistributionDonut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton placeholder while loading", () => {
    const { container } = renderChart({ loading: true });
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows an empty state when there is no student data", () => {
    renderChart({ data: [] });
    expect(screen.getByText("No students enrolled yet.")).toBeInTheDocument();
  });

  it("renders each grade with its count and percentage of the total", () => {
    renderChart({ data: [{ grade: "Grade 5", students: 30 }, { grade: "Grade 6", students: 10 }] });
    expect(screen.getByText("Grade 5")).toBeInTheDocument();
    expect(screen.getByText("75%)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Grade 6")).toBeInTheDocument();
  });

  it("navigates to /students when 'View full breakdown' is clicked", () => {
    renderChart({ data: [{ grade: "Grade 5", students: 30 }] });
    fireEvent.click(screen.getByText("View full breakdown"));
    expect(navigateMock).toHaveBeenCalledWith("/students");
  });
});
