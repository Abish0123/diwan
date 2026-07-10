import { motion } from "motion/react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { BarChart3, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GradeStrengthPoint } from "@/hooks/useDashboardOverview";

interface Props {
  data: GradeStrengthPoint[];
  loading?: boolean;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border-none shadow-lg bg-white px-3 py-2 text-xs">
      <p className="font-bold text-foreground">{payload[0].payload.grade}</p>
      <p className="text-muted-foreground">{payload[0].value} Students</p>
    </div>
  );
}

export function StudentStrengthByGradeChart({ data, loading }: Props) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Student Strength by Grade</h3>
          <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/students")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          Details <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No students enrolled yet.
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="grade" fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(152,16,250,0.06)" }} />
              <Bar dataKey="students" radius={[6, 6, 0, 0]} animationDuration={600}>
                {data.map((_, i) => <Cell key={i} fill="#9810fa" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
