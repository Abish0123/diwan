import { describe, it, expect } from "vitest";
import { messagingTier, canMessage, canMessageAny, TIER_LABEL } from "./messagingPermissions";

describe("messagingTier", () => {
  it("maps full-access roles to admin tier", () => {
    expect(messagingTier("super_admin")).toBe("admin");
    expect(messagingTier("school_owner")).toBe("admin");
    expect(messagingTier("admin")).toBe("admin");
  });

  it("maps accountant to the finance tier", () => {
    expect(messagingTier("accountant")).toBe("finance");
  });

  it("maps hr_manager to the hr tier", () => {
    expect(messagingTier("hr_manager")).toBe("hr");
  });

  it("maps teacher-layout roles to the teacher tier", () => {
    expect(messagingTier("class_teacher")).toBe("teacher");
    expect(messagingTier("subject_teacher")).toBe("teacher");
  });

  it("maps parent-layout roles to the parent tier", () => {
    expect(messagingTier("parent")).toBe("parent");
  });

  it("maps student-layout roles to the student tier", () => {
    expect(messagingTier("student")).toBe("student");
  });

  it("falls back non-admin, non-tiered roles to the staff tier", () => {
    expect(messagingTier("principal")).toBe("staff");
    expect(messagingTier("librarian")).toBe("staff");
    expect(messagingTier("nurse")).toBe("staff");
    expect(messagingTier("counselor")).toBe("staff");
    expect(messagingTier("receptionist")).toBe("staff");
  });

  // KNOWN BUG: resolveRoleId() (src/lib/roles.ts) treats any falsy role
  // (null/undefined/"") as "student", but an unrecognized non-empty string
  // id falls through to the ROLES "admin" definition instead. So a missing
  // role and a garbage/typo'd role resolve to two completely different
  // messaging tiers, which is an inconsistent way to handle "I don't know
  // this role" — most likely the caller wanted the same safe default in
  // both cases.
  it("resolves a missing role id to the student tier but an unrecognized id to the admin tier", () => {
    expect(messagingTier(null)).toBe("student");
    expect(messagingTier(undefined)).toBe("student");
    expect(messagingTier("totally_bogus_role")).toBe("admin");
  });
});

describe("TIER_LABEL", () => {
  it("has a human label for every messaging tier", () => {
    expect(TIER_LABEL.admin).toBe("Admin");
    expect(TIER_LABEL.staff).toBe("Staff");
    expect(TIER_LABEL.teacher).toBe("Teacher");
    expect(TIER_LABEL.finance).toBe("Finance");
    expect(TIER_LABEL.hr).toBe("HR");
    expect(TIER_LABEL.parent).toBe("Parent");
    expect(TIER_LABEL.student).toBe("Student");
  });
});

describe("canMessage", () => {
  it("allows admin to message every tier", () => {
    expect(canMessage("admin", "student")).toBe(true);
    expect(canMessage("admin", "parent")).toBe(true);
    expect(canMessage("admin", "accountant")).toBe(true);
    expect(canMessage("admin", "hr_manager")).toBe(true);
  });

  it("allows teacher to message parent and student (teacher-initiated)", () => {
    expect(canMessage("class_teacher", "parent")).toBe(true);
    expect(canMessage("class_teacher", "student")).toBe(true);
  });

  it("allows a permitted reply even when only the other side can initiate", () => {
    // hr can initiate to teacher, teacher cannot initiate to hr — but the
    // relationship must be permitted in both directions once it exists.
    expect(canMessage("hr_manager", "class_teacher")).toBe(true);
    expect(canMessage("class_teacher", "hr_manager")).toBe(true);
  });

  it("blocks tiers with no overlapping initiation rights in either direction", () => {
    // finance cannot initiate to teacher, and teacher cannot initiate to finance
    expect(canMessage("accountant", "class_teacher")).toBe(false);
    expect(canMessage("class_teacher", "accountant")).toBe(false);
  });

  it("blocks student from messaging finance directly", () => {
    expect(canMessage("student", "accountant")).toBe(false);
    expect(canMessage("accountant", "student")).toBe(false);
  });

  it("blocks parent from messaging student (neither initiates to the other)", () => {
    expect(canMessage("parent", "student")).toBe(false);
    expect(canMessage("student", "parent")).toBe(false);
  });

  it("allows staff to message every other tier", () => {
    expect(canMessage("principal", "student")).toBe(true);
    expect(canMessage("principal", "accountant")).toBe(true);
    expect(canMessage("principal", "hr_manager")).toBe(true);
  });

  it("allows teacher-teacher messaging (tier lists itself as a valid initiation target)", () => {
    expect(canMessage("class_teacher", "subject_teacher")).toBe(true);
  });

  it("blocks student-student messaging (student tier is not in its own initiate list)", () => {
    expect(canMessage("student", "student")).toBe(false);
  });

  it("treats a missing role as the student tier, which cannot message another student", () => {
    expect(canMessage(null, "student")).toBe(false);
    expect(canMessage(undefined, undefined)).toBe(false);
  });
});

describe("canMessageAny", () => {
  it("returns true for an empty target list (vacuous truth)", () => {
    expect(canMessageAny("student", [])).toBe(true);
  });

  it("returns true only when every target is messageable", () => {
    expect(canMessageAny("admin", ["student", "parent", "accountant"])).toBe(true);
  });

  it("returns false if any single target is not messageable", () => {
    expect(canMessageAny("class_teacher", ["parent", "student", "accountant"])).toBe(false);
  });

  it("returns false as soon as the first blocked target is hit", () => {
    expect(canMessageAny("accountant", ["admin", "class_teacher"])).toBe(false);
  });
});
