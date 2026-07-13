import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Predictions } from "./Predictions";

// ResponsiveContainer relies on ResizeObserver, which jsdom doesn't provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

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
    student_revenue: [],
    entity_revenue: [],
    expenses: [],
    attendance: [],
    ...overrides,
  };
  mockGetAll.mockImplementation(async (table: string) => tables[table] ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFinancialSettings.mockReturnValue({ settings: { currency: "BHD" } });
  setupTables();
});

describe("Predictions", () => {
  it("shows a loading state while data is being fetched", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Predictions onBack={vi.fn()} />);
    expect(screen.getByText("Loading live data…")).toBeInTheDocument();
  });

  it("shows the empty-forecast state when a category has no real records", async () => {
    render(<Predictions onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading live data…")).not.toBeInTheDocument());
    expect(screen.getByText("Not enough data yet for a forecast")).toBeInTheDocument();
    expect(screen.getByText("No revenue records yet — the forecast will populate once fee collections are recorded.")).toBeInTheDocument();
  });

  it("renders a real forecast summary once revenue records exist", async () => {
    const now = new Date();
    setupTables({
      student_revenue: [{ date: now.toISOString(), amount: 1000 }],
    });
    render(<Predictions onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading live data…")).not.toBeInTheDocument());
    expect(screen.getByText("Fee Collection Forecast")).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 month of real revenue records/)).toBeInTheDocument();
  });

  it("switches categories and shows the attendance forecast basis", async () => {
    const user = userEvent.setup();
    const now = new Date();
    setupTables({
      attendance: [{ entityType: "student", date: now.toISOString(), status: "Present" }],
    });
    render(<Predictions onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading live data…")).not.toBeInTheDocument());

    await user.click(screen.getByText("Attendance"));
    expect(screen.getByText("Attendance Forecast")).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 month of real attendance marks/)).toBeInTheDocument();
  });

  it("switches to the expenses category", async () => {
    const user = userEvent.setup();
    render(<Predictions onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading live data…")).not.toBeInTheDocument());

    await user.click(screen.getByText("Expenses"));
    expect(screen.getByText("Expense Forecast")).toBeInTheDocument();
  });

  it("logs an error and stops loading when smartDb.getAll rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error("boom"));
    render(<Predictions onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading live data…")).not.toBeInTheDocument());
    expect(consoleError).toHaveBeenCalledWith("Predictions load failed:", expect.any(Error));
    consoleError.mockRestore();
  });
});
