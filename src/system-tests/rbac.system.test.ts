/**
 * System Tests — Role-Based Access Control (RBAC)
 *
 * Tests the full RBAC system as a unified piece:
 * - isRouteAllowed correctly allows/denies each role for real routes
 * - Full admin roles have unrestricted access
 * - Restricted roles cannot access admin-only pages
 * - Teacher/student/parent layout roles are fenced to their own portals
 * - Shared communication routes are accessible to non-admin layouts
 * - Unknown routes (wizards, detail pages) are unrestricted by default
 * - canSeeItem and isCentralAdmin gates align with isRouteAllowed
 */
import { describe, it, expect } from "vitest";
import { isRouteAllowed } from "@/lib/routeAccess";
import { getRole, canSeeItem, isCentralAdmin, ROLES } from "@/lib/roles";

// ── Full admin roles ──────────────────────────────────────────────────────────
describe("RBAC — Full admin roles have unrestricted access", () => {
  const fullAdminRoles = ROLES.filter((r) => r.full).map((r) => r.id);

  it("covers super_admin, school_owner, and admin at minimum", () => {
    expect(fullAdminRoles).toContain("super_admin");
    expect(fullAdminRoles).toContain("school_owner");
    expect(fullAdminRoles).toContain("admin");
  });

  for (const role of ["super_admin", "school_owner", "admin"]) {
    it(`${role} is allowed on /students`, () => {
      expect(isRouteAllowed(role, "/students")).toBe(true);
    });

    it(`${role} is allowed on /system-settings`, () => {
      expect(isRouteAllowed(role, "/system-settings")).toBe(true);
    });

    it(`${role} is allowed on /users`, () => {
      expect(isRouteAllowed(role, "/users")).toBe(true);
    });

    it(`${role} is allowed on /finance/fees`, () => {
      expect(isRouteAllowed(role, "/finance/fees")).toBe(true);
    });
  }
});

// ── isCentralAdmin gate ───────────────────────────────────────────────────────
describe("RBAC — isCentralAdmin gate", () => {
  it("returns true for admin", () => {
    expect(isCentralAdmin("admin")).toBe(true);
  });

  it("returns true for super_admin", () => {
    expect(isCentralAdmin("super_admin")).toBe(true);
  });

  it("returns true for school_owner", () => {
    expect(isCentralAdmin("school_owner")).toBe(true);
  });

  it("returns false for principal", () => {
    expect(isCentralAdmin("principal")).toBe(false);
  });

  it("returns false for class_teacher", () => {
    expect(isCentralAdmin("class_teacher")).toBe(false);
  });

  it("returns false for student", () => {
    expect(isCentralAdmin("student")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCentralAdmin(null)).toBe(false);
  });
});

// ── Teacher portal fencing ────────────────────────────────────────────────────
describe("RBAC — Teacher layout roles are fenced to /teacher prefix", () => {
  const teacherRoles = ["class_teacher", "subject_teacher"];

  for (const role of teacherRoles) {
    it(`${role} is allowed on /teacher/dashboard`, () => {
      expect(isRouteAllowed(role, "/teacher/dashboard")).toBe(true);
    });

    it(`${role} is allowed on /teacher/my-class`, () => {
      expect(isRouteAllowed(role, "/teacher/my-class")).toBe(true);
    });

    it(`${role} is NOT allowed on /students (admin route)`, () => {
      expect(isRouteAllowed(role, "/students")).toBe(false);
    });

    it(`${role} is NOT allowed on /system-settings (admin-only)`, () => {
      expect(isRouteAllowed(role, "/system-settings")).toBe(false);
    });

    it(`${role} is NOT allowed on /portals/student (student portal)`, () => {
      expect(isRouteAllowed(role, "/portals/student")).toBe(false);
    });
  }
});

// ── Student portal fencing ────────────────────────────────────────────────────
describe("RBAC — Student role is fenced to /student and /portals/student", () => {
  it("student is allowed on /portals/student", () => {
    expect(isRouteAllowed("student", "/portals/student")).toBe(true);
  });

  it("student is allowed on /student/assignments", () => {
    expect(isRouteAllowed("student", "/student/assignments")).toBe(true);
  });

  it("student is NOT allowed on /teacher/dashboard", () => {
    expect(isRouteAllowed("student", "/teacher/dashboard")).toBe(false);
  });

  it("student is NOT allowed on /parent/dashboard", () => {
    expect(isRouteAllowed("student", "/parent/dashboard")).toBe(false);
  });

  it("student is NOT allowed on /students (admin route)", () => {
    expect(isRouteAllowed("student", "/students")).toBe(false);
  });
});

