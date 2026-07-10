import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { CountUpNumber } from "./CountUpNumber";

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
}

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
}: KpiCardProps) => {
  const isNumeric = typeof value === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      className={cn("premium-card p-6 group transition-shadow duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20", className)}
    >
      <div className="flex items-center justify-between mb-5">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm", iconClassName || "bg-primary/10")}>
          <Icon className={cn("h-6 w-6", iconClassName ? "text-current" : "text-primary")} aria-hidden="true" />
        </div>
        {trend && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.08 + 0.3, duration: 0.25 }}
            className={cn(
              "text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm",
              trendType === "up" ? "bg-emerald-50 text-emerald-600" :
              trendType === "down" ? "bg-rose-50 text-rose-600" :
              "bg-slate-50 text-slate-600"
            )}
          >
            {trend}
          </motion.span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">{title}</p>
        <p className="text-3xl font-extrabold mt-1.5 tracking-tight text-foreground tabular-nums">
          {isNumeric ? <CountUpNumber value={value as number} prefix={valuePrefix} suffix={valueSuffix} /> : value}
        </p>
        {description && <p className="text-[11px] text-muted-foreground/80 mt-2 font-medium">{description}</p>}
      </div>
    </motion.div>
  );
};
