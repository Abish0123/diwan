// Gradebook manual-correction + approval workflow — real data model shared
// between TeacherGradebook.tsx (subject teacher enters overrides, submits;
// class teacher reviews their own homeroom) and academics/Gradebook.tsx
// (Grade Coordinators give final sign-off, admin gets a read-only oversight
// view). Marks themselves stay auto-computed from Assignments/Assessments/
// Exams — this only lets a human correct a specific cell when the automatic
// number is wrong, with a reason, and routes that correction through real
// review instead of silently overwriting the source data.
import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";

export type SubmissionStatus =
  | "Draft"
  | "Submitted to Class Teacher"
  | "Returned to Subject Teacher"
  | "Submitted to Grade Coordinator"
  | "Submitted to Principal"
  | "Approved by Principal";

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  "Draft": "bg-slate-100 text-slate-600 border-slate-200",
  "Submitted to Class Teacher": "bg-blue-50 text-blue-700 border-blue-200",
  "Returned to Subject Teacher": "bg-rose-50 text-rose-700 border-rose-200",
  "Submitted to Grade Coordinator": "bg-amber-50 text-amber-700 border-amber-200",
  "Submitted to Principal": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Approved by Principal": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export interface GradebookSubmission {
  id: string; // `${grade}|${section}|${subject}|${term}`
  grade: string;
  section: string;
  subject: string;
  term: string;
  status: SubmissionStatus;
  subjectTeacherName?: string;
  classTeacherName?: string;
  gradeCoordinatorName?: string;
  principalName?: string;
  returnReason?: string;
  history: { at: string; by: string; action: string; note?: string }[];
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function submissionKey(grade: string, section: string, subject: string, term: string) {
  return `${grade}|${section}|${subject}|${term}`;
}

export async function getSubmission(grade: string, section: string, subject: string, term: string): Promise<GradebookSubmission | null> {
  const id = submissionKey(grade, section, subject, term);
  const row = await smartDb.getOne<GradebookSubmission>("GradebookSubmission", id);
  return row || null;
}

export async function getAllSubmissions(): Promise<GradebookSubmission[]> {
  const rows = (await smartDb.getAll("GradebookSubmission", undefined)) as GradebookSubmission[];
  return rows || [];
}

// The Principal is school-wide, not scoped per grade like a Grade
// Coordinator — there's exactly one real account with this role to route the
// final approval step to.
export async function getPrincipalName(): Promise<string> {
  const users = (await smartDb.getAll("User", undefined)) as any[];
  const principal = (users || []).find((u) => u.role === "principal");
  return principal?.name || principal?.displayName || "";
}

async function saveSubmission(sub: GradebookSubmission) {
  await smartDb.create("GradebookSubmission", { ...sub, updatedAt: new Date().toISOString() }, sub.id);
}

