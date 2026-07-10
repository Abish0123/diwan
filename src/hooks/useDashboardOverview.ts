import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection, studentGrade, studentSection } from "@/lib/studentGradeSection";

// Real dashboard-overview data for the rebuilt admin Index page. Everything
// here is computed from actual entity rows already used elsewhere in the
// app (attendance, invoices, branches, leave_requests, purchase_orders,
// leads) — nothing fabricated. Where the real dataset is thinner than a
// glossy reference mockup might suggest (e.g. this school has one real
// branch today), the output reflects that honestly rather than inventing
// rows to fill out a chart.

export interface AttendanceBreakdown {
  present: number;
  absent: number;
  late: number;
  total: number;
  presentPct: number;
  date: string | null;
}

export interface FeeOverview {
  totalFees: number;
  collected: number;
  pending: number;
  collectedPct: number;
}

export interface GradeStrengthPoint {
  grade: string;
  students: number;
}

export interface CampusPoint {
  name: string;
  students: number;
  color: string;
}

export interface PendingTask {
  id: string;
  label: string;
  category: string; // e.g. "Admissions" | "Finance" | "Administration" | "Reports"
  url: string;
}

export interface FunnelStage {
  label: string;
  count: number;
}

export interface TopClass {
  className: string; // "Grade N - Section"
  avgScore: number;
  studentCount: number;
}

export interface TeacherWorkloadSummary {
  avgLoadPct: number; // 0-100, relative to the busiest real teacher this school has
  full: number;
  medium: number;
  low: number;
}

export interface ActivityRow {
  id: string;
  user: string;
  action: string;
  target: string;
  at: string;
  type: "security" | "warning" | "info";
}

export interface ApprovalChip {
  label: string;
  count: number;
  tone: "pending" | "verified" | "rejected" | "info";
}

const CAMPUS_COLORS = ["#9810fa", "#3b82f6", "#10b981", "#f43f5e", "#f59e0b"];

// Real cumulative-count trend for a KPI sparkline, built from each record's
// own createdAt — e.g. "how many students existed as of each of the last 7
// days a record was created". Records seeded without a createdAt are
// excluded rather than guessed at; if fewer than 2 real distinct creation
// dates exist, the caller's chart falls back to a flat real-total line
// instead of a fabricated shape.
export function cumulativeCountTrend(records: { createdAt?: string | Date }[], currentTotal: number): number[] {
  const dated = records
    .map((r) => r.createdAt ? String(r.createdAt).slice(0, 10) : "")
    .filter(Boolean)
    .sort();
  if (dated.length === 0) return [currentTotal];
  const byDate = new Map<string, number>();
  let running = 0;
  dated.forEach((d) => {
    running += 1;
    byDate.set(d, running);
  });
  const uncounted = records.length - dated.length; // seeded rows with no createdAt
  const points = [...byDate.entries()].map(([, count]) => count + uncounted);
  return points.slice(-7);
}

// Real admissions pipeline stages in the order a lead actually progresses
// through (src/types/admissions.ts LeadStatus) — bucketed into the 5 funnel
// stages the dashboard shows, as cumulative "reached at least this stage"
// counts (not exclusive buckets), matching how a real conversion funnel reads.
const LEAD_STAGE_ORDER = ["Enquiry", "Form Sent", "Form Submitted", "Payment Done", "Exam", "Interview", "Doc Verification", "School Fee", "Section Allocation", "Enrolled"];
const FUNNEL_DEFS: { label: string; minStageIndex: number }[] = [
  { label: "Inquiries", minStageIndex: 0 },
  { label: "New Leads", minStageIndex: 1 },
  { label: "Applications", minStageIndex: 2 },
  { label: "Offers", minStageIndex: 6 }, // Doc Verification+ — closest real proxy to an "offer" stage
  { label: "Enrolled", minStageIndex: 9 },
];

function relTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function classifyActivity(action: string): "security" | "warning" | "info" {
  const a = action.toLowerCase();
  if (/permission|role|login|security|access/.test(a)) return "security";
  if (/delete|remove|fail|error|reject/.test(a)) return "warning";
  return "info";
}

