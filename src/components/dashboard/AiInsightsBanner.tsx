import { motion } from "framer-motion";
import { Brain, TrendingDown, AlertTriangle, Users, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { smartDb } from "@/lib/localDb";
import { useStudents } from "@/contexts/StudentContext";

type InsightType = "warning" | "danger" | "info";

interface Insight {
  text: string;
  type: InsightType;
  action: string;
  path: string;
  reasoning: string;
}

const typeStyles: Record<InsightType, string> = {
  warning: "bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100/50",
  danger: "bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100/50",
  info: "bg-indigo-50 text-indigo-700 border-indigo-200/50 hover:bg-indigo-100/50",
};

const iconMap: Record<InsightType, typeof Users> = {
  warning: TrendingDown,
  danger: AlertTriangle,
  info: Users,
};

// Insights derived directly from the live database — no fabricated figures.
const buildInsights = (
  students: Record<string, unknown>[],
  attendance: Record<string, unknown>[]
): Insight[] => {
  const out: Insight[] = [];

  const total = students.length;
  const inactive = students.filter((s) => String(s.status).toLowerCase() === "inactive").length;
  const grades = new Set(students.map((s) => s.grade || s.classId).filter(Boolean));

  // Latest attendance day rate
  const dated = attendance.filter((a) => a.date);
  if (dated.length) {
    const latest = dated.reduce((m, a) => (String(a.date) > m ? String(a.date) : m), "");
    let present = 0, total2 = 0;
    dated.filter((a) => String(a.date) === latest).forEach((a) => {
      const p = Number(a.present || 0), ab = Number(a.absent || 0), l = Number(a.late || 0);
      present += p; total2 += p + ab + l;
    });
    if (total2 > 0) {
      const rate = Math.round((present / total2) * 100);
      out.push({
        text: `Attendance is ${rate}% on the latest recorded day`,
        type: rate < 90 ? "warning" : "info",
        action: "View attendance",
        path: "/attendance",
        reasoning: `${present} present out of ${total2} marked on ${new Date(latest).toLocaleDateString("en-GB")}.`,
      });
    }
  }

  if (inactive > 0) {
    out.push({
      text: `${inactive} student${inactive === 1 ? "" : "s"} marked inactive`,
      type: inactive > total * 0.15 ? "danger" : "warning",
      action: "Review students",
      path: "/students",
      reasoning: `${inactive} of ${total} student records currently have an "Inactive" status.`,
    });
  }

  out.push({
    text: `${total} students enrolled across ${grades.size} grade${grades.size === 1 ? "" : "s"}`,
    type: "info",
    action: "Open directory",
    path: "/students",
    reasoning: "Live enrolment count from the student directory.",
  });

  return out.slice(0, 3);
};

export function AiInsightsBanner() {
  const navigate = useNavigate();
  // Same deduplicated roster the "Total Students" KPI uses — keeps the
  // "N students enrolled" insight in sync with the rest of the dashboard.
  const { students } = useStudents();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchInsights = useCallback(async (isManual = false) => {
    setLoading(true);
    try {
      const attendance = (await smartDb.getAll("attendance")) as Record<string, unknown>[];
      setInsights(buildInsights(students as unknown as Record<string, unknown>[], attendance));
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (isManual) toast.success("Insights refreshed");
    } catch {
      setInsights([]);
    } finally {
      setLoading(false);
    }
    // `students` identity churns on every StudentContext poll (every ~5s), so
    // keying the effect on the ARRAY would refetch the 5k-row attendance table
    // in a loop and pin the banner at "Reading live data…" forever. Key on the
    // roster SIZE instead — enough to recompute when data actually arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleAction = (e: React.MouseEvent, action: string, path: string) => {
    e.stopPropagation();
    navigate(path);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="premium-card overflow-hidden"
    >
      <div className="gradient-ai px-5 py-3 flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary-foreground" />
        <h3 className="text-[13px] font-bold text-primary-foreground tracking-tight">Insights</h3>
        <div className="ml-auto flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-primary-foreground/70 font-medium hidden sm:inline">Updated {lastUpdated}</span>
          )}
          <button
            onClick={() => fetchInsights(true)}
            disabled={loading}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-primary-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {/* NOTE: no AnimatePresence here — mode="wait" only supports a single
          child, but the insights branch renders several; that combination
          permanently wedges the exit transition and pins the loader on screen. */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 min-h-[100px]">
        {loading && insights.length === 0 ? (
            <div
              key="loading"
              className="col-span-3 flex items-center justify-center py-6 gap-2 text-muted-foreground"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Reading live data…</span>
            </div>
          ) : insights.length > 0 ? (
            insights.map((insight, i) => {
              const Icon = iconMap[insight.type] || Users;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                  className={`flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200 group relative ${typeStyles[insight.type]}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-white/50 border border-white/20">
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold leading-tight">{insight.text}</p>
                      <p className="text-[11px] mt-1.5 opacity-80 line-clamp-2 font-medium">{insight.reasoning}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleAction(e, insight.action, insight.path)}
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-white/40 hover:bg-white/60 border border-white/30 text-[11px] font-bold transition-all group-hover:shadow-sm"
                  >
                    {insight.action}
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </motion.div>
              );
            })
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-3 text-center py-8 text-muted-foreground"
            >
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No data to summarise yet.</p>
            </motion.div>
          )}
      </div>
    </motion.div>
  );
}
