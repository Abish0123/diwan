// ─────────────────────────────────────────────────────────────────────────────
// Unified Gradebook compute engine — the single source of truth for grades.
//
// ERP rule: NO marks are entered directly into the gradebook. This engine
// AUTO-PULLS the real marks a school already produces and computes a weighted
// result per subject + overall:
//
//   • Assignment marks  ← smartDb "AssignmentSubmission" ⋈ "TeacherAssignment"
//   • Assessment marks  ← smartDb "assessment_attempts"  ⋈ "assessments"
//   • Exam marks        ← localStorage "sd_exam_marks"   ⋈ examStore "sd_exams"
//
// Weights come from the active curriculum's gradebook band for the student's
// grade (curriculumConfig.ts). Each band category is matched to one of the three
// real sources; categories with no automated source (Projects, Participation…)
// are reported as "pending" and excluded from the normalised percentage so a
// partially-marked term still produces a fair score.
//
// Every consumer (admin/student/parent gradebook, report cards) reads from here,
// so all surfaces show identical, real, computed data.
// ─────────────────────────────────────────────────────────────────────────────
import { smartDb } from "@/lib/localDb";
import { getExams, matchesSection, getGradePlans, type ExamRecord } from "@/lib/examStore";
import type { GradebookBand, GradebookCategory } from "@/lib/curriculumConfig";
import type { MarkOverride } from "@/lib/gradebookApproval";

const LS_EXAM_MARKS = "sd_exam_marks";

// Merge marks from a MySQL ExamMark row into the local marks cache.
// Each MySQL row: { id: examId, [subject]: { [studentId]: number }, uid, createdAt, updatedAt }
function mergeDbMarksRow(row: Record<string, unknown>, cache: GradebookSources["examMarks"]) {
  const { id, uid, createdAt, updatedAt, ...subjects } = row;
  if (!id || typeof id !== "string") return;
  cache[id] = cache[id] || {};
  for (const [sub, byStudent] of Object.entries(subjects)) {
    if (byStudent && typeof byStudent === "object") {
      cache[id][sub] = cache[id][sub] || {};
      Object.assign(cache[id][sub], byStudent as Record<string, number>);
    }
  }
}

// Which real store feeds a band category, inferred from its name / exam flag.
export type ComponentSource = "assignment" | "assessment" | "exam" | "pending";

export function categorySource(cat: GradebookCategory): ComponentSource {
  if (cat.isExam) return "exam";
  const n = cat.name.toLowerCase();
  if (/assign|homework/.test(n)) return "assignment";
  if (/assess|quiz|class test|test/.test(n)) return "assessment";
  // Projects, Participation, Observation, Activities … no automated feed yet.
  return "pending";
}

export interface ComponentScore {
  category: string;       // band category name, e.g. "Assignments"
  weight: number;         // max contribution to the 100-mark subject total
  source: ComponentSource;
  obtainedPct: number;    // student's average in this component, 0..100
  weighted: number;       // obtainedPct/100 * weight
  count: number;          // how many graded items contributed
  hasData: boolean;       // false → pending / not yet marked
}

export interface SubjectGrade {
  subject: string;
  components: ComponentScore[];
  presentWeight: number;  // sum of weights of components that have data
  obtainedWeighted: number; // sum of weighted (absolute, out of 100)
  percentage: number;     // obtainedWeighted normalised by presentWeight, 0..100
  letter: string;
  hasData: boolean;
}

export interface StudentGradebook {
  studentId: string;
  name: string;
  grade: string;
  section: string;
  subjects: SubjectGrade[];
  overallPercentage: number;
  overallLetter: string;
  complete: boolean;      // every subject has at least one mark in every weighted source
}

export interface GradebookSources {
  assignments: any[];       // TeacherAssignment[]
  submissions: any[];       // AssignmentSubmission[]
  assessments: any[];       // assessments[]
  attempts: any[];          // assessment_attempts[]
  exams: ExamRecord[];      // sd_exams
  examMarks: Record<string, Record<string, Record<string, number>>>; // examId→subject→uid→mark
  overrides: MarkOverride[]; // real teacher-reviewed manual corrections (MarkOverride)
}

export interface GradebookStudent { id: string; name: string; grade: string; section: string }

// ── helpers ───────────────────────────────────────────────────────────────────

export function letterFromPct(p: number): string {
  if (p >= 90) return "A+";
  if (p >= 80) return "A";
  if (p >= 70) return "B+";
  if (p >= 60) return "B";
  if (p >= 50) return "C";
  if (p >= 40) return "D";
  return "F";
}

