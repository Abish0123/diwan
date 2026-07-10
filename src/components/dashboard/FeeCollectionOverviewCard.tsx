import { motion } from "motion/react";
import { DollarSign, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeeOverview } from "@/hooks/useDashboardOverview";

interface Props {
  data: FeeOverview;
  currency: string;
  loading?: boolean;
}

export function FeeCollectionOverviewCard({ data, currency, loading }: Props) {
  const navigate = useNavigate();
  const fmt = (n: number) => `${currency} ${n.toLocaleString()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Fee Collection Overview</h3>
          <DollarSign className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/finance/fees")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          This Month <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.totalFees === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No invoices generated yet.
        </div>
      ) : (
        <>
          <p className="text-3xl font-extrabold text-foreground tracking-tight tabular-nums">{fmt(data.collected)}</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Collected</p>

          <div className="h-2 w-full rounded-full bg-slate-100 mt-4 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, data.collectedPct)}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              className="h-full rounded-full bg-gradient-to-r from-[#9810fa] to-[#d12386]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border text-center">
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Total Fees</p>
              <p className="text-sm font-bold text-foreground mt-0.5 tabular-nums">{fmt(data.totalFees)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Collected</p>
              <p className="text-sm font-bold text-emerald-600 mt-0.5 tabular-nums">{data.collectedPct}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Pending</p>
              <p className="text-sm font-bold text-rose-600 mt-0.5 tabular-nums">{fmt(data.pending)}</p>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
