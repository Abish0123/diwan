import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => mockGetAll(...args) },
}));

import { RecentVisitors } from "./RecentVisitors";

describe("RecentVisitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data resolves", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));
    render(<RecentVisitors />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no visitor check-ins", async () => {
    mockGetAll.mockResolvedValue([]);
    render(<RecentVisitors />);
    await waitFor(() => expect(screen.getByText("No visitor check-ins recorded.")).toBeInTheDocument());
  });

  it("renders up to 4 visitors with purpose, location and status badge", async () => {
    mockGetAll.mockResolvedValue([
      { id: "1", name: "John Doe", purpose: "Meeting", location: "Front Office", time: "10:00 AM", status: "Checked In" },
      { id: "2", name: "Jane Roe", purpose: "Delivery", location: "Gate", time: "11:00 AM", status: "Waiting" },
      { id: "3", name: "A", purpose: "Pickup", location: "Gate", time: "12:00 PM", status: "Checked Out" },
      { id: "4", name: "B", purpose: "Pickup", location: "Gate", time: "12:30 PM", status: "Checked In" },
      { id: "5", name: "Extra", purpose: "Should not show", location: "Gate", time: "1:00 PM", status: "Checked In" },
    ]);
    render(<RecentVisitors />);
    await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument());
    expect(screen.getByText("Jane Roe")).toBeInTheDocument();
    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    // Only the first 4 are rendered.
    expect(screen.queryByText("Extra")).not.toBeInTheDocument();
  });

  it("falls back to an empty visitor list if the fetch throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db down"));
    render(<RecentVisitors />);
    await waitFor(() => expect(screen.getByText("No visitor check-ins recorded.")).toBeInTheDocument());
  });
});
