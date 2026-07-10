import { describe, it, expect } from "vitest";
import {
  computeDailyActiveUsers, computeRetentionSummary, computeFeatureUsage,
  computeTopPages, computeAdmissionsFunnel, computeFeeFunnel,
  AnalyticsEventRow,
} from "./analyticsEngine";

function event(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
  return {
    id: Math.random().toString(36),
    type: "login",
    uid: "u1",
    day: "2026-07-01",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeDailyActiveUsers", () => {
  it("counts distinct uids per day, ignoring non-login events", () => {
    const events = [
      event({ uid: "u1", day: "2026-07-01" }),
      event({ uid: "u2", day: "2026-07-01" }),
      event({ uid: "u1", day: "2026-07-01" }), // duplicate uid, same day — should not double count
      event({ uid: "u1", day: "2026-07-02" }),
      event({ type: "page_view", uid: "u3", day: "2026-07-01" }), // not a login, ignored
    ];
    const result = computeDailyActiveUsers(events);
    expect(result).toEqual([
      { day: "2026-07-01", activeUsers: 2 },
      { day: "2026-07-02", activeUsers: 1 },
    ]);
  });

  it("returns an empty array for no login events rather than fabricating a point", () => {
    expect(computeDailyActiveUsers([])).toEqual([]);
  });
});

describe("computeRetentionSummary", () => {
  it("computes dau/wau/mau correctly from real login days", () => {
    const events = [
      event({ uid: "u1", day: "2026-07-10" }), // today
      event({ uid: "u2", day: "2026-07-05" }), // within 7 days
      event({ uid: "u3", day: "2026-06-20" }), // within 30 days, not 7
      event({ uid: "u4", day: "2026-05-01" }), // outside 30 days
    ];
    const summary = computeRetentionSummary(events, "2026-07-10");
    expect(summary.dau).toBe(1);
    expect(summary.wau).toBe(2);
    expect(summary.mau).toBe(3);
  });

  it("returns zero stickiness when there is no MAU, avoiding a divide-by-zero NaN", () => {
    const summary = computeRetentionSummary([], "2026-07-10");
    expect(summary).toEqual({ dau: 0, wau: 0, mau: 0, stickiness: 0 });
  });
});

describe("computeFeatureUsage / computeTopPages", () => {
  it("ranks features by real frequency, descending", () => {
    const events = [
      event({ type: "feature_action", feature: "invoice_created" }),
      event({ type: "feature_action", feature: "invoice_created" }),
      event({ type: "feature_action", feature: "exam_published" }),
    ];
    expect(computeFeatureUsage(events)).toEqual([
      { feature: "invoice_created", count: 2 },
      { feature: "exam_published", count: 1 },
    ]);
  });

  it("ranks pages by real visit frequency", () => {
    const events = [
      event({ type: "page_view", path: "/students" }),
      event({ type: "page_view", path: "/students" }),
      event({ type: "page_view", path: "/finance/fees" }),
    ];
    expect(computeTopPages(events)).toEqual([
      { path: "/students", count: 2 },
      { path: "/finance/fees", count: 1 },
    ]);
  });
});

describe("computeAdmissionsFunnel", () => {
  it("counts a lead into every stage up to and including its current one", () => {
    const leads = [
      { status: "Enrolled" }, // reaches all 10 stages
      { status: "Interview" }, // reaches first 6 stages (Enquiry..Interview)
      { status: "Enquiry" }, // reaches only stage 1
    ];
    const funnel = computeAdmissionsFunnel(leads);
    expect(funnel[0]).toMatchObject({ stage: "Enquiry", count: 3 });
    expect(funnel[5]).toMatchObject({ stage: "Interview", count: 2 });
    expect(funnel[9]).toMatchObject({ stage: "Enrolled", count: 1 });
  });

  it("skips leads with an unrecognized status instead of guessing a stage", () => {
    const funnel = computeAdmissionsFunnel([{ status: "SomeLegacyStatus" }]);
    expect(funnel.every((s) => s.count === 0)).toBe(true);
  });
});

describe("computeFeeFunnel", () => {
  it("splits real invoices into Invoiced/Paid/Pending/Overdue with real amounts", () => {
    const invoices = [
      { status: "Paid", amount: 1000 },
      { status: "Overdue", amount: 500 },
      { status: "Pending", amount: 300 },
    ];
    const funnel = computeFeeFunnel(invoices);
    expect(funnel.find((s) => s.stage === "Invoiced")).toMatchObject({ count: 3, amount: 1800 });
    expect(funnel.find((s) => s.stage === "Paid")).toMatchObject({ count: 1, amount: 1000 });
    expect(funnel.find((s) => s.stage === "Overdue")).toMatchObject({ count: 1, amount: 500 });
    expect(funnel.find((s) => s.stage === "Pending")).toMatchObject({ count: 1, amount: 300 });
  });
});