export async function submitToClassTeacher(params: {
  grade: string; section: string; subject: string; term: string;
  subjectTeacherName: string; classTeacherName?: string;
}) {
  const id = submissionKey(params.grade, params.section, params.subject, params.term);
  const existing = await getSubmission(params.grade, params.section, params.subject, params.term);
  const sub: GradebookSubmission = {
    id, grade: params.grade, section: params.section, subject: params.subject, term: params.term,
    status: "Submitted to Class Teacher",
    subjectTeacherName: params.subjectTeacherName,
    classTeacherName: params.classTeacherName,
    gradeCoordinatorName: existing?.gradeCoordinatorName,
    history: [...(existing?.history || []), { at: new Date().toISOString(), by: params.subjectTeacherName, action: "Submitted to Class Teacher" }],
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await saveSubmission(sub);
  await pushNotify({
    title: "Gradebook Submitted for Review",
    message: `${params.subjectTeacherName} submitted ${params.subject} marks (${params.grade} · Section ${params.section}, ${params.term}) for your review.`,
    audienceRole: "staff", recipientName: params.classTeacherName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  return sub;
}

export async function classTeacherApprove(sub: GradebookSubmission, classTeacherName: string, gradeCoordinatorName?: string) {
  const updated: GradebookSubmission = {
    ...sub,
    status: "Submitted to Grade Coordinator",
    classTeacherName,
    gradeCoordinatorName,
    history: [...sub.history, { at: new Date().toISOString(), by: classTeacherName, action: "Approved and escalated to Grade Coordinator" }],
  };
  await saveSubmission(updated);
  await pushNotify({
    title: "Gradebook Awaiting Final Approval",
    message: `${classTeacherName} approved ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}) and sent them to you for final sign-off.`,
    audienceRole: "staff", recipientName: gradeCoordinatorName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  await pushNotify({
    title: "Marks Approved by Class Teacher",
    message: `Your ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}) were approved by ${classTeacherName} and sent for final approval.`,
    audienceRole: "staff", recipientName: sub.subjectTeacherName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  return updated;
}

export async function classTeacherReturn(sub: GradebookSubmission, classTeacherName: string, reason: string) {
  const updated: GradebookSubmission = {
    ...sub,
    status: "Returned to Subject Teacher",
    classTeacherName,
    returnReason: reason,
    history: [...sub.history, { at: new Date().toISOString(), by: classTeacherName, action: "Returned to Subject Teacher", note: reason }],
  };
  await saveSubmission(updated);
  await pushNotify({
    title: "Gradebook Returned for Corrections",
    message: `${classTeacherName} returned your ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}): "${reason}"`,
    audienceRole: "staff", recipientName: sub.subjectTeacherName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  return updated;
}

export async function gradeCoordinatorApprove(sub: GradebookSubmission, gradeCoordinatorName: string, principalName?: string) {
  const updated: GradebookSubmission = {
    ...sub,
    status: "Submitted to Principal",
    gradeCoordinatorName,
    principalName,
    history: [...sub.history, { at: new Date().toISOString(), by: gradeCoordinatorName, action: "Approved and escalated to Principal" }],
  };
  await saveSubmission(updated);
  await pushNotify({
    title: "Gradebook Awaiting Final Approval",
    message: `${gradeCoordinatorName} approved ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}) and sent them to you for final sign-off.`,
    audienceRole: "staff", recipientName: principalName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  await pushNotify({
    title: "Marks Approved by Grade Coordinator",
    message: `Your ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}) were approved by ${gradeCoordinatorName} and sent to the Principal for final approval.`,
    audienceRole: "staff", recipientName: sub.subjectTeacherName,
    category: "gradebook", entity: "GradebookSubmission",
  });
  return updated;
}

export async function principalApprove(sub: GradebookSubmission, principalName: string) {
  const updated: GradebookSubmission = {
    ...sub,
    status: "Approved by Principal",
    principalName,
    history: [...sub.history, { at: new Date().toISOString(), by: principalName, action: "Final approval" }],
  };
  await saveSubmission(updated);
  const recipients = [sub.subjectTeacherName, sub.classTeacherName, sub.gradeCoordinatorName].filter(Boolean) as string[];
  for (const name of recipients) {
    await pushNotify({
      title: "Gradebook Finalized",
      message: `${principalName} gave final approval on ${sub.subject} marks for ${sub.grade} · Section ${sub.section} (${sub.term}).`,
      audienceRole: "staff", recipientName: name,
      category: "gradebook", entity: "GradebookSubmission",
    });
  }
  return updated;
}

// ── Manual mark corrections ─────────────────────────────────────────────────
export interface MarkOverride {
  id: string; // `${studentId}|${subject}|${columnKey}|${term}`
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  subject: string;
  term: string;
  columnKey: string;
  columnLabel: string;
  originalValue: number | null;
  overrideValue: number;
  reason: string;
  overriddenBy: string;
  uid?: string;
  createdAt?: string;
}

export function overrideKey(studentId: string, subject: string, columnKey: string, term: string) {
  return `${studentId}|${subject}|${columnKey}|${term}`;
}

export async function getOverridesFor(grade: string, section: string, subject: string, term: string): Promise<MarkOverride[]> {
  const all = (await smartDb.getAll("MarkOverride", undefined)) as MarkOverride[];
  return (all || []).filter((o) => o.grade === grade && o.section === section && o.subject === subject && o.term === term);
}

export async function saveMarkOverride(o: MarkOverride) {
  await smartDb.create("MarkOverride", { ...o, createdAt: new Date().toISOString() }, o.id);
}
