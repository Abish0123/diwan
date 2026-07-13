import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecentActivitiesCard } from "./RecentActivitiesCard";
import { ActivityRow } from "@/hooks/useDashboardOverview";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const DATA: ActivityRow[] = [
  { id: "1", user: "Admin", action: "Created invoice", target: "INV-001", at: "2h ago", type: "security" },
  { id: "2", user: "Teacher", action: "Marked attendance", target: "", at: "1h ago", type: "warning" },
  { id: "3", user: "System", action: "Backup completed", target: "", at: "just now", type: "info" },
];

describe("RecentActivitiesCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("shows a loading state", () => {
    render(<MemoryRouter><RecentActivitiesCard data={[]} loading /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity", () => {
    render(<MemoryRouter><RecentActivitiesCard data={[]} /></MemoryRouter>);
    expect(screen.getByText("No recent activity recorded yet.")).toBeInTheDocument();
  });

  it("renders action + target combined when target is present", () => {
    render(<MemoryRouter><RecentActivitiesCard data={DATA} /></MemoryRouter>);
    expect(screen.getByText("Created invoice — INV-001")).toBeInTheDocument();
  });

  it("renders action alone when target is empty", () => {
    render(<MemoryRouter><RecentActivitiesCard data={DATA} /></MemoryRouter>);
    expect(screen.getByText("Marked attendance")).toBeInTheDocument();
  });

  it("navigates to /settings/audit when View All is clicked", () => {
    render(<MemoryRouter><RecentActivitiesCard data={DATA} /></MemoryRouter>);
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/settings/audit");
  });
});
