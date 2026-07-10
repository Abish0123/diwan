import { activeDefinition, applyDefinition, FeeContext, FeeRuleResult, FeeRuleStrategy } from "../FeeRuleStrategy";

// Applies when the student has an Active Scholarship record. Uses the
// scholarship's own `annual` fixed amount when set (it represents a real,
// specific award value), falling back to the generic "Scholarship" category
// FeeDiscount definition's percentage/fixed value otherwise.
//
// Known limitation, flagged rather than hidden: Scholarship records
// (src/pages/finance/Scholarships.tsx) have no studentId field today — they
// carry only `name`/`grade`, so matching here is by (name, grade) equality,
// not a real foreign key. Two students with the same name in the same grade
// would collide. This is a pre-existing data-model gap (not introduced by
// this strategy) worth fixing by adding a studentId field to Scholarship
// going forward; this strategy works with what actually exists today.
export class ScholarshipFeeStrategy implements FeeRuleStrategy {
  category = "Scholarship" as const;

  private matchingScholarship(ctx: FeeContext) {
    return ctx.scholarships.find(
      (s) => s.status === "Active" && s.name === ctx.student.name && s.grade === ctx.student.grade,
    );
  }

  appliesTo(ctx: FeeContext): boolean {
    return !!this.matchingScholarship(ctx);
  }

  calculate(baseFee: number, ctx: FeeContext): FeeRuleResult | null {
    const scholarship = this.matchingScholarship(ctx);
    if (!scholarship) return null;

    if (scholarship.annual > 0) {
      return {
        category: "Scholarship",
        label: `Scholarship — ${scholarship.name}`,
        amount: Math.min(scholarship.annual, baseFee),
      };
    }
    if (scholarship.discount > 0) {
      return {
        category: "Scholarship",
        label: `Scholarship — ${scholarship.discount}% off`,
        amount: Math.round(baseFee * (scholarship.discount / 100)),
      };
    }
    const def = activeDefinition(ctx, "Scholarship");
    if (!def) return null;
    return { category: "Scholarship", label: def.name, amount: applyDefinition(baseFee, def) };
  }
}
