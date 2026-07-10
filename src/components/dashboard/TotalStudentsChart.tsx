import { useMemo } from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStudents } from "@/contexts/StudentContext";

interface Slice {
  name: string;
  value: number;
  color: string;
}

// Colors per known status; falls back to a neutral palette for anything else.
const STATUS_COLORS: Record<string, string> = {
  Active: "#16a34a",
  Inactive: "#94a3b8",
  Graduated: "#3b82f6",
  Suspended: "#f59e0b",
  Alumni: "#8b5cf6",
};
const FALLBACK_COLORS = ["#d12386", "#0ea5e9", "#f97316", "#14b8a6"];

export const TotalStudentsChart = () => {
  const navigate = useNavigate();
  // Same deduplicated roster as the "Total Students" KPI and AI insights —
  // all dashboard cards must agree on one student count.
  const { students, loading } = useStudents();

  const { data, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach((s) => {
      const key = (s.status && String(s.status).trim()) || "Unspecified";
      counts[key] = (counts[key] || 0) + 1;
    });
    let fb = 0;
    const slices: Slice[] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        color: STATUS_COLORS[name] || FALLBACK_COLORS[fb++ % FALLBACK_COLORS.length],
      }));
    return { data: slices, total: students.length };
  }, [students]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Enrollment Status</h3>
          <Users className="h-3.5 w-3.5 text-primary" />
        </div>
        <button
          onClick={() => navigate("/students")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          Details <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : total === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No students enrolled yet.
        </div>
      ) : (
        <>
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  animationBegin={300}
                  animationDuration={800}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-extrabold text-foreground leading-none">{total}</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">
                Total
              </span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 pt-3 border-t border-border">
            {data.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] font-bold text-foreground">
                  {item.name}: <span className="text-muted-foreground font-medium">{item.value}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};
