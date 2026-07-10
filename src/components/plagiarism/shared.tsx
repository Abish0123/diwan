import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RiskLevel, ReportStatus } from "@/types/plagiarism";

export function riskColor(risk: RiskLevel) {
  return {
    Low: "#059669", Moderate: "#d97706", High: "#ea580c", Critical: "#e11d48",
  }[risk];
}

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  const map: Record<RiskLevel, string> = {
    Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Moderate: "bg-amber-50 text-amber-700 border-amber-200",
    High: "bg-orange-50 text-orange-700 border-orange-200",
    Critical: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return <Badge variant="outline" className={cn("font-semibold", map[risk], className)}>{risk} Risk</Badge>;
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, string> = {
    Draft: "bg-slate-50 text-slate-600 border-slate-200",
    Submitted: "bg-sky-50 text-sky-700 border-sky-200",
    "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
    Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Rejected: "bg-rose-50 text-rose-700 border-rose-200",
    "Revision Requested": "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <Badge variant="outline" className={cn("font-medium", map[status])}>{status}</Badge>;
}

export function ScoreRing({
  value, label, color, size = 120,
}: {
  value: number; label: string; color: string; size?: number;
}) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}%</div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}
