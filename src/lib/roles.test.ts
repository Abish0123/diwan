import { describe, it, expect, beforeEach } from "vitest";
import {
  ROLES,
  resolveRoleId,
  setCustomRoles,
  getAllRoles,
  getRole,
  roleLabel,
  isCentralAdmin,
  setRoleGroupOverrides,
  subscribeRoleAccess,
  getEffectiveGroups,
  canSeeGroup,
  canSeeItem,
  canApproveLeave,
  canManageAppraisals,
  buildApprovalChain,
  generateUsername,
  generatePassword,
} from "./roles";

// Reset any runtime/module-level state between tests so tests don't bleed
// into one another (customRoles, roleGroupOverrides, listeners).
beforeEach(() => {
  setCustomRoles([]);
  setRoleGroupOverrides({});
});

describe("resolveRoleId", () => {
  it("returns 'student' for null", () => {
    expect(resolveRoleId(null)).toBe("student");
  });

  it("returns 'student' for undefined", () => {
    expect(resolveRoleId(undefined)).toBe("student");
  });

  it("returns 'student' for empty string", () => {
    expect(resolveRoleId("")).toBe("student");
  });

  it("maps known legacy aliases to their canonical role id", () => {
    expect(resolveRoleId("staff")).toBe("class_teacher");
    expect(resolveRoleId("teacher")).toBe("class_teacher");
    expect(resolveRoleId("hr")).toBe("hr_manager");
    expect(resolveRoleId("finance")).toBe("accountant");
    expect(resolveRoleId("hostel")).toBe("hostel_warden");
    expect(resolveRoleId("transport")).toBe("transport_manager");
    expect(resolveRoleId("procurement")).toBe("procurement_officer");
    expect(resolveRoleId("hod")).toBe("academic_coordinator");
    expect(resolveRoleId("coordinator")).toBe("grade_coordinator");
    expect(resolveRoleId("registrar")).toBe("receptionist");
    expect(resolveRoleId("admin_clerk")).toBe("receptionist");
    expect(resolveRoleId("it_admin")).toBe("admin");
  });

  it("passes through a role id that is not an alias unchanged", () => {
    expect(resolveRoleId("admin")).toBe("admin");
    expect(resolveRoleId("some_unknown_role")).toBe("some_unknown_role");
  });
});

describe("getAllRoles / setCustomRoles", () => {
  it("returns just the static registry when no custom roles are set", () => {
    expect(getAllRoles()).toEqual(ROLES);
  });

  it("appends custom roles after the static registry", () => {
    const custom = [{ id: "custom_1", label: "Custom", description: "d", layout: "admin" as const, prefix: "CUS", badge: "bg-gray-100" }];
    setCustomRoles(custom);
    const all = getAllRoles();
    expect(all.length).toBe(ROLES.length + 1);
    expect(all[all.length - 1]).toEqual(custom[0]);
  });

  it("notifies subscribed listeners when custom roles change", () => {
    let calls = 0;
    const unsubscribe = subscribeRoleAccess(() => { calls++; });
    setCustomRoles([{ id: "x", label: "X", description: "d", layout: "admin", prefix: "X", badge: "b" }]);
    expect(calls).toBe(1);
    unsubscribe();
    setCustomRoles([]);
    expect(calls).toBe(1); // no longer notified after unsubscribe
  });
});

describe("getRole", () => {
  it("finds a known static role by id", () => {
    expect(getRole("librarian").label).toBe("Librarian");
  });

  it("resolves aliases before lookup", () => {
    expect(getRole("teacher").id).toBe("class_teacher");
  });

  it("finds a custom role when not present in the static registry", () => {
    setCustomRoles([{ id: "custom_role", label: "Custom Role", description: "d", layout: "admin", prefix: "CR", badge: "b" }]);
    expect(getRole("custom_role").label).toBe("Custom Role");
  });

  it("falls back to full admin access for an unrecognized role string", () => {
    const r = getRole("totally_made_up_role");
    expect(r.id).toBe("admin");
    expect(r.full).toBe(true);
  });

  it("falls back to admin for null/undefined only if 'student' role somehow missing — but student IS registered, so null resolves to student role", () => {
    // resolveRoleId(null) => "student", and "student" IS in ROLES, so getRole(null) should be the student role, not the admin fallback.
    const r = getRole(null);
    expect(r.id).toBe("student");
  });
});

