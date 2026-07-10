// ── Announcement audience enforcement ───────────────────────────────────────
// Single source of truth for "can this viewer see this announcement?". Every
// read path that displays Notice rows (shared /communication/announcements
// page, teacher/student/parent dashboards, admin Notice Board widget) must
// filter through here — the create form collects targetAudience/targetClass,
// and this is the one place that actually enforces them.

import { getRole } from "@/lib/roles";

/** The subset of Notice fields the audience check needs. */
export interface AnnouncementAudienceFields {
  status?: string;
  targetAudience?: string; // "All" | "Students" | "Staff" | "Parents"
  targetClass?: string;    // e.g. "Grade 5-B" — empty = school-wide
}

export type AudienceGroup = "admin" | "student" | "staff" | "parent";

/** Grade/section of the viewer (student) or of a parent's child. */
export interface ViewerClass {
  grade?: string;
  section?: string;
}

/**
 * Map any of the 21 registry role ids onto an audience group.
 * Central admins are the management console and see everything; every other
 * non-student/non-parent role (teachers, principal, librarian, …) is Staff.
 */
export function audienceGroupForRole(role: string | null | undefined): AudienceGroup {
  const def = getRole(role);
  if (def.isAdmin) return "admin";
  if (def.layout === "student") return "student";
  if (def.layout === "parent") return "parent";
  return "staff";
}

const norm = (v: string | null | undefined) =>
  String(v || "").trim().toLowerCase().replace(/\s*-\s*/g, "-");

/**
 * Does a targetClass like "Grade 5-B" match a viewer whose grade is
 * "Grade 5" and section "B" (or "Section B")? An empty targetClass is
 * school-wide and matches everyone; a set targetClass never matches a
 * viewer whose class is unknown.
 */
export function classMatchesViewer(targetClass: string | undefined, viewer: ViewerClass): boolean {
  const target = norm(targetClass);
  if (!target) return true; // school-wide
  const grade = norm(viewer.grade);
  if (!grade) return false; // class-targeted but viewer class unknown → hidden
  if (target === grade) return true; // targeted at the whole grade
  const section = norm(viewer.section).replace(/^section-?\s*/, "");
  return !!section && target === `${grade}-${section}`;
}

/**
 * Core rule. Admin (management console) sees everything. Everyone else sees
 * only Published announcements whose targetAudience matches their group
 * ("All" is always visible), and — for students/parents — whose targetClass
 * matches their own class / one of their children's classes.
 */
export function canViewAnnouncement(
  announcement: AnnouncementAudienceFields,
  role: string | null | undefined,
  viewerClasses?: ViewerClass[],
): boolean {
  const group = audienceGroupForRole(role);
  if (group === "admin") return true;

  if (announcement.status && announcement.status !== "Published") return false;

  const audience = announcement.targetAudience || "All";
  if (audience !== "All") {
    if (group === "student" && audience !== "Students") return false;
    if (group === "staff" && audience !== "Staff") return false;
    if (group === "parent" && audience !== "Parents") return false;
  }

  // Class targeting only constrains students and parents; staff see grade-wide
  // notices regardless of class (they may teach any class).
  if ((group === "student" || group === "parent") && announcement.targetClass) {
    const classes = viewerClasses || [];
    return classes.some((c) => classMatchesViewer(announcement.targetClass, c));
  }

  return true;
}

/** Convenience filter used by every list-rendering read path. */
export function filterAnnouncementsForViewer<T extends AnnouncementAudienceFields>(
  announcements: T[],
  role: string | null | undefined,
  viewerClasses?: ViewerClass[],
): T[] {
  return announcements.filter((a) => canViewAnnouncement(a, role, viewerClasses));
}
