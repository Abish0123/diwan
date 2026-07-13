import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademicPerformance } from "./AcademicPerformance";

// Purely presentational — fixed placeholder data, no props, no branches.
describe("AcademicPerformance", () => {
  it("renders the panel heading and both performance rows", () => {
    render(<AcademicPerformance />);
    expect(screen.getByText("Academic Insights")).toBeInTheDocument();
    expect(screen.getByText("Top Class: Grade 9")).toBeInTheDocument();
    expect(screen.getByText("92% avg")).toBeInTheDocument();
    expect(screen.getByText("Lowest: Grade 8")).toBeInTheDocument();
    expect(screen.getByText("68% avg")).toBeInTheDocument();
    expect(screen.getByText("View Academic Report")).toBeInTheDocument();
  });
});
