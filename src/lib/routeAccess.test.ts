import { describe, it, expect } from "vitest";
import { isRouteAllowed } from "./routeAccess";

// ── Full-access / admin-tier roles ──────────────────────────────────────────
describe("isRouteAllowed - full-access roles", () => {
  it("super_admin (full: true) can reach any sidebar-gated route", () => {
    expect(isRouteAllowed("super_admin", "/students")).toBe(true);
    expect(isRouteAllowed("super_admin", "/finance/fees")).toBe(true);
    expect(isRouteAllowed("super_admin", "/users")).toBe(true); // adminOnly route
    expect(isRouteAllowed("super_admin", "/system-settings")).toBe(true); // adminOnly route
  });

  it("school_owner and admin (both full: true) also pass through unconditionally", () => {
    expect(isRouteAllowed("school_owner", "/finance/scholarships")).toBe(true);
    expect(isRouteAllowed("admin", "/analytics/product")).toBe(true); // adminOnly route
  });

  it("full-access role even reaches layout-exclusive portal prefixes", () => {
    // def.full short-circuits before the LAYOUT_PREFIXES check even runs.
    expect(isRouteAllowed("admin", "/teacher/dashboard")).toBe(true);
    expect(isRouteAllowed("admin", "/student/dashboard")).toBe(true);
    expect(isRouteAllowed("admin", "/parent/dashboard")).toBe(true);
  });
});

// ── Layout-exclusive portal prefixes ─────────────────────────────────────────
describe("isRouteAllowed - LAYOUT_PREFIXES exclusivity", () => {
  it("a teacher-layout role (class_teacher) may reach /teacher/* routes", () => {
    expect(isRouteAllowed("class_teacher", "/teacher/dashboard")).toBe(true);
    expect(isRouteAllowed("class_teacher", "/portals/teacher/anything")).toBe(true);
  });

  it("a teacher-layout role is blocked from /student/* and /parent/* routes", () => {
    expect(isRouteAllowed("class_teacher", "/student/dashboard")).toBe(false);
    expect(isRouteAllowed("class_teacher", "/parent/dashboard")).toBe(false);
  });

  it("a student-layout role may reach /student/* but not /teacher/* or /parent/*", () => {
    expect(isRouteAllowed("student", "/student/results")).toBe(true);
    expect(isRouteAllowed("student", "/teacher/dashboard")).toBe(false);
    expect(isRouteAllowed("student", "/parent/dashboard")).toBe(false);
  });

  it("a parent-layout role may reach /parent/* but not /teacher/* or /student/*", () => {
    expect(isRouteAllowed("parent", "/parent/overview")).toBe(true);
    expect(isRouteAllowed("parent", "/teacher/dashboard")).toBe(false);
    expect(isRouteAllowed("parent", "/student/dashboard")).toBe(false);
  });

  it("exact prefix match (no trailing segment) is also gated the same way", () => {
    expect(isRouteAllowed("class_teacher", "/teacher")).toBe(true);
    expect(isRouteAllowed("student", "/teacher")).toBe(false);
  });

  it("an admin-layout (non-full) role is blocked from every portal-exclusive prefix", () => {
    // principal is layout: "admin", full: undefined
    expect(isRouteAllowed("principal", "/teacher/dashboard")).toBe(false);
    expect(isRouteAllowed("principal", "/student/dashboard")).toBe(false);
    expect(isRouteAllowed("principal", "/parent/dashboard")).toBe(false);
  });
});

// ── Shared Communication routes for non-admin layouts ───────────────────────
describe("isRouteAllowed - SHARED_NON_ADMIN_ROUTES", () => {
  it("student layout can reach shared communication routes even with no groups/items", () => {
    expect(isRouteAllowed("student", "/communication/messages")).toBe(true);
    expect(isRouteAllowed("student", "/communication/announcements")).toBe(true);
    expect(isRouteAllowed("student", "/communication/calendar")).toBe(true);
  });

  it("teacher and parent layouts also reach the shared communication routes", () => {
    expect(isRouteAllowed("class_teacher", "/communication/messages")).toBe(true);
    expect(isRouteAllowed("parent", "/communication/calendar")).toBe(true);
  });

  it("subpaths of a shared route are allowed too (prefix match)", () => {
    expect(isRouteAllowed("student", "/communication/messages/thread-1")).toBe(true);
  });

  it("student layout is NOT granted a non-shared Communication route (Notifications)", () => {
    // Only messages/announcements/calendar are hardcoded shared routes -
    // Notifications is a real Communication-group item but not in the shared list.
    expect(isRouteAllowed("student", "/communication/notifications")).toBe(false);
  });

  it("admin-layout roles do not use the shared-route bypass (they're matched normally)", () => {
    // accountant is admin-layout with groups: ["Finance"] only - Communication
    // group is not granted, so /communication/messages must be denied for it,
    // proving the bypass is gated on def.layout !== "admin".
    expect(isRouteAllowed("accountant", "/communication/messages")).toBe(false);
  });
});

