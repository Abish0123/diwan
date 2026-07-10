import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { smartDb } from "@/lib/localDb";

interface FinancialRecord {
  id: string;
  amount?: number;
  dueAmount?: number;
  net?: number;
  netSalary?: number;
  date?: string;
  createdAt?: string;
  dueDate?: string;
  status?: string;
  uid: string;
}

// Real attendance rows are one-per-student-per-day: {entityType, status, date},
// not a pre-aggregated {present, absent, late} count — the real "attendance"
// table has almost none of those legacy count fields (a couple of stray test
// rows only). Reading .present/.absent/.late here always evaluated to 0,
// silently making avgAttendance below report 0%/null forever.
interface AttendanceRecord {
  date?: string;
  entityType?: string;
  status?: string;
}

const DEFAULT_STATS_DATA = {
  studentRevenue: [] as FinancialRecord[],
  entityRevenue: [] as FinancialRecord[],
  expenses: [] as FinancialRecord[],
  payroll: [] as FinancialRecord[],
  invoices: [] as FinancialRecord[],
  attendanceRecords: [] as AttendanceRecord[],
};

export function useDashboardStats() {
  const { user, role, isMockSession } = useAuth();
  const { students, loading: studentsLoading } = useStudents();
  const { staff, loading: staffLoading } = useStaff();
  const queryClient = useQueryClient();
  const queryKey = ["dashboard-stats"];
  const enabled = !!user && (role === 'admin' || role === 'staff');

  // Rendered by ~9 dashboard/KPI components at once (Index, Finance
  // Overview, Fees Management, Executive Insights, several SmartKPI cards)
  // — each used to independently fire 6 parallel smartDb.getAll calls.
  // react-query shares one fetch and one cache entry across all of them.
  const { data = DEFAULT_STATS_DATA, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      // Unscoped — these are school-wide financial/attendance records
      // aggregated for KPIs everyone with dashboard access should see the
      // same numbers for, not private to whichever admin is logged in.
      // Scoping by uid silently under-counted revenue/expenses/payroll/
      // invoices created by any other staff account.
      const [studentRev, entityRev, exp, pay, inv, att] = await Promise.all([
        smartDb.getAll("StudentRevenue"),
        smartDb.getAll("EntityRevenue"),
        smartDb.getAll("Expense"),
        smartDb.getAll("Payroll"),
        smartDb.getAll("Invoice"),
        smartDb.getAll("attendance"),
      ]);
      return {
        studentRevenue: studentRev as FinancialRecord[],
        entityRevenue: entityRev as FinancialRecord[],
        expenses: exp as FinancialRecord[],
        payroll: pay as FinancialRecord[],
        invoices: inv as FinancialRecord[],
        attendanceRecords: att as AttendanceRecord[],
      };
    },
    enabled: enabled && (isMockSession || !isFirestoreWorking),
  });

  const { studentRevenue, entityRevenue, expenses, payroll, invoices, attendanceRecords } = data;
  const loading = enabled ? queryLoading : false;

  useEffect(() => {
    if (!enabled || isMockSession || !isFirestoreWorking || !user) return;

    const collections = [
      "StudentRevenue",
      "EntityRevenue",
      "Expense",
      "Payroll",
      "Invoice"
    ];
    const keyFor: Record<string, keyof typeof DEFAULT_STATS_DATA> = {
      StudentRevenue: "studentRevenue",
      EntityRevenue: "entityRevenue",
      Expense: "expenses",
      Payroll: "payroll",
      Invoice: "invoices",
    };

    const unsubscribes = collections.map(colName => {
      const q = query(collection(db, colName), where("uid", "==", user.uid));
      return onSnapshot(q, (snapshot) => {
        const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FinancialRecord[];
        queryClient.setQueryData(queryKey, (prev: typeof DEFAULT_STATS_DATA = DEFAULT_STATS_DATA) => ({
          ...prev,
          [keyFor[colName]]: rows,
        }));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, colName);
        queryClient.invalidateQueries({ queryKey });
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, isMockSession, enabled]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Falls back to createdAt when a record has no explicit date — matching
    // src/pages/finance/FinanceOverview.tsx's own monthly chart, which already
    // does this fallback. Without it, any student_revenue/entity_revenue row
    // written with only createdAt (no date field) was silently excluded from
    // this KPI's "Total Revenue" while still being counted in that chart,
    // so the two figures could show different totals for the same month.
    const filterThisMonth = (item: FinancialRecord) => {
      const raw = item.date || item.createdAt;
      if (!raw) return false;
      try {
        const date = parseISO(raw);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      } catch {
        return false;
      }
    };

    const thisMonthStudentRev = studentRevenue.filter(filterThisMonth).reduce((sum, r) => sum + (r.amount || 0), 0);
    const thisMonthEntityRev = entityRevenue.filter(filterThisMonth).reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalRevenueThisMonth = thisMonthStudentRev + thisMonthEntityRev;

    const thisMonthExpenses = expenses.filter(filterThisMonth).reduce((sum, r) => sum + (r.amount || 0), 0);
    const thisMonthPayroll = payroll.filter(filterThisMonth).reduce((sum, r) => sum + (r.net || r.netSalary || r.amount || 0), 0);
    const totalExpensesThisMonth = thisMonthExpenses + thisMonthPayroll;

    const totalInvoices = invoices.filter(filterThisMonth).reduce((sum, i) => sum + (i.amount || 0), 0);
    const paidInvoices = invoices.filter(filterThisMonth).filter(i => i.status === "Paid").reduce((sum, i) => sum + (i.amount || 0), 0);
    const collectionRate = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0;

    // "Overdue" is never actually stored as a literal invoice status in this app —
    // an invoice is really overdue when it's still unpaid and its due date has passed.
    // Matching on `status === "Overdue"` alone would silently show 0 forever.
    const isPastDue = (i: FinancialRecord) => !!i.dueDate && new Date(i.dueDate).getTime() < Date.now();
    const pendingFees = invoices
      .filter(i => i.status === "Pending" || i.status === "Unpaid" || i.status === "Partial" || i.status === "Overdue")
      .reduce((sum, i) => sum + (i.dueAmount ?? i.amount ?? 0), 0);
    const overdueInvoicesCount = invoices.filter(i =>
      i.status === "Overdue" || ((i.status === "Unpaid" || i.status === "Partial") && isPastDue(i))
    ).length;

    // Compute student attendance rate from the latest marked day's real
    // per-student status rows ("Present"/"Absent"/"Late"), matching the same
    // definition the Attendance page itself uses (status === "Present").
    let avgAttendance = 0;
    const studentAtt = attendanceRecords.filter((r) => r.date && r.entityType === "student");
    if (studentAtt.length > 0) {
      const datesWithData = [...new Set(studentAtt.map((r) => String(r.date)))];
      const latest = datesWithData.reduce((max, d) => (d > max ? d : max), "");
      const todays = studentAtt.filter((r) => String(r.date) === latest);
      const present = todays.filter((r) => r.status === "Present").length;
      avgAttendance = todays.length > 0 ? Math.round((present / todays.length) * 1000) / 10 : 0;
    }

    return {
      revenueThisMonth: totalRevenueThisMonth,
      expensesThisMonth: totalExpensesThisMonth,
      netProfitThisMonth: totalRevenueThisMonth - totalExpensesThisMonth,
      collectionRate,
      totalStudents: students.length,
      totalStaff: staff.length,
      avgAttendance, // Mean of students' attendance values (real, derived)
      pendingFees,
      overdueInvoicesCount,
      loading: loading || studentsLoading || staffLoading
    };
  }, [studentRevenue, entityRevenue, expenses, payroll, invoices, attendanceRecords, students, staff, loading, studentsLoading, staffLoading]);

  return stats;
}
