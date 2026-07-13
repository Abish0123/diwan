import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Shield, AlertTriangle, Info } from "lucide-react";
import { ActivityRow } from "@/hooks/useDashboardOverview";

interface Props {
  data: ActivityRow[];
  loading?: boolean;
}

const TYPE_ICON = { security: Shield, warning: AlertTriangle, info: Info } as const;
const TYPE_STYLE = {
  security: "bg-blue-50 text-blue-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-emerald-50 text-emerald-600",
} as const;

export function RecentActivitiesCard({ data, loading }: Props) {
  const { t } = useTranslation();
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
          <h3 className="text-sm font-bold text-foreground font-heading">{t("dashboard.cards.recentActivities")}</h3>
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings/audit")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[170px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-[170px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No recent activity recorded yet.
        </div>
      ) : (
        <ul className="space-y-1">
          {data.map((row, i) => {
            const Icon = TYPE_ICON[row.type];
            return (
              <motion.li
                key={row.id || i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.75 + i * 0.05, duration: 0.25 }}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${TYPE_STYLE[row.type]}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {row.action}{row.target ? ` — ${row.target}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{row.user} · {row.at}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
