// ── Grounded ERP queries for the Student Diwan Assistant ────────────────────
// The assistant's plain Q&A goes straight to Gemini with no real data behind
// it (see geminiService.ts). This module is the "tool call" layer: each
// function here fetches actual ERP numbers so these specific queries are
// never hallucinated. Phase 2: Principal Daily Brief, attendance-below-X%,
// and low-performer lists. Deliberately no finance/payroll queries — the
// Copilot never accesses fees, invoices, payroll, or bank data (see
// aiPlaybook.ts's SYSTEM_PROMPT "You cannot" list).
import { smartDb } from "@/lib/localDb";
import { loadGradebookSources, computeStudentGradebook } from "@/lib/gradebookEngine";
import { getBandForGrade, getCurriculum } from "@/lib/curriculumConfig";
import { loadCurriculumId } from "@/hooks/useCurriculum";

// ── shared real attendance/invoice/exam shapes ──────────────────────────────

// Real attendance rows are one-per-student-per-day: {entityType, status,
// class, date} — not a pre-aggregated {present, absent, late} count. A prior
// version of this file (and useDashboardStats.ts) read count fields that are
// almost never actually present on real rows, silently reporting 0%/null.
interface AttendanceRecord { date?: string; entityType?: string; entityId?: string; status?: string; class?: string; name?: string; time?: string; role?: string }
interface StaffRecord { status?: string }
interface LeaveRequestRecord { status?: string }
interface ExamGradePlan { grade?: string; startDate?: string }
interface ExamRecord { name?: string; grade?: string; startDate?: string; status?: string; gradePlans?: ExamGradePlan[] }
interface TransportIncident { status?: string }
interface StudentRecord { id: string; name: string; grade?: string; section?: string }

function getExamGradePlans(exam: ExamRecord): ExamGradePlan[] {
  if (Array.isArray(exam.gradePlans) && exam.gradePlans.length > 0) return exam.gradePlans;
  return [{ grade: exam.grade, startDate: exam.startDate }];
}

/** The most recent date that has any real student attendance rows. */
function latestMarkedDate(records: AttendanceRecord[]): string | null {
  const dates = records.filter(r => r.date && r.entityType === "student").map(r => String(r.date));
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max), "");
}

// ── 1. Principal / Admin Daily Brief ────────────────────────────────────────

export interface DailyBriefData {
  studentAttendancePct: number | null;
  presentStaff: number;
  totalStaff: number;
  staffAttendancePct: number | null;
  pendingLeaveRequests: number;
  upcomingExams: { name: string; grade: string; date: string }[];
  openTransportIncidents: number;
  generatedAt: string;
}

const DAILY_BRIEF_PATTERN =
  /what.?s?\s*(needs?|need)\s*my\s*attention|daily\s*brief|today.?s?\s*(summary|overview|brief)|morning\s*brief|attention\s*today/i;

export function isDailyBriefIntent(text: string): boolean {
  return DAILY_BRIEF_PATTERN.test(text.trim());
}

