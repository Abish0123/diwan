// Pure logic engine for computing school late fees (Qatar/GCC convention).
// No React, no side effects — safe to import from both UI code and scripts/tests.

export interface LateFeeTier {
  minDays: number;
  maxDays: number | null; // null = unbounded ("more than X days")
  amount: number; // fixed QAR amount, or percent (0-100) of term fee, depending on feeType
}

export interface LateFeePolicy {
  gracePeriodDays: number;
  feeType: "Fixed" | "Percentage";
  fixedTiers: LateFeeTier[];
  percentageTiers: LateFeeTier[];
  autoCalculate: boolean;
  autoReminder: boolean;
  showOnInvoice: boolean;
}

export const DEFAULT_LATE_FEE_POLICY: LateFeePolicy = {
  gracePeriodDays: 3,
  feeType: "Fixed",
  fixedTiers: [
    { minDays: 1, maxDays: 7, amount: 50 },
    { minDays: 8, maxDays: 15, amount: 100 },
    { minDays: 16, maxDays: 30, amount: 200 },
    { minDays: 31, maxDays: null, amount: 300 },
  ],
  percentageTiers: [
    { minDays: 1, maxDays: 15, amount: 1 },
    { minDays: 16, maxDays: 30, amount: 2 },
    { minDays: 31, maxDays: null, amount: 3 },
  ],
  autoCalculate: true,
  autoReminder: true,
  showOnInvoice: true,
};

/**
 * Computes the late fee owed on an invoice/term fee given a due date and policy.
 *
 * Semantics (reconciled against the school's worked example, which takes
 * precedence over a naive "grace period shifts the tier boundaries" reading):
 *  - `daysLate` is the number of full days between the due date and `asOfDate`
 *    (or today, if not supplied).
 *  - If `daysLate <= 0` (on/before the due date), the fee is always 0 —
 *    there's nothing to charge before or on the due date itself.
 *  - The `gracePeriodDays` setting controls whether the invoice is flagged as
 *    "Overdue" for reminder/status purposes (a separate UI/status concern,
 *    not implemented here) — it does NOT reduce or offset `daysLate` before
 *    the tier lookup. Once `daysLate > 0`, the fee is looked up directly
 *    against the tier table using the raw day count.
 *  - The matching tier is the one where `minDays <= daysLate <= (maxDays ?? Infinity)`.
 *  - For `feeType: "Fixed"`, the tier's `amount` is returned directly (QAR).
 *  - For `feeType: "Percentage"`, the fee is `(amount / 100) * termFeeAmount`.
 *  - If no tier matches, 0 is returned.
 */
export function computeLateFee(
  dueDate: string | Date,
  termFeeAmount: number,
  policy: LateFeePolicy,
  asOfDate?: Date
): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const today = asOfDate ?? new Date();

  // Normalize both to midnight so partial-day/time-zone noise doesn't
  // affect the day count.
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLate = Math.floor((todayMidnight.getTime() - dueMidnight.getTime()) / msPerDay);

  if (daysLate <= 0) {
    return 0;
  }

  const tiers = policy.feeType === "Percentage" ? policy.percentageTiers : policy.fixedTiers;

  const tier = tiers.find(
    (t) => daysLate >= t.minDays && (t.maxDays === null || daysLate <= t.maxDays)
  );

  if (!tier) {
    return 0;
  }

  if (policy.feeType === "Percentage") {
    return (tier.amount / 100) * termFeeAmount;
  }

  return tier.amount;
}

// --- Sanity check against the school's worked example ---
// Grade 5, Term Fee QAR 8,500, Due 15 Sept, Grace 3 days, Fixed fee type.
// Expected: 10 Sept -> 0, 18 Sept (3 days late) -> 50,
//           25 Sept (10 days late) -> 100, 20 Oct (35 days late) -> 300.
function __sanityCheckLateFeeEngine() {
  const policy: LateFeePolicy = { ...DEFAULT_LATE_FEE_POLICY, gracePeriodDays: 3, feeType: "Fixed" };
  const dueDate = "2026-09-15";
  const termFee = 8500;

  const case1 = computeLateFee(dueDate, termFee, policy, new Date("2026-09-10")); // before due date
  const case2 = computeLateFee(dueDate, termFee, policy, new Date("2026-09-18")); // 3 days late
  const case3 = computeLateFee(dueDate, termFee, policy, new Date("2026-09-25")); // 10 days late
  const case4 = computeLateFee(dueDate, termFee, policy, new Date("2026-10-20")); // 35 days late

  const expected = [0, 50, 100, 300];
  const actual = [case1, case2, case3, case4];

  const ok = expected.every((v, i) => v === actual[i]);
  if (!ok) {
    // Surface loudly in dev if the tier logic ever regresses.
    // eslint-disable-next-line no-console
    console.error("[lateFeeEngine] Sanity check FAILED", { expected, actual });
  }
}

if (import.meta.env?.DEV) {
  __sanityCheckLateFeeEngine();
}
