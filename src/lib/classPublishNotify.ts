// Shared "a teacher published something for their section" notifier —
// used by Assignments, Assessments, Flashcard sharing, etc. Mirrors the
// real, working pattern already proven in examStore.ts's
// notifyExamScheduled/notifyExamTimetablePublished (per-student + per-parent
// + class-teacher + leadership-role notifications), instead of the old
// single generic broadcast that only ever reached students filtered by
// grade/section — never parents, never the section's own class teacher,
// never school leadership.
import { smartDb } from "@/lib/localDb";

function slugify(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function canonGrade(g?: string) {
  return String(g || "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}
// Real seeded class-teacher rows store classSection (e.g. "Grade 7-C"), NOT
// assignedGrade/assignedSection — see useTeacherClass.ts for the same fix.
function parseClassSection(cs?: string): { grade: string; section: string } | null {
  const m = String(cs || "").trim().match(/^(.+?)[\s-]+([A-Za-z])$/);
  if (!m) return null;
  return { grade: m[1].trim(), section: m[2].toUpperCase() };
}

const LEADERSHIP_ROLES = ["academic_coordinator", "principal", "vice_principal"];

export interface ClassPublishOptions {
  grade: string;
  section: string;
  entity: string;   // e.g. "Assignment", "Assessment", "FlashCardSet", "Attendance"
  type: string;      // e.g. "assignment_published"
  title: string;
  message: string;   // parent copy gets " (StudentName)" appended automatically
  sourceId: string;  // stable id fragment so re-publishing doesn't duplicate notifications
  redirectUrlStudent?: string;
  redirectUrlParent?: string;
  redirectUrlTeacher?: string;
}

/** Notify every real student + parent in the section, the section's real
 * class (homeroom) teacher, and school leadership roles. Best-effort —
 * failures are swallowed so a notification problem never blocks the publish
 * action itself. */
export async function notifyClassPublish(opts: ClassPublishOptions): Promise<void> {
  try {
    const [students, users] = await Promise.all([
      fetch("/api/data/students").then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/data/users").then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    const wantG = canonGrade(opts.grade);
    const wantS = String(opts.section || "").trim().toUpperCase();
    const matched = (Array.isArray(students) ? students : []).filter((s: any) => {
      const sg = canonGrade(s.grade);
      const ss = String(s.section || "").trim().toUpperCase();
      return sg === wantG && (!wantS || ss === wantS);
    });

    const stamp = new Date().toISOString();
    const jobs: Promise<unknown>[] = [];

    for (const s of matched) {
      const sid = String(s.id ?? s.uid ?? "");
      if (!sid) continue;
      const email = String(s.email ?? "");
      const base = `${slugify(opts.entity)}-${opts.sourceId}-${slugify(sid)}`;

      if (email) {
        const id = `${base}-student`;
        jobs.push(smartDb.create("Notification", {
          id, recipientUid: email, category: "student", entity: opts.entity, type: opts.type,
          title: opts.title, message: opts.message, grade: opts.grade, section: opts.section,
          studentId: sid, time: stamp, read: false, redirectUrl: opts.redirectUrlStudent,
        }, id).catch(() => {}));
      }

      const parentId = `${base}-parent`;
      jobs.push(smartDb.create("Notification", {
        id: parentId, audienceRole: "parent", category: "student", entity: opts.entity, type: opts.type,
        title: opts.title, message: `${opts.message} (${s.name || "your child"})`,
        grade: opts.grade, section: opts.section, studentId: sid,
        time: stamp, read: false, redirectUrl: opts.redirectUrlParent,
      }, parentId).catch(() => {}));
    }

    const classTeachers = (Array.isArray(users) ? users : []).filter((u: any) => {
      const parsed = parseClassSection(u.classSection);
      if (!parsed) return false;
      return canonGrade(parsed.grade) === wantG && parsed.section === wantS;
    });
    for (const t of classTeachers) {
      const email = String(t.email ?? "");
      if (!email) continue;
      const id = `${slugify(opts.entity)}-${opts.sourceId}-classteacher-${slugify(email)}`;
      jobs.push(smartDb.create("Notification", {
        id, recipientUid: email, category: "staff", entity: opts.entity, type: opts.type,
        title: opts.title, message: opts.message, grade: opts.grade, section: opts.section,
        time: stamp, read: false, redirectUrl: opts.redirectUrlTeacher,
      }, id).catch(() => {}));
    }

    for (const role of LEADERSHIP_ROLES) {
      const id = `${slugify(opts.entity)}-${opts.sourceId}-${role}`;
      jobs.push(smartDb.create("Notification", {
        id, audienceRole: role, category: "staff", entity: opts.entity, type: opts.type,
        title: opts.title, message: opts.message, grade: opts.grade, section: opts.section,
        time: stamp, read: false, redirectUrl: opts.redirectUrlTeacher,
      }, id).catch(() => {}));
    }

    await Promise.all(jobs);
  } catch { /* non-fatal — publishing the item itself must not fail because notifications did */ }
}

/** Notify only the section's real class (homeroom) teacher — used e.g. when
 * a subject teacher submits daily attendance, so the class teacher sees it
 * without broadcasting to the whole section's students/parents. */
export async function notifyClassTeacherEvent(opts: {
  grade: string; section: string; entity: string; type: string;
  title: string; message: string; sourceId: string;
  redirectUrl?: string; excludeEmail?: string;
}): Promise<void> {
  try {
    const users = await fetch("/api/data/users").then(r => (r.ok ? r.json() : [])).catch(() => []);
    const wantG = canonGrade(opts.grade);
    const wantS = String(opts.section || "").trim().toUpperCase();
    const classTeachers = (Array.isArray(users) ? users : []).filter((u: any) => {
      const parsed = parseClassSection(u.classSection);
      if (!parsed) return false;
      return canonGrade(parsed.grade) === wantG && parsed.section === wantS;
    });
    const stamp = new Date().toISOString();
    await Promise.all(classTeachers.map((t: any) => {
      const email = String(t.email ?? "");
      if (!email || email === opts.excludeEmail) return Promise.resolve();
      const id = `${slugify(opts.entity)}-${opts.sourceId}-classteacher-${slugify(email)}`;
      return smartDb.create("Notification", {
        id, recipientUid: email, category: "staff", entity: opts.entity, type: opts.type,
        title: opts.title, message: opts.message, grade: opts.grade, section: opts.section,
        time: stamp, read: false, redirectUrl: opts.redirectUrl,
      }, id).catch(() => {});
    }));
  } catch { /* non-fatal */ }
}

/** Notify just the parents of a specific list of students — used e.g. for
 * per-student absence alerts, where broadcasting to the whole section would
 * be wrong (most students weren't absent). Each entry carries its own
 * pre-built message so per-student details (status, marks, etc.) don't need
 * a fragile re-lookup by name. */
export async function notifyParentsOfStudents(
  studentEntries: { id: string; name: string; message: string }[],
  opts: { entity: string; type: string; title: string; sourceId: string; grade: string; section: string; redirectUrl?: string }
): Promise<void> {
  try {
    const stamp = new Date().toISOString();
    await Promise.all(studentEntries.map(s => {
      const id = `${slugify(opts.entity)}-${opts.sourceId}-${slugify(s.id)}-parent`;
      return smartDb.create("Notification", {
        id, audienceRole: "parent", category: "student", entity: opts.entity, type: opts.type,
        title: opts.title, message: s.message, grade: opts.grade, section: opts.section,
        studentId: s.id, time: stamp, read: false, redirectUrl: opts.redirectUrl,
      }, id).catch(() => {});
    }));
  } catch { /* non-fatal */ }
}

/** There's no server-side cron in this app, so a "Schedule for later"
 * assessment only actually goes live (status "Upcoming" -> "Active" +
 * real notifications fired) once someone's browser loads a page that
 * calls this — wired into the teacher/student/parent assessment list
 * pages so whichever loads first past the scheduled time flips it.
 * Idempotent: notifyClassPublish's deterministic per-recipient ids mean
 * calling this redundantly across multiple viewers never double-notifies. */
export async function publishDueScheduledAssessments<T extends { id: string; status: string; scheduledAt?: string; grade: string; section: string; type?: string; title: string; subject: string; date?: string }>(
  rows: T[]
): Promise<T[]> {
  const now = new Date();
  const due = rows.filter(a => a.status === "Upcoming" && a.scheduledAt && new Date(a.scheduledAt) <= now);
  if (!due.length) return rows;
  await Promise.all(due.map(async (a) => {
    try {
      await smartDb.update("assessments", a.id, { status: "Active" });
      await notifyClassPublish({
        grade: a.grade, section: a.section,
        entity: "Assessment", type: "assessment_published",
        title: `New ${a.type || "Assessment"}: ${a.title}`,
        message: `${a.subject} ${(a.type || "assessment").toLowerCase()} has been posted${a.section ? ` for Section ${a.section}` : ""}${a.date ? ` — ${a.date}` : ""}.`,
        sourceId: a.id,
        redirectUrlStudent: "/student/assessments",
        redirectUrlParent: "/parent/assessments",
        redirectUrlTeacher: "/teacher/assessments",
      });
    } catch { /* best-effort — this viewer's load shouldn't break because publishing one due assessment failed */ }
  }));
  const dueIds = new Set(due.map(a => a.id));
  return rows.map(a => dueIds.has(a.id) ? { ...a, status: "Active" } : a);
}
