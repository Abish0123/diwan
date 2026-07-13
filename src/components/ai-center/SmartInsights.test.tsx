import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartInsights } from "./SmartInsights";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

const mockUseFinancialSettings = vi.fn();
vi.mock("@/hooks/useFinancialSettings", () => ({
  useFinancialSettings: () => mockUseFinancialSettings(),
}));

let tables: Record<string, unknown[]>;
function setupTables(overrides: Record<string, unknown[]> = {}) {
  tables = {
    students: [],
    attendance: [],
    invoices: [],
    ...overrides,
  };
  mockGetAll.mockImplementation(async (table: string) => tables[table] ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFinancialSettings.mockReturnValue({ settings: { currency: "BHD" } });
  setupTables();
});

describe("SmartInsights", () => {
  it("shows the empty state when there is no signal data at all", async () => {
    render(<SmartInsights onBack={vi.fn()} />);
    expect(screen.getByText("Analysing live data…")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(screen.getByText("Not enough data yet for insights")).toBeInTheDocument();
    expect(screen.getByText("No alerts — no data signals yet.")).toBeInTheDocument();
  });

  it("computes an attendance insight from real attendance rows", async () => {
    setupTables({
      attendance: [
        { entityType: "student", entityId: "s1", class: "Grade 5-A", status: "Absent" },
        { entityType: "student", entityId: "s2", class: "Grade 5-A", status: "Absent" },
        { entityType: "student", entityId: "s3", class: "Grade 6-A", status: "Present" },
      ],
    });
    render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(screen.getAllByText("Lowest Attendance: Grade 5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Students Below 75% Attendance/).length).toBeGreaterThan(0);
  });

  it("computes finance insights (collection rate + overdue) from real invoices", async () => {
    setupTables({
      invoices: [
        { status: "Paid", amount: 100 },
        { status: "Overdue", amount: 250 },
      ],
    });
    render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(screen.getAllByText("Fee Collection at 50%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Overdue Invoice").length).toBeGreaterThan(0);
    expect(screen.getByText(/we recommend sending automated payment reminders/)).toBeInTheDocument();
  });

  it("computes an at-risk-students insight from real risk scores", async () => {
    setupTables({
      students: [
        { id: "s1", riskScore: 80 },
        { id: "s2", riskScore: 10 },
      ],
    });
    render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(screen.getAllByText("1 Student At High Risk").length).toBeGreaterThan(0);
  });

  it("filters insights by type when a filter tab is clicked", async () => {
    const user = userEvent.setup();
    setupTables({
      invoices: [{ status: "Overdue", amount: 250 }],
      students: [{ id: "s1", riskScore: 90 }],
    });
    const { container } = render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());

    // Scope assertions to the main insights grid (not the Top Alerts sidebar,
    // which always shows the highest-impact insights regardless of filter).
    const grid = container.querySelector(".grid.grid-cols-1.md\\:grid-cols-2") as HTMLElement;
    expect(within(grid).getByText("1 Overdue Invoice")).toBeInTheDocument();
    expect(within(grid).getByText("1 Student At High Risk")).toBeInTheDocument();

    await user.click(screen.getByText("Academic"));
    const gridAfter = container.querySelector(".grid.grid-cols-1.md\\:grid-cols-2") as HTMLElement;
    expect(within(gridAfter).getByText("1 Student At High Risk")).toBeInTheDocument();
    expect(within(gridAfter).queryByText("1 Overdue Invoice")).not.toBeInTheDocument();

    await user.click(screen.getByText("All Insights"));
    const gridRestored = container.querySelector(".grid.grid-cols-1.md\\:grid-cols-2") as HTMLElement;
    expect(within(gridRestored).getByText("1 Overdue Invoice")).toBeInTheDocument();
  });

  it("falls back to a monitoring message when there is data but nothing urgent", async () => {
    setupTables({
      invoices: [{ status: "Paid", amount: 100 }],
    });
    render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(screen.getByText(/Keep monitoring — no urgent action needed/)).toBeInTheDocument();
  });

  it("logs an error when smartDb.getAll rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error("boom"));
    render(<SmartInsights onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Analysing live data…")).not.toBeInTheDocument());
    expect(consoleError).toHaveBeenCalledWith("Error loading insight data:", expect.any(Error));
    consoleError.mockRestore();
  });
});
