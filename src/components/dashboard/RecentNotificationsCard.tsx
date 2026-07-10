import { motion, AnimatePresence } from "motion/react";
import { Bell, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { formatDistanceToNow } from "date-fns";

const CATEGORY_DOT: Record<string, string> = {
  student: "bg-blue-500",
  staff: "bg-violet-500",
  finance: "bg-emerald-500",
  admission: "bg-amber-500",
  general: "bg-slate-400",
};

export function RecentNotificationsCard() {
  const navigate = useNavigate();
  const { notifications } = useNotificationsContext();
  const recent = notifications.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Recent Notifications</h3>
          <Bell className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/communication/notifications")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No notifications yet.
        </div>
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {recent.map((n, i) => (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.04, duration: 0.25 }}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => navigate(n.redirectUrl || "/communication/notifications")}
              >
                <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${CATEGORY_DOT[n.category] || CATEGORY_DOT.general} ${!n.read ? "animate-pulse" : ""}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                  {n.message && <p className="text-[11px] text-muted-foreground truncate">{n.message}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                  {(() => { try { return formatDistanceToNow(new Date(n.time), { addSuffix: true }); } catch { return ""; } })()}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
