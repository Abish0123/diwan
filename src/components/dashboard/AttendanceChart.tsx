import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Info } from "lucide-react";
import { smartDb } from "@/lib/localDb";

interface AttendanceRow {
  date?: string;
  grade?: string;
  section?: string;
  present?: number;
  absent?: number;
  late?: number;
}

interface ChartRow {
  name: string;
  present: number;
  absent: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[11px] text-muted-foreground">
          {p.name}: <span className="font-bold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export function AttendanceChart() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = (await smartDb.getAll("attendance")) as AttendanceRow[];
        if (active) setRows(data);
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Aggregate the latest attendance date that actually has marked students.
  const { chartData, latestDate } = useMemo(() => {
    const dated = rows.filter((r) => r.date);
    if (dated.length === 0) return { chartData: [] as ChartRow[], latestDate: "" };
    // Total marked (present+absent+late) per date, then take the most recent non-empty one.
    const markedByDate: Record<string, number> = {};
    dated.forEach((r) => {
      const d = String(r.date);
      markedByDate[d] = (markedByDate[d] || 0) + Number(r.present || 0) + Number(r.absent || 0) + Number(r.late || 0);
    });
    const nonEmptyDates = Object.entries(markedByDate)
      .filter(([, total]) => total > 0)
      .map(([d]) => d);
    if (nonEmptyDates.length === 0) return { chartData: [] as ChartRow[], latestDate: "" };
    const latest = nonEmptyDates.reduce((max, d) => (d > max ? d : max), "");
    const byGrade: Record<string, ChartRow> = {};
    dated
      .filter((r) => String(r.date) === latest)
      .forEach((r) => {
        const key = `Grade ${r.grade ?? "?"}`;
        if (!byGrade[key]) byGrade[key] = { name: key, present: 0, absent: 0 };
        byGrade[key].present += Number(r.present || 0);
        byGrade[key].absent += Number(r.absent || 0) + Number(r.late || 0);
      });
    const sorted = Object.values(byGrade).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    return { chartData: sorted, latestDate: latest };
  }, [rows]);

  const totals = useMemo(
    () =>
      chartData.reduce(
        (acc, c) => ({ present: acc.present + c.present, absent: acc.absent + c.absent }),
        { present: 0, absent: 0 }
      ),
    [chartData]
  );

  const dateLabel = latestDate
    ? new Date(latestDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground font-heading">Attendance by Grade</h3>
            <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">Live</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Info className="h-3 w-3" />
            {dateLabel ? (
              <>
                Present: <span className="font-semibold text-foreground">{totals.present}</span> of{" "}
                {totals.present + totals.absent} on {dateLabel}
              </>
            ) : (
              "No attendance recorded yet"
            )}
          </p>
        </div>
      </div>
      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : chartData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No attendance data to display yet.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={3} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 94%)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)", fontWeight: 500 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220 13% 94% / 0.5)", radius: 4 }} />
              <Bar dataKey="present" fill="#9810fa" radius={[6, 6, 0, 0]} name="Present" />
              <Bar dataKey="absent" fill="#d12386" radius={[6, 6, 0, 0]} name="Absent / Late" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#9810fa]" />
              <span className="text-[11px] text-muted-foreground">Present: <span className="font-bold text-foreground">{totals.present}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#d12386]" />
              <span className="text-[11px] text-muted-foreground">Absent / Late: <span className="font-bold text-foreground">{totals.absent}</span></span>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
