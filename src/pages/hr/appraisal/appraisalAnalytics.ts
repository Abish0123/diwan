import { Staff } from "@/types";

// Pure computation over real Appraisal scorecard rows — no fabricated
// figures. Handles both the wizard's dynamic kpiScores model and the older
// fixed 4-category model (teaching/punctuality/feedback/admin) so analytics
// work correctly for cycles created either way.

export interface AnalyticsScorecard {
  id: string;
  name: string;
  role?: string;
  department?: string;
  teaching?: number;
  punctuality?: number;
  feedback?: number;
  admin?: number;
  kpiScores?: Record<string, number>;
  overall: number;
  status: string;
  reviewers?: { hod?: string; principal?: string; hr?: string };
  deadlines?: { selfReview?: string };
  reminderSentAt?: string;
  cycleId?: string;
}

function scorecardDepartment(card: AnalyticsScorecard, staffByName: Map<string, Staff>): string {
  if (card.department) return card.department;
  return staffByName.get(card.name)?.department || "Unassigned";
}

export interface DeptStat { department: string; avgScore: number; gradedCount: number; totalCount: number }
export interface ScoreBand { label: string; count: number }
export interface ReviewerLoad { reviewer: string; count: number }
export interface KpiAreaStat { category: string; avgScore: number }
export interface AtRiskStaff { name: string; department: string; overall: number }

export interface CycleAnalytics {
  totalCount: number;
  gradedCount: number;
  pendingCount: number;
  overdueCount: number;
  remindersSent: number;
  avgScore: number;
  completionPct: number;
  departmentStats: DeptStat[];
  scoreDistribution: ScoreBand[];
  reviewerWorkload: ReviewerLoad[];
  topPerformers: { name: string; department: string; overall: number }[];
  improvementAreas: KpiAreaStat[];
  atRiskStaff: AtRiskStaff[];
  hasDeadlineData: boolean;
  hasReviewerData: boolean;
}

const SCORE_BANDS = [
  { label: "Outstanding (90+)", min: 90, max: 101 },
  { label: "Good (75-89)", min: 75, max: 90 },
  { label: "Satisfactory (60-74)", min: 60, max: 75 },
  { label: "Needs Improvement (<60)", min: 0, max: 60 },
];

export function computeCycleAnalytics(cards: AnalyticsScorecard[], allStaff: Staff[]): CycleAnalytics {
  const staffByName = new Map(allStaff.map((s) => [s.name, s]));
  const today = new Date().toISOString().slice(0, 10);

  const graded = cards.filter((c) => (Number(c.overall) || 0) > 0);
  const pending = cards.filter((c) => (Number(c.overall) || 0) === 0);
  const hasDeadlineData = cards.some((c) => c.deadlines?.selfReview);
  const overdueCount = pending.filter((c) => c.deadlines?.selfReview && c.deadlines.selfReview < today).length;
  const remindersSent = cards.filter((c) => c.reminderSentAt).length;
  const avgScore = graded.length
    ? Math.round((graded.reduce((s, c) => s + (Number(c.overall) || 0), 0) / graded.length) * 10) / 10
    : 0;
  const completionPct = cards.length ? Math.round((graded.length / cards.length) * 100) : 0;

  // Department comparison — real join against Staff for legacy cards that
  // never had a `department` field stamped on them at creation time.
  const deptBuckets = new Map<string, { sum: number; graded: number; total: number }>();
  cards.forEach((c) => {
    const dept = scorecardDepartment(c, staffByName);
    const bucket = deptBuckets.get(dept) || { sum: 0, graded: 0, total: 0 };
    bucket.total++;
    const score = Number(c.overall) || 0;
    if (score > 0) { bucket.sum += score; bucket.graded++; }
    deptBuckets.set(dept, bucket);
  });
  const departmentStats: DeptStat[] = Array.from(deptBuckets.entries())
    .map(([department, b]) => ({ department, avgScore: b.graded ? Math.round((b.sum / b.graded) * 10) / 10 : 0, gradedCount: b.graded, totalCount: b.total }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const scoreDistribution: ScoreBand[] = SCORE_BANDS.map((band) => ({
    label: band.label,
    count: graded.filter((c) => (Number(c.overall) || 0) >= band.min && (Number(c.overall) || 0) < band.max).length,
  }));

  // Reviewer workload — only real for cycles created via the wizard (legacy
  // cycles never resolved/stored a reviewers object).
  const reviewerCounts = new Map<string, number>();
  cards.forEach((c) => {
    [c.reviewers?.hod, c.reviewers?.principal, c.reviewers?.hr].forEach((r) => {
      if (r && r !== "Unassigned") reviewerCounts.set(r, (reviewerCounts.get(r) || 0) + 1);
    });
  });
  const hasReviewerData = reviewerCounts.size > 0;
  const reviewerWorkload: ReviewerLoad[] = Array.from(reviewerCounts.entries())
    .map(([reviewer, count]) => ({ reviewer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topPerformers = [...graded]
    .sort((a, b) => (Number(b.overall) || 0) - (Number(a.overall) || 0))
    .slice(0, 5)
    .map((c) => ({ name: c.name, department: scorecardDepartment(c, staffByName), overall: Number(c.overall) || 0 }));

  // Improvement areas — average score per KPI category across every graded
  // card that has that category, lowest first. Merges the wizard's dynamic
  // kpiScores with the legacy 4-field model under one shared label set.
  const kpiBuckets = new Map<string, { sum: number; count: number }>();
  graded.forEach((c) => {
    const fields: Record<string, number | undefined> = c.kpiScores
      ? c.kpiScores
      : { "Teaching Quality": c.teaching, "Punctuality": c.punctuality, "Student Feedback": c.feedback, "Admin Tasks": c.admin };
    Object.entries(fields).forEach(([k, v]) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return;
      const b = kpiBuckets.get(k) || { sum: 0, count: 0 };
      b.sum += n; b.count++;
      kpiBuckets.set(k, b);
    });
  });
  const improvementAreas: KpiAreaStat[] = Array.from(kpiBuckets.entries())
    .map(([category, b]) => ({ category, avgScore: Math.round((b.sum / b.count) * 10) / 10 }))
    .sort((a, b) => a.avgScore - b.avgScore);

  const atRiskStaff: AtRiskStaff[] = graded
    .filter((c) => (Number(c.overall) || 0) < 60)
    .map((c) => ({ name: c.name, department: scorecardDepartment(c, staffByName), overall: Number(c.overall) || 0 }))
    .sort((a, b) => a.overall - b.overall);

  return {
    totalCount: cards.length,
    gradedCount: graded.length,
    pendingCount: pending.length,
    overdueCount,
    remindersSent,
    avgScore,
    completionPct,
    departmentStats,
    scoreDistribution,
    reviewerWorkload,
    topPerformers,
    improvementAreas,
    atRiskStaff,
    hasDeadlineData,
    hasReviewerData,
  };
}
