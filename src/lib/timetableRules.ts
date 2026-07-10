import { smartDb } from "./localDb";

const RULES_ID = "global";

export interface TimetableRules {
  Teacher: number;
  "Class Teacher": number;
  "Grade Coordinator": number;
  HOD: number;
  Principal: number;
}

export const DEFAULT_TIMETABLE_RULES: TimetableRules = {
  "Teacher":           5,
  "Class Teacher":     5,
  "Grade Coordinator": 3,
  "HOD":               4,
  "Principal":         0,
};

export async function loadTimetableRules(): Promise<TimetableRules> {
  try {
    const row = await smartDb.getOne("TimetableRules", RULES_ID);
    if (row) return { ...DEFAULT_TIMETABLE_RULES, ...row };
  } catch {}
  return { ...DEFAULT_TIMETABLE_RULES };
}

export async function saveTimetableRules(rules: TimetableRules): Promise<void> {
  await smartDb.create("TimetableRules", rules as unknown as Record<string, unknown>, RULES_ID);
}

export function getTeacherLimit(role: string, rules?: TimetableRules): number {
  const r = rules ?? DEFAULT_TIMETABLE_RULES;
  if (!role) return r["Teacher"] ?? 5;
  const t = role.trim();
  if (t === "Principal" || t === "Vice Principal") return r["Principal"] ?? 0;
  if (t === "Grade Coordinator") return r["Grade Coordinator"] ?? 3;
  if (t.startsWith("HOD")) return r["HOD"] ?? 4;
  if (t === "Class Teacher") return r["Class Teacher"] ?? 5;
  return r["Teacher"] ?? 5;
}

// ─── Subject → Teacher → Grade → Section mapping ──────────────────────────
// The master academic mapping: a subject can only be taught, in a given
// grade+section, by the teacher explicitly assigned to it in Subject
// Allocation (src/pages/academics/Subjects.tsx → `subject_assignments`
// table). Nothing downstream — timetable, attendance, marks entry,
// gradebook — may pick a teacher outside this mapping.
export interface SubjectAssignment {
  grade: string;
  section: string;
  subject: string;
  teacherName: string;
}

function norm(s: string | undefined | null): string {
  return (s || "").toLowerCase().trim();
}

function sameSection(a: string | undefined, b: string | undefined): boolean {
  return (a || "").toUpperCase().trim() === (b || "").toUpperCase().trim();
}

/** The single teacher assigned to `subject` for `grade`+`section`, or null if unassigned. */
export function findAssignedTeacher(
  assignments: SubjectAssignment[],
  grade: string,
  section: string,
  subject: string
): string | null {
  const match = assignments.find(a =>
    norm(a.grade) === norm(grade) &&
    sameSection(a.section, section) &&
    norm(a.subject) === norm(subject)
  );
  return match?.teacherName || null;
}

/** All subjects that have an assigned teacher for `grade`+`section`. */
export function subjectsAssignedFor(
  assignments: SubjectAssignment[],
  grade: string,
  section: string
): string[] {
  const set = new Set<string>();
  assignments.forEach(a => {
    if (norm(a.grade) === norm(grade) && sameSection(a.section, section) && a.subject) {
      set.add(a.subject);
    }
  });
  return Array.from(set);
}

/**
 * All subjects assigned to ANY section of `grade` (union across A, B, C…).
 * Used where a grade-wide subject list is needed (e.g. exam scheduling
 * for "All Sections") rather than one specific section's allocation.
 */
export function subjectsAssignedForGrade(
  assignments: SubjectAssignment[],
  grade: string
): string[] {
  const set = new Set<string>();
  assignments.forEach(a => {
    if (norm(a.grade) === norm(grade) && a.subject) {
      set.add(a.subject);
    }
  });
  return Array.from(set).sort();
}

/**
 * All subjects assigned to `grade` for ANY of the given `sections` (union).
 * Pass an empty array to mean "All Sections" — falls back to the grade-wide
 * union. Used so exam scheduling only offers a subject once it's actually
 * allocated to a teacher for the specific section(s) the exam covers.
 */
export function subjectsAssignedForGradeSections(
  assignments: SubjectAssignment[],
  grade: string,
  sections: string[]
): string[] {
  if (sections.length === 0) return subjectsAssignedForGrade(assignments, grade);
  const set = new Set<string>();
  assignments.forEach(a => {
    if (norm(a.grade) === norm(grade) && a.subject && sections.some(sec => sameSection(a.section, sec))) {
      set.add(a.subject);
    }
  });
  return Array.from(set).sort();
}

/**
 * Is `teacherName` assigned to teach `subject` in `grade` for ANY of the
 * given `sections`? Pass an empty array for "All Sections" scope (checks
 * across every section of the grade).
 *
 * This is the authoritative access check for exam marks entry — it replaces
 * relying on ExamSlot.subjectTeacher (a single denormalized name copied onto
 * the exam at creation time, which breaks the moment a subject has different
 * teachers across different sections of the same grade-wide exam, and in
 * practice was never actually populated at all).
 */
export function isTeacherAssignedForSubject(
  assignments: SubjectAssignment[],
  teacherName: string,
  grade: string,
  subject: string,
  sections: string[]
): boolean {
  const normT = norm(teacherName);
  if (!normT || !subject) return false;
  return assignments.some(a =>
    norm(a.teacherName) === normT &&
    norm(a.grade) === norm(grade) &&
    norm(a.subject) === norm(subject) &&
    (sections.length === 0 || sections.some(sec => sameSection(a.section, sec)))
  );
}

/** All subjects `teacherName` is assigned to teach for `grade`+`section`. */
export function subjectsAssignedToTeacher(
  assignments: SubjectAssignment[],
  teacherName: string,
  grade: string,
  section: string
): string[] {
  const set = new Set<string>();
  assignments.forEach(a => {
    if (
      norm(a.teacherName) === norm(teacherName) &&
      norm(a.grade) === norm(grade) &&
      sameSection(a.section, section) &&
      a.subject
    ) {
      set.add(a.subject);
    }
  });
  return Array.from(set);
}

/** Whether `teacherName` is the assigned subject teacher for grade+section+subject. */
export function isTeacherAssignedToSubject(
  assignments: SubjectAssignment[],
  teacherName: string,
  grade: string,
  section: string,
  subject: string
): boolean {
  return assignments.some(a =>
    norm(a.teacherName) === norm(teacherName) &&
    norm(a.grade) === norm(grade) &&
    sameSection(a.section, section) &&
    norm(a.subject) === norm(subject)
  );
}
