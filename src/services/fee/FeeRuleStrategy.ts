import { Student, Staff } from "@/types";

// Real data available to decide which fee rule applies to a student. Every
// field here comes from an existing entity — nothing fabricated for this
// layer's sake.
export interface FeeDiscountDefinition {
  id: string;
  name: string;
  type: "Percentage" | "Fixed";
  value: number;
  category: "Scholarship" | "Sibling" | "Early Bird" | "Staff Child" | "Other";
  status: "Active" | "Inactive";
}

export interface ScholarshipRecord {
  id: string;
  name: string; // student name — see FeeContext.scholarships note on matching
  grade: string;
  discount: number; // percentage
  annual: number; // fixed annual amount
  status: string;
}

export interface FeeContext {
  student: Student;
  // Every other currently-enrolled student — needed to detect siblings by
  // shared guardian contact, since there is no sibling/family-group field
  // on Student today.
  allStudents: Student[];
  staff: Staff[];
  scholarships: ScholarshipRecord[];
  discountDefinitions: FeeDiscountDefinition[];
}

export interface FeeRuleResult {
  category: FeeDiscountDefinition["category"] | "Standard";
  label: string;
  amount: number; // discount amount in currency, always >= 0
}

// Strategy interface — one implementation per discount category. Each
// strategy owns both "does this apply to this student" and "how much is
// the discount," so adding a new discount category (e.g. Early Bird) means
// implementing one class, not touching FeeCalculator or any of the other
// strategies.
export interface FeeRuleStrategy {
  category: FeeRuleResult["category"];
  appliesTo(ctx: FeeContext): boolean;
  calculate(baseFee: number, ctx: FeeContext): FeeRuleResult | null;
}

function activeDefinition(
  ctx: FeeContext,
  category: FeeDiscountDefinition["category"],
): FeeDiscountDefinition | undefined {
  return ctx.discountDefinitions.find((d) => d.category === category && d.status === "Active");
}

export function applyDefinition(baseFee: number, def: FeeDiscountDefinition): number {
  if (def.type === "Fixed") return Math.min(def.value, baseFee);
  return Math.round(baseFee * (def.value / 100));
}

export { activeDefinition };