const normGrade = (g: string) => (g || "").toLowerCase().replace("grade ", "").trim();
const normSec = (s: string) => (s || "").trim().replace(/^sec(tion)?\b\.?\s*/i, "").toUpperCase();

// Does a grade/section-scoped item apply to this student?
function appliesTo(itemGrade: string, itemSection: string, student: GradebookStudent): boolean {
  if (normGrade(itemGrade) !== normGrade(student.grade)) return false;
  const sec = normSec(itemSection);
  if (!sec || sec === "ALL" || sec === "ALL SECTIONS") return true;
  return sec === normSec(student.section);
}

const idOf = (o: any) => String(o?.id ?? o?.uid ?? o?.studentId ?? "");
const sameStudent = (recordStudentId: any, student: GradebookStudent) =>
  String(recordStudentId) === String(student.id);

// ── source loading (fetch once, compute many) ──────────────────────────────────

export function loadExamMarksLocal(): GradebookSources["examMarks"] {
  try { return JSON.parse(localStorage.getItem(LS_EXAM_MARKS) || "{}"); } catch { return {}; }
}

// Kept for backward-compat with callers not yet updated.
export const loadExamMarks = loadExamMarksLocal;

// Persist the full marks map to localStorage and MySQL.
// Call this after every marks save so both are always in sync.
//
// IMPORTANT: the backend upserts ExamMark rows with a full-column REPLACE
// (`ON DUPLICATE KEY UPDATE data=VALUES(data)`), not a merge. That means the
// caller's `data[examId]` object here must already contain every subject's
// marks for that exam — not just the one subject just edited — or a save
// silently erases whatever other subject-teachers already persisted for that
// exam. Callers MUST call loadExamMarksFresh() immediately beforehand (not
// rely on marks loaded when the page first mounted) so a second teacher's
// save can never clobber a first teacher's already-saved marks with a stale
// view of the exam. See MarksEntry.tsx / TeacherExams.tsx handleSave().
export function persistExamMarks(data: GradebookSources["examMarks"]) {
  try { localStorage.setItem(LS_EXAM_MARKS, JSON.stringify(data)); } catch {}
  // MySQL: upsert one row per exam (id=examId, data = subject→uid→mark blob)
  for (const [examId, subjectMap] of Object.entries(data)) {
    void smartDb.create("ExamMark", { id: examId, ...subjectMap } as unknown as Record<string, unknown>).catch(() => {});
  }
}

// Fetch the latest ExamMark rows from MySQL and merge them into the
// localStorage cache — the single source both loadGradebookSources() and the
// marks-entry pages should use instead of reading localStorage alone (which
// only reflects whatever *this* browser has ever seen).
export async function loadExamMarksFresh(): Promise<GradebookSources["examMarks"]> {
  const dbMarkRows = await smartDb.getAll("ExamMark", "").catch(() => []);
  const examMarks: GradebookSources["examMarks"] = loadExamMarksLocal();
  if (dbMarkRows && dbMarkRows.length > 0) {
    for (const row of dbMarkRows as Record<string, unknown>[]) {
      mergeDbMarksRow(row, examMarks);
    }
    try { localStorage.setItem(LS_EXAM_MARKS, JSON.stringify(examMarks)); } catch {}
  }
  return examMarks;
}

export async function loadGradebookSources(): Promise<GradebookSources> {
  const [assignments, submissions, assessments, attempts, examMarks, overrides] = await Promise.all([
    smartDb.getAll("TeacherAssignment", "").catch(() => []),
    smartDb.getAll("AssignmentSubmission", "").catch(() => []),
    smartDb.getAll("assessments", "").catch(() => []),
    smartDb.getAll("assessment_attempts", "").catch(() => []),
    loadExamMarksFresh(),
    smartDb.getAll("MarkOverride", "").catch(() => []),
  ]);

  return {
    assignments: assignments || [],
    submissions: submissions || [],
    assessments: assessments || [],
    attempts: attempts || [],
    exams: getExams(),
    examMarks,
    overrides: (overrides || []) as MarkOverride[],
  };
}

// ── per-component computation ───────────────────────────────────────────────────

