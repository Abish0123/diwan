import { useState } from "react";
import { SentenceMatch, bandForScore } from "@/types/plagiarism";
import { cn } from "@/lib/utils";

const BAND_BG: Record<string, string> = {
  green: "bg-transparent",
  yellow: "bg-yellow-200 hover:bg-yellow-300",
  orange: "bg-orange-300 hover:bg-orange-400",
  red: "bg-rose-300 hover:bg-rose-400",
};

/**
 * Turnitin-style highlighted document viewer. Each sentence is tinted by its
 * similarity band; clicking a highlighted sentence reveals its matched source.
 */
export function HighlightedViewer({
  sentences, suspiciousAi = [],
}: {
  sentences: SentenceMatch[];
  suspiciousAi?: number[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const aiSet = new Set(suspiciousAi);

  // counts per band so the user immediately sees how much was flagged
  const counts = { red: 0, orange: 0, yellow: 0, green: 0 };
  sentences.forEach((s) => { counts[bandForScore(s.score).band]++; });

  return (
    <div className="space-y-3">
      {/* summary chips — clearly indicate Minor / Moderate / High counts */}
      <div className="flex flex-wrap gap-2">
        <CountChip className="bg-rose-100 text-rose-700 border-rose-200" n={counts.red} label="High" />
        <CountChip className="bg-orange-100 text-orange-700 border-orange-200" n={counts.orange} label="Moderate" />
        <CountChip className="bg-yellow-100 text-yellow-700 border-yellow-300" n={counts.yellow} label="Minor" />
        <CountChip className="bg-emerald-50 text-emerald-700 border-emerald-200" n={counts.green} label="Original" />
        <CountChip className="bg-violet-100 text-violet-700 border-violet-200" n={aiSet.size} label="AI-suspected" />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <Legend swatch="bg-white border border-slate-300" label="Original" />
        <Legend swatch="bg-yellow-200 border border-yellow-300" label="Minor" />
        <Legend swatch="bg-orange-300 border border-orange-400" label="Moderate" />
        <Legend swatch="bg-rose-300 border border-rose-400" label="High" />
        <Legend swatch="bg-white border-b-2 border-violet-500" label="AI-suspected (underline)" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 max-h-[460px] overflow-y-auto leading-7 text-[15px] text-slate-800">
        {sentences.map((s) => {
          const { band, label } = bandForScore(s.score);
          const isAi = aiSet.has(s.index);
          const clickable = band !== "green" && s.sourceLabel;
          return (
            <span key={s.index} className="relative">
              <span
                onClick={() => clickable && setOpen(open === s.index ? null : s.index)}
                className={cn(
                  "rounded px-0.5 transition-colors",
                  BAND_BG[band],
                  clickable && "cursor-pointer",
                  isAi && "underline decoration-violet-400 decoration-2 underline-offset-2"
                )}
                title={band !== "green" ? `${label} · ${Math.round(s.score * 100)}%` : undefined}
              >
                {s.text}{" "}
              </span>
              {open === s.index && s.sourceLabel && (
                <span className="block my-1 rounded-md bg-slate-900 text-white text-xs px-3 py-2">
                  <span className="font-semibold">Matched source:</span> {s.sourceLabel}
                  <span className="ml-2 text-slate-300">({Math.round(s.score * 100)}% match)</span>
                </span>
              )}
            </span>
          );
        })}
        {sentences.length === 0 && <span className="text-slate-400">No analyzable text.</span>}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-4 rounded", swatch)} /> {label}
    </span>
  );
}

function CountChip({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", className)}>
      <span className="font-bold tabular-nums">{n}</span> {label}
    </span>
  );
}
