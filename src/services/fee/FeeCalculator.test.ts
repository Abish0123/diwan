import { describe, it, expect } from "vitest";
import { createDefaultFeeCalculator, FeeCalculator } from "./FeeCalculator";
import { FeeContext, FeeDiscountDefinition, ScholarshipRecord } from "./FeeRuleStrategy";
import { StandardFeeStrategy } from "./strategies/StandardFeeStrategy";
import { ScholarshipFeeStrategy } from "./strategies/ScholarshipFeeStrategy";
import { SiblingDiscountStrategy } from "./strategies/SiblingDiscountStrategy";
import { StaffDiscountStrategy } from "./strategies/StaffDiscountStrategy";
import { Student, Staff } from "@/types";

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
const STAFF_DEF: FeeDiscountDefinition = { id: "d2", name: "Staff Child Discount", type: "Percentage", value: 20, category: "Staff Child", status: "Active" };
const SCHOLARSHIP_DEF: FeeDiscountDefinition = { id: "d3", name: "General Scholarship", type: "Percentage", value: 15, category: "Scholarship", status: "Active" };

describe("StandardFeeStrategy", () => {
  it("always applies and contributes zero discount", () => {
    const s = new StandardFeeStrategy();
    expect(s.appliesTo(baseContext())).toBe(true);
    expect(s.calculate(1000, baseContext())).toEqual({ category: "Standard", label: "Standard Fee", amount: 0 });
  });
});

describe("ScholarshipFeeStrategy", () => {
  const strategy = new ScholarshipFeeStrategy();

  it("applies when an Active scholarship matches the student's name and grade", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Active" };
    const ctx = baseContext({ scholarships: [scholarship] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(4000, ctx)).toMatchObject({ category: "Scholarship", amount: 1000 });
  });

  it("prefers the scholarship's fixed annual amount over its percentage when both are set", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 500, status: "Active" };
    const ctx = baseContext({ scholarships: [scholarship] });
    expect(strategy.calculate(4000, ctx)).toMatchObject({ amount: 500 });
  });

  it("never discounts more than the base fee itself", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 0, annual: 9999, status: "Active" };
    const ctx = baseContext({ scholarships: [scholarship] });
    expect(strategy.calculate(4000, ctx)).toMatchObject({ amount: 4000 });
  });

  it("does not apply when no scholarship matches this student's name+grade", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Someone Else", grade: "Grade 6", discount: 25, annual: 0, status: "Active" };
    const ctx = baseContext({ scholarships: [scholarship] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when the matching scholarship is not Active", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Expired" };
    const ctx = baseContext({ scholarships: [scholarship] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });
});

describe("SiblingDiscountStrategy", () => {
  const strategy = new SiblingDiscountStrategy();

  it("applies when another enrolled student shares a guardian phone number", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", name: "Yousef Al-Rashdi", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(2000, ctx)).toMatchObject({ category: "Sibling", amount: 200 });
  });

  it("does not apply when no other student shares any guardian contact", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const other = student({ id: "STU-2", fatherPhone: "555-9999" });
    const ctx = baseContext({ student: me, allStudents: [me, other], discountDefinitions: [SIBLING_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });

  it("does not apply when the Sibling discount definition is Inactive", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const inactive = { ...SIBLING_DEF, status: "Inactive" as const };
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [inactive] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });
});

describe("StaffDiscountStrategy", () => {
  const strategy = new StaffDiscountStrategy();

  it("applies when a guardian email matches a real staff member's email", () => {
    const me = student({ fatherEmail: "khalid@school.test" });
    const staffMember = { id: "ST-1", name: "Mr. Khalid", role: "Teacher", department: "Academics", status: "Active", email: "khalid@school.test", uid: "admin" } as Staff;
    const ctx = baseContext({ student: me, staff: [staffMember], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(true);
    expect(strategy.calculate(2000, ctx)).toMatchObject({ category: "Staff Child", amount: 400 });
  });

  it("does not apply when no staff email matches any guardian email", () => {
    const me = student({ fatherEmail: "someone@else.test" });
    const staffMember = { id: "ST-1", name: "Mr. Khalid", role: "Teacher", department: "Academics", status: "Active", email: "khalid@school.test", uid: "admin" } as Staff;
    const ctx = baseContext({ student: me, staff: [staffMember], discountDefinitions: [STAFF_DEF] });
    expect(strategy.appliesTo(ctx)).toBe(false);
  });
});

describe("FeeCalculator", () => {
  it("falls back to Standard (zero discount) when no rule applies", () => {
    const calc = createDefaultFeeCalculator();
    const result = calc.computeInvoice(3000, baseContext());
    expect(result.finalAmount).toBe(3000);
    expect(result.totalDiscount).toBe(0);
    expect(result.appliedRules).toEqual([{ category: "Standard", label: "Standard Fee", amount: 0 }]);
    expect(result.wasCapped).toBe(false);
  });

  it("stacks multiple applicable discounts additively", () => {
    const me = student({ id: "STU-1", fatherPhone: "555-0100", fatherEmail: "khalid@school.test" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const staffMember = { id: "ST-1", name: "Mr. Khalid", role: "Teacher", department: "Academics", status: "Active", email: "khalid@school.test", uid: "admin" } as Staff;
    const ctx = baseContext({
      student: me, allStudents: [me, sibling], staff: [staffMember],
      discountDefinitions: [SIBLING_DEF, STAFF_DEF], // 10% + 20% = 30%, under the 50% cap
    });
    const calc = createDefaultFeeCalculator();
    const result = calc.computeInvoice(2000, ctx);
    expect(result.appliedRules).toHaveLength(2);
    expect(result.totalDiscount).toBe(600); // 200 (sibling) + 400 (staff)
    expect(result.finalAmount).toBe(1400);
    expect(result.wasCapped).toBe(false);
  });

  it("caps combined discount at maxCombinedDiscountPct rather than exceeding it", () => {
    const scholarship: ScholarshipRecord = { id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 40, annual: 0, status: "Active" };
    const me = student({ id: "STU-1", fatherPhone: "555-0100", fatherEmail: "khalid@school.test" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const staffMember = { id: "ST-1", name: "Mr. Khalid", role: "Teacher", department: "Academics", status: "Active", email: "khalid@school.test", uid: "admin" } as Staff;
    const ctx = baseContext({
      student: me, allStudents: [me, sibling], staff: [staffMember], scholarships: [scholarship],
      discountDefinitions: [SIBLING_DEF, STAFF_DEF, SCHOLARSHIP_DEF], // 40% + 10% + 20% = 70%, over the 50% cap
    });
    const calc = createDefaultFeeCalculator(50);
    const result = calc.computeInvoice(2000, ctx);
    expect(result.wasCapped).toBe(true);
    expect(result.totalDiscount).toBe(1000); // capped at 50% of 2000
    expect(result.finalAmount).toBe(1000);
  });

  it("respects a custom maxCombinedDiscountPct passed to the factory", () => {
    const me = student({ fatherPhone: "555-0100" });
    const sibling = student({ id: "STU-2", fatherPhone: "555-0100" });
    const ctx = baseContext({ student: me, allStudents: [me, sibling], discountDefinitions: [SIBLING_DEF] });
    const strictCalc = createDefaultFeeCalculator(5); // cap tighter than the 10% sibling discount itself
    const result = strictCalc.computeInvoice(2000, ctx);
    expect(result.wasCapped).toBe(true);
    expect(result.totalDiscount).toBe(100); // 5% of 2000
  });
});