// ── Group-scoped roles via canSeeItem (groups + items overrides) ────────────
describe("isRouteAllowed - group-scoped admin roles", () => {
  it("librarian has no groups but an items override for /library", () => {
    expect(isRouteAllowed("librarian", "/library")).toBe(true);
  });

  it("librarian is blocked from routes outside its items override", () => {
    expect(isRouteAllowed("librarian", "/students")).toBe(false);
    expect(isRouteAllowed("librarian", "/finance/fees")).toBe(false);
  });

  it("accountant (groups: Finance, items: /students) can reach both its group and its item override", () => {
    expect(isRouteAllowed("accountant", "/finance/fees")).toBe(true);
    expect(isRouteAllowed("accountant", "/finance/overview")).toBe(true);
    expect(isRouteAllowed("accountant", "/students")).toBe(true);
  });

  it("accountant is blocked from routes in neither its group nor its items list", () => {
    expect(isRouteAllowed("accountant", "/students/health")).toBe(false);
    expect(isRouteAllowed("accountant", "/behavior")).toBe(false);
  });

  it("nurse (items only, no groups) can reach both of its listed item routes", () => {
    expect(isRouteAllowed("nurse", "/students")).toBe(true);
    expect(isRouteAllowed("nurse", "/students/health")).toBe(true);
  });

  it("a role's group grant covers every item in that group, not just one URL", () => {
    // exam_controller has groups: ["Academics", "Examinations", "Reports", "Intelligence"]
    expect(isRouteAllowed("exam_controller", "/academics/classes")).toBe(true);
    expect(isRouteAllowed("exam_controller", "/exams/setup")).toBe(true);
  });

  it("a role's group grant does not extend to an unlisted group", () => {
    expect(isRouteAllowed("exam_controller", "/finance/fees")).toBe(false);
    expect(isRouteAllowed("exam_controller", "/behavior")).toBe(false);
  });
});

// ── adminOnly items ──────────────────────────────────────────────────────────
describe("isRouteAllowed - adminOnly items", () => {
  it("a non-full role with the containing group still cannot reach an adminOnly item", () => {
    // principal has "Intelligence" in its groups (so /analytics is allowed)
    // but /analytics/product is flagged adminOnly, and principal.isAdmin is
    // not set, so it must be denied despite the group match.
    expect(isRouteAllowed("principal", "/analytics")).toBe(true);
    expect(isRouteAllowed("principal", "/analytics/product")).toBe(false);
  });

  it("a non-full, non-admin role is blocked from /users and /system-settings", () => {
    expect(isRouteAllowed("principal", "/users")).toBe(false);
    expect(isRouteAllowed("principal", "/system-settings")).toBe(false);
  });
});

// ── Unmatched routes ──────────────────────────────────────────────────────────
describe("isRouteAllowed - routes with no sidebar entry", () => {
  it("a pathname not represented in navGroups is left unrestricted", () => {
    expect(isRouteAllowed("librarian", "/some-wizard-page/step-2")).toBe(true);
    expect(isRouteAllowed("student", "/random-detail-page")).toBe(true);
  });
});

// ── Prefix / sub-path matching ────────────────────────────────────────────────
describe("isRouteAllowed - sub-path (prefix) matching", () => {
  it("a sub-path of a granted route is also allowed", () => {
    expect(isRouteAllowed("librarian", "/library/catalog/123")).toBe(true);
  });

  it("a sub-path of a denied route is also denied", () => {
    expect(isRouteAllowed("librarian", "/finance/fees/invoice-1")).toBe(false);
  });

  it("a route name that merely starts with the same characters (no '/' boundary) does not match", () => {
    // "/studentsxyz" must not be treated as a sub-path of "/students".
    expect(isRouteAllowed("librarian", "/studentsxyz")).toBe(true); // unmatched -> unrestricted, not a false due to a bad match
  });
});

// ── Role resolution edge cases ────────────────────────────────────────────────
describe("isRouteAllowed - role resolution edge cases", () => {
  it("null/undefined role resolves to the default 'student' role", () => {
    expect(isRouteAllowed(null, "/student/dashboard")).toBe(true);
    expect(isRouteAllowed(undefined, "/teacher/dashboard")).toBe(false);
  });

  it("legacy alias strings resolve through roles.ts ALIASES (e.g. 'finance' -> accountant)", () => {
    expect(isRouteAllowed("finance", "/finance/fees")).toBe(true);
    expect(isRouteAllowed("finance", "/behavior")).toBe(false);
  });

  it("legacy 'teacher' alias resolves to class_teacher and gets the teacher layout", () => {
    expect(isRouteAllowed("teacher", "/teacher/dashboard")).toBe(true);
    expect(isRouteAllowed("teacher", "/student/dashboard")).toBe(false);
  });

  // KNOWN BUG (not in routeAccess.ts itself, but inherited from roles.ts's
  // getRole): an unrecognized role string silently falls back to full admin
  // access (ROLES.find(admin)), rather than denying access or defaulting to
  // the least-privileged role. routeAccess.ts's def.full check therefore
  // grants unrestricted access to any typo'd/unknown role string. This is
  // called out as deliberate in roles.ts's own comment ("Without this,
  // getRole() falls back to full admin access... silently granting
  // super-admin permissions"), but it's still a real security-relevant
  // footgun worth flagging: any caller that fails to normalize a role string
  // before calling isRouteAllowed gets a fail-OPEN result, not fail-closed.
  it("KNOWN BUG: an unrecognized role string falls back to full admin access (fail-open)", () => {
    expect(isRouteAllowed("totally_unknown_role_xyz", "/system-settings")).toBe(true);
    expect(isRouteAllowed("totally_unknown_role_xyz", "/users")).toBe(true);
  });
});
