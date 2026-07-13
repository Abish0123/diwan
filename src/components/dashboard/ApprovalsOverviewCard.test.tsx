import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApprovalsOverviewCard } from "./ApprovalsOverviewCard";
import { ApprovalChip } from "@/hooks/useDashboardOverview";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const DATA: ApprovalChip[] = [
  { label: "Leave Requests", count: 3, tone: "pending" },
  { label: "Purchase Orders", count: 0, tone: "verified" },
  { label: "Admissions", count: 5, tone: "info" },
  { label: "Rejected", count: 2, tone: "rejected" },
];

describe("ApprovalsOverviewCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("shows a loading state", () => {
    render(<MemoryRouter><ApprovalsOverviewCard data={[]} loading /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders each chip's label and count", () => {
    render(<MemoryRouter><ApprovalsOverviewCard data={DATA} /></MemoryRouter>);
    expect(screen.getByText("Leave Requests")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Purchase Orders")).toBeInTheDocument();
    expect(screen.getByText("Admissions")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("navigates to /hr/leave when View All is clicked", () => {
    render(<MemoryRouter><ApprovalsOverviewCard data={DATA} /></MemoryRouter>);
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/hr/leave");
  });

  it("renders an empty list without crashing when data is empty", () => {
    render(<MemoryRouter><ApprovalsOverviewCard data={[]} /></MemoryRouter>);
    expect(screen.getByText("Approvals Overview")).toBeInTheDocument();
  });
});