export async function fetchDailyBrief(): Promise<DailyBriefData> {
  const [attendanceRecords, staff, leaveRequests, exams, incidents] = await Promise.all([
    smartDb.getAll("attendance").catch(() => []) as Promise<AttendanceRecord[]>,
    smartDb.getAll("Staff").catch(() => []) as Promise<StaffRecord[]>,
    smartDb.getAll("LeaveRequest").catch(() => []) as Promise<LeaveRequestRecord[]>,
    smartDb.getAll("Exam").catch(() => []) as Promise<ExamRecord[]>,
    fetch("/api/transport/incidents").then(r => r.json()).catch(() => []) as Promise<TransportIncident[]>,
  ]);

  const totalStaff = staff.length;
  const presentStaff = totalStaff - staff.filter(s => (s.status || "") !== "Active").length;
  const staffAttendancePct = totalStaff > 0 ? Math.round((presentStaff / totalStaff) * 100) : null;

  const pendingLeaveRequests = leaveRequests.filter(l => (l.status || "").toLowerCase() === "pending").length;

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingExams: DailyBriefData["upcomingExams"] = [];
  exams.forEach(exam => {
    if (exam.status === "Completed" || exam.status === "Published") return;
    getExamGradePlans(exam).forEach(plan => {
      if (!plan.startDate) return;
      const d = new Date(plan.startDate);
      if (d >= now && d <= weekFromNow) {
        upcomingExams.push({ name: exam.name || "Exam", grade: plan.grade || "—", date: plan.startDate! });
      }
    });
  });

  const latest = latestMarkedDate(attendanceRecords);
  let studentAttendancePct: number | null = null;
  if (latest) {
    const todays = attendanceRecords.filter(r => r.entityType === "student" && String(r.date) === latest);
    const present = todays.filter(r => r.status === "Present").length;
    studentAttendancePct = todays.length > 0 ? Math.round((present / todays.length) * 1000) / 10 : null;
  }

  return {
    studentAttendancePct,
    presentStaff,
    totalStaff,
    staffAttendancePct,
    pendingLeaveRequests,
    upcomingExams: upcomingExams.slice(0, 5),
    openTransportIncidents: incidents.filter(i => i.status === "Open").length,
    generatedAt: new Date().toISOString(),
  };
}

export function formatDailyBriefContext(data: DailyBriefData): string {
  const lines = [
    `Student attendance today: ${data.studentAttendancePct !== null ? `${data.studentAttendancePct}%` : "no attendance marked yet today"}`,
    `Staff attendance today: ${data.staffAttendancePct !== null ? `${data.staffAttendancePct}% (${data.presentStaff}/${data.totalStaff} present)` : "no staff records"}`,
    `Pending leave requests: ${data.pendingLeaveRequests}`,
    `Open transport incidents: ${data.openTransportIncidents}`,
    data.upcomingExams.length
      ? `Upcoming exams (next 7 days): ${data.upcomingExams.map(e => `${e.name} — ${e.grade} on ${e.date}`).join("; ")}`
      : "No exams scheduled in the next 7 days",
  ];
  return lines.join("\n");
}

// ── 2. Attendance below X% by class ─────────────────────────────────────────

export interface ClassAttendance { className: string; presentCount: number; totalCount: number; pct: number }

const ATTENDANCE_BELOW_PATTERN = /attendance\s*(below|under|less than)\s*(\d{1,3})%?|classes?\s*with\s*low\s*attendance/i;

export function isLowAttendanceIntent(text: string): boolean {
  return ATTENDANCE_BELOW_PATTERN.test(text.trim());
}

/** Parses a threshold like "below 90%" out of the query; defaults to 90. */
export function parseAttendanceThreshold(text: string): number {
  const m = text.match(/(\d{1,3})\s*%/);
  const n = m ? Number(m[1]) : 90;
  return n > 0 && n <= 100 ? n : 90;
}

export async function fetchLowAttendanceClasses(thresholdPct = 90): Promise<ClassAttendance[]> {
  const records = (await smartDb.getAll("attendance").catch(() => [])) as AttendanceRecord[];
  const latest = latestMarkedDate(records);
  if (!latest) return [];

  const todays = records.filter(r => r.entityType === "student" && String(r.date) === latest && r.class);
  const byClass = new Map<string, { present: number; total: number }>();
  todays.forEach(r => {
    const cls = r.class!;
    const entry = byClass.get(cls) || { present: 0, total: 0 };
    entry.total += 1;
    if (r.status === "Present") entry.present += 1;
    byClass.set(cls, entry);
  });

  const rows: ClassAttendance[] = Array.from(byClass.entries()).map(([className, { present, total }]) => ({
    className, presentCount: present, totalCount: total,
    pct: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
  }));

  return rows.filter(r => r.pct < thresholdPct).sort((a, b) => a.pct - b.pct);
}

