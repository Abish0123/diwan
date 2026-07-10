import { activeDefinition, applyDefinition, FeeContext, FeeRuleResult, FeeRuleStrategy } from "../FeeRuleStrategy";

// A "sibling" here means another currently-enrolled student sharing a real
// guardian-contact field (father/mother/guardian phone or email) — there is
// no dedicated family/household id on Student today, so this is the closest
// real signal available rather than a fabricated relationship field.
function guardianContacts(s: { fatherPhone?: string; motherPhone?: string; guardianPhone?: string; fatherEmail?: string; motherEmail?: string; guardianEmail?: string }): string[] {
  return [s.fatherPhone, s.motherPhone, s.guardianPhone, s.fatherEmail, s.motherEmail, s.guardianEmail]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());
}

export class SiblingDiscountStrategy implements FeeRuleStrategy {
  category = "Sibling" as const;

  private hasSiblingInSchool(ctx: FeeContext): boolean {
    const mine = new Set(guardianContacts(ctx.student));
    if (mine.size === 0) return false;
    return ctx.allStudents.some(
      (other) => other.id !== ctx.student.id && guardianContacts(other).some((c) => mine.has(c)),
    );
  }

  appliesTo(ctx: FeeContext): boolean {
    return this.hasSiblingInSchool(ctx) && !!activeDefinition(ctx, "Sibling");
  }

  calculate(baseFee: number, ctx: FeeContext): FeeRuleResult | null {
    const def = activeDefinition(ctx, "Sibling");
    if (!def || !this.hasSiblingInSchool(ctx)) return null;
    return { category: "Sibling", label: def.name, amount: applyDefinition(baseFee, def) };
  }
}
