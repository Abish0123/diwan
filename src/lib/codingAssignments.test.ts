import { describe, it, expect } from "vitest";
import { resolveStudentProfile, assignmentAppliesTo, testVisibility } from "./codingAssignments";
import { AssessmentAssignment } from "@/types/coding";

function assignment(overrides: Partial<AssessmentAssignment> = {}): AssessmentAssignment {
  return {
    testId: "t1",
    targetType: "student",
    targetLabel: "",
    ...overrides,
  } as AssessmentAssignment;
}

describe("resolveStudentProfile", () => {
  const students = [
    { email: "Jane@Example.com", name: "Jane Doe", classId: "Grade 10-A" },
    { email: "no-class@example.com", name: "No Class", grade: "9", section: "B" },
    { email: "bare@example.com", name: "Bare Student" },
  ];

  it("matches a student by case-insensitive email and returns classId when present", () => {
    const profile = resolveStudentProfile({ email: "jane@example.com" }, students);
    expect(profile.matched).toBe(true);
    expect(profile.name).toBe("Jane Doe");
    expect(profile.email).toBe("jane@example.com");
    expect(profile.classLabel).toBe("Grade 10-A");
  });

  it("derives classLabel from grade+section when classId is absent", () => {
    const profile = resolveStudentProfile({ email: "no-class@example.com" }, students);
    expect(profile.matched).toBe(true);
    expect(profile.classLabel).toBe("Grade 9-B");
  });

  it("leaves classLabel undefined when neither classId nor grade/section are present", () => {
    const profile = resolveStudentProfile({ email: "bare@example.com" }, students);
    expect(profile.matched).toBe(true);
    expect(profile.classLabel).toBeUndefined();
  });

  it("returns matched:false and falls back to displayName when no student record matches", () => {
    const profile = resolveStudentProfile({ email: "missing@example.com", displayName: "Ghost User" }, students);
    expect(profile.matched).toBe(false);
    expect(profile.name).toBe("Ghost User");
    expect(profile.email).toBe("missing@example.com");
    expect(profile.classLabel).toBeUndefined();
  });

  it("treats null user as unmatched with empty email and undefined name", () => {
    const profile = resolveStudentProfile(null, students);
    expect(profile.matched).toBe(false);
    expect(profile.email).toBe("");
    expect(profile.name).toBeUndefined();
  });

  it("never matches when the user has no email (guards against blank-email records matching each other)", () => {
    const studentsWithBlankEmail = [{ email: "", name: "Blank Email Student" }];
    const profile = resolveStudentProfile({ email: "" }, studentsWithBlankEmail);
    expect(profile.matched).toBe(false);
  });

  it("lowercases the resolved email even when the matching record has mixed case", () => {
    const profile = resolveStudentProfile({ email: "JANE@EXAMPLE.COM" }, students);
    expect(profile.email).toBe("jane@example.com");
    expect(profile.matched).toBe(true);
  });
});

describe("assignmentAppliesTo", () => {
  it("matches a student-targeted assignment by email substring", () => {
    const a = assignment({ targetType: "student", targetLabel: "jane@example.com" });
    const p = { email: "jane@example.com", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(true);
  });

  it("matches a student-targeted assignment by name substring (case-insensitive)", () => {
    const a = assignment({ targetType: "student", targetLabel: "Jane Doe (Grade 10-A)" });
    const p = { email: "other@example.com", name: "Jane Doe", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(true);
  });

  it("does not match a student-targeted assignment when neither email nor name appear in the label", () => {
    const a = assignment({ targetType: "student", targetLabel: "someone-else@example.com" });
    const p = { email: "jane@example.com", name: "Jane Doe", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(false);
  });

  it("matches a class-targeted assignment when the label starts with the student's classLabel", () => {
    const a = assignment({ targetType: "class", targetLabel: "grade 10-a" });
    const p = { email: "jane@example.com", classLabel: "Grade 10-A", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(true);
  });

  it("does not match a class-targeted assignment when classLabel is absent", () => {
    const a = assignment({ targetType: "class", targetLabel: "grade 10-a" });
    const p = { email: "jane@example.com", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(false);
  });

  it("does not match a class-targeted assignment when the label does not start with the classLabel", () => {
    const a = assignment({ targetType: "class", targetLabel: "the grade 10-a class" });
    const p = { email: "jane@example.com", classLabel: "Grade 10-A", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(false);
  });

  it("returns false for an unrecognized targetType (default branch)", () => {
    const a = assignment({ targetType: "school" as unknown as AssessmentAssignment["targetType"] });
    const p = { email: "jane@example.com", name: "Jane Doe", classLabel: "Grade 10-A", matched: true };
    expect(assignmentAppliesTo(a, p)).toBe(false);
  });

  it("returns false for a student-targeted assignment when the profile has neither email nor name", () => {
    const a = assignment({ targetType: "student", targetLabel: "anything" });
    const p = { matched: false };
    expect(assignmentAppliesTo(a, p)).toBe(false);
  });
});

describe("testVisibility", () => {
  it("is open and visible when there are no assignments at all for the test", () => {
    const result = testVisibility("t1", [], { email: "jane@example.com", matched: true });
    expect(result.open).toBe(true);
    expect(result.visible).toBe(true);
    expect(result.assignment).toBeNull();
  });

  it("is open and visible when assignments exist but none target this testId", () => {
    const assignments = [assignment({ testId: "other-test", targetType: "student", targetLabel: "jane@example.com" })];
    const result = testVisibility("t1", assignments, { email: "jane@example.com", matched: true });
    expect(result.open).toBe(true);
    expect(result.visible).toBe(true);
  });

  it("is closed but visible when an assignment for this test matches the student", () => {
    const assignments = [
      assignment({ testId: "t1", targetType: "student", targetLabel: "someone@else.com" }),
      assignment({ testId: "t1", targetType: "class", targetLabel: "grade 10-a" }),
    ];
    const profile = { email: "jane@example.com", classLabel: "Grade 10-A", matched: true };
    const result = testVisibility("t1", assignments, profile);
    expect(result.open).toBe(false);
    expect(result.visible).toBe(true);
    expect(result.assignment).toBe(assignments[1]);
  });

  it("is closed and not visible when assignments exist for this test but none match the student", () => {
    const assignments = [assignment({ testId: "t1", targetType: "student", targetLabel: "someone@else.com" })];
    const profile = { email: "jane@example.com", matched: true };
    const result = testVisibility("t1", assignments, profile);
    expect(result.open).toBe(false);
    expect(result.visible).toBe(false);
    expect(result.assignment).toBeNull();
  });

  it("filters assignments strictly by testId before evaluating matches", () => {
    const assignments = [
      assignment({ testId: "t1", targetType: "student", targetLabel: "jane@example.com" }),
      assignment({ testId: "t2", targetType: "student", targetLabel: "jane@example.com" }),
    ];
    const profile = { email: "jane@example.com", matched: true };
    const result = testVisibility("t2", assignments, profile);
    expect(result.assignment).toBe(assignments[1]);
  });
});
