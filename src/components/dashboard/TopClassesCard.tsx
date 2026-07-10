import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { TopClass } from "@/hooks/useDashboardOverview";

interface Props {
  data: TopClass[];
  loading?: boolean;
}

export function TopClassesCard({ data, loading }: Props) {
  const navigate = useNavigate();
  const maxScore = Math.max(...data.map((d) => d.avgScore), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Top Performing Classes</h3>
          <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/analytics")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View all classes <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No exam marks recorded yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((cls, i) => (
            <motion.li
              key={cls.className}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.05, duration: 0.25 }}
              className="flex items-center gap-3"
            >
              <span className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-extrabold text-slate-600 shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-foreground truncate">{cls.className}</span>
                  <span className="text-xs font-extrabold text-emerald-600 tabular-nums shrink-0">{cls.avgScore}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(cls.avgScore / maxScore) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.7 + i * 0.05, ease: "easeOut" }}
                    className="h-full rounded-full bg-emerald-500"
                  />
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
