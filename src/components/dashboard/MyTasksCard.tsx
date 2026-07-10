import { motion } from "motion/react";
import { CheckSquare, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PendingTask } from "@/hooks/useDashboardOverview";

interface Props {
  tasks: PendingTask[];
  loading?: boolean;
}

const CATEGORY_BADGE: Record<string, string> = {
  Admissions: "bg-blue-50 text-blue-600",
  Finance: "bg-emerald-50 text-emerald-600",
  Administration: "bg-amber-50 text-amber-600",
  Reports: "bg-violet-50 text-violet-600",
};

export function MyTasksCard({ tasks, loading }: Props) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">My Tasks</h3>
          <CheckSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={() => navigate(tasks[0].url)}
            className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
          >
            View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          Nothing pending — all caught up.
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task, i) => (
            <motion.li
              key={task.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.75 + i * 0.05, duration: 0.25 }}
              className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group"
              onClick={() => navigate(task.url)}
            >
              <span className="h-4 w-4 rounded border-2 border-slate-300 shrink-0 group-hover:border-primary transition-colors" aria-hidden="true" />
              <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{task.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${CATEGORY_BADGE[task.category] || "bg-slate-50 text-slate-600"}`}>
                {task.category}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