export function formatLowAttendanceContext(rows: ClassAttendance[], thresholdPct: number): string {
  if (rows.length === 0) return `No class is below ${thresholdPct}% attendance today — every class is at or above the threshold.`;
  return `Classes below ${thresholdPct}% attendance today:\n` +
    rows.map(r => `${r.className}: ${r.pct}% (${r.presentCount}/${r.totalCount} present)`).join("\n");
}

// ── 4. Low-performing students ───────────────────────────────────────────────

export interface LowPerformer { studentId: string; name: string; grade: string; section: string; overallPct: number }

const LOW_PERFORMERS_PATTERN = /low\s*perform|at.?risk\s*student|weak\s*student|below\s*\d{1,3}%.*(perform|score|grade)|risk\s*of\s*failing/i;

export function isLowPerformersIntent(text: string): boolean {
  return LOW_PERFORMERS_PATTERN.test(text.trim());
}

export function parsePerformanceThreshold(text: string): number {
  const m = text.match(/(\d{1,3})\s*%/);
  const n = m ? Number(m[1]) : 60;
  return n > 0 && n <= 100 ? n : 60;
}

/**
 * `scopeGrade`/`scopeSection` restrict the scan to one class — used when a
 * Teacher persona asks this, so they only ever see their own students.
 */
export async function fetchLowPerformers(
  thresholdPct = 60,
  scopeGrade?: string,
  scopeSection?: string,
): Promise<LowPerformer[]> {
  const [students, sources, curriculumId] = await Promise.all([
    smartDb.getAll("Student").catch(() => []) as Promise<StudentRecord[]>,
    loadGradebookSources(),
    loadCurriculumId(),
  ]);

  const curriculum = getCurriculum(curriculumId);
  const scoped = students.filter(s => {
    if (scopeGrade && (s.grade || "").toLowerCase() !== scopeGrade.toLowerCase()) return false;
    if (scopeSection && (s.section || "").toUpperCase() !== scopeSection.toUpperCase()) return false;
    return true;
  });

  const results: LowPerformer[] = [];
  scoped.forEach(s => {
    const band = getBandForGrade(curriculum, s.grade || "");
    const gb = computeStudentGradebook(
      { id: s.id, name: s.name, grade: s.grade || "", section: s.section || "" }, band, sources
    );
    const graded = gb.subjects.filter(sub => sub.hasData);
    if (graded.length === 0) return; // no real marks yet — not enough signal either way
    if (gb.overallPercentage < thresholdPct) {
      results.push({ studentId: s.id, name: s.name, grade: s.grade || "—", section: s.section || "—", overallPct: Math.round(gb.overallPercentage * 10) / 10 });
    }
  });

  return results.sort((a, b) => a.overallPct - b.overallPct).slice(0, 20);
}

export function formatLowPerformersContext(rows: LowPerformer[], thresholdPct: number): string {
  if (rows.length === 0) return `No students are below ${thresholdPct}% overall right now (among those with real graded marks).`;
  return `${rows.length} student(s) below ${thresholdPct}% overall:\n` +
    rows.map(r => `${r.name} (Grade ${r.grade}-${r.section}): ${r.overallPct}%`).join("\n");
}

// ── 5. Staff who arrived late today (HR) ────────────────────────────────────

export interface LateStaffMember { name: string; role: string; time: string }

const LATE_STAFF_PATTERN = /(who|which staff).*(arrived|came)\s*late|late\s*(today|arrival|staff)|staff\s*attendance/i;

export function isLateStaffIntent(text: string): boolean {
  return LATE_STAFF_PATTERN.test(text.trim());
}

export async function fetchLateStaffToday(): Promise<LateStaffMember[]> {
  const records = (await smartDb.getAll("attendance").catch(() => [])) as AttendanceRecord[];
  const staffRows = records.filter(r => r.entityType === "staff" && r.date);
  if (staffRows.length === 0) return [];
  const dates = [...new Set(staffRows.map(r => String(r.date)))];
  const latest = dates.reduce((max, d) => (d > max ? d : max), "");
  return staffRows
    .filter(r => String(r.date) === latest && r.status === "Late")
    .map(r => ({ name: r.name || "Unknown", role: r.role || "Staff", time: r.time || "—" }));
}

