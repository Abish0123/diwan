import { useEffect, useRef, useState } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { CountUpNumber } from "./CountUpNumber";

interface StaticKpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendType?: "up" | "down" | "neutral";
  description?: string;
  className?: string;
  iconClassName?: string;
  trendSeries?: number[];
  accentColor?: string;
}

// Static-layout KPI card (no motion/framer-motion, no hover-lift/rotate —
// same plain div structure as /finance/statements) but with two content-level
// animations layered back in: a sparkline draw-in on the trend chart, and a
// CountUpNumber tween on the headline value.
//
// The sparkline reveal deliberately does NOT use Recharts' built-in
// isAnimationActive — that's driven by requestAnimationFrame (react-smooth),
// which browsers fully PAUSE (not just throttle) whenever the tab isn't the
// active/visible one, leaving the reveal frozen at 0 width indefinitely —
// the exact same class of bug CountUpNumber.tsx already documents and works
// around by using setTimeout instead of rAF. Same fix here: a CSS clip-path
// driven by a setTimeout tick loop, which still advances (just less often)
// on a backgrounded tab.
const SPARKLINE_DURATION_MS = 3000;
export const StaticKpiCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendType = "neutral",
  description,
  className,
  iconClassName,
  trendSeries,
  accentColor = "#9810fa",
}: StaticKpiCardProps) => {
  const base = trendSeries && trendSeries.length > 0 ? trendSeries : [typeof value === "number" ? value : 0];
  const series = base.length >= 2 ? base : [base[0] ?? 0, base[0] ?? 0];
  const data = series.map((v, i) => ({ i, v }));
  const gradientId = `static-kpi-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const isNumeric = typeof value === "number";

  // setTimeout-driven reveal percentage (0-100), not requestAnimationFrame —
  // see the comment above this component for why.
  const [revealPct, setRevealPct] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      const progress = Math.min(1, elapsed / SPARKLINE_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setRevealPct(eased * 100);
      if (progress < 1) timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={cn("bg-white border border-slate-100 rounded-xl p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", iconClassName || "bg-primary/10 text-primary")}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-xs text-slate-500 font-medium truncate">{title}</span>
        </div>
        {trend && (
          <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0", iconClassName || "bg-primary/10 text-primary")}>
            {trend}{trendType === "up" ? " ↑" : trendType === "down" ? " ↓" : ""}
          </span>
        )}
      </div>

      <div className="text-2xl font-bold text-slate-900 tabular-nums">
        {isNumeric ? <CountUpNumber value={value as number} animateOnMount duration={1200} /> : value}
      </div>
      {description && <p className="text-[11px] text-slate-400 mt-0.5 mb-2">{description}</p>}

      <div
        className="h-14 w-full mt-2"
        style={{ clipPath: `inset(0 ${100 - revealPct}% 0 0)` }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={accentColor}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
