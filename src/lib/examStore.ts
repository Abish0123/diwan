// ─────────────────────────────────────────────────────────────────────────────
// Shared Exam store — single source of truth for BOTH the centralized admin
// page (/exams) AND the per-section / per-grade Exams tabs (ExamsPro).
//
// An exam created on the central page shows up in the matching section's Exams
// tab, and a datesheet built inside a section shows up on the central admin
// page. Persisted in localStorage ("sd_exams"); changes broadcast on a custom
// event so any mounted view refreshes live within the same tab.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";
import { sendPlainEmail } from "@/lib/emailService";
import { studentRepository } from "@/repositories/StudentRepository";
import { userRepository } from "@/repositories/UserRepository";
import { subjectAssignmentRepository } from "@/repositories/SubjectAssignmentRepository";

export type ExamStatus = "Scheduled" | "Ongoing" | "Completed" | "Published";

// Delivery mode. Qatar schools run most major exams on paper (Offline); quizzes
// and coding tests are Online; Hybrid mixes both.
export type ExamMode = "Online" | "Offline" | "Hybrid";

// One row of an exam datesheet (a subject's sitting).
export interface ExamSlot {
  subject: string;      // display name, e.g. "Mathematics" — kept for backward compat
  subjectCode?: string; // global subject code, e.g. "MAT101" — canonical reference
  date: string;        // ISO yyyy-mm-dd
  start: string;       // HH:mm
  end: string;         // HH:mm
  invigilator: string;
  room: string;
  subjectTeacher?: string; // assigned subject teacher — only they may enter this subject's marks
}

// One grade's plan within an exam — its own sections, subject-wise datesheet,
// and roll counts. Lets one exam name ("Mid Term - 1") cover several grades,
// each sitting different subjects on different dates, without renaming the
// exam per grade.
export interface GradePlan {
  grade: string;
  section: string;     // "All Sections" | "A" | "B" — kept for backward compat
  sections: string[];  // all sections this grade's plan covers; empty = all
  subjects: string;    // display string, e.g. "8 Subjects" or "Science"
  startDate: string;   // ISO — derived from this grade's own slots
  endDate: string;     // ISO
  appeared: number;
  total: number;
  slots: ExamSlot[];   // this grade's subject-wise schedule
  publishedToStudents?: boolean; // this grade's timetable visible to its students/parents
}

// Unified record. Summary fields drive the central admin table/KPIs; `slots` +
// `published` drive the section datesheet view. Both views read/write the same
// object so neither loses the other's data.
export interface ExamRecord {
  id: string;
  name: string;
  type: string;
  grade: string;       // "Grade 6" | "Pre-KG" | ... — primary/first grade, kept for
                        // every older call site that reads a single grade off an exam
  section: string;     // "All Sections" | "A" | "B" — kept for backward compat
  sections: string[];  // all sections this exam covers, e.g. ["A","B","C"]; empty = all
  subjects: string;    // display string, e.g. "8 Subjects" or "Science"
  startDate: string;   // ISO
  endDate: string;     // ISO
  appeared: number;
  total: number;
  status: ExamStatus;
  slots: ExamSlot[];   // per-subject schedule (may be empty for summary-only exams)
  published: boolean;

  // Multi-grade plans. When present (length > 0), this is the source of truth
  // and the legacy singular fields above mirror gradePlans[0] for backward
  // compatibility. Single-grade exams may leave this empty and just use the
  // legacy fields directly — both shapes are valid and normalize() bridges them.
  gradePlans: GradePlan[];

  // ── Offline / hybrid exam fields ──────────────────────────────────────────
  mode: ExamMode;            // Online | Offline | Hybrid (default Offline)
  venue: string;             // building / campus, e.g. "Main Block"
  room: string;              // default room/hall (slots may override per-subject)
  invigilator: string;       // default invigilator (slots may override)
  durationMin: number;       // default duration in minutes (slots derive their own)
  maxMarks: number;          // maximum marks per subject paper
  passingMarks: number;      // passing threshold
  publishedToTeachers: boolean; // visible to teachers for mark entry
  publishedToStudents: boolean; // visible to students/parents (hall ticket + schedule)

  // Real per-exam fee (QAR) — most exams are free (0/unset). When set, a
  // real Exam Fee Invoice is generated per student at seat allocation time
  // (see createExamFeeInvoice in useFees.ts, called from
  // exams/RoomAllocation.tsx), the same way Transport generates an invoice
  // from a real per-student monthlyFee.
  examFee?: number;
}

