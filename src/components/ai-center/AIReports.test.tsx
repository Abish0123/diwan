import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIReports } from "./AIReports";

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

let tables: Record<string, unknown[]>;
function setupTables(overrides: Record<string, unknown[]> = {}) {
  tables = {
    students: [],
    ExamMark: [],
    ...overrides,
  };
  mockGetAll.mockImplementation(async (table: string) => tables[table] ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupTables();
});

describe("AIReports", () => {
  it("shows loading, then the empty state when there are no exam marks", async () => {
    render(<AIReports onBack={vi.fn()} />);
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryAllByText("Loading…").length).toBe(0));
    expect(screen.getByText("No exam marks on file yet — this summary will populate once marks are entered.")).toBeInTheDocument();
    expect(screen.getByText("Not enough exam data yet to generate insights.")).toBeInTheDocument();
    expect(screen.getByText("No reports generated yet. Reports you export will appear here.")).toBeInTheDocument();
    // Export button disabled with no data.
    expect(screen.getByText("Export CSV").closest("button")).toBeDisabled();
  });

  it("computes real per-grade averages and an executive summary from ExamMark rows", async () => {
    setupTables({
      students: [
        { id: "s1", grade: "Grade 6", attendance: 90 },
        { id: "s2", grade: "Grade 7", attendance: 80 },
      ],
      ExamMark: [
        { id: "exam1", Math: { s1: 90, s2: 60 } },
        { id: "exam2", Math: { s1: 95, s2: 55 } },
      ],
    });
    render(<AIReports onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    expect(screen.getByText(/Current overall average score across all graded exams/)).toBeInTheDocument();
    expect(screen.getByText(/Average attendance across the student roster is/)).toBeInTheDocument();
    expect(screen.getByText("Export CSV").closest("button")).not.toBeDisabled();
  });

  it("switches between report type tabs", async () => {
    const user = userEvent.setup();
    render(<AIReports onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    await user.click(screen.getByText("Finance Summary"));
    await user.click(screen.getByText("HR & Staffing"));
    await user.click(screen.getByText("Custom Reports"));
    // Tab switching only changes local state used for the sidebar highlight;
    // clicking should not throw and each label should remain present.
    expect(screen.getByText("Custom Reports")).toBeInTheDocument();
  });

  it("logs an error when smartDb.getAll rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error("boom"));
    render(<AIReports onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(consoleError).toHaveBeenCalledWith("Error loading AI report data:", expect.any(Error));
    consoleError.mockRestore();
  });
});