describe("roleLabel", () => {
  it("returns the human label for a role", () => {
    expect(roleLabel("accountant")).toBe("Accountant");
  });

  it("returns the admin fallback label for an unknown role", () => {
    expect(roleLabel("bogus")).toBe("School Admin");
  });
});

describe("isCentralAdmin", () => {
  it("is true for admin-tier roles", () => {
    expect(isCentralAdmin("super_admin")).toBe(true);
    expect(isCentralAdmin("school_owner")).toBe(true);
    expect(isCentralAdmin("admin")).toBe(true);
  });

  it("is false for non-admin roles", () => {
    expect(isCentralAdmin("principal")).toBe(false);
    expect(isCentralAdmin("student")).toBe(false);
    expect(isCentralAdmin("parent")).toBe(false);
  });

  it("is true for an unrecognized role because it falls back to the admin role", () => {
    expect(isCentralAdmin("nonexistent_role_xyz")).toBe(true);
  });
});

describe("getEffectiveGroups", () => {
  it("returns a static role's default groups when no override exists", () => {
    expect(getEffectiveGroups("hr_manager")).toEqual(["Staff & HR"]);
  });

  it("returns empty array for a role with no groups defined (e.g. class_teacher)", () => {
    expect(getEffectiveGroups("class_teacher")).toEqual([]);
  });

  it("prefers a saved override over the static default", () => {
    setRoleGroupOverrides({ hr_manager: ["Communication"] });
    expect(getEffectiveGroups("hr_manager")).toEqual(["Communication"]);
  });

  it("falls back to a custom role's groups when static lookup misses", () => {
    setCustomRoles([{ id: "custom_2", label: "Custom2", description: "d", layout: "admin", groups: ["Reports"], prefix: "C2", badge: "b" }]);
    expect(getEffectiveGroups("custom_2")).toEqual(["Reports"]);
  });

  it("resolves aliases before checking overrides/groups", () => {
    expect(getEffectiveGroups("hr")).toEqual(["Staff & HR"]);
  });
});

describe("canSeeGroup", () => {
  it("full-access roles can see any group regardless of overrides", () => {
    expect(canSeeGroup("super_admin", "Anything At All")).toBe(true);
    expect(canSeeGroup("admin", "Made Up Group")).toBe(true);
  });

  it("non-full role sees a group that is in its static groups list", () => {
    expect(canSeeGroup("hr_manager", "Staff & HR")).toBe(true);
  });

  it("non-full role does not see a group outside its list", () => {
    expect(canSeeGroup("hr_manager", "Finance")).toBe(false);
  });

  it("respects a runtime override that grants a new group", () => {
    setRoleGroupOverrides({ hr_manager: ["Finance"] });
    expect(canSeeGroup("hr_manager", "Finance")).toBe(true);
    expect(canSeeGroup("hr_manager", "Staff & HR")).toBe(false);
  });
});

describe("canSeeItem", () => {
  it("full-access roles can see any item", () => {
    expect(canSeeItem("admin", "Whatever", "/some/random/url")).toBe(true);
  });

  it("returns true when the group itself is accessible", () => {
    expect(canSeeItem("hr_manager", "Staff & HR", "/staff/anything")).toBe(true);
  });

  it("returns true for an individually allow-listed item even outside accessible groups", () => {
    expect(canSeeItem("librarian", "Some Other Group", "/library")).toBe(true);
  });

  it("returns false when neither the group nor the item is accessible", () => {
    expect(canSeeItem("librarian", "Finance", "/finance/invoices")).toBe(false);
  });

  it("returns false for a role with no items array and no group access", () => {
    expect(canSeeItem("class_teacher", "Finance", "/finance/invoices")).toBe(false);
  });
});

