import { FeeContext, FeeRuleResult, FeeRuleStrategy } from "./FeeRuleStrategy";
import { StandardFeeStrategy } from "./strategies/StandardFeeStrategy";
import { ScholarshipFeeStrategy } from "./strategies/ScholarshipFeeStrategy";
import { SiblingDiscountStrategy } from "./strategies/SiblingDiscountStrategy";
import { StaffDiscountStrategy } from "./strategies/StaffDiscountStrategy";

export interface FeeInvoiceResult {
  baseFee: number;
  finalAmount: number;
  totalDiscount: number;
  appliedRules: FeeRuleResult[];
  // True if the sum of applicable discounts exceeded maxCombinedDiscountPct
  // and was capped down to fit it.
  wasCapped: boolean;
}

// Strategy context: resolves which FeeRuleStrategy objects apply to a
// student and combines their results into one final invoice amount.
//
// STACKING POLICY — flagged, not silently decided: can a student receive
// both a sibling AND a scholarship discount at once? This codebase had no
// answer before this class existed (fee calculation didn't exist at all —
// see the architecture audit). The default here is conservative and
// explicit: applicable discounts stack additively, capped at
// `maxCombinedDiscountPct` (default 50%) of the base fee, so an edge case
// (e.g. scholarship + sibling + staff-child all at once) can never zero out
// or invert a fee. This is a real business-policy decision the school
// should confirm or override via the constructor argument — it is
// deliberately NOT hardcoded so that confirming/changing the policy doesn't
// mean touching this class.
export class FeeCalculator {
  constructor(
    private readonly strategies: FeeRuleStrategy[],
    private readonly maxCombinedDiscountPct = 50,
  ) {}

  computeInvoice(baseFee: number, ctx: FeeContext): FeeInvoiceResult {
    const applicable = this.strategies
      .filter((s) => s.category !== "Standard" && s.appliesTo(ctx))
      .map((s) => s.calculate(baseFee, ctx))
      .filter((r): r is FeeRuleResult => r !== null);

    if (applicable.length === 0) {
      const standard = this.strategies.find((s) => s.category === "Standard");
      const rule = standard?.calculate(baseFee, ctx);
      return {
        baseFee, finalAmount: baseFee, totalDiscount: 0,
        appliedRules: rule ? [rule] : [], wasCapped: false,
      };
    }

    const rawTotal = applicable.reduce((sum, r) => sum + r.amount, 0);
    const cap = Math.round(baseFee * (this.maxCombinedDiscountPct / 100));
    const totalDiscount = Math.min(rawTotal, cap);
    const wasCapped = rawTotal > cap;

    return {
      baseFee,
      finalAmount: baseFee - totalDiscount,
      totalDiscount,
      appliedRules: applicable,
      wasCapped,
    };
  }
}

// Factory — assembles the standard strategy set used app-wide. Adding a new
// discount category (e.g. Early Bird) means implementing one FeeRuleStrategy
// and adding it to this one list, not touching FeeCalculator itself.
export function createDefaultFeeCalculator(maxCombinedDiscountPct?: number): FeeCalculator {
  return new FeeCalculator(
    [
      new ScholarshipFeeStrategy(),
      new SiblingDiscountStrategy(),
      new StaffDiscountStrategy(),
      new StandardFeeStrategy(),
    ],
    maxCombinedDiscountPct,
  );
}
