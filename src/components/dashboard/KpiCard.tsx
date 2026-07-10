import { LucideIcon, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { CountUpNumber } from "./CountUpNumber";
import { KpiTrendArea } from "./KpiTrendArea";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendType?: "up" | "down" | "neutral";
  description?: string;
  className?: string;
  iconClassName?: string;
  index?: number;
  /** Shown as a prefix/suffix around the animated number when `value` is a
   *  plain number — e.g. prefix="QAR " or suffix="%". Ignored when `value`
   *  is already a formatted string (some callers pre-format with commas). */
  valuePrefix?: string;
  valueSuffix?: string;
  /** Real trailing values for the trend strip (e.g. last 7 days). Omit when
   *  no real trend series exists for this metric — it then renders a flat
   *  real-value line rather than fabricating a trend shape. */
  trendSeries?: number[];
  /** Accent color driving the icon tint, trend text, and trend-area chart —
   *  matches the card's semantic color (e.g. emerald for Attendance). */
  accentColor?: string;
}

const TREND_ICON = { up: ArrowUp, down: ArrowDown, neutral: Minus } as const;

export const KpiCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendType = "neutral",
  description,
  className,
  iconClassName,
  index = 0,
  valuePrefix = "",
  valueSuffix = "",
  trendSeries,
  accentColor = "#9810fa",
}: KpiCardProps) => {
  const isNumeric = typeof value === "number";
  const TrendIcon = TREND_ICON[trendType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -6 }}
      className={cn("premium-card group flex flex-col transition-shadow duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20", className)}
    >
      <div className="p-5 pb-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-[8deg] shadow-sm", iconClassName || "bg-primary/10")}>
          <Icon className={cn("h-5 w-5", iconClassName ? "text-current" : "text-primary")} aria-hidden="true" />
        </div>

        <p className="text-xs font-semibold text-muted-foreground mt-3">{title}</p>
        <p className="text-2xl font-extrabold mt-1 tracking-tight text-foreground tabular-nums">
          {isNumeric ? <CountUpNumber value={value as number} prefix={valuePrefix} suffix={valueSuffix} /> : value}
        </p>

        {trend && (
          <motion.p
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 + 0.3, duration: 0.25 }}
            className="flex items-center gap-1 text-[11px] font-bold mt-1.5"
            style={{ color: accentColor }}
          >
            <TrendIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{trend}</span>
            {description && <span className="text-muted-foreground font-medium">{description}</span>}
          </motion.p>
        )}
      </div>

      <KpiTrendArea values={trendSeries && trendSeries.length > 0 ? trendSeries : [typeof value === "number" ? value : 0]} color={accentColor} />
    </motion.div>
  );
};
