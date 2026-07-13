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

import { StudentsByCampusChart } from "./StudentsByCampusChart";

function renderChart(props: Partial<React.ComponentProps<typeof StudentsByCampusChart>> = {}) {
  return render(
    <MemoryRouter>
      <StudentsByCampusChart data={[]} {...props} />
    </MemoryRouter>
  );
}

describe("StudentsByCampusChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading message while loading", () => {
    renderChart({ loading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when every campus has zero students", () => {
    renderChart({ data: [{ name: "Main Campus", students: 0, color: "#000" }] });
    expect(screen.getByText("No students enrolled yet.")).toBeInTheDocument();
  });

  it("renders each campus with its count and percentage, filtering out empty campuses", () => {
    renderChart({
      data: [
        { name: "Main Campus", students: 75, color: "#111" },
        { name: "North Campus", students: 25, color: "#222" },
        { name: "Empty Campus", students: 0, color: "#333" },
      ],
    });
    expect(screen.getByText(/Main Campus:/)).toBeInTheDocument();
    expect(screen.getByText(/North Campus:/)).toBeInTheDocument();
    expect(screen.queryByText(/Empty Campus:/)).not.toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument(); // total shown in the donut center
  });

  it("navigates to /branches when 'Details' is clicked", () => {
    renderChart({ data: [{ name: "Main Campus", students: 10, color: "#111" }] });
    fireEvent.click(screen.getByText("Details"));
    expect(navigateMock).toHaveBeenCalledWith("/branches");
  });
});
