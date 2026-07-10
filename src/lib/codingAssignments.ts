import { AssessmentAssignment } from "@/types/coding";

export interface StudentProfile {
  name?: string;
  email?: string;
  classLabel?: string; // e.g. "Grade 10-A" — the school's real grade/section
  matched: boolean; // true if the logged-in user mapped to an enrolled student
}

type AnyRec = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

/**
 * Maps the logged-in user to an enrolled student (by email) and derives the
 * real class (Grade + Section) used to decide which tests are assigned.
 */
export function resolveStudentProfile(
  user: { email?: string | null; displayName?: string | null } | null,
  students: AnyRec[],
): StudentProfile {
  const email = (user?.email || "").toLowerCase();
  const rec = students.find((s) => str(s.email).toLowerCase() === email && email !== "");

  if (!rec) {
    return { name: user?.displayName || undefined, email, matched: false };
  }

  const classLabel =
    str(rec.classId) ||
    (rec.grade && rec.section ? `Grade ${str(rec.grade)}-${str(rec.section)}` : undefined);

  return { name: str(rec.name) || undefined, email, classLabel, matched: true };
}

/** Whether a single assignment applies to a given student. */
export function assignmentAppliesTo(a: AssessmentAssignment, p: StudentProfile): boolean {
  const label = (a.targetLabel || "").toLowerCase();
  switch (a.targetType) {
    case "student":
      return (!!p.email && label.includes(p.email)) || (!!p.name && label.includes(p.name.toLowerCase()));
    case "class":
      return !!p.classLabel && label.startsWith(p.classLabel.toLowerCase());
    default:
      return false;
  }
}

export interface TestVisibility {
  /** open = no assignments exist for this test, so it's available to everyone */
  open: boolean;
  /** the assignment that applies to this student (if any) */
  assignment: AssessmentAssignment | null;
  visible: boolean;
}

export function testVisibility(
  testId: string,
  assignments: AssessmentAssignment[],
  profile: StudentProfile,
): TestVisibility {
  const forTest = assignments.filter((a) => a.testId === testId);
  if (forTest.length === 0) return { open: true, assignment: null, visible: true };
  const match = forTest.find((a) => assignmentAppliesTo(a, profile)) || null;
  return { open: false, assignment: match, visible: !!match };
}
