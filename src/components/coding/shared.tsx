import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Difficulty, IntegrityStatus } from "@/types/coding";

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const map: Record<Difficulty, string> = {
    Easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    Hard: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", map[difficulty])}>
      {difficulty}
    </Badge>
  );
}

const integrityMap: Record<IntegrityStatus, string> = {
  Safe: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Warning: "bg-amber-50 text-amber-700 border-amber-200",
  "High Risk": "bg-orange-50 text-orange-700 border-orange-200",
  "Review Required": "bg-rose-50 text-rose-700 border-rose-200",
};

export function IntegrityBadge({
  score,
  status,
  className,
}: {
  score: number;
  status: IntegrityStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-semibold gap-1", integrityMap[status], className)}>
      <span className="tabular-nums">{score}</span>
      <span className="opacity-70">· {status}</span>
    </Badge>
  );
}

export function integrityColor(score: number) {
  if (score >= 85) return "#059669";
  if (score >= 65) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#e11d48";
}
