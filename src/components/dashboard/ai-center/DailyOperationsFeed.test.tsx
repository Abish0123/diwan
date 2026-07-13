import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DailyOperationsFeed } from "./DailyOperationsFeed";

// Purely presentational — fixed placeholder data, no props, no branches.
describe("DailyOperationsFeed", () => {
  it("renders the feed heading and each activity's title and time", () => {
    render(<DailyOperationsFeed />);
    expect(screen.getByText("Today's Activity")).toBeInTheDocument();
    expect(screen.getByText("₹12,000 received (Fees)")).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
    expect(screen.getByText("45 students marked absent")).toBeInTheDocument();
    expect(screen.getByText("3 invoices generated")).toBeInTheDocument();
    expect(screen.getByText("2 expenses pending approval")).toBeInTheDocument();
  });
});
