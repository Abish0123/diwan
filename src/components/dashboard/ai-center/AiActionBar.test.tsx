import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiActionBar } from "./AiActionBar";

// Purely presentational — fixed placeholder data, no props, no branches.
describe("AiActionBar", () => {
  it("renders all three action cards with their titles and call-to-action labels", () => {
    render(<AiActionBar />);
    expect(screen.getByText("23 Students Pending Fees")).toBeInTheDocument();
    expect(screen.getByText("Send reminders now")).toBeInTheDocument();
    expect(screen.getByText("Attendance dropping in Class 8")).toBeInTheDocument();
    expect(screen.getByText("View students")).toBeInTheDocument();
    expect(screen.getByText("Transport budget exceeded by 18%")).toBeInTheDocument();
    expect(screen.getByText("Review expenses")).toBeInTheDocument();
  });
});
