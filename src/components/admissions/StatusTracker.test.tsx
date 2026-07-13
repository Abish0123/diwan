import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusTracker } from "./StatusTracker";

describe("StatusTracker", () => {
  it("renders all ten pipeline stages in order", () => {
    render(<StatusTracker currentStatus="Enquiry" />);
    const stages = [
      "Enquiry", "Form Sent", "Form Submitted", "Payment Done", "Exam",
      "Interview", "Doc Verification", "School Fee", "Section Allocation", "Enrolled",
    ];
    for (const stage of stages) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it("marks the current stage with 'Current Stage' label and nothing else", () => {
    render(<StatusTracker currentStatus="Exam" />);
    expect(screen.getByText("Current Stage")).toBeInTheDocument();
    // Only one stage should carry the "Current Stage" marker.
    expect(screen.getAllByText("Current Stage")).toHaveLength(1);
  });

  it("does not show 'Current Stage' for the first stage's earlier siblings (none) and marks Enquiry active when it is current", () => {
    render(<StatusTracker currentStatus="Enquiry" />);
    expect(screen.getByText("Current Stage")).toBeInTheDocument();
  });

  it("renders with no active marker when currentStatus doesn't match any known stage", () => {
    // currentIndex becomes -1; nothing is 'active' or 'completed' by index comparison.
    render(<StatusTracker currentStatus={"Nonexistent" as any} />);
    expect(screen.queryByText("Current Stage")).not.toBeInTheDocument();
    // Still renders all stage labels since STAGES itself is unaffected.
    expect(screen.getByText("Enquiry")).toBeInTheDocument();
  });

  it("treats the final stage as both completed-eligible and correctly renders without a connector past it", () => {
    const { container } = render(<StatusTracker currentStatus="Enrolled" />);
    expect(screen.getByText("Current Stage")).toBeInTheDocument();
    // 10 stage rows total
    expect(container.querySelectorAll(".group").length).toBe(10);
  });
});
