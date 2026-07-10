import { activeDefinition, applyDefinition, FeeContext, FeeRuleResult, FeeRuleStrategy } from "../FeeRuleStrategy";

// Applies when one of the student's guardian emails matches a real Staff
// record's email — i.e. the student is a staff member's child. Uses actual
// Staff data (already real, per this session's earlier RBAC/staff-account
// work) rather than a manual "is staff child" flag that could drift out of
// sync with who's actually employed.
function guardianEmails(s: { fatherEmail?: string; motherEmail?: string; guardianEmail?: string }): string[] {
  return [s.fatherEmail, s.motherEmail, s.guardianEmail]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());
}

export class StaffDiscountStrategy implements FeeRuleStrategy {
  category = "Staff Child" as const;

  private matchingStaff(ctx: FeeContext) {
    const emails = new Set(guardianEmails(ctx.student));
    if (emails.size === 0) return undefined;
    return ctx.staff.find((s) => s.email && emails.has(s.email.trim().toLowerCase()));
  }

  appliesTo(ctx: FeeContext): boolean {
    return !!this.matchingStaff(ctx) && !!activeDefinition(ctx, "Staff Child");
  }

  calculate(baseFee: number, ctx: FeeContext): FeeRuleResult | null {
    const staff = this.matchingStaff(ctx);
    const def = activeDefinition(ctx, "Staff Child");
    if (!staff || !def) return null;
    return { category: "Staff Child", label: `${def.name} — ${staff.name}`, amount: applyDefinition(baseFee, def) };
  }
}
