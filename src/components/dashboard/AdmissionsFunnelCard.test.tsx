import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdmissionsFunnelCard } from "./AdmissionsFunnelCard";
import { FunnelStage } from "@/hooks/useDashboardOverview";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const DATA: FunnelStage[] = [
  { label: "Leads", count: 100 },
  { label: "Applied", count: 60 },
  { label: "Verified", count: 40 },
  { label: "Offered", count: 20 },
  { label: "Enrolled", count: 10 },
];

describe("AdmissionsFunnelCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("shows a loading state", () => {
    render(<MemoryRouter><AdmissionsFunnelCard data={[]} loading /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when every stage has zero count", () => {
    const empty = DATA.map((d) => ({ ...d, count: 0 }));
    render(<MemoryRouter><AdmissionsFunnelCard data={empty} /></MemoryRouter>);
    expect(screen.getByText("No admission leads yet.")).toBeInTheDocument();
  });

  it("renders every funnel stage label and count", () => {
    render(<MemoryRouter><AdmissionsFunnelCard data={DATA} /></MemoryRouter>);
    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("navigates to /admissions when the view-pipeline link is clicked", () => {
    render(<MemoryRouter><AdmissionsFunnelCard data={DATA} /></MemoryRouter>);
    fireEvent.click(screen.getByText(/View admission pipeline/i));
    expect(navigateMock).toHaveBeenCalledWith("/admissions");
  });
});