export function formatLateStaffContext(rows: LateStaffMember[]): string {
  if (rows.length === 0) return "No staff arrived late on the most recent marked day.";
  return `${rows.length} staff member(s) arrived late on the most recent marked day:\n` +
    rows.map(r => `${r.name} (${r.role}) — ${r.time}`).join("\n");
}

// ── 6. Parent: "How is my child performing?" ────────────────────────────────

export interface ChildPerformance {
  childName: string;
  grade: string;
  section: string;
  overallPct: number | null;
  overallLetter: string;
  subjects: { subject: string; pct: number; letter: string }[];
  attendancePct: number | null;
  upcomingExams: { name: string; date: string }[];
}

const CHILD_PERFORMANCE_PATTERN = /how\s*is\s*my\s*child|child.?s?\s*(performance|performing|grades?|progress)|my\s*(son|daughter|kid|ward)/i;

export function isChildPerformanceIntent(text: string): boolean {
  return CHILD_PERFORMANCE_PATTERN.test(text.trim());
}

export async function fetchChildPerformance(
  childId: string, childName: string, grade: string, section: string,
): Promise<ChildPerformance> {
  const [sources, curriculumId, attendanceRecords, exams] = await Promise.all([
    loadGradebookSources(),
    loadCurriculumId(),
    smartDb.getAll("attendance").catch(() => []) as Promise<AttendanceRecord[]>,
    smartDb.getAll("Exam").catch(() => []) as Promise<ExamRecord[]>,
  ]);

  const curriculum = getCurriculum(curriculumId);
  const band = getBandForGrade(curriculum, grade);
  const gb = computeStudentGradebook({ id: childId, name: childName, grade, section }, band, sources);
  const graded = gb.subjects.filter(s => s.hasData);

  // This child's own attendance history (not the whole class) — % Present
  // across every day they have a real marked row, not just the latest one.
  const ownRows = attendanceRecords.filter(r => r.entityType === "student" && r.entityId === childId);
  const attendancePct = ownRows.length > 0
    ? Math.round((ownRows.filter(r => r.status === "Present").length / ownRows.length) * 1000) / 10
    : null;

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingExams: ChildPerformance["upcomingExams"] = [];
  exams.forEach(exam => {
    if (exam.status === "Completed" || exam.status === "Published") return;
    getExamGradePlans(exam).forEach(plan => {
      if (!plan.startDate || (plan.grade || "").toLowerCase() !== grade.toLowerCase()) return;
      const d = new Date(plan.startDate);
      if (d >= now && d <= weekFromNow) upcomingExams.push({ name: exam.name || "Exam", date: plan.startDate! });
    });
  });

  return {
    childName, grade, section,
    overallPct: graded.length > 0 ? Math.round(gb.overallPercentage * 10) / 10 : null,
    overallLetter: gb.overallLetter,
    subjects: graded.map(s => ({ subject: s.subject, pct: Math.round(s.percentage * 10) / 10, letter: s.letter })),
    attendancePct,
    upcomingExams: upcomingExams.slice(0, 5),
  };
}

export function formatChildPerformanceContext(data: ChildPerformance): string {
  const lines = [
    `Child: ${data.childName}, Grade ${data.grade}-${data.section}`,
    `Attendance: ${data.attendancePct !== null ? `${data.attendancePct}%` : "no attendance recorded yet"}`,
    data.overallPct !== null
      ? `Overall grade: ${data.overallLetter} (${data.overallPct}%)`
      : "No graded marks yet this term",
    data.subjects.length
      ? `Subjects:\n${data.subjects.map(s => `${s.subject}: ${s.letter} (${s.pct}%)`).join("\n")}`
      : "",
    data.upcomingExams.length
      ? `Upcoming exams: ${data.upcomingExams.map(e => `${e.name} on ${e.date}`).join("; ")}`
      : "No exams scheduled in the next 7 days",
  ];
  return lines.filter(Boolean).join("\n");
}
