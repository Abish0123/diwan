// Real aggregation logic for the Product Analytics dashboard. Every function
// here takes raw rows already fetched from MySQL (via smartDb.getAll) and
// derives a view from them — no fabricated numbers, no placeholder series.
// If a dataset is empty, the corresponding view is honestly empty/zero
// rather than backfilled with plausible-looking sample data.

export interface AnalyticsEventRow {
  id: string;
  type: "login" | "logout" | "page_view" | "feature_action";
  uid: string;
  role?: string;
  path?: string;
  feature?: string;
  day: string; // YYYY-MM-DD
  createdAt: string;
}

export interface RetentionPoint {
  day: string;
  activeUsers: number;
}

// One point per calendar day present in the event log, counting distinct
// uids that logged in that day — a school's real DAU, not a rolling
// estimate. Sorted ascending by day so it can be handed straight to a chart.
export function computeDailyActiveUsers(events: AnalyticsEventRow[]): RetentionPoint[] {
  const byDay = new Map<string, Set<string>>();
  events.forEach((e) => {
    if (e.type !== "login") return;
    if (!byDay.has(e.day)) byDay.set(e.day, new Set());
    byDay.get(e.day)!.add(e.uid);
  });
  return Array.from(byDay.entries())
    .map(([day, uids]) => ({ day, activeUsers: uids.size }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export interface RetentionSummary {
  dau: number; // logins today
  wau: number; // distinct users active in the last 7 days
  mau: number; // distinct users active in the last 30 days
  // wau / mau, expressed as a percentage — a common "stickiness" read: what
  // share of the monthly base is coming back within a given week.
  stickiness: number;
}

export function computeRetentionSummary(events: AnalyticsEventRow[], today: string): RetentionSummary {
  const loginEvents = events.filter((e) => e.type === "login");
  const dayMs = 24 * 60 * 60 * 1000;
  const todayDate = new Date(`${today}T00:00:00Z`).getTime();

  const within = (days: number) =>
    new Set(
      loginEvents
        .filter((e) => {
          const d = new Date(`${e.day}T00:00:00Z`).getTime();
          return todayDate - d < days * dayMs && todayDate - d >= 0;
        })
        .map((e) => e.uid)
    ).size;

  const dau = within(1);
  const wau = within(7);
  const mau = within(30);
  const stickiness = mau > 0 ? Math.round((wau / mau) * 1000) / 10 : 0;

  return { dau, wau, mau, stickiness };
}

export interface FeatureUsagePoint {
  feature: string;
  count: number;
}

// Ranks real feature_action events by frequency — this is literally "what did
// people click," not a synthetic engagement score.
export function computeFeatureUsage(events: AnalyticsEventRow[], limit = 10): FeatureUsagePoint[] {
  const counts = new Map<string, number>();
  events.forEach((e) => {
    if (e.type !== "feature_action" || !e.feature) return;
    counts.set(e.feature, (counts.get(e.feature) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface PageViewPoint {
  path: string;
  count: number;
}

export function computeTopPages(events: AnalyticsEventRow[], limit = 10): PageViewPoint[] {
  const counts = new Map<string, number>();
  events.forEach((e) => {
    if (e.type !== "page_view" || !e.path) return;
    counts.set(e.path, (counts.get(e.path) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// The real 10-stage admissions pipeline (src/types/admissions.ts LeadStatus) —
// intentionally not "New/Contacted/Applied/Enrolled", since that's not what
// this school's process actually looks like.
export const ADMISSIONS_FUNNEL_STAGES = [
  "Enquiry",
  "Form Sent",
  "Form Submitted",
  "Payment Done",
  "Exam",
  "Interview",
  "Doc Verification",
  "School Fee",
  "Section Allocation",
  "Enrolled",
] as const;

export interface FunnelStage {
  stage: string;
  count: number;
  // % of leads that reached this stage or further, relative to the funnel's
  // first stage — the standard "how many made it this far" funnel metric.
  conversionFromStart: number;
}

interface LeadLike {
  status: string;
}

// A lead "reached" every stage up to and including its current one — it's
// no longer in "Enquiry" once it's moved to "Interview", but it did pass
// through Enquiry, so that stage's count still includes it. This is the
// standard cumulative-funnel definition (matches how Kanban/pipeline boards
// are usually read), not a snapshot of "currently sitting in this column."
export function computeAdmissionsFunnel(leads: LeadLike[]): FunnelStage[] {
  const stageIndex = new Map<string, number>();
  ADMISSIONS_FUNNEL_STAGES.forEach((s, i) => stageIndex.set(s, i));

  const reachedCounts = new Array(ADMISSIONS_FUNNEL_STAGES.length).fill(0);
  leads.forEach((lead) => {
    const idx = stageIndex.get(lead.status);
    if (idx === undefined) return; // unknown/legacy status — skip rather than guess
    for (let i = 0; i <= idx; i++) reachedCounts[i]++;
  });

  const start = reachedCounts[0] || 0;
  return ADMISSIONS_FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: reachedCounts[i],
    conversionFromStart: start > 0 ? Math.round((reachedCounts[i] / start) * 1000) / 10 : 0,
  }));
}

export interface FeeFunnelStage {
  stage: string;
  count: number;
  amount: number;
}

interface InvoiceLike {
  status?: string;
  amount?: number;
  total?: number;
}

// Real fee-collection funnel from actual Invoice records — Invoiced (all
// rows) → Paid (status === "Paid") → Overdue (status === "Overdue"), so this
// reads directly off whatever the Finance module already wrote, no separate
// bookkeeping.
export function computeFeeFunnel(invoices: InvoiceLike[]): FeeFunnelStage[] {
  const amountOf = (inv: InvoiceLike) => Number(inv.amount ?? inv.total ?? 0) || 0;
  const invoiced = invoices;
  const paid = invoices.filter((i) => i.status === "Paid");
  const overdue = invoices.filter((i) => i.status === "Overdue");
  const pending = invoices.filter((i) => i.status !== "Paid" && i.status !== "Overdue");

  const sum = (rows: InvoiceLike[]) => rows.reduce((acc, r) => acc + amountOf(r), 0);

  return [
    { stage: "Invoiced", count: invoiced.length, amount: sum(invoiced) },
    { stage: "Paid", count: paid.length, amount: sum(paid) },
    { stage: "Pending", count: pending.length, amount: sum(pending) },
    { stage: "Overdue", count: overdue.length, amount: sum(overdue) },
  ];
}
