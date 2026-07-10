// ─── Assessment Attempts — canonical contract ─────────────────────────────────
// The gradebook engine (src/lib/gradebookEngine.ts) reads assessment attempts
// from smartDb table "assessment_attempts" with rows shaped:
//   { studentId, assessmentId, status: "submitted", score }
// That contract is canonical — ALL attempt writers must use it.
//
// Legacy rows may still live in the old "assessment_submissions" table with
// snake_case fields { student_id, assessment_id, marks_obtained, is_marked }.
// getAllAttempts() merges both sources into the canonical shape so readers
// (admin/teacher submission views, student results) see every attempt.

import { smartDb } from "@/lib/localDb";

export interface AttemptRow {
  id: string;
  assessmentId: string;
  studentId: string;
  studentName?: string;
  status: "in_progress" | "submitted";
  score: number | null;
  submittedAt: string | null;
  isMarked: boolean;
  /** true when the row came from the legacy "assessment_submissions" table */
  legacy?: boolean;
  [key: string]: any;
}

/** Normalize a canonical "assessment_attempts" row. */
export function normalizeAttempt(row: any): AttemptRow {
  const score = row.score ?? null;
  return {
    ...row,
    id: String(row.id ?? ""),
    assessmentId: String(row.assessmentId ?? row.assessment_id ?? ""),
    studentId: String(row.studentId ?? row.student_id ?? ""),
    status: row.status === "submitted" || row.submittedAt ? "submitted" : "in_progress",
    score: score != null ? Number(score) : null,
    submittedAt: row.submittedAt ?? row.submitted_at ?? null,
    isMarked: !!(row.isMarked ?? row.is_marked ?? score != null),
  };
}

/** Map a legacy "assessment_submissions" row (snake_case) to the canonical shape. */
export function normalizeLegacySubmission(row: any): AttemptRow {
  const score = row.marks_obtained ?? row.marksObtained ?? null;
  const graded = score != null || !!(row.is_marked ?? row.isMarked);
  return {
    ...row,
    id: String(row.id ?? ""),
    assessmentId: String(row.assessment_id ?? row.assessmentId ?? ""),
    studentId: String(row.student_id ?? row.studentId ?? ""),
    status: graded || row.submitted ? "submitted" : "in_progress",
    score: score != null ? Number(score) : null,
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    isMarked: !!(row.is_marked ?? row.isMarked ?? score != null),
    legacy: true,
  };
}

/**
 * Fetch every attempt: canonical "assessment_attempts" rows merged with legacy
 * "assessment_submissions" rows. Canonical rows win when the same
 * student+assessment pair exists in both tables.
 */
export async function getAllAttempts(): Promise<AttemptRow[]> {
  const [attempts, legacy] = await Promise.all([
    smartDb.getAll("assessment_attempts").catch(() => [] as any[]),
    smartDb.getAll("assessment_submissions").catch(() => [] as any[]),
  ]);
  const canonical = ((attempts as any[]) ?? []).map(normalizeAttempt);
  const seen = new Set(canonical.map(a => `${a.assessmentId}::${a.studentId}`));
  const merged = [...canonical];
  for (const row of ((legacy as any[]) ?? [])) {
    const n = normalizeLegacySubmission(row);
    if (!seen.has(`${n.assessmentId}::${n.studentId}`)) merged.push(n);
  }
  return merged;
}
