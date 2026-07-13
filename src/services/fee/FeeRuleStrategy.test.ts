import { describe, it, expect } from "vitest";
import { applyDefinition, activeDefinition, FeeContext, FeeDiscountDefinition } from "./FeeRuleStrategy";
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

describe("applyDefinition", () => {
  it("computes a Percentage discount as a rounded share of the base fee", () => {
    const def: FeeDiscountDefinition = { id: "d1", name: "Sibling", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
    expect(applyDefinition(2000, def)).toBe(200);
  });

  it("rounds a fractional Percentage discount to the nearest whole currency unit", () => {
    // 1000 * (33.335/100) = 333.35 -> rounds down to 333
    const def: FeeDiscountDefinition = { id: "d1", name: "Odd Percent", type: "Percentage", value: 33.335, category: "Other", status: "Active" };
    expect(applyDefinition(1000, def)).toBe(333);
  });

  it("caps a Fixed discount at the base fee so it never exceeds it", () => {
    const def: FeeDiscountDefinition = { id: "d2", name: "Big Fixed", type: "Fixed", value: 9999, category: "Scholarship", status: "Active" };
    expect(applyDefinition(4000, def)).toBe(4000);
  });

  it("applies a Fixed discount at face value when it is below the base fee", () => {
    const def: FeeDiscountDefinition = { id: "d3", name: "Small Fixed", type: "Fixed", value: 500, category: "Scholarship", status: "Active" };
    expect(applyDefinition(4000, def)).toBe(500);
  });

  it("returns zero for a zero-value Percentage discount", () => {
    const def: FeeDiscountDefinition = { id: "d4", name: "None", type: "Percentage", value: 0, category: "Other", status: "Active" };
    expect(applyDefinition(4000, def)).toBe(0);
  });

  it("returns zero for a base fee of zero regardless of discount type", () => {
    const pct: FeeDiscountDefinition = { id: "d5", name: "Pct", type: "Percentage", value: 50, category: "Other", status: "Active" };
    const fixed: FeeDiscountDefinition = { id: "d6", name: "Fixed", type: "Fixed", value: 100, category: "Other", status: "Active" };
    expect(applyDefinition(0, pct)).toBe(0);
    expect(applyDefinition(0, fixed)).toBe(0);
  });

  it("treats a negative Fixed value as smaller than the base fee (Math.min picks the negative value)", () => {
    // KNOWN BUG: applyDefinition uses Math.min(def.value, baseFee) for Fixed
    // discounts with no floor at zero. A negative `value` (e.g. bad data
    // entry) produces a negative discount amount instead of being rejected
    // or clamped to zero, which would actually INCREASE the student's fee
    // if ever added rather than subtracted, or produce a nonsensical
    // negative "discount" in reports.
    const def: FeeDiscountDefinition = { id: "d7", name: "Bad Data", type: "Fixed", value: -50, category: "Other", status: "Active" };
    expect(applyDefinition(4000, def)).toBe(-50);
  });
});

describe("activeDefinition", () => {
  it("finds the Active definition matching the requested category", () => {
    const sibling: FeeDiscountDefinition = { id: "d1", name: "Sibling", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
    const staffChild: FeeDiscountDefinition = { id: "d2", name: "Staff Child", type: "Percentage", value: 20, category: "Staff Child", status: "Active" };
    const ctx = baseContext({ discountDefinitions: [sibling, staffChild] });
    expect(activeDefinition(ctx, "Sibling")).toBe(sibling);
    expect(activeDefinition(ctx, "Staff Child")).toBe(staffChild);
  });

  it("returns undefined when no definition exists for the category", () => {
    const ctx = baseContext({ discountDefinitions: [] });
    expect(activeDefinition(ctx, "Scholarship")).toBeUndefined();
  });

  it("skips a matching definition that is Inactive", () => {
    const inactive: FeeDiscountDefinition = { id: "d1", name: "Sibling", type: "Percentage", value: 10, category: "Sibling", status: "Inactive" };
    const ctx = baseContext({ discountDefinitions: [inactive] });
    expect(activeDefinition(ctx, "Sibling")).toBeUndefined();
  });

  it("does not match a definition of a different category even if Active", () => {
    const sibling: FeeDiscountDefinition = { id: "d1", name: "Sibling", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
    const ctx = baseContext({ discountDefinitions: [sibling] });
    expect(activeDefinition(ctx, "Staff Child")).toBeUndefined();
  });

  it("returns the first Active match when multiple definitions share a category", () => {
    const first: FeeDiscountDefinition = { id: "d1", name: "First", type: "Percentage", value: 10, category: "Sibling", status: "Active" };
    const second: FeeDiscountDefinition = { id: "d2", name: "Second", type: "Percentage", value: 15, category: "Sibling", status: "Active" };
    const ctx = baseContext({ discountDefinitions: [first, second] });
    expect(activeDefinition(ctx, "Sibling")).toBe(first);
  });
});
