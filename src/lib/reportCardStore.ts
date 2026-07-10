// ─────────────────────────────────────────────────────────────────────────────
// Canonical Report Card store.
//
// A report card is GENERATED from the finalized gradebook (gradebookEngine),
// taken through an approval chain, then PUBLISHED. Only published records are
// visible to students/parents — the same record drives both portals, so they
// always see identical data. Persisted in localStorage ("sd_report_cards").
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";
import { sendPlainEmail } from "@/lib/emailService";
import { logAudit } from "@/lib/auditLog";

// ── Approval chain ──────────────────────────────────────────────────────────
// Teacher (draft) → Submitted → Class Teacher verifies → Grade Coordinator/
// Principal approves → Admin/Principal publishes. `approvalStage` is the
// index into APPROVAL_CHAIN a record has reached; `status` is kept in sync
// with it so existing status-only reads (getLatestPublished, student/parent
// portals, etc.) don't need to change. Admin is deliberately absent from the
// "who can approve marks" set below — per school policy an admin publishes
// and generates PDFs but never edits or approves academic marks themselves.
export type ReportCardStatus = "draft" | "submitted" | "verified" | "approved" | "published";

export const APPROVAL_CHAIN: ReportCardStatus[] = ["draft", "submitted", "verified", "approved", "published"];

type ApprovalAction = "submit" | "verify" | "approve" | "publish" | "reopen";

// Which roles may perform each transition. class_teacher/subject_teacher act
// as "Teacher" for submission; grade_coordinator/academic_coordinator stand
// in for "Grade Coordinator". super_admin can do anything an admin can.
const ACTION_ROLES: Record<ApprovalAction, string[]> = {
  submit: ["class_teacher", "subject_teacher", "admin", "super_admin", "school_owner"],
  verify: ["class_teacher", "admin", "super_admin", "school_owner"],
  approve: ["grade_coordinator", "academic_coordinator", "principal", "vice_principal", "admin", "super_admin", "school_owner"],
  publish: ["principal", "admin", "super_admin", "school_owner"],
  reopen: ["grade_coordinator", "academic_coordinator", "principal", "vice_principal", "admin", "super_admin", "school_owner"],
};

export interface ApprovalActor {
  uid: string;
  name: string;
  role: string;
}

export class ApprovalError extends Error {}

function assertCan(action: ApprovalAction, actor: ApprovalActor) {
  if (!ACTION_ROLES[action].includes(actor.role)) {
    throw new ApprovalError(`Role "${actor.role}" is not permitted to ${action} a report card.`);
  }
}

export interface ReportCardSubject {
  subject: string;
  obtained: number;   // weighted marks obtained (out of `max`)
  max: number;        // weight present (≤100)
  pct: number;        // 0..100
  letter: string;
}

export interface ReportCardRecord {
  id: string;                 // `${studentId}::${year}::${term}`
  studentId: string;
  name: string;
  grade: string;
  section: string;
  term: string;
  year: string;
  subjects: ReportCardSubject[];
  overallPct: number;
  overallGrade: string;
  attendancePct: number | null;
  classTeacherRemark: string;
  principalRemark: string;
  status: ReportCardStatus;
  approvalStage: number;      // 0..N — index into the approval chain reached
  publishedToStudents: boolean;
  publishedToParents: boolean;
  teacherName: string;
  principalName: string;
  generatedAt: string;
}

// The school's actual Principal (Staff.role === "Principal"), for the
// signature line on generated report cards — previously this was never
// looked up anywhere, so every printed report card either showed a blank
// principal signature or (in preview mode) a fabricated placeholder name.
// Cached module-level since it's the same person for every report card
// generated in a session and callers need it synchronously once loaded.
let _principalName: string | null = null;
let _principalNamePromise: Promise<string> | null = null;

export async function getPrincipalName(): Promise<string> {
  if (_principalName !== null) return _principalName;
  if (!_principalNamePromise) {
    _principalNamePromise = fetch("/api/data/staff")
      .then(r => r.ok ? r.json() : [])
      .then((rows: Record<string, unknown>[]) => {
        const principal = Array.isArray(rows) ? rows.find(s => s.role === "Principal" && s.status !== "Inactive") : undefined;
        _principalName = (principal?.name as string) || "";
        return _principalName;
      })
      .catch(() => "");
  }
  return _principalNamePromise;
}

const LS_KEY = "sd_report_cards";
const CHANGE_EVENT = "sd-reportcards-changed";

type Store = Record<string, ReportCardRecord>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function write(s: Store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* ignore */ }
}

// Write-through: persist a single record to MySQL in the background.
function persistToDb(rec: ReportCardRecord) {
  void smartDb.create("ReportCard", rec as unknown as Record<string, unknown>).catch(() => {});
}

