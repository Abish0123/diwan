import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
}: KpiCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className={cn("premium-card p-6 group", className)}
    >
      <div className="flex items-center justify-between mb-5">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-sm", iconClassName || "bg-primary/10")}>
          <Icon className={cn("h-6 w-6", iconClassName ? "text-current" : "text-primary")} />
        </div>
        {trend && (
          <span className={cn(
            "text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm",
            trendType === "up" ? "bg-emerald-50 text-emerald-600" : 
            trendType === "down" ? "bg-rose-50 text-rose-600" : 
            "bg-slate-50 text-slate-600"
          )}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">{title}</p>
        <p className="text-3xl font-extrabold mt-1.5 tracking-tight text-foreground">{value}</p>
        {description && <p className="text-[11px] text-muted-foreground/80 mt-2 font-medium">{description}</p>}
      </div>
    </motion.div>
  );
};
