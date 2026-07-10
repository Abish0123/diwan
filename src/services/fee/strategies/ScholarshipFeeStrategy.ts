import { activeDefinition, applyDefinition, FeeContext, FeeRuleResult, FeeRuleStrategy } from "../FeeRuleStrategy";

// Applies when the student has an Active Scholarship record. Uses the
// scholarship's own `annual` fixed amount when set (it represents a real,
// specific award value), falling back to the generic "Scholarship" category
// FeeDiscount definition's percentage/fixed value otherwise.
//
// Matching prefers the real studentId FK (Scholarships.tsx's "New
// Scholarship" dialog now links to a real Student record via a picker).
// Falls back to (name, grade) equality only for legacy records created
// before that field existed — those can still collide on same-name
// students, which is exactly why the fallback is scoped to studentId-less
// records only rather than kept as the primary matching strategy.
export class ScholarshipFeeStrategy implements FeeRuleStrategy {
  category = "Scholarship" as const;

  private matchingScholarship(ctx: FeeContext) {
    const byId = ctx.scholarships.find((s) => s.status === "Active" && s.studentId && s.studentId === ctx.student.id);
    if (byId) return byId;
    return ctx.scholarships.find(
      (s) => s.status === "Active" && !s.studentId && s.name === ctx.student.name && s.grade === ctx.student.grade,
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