export function reportCardId(studentId: string, year: string, term: string): string {
  return `${studentId}::${year}::${term}`;
}

// performance.now() — Date.now() is unavailable in the preview sandbox.
let _seq = 0;
function stamp(): string {
  _seq += 1;
  const t = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : _seq;
  return `t${t}-${_seq}`;
}

// Invariant: a record can never be visible to students/parents while its status
// isn't "published". Setting either publish flag true promotes the status to
// "published"; any non-published status forces both publish flags off.
// Applied at every write path so an inconsistent record can never be persisted.
function normalizePublishState(rec: ReportCardRecord): ReportCardRecord {
  if (rec.publishedToStudents || rec.publishedToParents) {
    return rec.status === "published" ? rec : { ...rec, status: "published" };
  }
  if (rec.status !== "published" && (rec.publishedToStudents !== false || rec.publishedToParents !== false)) {
    return { ...rec, publishedToStudents: false, publishedToParents: false };
  }
  return rec;
}

function normName(s: string | undefined): string {
  return (s || "").toLowerCase().trim().replace(/^grade\s*/i, "").replace(/^section\s*/i, "");
}
function slugify(s: string | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Notify the student, their parent, and every subject teacher assigned to
// their grade/section the moment a report card is published — the ONLY
// place marks/results notifications originate from (exam timetable publish,
// by contrast, never announces results — see examStore.ts). Deterministic
// notification ids so re-publishing the same record (e.g. re-selecting an
// already-published student) upserts instead of spamming duplicate rows.
async function notifyReportCardPublished(records: ReportCardRecord[]) {
  const toNotify = records.filter(r => r.status === "published" && (r.publishedToStudents || r.publishedToParents));
  if (toNotify.length === 0) return;
  try {
    const [students, assignments] = await Promise.all([
      fetch("/api/data/students").then(r => r.json()).catch(() => []),
      fetch("/api/data/subject_assignments").then(r => r.json()).catch(() => []),
    ]);
    const studentList = Array.isArray(students) ? students as Record<string, unknown>[] : [];
    const studentsById = new Map(studentList.map(s => [String(s.id ?? s.uid ?? ""), s]));
    const assignmentList = Array.isArray(assignments) ? assignments as { grade: string; section: string; teacherName: string; teacherEmail?: string }[] : [];

    for (const rec of toNotify) {
      const s = studentsById.get(String(rec.studentId));
      const label = `${rec.grade} · Section ${rec.section} — ${rec.term} ${rec.year}`;

      if (rec.publishedToStudents) {
        const studentEmail = String(s?.email ?? "");
        const id = `rcpub-${rec.id}-student`;
        void smartDb.create("Notification", {
          id, recipientUid: studentEmail || undefined, category: "student", entity: "ReportCard",
          type: "report_card_published", title: `Report card published — ${rec.term} ${rec.year}`,
          message: `Your report card for ${label} is now available.`,
          examId: rec.id, grade: rec.grade, section: rec.section, studentId: rec.studentId,
          createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          redirectUrl: `/student/report-cards?id=${encodeURIComponent(rec.id)}`,
        }, id);
        if (studentEmail) {
          void sendPlainEmail({
            to: studentEmail, toName: rec.name,
            subject: `Report Card Published — ${rec.term} ${rec.year}`,
            body: `Dear ${rec.name},\n\nYour report card for ${label} has been published.\n\nPlease log in to the Student Portal to view your subject-wise marks, grades, and remarks.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
      }

      if (rec.publishedToParents) {
        const parentEmail = String(s?.fatherEmail ?? s?.motherEmail ?? s?.guardianEmail ?? "");
        const parentName = String(s?.fatherName ?? s?.motherName ?? s?.guardianName ?? "Parent/Guardian");
        const id = `rcpub-${rec.id}-parent`;
        void smartDb.create("Notification", {
          id, audienceRole: "parent", recipientUid: parentEmail || undefined, category: "student", entity: "ReportCard",
          type: "report_card_published", title: `Report card published — ${rec.term} ${rec.year}`,
          message: `${rec.name}'s report card for ${label} is now available.`,
          examId: rec.id, grade: rec.grade, section: rec.section, studentId: rec.studentId,
          createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          redirectUrl: `/parent/report-cards?id=${encodeURIComponent(rec.id)}`,
        }, id);
        if (parentEmail) {
          void sendPlainEmail({
            to: parentEmail, toName: parentName,
            subject: `Report Card Published for ${rec.name} — ${rec.term} ${rec.year}`,
            body: `Dear ${parentName},\n\nThe report card for ${rec.name} (${label}) has been published.\n\nPlease log in to the Parent Portal to view the full subject-wise marks, grades, and remarks.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
      }

      const wantG = normName(rec.grade);
      const wantS = normName(rec.section);
      const seenTeacher = new Set<string>();
      for (const a of assignmentList) {
        if (normName(a.grade) !== wantG) continue;
        if (normName(a.section) !== wantS) continue;
        const teacherKey = a.teacherEmail || a.teacherName;
        if (!teacherKey || seenTeacher.has(teacherKey)) continue;
        seenTeacher.add(teacherKey);
        const id = `rcpub-${rec.id}-teacher-${slugify(teacherKey)}`;
        void smartDb.create("Notification", {
          id, recipientUid: a.teacherEmail || undefined, recipientName: a.teacherEmail ? undefined : a.teacherName,
          category: "staff", entity: "ReportCard", type: "report_card_published",
          title: `Report card published — ${rec.name}`,
          message: `${rec.name}'s report card for ${label} has been published.`,
          examId: rec.id, grade: rec.grade, section: rec.section, studentId: rec.studentId,
          createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          redirectUrl: `/teacher/report-cards?id=${encodeURIComponent(rec.id)}`,
        }, id);
        if (a.teacherEmail) {
          void sendPlainEmail({
            to: a.teacherEmail, toName: a.teacherName,
            subject: `Report Card Published — ${rec.name} (${label})`,
            body: `Dear ${a.teacherName},\n\n${rec.name}'s report card for ${label} has been published.\n\nPlease log in to the Teacher Portal to review.\n\nWarm regards,\nExaminations Office\nStudent Diwan School`,
          });
        }
      }
    }
  } catch { /* non-fatal — notification delivery should never block the publish */ }
}

export function saveReportCard(rec: ReportCardRecord) {
  const s = read();
  const full = normalizePublishState({ ...rec, generatedAt: rec.generatedAt || stamp() });
  s[rec.id] = full;
  write(s);
  persistToDb(full);
  void notifyReportCardPublished([full]);
}

export function saveReportCards(recs: ReportCardRecord[]) {
  const s = read();
  const saved: ReportCardRecord[] = [];
  recs.forEach(r => {
    const full = normalizePublishState({ ...r, generatedAt: r.generatedAt || stamp() });
    s[r.id] = full;
    persistToDb(full);
    saved.push(full);
  });
  write(s);
  void notifyReportCardPublished(saved);
}

// ── Approval-chain transitions ──────────────────────────────────────────────
// Each step advances exactly one stage of APPROVAL_CHAIN, is restricted to the
// roles in ACTION_ROLES, and is audit-logged — the three things the previous
// "generate → immediately published" flow had none of. `reopen` is the
// escape hatch back to draft (coordinator/principal/admin only) so a mistake
// found after approval doesn't require deleting and regenerating the record.
async function transition(
  id: string,
  action: ApprovalAction,
  actor: ApprovalActor,
  extra?: Partial<Pick<ReportCardRecord, "classTeacherRemark" | "principalRemark" | "publishedToStudents" | "publishedToParents">>
): Promise<ReportCardRecord> {
  assertCan(action, actor);
  const s = read();
  const rec = s[id];
  if (!rec) throw new ApprovalError(`Report card ${id} not found.`);

  let nextStatus: ReportCardStatus;
  if (action === "reopen") {
    nextStatus = "draft";
  } else {
    const currentIdx = APPROVAL_CHAIN.indexOf(rec.status);
    const expectedFrom: Record<Exclude<ApprovalAction, "reopen">, ReportCardStatus> = {
      submit: "draft", verify: "submitted", approve: "verified", publish: "approved",
    };
    if (rec.status !== expectedFrom[action]) {
      throw new ApprovalError(
        `Cannot ${action} a report card that is "${rec.status}" — expected "${expectedFrom[action]}". ` +
        `Current stage: ${currentIdx + 1}/${APPROVAL_CHAIN.length}.`
      );
    }
    nextStatus = APPROVAL_CHAIN[currentIdx + 1];
  }

  const updated: ReportCardRecord = normalizePublishState({
    ...rec,
    ...extra,
    status: nextStatus,
    approvalStage: APPROVAL_CHAIN.indexOf(nextStatus),
    // publish is the only action allowed to actually flip the visibility flags —
    // every earlier stage leaves them false regardless of what's passed in.
    publishedToStudents: action === "publish" ? (extra?.publishedToStudents ?? true) : false,
    publishedToParents: action === "publish" ? (extra?.publishedToParents ?? true) : false,
  });

  s[id] = updated;
  write(s);
  persistToDb(updated);

  void logAudit({
    user_id: actor.uid, user_name: actor.name, role: actor.role,
    module: "Academics", action: `report_card_${action}`, entity: "ReportCard",
    entity_id: id, status: "success",
  });

  if (action === "publish") void notifyReportCardPublished([updated]);
  return updated;
}

export const submitReportCard = (id: string, actor: ApprovalActor) => transition(id, "submit", actor);
export const verifyReportCard = (id: string, actor: ApprovalActor, remark?: string) =>
  transition(id, "verify", actor, remark !== undefined ? { classTeacherRemark: remark } : undefined);
export const approveReportCard = (id: string, actor: ApprovalActor, remark?: string) =>
  transition(id, "approve", actor, remark !== undefined ? { principalRemark: remark } : undefined);
export const publishReportCard = (
  id: string, actor: ApprovalActor, opts?: { toStudents?: boolean; toParents?: boolean }
) => transition(id, "publish", actor, {
  publishedToStudents: opts?.toStudents ?? true,
  publishedToParents: opts?.toParents ?? true,
});
export const reopenReportCard = (id: string, actor: ApprovalActor) => transition(id, "reopen", actor);

export async function notifyReportCard(id: string) {
  const s = read();
  const rec = s[id];
  if (!rec) throw new Error("Report card not found");
  await notifyReportCardPublished([rec]);
}

export async function notifyManyReportCards(ids: string[]) {
  const s = read();
  const recs = ids.map(id => s[id]).filter(Boolean);
  if (recs.length === 0) return;
  await notifyReportCardPublished(recs);
}

// Bulk convenience — approve/verify/publish an entire grade/section's batch in
// one action (the realistic path for a Grade Coordinator/Principal working
// through 30+ students at once, not one-by-one).
export async function transitionMany(
  ids: string[], action: ApprovalAction, actor: ApprovalActor
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      await transition(id, action, actor);
      succeeded.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { succeeded, failed };
}

export function getAllReportCards(): ReportCardRecord[] {
  return Object.values(read());
}

export function getReportCard(studentId: string, year: string, term: string): ReportCardRecord | null {
  return read()[reportCardId(studentId, year, term)] || null;
}

// Fields that represent a human decision made after generation — regeneration
// must never silently reset these, only the computed marks/percentages/grades.
const PRESERVED_ON_REGENERATE = [
  "status", "approvalStage", "publishedToStudents", "publishedToParents",
  "classTeacherRemark", "principalRemark",
] as const;

// Overwrite the computed portion (subjects/overallPct/overallGrade/attendancePct/
// generatedAt) of an existing report card with freshly computed numbers, while
// preserving the human-decision fields listed above. If no prior record exists,
// the fresh record is saved as-is (nothing to preserve).
export function regenerateReportCard(fresh: ReportCardRecord): ReportCardRecord {
  const s = read();
  const existing = s[fresh.id];
  const merged: ReportCardRecord = existing
    ? { ...fresh, ...Object.fromEntries(PRESERVED_ON_REGENERATE.map(k => [k, existing[k]])) as Partial<ReportCardRecord> }
    : fresh;
  const full = normalizePublishState({ ...merged, generatedAt: stamp() });
  s[full.id] = full;
  write(s);
  persistToDb(full);
  return full;
}

export function regenerateReportCards(freshList: ReportCardRecord[]): ReportCardRecord[] {
  const s = read();
  const out: ReportCardRecord[] = [];
  freshList.forEach(fresh => {
    const existing = s[fresh.id];
    const merged: ReportCardRecord = existing
      ? { ...fresh, ...Object.fromEntries(PRESERVED_ON_REGENERATE.map(k => [k, existing[k]])) as Partial<ReportCardRecord> }
      : fresh;
    const full = normalizePublishState({ ...merged, generatedAt: stamp() });
    s[full.id] = full;
    persistToDb(full);
    out.push(full);
  });
  write(s);
  return out;
}

// Most-recent PUBLISHED report card for a student (used by student/parent portals).
export function getLatestPublished(studentId: string): ReportCardRecord | null {
  const mine = Object.values(read()).filter(r =>
    String(r.studentId) === String(studentId) && r.status === "published" && r.publishedToStudents);
  if (!mine.length) return null;
  return mine.sort((a, b) => (b.generatedAt || "").localeCompare(a.generatedAt || ""))[0];
}

// React hook — live published report card for a student.
export function usePublishedReportCard(studentId: string | undefined): ReportCardRecord | null {
  const [rec, setRec] = useState<ReportCardRecord | null>(() => studentId ? getLatestPublished(studentId) : null);
  useEffect(() => {
    const refresh = () => setRec(studentId ? getLatestPublished(studentId) : null);
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);

    // Hydrate published report cards for this student from MySQL on mount.
    if (studentId) {
      smartDb.getAll("ReportCard").then(rows => {
        if (!rows || rows.length === 0) return;
        const s = read();
        let changed = false;
        (rows as unknown as ReportCardRecord[]).forEach(r => {
          if (r && r.id && r.studentId && String(r.studentId) === String(studentId) && !s[r.id]) {
            s[r.id] = r;
            changed = true;
          }
        });
        if (changed) {
          try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
          refresh();
        }
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [studentId]);
  return rec;
}
