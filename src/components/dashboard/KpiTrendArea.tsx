import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface KpiTrendAreaProps {
  values: number[];
  color: string;
  height?: number;
}

// Full-width gradient-filled trend strip for a KPI card. With fewer than 2
// real data points there's no real trend to draw, so it renders a flat real-
// value line instead of fabricating a shape.
export function KpiTrendArea({ values, color, height = 56 }: KpiTrendAreaProps) {
  const series = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const data = series.map((v, i) => ({ i, v }));
  const lastIndex = data.length - 1;
  const gradientId = `kpi-trend-${color.replace("#", "")}`;

  // Emphasize the most recent real point — a small pulsing dot, the same
  // "give sparklines an emphasized endpoint" treatment as the rest of the
  // dashboard's charts. Recharts calls this once per data point; only the
  // last one gets a marker.
  const renderEndpointDot = (props: any) => {
    const { cx, cy, index } = props;
    if (index !== lastIndex || cx == null || cy == null) return <g key={`dot-${index}`} />;
    return (
      <g key={`dot-${index}`}>
        <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.18}>
          <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.28;0.05;0.28" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />
      </g>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
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
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            dot={renderEndpointDot}
            activeDot={false}
            isAnimationActive
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