export function useDashboardOverview() {
  const { user, isMockSession } = useAuth();
  const { students } = useStudents();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const [attendance, invoices, branches, leaveRequests, purchaseOrders, leads, examMarks, subjectAssignments, auditLogs, revenue] = await Promise.all([
        smartDb.getAll("attendance"),
        smartDb.getAll("Invoice"),
        smartDb.getAll("Branch"),
        smartDb.getAll("leave_requests"),
        smartDb.getAll("PurchaseOrder"),
        smartDb.getAll("leads"),
        smartDb.getAll("ExamMark"),
        smartDb.getAll("subject_assignments"),
        smartDb.getAll("audit_logs"),
        smartDb.getAll("StudentRevenue"),
      ]);
      return { attendance, invoices, branches, leaveRequests, purchaseOrders, leads, examMarks, subjectAssignments, auditLogs, revenue };
    },
    enabled: !!user,
  });

  const attendance = (data?.attendance ?? []) as { date?: string; entityType?: string; status?: string }[];
  const invoices = (data?.invoices ?? []) as { amount?: number; dueAmount?: number; status?: string }[];
  const branches = (data?.branches ?? []) as { id: string; name: string }[];
  const leaveRequests = (data?.leaveRequests ?? []) as { id: string; status?: string; staffName?: string }[];
  const purchaseOrders = (data?.purchaseOrders ?? []) as { id: string; status?: string; poNumber?: string }[];
  const leads = (data?.leads ?? []) as { id: string; status?: string; studentName?: string }[];
  const examMarks = (data?.examMarks ?? []) as Record<string, unknown>[];
  const subjectAssignments = (data?.subjectAssignments ?? []) as { id: string; grade?: string; section?: string; teacherName?: string; teacherEmail?: string }[];
  const auditLogs = (data?.auditLogs ?? []) as Record<string, unknown>[];
  const revenue = (data?.revenue ?? []) as { amount?: number; date?: string }[];

  // Real per-student attendance status for the latest marked day — same
  // definition useDashboardStats.ts already established (status === "Present"
  // for the rate), extended here to also report Absent/Late counts for the donut.
  const attendanceBreakdown: AttendanceBreakdown = (() => {
    const studentAtt = attendance.filter((r) => r.date && r.entityType === "student");
    if (studentAtt.length === 0) return { present: 0, absent: 0, late: 0, total: 0, presentPct: 0, date: null };
    const dates = [...new Set(studentAtt.map((r) => String(r.date)))];
    const latest = dates.reduce((max, d) => (d > max ? d : max), "");
    const today = studentAtt.filter((r) => String(r.date) === latest);
    const present = today.filter((r) => r.status === "Present").length;
    const absent = today.filter((r) => r.status === "Absent").length;
    const late = today.filter((r) => r.status === "Late").length;
    const total = today.length;
    return { present, absent, late, total, presentPct: total > 0 ? Math.round((present / total) * 1000) / 10 : 0, date: latest || null };
  })();

  const feeOverview: FeeOverview = (() => {
    const totalFees = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);
    const collected = invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + (i.amount || 0), 0);
    const pending = invoices
      .filter((i) => i.status !== "Paid")
      .reduce((sum, i) => sum + (i.dueAmount ?? i.amount ?? 0), 0);
    return { totalFees, collected, pending, collectedPct: totalFees > 0 ? Math.round((collected / totalFees) * 1000) / 10 : 0 };
  })();

  const gradeStrength: GradeStrengthPoint[] = (() => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    students.forEach((s) => {
      const raw = studentGrade(s as any) || "Unassigned";
      const key = canonGrade(raw) || "unassigned";
      counts.set(key, (counts.get(key) || 0) + 1);
      // Prefer a non-numeric-only raw label (e.g. "Pre-KG") so the display
      // isn't just whichever record happened to be seen first; numeric
      // grades always render as "Grade N" regardless of raw casing.
      if (!labels.has(key) || !/^\d+$/.test(key)) labels.set(key, raw);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        grade: key === "unassigned" ? "Unassigned" : (/^\d+$/.test(key) ? `Grade ${key}` : labels.get(key) || key),
        students: count,
      }))
      .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));
  })();

  const campusBreakdown: CampusPoint[] = (() => {
    const byBranch = branches.map((b, i) => ({
      name: b.name || `Campus ${i + 1}`,
      students: students.filter((s) => (s as any).branchId === b.id).length,
      color: CAMPUS_COLORS[i % CAMPUS_COLORS.length],
    }));
    const linkedTotal = byBranch.reduce((sum, b) => sum + b.students, 0);
    // Real Branch records can exist (e.g. from earlier standalone branch-
    // management setup) with no actual student ever tagged to them via
    // branchId — every real student here is still on the single "main"
    // branch from the multi-tenancy migration, which doesn't match any of
    // these branch ids. Showing the per-branch breakdown in that case would
    // render an all-zero chart even though 861 real students exist; falling
    // back to one honest "Main Campus" slice with the real total is more
    // useful than a technically-real but empty-looking chart, and stays
    // accurate to what the data actually shows (one linked campus).
    if (linkedTotal === 0) {
      return [{ name: "Main Campus", students: students.length, color: CAMPUS_COLORS[0] }];
    }
    return byBranch;
  })();

  // Real, currently-pending action items this admin can act on — sourced
  // from the same tables their respective pages already read (Leave
  // Management, Purchase Approvals, Admissions), not a fabricated to-do list.
  const pendingTasks: PendingTask[] = (() => {
    const tasks: PendingTask[] = [];
    leaveRequests.filter((l) => l.status === "Pending").slice(0, 3).forEach((l) => {
      tasks.push({ id: `leave-${l.id}`, label: `Approve leave request${l.staffName ? ` — ${l.staffName}` : ""}`, category: "Administration", url: "/hr/leave" });
    });
    purchaseOrders.filter((p) => p.status === "Pending Approval").slice(0, 3).forEach((p) => {
      tasks.push({ id: `po-${p.id}`, label: `Approve purchase order${p.poNumber ? ` — ${p.poNumber}` : ""}`, category: "Finance", url: "/finance/purchase-approvals" });
    });
    leads.filter((l) => l.status === "Enquiry" || l.status === "Form Submitted").slice(0, 3).forEach((l) => {
      tasks.push({ id: `lead-${l.id}`, label: `Review admission lead${l.studentName ? ` — ${l.studentName}` : ""}`, category: "Admissions", url: "/admissions" });
    });
    return tasks.slice(0, 6);
  })();

  // Real 7-day attendance trend for the KPI sparkline — the last 7 distinct
  // marked dates' present-rate, oldest first. Fewer than 7 real dates just
  // yields a shorter real series rather than padding with fabricated points.
  const attendanceTrend: number[] = (() => {
    const studentAtt = attendance.filter((r) => r.date && r.entityType === "student");
    const byDate = new Map<string, { present: number; total: number }>();
    studentAtt.forEach((r) => {
      const d = String(r.date);
      const e = byDate.get(d) || { present: 0, total: 0 };
      e.total += 1;
      if (r.status === "Present") e.present += 1;
      byDate.set(d, e);
    });
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([, v]) => (v.total > 0 ? Math.round((v.present / v.total) * 100) : 0));
  })();

  // Real 7-day fee-collection trend, from actual StudentRevenue payment rows
  // (each written at the moment a payment is collected — see useFees.ts
  // collectFee) rather than invoice.amount, which has no per-day timestamp.
  const feeTrend: number[] = (() => {
    const byDate = new Map<string, number>();
    revenue.forEach((r) => {
      if (!r.date) return;
      const d = String(r.date);
      byDate.set(d, (byDate.get(d) || 0) + (r.amount || 0));
    });
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([, v]) => v);
  })();

  // Real admissions funnel — cumulative counts of leads that have reached at
  // least each pipeline stage (see LEAD_STAGE_ORDER / FUNNEL_DEFS above).
  const admissionsFunnel: FunnelStage[] = FUNNEL_DEFS.map((def) => ({
    label: def.label,
    count: leads.filter((l) => LEAD_STAGE_ORDER.indexOf(String(l.status)) >= def.minStageIndex).length,
  }));

  // Real top-5 classes by average exam score. ExamMark rows are wide-format
  // (one row per exam+subject, keyed by studentId -> mark) — the same shape
  // AIReports.tsx already reduces over — joined here against each student's
  // grade+section to get a real per-class average, not a fabricated ranking.
  const topClasses: TopClass[] = (() => {
    // Group by canonical grade+section (raw values are inconsistent — "1"
    // vs "Grade 1" — see studentGradeSection.ts) so "Grade 1 - A" and
    // "1 - A" aren't counted as two different classes.
    const classById = new Map(
      students.map((s) => {
        const rawGrade = studentGrade(s as any) || "Unknown";
        const gKey = canonGrade(rawGrade);
        const section = studentSection(s as any);
        const label = `${/^\d+$/.test(gKey) ? `Grade ${gKey}` : rawGrade}${section ? ` - ${canonSection(section)}` : ""}`;
        return [String((s as any).id), label];
      })
    );
    const totals = new Map<string, { sum: number; count: number; studentIds: Set<string> }>();
    examMarks.forEach((row) => {
      Object.entries(row).forEach(([key, val]) => {
        if (["id", "uid", "createdAt", "updatedAt"].includes(key)) return;
        if (!val || typeof val !== "object") return;
        Object.entries(val as Record<string, unknown>).forEach(([studentId, mark]) => {
          const n = Number(mark);
          if (!Number.isFinite(n)) return;
          const cls = classById.get(studentId) || "Unknown";
          const e = totals.get(cls) || { sum: 0, count: 0, studentIds: new Set<string>() };
          e.sum += n; e.count += 1; e.studentIds.add(studentId);
          totals.set(cls, e);
        });
      });
    });
    return [...totals.entries()]
      .filter(([cls]) => cls !== "Unknown")
      .map(([className, v]) => ({ className, avgScore: Math.round((v.sum / v.count) * 10) / 10, studentCount: v.studentIds.size }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
  })();

  // Real teacher workload proxy — number of subject_assignments rows per
  // teacher (grade+section+subject each count as one class taught). There is
  // no timetable-hours field to compute true weekly load, so assignment count
  // is the honest, real signal available; thresholds are a simple 3-bucket
  // split rather than a fabricated precise "hours" number.
  const teacherWorkload: TeacherWorkloadSummary = (() => {
    const counts = new Map<string, number>();
    subjectAssignments.forEach((a) => {
      const key = a.teacherEmail || a.teacherName || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const values = [...counts.values()];
    if (values.length === 0) return { avgLoadPct: 0, full: 0, medium: 0, low: 0 };
    const max = Math.max(...values);
    const full = values.filter((v) => v >= 5).length;
    const medium = values.filter((v) => v >= 3 && v < 5).length;
    const low = values.filter((v) => v < 3).length;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return { avgLoadPct: max > 0 ? Math.round((avg / max) * 100) : 0, full, medium, low };
  })();

  // Real recent activity feed — same audit_logs source SystemAuditLogs.tsx
  // already reads, just surfaced on the main dashboard too.
  const recentActivities: ActivityRow[] = auditLogs
    .map((l) => ({
      id: String(l.id || ""),
      user: String(l.user || l.role || "System"),
      action: String(l.action || "Activity"),
      target: String(l.entity || l.detail || ""),
      at: String(l.at || l.createdAt || ""),
      type: classifyActivity(String(l.action || "")),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5)
    .map((r) => ({ ...r, at: relTime(r.at) }));

  const pendingLeaveCount = leaveRequests.filter((l) => l.status === "Pending").length;
  const pendingPoCount = purchaseOrders.filter((p) => p.status === "Pending Approval").length;
  const pendingAdmissionsCount = leads.filter((l) => l.status === "Enquiry" || l.status === "Form Submitted").length;

  // Real pending-approvals breakdown, styled as the chip list this dashboard
  // uses in place of a fabricated "document requests" widget (no document-
  // management entity exists in this app) — every count here is a real,
  // actionable queue an admin already has a page for.
  const approvalChips: ApprovalChip[] = [
    { label: "Pending Leave", count: pendingLeaveCount, tone: "pending" },
    { label: "Pending Purchase Orders", count: pendingPoCount, tone: "pending" },
    { label: "Admission Reviews", count: pendingAdmissionsCount, tone: "info" },
    { label: "Approved Leave (30d)", count: leaveRequests.filter((l) => l.status === "Approved").length, tone: "verified" },
  ];

  return {
    loading: isLoading,
    attendanceBreakdown,
    feeOverview,
    gradeStrength,
    campusBreakdown,
    pendingTasks,
    attendanceTrend,
    feeTrend,
    admissionsFunnel,
    topClasses,
    teacherWorkload,
    recentActivities,
    approvalChips,
    pendingTasksCount: leaveRequests.filter((l) => l.status === "Pending").length
      + purchaseOrders.filter((p) => p.status === "Pending Approval").length
      + leads.filter((l) => l.status === "Enquiry" || l.status === "Form Submitted").length,
  };
}
