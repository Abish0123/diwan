import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Award, ArrowRight, TrendingUp, Users2, Building2, Sparkles } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { Staff } from "@/types";
import { computeCycleAnalytics, AnalyticsScorecard } from "@/pages/hr/appraisal/appraisalAnalytics";

interface CycleRow { id: string; type?: string; title?: string; startedAt?: string; branchId?: string }

// Executive-level "glance" card for the main admin dashboard — the appraisal
// module's own Analytics tab (Performance Appraisal → Analytics) has the
// full breakdown; this is the compact summary a School Owner/Director-tier
// viewer would want without navigating into HR at all. Same real data
// source (computeCycleAnalytics), just condensed to 4 headline figures.
export function PerformanceOverviewCard() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<AnalyticsScorecard[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [cycleTitle, setCycleTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      smartDb.getAll("Appraisal", undefined) as Promise<(AnalyticsScorecard & CycleRow)[]>,
      smartDb.getAll("Staff", undefined) as Promise<Staff[]>,
    ]).then(([appraisalData, staffData]) => {
      if (!active) return;
      const cycles = appraisalData.filter((d) => d.type === "cycle");
      const latest = [...cycles].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
      setCycleTitle(latest?.title || null);
      setCards(latest ? appraisalData.filter((d) => d.cycleId === latest.id) : []);
      setAllStaff(staffData);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.4 }} className="premium-card p-5">
        <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      </motion.div>
    );
  }

  if (cards.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.4 }} className="premium-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Award className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold text-foreground font-heading">Performance Overview</h3>
        </div>
        <div className="h-[110px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No active appraisal cycle yet.
        </div>
      </motion.div>
    );
  }

  const a = computeCycleAnalytics(cards, allStaff);
  const topDept = a.departmentStats.find((d) => d.gradedCount > 0);

  // Real, honest one-line summary — no fabricated "improved by N%" claim,
  // since a genuine year-over-year comparison needs 2+ completed cycles,
  // which this school doesn't have yet.
  const summary = a.gradedCount === 0
    ? `${cycleTitle || "The current cycle"} has started — no scorecards graded yet.`
    : `${a.completionPct}% of "${cycleTitle}" is complete, averaging ${a.avgScore}% across ${a.gradedCount} graded staff.`;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.4 }} className="premium-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold text-foreground font-heading">Performance Overview</h3>
        </div>
        <button type="button" onClick={() => navigate("/hr/appraisal")} className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
          Analytics <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-purple-50 p-3">
          <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide">Overall Completion</p>
          <p className="text-xl font-black text-purple-700 mt-0.5">{a.completionPct}%</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Average Score</p>
          <p className="text-xl font-black text-emerald-700 mt-0.5">{a.gradedCount ? `${a.avgScore}%` : "—"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Building2 className="h-2.5 w-2.5" /> Top Department</p>
          <p className="text-sm font-bold text-slate-800 mt-1 truncate">{topDept ? `${topDept.department} (${topDept.avgScore}%)` : "—"}</p>
        </div>
        <div className="rounded-xl bg-rose-50 p-3">
          <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1"><Users2 className="h-2.5 w-2.5" /> Needs Development</p>
          <p className="text-sm font-bold text-rose-700 mt-1">{a.atRiskStaff.length} staff</p>
        </div>
      </div>

      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-border">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">{summary}</p>
      </div>
    </motion.div>
  );
}
