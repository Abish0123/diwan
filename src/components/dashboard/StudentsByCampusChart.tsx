import { motion } from "motion/react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Building2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CampusPoint } from "@/hooks/useDashboardOverview";

interface Props {
  data: CampusPoint[];
  loading?: boolean;
}

export function StudentsByCampusChart({ data, loading }: Props) {
  const navigate = useNavigate();
  const total = data.reduce((sum, d) => sum + d.students, 0);
  const slices = data.filter((d) => d.students > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Students by Campus</h3>
          <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/branches")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          Details <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : total === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No students enrolled yet.
        </div>
      ) : (
        <>
          <div className="h-[180px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="students" nameKey="name" animationBegin={250} animationDuration={700}>
                  {slices.map((s, i) => <Cell key={i} fill={s.color} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-extrabold text-foreground leading-none">{total}</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Total</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 pt-3 border-t border-border">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[11px] font-bold text-foreground">
                  {s.name}: <span className="text-muted-foreground font-medium">{s.students} ({total > 0 ? Math.round((s.students / total) * 100) : 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
