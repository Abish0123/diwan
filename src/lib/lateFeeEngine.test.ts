import { describe, it, expect } from "vitest";
import { computeLateFee, DEFAULT_LATE_FEE_POLICY, LateFeePolicy } from "./lateFeeEngine";

const fixedPolicy: LateFeePolicy = { ...DEFAULT_LATE_FEE_POLICY, feeType: "Fixed" };
const percentPolicy: LateFeePolicy = { ...DEFAULT_LATE_FEE_POLICY, feeType: "Percentage" };

describe("computeLateFee - school worked example (fixed fee type)", () => {
  const dueDate = "2026-09-15";
  const termFee = 8500;

  it("returns 0 before the due date", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-09-10"))).toBe(0);
  });

  it("returns 0 on the due date itself", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-09-15"))).toBe(0);
  });

  it("charges the first tier fee at 3 days late (within grace period, still charged per spec)", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-09-18"))).toBe(50);
  });

  it("charges the second tier fee at 10 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-09-25"))).toBe(100);
  });

  it("charges the unbounded top tier fee at 35 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-10-20"))).toBe(300);
  });
});

describe("computeLateFee - fixed tier boundaries", () => {
  const dueDate = "2026-01-01";
  const termFee = 1000;

  it("returns 0 at exactly 0 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-01"))).toBe(0);
  });

  it("charges tier 1 (1-7 days) at the lower boundary: 1 day late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-02"))).toBe(50);
  });

  it("charges tier 1 at the upper boundary: 7 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-08"))).toBe(50);
  });

  it("charges tier 2 (8-15 days) at the lower boundary: 8 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-09"))).toBe(100);
  });

  it("charges tier 2 at the upper boundary: 15 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-16"))).toBe(100);
  });

  it("charges tier 3 (16-30 days) at the lower boundary: 16 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-17"))).toBe(200);
  });

  it("charges tier 3 at the upper boundary: 30 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-01-31"))).toBe(200);
  });

  it("charges the unbounded tier 4 at the lower boundary: 31 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2026-02-01"))).toBe(300);
  });

  it("charges the unbounded tier 4 far beyond its lower boundary: 365 days late", () => {
    expect(computeLateFee(dueDate, termFee, fixedPolicy, new Date("2027-01-01"))).toBe(300);
  });
});

describe("computeLateFee - percentage fee type", () => {
  const dueDate = "2026-01-01";
  const termFee = 10000;

  it("returns 0 before the due date regardless of fee type", () => {
    expect(computeLateFee(dueDate, termFee, percentPolicy, new Date("2025-12-31"))).toBe(0);
  });

  it("charges 1% of term fee within the 1-15 day tier", () => {
    expect(computeLateFee(dueDate, termFee, percentPolicy, new Date("2026-01-10"))).toBe(100);
  });

  it("charges 2% of term fee within the 16-30 day tier", () => {
    expect(computeLateFee(dueDate, termFee, percentPolicy, new Date("2026-01-20"))).toBe(200);
  });

  it("charges 3% of term fee in the unbounded 31+ day tier", () => {
    expect(computeLateFee(dueDate, termFee, percentPolicy, new Date("2026-03-01"))).toBe(300);
  });

  it("computes percentage fee proportional to an arbitrary term fee amount", () => {
    expect(computeLateFee(dueDate, 5000, percentPolicy, new Date("2026-01-10"))).toBe(50);
  });

  it("returns 0 percentage fee when term fee amount is 0", () => {
    expect(computeLateFee(dueDate, 0, percentPolicy, new Date("2026-01-10"))).toBe(0);
  });
});

describe("computeLateFee - date input handling", () => {
  it("accepts a Date object for dueDate as well as a string", () => {
    const due = new Date(2026, 0, 1); // Jan 1 2026
    // Jan 10 is 9 days after Jan 1, which falls in the 8-15 day tier (100).
    expect(computeLateFee(due, 1000, fixedPolicy, new Date(2026, 0, 10))).toBe(100);
  });

  it("defaults asOfDate to now when not supplied (far-past due date yields the top tier fee)", () => {
    // Any due date far enough in the past relative to "now" will land in the
    // unbounded top tier for the default policy.
    expect(computeLateFee("2000-01-01", 1000, fixedPolicy)).toBe(300);
  });

  it("normalizes time-of-day noise so same-day due/as-of with different times is still 0 days late", () => {
    const due = new Date(2026, 5, 15, 23, 59, 59);
    const asOf = new Date(2026, 5, 15, 0, 0, 1);
    expect(computeLateFee(due, 1000, fixedPolicy, asOf)).toBe(0);
  });
});

describe("computeLateFee - custom / empty tier tables", () => {
  it("returns 0 when the fixed tier list is empty even though the invoice is late", () => {
    const policy: LateFeePolicy = { ...DEFAULT_LATE_FEE_POLICY, feeType: "Fixed", fixedTiers: [] };
    expect(computeLateFee("2026-01-01", 1000, policy, new Date("2026-01-10"))).toBe(0);
  });

  it("returns 0 when daysLate falls into a gap between custom tiers", () => {
    const policy: LateFeePolicy = {
      ...DEFAULT_LATE_FEE_POLICY,
      feeType: "Fixed",
      fixedTiers: [
        { minDays: 1, maxDays: 5, amount: 20 },
        { minDays: 10, maxDays: null, amount: 40 },
      ],
    };
    // 7 days late falls in the gap between tier 1 (max 5) and tier 2 (min 10).
    expect(computeLateFee("2026-01-01", 1000, policy, new Date("2026-01-08"))).toBe(0);
  });

  it("uses the first matching tier when custom tiers overlap", () => {
    const policy: LateFeePolicy = {
      ...DEFAULT_LATE_FEE_POLICY,
      feeType: "Fixed",
      fixedTiers: [
        { minDays: 1, maxDays: 10, amount: 999 },
        { minDays: 5, maxDays: 10, amount: 111 },
      ],
    };
    expect(computeLateFee("2026-01-01", 1000, policy, new Date("2026-01-08"))).toBe(999);
  });
});

describe("computeLateFee - grace period does not offset daysLate (per spec)", () => {
  it("still charges a fee inside the grace period once daysLate > 0", () => {
    const policy: LateFeePolicy = { ...DEFAULT_LATE_FEE_POLICY, gracePeriodDays: 10, feeType: "Fixed" };
    // Only 1 day late, well within the 10-day grace period, but the engine
    // does not use gracePeriodDays to offset the tier lookup.
    expect(computeLateFee("2026-01-01", 1000, policy, new Date("2026-01-02"))).toBe(50);
  });
});
