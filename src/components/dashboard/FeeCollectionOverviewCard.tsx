import { motion } from "motion/react";
import { DollarSign, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeeOverview } from "@/hooks/useDashboardOverview";
import { CountUpNumber } from "./CountUpNumber";
import { useSweepProgress } from "@/hooks/useSweepProgress";

interface Props {
  data: FeeOverview;
  currency: string;
  loading?: boolean;
}

const BAR_DURATION_MS = 900;

export function FeeCollectionOverviewCard({ data, currency, loading }: Props) {
  const navigate = useNavigate();

  const ready = !loading && data.totalFees > 0;
  // Same setTimeout-driven sweep as the donut/attendance rings — framer-
  // motion's width tween here was previously requestAnimationFrame-driven
  // and subject to the same backgrounded-tab freeze.
  const sweep = useSweepProgress(BAR_DURATION_MS, ready);
  const barPct = Math.min(100, data.collectedPct) * sweep;

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
        <div className="space-y-4">
          <div className="h-8 w-40 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-2 w-full rounded-full bg-muted/40 animate-pulse" />
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
            <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
            <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
          </div>
        </div>
      ) : data.totalFees === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No invoices generated yet.
        </div>
      ) : (
        <>
          <p className="text-3xl font-extrabold text-foreground tracking-tight tabular-nums">
            {currency} <CountUpNumber value={data.collected} animateOnMount duration={BAR_DURATION_MS} />
          </p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Collected</p>

          <div className="relative h-2 w-full rounded-full bg-slate-100 mt-4 overflow-visible">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9810fa] to-[#d12386]"
              style={{ width: `${barPct}%` }}
            />
            {/* Indicator dot sliding across the bar as it fills */}
            {barPct > 0 && (
              <span
                className="absolute top-1/2 h-3 w-3 rounded-full bg-white border-2 border-[#d12386] shadow-md"
                style={{ left: `${barPct}%`, transform: "translate(-50%, -50%)" }}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border text-center">
            {[
              { label: "Total Fees", value: `${currency} ${data.totalFees.toLocaleString()}`, className: "text-foreground" },
              { label: "Collected", value: `${data.collectedPct}%`, className: "text-emerald-600" },
              { label: "Pending", value: `${currency} ${data.pending.toLocaleString()}`, className: "text-rose-600" },
            ].map((metric, i) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.3 }}
              >
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{metric.label}</p>
                <p className={`text-sm font-bold mt-0.5 tabular-nums ${metric.className}`}>{metric.value}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
