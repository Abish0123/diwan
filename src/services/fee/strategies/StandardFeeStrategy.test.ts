import { describe, it, expect } from "vitest";
import { StandardFeeStrategy } from "./StandardFeeStrategy";
import { FeeContext } from "../FeeRuleStrategy";
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

describe("StandardFeeStrategy", () => {
  const strategy = new StandardFeeStrategy();

  it("has the Standard category", () => {
    expect(strategy.category).toBe("Standard");
  });

  it("always applies, regardless of student/context contents", () => {
    expect(strategy.appliesTo(baseContext())).toBe(true);
  });

  it("applies even for a context with populated scholarships/staff/siblings", () => {
    const ctx = baseContext({
      allStudents: [student(), student({ id: "STU-2" })],
      staff: [{ id: "ST-1", name: "Mr. X", role: "Teacher", department: "Academics", status: "Active", email: "x@school.test", uid: "admin" } as any],
      scholarships: [{ id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Active" } as any],
    });
    expect(strategy.appliesTo(ctx)).toBe(true);
  });

  it("contributes zero discount on a normal positive base fee", () => {
    expect(strategy.calculate(1000, baseContext())).toEqual({
      category: "Standard",
      label: "Standard Fee",
      amount: 0,
    });
  });

  it("contributes zero discount when base fee is zero", () => {
    expect(strategy.calculate(0, baseContext())).toEqual({
      category: "Standard",
      label: "Standard Fee",
      amount: 0,
    });
  });

  it("contributes zero discount regardless of a very large base fee", () => {
    expect(strategy.calculate(1_000_000, baseContext())).toEqual({
      category: "Standard",
      label: "Standard Fee",
      amount: 0,
    });
  });

  it("contributes zero discount even for a negative base fee (does not attempt to compute a discount)", () => {
    expect(strategy.calculate(-500, baseContext())).toEqual({
      category: "Standard",
      label: "Standard Fee",
      amount: 0,
    });
  });

  it("ignores the context entirely — result is identical across different students", () => {
    const ctxA = baseContext({ student: student({ id: "STU-A", name: "A" }) });
    const ctxB = baseContext({ student: student({ id: "STU-B", name: "B" }) });
    expect(strategy.calculate(2000, ctxA)).toEqual(strategy.calculate(2000, ctxB));
  });
});