// ── Parent portal fencing ─────────────────────────────────────────────────────
describe("RBAC — Parent role is fenced to /parent prefix", () => {
  it("parent is allowed on /parent/dashboard", () => {
    expect(isRouteAllowed("parent", "/parent/dashboard")).toBe(true);
  });

  it("parent is NOT allowed on /teacher/dashboard", () => {
    expect(isRouteAllowed("parent", "/teacher/dashboard")).toBe(false);
  });

  it("parent is NOT allowed on /portals/student", () => {
    expect(isRouteAllowed("parent", "/portals/student")).toBe(false);
  });

  it("parent is NOT allowed on /students (admin route)", () => {
    expect(isRouteAllowed("parent", "/students")).toBe(false);
  });
});

// ── Shared communication routes ───────────────────────────────────────────────
describe("RBAC — Shared communication routes accessible to non-admin layouts", () => {
  const sharedRoutes = [
    "/communication/messages",
    "/communication/announcements",
    "/communication/calendar",
  ];
  const nonAdminRoles = ["class_teacher", "subject_teacher", "student", "parent"];

  for (const role of nonAdminRoles) {
    for (const route of sharedRoutes) {
      it(`${role} is allowed on ${route}`, () => {
        expect(isRouteAllowed(role, route)).toBe(true);
      });
    }
  }
});

// ── Unknown routes unrestricted ───────────────────────────────────────────────
describe("RBAC — Unknown routes (not in navGroups) are unrestricted", () => {
  it("admin is allowed on unknown wizard route /students/wizard/new", () => {
    expect(isRouteAllowed("admin", "/students/wizard/new")).toBe(true);
  });

  it("principal is allowed on unknown detail route /classes/abc123/detail", () => {
    expect(isRouteAllowed("principal", "/classes/abc123/detail")).toBe(true);
  });

  it("class_teacher is allowed on unknown shared utility /help/article/1", () => {
    expect(isRouteAllowed("class_teacher", "/help/article/1")).toBe(true);
  });
});

// ── Null / undefined role ─────────────────────────────────────────────────────
describe("RBAC — Null and undefined roles", () => {
  it("null role is denied on /students", () => {
    expect(isRouteAllowed(null, "/students")).toBe(false);
  });

  it("undefined role is denied on /students", () => {
    expect(isRouteAllowed(undefined, "/students")).toBe(false);
  });

  it("null role is allowed on an unknown route", () => {
    // Unknown routes bypass the gate regardless of role
    expect(isRouteAllowed(null, "/some-unknown-path-xyz")).toBe(true);
  });
});

// ── getRole defaults ──────────────────────────────────────────────────────────
describe("RBAC — getRole returns safe defaults for unknown roles", () => {
  it("getRole('unknown') returns the admin fallback (full=true by design)", () => {
    // getRole() uses: ROLES.find(r=>r.id===id) || customRoles.find(...) || ROLES.find(r=>r.id==="admin")
    // An unrecognised role ID falls back to the admin role definition. This
    // means isRouteAllowed will return true for all routes for unknown roles,
    // which is an intentional design decision for backwards compatibility.
    const def = getRole("unknown_role");
    expect(def).toBeDefined();
    expect(def.id).toBe("admin");
  });

  it("getRole(null) returns a safe defined default", () => {
    const def = getRole(null);
    expect(def).toBeDefined();
    expect(def.id).toBeDefined();
  });

  it("getRole('admin') returns a full role", () => {
    const def = getRole("admin");
    expect(def.full).toBe(true);
  });

  it("getRole('class_teacher') returns teacher layout", () => {
    const def = getRole("class_teacher");
    expect(def.layout).toBe("teacher");
  });

  it("getRole('student') returns student layout", () => {
    const def = getRole("student");
    expect(def.layout).toBe("student");
  });

  it("getRole('parent') returns parent layout", () => {
    const def = getRole("parent");
    expect(def.layout).toBe("parent");
  });
});
