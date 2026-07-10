// Role-based access control for the Coding Assessment admin module.
//
// `role` from useAuth() is a free string — any of the 21 role ids in the
// central registry (src/lib/roles.ts: principal, librarian, accountant,
// class_teacher, ...), not just "admin"/"staff"/"student". This module used
// to assume only those three literal strings and index straight into a
// lookup keyed by them — any other real role id (i.e. most of the registry)
// hit `ROLE_PERMISSIONS[role]` === undefined and crashed the whole page on
// `.includes()`. Every role id must resolve to a bucket below; none may fall
// through to undefined.
import { getRole, isCentralAdmin } from "@/lib/roles";

export type AppRole = string | null;

export type Permission =
  | "test.create" | "test.edit" | "test.delete" | "test.publish" | "test.duplicate"
  | "question.manage" | "testcase.manage" | "bank.manage"
  | "proctoring.configure" | "grading.configure"
  | "assignment.manage" | "institution.manage" | "student.manage" | "instructor.manage"
  | "reports.view" | "reports.export" | "proctoring.view"
  | "settings.platform" | "audit.view"
  | "submission.review" | "monitor.view";

const ALL: Permission[] = [
  "test.create", "test.edit", "test.delete", "test.publish", "test.duplicate",
  "question.manage", "testcase.manage", "bank.manage",
  "proctoring.configure", "grading.configure",
  "assignment.manage", "institution.manage", "student.manage", "instructor.manage",
  "reports.view", "reports.export", "proctoring.view",
  "settings.platform", "audit.view",
  "submission.review", "monitor.view",
];

// Instructor: view, monitor, review, reports — but cannot delete tests,
// modify the grading engine, proctoring rules, or question banks.
const INSTRUCTOR: Permission[] = [
  "monitor.view", "submission.review", "reports.view", "proctoring.view",
];

// Every one of the 21 real role ids buckets into exactly one of these three —
// resolved via the central registry's `layout`/`isAdmin` fields, which are
// already defined for every role (including future ones added there), so
// this never needs updating in lockstep with the role registry the way a
// literal id switch would.
function permissionsFor(role: AppRole): Permission[] {
  if (!role) return [];
  const def = getRole(role); // registry itself never throws — falls back to "admin" def for unknown ids
  if (def.layout === "student" || def.layout === "parent") return [];
  if (def.layout === "teacher") return INSTRUCTOR;
  // layout === "admin": true admins get full control; every other admin-tier
  // role (principal, librarian, accountant, ...) gets read/monitor access
  // rather than silently getting either full control or nothing.
  return isCentralAdmin(role) ? ALL : INSTRUCTOR;
}

export function can(role: AppRole, perm: Permission): boolean {
  return permissionsFor(role).includes(perm);
}

export function isAdmin(role: AppRole): boolean {
  return isCentralAdmin(role);
}

export function roleLabel(role: AppRole): string {
  if (!role) return "Guest";
  return getRole(role).label;
}
