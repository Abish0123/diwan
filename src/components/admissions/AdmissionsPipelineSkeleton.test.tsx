import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdmissionsPipelineSkeleton } from "./AdmissionsPipelineSkeleton";

describe("AdmissionsPipelineSkeleton", () => {
  it("renders a column header for every pipeline stage", () => {
    render(<AdmissionsPipelineSkeleton />);
    const titles = [
      "Enquiry", "Form Sent", "Form Submitted", "Payment Done", "Exam",
      "Interview", "Doc Verification", "School Fee", "Section Allocation", "Enrolled",
    ];
    for (const title of titles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("renders more skeleton cards in the first three columns than the rest", () => {
    const { container } = render(<AdmissionsPipelineSkeleton />);
    const root = container.firstElementChild!;
    const columns = Array.from(root.children);
    expect(columns.length).toBe(10);
    // First column (index 0) is one of the "busier" ones with 2 cards.
    const firstColumnCards = columns[0].querySelectorAll(".rounded-3xl.bg-white");
    const lastColumnCards = columns[9].querySelectorAll(".rounded-3xl.bg-white");
    expect(firstColumnCards.length).toBe(2);
    expect(lastColumnCards.length).toBe(1);
  });
});