describe("canApproveLeave", () => {
  it("returns true for designated leave approver roles", () => {
    expect(canApproveLeave("admin")).toBe(true);
    expect(canApproveLeave("super_admin")).toBe(true);
    expect(canApproveLeave("school_owner")).toBe(true);
    expect(canApproveLeave("principal")).toBe(true);
    expect(canApproveLeave("vice_principal")).toBe(true);
    expect(canApproveLeave("hr_manager")).toBe(true);
  });

  it("returns false for roles not on the approver list", () => {
    expect(canApproveLeave("class_teacher")).toBe(false);
    expect(canApproveLeave("student")).toBe(false);
    expect(canApproveLeave("parent")).toBe(false);
  });

  it("resolves aliases before checking the approver list", () => {
    expect(canApproveLeave("hr")).toBe(true);
  });

  it("returns false for null/undefined (resolves to student)", () => {
    expect(canApproveLeave(null)).toBe(false);
    expect(canApproveLeave(undefined)).toBe(false);
  });
});

describe("canManageAppraisals", () => {
  it("returns true for appraisal-admin roles", () => {
    expect(canManageAppraisals("admin")).toBe(true);
    expect(canManageAppraisals("hr_manager")).toBe(true);
    expect(canManageAppraisals("principal")).toBe(true);
    expect(canManageAppraisals("vice_principal")).toBe(true);
  });

  it("returns false for a regular teacher — must never see colleagues' scorecards", () => {
    expect(canManageAppraisals("class_teacher")).toBe(false);
    expect(canManageAppraisals("subject_teacher")).toBe(false);
  });
});

describe("buildApprovalChain", () => {
  it("builds a two-step Class Teacher -> Principal chain for student leave", () => {
    const chain = buildApprovalChain("student");
    expect(chain).toEqual([
      { roleId: "class_teacher", label: "Class Teacher", status: "Pending" },
      { roleId: "principal", label: "Principal", status: "Pending" },
    ]);
  });

  it("builds a two-step Principal -> HR Manager chain for staff leave", () => {
    const chain = buildApprovalChain("staff");
    expect(chain).toEqual([
      { roleId: "principal", label: "Principal", status: "Pending" },
      { roleId: "hr_manager", label: "HR Manager", status: "Pending" },
    ]);
  });

  it("every step starts in Pending status", () => {
    const studentChain = buildApprovalChain("student");
    const staffChain = buildApprovalChain("staff");
    expect(studentChain.every(s => s.status === "Pending")).toBe(true);
    expect(staffChain.every(s => s.status === "Pending")).toBe(true);
  });
});

describe("generateUsername", () => {
  it("uses the role's prefix and current-year stamp with a 4-digit sequence", () => {
    const username = generateUsername("librarian");
    expect(username).toMatch(/^LIB2026\d{4}$/);
  });

  it("falls back to USR prefix for an unknown role id", () => {
    const username = generateUsername("no_such_role");
    expect(username).toMatch(/^USR2026\d{4}$/);
  });

  it("increments the sequence counter on each call, producing distinct usernames", () => {
    const first = generateUsername("admin");
    const second = generateUsername("admin");
    expect(first).not.toBe(second);
  });
});

describe("generatePassword", () => {
  it("produces an 8-character password: 2 upper, 3 lower, 3 digits", () => {
    const pwd = generatePassword();
    expect(pwd).toHaveLength(8);
    expect(pwd.slice(0, 2)).toMatch(/^[A-HJ-NP-Z]{2}$/);
    expect(pwd.slice(2, 5)).toMatch(/^[a-km-np-z]{3}$/);
    expect(pwd.slice(5, 8)).toMatch(/^[2-9]{3}$/);
  });

  it("excludes visually-ambiguous characters (I, O, l, o, 0, 1)", () => {
    const pwd = generatePassword();
    expect(pwd).not.toMatch(/[IOol01]/);
  });
});

describe("ROLES registry sanity", () => {
  it("has no duplicate ids", () => {
    const ids = ROLES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every full/isAdmin role is layout 'admin'", () => {
    ROLES.filter(r => r.full || r.isAdmin).forEach(r => {
      expect(r.layout).toBe("admin");
    });
  });

  it("student and parent roles are not admin-tier", () => {
    expect(getRole("student").isAdmin).toBeFalsy();
    expect(getRole("parent").isAdmin).toBeFalsy();
  });
});
