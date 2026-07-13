import { describe, it, expect } from "vitest";
import { ScholarshipFeeStrategy } from "./ScholarshipFeeStrategy";
import { FeeContext, FeeDiscountDefinition, ScholarshipRecord } from "../FeeRuleStrategy";
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
    staff: [] as Staff[],
    scholarships: [],
    discountDefinitions: [],
    ...overrides,
  };
}

const SCHOLARSHIP_DEF: FeeDiscountDefinition = {
  id: "d1", name: "General Scholarship", type: "Percentage", value: 15, category: "Scholarship", status: "Active",
};

const SCHOLARSHIP_DEF_FIXED: FeeDiscountDefinition = {
  id: "d2", name: "Fixed Scholarship Grant", type: "Fixed", value: 300, category: "Scholarship", status: "Active",
};

describe("ScholarshipFeeStrategy", () => {
  const strategy = new ScholarshipFeeStrategy();

  describe("category", () => {
    it("is Scholarship", () => {
      expect(strategy.category).toBe("Scholarship");
    });
  });

  describe("appliesTo / matching", () => {
    it("returns false when there are no scholarships at all", () => {
      const ctx = baseContext({ scholarships: [] });
      expect(strategy.appliesTo(ctx)).toBe(false);
    });

    it("matches by real studentId even when name/grade differ (renamed or promoted student)", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", studentId: "STU-1", name: "Old Name", grade: "Grade 4", discount: 30, annual: 0, status: "Active",
      };
      const ctx = baseContext({
        student: student({ id: "STU-1", name: "Amina Al-Rashdi", grade: "Grade 5" }),
        scholarships: [scholarship],
      });
      expect(strategy.appliesTo(ctx)).toBe(true);
    });

    it("does not conflate a name+grade collision when studentId points elsewhere", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", studentId: "STU-OTHER", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 50, annual: 0, status: "Active",
      };
      const ctx = baseContext({
        student: student({ id: "STU-1", name: "Amina Al-Rashdi", grade: "Grade 5" }),
        scholarships: [scholarship],
      });
      expect(strategy.appliesTo(ctx)).toBe(false);
    });

    it("falls back to name+grade only for legacy records with no studentId", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.appliesTo(ctx)).toBe(true);
    });

    it("does not fall back to name+grade when a different student's name/grade merely collide but statuses differ", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Someone Else", grade: "Grade 6", discount: 25, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.appliesTo(ctx)).toBe(false);
    });

    it("does not apply when the matching scholarship is not Active", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Expired",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.appliesTo(ctx)).toBe(false);
    });

    it("prefers the studentId match over an unrelated legacy name+grade record in the same list", () => {
      const idMatch: ScholarshipRecord = {
        id: "s1", studentId: "STU-1", name: "Old Name", grade: "Grade 4", discount: 10, annual: 0, status: "Active",
      };
      const legacyDecoy: ScholarshipRecord = {
        id: "s2", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 90, annual: 0, status: "Active",
      };
      const ctx = baseContext({
        student: student({ id: "STU-1", name: "Amina Al-Rashdi", grade: "Grade 5" }),
        scholarships: [idMatch, legacyDecoy],
      });
      // The studentId-matched record should win (found first), not the legacy decoy.
      expect(strategy.calculate(1000, ctx)).toMatchObject({ amount: 100 });
    });
  });

  describe("calculate", () => {
    it("returns null when no scholarship matches", () => {
      const ctx = baseContext({ scholarships: [] });
      expect(strategy.calculate(4000, ctx)).toBeNull();
    });

    it("uses the scholarship's own fixed annual amount when set (capped at base fee)", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 500, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.calculate(4000, ctx)).toEqual({
        category: "Scholarship",
        label: "Scholarship — Amina Al-Rashdi",
        amount: 500,
      });
    });

    it("caps the annual amount at the base fee when the award exceeds it", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 0, annual: 9999, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.calculate(4000, ctx)).toMatchObject({ amount: 4000 });
    });

    it("falls back to the scholarship's own percentage discount when annual is 0", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 25, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      expect(strategy.calculate(4000, ctx)).toEqual({
        category: "Scholarship",
        label: "Scholarship — 25% off",
        amount: 1000,
      });
    });

    it("rounds the percentage discount amount", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 33, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship] });
      // 1000 * 0.33 = 330 exactly, use a fee that forces rounding
      expect(strategy.calculate(1001, ctx)).toMatchObject({ amount: Math.round(1001 * 0.33) });
    });

    it("falls back to the generic active Scholarship discount definition when the record has neither annual nor discount", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 0, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship], discountDefinitions: [SCHOLARSHIP_DEF] });
      expect(strategy.calculate(2000, ctx)).toEqual({
        category: "Scholarship",
        label: "General Scholarship",
        amount: 300, // 15% of 2000
      });
    });

    it("applies a Fixed-type discount definition capped at the base fee", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 0, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship], discountDefinitions: [SCHOLARSHIP_DEF_FIXED] });
      expect(strategy.calculate(2000, ctx)).toEqual({
        category: "Scholarship",
        label: "Fixed Scholarship Grant",
        amount: 300,
      });
      expect(strategy.calculate(100, ctx)).toMatchObject({ amount: 100 }); // capped at base fee
    });

    it("ignores an Inactive Scholarship discount definition and returns null when the record has no annual/discount", () => {
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: 0, annual: 0, status: "Active",
      };
      const inactiveDef = { ...SCHOLARSHIP_DEF, status: "Inactive" as const };
      const ctx = baseContext({ scholarships: [scholarship], discountDefinitions: [inactiveDef] });
      expect(strategy.calculate(2000, ctx)).toBeNull();
    });

    it("returns null when there is no matching scholarship record and no fallback definition applies", () => {
      const ctx = baseContext({ scholarships: [], discountDefinitions: [SCHOLARSHIP_DEF] });
      expect(strategy.calculate(2000, ctx)).toBeNull();
    });

    it("treats a negative discount as absent and falls through to the definition lookup", () => {
      // KNOWN BUG: the source only checks `scholarship.discount > 0`, so a
      // negative discount value (e.g. bad data entry of -5) silently falls
      // through to annual/definition handling instead of being rejected or
      // treated as 0 explicitly. This documents that actual current
      // behavior rather than asserting it is "correct" business logic.
      const scholarship: ScholarshipRecord = {
        id: "s1", name: "Amina Al-Rashdi", grade: "Grade 5", discount: -5, annual: 0, status: "Active",
      };
      const ctx = baseContext({ scholarships: [scholarship], discountDefinitions: [SCHOLARSHIP_DEF] });
      expect(strategy.calculate(2000, ctx)).toEqual({
        category: "Scholarship",
        label: "General Scholarship",
        amount: 300,
      });
    });
  });
});