// The grade plans for an exam — for legacy single-grade exams (no gradePlans
// saved), synthesizes a one-entry array from the legacy singular fields so
// every caller can treat all exams as multi-grade uniformly.
export function getGradePlans(exam: ExamRecord): GradePlan[] {
  if (exam.gradePlans && exam.gradePlans.length > 0) return exam.gradePlans;
  return [{
    grade: exam.grade, section: exam.section, sections: exam.sections,
    subjects: exam.subjects, startDate: exam.startDate, endDate: exam.endDate,
    appeared: exam.appeared, total: exam.total, slots: exam.slots,
  }];
}

// All grade names covered by an exam, in plan order.
export function examGrades(exam: ExamRecord): string[] {
  return getGradePlans(exam).map(p => p.grade).filter(Boolean);
}

// The specific grade plan a viewer should see. A multi-grade exam's top-level
// `exam.slots`/`exam.grade` are always back-filled from the FIRST plan
// (see normalize() below) — reading those directly for a student/parent view
// shows every family the first grade's subject schedule, regardless of which
// grade the exam actually matched them on. Callers rendering a per-student
// timetable must look up their own plan via this helper instead.
export function planForGrade(exam: ExamRecord, grade: string): GradePlan | undefined {
  const want = normGrade(grade);
  return getGradePlans(exam).find(p => normGrade(p.grade) === want);
}

const LS_KEY = "sd_exams";
const LS_VERSION_KEY = "sd_exams_version";
const STORE_VERSION = "4"; // bump to force-clear old seed data
const CHANGE_EVENT = "sd-exams-changed";

// Back-fill optional fields for records written by older versions of the store.
// When gradePlans[0] exists, the legacy singular fields mirror it so every
// older read site (tables, filters, KPIs, seating page) keeps working as-is.
function normalize(e: Partial<ExamRecord> & { id: string }): ExamRecord {
  const gradePlans: GradePlan[] = Array.isArray(e.gradePlans)
    ? e.gradePlans.map(p => ({
        grade: p.grade ?? "",
        section: p.section ?? "All Sections",
        sections: Array.isArray(p.sections) ? p.sections : [],
        subjects: p.subjects ?? "",
        startDate: p.startDate ?? "",
        endDate: p.endDate ?? p.startDate ?? "",
        appeared: p.appeared ?? 0,
        total: p.total ?? 0,
        slots: Array.isArray(p.slots) ? p.slots : [],
        publishedToStudents: p.publishedToStudents ?? false,
      }))
    : [];
  const primary = gradePlans[0];
  return {
    id: e.id,
    name: e.name ?? "",
    type: e.type ?? "Unit Test",
    gradePlans,
    grade: primary?.grade ?? e.grade ?? "",
    section: primary?.section ?? e.section ?? "All Sections",
    sections: primary
      ? primary.sections
      : (Array.isArray(e.sections) && e.sections.length > 0
          ? e.sections
          : (e.section && e.section !== "All Sections" ? [e.section] : [])),
    subjects: primary?.subjects ?? e.subjects ?? "",
    startDate: primary?.startDate ?? e.startDate ?? "",
    endDate: primary?.endDate ?? e.endDate ?? e.startDate ?? "",
    appeared: primary ? gradePlans.reduce((a, p) => a + (p.appeared || 0), 0) : (e.appeared ?? 0),
    total: primary ? gradePlans.reduce((a, p) => a + (p.total || 0), 0) : (e.total ?? 0),
    status: (e.status as ExamStatus) ?? "Scheduled",
    slots: primary ? primary.slots : (Array.isArray(e.slots) ? e.slots : []),
    published: e.published ?? (e.status === "Published"),
    // Offline/hybrid fields — back-filled for records written before they existed.
    mode: (e.mode as ExamMode) ?? "Offline",
    venue: e.venue ?? "",
    room: e.room ?? "",
    invigilator: e.invigilator ?? "",
    durationMin: e.durationMin ?? 120,
    maxMarks: e.maxMarks ?? 100,
    passingMarks: e.passingMarks ?? 40,
    // Legacy/seed records default to visible so nothing silently disappears;
    // only an explicit `false` (set by the publish workflow) hides them.
    publishedToTeachers: e.publishedToTeachers ?? true,
    publishedToStudents: e.publishedToStudents ?? true,
  };
}

