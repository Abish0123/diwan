import { describe, it, expect } from "vitest";
import { can, isAdmin, roleLabel } from "./codingRbac";
import type { Permission } from "./codingRbac";

const ALL_PERMISSIONS: Permission[] = [
  "test.create", "test.edit", "test.delete", "test.publish", "test.duplicate",
  "question.manage", "testcase.manage", "bank.manage",
  "proctoring.configure", "grading.configure",
  "assignment.manage", "institution.manage", "student.manage", "instructor.manage",
  "reports.view", "reports.export", "proctoring.view",
  "settings.platform", "audit.view",
  "submission.review", "monitor.view",
];

const INSTRUCTOR_PERMISSIONS: Permission[] = [
  "monitor.view", "submission.review", "reports.view", "proctoring.view",
];

describe("can", () => {
  it("returns false for every permission when role is null", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can(null, perm)).toBe(false);
    }
  });

  it("returns false for every permission when role is empty string", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("", perm)).toBe(false);
    }
  });

  it("grants full ALL permission set to true admin-tier roles (super_admin)", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("super_admin", perm)).toBe(true);
    }
  });

  it("grants full ALL permission set to admin role", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("admin", perm)).toBe(true);
    }
  });

  it("grants full ALL permission set to school_owner (isAdmin: true)", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("school_owner", perm)).toBe(true);
    }
  });

  it("gives student layout roles no permissions at all", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("student", perm)).toBe(false);
    }
  });

  it("gives parent layout roles no permissions at all", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("parent", perm)).toBe(false);
    }
  });

  it("gives teacher layout roles (class_teacher) exactly the INSTRUCTOR permission set", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("class_teacher", perm)).toBe(INSTRUCTOR_PERMISSIONS.includes(perm));
    }
  });

  it("gives teacher layout roles (subject_teacher) exactly the INSTRUCTOR permission set", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("subject_teacher", perm)).toBe(INSTRUCTOR_PERMISSIONS.includes(perm));
    }
  });

  it("gives non-admin-tier admin-layout roles (principal) the INSTRUCTOR permission set, not full ALL access", () => {
    expect(can("principal", "monitor.view")).toBe(true);
    expect(can("principal", "submission.review")).toBe(true);
    expect(can("principal", "reports.view")).toBe(true);
    expect(can("principal", "proctoring.view")).toBe(true);
    // Principal is admin-layout but not isCentralAdmin, so must NOT get destructive/config perms.
    expect(can("principal", "test.delete")).toBe(false);
    expect(can("principal", "grading.configure")).toBe(false);
    expect(can("principal", "settings.platform")).toBe(false);
    expect(can("principal", "bank.manage")).toBe(false);
  });

  it("gives librarian (admin-layout, non-central-admin) INSTRUCTOR-level access only", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("librarian", perm)).toBe(INSTRUCTOR_PERMISSIONS.includes(perm));
    }
  });

  it("resolves an unrecognized role id via the registry fallback instead of crashing", () => {
    // getRole() falls back to the "admin" def for unknown ids, so an
    // unrecognized role id still resolves to a full permission set rather
    // than throwing or silently returning undefined.
    expect(() => can("totally_unknown_role_xyz", "test.create")).not.toThrow();
    for (const perm of ALL_PERMISSIONS) {
      expect(can("totally_unknown_role_xyz", perm)).toBe(true);
    }
  });

  it("resolves legacy alias role strings (e.g. 'staff' -> class_teacher) to INSTRUCTOR access", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(can("staff", perm)).toBe(INSTRUCTOR_PERMISSIONS.includes(perm));
    }
  });

  it("never lets a real registry role id fall through to undefined permissions", () => {
    // Every role bucket must resolve to an array (possibly empty), never throw.
    const roleIds = [
      "super_admin", "school_owner", "admin", "principal", "vice_principal",
      "academic_coordinator", "grade_coordinator", "class_teacher", "subject_teacher",
      "exam_controller", "librarian", "procurement_officer", "accountant",
      "hr_manager", "receptionist", "transport_manager", "nurse", "counselor",
      "parent", "student", "hostel_warden", "event_coordinator", "alumni_coordinator",
    ];
    for (const roleId of roleIds) {
      expect(() => can(roleId, "test.create")).not.toThrow();
    }
  });
});

describe("isAdmin", () => {
  it("returns true for central admin-tier roles", () => {
    expect(isAdmin("super_admin")).toBe(true);
    expect(isAdmin("school_owner")).toBe(true);
    expect(isAdmin("admin")).toBe(true);
  });

  it("returns false for non-central-admin roles even when admin-layout", () => {
    expect(isAdmin("principal")).toBe(false);
    expect(isAdmin("librarian")).toBe(false);
    expect(isAdmin("accountant")).toBe(false);
  });

  it("returns false for teacher/student/parent layout roles", () => {
    expect(isAdmin("class_teacher")).toBe(false);
    expect(isAdmin("student")).toBe(false);
    expect(isAdmin("parent")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(isAdmin(null)).toBe(false);
  });
});

describe("roleLabel", () => {
  it("returns 'Guest' for null role", () => {
    expect(roleLabel(null)).toBe("Guest");
  });

  it("returns 'Guest' for empty string role", () => {
    expect(roleLabel("")).toBe("Guest");
  });

  it("returns the registry label for a known role id", () => {
    expect(roleLabel("admin")).toBe("School Admin");
    expect(roleLabel("super_admin")).toBe("Super Admin");
    expect(roleLabel("class_teacher")).toBe("Class Teacher");
  });

  it("resolves alias role strings to their target label", () => {
    expect(roleLabel("staff")).toBe("Class Teacher");
    expect(roleLabel("teacher")).toBe("Class Teacher");
  });

  it("falls back to the admin label for a fully unrecognized role id", () => {
    expect(roleLabel("nonexistent_role_id")).toBe("School Admin");
  });
});
