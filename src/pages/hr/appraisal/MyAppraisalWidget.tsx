import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Award, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { AnalyticsScorecard } from "./appraisalAnalytics";
import { SelfReviewDialog } from "./SelfReviewDialog";

interface CycleRow { id: string; type?: string; title?: string; startedAt?: string }

// Real, personal "is there an appraisal waiting for me" widget — renders
// nothing at all if the logged-in user has no real scorecard for the active
// cycle (no fabricated placeholder card), matching this app's honesty
// convention for every other dashboard widget.
const STATUS_PROGRESS: Record<string, number> = {
  "Not Started": 20,
  "Self Review Submitted": 50,
  "HOD Review": 65,
  "Principal Approval": 80,
  "HR Verification": 90,
  "Completed": 100,
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  "Not Started": "admin.hr.appraisal.myAppraisalWidget.statusNotStarted",
  "Self Review Submitted": "admin.hr.appraisal.myAppraisalWidget.statusSelfReviewSubmitted",
  "HOD Review": "admin.hr.appraisal.myAppraisalWidget.statusHodReview",
  "Principal Approval": "admin.hr.appraisal.myAppraisalWidget.statusPrincipalApproval",
  "HR Verification": "admin.hr.appraisal.myAppraisalWidget.statusHrVerification",
  "Completed": "admin.hr.appraisal.myAppraisalWidget.statusCompleted",
};

export function MyAppraisalWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [card, setCard] = useState<AnalyticsScorecard | null>(null);
  const [cycleTitle, setCycleTitle] = useState<string>("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.email) { setLoaded(true); return; }
    try {
      const [appraisalData, staffData] = await Promise.all([
        smartDb.getAll("Appraisal", undefined) as Promise<(AnalyticsScorecard & CycleRow)[]>,
        smartDb.getAll("Staff", undefined) as Promise<{ name: string; email: string }[]>,
      ]);
      const me = staffData.find((s) => s.email?.toLowerCase() === user.email?.toLowerCase());
      if (!me) { setCard(null); setLoaded(true); return; }
      const cycles = appraisalData.filter((d) => d.type === "cycle");
      const latestCycle = [...cycles].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
      if (!latestCycle) { setCard(null); setLoaded(true); return; }
      const mine = appraisalData.find((d) => d.cycleId === latestCycle.id && d.name === me.name);
      setCard(mine || null);
      setCycleTitle(latestCycle.title || t("admin.hr.appraisal.myAppraisalWidget.defaultCycleTitle"));
    } catch {
      setCard(null);
    } finally {
      setLoaded(true);
    }
  }, [user?.email]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || !card) return null;

  // The server masks a graded status to "Under Review" (and zeroes `overall`)
  // whenever HR/Principal hasn't published this scorecard yet — see
  // server.ts's Appraisal read restriction. Show that plainly rather than
  // rendering "Under Review" as if it were just another workflow stage.
  const isUnderReview = card.status === "Under Review" && !card.published;
  const progress = STATUS_PROGRESS[card.status] ?? (Number(card.overall) > 0 ? 50 : 20);
  const alreadySubmitted = card.status !== "Not Started";

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="premium-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Award className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold text-foreground font-heading">{cycleTitle}</h3>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`h-2 w-2 rounded-full ${isUnderReview ? "bg-indigo-400" : alreadySubmitted ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="text-xs font-semibold text-slate-600">
            {isUnderReview ? t("admin.hr.appraisal.myAppraisalWidget.resultNotPublished") : t(STATUS_LABEL_KEYS[card.status] || card.status)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.7, ease: "easeOut" }} className="h-full rounded-full bg-gradient-to-r from-[#9810fa] to-[#d12386]" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t("admin.hr.appraisal.myAppraisalWidget.due")}</p>
            <p className="font-semibold text-slate-700">{card.deadlines?.selfReview || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t("admin.hr.appraisal.myAppraisalWidget.reviewer")}</p>
            <p className="font-semibold text-slate-700 truncate">{card.reviewers?.hod && card.reviewers.hod !== "Unassigned" ? card.reviewers.hod : (card.reviewers?.principal || t("admin.hr.appraisal.myAppraisalWidget.notAssigned"))}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          disabled={alreadySubmitted}
          className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-sm font-bold transition flex items-center justify-center gap-1.5"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {alreadySubmitted ? t("admin.hr.appraisal.myAppraisalWidget.statusSelfReviewSubmitted") : t("admin.hr.appraisal.myAppraisalWidget.startReview")}
        </button>
      </motion.div>

      <SelfReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} scorecard={card} onSubmitted={load} />
    </>
  );
}