export function getExams(): ExamRecord[] {
  try {
    // Clear old data when store version changes (removes dummy seed exams)
    const storedVersion = localStorage.getItem(LS_VERSION_KEY);
    if (storedVersion !== STORE_VERSION) {
      localStorage.removeItem(LS_KEY);
      localStorage.setItem(LS_VERSION_KEY, STORE_VERSION);
    }
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalize);
    }
  } catch { /* ignore */ }
  return [];
}

// Write-through: localStorage for instant UI, MySQL for cross-session persistence.
async function persistExamToDb(exam: ExamRecord) {
  try { await smartDb.create("Exam", exam as unknown as Record<string, unknown>); } catch { /* non-fatal */ }
}
async function deleteExamFromDb(id: string) {
  try { await smartDb.delete("Exam", id); } catch { /* non-fatal */ }
}

// Marks entry becomes possible the moment an exam is BOTH under way/done AND
// visible to teachers — the exact condition TeacherExams.tsx gates the
// "Enter Marks" button on.
function isGradableForTeachers(exam: Partial<ExamRecord> | undefined): boolean {
  if (!exam) return false;
  return (exam.status === "Ongoing" || exam.status === "Completed") && exam.publishedToTeachers !== false;
}

function normName(s: string | undefined): string {
  return (s || "").toLowerCase().trim();
}
// Exam grade plans always store the curriculum's full label ("Grade 3"), but
// the students table stores the bare grade ("3") — normName alone left every
// student/parent match in notifyExamScheduled silently empty, so no exam
// notification ever reached the affected grade+section despite the publish
// dialog claiming otherwise. Strips the "grade "/"year " prefix so both
// sides compare on the same bare value.
function normGrade(s: string | undefined): string {
  return normName(s).replace(/^(grade|year)\s+/, "");
}
function slugify(s: string | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Exam settings ────────────────────────────────────────────────────────
// Real, persisted settings for the Exams > Settings tab. Lives here (not the
// page) so the notification functions below can read the same source of
// truth the admin's toggle actually writes to.
export const EXAM_SETTINGS_LS_KEY = "sd_exam_settings";
export interface ExamSettings {
  gradingSystem: string;
  passPercentage: string;
  autoNotifyParents: boolean;
  showRankOnReportCards: boolean;
}
const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  gradingSystem: "cbse", passPercentage: "40", autoNotifyParents: true, showRankOnReportCards: true,
};
export function loadExamSettings(): ExamSettings {
  try {
    const raw = localStorage.getItem(EXAM_SETTINGS_LS_KEY);
    if (raw) return { ...DEFAULT_EXAM_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_EXAM_SETTINGS;
}

// ── Status lifecycle ───────────────────────────────────────────────────────
// The exam workflow is meant to move strictly forward: Scheduled → Ongoing →
// Completed → Published. UI layers use this to require an explicit confirm
// before letting an admin move a status backward or skip a step (e.g.
// un-publishing results by reverting to Scheduled) instead of allowing it
// silently from a plain dropdown.
export const STATUS_ORDER: ExamStatus[] = ["Scheduled", "Ongoing", "Completed", "Published"];
export function isForwardStatusTransition(from: ExamStatus, to: ExamStatus): boolean {
  const a = STATUS_ORDER.indexOf(from);
  const b = STATUS_ORDER.indexOf(to);
  if (a === -1 || b === -1) return true;
  return b >= a;
}

// ── Student/parent-facing notifications ─────────────────────────────────────
// Which (grade, section) pairs are currently visible to students for this
// exam — a grade plan's own publishedToStudents flag wins when set, falling
// back to the exam-level flag for legacy/single-grade exams and the teacher
// portal's "Publish Results" action (which only sets the exam-level flag).
function visibleStudentScopes(exam: ExamRecord): { grade: string; section: string }[] {
  const plans = getGradePlans(exam);
  const out: { grade: string; section: string }[] = [];
  for (const plan of plans) {
    const visible = plan.publishedToStudents ?? exam.publishedToStudents;
    if (!visible) continue;
    if (plan.sections && plan.sections.length > 0) {
      plan.sections.forEach(s => out.push({ grade: plan.grade, section: s }));
    } else {
      out.push({ grade: plan.grade, section: "All Sections" });
    }
  }
  return out;
}
function scopeKey(s: { grade: string; section: string }): string {
  return `${normName(s.grade)}|${normalizeSection(s.section)}`;
}

// Notify every student/parent in a newly-scheduled exam's grades — fires
// once when the exam is first created and already visible to students (the
// common case for exams created directly with a datesheet).
async function notifyExamScheduled(exam: ExamRecord) {
  const targets = visibleStudentScopes(exam);
  if (targets.length === 0) return;
  try {
    const students = await studentRepository.getAll() as unknown as Record<string, unknown>[];
    if (!Array.isArray(students)) return;
    for (const t of targets) {
      const wantG = normGrade(t.grade);
      const wantS = normalizeSection(t.section);
      const matched = students.filter(s => {
        const sg = normGrade(String(s.grade ?? ""));
        if (sg !== wantG) return false;
        if (!wantS || wantS === "all sections") return true;
        return normalizeSection(String(s.section ?? "")) === wantS;
      });
      for (const s of matched) {
        const sid = String(s.id ?? s.uid ?? "");
        if (!sid) continue;
        const base = `examsched-${exam.id}-${slugify(t.grade)}-${slugify(t.section)}-${slugify(sid)}`;
        const email = String(s.email ?? "");
        const studentName = String(s.name ?? "the student");
        const label = `${t.grade}${t.section && t.section !== "All Sections" ? ` · Section ${t.section}` : ""}`;
        if (email) {
          const id = `${base}-student`;
          void smartDb.create("Notification", {
            id,
            recipientUid: email,
            category: "student",
            entity: "Exam",
            type: "exam_scheduled",
            title: `New exam scheduled — ${exam.name}`,
            message: `${exam.name} has been scheduled for ${t.grade} · Section ${t.section}.`,
            examId: exam.id,
            grade: t.grade,
            section: t.section,
            studentId: sid,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
            redirectUrl: `/student/exams?examId=${encodeURIComponent(exam.id)}`,
          }, id);
          void sendPlainEmail({
            to: email, toName: studentName,
            subject: `Examination Timetable Published — ${exam.name}`,
            body: `Dear ${studentName},\n\nThe timetable for "${exam.name}" has been published for ${label}.\n\nPlease log in to the Student Portal to view your subject-wise exam schedule, dates, and timings.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
        const parentId = `${base}-parent`;
        void smartDb.create("Notification", {
          id: parentId,
          audienceRole: "parent",
          category: "student",
          entity: "Exam",
          type: "exam_scheduled",
          title: `New exam scheduled — ${exam.name}`,
          message: `${exam.name} has been scheduled for ${String(s.name ?? "your child")} (${t.grade} · Section ${t.section}).`,
          examId: exam.id,
          grade: t.grade,
          section: t.section,
          studentId: sid,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
          redirectUrl: `/parent/exams?examId=${encodeURIComponent(exam.id)}`,
        }, parentId);
        const parentEmail = String(s.fatherEmail ?? s.motherEmail ?? s.guardianEmail ?? "");
        if (parentEmail) {
          void sendPlainEmail({
            to: parentEmail, toName: String(s.fatherName ?? s.motherName ?? s.guardianName ?? "Parent/Guardian"),
            subject: `Examination Schedule Published for ${studentName} — ${exam.name}`,
            body: `Dear Parent/Guardian,\n\nThe examination timetable for "${exam.name}" has been published for ${studentName} (${label}).\n\nPlease log in to the Parent Portal to view the full subject-wise schedule, dates, and timings.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
      }
    }
  } catch { /* non-fatal */ }
}

// Cascade-clean the exam's dependent records so deleting an exam doesn't
// leave orphaned marks/seating rows behind in MySQL forever. Report cards
// are intentionally left untouched — they're per-term aggregates across
// possibly many exams (keyed by studentId::year::term, not examId), not a
// 1:1 child of a single exam.
async function cascadeDeleteExamData(id: string) {
  try { await smartDb.delete("ExamMark", id); } catch { /* may not exist */ }
  try {
    const rows = (await smartDb.getAll("ExamSeating", "")) as { id: string; examId: string }[];
    const mine = (rows || []).filter(r => r.examId === id);
    await Promise.all(mine.map(r => smartDb.delete("ExamSeating", r.id).catch(() => {})));
  } catch { /* non-fatal */ }
}

// Notify every subject-assigned teacher the moment an exam crosses into
// "gradable" — one notification per (exam, grade, section, teacher), keyed
// by a deterministic id so repeated updateExam calls (e.g. re-saving the
// same status) never spam duplicate rows; the backend upserts by id.
async function notifyNewlyGradableTeachers(exam: ExamRecord) {
  try {
    const assignments = await subjectAssignmentRepository.getAll();
    if (!Array.isArray(assignments)) return;
    const plans = getGradePlans(exam);
    const seen = new Set<string>();
    for (const plan of plans) {
      const subjectNames = new Set(plan.slots.map(s => normName(s.subject)));
      if (subjectNames.size === 0) continue;
      for (const a of assignments) {
        if (normName(a.grade) !== normName(plan.grade)) continue;
        if (plan.sections.length > 0 && !plan.sections.some(sec => normName(sec) === normName(a.section))) continue;
        if (!subjectNames.has(normName(a.subject))) continue;
        const key = `${normName(a.teacherName)}|${normName(plan.grade)}|${normName(a.section)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const id = `examready-${exam.id}-${slugify(plan.grade)}-${slugify(a.section)}-${slugify(a.teacherName)}`;
        // Prefer the real account (teacherEmail, captured at assignment time) over
        // the fragile name match — falls back to recipientName only for assignment
        // rows created before that field existed.
        void smartDb.create("Notification", {
          id,
          recipientUid: a.teacherEmail || undefined,
          recipientName: a.teacherEmail ? undefined : a.teacherName,
          category: "staff",
          entity: "Exam",
          type: "marks_entry_ready",
          title: `Marks entry open — ${exam.name}`,
          message: `You can now enter marks for ${plan.grade} · Section ${a.section}.`,
          examId: exam.id,
          grade: plan.grade,
          section: a.section,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
        }, id);
      }
    }
  } catch { /* non-fatal — notification delivery should never block the exam update */ }
}

// Notify the school's leadership/oversight chain — plus, separately, every
// subject teacher assigned to this timetable — the moment it becomes visible
// to students. This is the same real "publish" moment that drives
// notifyExamScheduled/notifyResultsPublished above, just aimed at the people
// who need to know the schedule went out rather than sit the exam. Four
// real, distinct audiences (no invented roles/routes):
//   - Subject teacher(s) actually teaching a subject in this timetable, for
//     this grade+section — real Subject Allocation data, same source
//     notifyNewlyGradableTeachers uses for the (separate) marks-entry alert.
//   - Class teacher(s) of the affected grade+section — looked up from their
//     own User record's assignedGrade/assignedSection (useTeacherClass.ts's
//     source of truth), not a denormalized/guessed name.
//   - Academic Coordinator role — broadcast (one row per grade, deduped).
//   - Principal + Vice Principal roles — broadcast (one row per grade, deduped).
async function notifyLeadershipAndClassTeachers(exam: ExamRecord, targets: { grade: string; section: string }[]) {
  if (targets.length === 0) return;
  try {
    const [users, assignments] = await Promise.all([
      userRepository.getAll() as Promise<Record<string, unknown>[]>,
      subjectAssignmentRepository.getAll(),
    ]);
    if (!Array.isArray(users)) return;
    const plans = getGradePlans(exam);
    const seenTeacher = new Set<string>();
    const seenSubjectTeacher = new Set<string>();
    for (const t of targets) {
      const wantG = normName(t.grade);
      const wantS = normalizeSection(t.section);
      const label = wantS && wantS !== "all sections" ? `${t.grade} · Section ${t.section}` : t.grade;

      // Subject teacher(s) — real Subject Allocation rows whose subject
      // actually appears in this grade's exam slots.
      const plan = plans.find(p => normName(p.grade) === wantG);
      const subjectNames = new Set((plan?.slots || []).map(s => normName(s.subject)));
      if (Array.isArray(assignments) && subjectNames.size > 0) {
        for (const a of assignments) {
          if (normName(a.grade) !== wantG) continue;
          if (wantS && wantS !== "all sections" && normalizeSection(a.section) !== wantS) continue;
          if (!subjectNames.has(normName(a.subject))) continue;
          const key = `${normName(a.teacherEmail || a.teacherName)}|${wantG}|${normalizeSection(a.section)}`;
          if (seenSubjectTeacher.has(key)) continue;
          seenSubjectTeacher.add(key);
          const id = `examsubjectteacher-${exam.id}-${slugify(t.grade)}-${slugify(a.section)}-${slugify(a.teacherEmail || a.teacherName)}`;
          void smartDb.create("Notification", {
            id,
            recipientUid: a.teacherEmail || undefined,
            recipientName: a.teacherEmail ? undefined : a.teacherName,
            category: "staff",
            entity: "Exam",
            type: "exam_timetable_published",
            title: `Exam schedule published — ${exam.name}`,
            message: `${exam.name} schedule has been published for ${t.grade} · Section ${a.section}. Please review your invigilation and subject schedule.`,
            examId: exam.id,
            grade: t.grade,
            section: a.section,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
            redirectUrl: `/teacher/exams?examId=${encodeURIComponent(exam.id)}`,
          }, id);
          if (a.teacherEmail) {
            void sendPlainEmail({
              to: a.teacherEmail, toName: a.teacherName,
              subject: `Exam Schedule Published — ${exam.name}`,
              body: `Dear ${a.teacherName},\n\nThe examination schedule for "${exam.name}" has been published for ${t.grade} · Section ${a.section}.\n\nPlease log in to the Teacher Portal to review your invigilation duties and subject-wise exam schedule.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
            });
          }
        }
      }

      // Class teacher(s) — real assignedGrade/assignedSection match.
      const classTeachers = users.filter(u => {
        const role = String(u.role ?? "");
        if (role !== "staff" && role !== "class_teacher") return false;
        if (normName(String(u.assignedGrade ?? "")) !== wantG) return false;
        if (!wantS || wantS === "all sections") return true;
        return normalizeSection(String(u.assignedSection ?? "")) === wantS;
      });
      for (const teacher of classTeachers) {
        const email = String(teacher.email ?? "");
        if (!email || seenTeacher.has(`${email}|${wantG}|${wantS}`)) continue;
        seenTeacher.add(`${email}|${wantG}|${wantS}`);
        const id = `examclassteacher-${exam.id}-${slugify(t.grade)}-${slugify(t.section)}-${slugify(email)}`;
        void smartDb.create("Notification", {
          id,
          recipientUid: email,
          category: "staff",
          entity: "Exam",
          type: "exam_timetable_published",
          title: `Timetable published — ${exam.name}`,
          message: `${exam.name} timetable has been published for your class (${label}).`,
          examId: exam.id,
          grade: t.grade,
          section: t.section,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
          redirectUrl: `/teacher/exams?examId=${encodeURIComponent(exam.id)}`,
        }, id);
        void sendPlainEmail({
          to: email, toName: String(teacher.name ?? "Class Teacher"),
          subject: `Examination Timetable Published — ${exam.name}`,
          body: `Dear ${String(teacher.name ?? "Teacher")},\n\nThe examination timetable for "${exam.name}" has been published for your class (${label}).\n\nPlease log in to the Teacher Portal to review the schedule.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
        });
      }

      // Academic Coordinator + Principal + Vice Principal — real role broadcasts.
      const leadershipRoles: { role: string; redirectUrl: string }[] = [
        { role: "academic_coordinator", redirectUrl: "/academics/gradebook" },
        { role: "principal", redirectUrl: "/exams/setup" },
        { role: "vice_principal", redirectUrl: "/exams/setup" },
      ];
      for (const lr of leadershipRoles) {
        const id = `examleadership-${exam.id}-${slugify(t.grade)}-${slugify(t.section)}-${lr.role}`;
        void smartDb.create("Notification", {
          id,
          audienceRole: lr.role,
          category: "staff",
          entity: "Exam",
          type: "exam_timetable_published",
          title: `Examination timetable published — ${exam.name}`,
          message: `${exam.name} timetable has been published for ${label}.`,
          examId: exam.id,
          grade: t.grade,
          section: t.section,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
          redirectUrl: lr.redirectUrl,
        }, id);
        // Real role holders get a real email too — same audience, resolved
        // to actual accounts instead of just the in-app broadcast.
        const holders = users.filter(u => String(u.role ?? "") === lr.role);
        for (const holder of holders) {
          const email = String(holder.email ?? "");
          if (!email) continue;
          void sendPlainEmail({
            to: email, toName: String(holder.name ?? "Colleague"),
            subject: `Examination Schedule Released — ${exam.name}`,
            body: `Dear ${String(holder.name ?? "Colleague")},\n\nThe examination timetable for "${exam.name}" has been published for ${label}.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
      }
    }
  } catch { /* non-fatal — notification delivery should never block the exam update */ }
}

function commit(list: ExamRecord[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* ignore */ }
}

export function setExams(list: ExamRecord[]) {
  commit(list);
  // Upsert all to MySQL in background
  list.forEach(e => void persistExamToDb(e));
}
// Real Exams -> Communication Calendar sync — previously the Calendar had
// zero auto-population from any other module, only manually-typed events.
// One event per exam (not per subject-slot, to avoid spam), keyed by a
// deterministic id so repeated saves upsert the same row instead of
// duplicating it. Targets the same real students/parents the exam is
// actually published to, via the same GradePlan grade this exam already
// tracks — a school-wide exam still shows school-wide, but a single-grade
// exam only shows to that grade.
function syncExamCalendarEvent(rec: ExamRecord) {
  const plans = getGradePlans(rec);
  const grades = [...new Set(plans.map(p => p.grade))].filter(Boolean);
  const startDate = rec.startDate || plans[0]?.startDate;
  if (!startDate) return;
  void smartDb.create("CalendarEvent", {
    title: rec.name,
    description: `${rec.type} exam${grades.length > 0 ? ` — ${grades.join(", ")}` : ""}`,
    date: startDate,
    time: rec.slots?.[0]?.start || "09:00 AM",
    location: rec.venue || rec.room || "",
    category: "Exams",
    color: "bg-amber-500",
    status: "Published",
    targetAudience: "All",
    targetClass: grades.length === 1 ? grades[0] : "",
    source: "Exam",
  }, `exam-cal-${rec.id}`).catch(() => {});
}

export function addExam(rec: ExamRecord) {
  const list = [rec, ...getExams()];
  commit(list);
  void persistExamToDb(rec);
  if (isGradableForTeachers(rec)) void notifyNewlyGradableTeachers(rec);
  void notifyExamScheduled(rec);
  const initiallyVisible = visibleStudentScopes(rec);
  if (initiallyVisible.length > 0) void notifyLeadershipAndClassTeachers(rec, initiallyVisible);
  syncExamCalendarEvent(rec);
}
export function updateExam(id: string, patch: Partial<ExamRecord>) {
  const prev = getExams().find(e => e.id === id);
  // A bare `{ publishedToStudents }` patch (the bulk "Publish/Unpublish to
  // Students" dropdown action) is meant to apply to every grade at once —
  // but visibleStudentScopes() reads each GradePlan's OWN publishedToStudents
  // first, which normalize() always backfills to an explicit `false` (never
  // left undefined). Since `??` only falls through on null/undefined, that
  // explicit `false` permanently shadows the exam-level flag, so the bulk
  // toggle silently did nothing for any exam with gradePlans (i.e. every
  // exam created through the multi-grade Create Exam dialog). Cascade the
  // value onto every grade plan too, unless the caller is already setting
  // gradePlans itself (the granular per-grade "Publish {grade}" button).
  if (prev && typeof patch.publishedToStudents === "boolean" && !patch.gradePlans) {
    const plans = getGradePlans(prev).map(p => ({ ...p, publishedToStudents: patch.publishedToStudents }));
    patch = { ...patch, gradePlans: plans };
  }
  const updated = getExams().map(e => (e.id === id ? { ...e, ...patch, id } : e));
  commit(updated);
  const exam = updated.find(e => e.id === id);
  if (exam) void persistExamToDb(exam);
  if (exam) syncExamCalendarEvent(exam);
  if (exam && !isGradableForTeachers(prev) && isGradableForTeachers(exam)) {
    void notifyNewlyGradableTeachers(exam);
  }
  if (exam) {
    const prevScopes = new Set((prev ? visibleStudentScopes(prev) : []).map(scopeKey));
    const newlyVisible = visibleStudentScopes(exam).filter(s => !prevScopes.has(scopeKey(s)));
    if (newlyVisible.length > 0) {
      // publishedToStudents on an exam means ONLY "the timetable is visible" —
      // marks/results are published exclusively from the Report Card and
      // Gradebook sections (their own publish flows), never from here.
      void notifyExamScheduled(exam);
      void notifyLeadershipAndClassTeachers(exam, newlyVisible);
    }
  }
}
export function deleteExam(id: string) {
  commit(getExams().filter(e => e.id !== id));
  void deleteExamFromDb(id);
  void cascadeDeleteExamData(id);
  void smartDb.delete("CalendarEvent", `exam-cal-${id}`).catch(() => {});
}

// Publish (or unpublish) a single grade's timetable to its students/parents,
// independent of the other grades under the same exam name.
export function setGradePublished(examId: string, grade: string, published: boolean) {
  const exam = getExams().find(e => e.id === examId);
  if (!exam) return;
  const plans = getGradePlans(exam).map(p => p.grade === grade ? { ...p, publishedToStudents: published } : p);
  updateExam(examId, { gradePlans: plans });
}

// Generate a unique id (Date.now is unavailable in some sandboxes — fall back to a counter-free random-free scheme via performance/length).
let idSeq = 0;
export function nextExamId(prefix = "EXM"): string {
  idSeq += 1;
  const stamp = (typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : getExams().length) + idSeq;
  return `${prefix}-${String(stamp).slice(-6).padStart(6, "0")}`;
}

// ── Section ⇆ record mapping helpers ──────────────────────────────────────────

// Canonicalize a section identifier so the central page ("B") and the section
// dashboard, which derives its name from "Grade 5 - Section B" → "Section B",
// compare equal. Strips a leading "Section"/"Sec" and lowercases.
export function normalizeSection(s: string): string {
  return (s || "").trim().replace(/^sec(tion)?\b\.?\s*/i, "").trim().toLowerCase();
}

// Does this exam belong to the given grade/section view? Checks every grade
// plan (a multi-grade exam like "Mid Term - 1" matches whichever plan has
// this grade). "All Sections" plans appear in every section of their grade.
export function matchesSection(rec: ExamRecord, grade: string, section: string): boolean {
  const want = normalizeSection(section);
  const wantGrade = normGrade(grade);
  return getGradePlans(rec).some(plan => {
    if (normGrade(plan.grade) !== wantGrade) return false;
    if (!want || want === "all sections") return true;
    const have = normalizeSection(plan.section);
    return have === "all sections" || have === want;
  });
}

// Deterministic, stable seat number for a student in a given exam (no randomness,
// so the student portal and the hall-ticket page always agree). Maps to a hall
// row/column like "R3-14".
export function seatNumber(examId: string, studentId: string): string {
  const s = `${examId}|${studentId}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const row = (h % 8) + 1;          // R1..R8
  const col = (Math.floor(h / 8) % 30) + 1; // 1..30
  return `R${row}-${String(col).padStart(2, "0")}`;
}

export interface Datesheet { id: string; title: string; slots: ExamSlot[]; published: boolean }

export function recordToDatesheet(rec: ExamRecord): Datesheet {
  return { id: rec.id, title: rec.name, slots: rec.slots, published: rec.published };
}

// Derive summary fields (date range + subject count) from a set of slots.
export function summarizeSlots(slots: ExamSlot[]): { startDate: string; endDate: string; subjects: string } {
  const dates = slots.map(s => s.date).filter(Boolean).sort();
  const n = slots.length;
  return {
    startDate: dates[0] || "",
    endDate: dates[dates.length - 1] || "",
    subjects: n ? `${n} Subject${n === 1 ? "" : "s"}` : "All Subjects",
  };
}

// React hook: live-updating list of all exams. Refreshes on store changes
// (same tab via custom event, other tabs via the storage event).
export function useExams(): ExamRecord[] {
  const [exams, setExamsState] = useState<ExamRecord[]>(getExams);
  useEffect(() => {
    const refresh = () => setExamsState(getExams());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);

    // On mount: hydrate from MySQL so cross-session data is always current.
    smartDb.getAll("Exam").then(rows => {
      if (!rows || rows.length === 0) return;
      const normalized = (rows as unknown[]).map(r => normalize(r as Partial<ExamRecord> & { id: string }));
      // Only replace localStorage cache when MySQL has more/newer records.
      const local = getExams();
      if (normalized.length >= local.length) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(normalized));
          localStorage.setItem(LS_VERSION_KEY, STORE_VERSION);
        } catch { /* ignore */ }
        setExamsState(normalized);
      }
    }).catch(() => { /* MySQL unavailable — stay on localStorage */ });

    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return exams;
}