// Average obtained-% for a student's graded assignments in a subject.
function assignmentPct(subject: string, student: GradebookStudent, src: GradebookSources): { pct: number; count: number } {
  const subjAssignments = src.assignments.filter(a =>
    (a.subject || "").toLowerCase() === subject.toLowerCase() && appliesTo(a.grade, a.section, student));
  const idSet = new Set(subjAssignments.map(a => String(a.id)));
  const titleMax = new Map(subjAssignments.map(a => [String(a.id), Number(a.totalMarks) || 100]));
  const graded = src.submissions.filter(s =>
    sameStudent(s.studentId, student) &&
    idSet.has(String(s.assignmentId)) &&
    (s.marks !== undefined && s.marks !== null) &&
    (s.status === "graded" || s.status === "closed" || typeof s.marks === "number"));
  if (graded.length === 0) return { pct: 0, count: 0 };
  const pcts = graded.map(s => {
    const max = titleMax.get(String(s.assignmentId)) || 100;
    return Math.max(0, Math.min(100, (Number(s.marks) / max) * 100));
  });
  return { pct: pcts.reduce((a, b) => a + b, 0) / pcts.length, count: graded.length };
}

// Average obtained-% for a student's submitted assessments in a subject.
function assessmentPct(subject: string, student: GradebookStudent, src: GradebookSources): { pct: number; count: number } {
  const subjAssessments = src.assessments.filter(a =>
    (a.subject || "").toLowerCase() === subject.toLowerCase() && appliesTo(a.grade, a.section, student));
  const maxById = new Map(subjAssessments.map(a => [String(a.id), Number(a.totalMarks) || 100]));
  const idSet = new Set(subjAssessments.map(a => String(a.id)));
  const done = src.attempts.filter(t =>
    sameStudent(t.studentId, student) &&
    idSet.has(String(t.assessmentId)) &&
    t.status === "submitted" &&
    t.score !== undefined && t.score !== null);
  if (done.length === 0) return { pct: 0, count: 0 };
  const pcts = done.map(t => {
    const max = maxById.get(String(t.assessmentId)) || 100;
    return Math.max(0, Math.min(100, (Number(t.score) / max) * 100));
  });
  return { pct: pcts.reduce((a, b) => a + b, 0) / pcts.length, count: done.length };
}

// A multi-grade exam's top-level `slots`/`subjects` fields only ever mirror
// gradePlans[0] (see examStore.ts normalize()) — for any exam covering more
// than one grade with different subjects per grade, reading those legacy
// fields silently checks the WRONG grade's subject list. This resolves the
// specific grade-plan that actually matches the student before looking at
// its slots, so a Grade 1 student's marks aren't gated by what Pre-KG sits.
function slotsForStudent(exam: ExamRecord, student: GradebookStudent): { subject: string }[] {
  const plan = getGradePlans(exam).find(p => normGrade(p.grade) === normGrade(student.grade));
  return plan?.slots || exam.slots || [];
}

// Average obtained-% for a student's exam papers in a subject (across all exams
// of their grade/section that have a slot for this subject and a recorded mark).
function examPct(subject: string, student: GradebookStudent, src: GradebookSources): { pct: number; count: number } {
  const pcts: number[] = [];
  for (const exam of src.exams) {
    if (!matchesSection(exam, student.grade, student.section)) continue;
    const slots = slotsForStudent(exam, student);
    const hasSubject = slots.some(sl => (sl.subject || "").toLowerCase() === subject.toLowerCase())
      || (slots.length === 0 && (exam.subjects || "").toLowerCase().includes(subject.toLowerCase()));
    if (!hasSubject) continue;
    const perSubject = src.examMarks[exam.id]?.[subject];
    const mark = perSubject?.[String(student.id)];
    if (mark === undefined || mark === null) continue;
    const max = exam.maxMarks || 100;
    pcts.push(Math.max(0, Math.min(100, (Number(mark) / max) * 100)));
  }
  if (pcts.length === 0) return { pct: 0, count: 0 };
  return { pct: pcts.reduce((a, b) => a + b, 0) / pcts.length, count: pcts.length };
}

// ── subject list discovery ──────────────────────────────────────────────────────

// All subjects a student has any real mark/activity in (union across sources).
export function discoverSubjects(student: GradebookStudent, src: GradebookSources): string[] {
  const set = new Set<string>();
  src.assignments.forEach(a => { if (appliesTo(a.grade, a.section, student) && a.subject) set.add(a.subject); });
  src.assessments.forEach(a => { if (appliesTo(a.grade, a.section, student) && a.subject) set.add(a.subject); });
  src.exams.forEach(e => {
    if (!matchesSection(e, student.grade, student.section)) return;
    slotsForStudent(e, student).forEach(sl => { if (sl.subject) set.add(sl.subject); });
  });
  return Array.from(set).sort();
}

// ── public compute API ──────────────────────────────────────────────────────────

