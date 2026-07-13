import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => mockGetAll(...args) },
}));

import { StaffLeaveStatus } from "./StaffLeaveStatus";

describe("StaffLeaveStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data resolves", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));
    render(<StaffLeaveStatus />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no leave requests", async () => {
    mockGetAll.mockResolvedValue([]);
    render(<StaffLeaveStatus />);
    await waitFor(() => expect(screen.getByText("No leave requests.")).toBeInTheDocument());
  });

  it("renders staff name, leave type, pluralized duration and Approved status", async () => {
    mockGetAll.mockResolvedValue([
      { id: "1", staffName: "Amina Yusuf", type: "Sick Leave", days: 1, status: "Approved" },
    ]);
    render(<StaffLeaveStatus />);
    await waitFor(() => expect(screen.getByText("Amina Yusuf")).toBeInTheDocument());
    expect(screen.getByText("Sick Leave")).toBeInTheDocument();
    expect(screen.getByText("1 Day")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("pluralizes duration for multi-day requests and shows Rejected status", async () => {
    mockGetAll.mockResolvedValue([
      { id: "2", staffName: "Omar Khan", type: "Casual", days: 3, status: "Rejected" },
    ]);
    render(<StaffLeaveStatus />);
    await waitFor(() => expect(screen.getByText("3 Days")).toBeInTheDocument());
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("defaults an unspecified status to Pending", async () => {
    mockGetAll.mockResolvedValue([{ id: "3", staffName: "No Status Guy", type: "Leave" }]);
    render(<StaffLeaveStatus />);
    await waitFor(() => expect(screen.getByText("Pending")).toBeInTheDocument());
  });
});
