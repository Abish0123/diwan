import { describe, it, expect } from "vitest";
import { StaffDiscountStrategy } from "./StaffDiscountStrategy";
import { FeeContext, FeeDiscountDefinition } from "../FeeRuleStrategy";
import { Student, Staff } from "@/types";

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "STU-1", name: "Amina Al-Rashdi", classId: "Grade 5", status: "Active",
    email: "amina@school.test", grade: "Grade 5", section: "A", uid: "admin",
    ...overrides,
  } as Student;
}

function staffMember(overrides: Partial<Staff> = {}): Staff {
  return {
    id: "ST-1", name: "Mr. Khalid", role: "Teacher", department: "Academics",
    status: "Active", email: "khalid@school.test", uid: "admin",
    ...overrides,
  } as Staff;
}

function baseContext(overrides: Partial<FeeContext> = {}): FeeContext {
  return {
    student: student(),
    allStudents: [],
    staff: [],
    scholarships: [],
    discountDefinitions: [],
    ...overrides,
  };
}

const STAFF_DEF: FeeDiscountDefinition = {
  id: "d2", name: "Staff Child Discount", type: "Percentage", value: 20, category: "Staff Child", status: "Active",
};

const STAFF_DEF_FIXED: FeeDiscountDefinition = {
  id: "d2f", name: "Staff Child Fixed Discount", type: "Fixed", value: 300, category: "Staff Child", status: "Active",
};

describe("StaffDiscountStrategy", () => {
  const strategy = new StaffDiscountStrategy();

  it("has category 'Staff Child'", () => {
    expect(strategy.category).toBe("Staff Child");
  });

  it("applies when the father's email matches a real staff member's email", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(2000, ctx)).toMatchObject({ category: "Staff Child", amount: 400 });
  });

  it("applies when the mother's email matches a staff member's email", () => {
    const me = student({ motherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("applies when the guardian email matches a staff member's email", () => {
    const me = student({ guardianEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding whitespace on both sides", () => {
    const me = student({ fatherEmail: "  KHALID@School.Test  " });
    const staffWithSpacedEmail = staffMember({ email: " Khalid@school.test " });
    const ctx = baseContext({ student: me, staff: [staffWithSpacedEmail], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("does not apply when no staff email matches any guardian email", () => {
    const me = student({ fatherEmail: "someone@else.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("does not apply when the student has no guardian emails at all", () => {
    const me = student({ fatherEmail: undefined, motherEmail: undefined, guardianEmail: undefined });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when guardian email fields are present but blank/whitespace-only", () => {
    const me = student({ fatherEmail: "   ", motherEmail: "", guardianEmail: undefined });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when the staff list is empty", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when a staff record has no email to compare against", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const staffNoEmail = staffMember({ email: undefined });
    const ctx = baseContext({ student: me, staff: [staffNoEmail], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when the Staff Child discount definition is missing", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [] });
    expect(strategy.appliesTo(ctx)).toBe(false);
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("does not apply when the matching Staff Child discount definition is Inactive", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const inactive = { ...STAFF_DEF, status: "Inactive" as const };
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [inactive] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("ignores discount definitions for other categories", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const otherCategoryDef: FeeDiscountDefinition = { id: "d9", name: "Sibling", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [otherCategoryDef] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("matches against any of several guardian emails, finding the one staff record among several", () => {
    const me = student({ fatherEmail: "dad@else.test", motherEmail: "khalid@school.test", guardianEmail: "guardian@else.test" });
    const otherStaff = staffMember({ id: "ST-2", email: "notarelative@school.test" });
    const matchingStaff = staffMember({ id: "ST-1", email: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [otherStaff, matchingStaff], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(1000, ctx)).toMatchObject({ label: `Staff Child Discount — ${matchingStaff.name}`, amount: 200 });
  });

  it("calculates a Percentage-type discount as a rounded fraction of the base fee", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    // 20% of 1250 = 250 exactly
    expect(strategy.calculate(1250, ctx)).toMatchObject({ amount: 250 });
    // 20% of 999 = 199.8, rounds to 200
    expect(strategy.calculate(999, ctx)).toMatchObject({ amount: 200 });
  });

  it("calculates a Fixed-type discount capped at the base fee", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF_FIXED] });
    expect(strategy.calculate(2000, ctx)).toMatchObject({ amount: 300 });
    // base fee smaller than the fixed discount value — must not exceed baseFee
    expect(strategy.calculate(100, ctx)).toMatchObject({ amount: 100 });
  });

  it("includes the definition name and matched staff member's name in the label", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const staffWithName = staffMember({ name: "Ms. Fatima" });
    const ctx = baseContext({ student: me, staff: [staffWithName], discountDefinitions: [STAFF_DEF] });
    const result = strategy.calculate(1000, ctx);
    expect(result?.label).toBe("Staff Child Discount — Ms. Fatima");
  });

  it("returns null from calculate when appliesTo would be false (no staff match)", () => {
    const me = student({ fatherEmail: "unmatched@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [STAFF_DEF] });
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("returns null from calculate when there is no active Staff Child definition even if staff matches", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const ctx = baseContext({ student: me, staff: [staffMember()], discountDefinitions: [] });
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });
});
