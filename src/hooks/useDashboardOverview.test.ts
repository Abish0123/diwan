import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { cumulativeCountTrend, useDashboardOverview } from "./useDashboardOverview";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseStudents = vi.fn();
vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => mockUseStudents(),
}));

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

// In-memory table data keyed by entity name, returned by smartDb.getAll.
let tables: Record<string, unknown[]>;

function setupTables(overrides: Record<string, unknown[]> = {}) {
  tables = {
    attendance: [],
    Invoice: [],
    Branch: [],
    leave_requests: [],
    PurchaseOrder: [],
    leads: [],
    ExamMark: [],
    subject_assignments: [],
    audit_logs: [],
    StudentRevenue: [],
    ...overrides,
  };
  mockGetAll.mockImplementation(async (table: string) => tables[table] ?? []);
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: "u1" }, isMockSession: false });
  mockUseStudents.mockReturnValue({ students: [] });
  setupTables();
});

describe("cumulativeCountTrend", () => {
  it("returns [currentTotal] when no records have createdAt", () => {
    expect(cumulativeCountTrend([{}, {}], 5)).toEqual([5]);
  });

  it("builds a cumulative running count per distinct date, capped at last 7", () => {
    const records = [
      { createdAt: "2026-01-01" },
      { createdAt: "2026-01-01" },
      { createdAt: "2026-01-02" },
      { createdAt: "2026-01-03" },
    ];
    // running increments once per dated record (even same-day duplicates),
    // and each date's map entry is overwritten with the running count at the
    // last record seen for that date: 01-01 -> 2 (2nd record), 01-02 -> 3, 01-03 -> 4.
    expect(cumulativeCountTrend(records, 4)).toEqual([2, 3, 4]);
  });

  it("adds uncounted (no-createdAt) rows to every point", () => {
    const records = [
      { createdAt: "2026-01-01" },
      {}, // uncounted
      { createdAt: "2026-01-02" },
    ];
    // dated: 2 distinct dates -> running 1, 2; uncounted = 1 -> [2, 3]
    expect(cumulativeCountTrend(records, 3)).toEqual([2, 3]);
  });

  it("slices to the last 7 points when more distinct dates exist", () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      createdAt: `2026-01-${String(i + 1).padStart(2, "0")}`,
    }));
    const result = cumulativeCountTrend(records, 10);
    expect(result).toHaveLength(7);
    expect(result).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("useDashboardOverview", () => {
  it("starts in a loading state while user is present but query is pending", () => {
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it("does not fetch (query disabled) when there is no authenticated user", async () => {
    mockUseAuth.mockReturnValue({ user: null, isMockSession: false });
    renderHook(() => useDashboardOverview(), { wrapper });
    // allow any microtasks to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("computes attendance breakdown for the latest marked date only", async () => {
    setupTables({
      attendance: [
        { date: "2026-07-10", entityType: "student", status: "Present" },
        { date: "2026-07-10", entityType: "student", status: "Absent" },
        { date: "2026-07-11", entityType: "student", status: "Present" },
        { date: "2026-07-11", entityType: "student", status: "Present" },
        { date: "2026-07-11", entityType: "student", status: "Late" },
        { date: "2026-07-11", entityType: "staff", status: "Present" }, // not a student row
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.attendanceBreakdown).toEqual({
      present: 2,
      absent: 0,
      late: 1,
      total: 3,
      presentPct: 66.7,
      date: "2026-07-11",
    });
  });

  it("returns an empty attendance breakdown when there are no student attendance rows", async () => {
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attendanceBreakdown).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      total: 0,
      presentPct: 0,
      date: null,
    });
  });

  it("computes fee overview from invoice amount/status/dueAmount", async () => {
    setupTables({
      Invoice: [
        { amount: 1000, status: "Paid" },
        { amount: 500, status: "Pending", dueAmount: 300 },
        { amount: 200, status: "Overdue" }, // no dueAmount -> falls back to amount
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.feeOverview).toEqual({
      totalFees: 1700,
      collected: 1000,
      pending: 500, // 300 + 200
      collectedPct: 58.8,
    });
  });

  it("returns zero collectedPct when there are no invoices", async () => {
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.feeOverview).toEqual({
      totalFees: 0,
      collected: 0,
      pending: 0,
      collectedPct: 0,
    });
  });

  it("groups grade strength by canonical grade, sorted numerically, with Unassigned bucketed", async () => {
    mockUseStudents.mockReturnValue({
      students: [
        { id: "1", grade: "Grade 1" },
        { id: "2", grade: "1" },
        { id: "3", grade: "Grade 10" },
        { id: "4", grade: "" },
        { id: "5", grade: "Pre-KG" },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // "Grade 1" and "1" canonicalize to the same key -> combined count of 2
    expect(result.current.gradeStrength).toEqual([
      { grade: "Grade 1", students: 2 },
      { grade: "Grade 10", students: 1 },
      { grade: "Pre-KG", students: 1 },
      { grade: "Unassigned", students: 1 },
    ]);
  });

  it("falls back to a single Main Campus slice when no student is linked to any branch", async () => {
    setupTables({
      Branch: [{ id: "b1", name: "North Campus" }],
    });
    mockUseStudents.mockReturnValue({
      students: [{ id: "1", branchId: "unrelated-branch" }, { id: "2" }],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.campusBreakdown).toEqual([
      { name: "Main Campus", students: 2, color: "#9810fa" },
    ]);
  });

  it("splits students per branch when at least one student is linked", async () => {
    setupTables({
      Branch: [{ id: "b1", name: "North Campus" }, { id: "b2", name: "South Campus" }],
    });
    mockUseStudents.mockReturnValue({
      students: [{ id: "1", branchId: "b1" }, { id: "2", branchId: "b1" }, { id: "3", branchId: "b2" }],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.campusBreakdown).toEqual([
      { name: "North Campus", students: 2, color: "#9810fa" },
      { name: "South Campus", students: 1, color: "#3b82f6" },
    ]);
  });

  it("builds pending tasks from leave/purchase-order/lead queues, capped at 6 total", async () => {
    setupTables({
      leave_requests: [
        { id: "l1", status: "Pending", staffName: "Alice" },
        { id: "l2", status: "Approved", staffName: "Bob" },
      ],
      PurchaseOrder: [{ id: "p1", status: "Pending Approval", poNumber: "PO-1" }],
      leads: [
        { id: "e1", status: "Enquiry", studentName: "Kid A" },
        { id: "e2", status: "Form Submitted", studentName: "Kid B" },
        { id: "e3", status: "Enrolled", studentName: "Kid C" }, // not counted
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks).toEqual([
      { id: "leave-l1", label: "Approve leave request — Alice", category: "Administration", url: "/hr/leave" },
      { id: "po-p1", label: "Approve purchase order — PO-1", category: "Finance", url: "/finance/purchase-approvals" },
      { id: "lead-e1", label: "Review admission lead — Kid A", category: "Admissions", url: "/admissions" },
      { id: "lead-e2", label: "Review admission lead — Kid B", category: "Admissions", url: "/admissions" },
    ]);
    expect(result.current.pendingTasksCount).toBe(4); // 1 leave + 1 po + 2 leads
  });

  it("computes admissions funnel as cumulative counts reaching each stage", async () => {
    setupTables({
      leads: [
        { id: "1", status: "Enquiry" },
        { id: "2", status: "Form Submitted" },
        { id: "3", status: "Doc Verification" },
        { id: "4", status: "Enrolled" },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.admissionsFunnel).toEqual([
      { label: "Inquiries", count: 4 }, // all 4 reached >= Enquiry
      { label: "New Leads", count: 3 }, // Form Submitted, Doc Verification, Enrolled
      { label: "Applications", count: 3 }, // >= Form Submitted
      { label: "Offers", count: 2 }, // >= Doc Verification
      { label: "Enrolled", count: 1 }, // >= Enrolled
    ]);
  });

  it("computes top classes by average exam score, joined against student grade/section", async () => {
    mockUseStudents.mockReturnValue({
      students: [
        { id: "s1", grade: "Grade 1", section: "A" },
        { id: "s2", grade: "Grade 1", section: "A" },
        { id: "s3", grade: "Grade 2", section: "B" },
      ],
    });
    setupTables({
      ExamMark: [
        { id: "exam1", math: { s1: 80, s2: 90, s3: 50 } },
        { id: "exam2", math: { s1: "70" } },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.topClasses).toEqual([
      { className: "Grade 1 - A", avgScore: 80, studentCount: 2 }, // (80+90+70)/3 = 80
      { className: "Grade 2 - B", avgScore: 50, studentCount: 1 },
    ]);
  });

  it("excludes marks for unknown students from top classes", async () => {
    mockUseStudents.mockReturnValue({ students: [] });
    setupTables({
      ExamMark: [{ id: "exam1", math: { "no-such-student": 99 } }],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.topClasses).toEqual([]);
  });

  it("buckets teacher workload into full/medium/low by subject_assignments count", async () => {
    setupTables({
      subject_assignments: [
        // teacher A: 5 assignments -> full
        ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, teacherEmail: "a@x.com" })),
        // teacher B: 3 assignments -> medium
        ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, teacherEmail: "b@x.com" })),
        // teacher C: 1 assignment -> low
        { id: "c1", teacherEmail: "c@x.com" },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.teacherWorkload.full).toBe(1);
    expect(result.current.teacherWorkload.medium).toBe(1);
    expect(result.current.teacherWorkload.low).toBe(1);
    // avg = (5+3+1)/3 = 3, max = 5 -> round(3/5*100) = 60
    expect(result.current.teacherWorkload.avgLoadPct).toBe(60);
  });

  it("returns zeroed teacher workload when there are no subject assignments", async () => {
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teacherWorkload).toEqual({ avgLoadPct: 0, full: 0, medium: 0, low: 0 });
  });

  it("classifies recent activity by keyword and sorts most-recent first, capped at 5", async () => {
    setupTables({
      audit_logs: [
        { id: "1", user: "Alice", action: "Deleted a record", entity: "Student", at: "2026-07-10T10:00:00Z" },
        { id: "2", user: "Bob", action: "Updated permission", entity: "Role", at: "2026-07-12T10:00:00Z" },
        { id: "3", user: "Carol", action: "Viewed report", entity: "Report", at: "2026-07-11T10:00:00Z" },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const activities = result.current.recentActivities;
    expect(activities).toHaveLength(3);
    // sorted descending by raw `at` before relTime conversion: Bob(07-12), Carol(07-11), Alice(07-10)
    expect(activities.map((a) => a.user)).toEqual(["Bob", "Carol", "Alice"]);
    expect(activities.find((a) => a.user === "Bob")?.type).toBe("security"); // "permission"
    expect(activities.find((a) => a.user === "Alice")?.type).toBe("warning"); // "delete"
    expect(activities.find((a) => a.user === "Carol")?.type).toBe("info");
  });

  it("builds approval chips from pending leave/PO/admissions and approved-leave counts", async () => {
    setupTables({
      leave_requests: [
        { id: "1", status: "Pending" },
        { id: "2", status: "Approved" },
        { id: "3", status: "Approved" },
      ],
      PurchaseOrder: [{ id: "p1", status: "Pending Approval" }, { id: "p2", status: "Approved" }],
      leads: [{ id: "l1", status: "Enquiry" }],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.approvalChips).toEqual([
      { label: "Pending Leave", count: 1, tone: "pending" },
      { label: "Pending Purchase Orders", count: 1, tone: "pending" },
      { label: "Admission Reviews", count: 1, tone: "info" },
      { label: "Approved Leave (30d)", count: 2, tone: "verified" },
    ]);
  });

  it("computes attendanceTrend and feeTrend as per-day series, most recent last, capped at 7", async () => {
    setupTables({
      attendance: [
        { date: "2026-07-10", entityType: "student", status: "Present" },
        { date: "2026-07-10", entityType: "student", status: "Absent" },
        { date: "2026-07-11", entityType: "student", status: "Present" },
      ],
      StudentRevenue: [
        { date: "2026-07-10", amount: 100 },
        { date: "2026-07-10", amount: 50 },
        { date: "2026-07-11", amount: 200 },
      ],
    });
    const { result } = renderHook(() => useDashboardOverview(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.attendanceTrend).toEqual([50, 100]); // 07-10: 1/2=50%, 07-11: 1/1=100%
    expect(result.current.feeTrend).toEqual([150, 200]);
  });
});
