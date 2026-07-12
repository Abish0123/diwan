import { useState } from "react";
import { motion } from "motion/react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Sector, Customized } from "recharts";
import { UserCheck, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AttendanceBreakdown } from "@/hooks/useDashboardOverview";
import { CountUpNumber } from "./CountUpNumber";
import { useSweepProgress } from "@/hooks/useSweepProgress";

interface Props {
  data: AttendanceBreakdown;
  loading?: boolean;
}

const COLORS = { Present: "#10b981", Absent: "#f43f5e", Late: "#f59e0b" };
const DRAW_DURATION_MS = 900;
const INNER_R = 55;
const OUTER_R = 75;

function renderActiveShape(props: unknown) {
  const p = props as { outerRadius: number };
  return <Sector {...(props as object)} outerRadius={p.outerRadius + 7} />;
}

export function AttendanceOverviewCard({ data, loading }: Props) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const slices = [
    { name: "Present", value: data.present, color: COLORS.Present },
    { name: "Absent", value: data.absent, color: COLORS.Absent },
    { name: "Late", value: data.late, color: COLORS.Late },
  ].filter((s) => s.value > 0);

  const ready = !loading && data.total > 0;
  const sweep = useSweepProgress(DRAW_DURATION_MS, ready);
  const drawComplete = sweep >= 0.999;
  const isFull = drawComplete && data.presentPct >= 100;

  // Recharts sweeps clockwise from startAngle=90 (top) as endAngle decreases
  // — same convention the Pie itself uses, so this endpoint lands exactly on
  // the drawn arc's tip instead of an approximated position.
  const presentSlice = slices.find((s) => s.name === "Present");
  const presentFraction = data.total > 0 && presentSlice ? presentSlice.value / data.total : 0;
  const endAngleDeg = 90 - presentFraction * 360 * sweep;
  const endAngleRad = (endAngleDeg * Math.PI) / 180;
  const dotRadius = (INNER_R + OUTER_R) / 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Attendance Overview</h3>
          <UserCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/attendance")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          Today <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center">
          <div className="h-[150px] w-[150px] rounded-full bg-muted/40 animate-pulse" />
        </div>
      ) : data.total === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No attendance marked yet today.
        </div>
      ) : (
        <>
          <div className="h-[180px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  cx="50%"
                  cy="50%"
                  innerRadius={INNER_R}
                  outerRadius={OUTER_R}
                  paddingAngle={4}
                  dataKey="value"
                  isAnimationActive={false}
                  startAngle={90}
                  endAngle={90 - sweep * 360}
                  activeIndex={activeIndex ?? undefined}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, i) => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {slices.map((s, i) => (
                    <Cell
                      key={i}
                      fill={s.color}
                      stroke="none"
                      style={{
                        cursor: "pointer",
                        transition: "filter 200ms ease",
                        filter: activeIndex === i ? `drop-shadow(0 3px 6px ${s.color}99)` : "none",
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontSize: "12px" }} />

                {/* Endpoint dot — pops in at the exact tip of the Present arc
                    once its sweep finishes. Customized gives us the chart's
                    real pixel width/height, so this lands in the same SVG
                    coordinate space Pie itself uses (cx/cy="50%" == width/2,
                    height/2), instead of an HTML-overlay percentage guess. */}
                {drawComplete && presentFraction > 0 && (
                  <Customized
                    component={(props: { width?: number; height?: number }) => {
                      const w = props.width;
                      const h = props.height;
                      if (!w || !h) return null;
                      const cx = w / 2;
                      const cy = h / 2;
                      const dotX = cx + dotRadius * Math.cos(endAngleRad);
                      const dotY = cy - dotRadius * Math.sin(endAngleRad);
                      return (
                        <circle
                          cx={dotX}
                          cy={dotY}
                          r={5}
                          fill="white"
                          stroke={COLORS.Present}
                          strokeWidth={2.5}
                          style={{
                            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                            transformOrigin: `${dotX}px ${dotY}px`,
                            animation: "attendance-dot-pop 350ms ease-out",
                          }}
                        />
                      );
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span
                className={`text-2xl font-extrabold text-foreground leading-none transition-transform duration-300 ${isFull ? "scale-110" : ""}`}
              >
                <CountUpNumber value={data.presentPct} animateOnMount duration={DRAW_DURATION_MS} suffix="%" />
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Present</span>
              {isFull && (
                <span
                  className="absolute h-16 w-16 rounded-full border-2 border-emerald-400"
                  style={{ animation: "attendance-full-pulse 1.4s ease-out infinite" }}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 pt-3 border-t border-border">
            {slices.map((s, i) => (
              <div
                key={s.name}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 cursor-default"
                style={{ backgroundColor: activeIndex === i ? `${s.color}14` : "transparent" }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[11px] font-bold text-foreground">
                  {s.name}: <span className="text-muted-foreground font-medium">{s.value} ({data.total > 0 ? Math.round((s.value / data.total) * 100) : 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes attendance-dot-pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.4); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes attendance-full-pulse {
          0% { opacity: 0.6; transform: scale(0.9); }
          100% { opacity: 0; transform: scale(1.3); }
        }
      `}</style>
    </motion.div>
  );
}
