import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface KpiTrendAreaProps {
  values: number[];
  color: string;
  height?: number;
}

// Full-width gradient-filled trend strip for a KPI card. With fewer than 2
// real data points there's no real trend to draw, so it renders a flat real-
// value line instead of fabricating a shape.
export function KpiTrendArea({ values, color, height = 48 }: KpiTrendAreaProps) {
  const series = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const data = series.map((v, i) => ({ i, v }));
  const gradientId = `kpi-trend-${color.replace("#", "")}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
