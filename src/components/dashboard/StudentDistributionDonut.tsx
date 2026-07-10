import { motion } from "motion/react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GradeStrengthPoint } from "@/hooks/useDashboardOverview";

interface Props {
  data: GradeStrengthPoint[];
  loading?: boolean;
}

const COLORS = ["#4f46e5", "#7c3aed", "#9810fa", "#c026d3", "#db2777"];

export function StudentDistributionDonut({ data, loading }: Props) {
  const navigate = useNavigate();
  const total = data.reduce((s, d) => s + d.students, 0);
  const slices = data.map((d, i) => ({ ...d, color: COLORS[i % COLORS.length] }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Student Distribution by Grade</h3>
          <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/students")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View full breakdown <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No students enrolled yet.
        </div>
      ) : (
        <>
          <div className="h-[150px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={3} dataKey="students" animationBegin={200} animationDuration={700}>
                  {slices.map((s, i) => <Cell key={i} fill={s.color} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-extrabold text-foreground leading-none tabular-nums">{total.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Total</span>
            </div>
          </div>
          <div className="space-y-1.5 mt-3 pt-3 border-t border-border max-h-[100px] overflow-y-auto">
            {slices.map((s) => (
              <div key={s.grade} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-bold text-foreground truncate">{s.grade}</span>
                </span>
                <span className="text-muted-foreground font-medium shrink-0">
                  {s.students} ({total > 0 ? Math.round((s.students / total) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
