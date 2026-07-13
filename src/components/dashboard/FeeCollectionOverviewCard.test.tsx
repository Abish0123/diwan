import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeeCollectionOverviewCard } from "./FeeCollectionOverviewCard";
import { FeeOverview } from "@/hooks/useDashboardOverview";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const DATA: FeeOverview = { totalFees: 10000, collected: 7500, pending: 2500, collectedPct: 75 };

describe("FeeCollectionOverviewCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading skeleton", () => {
    render(<MemoryRouter><FeeCollectionOverviewCard data={{ totalFees: 0, collected: 0, pending: 0, collectedPct: 0 }} currency="QAR" loading /></MemoryRouter>);
    expect(screen.getByText("Fee Collection Overview")).toBeInTheDocument();
  });

  it("shows an empty state when no invoices exist", () => {
    render(<MemoryRouter><FeeCollectionOverviewCard data={{ totalFees: 0, collected: 0, pending: 0, collectedPct: 0 }} currency="QAR" /></MemoryRouter>);
    expect(screen.getByText("No invoices generated yet.")).toBeInTheDocument();
  });

  it("renders total fees, collected percentage, and pending amount", () => {
    render(<MemoryRouter><FeeCollectionOverviewCard data={DATA} currency="QAR" /></MemoryRouter>);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Total Fees")).toBeInTheDocument();
    expect(screen.getByText("QAR 10,000")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("QAR 2,500")).toBeInTheDocument();
  });

  it("navigates to /finance/fees when This Month is clicked", () => {
    render(<MemoryRouter><FeeCollectionOverviewCard data={DATA} currency="QAR" /></MemoryRouter>);
    screen.getByText("This Month").click();
    expect(navigateMock).toHaveBeenCalledWith("/finance/fees");
  });
});
