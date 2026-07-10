import { motion } from "motion/react";

interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}

// Small draw-in trend line for a KPI card. Renders nothing but a flat dot
// when there's only one (or zero) real data points — never fabricates
// interpolated history to make the line look busier than the real data is.
export function Sparkline({ values, color = "#9810fa", width = 88, height = 32 }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2} stroke={color} strokeWidth={2} strokeOpacity={0.35} strokeLinecap="round" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - 4) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = 2 + i * step;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
}
