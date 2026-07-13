import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RecentAdmissions } from "./RecentAdmissions";

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

describe("RecentAdmissions", () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  it("shows a loading state before data resolves", () => {
    getAllMock.mockReturnValue(new Promise(() => {}));
    render(<RecentAdmissions />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no admissions", async () => {
    getAllMock.mockResolvedValue([]);
    render(<RecentAdmissions />);
    await waitFor(() => expect(screen.getByText("No recent admissions.")).toBeInTheDocument());
  });

  it("renders the 4 most recent admissions with name/grade/status", async () => {
    getAllMock.mockResolvedValue([
      { id: "1", name: "Alice Smith", grade: "Grade 3", createdAt: "2026-07-01", status: "Confirmed" },
      { id: "2", name: "Bob Jones", grade: "Grade 4", createdAt: "2026-07-05", status: "Pending" },
      // Missing createdAt is excluded entirely.
      { id: "3", name: "No Date Student" },
    ]);
    render(<RecentAdmissions />);
    await waitFor(() => expect(screen.getByText("Bob Jones")).toBeInTheDocument());
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("No Date Student")).not.toBeInTheDocument();
  });

  it("handles smartDb.getAll rejecting by showing an empty state", async () => {
    getAllMock.mockRejectedValue(new Error("db down"));
    render(<RecentAdmissions />);
    await waitFor(() => expect(screen.getByText("No recent admissions.")).toBeInTheDocument());
  });
});
