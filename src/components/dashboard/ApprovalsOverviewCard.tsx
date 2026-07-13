import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { ApprovalChip } from "@/hooks/useDashboardOverview";

interface Props {
  data: ApprovalChip[];
  loading?: boolean;
}

const TONE_STYLE = {
  pending: "bg-amber-50 text-amber-600",
  verified: "bg-emerald-50 text-emerald-600",
  rejected: "bg-rose-50 text-rose-600",
  info: "bg-blue-50 text-blue-600",
} as const;

// Deliberately named "Approvals Overview" rather than the mockup's "Document
// Requests" — this app has no document-management entity to back that card
// with real data. Every chip here is a real, currently-actionable queue
// (Leave, Purchase Orders, Admissions) the admin already has a page for.
export function ApprovalsOverviewCard({ data, loading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.75, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">{t("dashboard.cards.approvalsOverview")}</h3>
          <ClipboardCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/hr/leave")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[170px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : (
        <ul className="space-y-2">
          {data.map((chip, i) => (
            <motion.li
              key={chip.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.05, duration: 0.25 }}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className="text-xs font-semibold text-foreground">{chip.label}</span>
              <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-md tabular-nums ${TONE_STYLE[chip.tone]} ${chip.count > 0 && chip.tone === "pending" ? "animate-pulse" : ""}`}>
                {chip.count}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