// Derives the same columnKey TeacherGradebook.tsx uses to key a MarkOverride
// to a band category, so a saved override matches the exact component it
// was entered against.
function columnKeyFor(categoryName: string): string {
  return categoryName.toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+$/, "");
}

export function computeSubject(
  subject: string, student: GradebookStudent, band: GradebookBand | null, src: GradebookSources, term?: string
): SubjectGrade {
  // When no curriculum band is available, fall back to a generic 20/20/20/40 split
  // (Assignments / Assessments / Mid-Term / Final) so the engine still works.
  const categories: GradebookCategory[] = band?.categories ?? [
    { name: "Assignments", count: null, marks: 20, isExam: false },
    { name: "Assessments", count: null, marks: 20, isExam: false },
    { name: "Mid-Term Exam", count: 1, marks: 20, isExam: true },
    { name: "Final Exam", count: 1, marks: 40, isExam: true },
  ];

  const components: ComponentScore[] = categories.map(cat => {
    const source = categorySource(cat);
    let res = { pct: 0, count: 0 };
    if (source === "assignment") res = assignmentPct(subject, student, src);
    else if (source === "assessment") res = assessmentPct(subject, student, src);
    else if (source === "exam") res = examPct(subject, student, src);
    let hasData = source !== "pending" && res.count > 0;
    let obtainedPct = res.pct;

    // A real, human-reviewed correction (MarkOverride) always wins over the
    // raw auto-computed value — this is what makes a subject teacher's
    // reviewed-and-approved correction actually show up on Report Cards and
    // the admin Gradebook instead of those silently reverting to the
    // uncorrected number. Term-scoped only when the caller supplies a term
    // (Report Cards/admin Gradebook do); otherwise any matching override
    // applies, matching this engine's existing term-agnostic aggregation.
    const columnKey = columnKeyFor(cat.name);
    const ov = src.overrides.find(o =>
      String(o.studentId) === String(student.id) && o.subject === subject && o.columnKey === columnKey &&
      (!term || o.term === term));
    if (ov && cat.marks > 0) {
      obtainedPct = Math.max(0, Math.min(100, (ov.overrideValue / cat.marks) * 100));
      hasData = true;
    }

    return {
      category: cat.name,
      weight: cat.marks,
      source,
      obtainedPct,
      weighted: hasData ? (obtainedPct / 100) * cat.marks : 0,
      count: res.count,
      hasData,
    };
  });

  const presentWeight = components.filter(c => c.hasData).reduce((a, c) => a + c.weight, 0);
  const obtainedWeighted = components.reduce((a, c) => a + c.weighted, 0);
  const percentage = presentWeight > 0 ? (obtainedWeighted / presentWeight) * 100 : 0;
  return {
    subject,
    components,
    presentWeight,
    obtainedWeighted,
    percentage,
    letter: presentWeight > 0 ? letterFromPct(percentage) : "—",
    hasData: presentWeight > 0,
  };
}

export function computeStudentGradebook(
  student: GradebookStudent, band: GradebookBand | null, src: GradebookSources, subjectList?: string[], term?: string
): StudentGradebook {
  const subjects = (subjectList && subjectList.length ? subjectList : discoverSubjects(student, src))
    .map(sub => computeSubject(sub, student, band, src, term))
    .filter(s => s.hasData || (subjectList && subjectList.length > 0)); // keep explicit subjects even if empty

  const graded = subjects.filter(s => s.hasData);
  const overallPercentage = graded.length
    ? graded.reduce((a, s) => a + s.percentage, 0) / graded.length
    : 0;

  // "complete" = every graded subject has data in all three automated sources.
  const complete = graded.length > 0 && graded.every(s =>
    s.components.filter(c => c.source !== "pending").every(c => c.hasData));

  return {
    studentId: String(student.id),
    name: student.name,
    grade: student.grade,
    section: student.section,
    subjects,
    overallPercentage,
    overallLetter: graded.length ? letterFromPct(overallPercentage) : "—",
    complete,
  };
}

// Compute a whole class at once (sources fetched once), ranked by overall %.
export function computeClassGradebook(
  students: GradebookStudent[], band: GradebookBand | null, src: GradebookSources, subjectList?: string[], term?: string
): (StudentGradebook & { rank: number })[] {
  const rows = students.map(s => computeStudentGradebook(s, band, src, subjectList, term));
  const ranked = [...rows].sort((a, b) => b.overallPercentage - a.overallPercentage);
  const rankOf = new Map(ranked.map((r, i) => [r.studentId, i + 1]));
  return rows.map(r => ({ ...r, rank: rankOf.get(r.studentId) || 0 }));
}
