import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { UserPlus, Users, FileCheck, Gift, GraduationCap, ArrowRight } from "lucide-react";
import { FunnelStage } from "@/hooks/useDashboardOverview";

interface Props {
  data: FunnelStage[];
  loading?: boolean;
}

const ICONS = [UserPlus, Users, FileCheck, Gift, GraduationCap];
const COLORS = ["text-blue-600 bg-blue-50", "text-violet-600 bg-violet-50", "text-amber-600 bg-amber-50", "text-fuchsia-600 bg-fuchsia-50", "text-emerald-600 bg-emerald-50"];

export function AdmissionsFunnelCard({ data, loading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground font-heading">{t("dashboard.cards.admissionsFunnel")}</h3>
        <button
          type="button"
          onClick={() => navigate("/admissions")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View admission pipeline <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : data.every((d) => d.count === 0) ? (
        <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No admission leads yet.
        </div>
      ) : (
        <div className="flex items-stretch justify-between gap-1">
          {data.map((stage, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={stage.label} className="flex items-center flex-1 min-w-0">
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.06, duration: 0.3 }}
                  className="flex flex-col items-center gap-2 flex-1 min-w-0"
                >
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${COLORS[i % COLORS.length]}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center truncate w-full">{stage.label}</span>
                  <span className="text-lg font-extrabold text-foreground tabular-nums">{stage.count.toLocaleString()}</span>
                </motion.div>
                {i < data.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mx-0.5" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
