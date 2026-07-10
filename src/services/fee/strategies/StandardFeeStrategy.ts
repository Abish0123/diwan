import { FeeContext, FeeRuleResult, FeeRuleStrategy } from "../FeeRuleStrategy";

// Fallback strategy — always "applies," contributes zero discount. Exists so
// FeeCalculator always has at least one applicable rule to report, even for
// a student with no scholarship/sibling/staff-child status: the invoice
// preview should say "Standard fee, no discount" rather than showing an
// empty rule list that could read as a bug.
export class StandardFeeStrategy implements FeeRuleStrategy {
  category = "Standard" as const;

  appliesTo(_ctx: FeeContext): boolean {
    return true;
  }

  calculate(_baseFee: number, _ctx: FeeContext): FeeRuleResult {
    return { category: "Standard", label: "Standard Fee", amount: 0 };
  }
}
