import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

// useAuth — controls `user`, `role`, `isMockSession`.
const authMock = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  role: "admin" as string,
  isMockSession: true,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user, role: authMock.role, isMockSession: authMock.isMockSession }),
}));

// StudentContext / StaffContext — only `students`/`staff` + their loading flags matter here.
const studentsMock = vi.hoisted(() => ({ students: [] as unknown[], loading: false }));
vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => ({ students: studentsMock.students, loading: studentsMock.loading }),
}));

const staffMock = vi.hoisted(() => ({ staff: [] as unknown[], loading: false }));
vi.mock("@/contexts/StaffContext", () => ({
  useStaff: () => ({ staff: staffMock.staff, loading: staffMock.loading }),
}));

// smartDb — the actual data source for financial/attendance records.
const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

// @/firebase — isFirestoreWorking is mutable here (real app hardcodes it to
// `false`) so we can exercise both the react-query path and the onSnapshot
// live-listener effect path.
const firebaseMock = vi.hoisted(() => ({ isFirestoreWorking: false }));
const handleFirestoreErrorMock = vi.fn();
vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: { LIST: "list" },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firebaseMock.isFirestoreWorking;
  },
}));

// firebase/firestore — collection/query/where/onSnapshot used by the live-listener effect.
const onSnapshotMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __col: path }),
  query: (col: unknown) => col,
  where: () => ({}),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
}));

import { useDashboardStats } from "./useDashboardStats";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function setEntities(overrides: Record<string, unknown[]> = {}) {
  const table: Record<string, unknown[]> = {
    StudentRevenue: [],
    EntityRevenue: [],
    Expense: [],
    Payroll: [],
    Invoice: [],
    attendance: [],
    ...overrides,
  };
  getAllMock.mockImplementation(async (entity: string) => table[entity] ?? []);
}

