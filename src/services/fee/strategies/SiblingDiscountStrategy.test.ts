import { describe, it, expect } from "vitest";
import { SiblingDiscountStrategy } from "./SiblingDiscountStrategy";
import { FeeContext, FeeDiscountDefinition } from "../FeeRuleStrategy";
import { Student } from "@/types";

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "STU-1", name: "Amina Al-Rashdi", classId: "Grade 5", status: "Active",
    email: "amina@school.test", grade: "Grade 5", section: "A", uid: "admin",
    ...overrides,
  } as Student;
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

const SIBLING_DEF: FeeDiscountDefinition = { id: "d1", name: "Sibling Discount", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
const FIXED_SIBLING_DEF: FeeDiscountDefinition = { id: "d2", name: "Sibling Flat", type: "Fixed", value: 300, category: "Sibling", status: "Active" };

describe("SiblingDiscountStrategy", () => {
  const strategy = new SiblingDiscountStrategy();

  it("has the Sibling category", () => {
    expect(strategy.category).toBe("Sibling");
  });

  it("applies when another enrolled student shares a father phone", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", name: "Yousef", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(2000, ctx)).toEqual({ category: "Sibling", label: "Sibling Discount", amount: 200 });
  });

  it("applies when siblings share a mother phone instead of father phone", () => {
    const me = student({ id: "STU-1", motherPhone: "555-0200" });
    const sibling = student({ id: "STU-2", motherPhone: "555-0200" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("applies when siblings share a guardian phone", () => {
    const me = student({ id: "STU-1", guardianPhone: "555-0300" });
    const sibling = student({ id: "STU-2", guardianPhone: "555-0300" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("applies when siblings share a father email", () => {
    const me = student({ id: "STU-1", fatherEmail: "dad@example.test" });
    const sibling = student({ id: "STU-2", fatherEmail: "dad@example.test" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("applies when siblings share a mother email", () => {
    const me = student({ id: "STU-1", motherEmail: "mom@example.test" });
    const sibling = student({ id: "STU-2", motherEmail: "mom@example.test" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("applies when siblings share a guardian email", () => {
    const me = student({ id: "STU-1", guardianEmail: "guardian@example.test" });
    const sibling = student({ id: "STU-2", guardianEmail: "guardian@example.test" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("matches contacts case-insensitively and trims surrounding whitespace", () => {
    const me = student({ id: "STU-1", fatherEmail: "  Dad@Example.test  " });
    const sibling = student({ id: "STU-2", fatherEmail: "dad@example.test" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("does not apply when no other student shares any guardian contact", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const other = student({ id: "STU-2", fatherPhone: "555-9999" });
    const ctx = baseContext({ student: me, allStudents: [me, other], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("does not apply when the student has no guardian contacts at all", () => {
    const me = student({ id: "STU-1" });
    const other = student({ id: "STU-2", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, other], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not treat the student itself as its own sibling when allStudents only contains itself", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not match another student with the same id even if listed as a distinct duplicate object", () => {
    // Guards the `other.id !== ctx.student.id` self-exclusion check itself,
    // independent of array identity.
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const duplicateOfMe = student({ id: "STU-1", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [duplicateOfMe], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("handles an empty allStudents array without applying", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when the Sibling discount definition is Inactive", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const inactive = { ...SIBLING_DEF, status: "Inactive" as const };
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [inactive] });
    expect(strategy.appliesTo(ctx)).toBe(false);
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("does not apply when there is no Sibling discount definition at all", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [] });
    expect(strategy.appliesTo(ctx)).toBe(false);
    expect(strategy.calculate(2000, ctx)).toBeNull();
  });

  it("ignores contacts that are empty strings or only whitespace", () => {
    const me = student({ id: "STU-1", fatherPhone: "   ", motherPhone: "" });
    const sibling = student({ id: "STU-2", fatherPhone: "   ", motherPhone: "" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("calculates a Fixed discount amount, capped at the base fee, via applyDefinition", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [FIXED_SIBLING_DEF] });
    expect(strategy.calculate(2000, ctx)).toEqual({ category: "Sibling", label: "Sibling Flat", amount: 300 });
    // Fixed amount larger than the base fee is capped at the base fee.
    expect(strategy.calculate(100, ctx)).toEqual({ category: "Sibling", label: "Sibling Flat", amount: 100 });
  });

  it("picks up a sibling relationship established through any single shared contact field among several present", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-1111", motherPhone: "555-2222", fatherEmail: "a@test.com" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-9999", motherPhone: "555-8888", fatherEmail: "a@test.com" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });
});
