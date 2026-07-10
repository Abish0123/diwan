import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { Briefcase, ArrowRight } from "lucide-react";
import { TeacherWorkloadSummary } from "@/hooks/useDashboardOverview";
import { CountUpNumber } from "./CountUpNumber";

interface Props {
  data: TeacherWorkloadSummary;
  loading?: boolean;
}

export function TeacherWorkloadCard({ data, loading }: Props) {
  const navigate = useNavigate();
  const total = data.full + data.medium + data.low;
  const chartData = [{ name: "load", value: data.avgLoadPct, fill: "#9810fa" }];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.65, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Teacher Workload Overview</h3>
          <Briefcase className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/hr/staff")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View workload report <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : total === 0 ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No subject assignments recorded yet.
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7, duration: 0.4, ease: "easeOut" }}
            className="h-[130px] w-full relative"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="85%" innerRadius="140%" outerRadius="220%" barSize={14} data={chartData} startAngle={180} endAngle={0}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  dataKey="value"
                  cornerRadius={8}
                  background={{ fill: "#f1f5f9" }}
                  isAnimationActive
                  animationBegin={250}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 bottom-2 flex flex-col items-center pointer-events-none">
              <span className="text-2xl font-extrabold text-foreground leading-none tabular-nums">
                <CountUpNumber value={data.avgLoadPct} suffix="%" />
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Average Load</span>
            </div>
          </motion.div>
          <div className="flex items-center justify-center gap-4 mt-2 pt-3 border-t border-border">
            {[
              { label: "Full Load", count: data.full, color: "bg-violet-600" },
              { label: "Medium", count: data.medium, color: "bg-blue-400" },
              { label: "Low", count: data.low, color: "bg-slate-300" },
            ].map((chip, i) => (
              <motion.div
                key={chip.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.08, duration: 0.25 }}
                className="flex items-center gap-1.5"
              >
                <span className={`h-2 w-2 rounded-full ${chip.color}`} />
                <span className="text-[11px] font-bold text-foreground">
                  {chip.label} <span className="text-muted-foreground font-medium">{chip.count} ({total > 0 ? Math.round((chip.count / total) * 100) : 0}%)</span>
                </span>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