describe("useDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: "admin-1" };
    authMock.role = "admin";
    authMock.isMockSession = true;
    studentsMock.students = [];
    studentsMock.loading = false;
    staffMock.staff = [];
    staffMock.loading = false;
    firebaseMock.isFirestoreWorking = false;
    onSnapshotMock.mockReturnValue(() => {});
    setEntities();
  });

  it("starts in a loading state and gates the query on role/user", async () => {
    setEntities();
    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });

    // Query is enabled (admin + user present) so it should be loading initially.
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAllMock).toHaveBeenCalledWith("StudentRevenue");
    expect(getAllMock).toHaveBeenCalledWith("attendance");
  });

  it("does not fetch and reports loading:false when role is not admin/staff", async () => {
    authMock.role = "student";
    setEntities();
    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });

    await waitFor(() => {
      // Nothing to await really since query never runs; just assert stable state.
      expect(result.current.totalStudents).toBe(0);
    });
    expect(result.current.loading).toBe(false);
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("does not fetch when there is no user", async () => {
    authMock.user = null;
    setEntities();
    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("sums student + entity revenue and expenses/payroll for the current month only", async () => {
    const now = new Date();
    const thisMonthISO = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();
    const lastMonthISO = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString();

    setEntities({
      StudentRevenue: [
        { id: "sr1", amount: 100, date: thisMonthISO, uid: "x" },
        { id: "sr2", amount: 999, date: lastMonthISO, uid: "x" }, // excluded: last month
      ],
      EntityRevenue: [
        { id: "er1", amount: 50, date: thisMonthISO, uid: "x" },
      ],
      Expense: [
        { id: "e1", amount: 30, date: thisMonthISO, uid: "x" },
      ],
      Payroll: [
        // net takes priority over netSalary/amount
        { id: "p1", net: 20, netSalary: 999, amount: 999, date: thisMonthISO, uid: "x" },
      ],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueThisMonth).toBe(150); // 100 + 50
    expect(result.current.expensesThisMonth).toBe(50); // 30 + 20
    expect(result.current.netProfitThisMonth).toBe(100); // 150 - 50
  });

  it("falls back to createdAt when a revenue record has no explicit date", async () => {
    const now = new Date();
    const thisMonthISO = new Date(now.getFullYear(), now.getMonth(), 5).toISOString();
    setEntities({
      StudentRevenue: [{ id: "sr1", amount: 75, createdAt: thisMonthISO, uid: "x" }],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueThisMonth).toBe(75);
  });

  it("computes collectionRate from this month's paid vs total invoice amounts", async () => {
    const now = new Date();
    const thisMonthISO = new Date(now.getFullYear(), now.getMonth(), 5).toISOString();
    setEntities({
      Invoice: [
        { id: "i1", amount: 100, status: "Paid", date: thisMonthISO, uid: "x" },
        { id: "i2", amount: 300, status: "Pending", date: thisMonthISO, uid: "x" },
      ],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // paid=100, total=400 -> 25%
    expect(result.current.collectionRate).toBe(25);
  });

  it("reports collectionRate 0 when there are no invoices this month", async () => {
    setEntities({ Invoice: [] });
    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.collectionRate).toBe(0);
  });

  it("computes pendingFees from Pending/Unpaid/Partial/Overdue invoices regardless of month, using dueAmount fallback to amount", async () => {
    const oldDate = "2020-01-01T00:00:00.000Z";
    setEntities({
      Invoice: [
        { id: "i1", amount: 500, dueAmount: 200, status: "Pending", date: oldDate, uid: "x" },
        { id: "i2", amount: 150, status: "Unpaid", date: oldDate, uid: "x" }, // no dueAmount -> falls back to amount
        { id: "i3", amount: 999, status: "Paid", date: oldDate, uid: "x" }, // excluded: paid
      ],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingFees).toBe(350); // 200 + 150
  });

  it("counts an invoice as overdue when unpaid/partial and past its due date, even without literal 'Overdue' status", async () => {
    const pastDue = "2020-01-01T00:00:00.000Z";
    const futureDue = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    setEntities({
      Invoice: [
        { id: "i1", amount: 10, status: "Unpaid", dueDate: pastDue, uid: "x" }, // overdue: past due + unpaid
        { id: "i2", amount: 10, status: "Partial", dueDate: futureDue, uid: "x" }, // not overdue: due date in future
        { id: "i3", amount: 10, status: "Overdue", uid: "x" }, // overdue: literal status, no dueDate needed
        { id: "i4", amount: 10, status: "Paid", dueDate: pastDue, uid: "x" }, // not overdue: paid
      ],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.overdueInvoicesCount).toBe(2);
  });

  it("computes avgAttendance from the latest dated student attendance rows only", async () => {
    setEntities({
      attendance: [
        // older date - should be ignored in favor of the latest
        { date: "2026-01-01", entityType: "student", status: "Present" },
        { date: "2026-01-01", entityType: "student", status: "Absent" },
        // latest date: 2 present out of 3 -> 66.7%
        { date: "2026-01-02", entityType: "student", status: "Present" },
        { date: "2026-01-02", entityType: "student", status: "Present" },
        { date: "2026-01-02", entityType: "student", status: "Absent" },
        // non-student rows must be excluded entirely
        { date: "2026-01-02", entityType: "staff", status: "Present" },
      ],
    });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.avgAttendance).toBe(66.7);
  });

  it("reports avgAttendance 0 when there are no student attendance rows", async () => {
    setEntities({ attendance: [{ date: "2026-01-02", entityType: "staff", status: "Present" }] });
    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.avgAttendance).toBe(0);
  });

  it("passes through totalStudents/totalStaff from the Student/Staff contexts", async () => {
    studentsMock.students = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
    staffMock.staff = [{ id: "t1" }];
    setEntities();

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totalStudents).toBe(3);
    expect(result.current.totalStaff).toBe(1);
  });

  it("stays in loading state while StudentContext or StaffContext are still loading", async () => {
    studentsMock.loading = true;
    setEntities();

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());

    // Query itself resolves, but overall loading stays true because students context is loading.
    await waitFor(() => expect(result.current.loading).toBe(true));
  });

  it("subscribes to live Firestore listeners when isFirestoreWorking is true and not a mock session", async () => {
    firebaseMock.isFirestoreWorking = true;
    authMock.isMockSession = false;
    setEntities();

    renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    // One listener per collection: StudentRevenue, EntityRevenue, Expense, Payroll, Invoice.
    expect(onSnapshotMock).toHaveBeenCalledTimes(5);
  });

  it("does not subscribe to live listeners for a mock session even if isFirestoreWorking is true", async () => {
    firebaseMock.isFirestoreWorking = true;
    authMock.isMockSession = true;
    setEntities();

    const { result } = renderHook(() => useDashboardStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
  });
});
