import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import {
  generateConflictFreeSchedule,
  getTimetableInsights,
  type SubjectAssignment,
  type ClassGrid,
} from "@/lib/aiTimetableGenerator";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Real AI-assisted timetable generation — see src/lib/aiTimetableGenerator.ts
// for why this is a hybrid (deterministic conflict-free scheduler + a real
// LLM review), not a pure "ask the AI for a grid" call. Generates directly
// from real subject_assignments records, and publishes to the same real
// `timetable_slots` entity every other timetable view already reads from.
export default function AITimetableGenerator() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  const [existingGridJson, setExistingGridJson] = useState<Record<string, ClassGrid>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ grids: Record<string, ClassGrid>; warnings: string[] } | null>(null);
  const [insights, setInsights] = useState<{ summary: string; generatedVia: string } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [subjAssignments, published] = await Promise.all([
          smartDb.getAll("subject_assignments", undefined) as Promise<SubjectAssignment[]>,
          fetch("/api/data/timetable_slots/published-timetable-v3").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        setAssignments(subjAssignments || []);
        if (published?.gridJson) {
          try { setExistingGridJson(JSON.parse(published.gridJson)); } catch { /* ignore */ }
        }
      } catch (error) {
        console.error("Failed to load subject assignments:", error);
        toast.error("Failed to load subject assignments");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Real distinct class list — derived from real subject_assignments, not invented.
  const availableClasses = useMemo(() => {
    const seen = new Map<string, { grade: string; section: string }>();
    assignments.forEach((a) => {
      if (!a.section) return;
      const key = `${a.grade}-${a.section}`;
      if (!seen.has(key)) seen.set(key, { grade: a.grade, section: a.section });
    });
    return Array.from(seen.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [assignments]);

  const toggleClass = (key: string) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelectedClasses(new Set(availableClasses.map(([key]) => key)));
  const clearAll = () => setSelectedClasses(new Set());

  // Existing published slots for classes NOT being regenerated still count as
  // real teacher commitments — the scheduler must not double-book a teacher
  // into a newly generated class at a period where they're already teaching
  // an untouched class.
  const buildExistingBusyMap = () => {
    const busy = new Map<string, Set<string>>();
    Object.entries(existingGridJson).forEach(([classKey, grid]) => {
      if (selectedClasses.has(classKey)) return; // being regenerated, its old commitments don't count
      grid.forEach((row, period) => row.forEach((cell, day) => {
        if (!cell) return;
        const key = `${day}-${period}`;
        const set = busy.get(key) || new Set<string>();
        set.add(cell.teacher);
        busy.set(key, set);
      }));
    });
    return busy;
  };

  const handleGenerate = async () => {
    if (selectedClasses.size === 0) {
      toast.error("Select at least one class to generate a timetable for");
      return;
    }
    setGenerating(true);
    setResult(null);
    setInsights(null);
    try {
      const classes = availableClasses
        .filter(([key]) => selectedClasses.has(key))
        .map(([, c]) => c);
      const busy = buildExistingBusyMap();
      const generated = generateConflictFreeSchedule(classes, assignments, busy);
      setResult(generated);
      if (generated.warnings.length) {
        generated.warnings.forEach((w) => toast.warning(w, { duration: 6000 }));
      } else {
        toast.success(`Generated a conflict-free timetable for ${classes.length} class(es)`);
      }

      setInsightsLoading(true);
      getTimetableInsights(generated.grids, generated.warnings)
        .then(setInsights)
        .finally(() => setInsightsLoading(false));
    } catch (error) {
      console.error("Timetable generation failed:", error);
      toast.error("Failed to generate timetable");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!result) return;
    setPublishing(true);
    try {
      const merged = { ...existingGridJson, ...result.grids };
      await fetch("/api/data/timetable_slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "published-timetable-v3",
          gridJson: JSON.stringify(merged),
          publishedAt: new Date().toISOString(),
          uid: user?.uid || "admin",
        }),
      });
      setExistingGridJson(merged);
      toast.success(`Published — live on every class/teacher/student timetable view.`);
    } catch (error) {
      console.error("Failed to publish generated timetable:", error);
      toast.error("Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Wand2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AI Timetable Generator</h1>
            <p className="text-sm text-slate-400">Generates a conflict-free weekly timetable from real subject/teacher assignments, reviewed by AI</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Select Classes</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAll}>Select All</Button>
                <Button size="sm" variant="outline" onClick={clearAll}>Clear</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading real subject assignments…</p>
            ) : availableClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No subject-teacher assignments found yet — assign subjects to teachers in Academics → Subjects first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableClasses.map(([key, c]) => (
                  <button
                    key={key}
                    onClick={() => toggleClass(key)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      selectedClasses.has(key)
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {c.grade} - {c.section}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button onClick={handleGenerate} disabled={generating || loading || selectedClasses.size === 0}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Timetable
              </Button>
              {result && (
                <Button variant="outline" onClick={handlePublish} disabled={publishing}>
                  {publishing ? "Publishing…" : "Publish Live"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {result.warnings.length === 0
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                Generated Schedule Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {result.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-violet-50 border border-violet-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-semibold text-violet-800">AI Review</span>
                  {insights && (
                    <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600">
                      {insights.generatedVia === "unavailable" ? "AI unavailable" : `via ${insights.generatedVia}`}
                    </Badge>
                  )}
                </div>
                {insightsLoading ? (
                  <p className="text-xs text-violet-500">Analyzing generated schedule…</p>
                ) : (
                  <p className="text-sm text-violet-700 whitespace-pre-wrap">{insights?.summary}</p>
                )}
              </div>

              {Object.entries(result.grids).map(([classKey, grid]) => (
                <div key={classKey} className="overflow-x-auto">
                  <p className="text-sm font-semibold text-slate-800 mb-2">{classKey}</p>
                  <table className="w-full text-xs border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border px-2 py-1.5 text-left">Period</th>
                        {DAY_LABELS.map((d) => <th key={d} className="border px-2 py-1.5">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.map((row, pIdx) => (
                        <tr key={pIdx}>
                          <td className="border px-2 py-1.5 font-medium">P{pIdx + 1}</td>
                          {row.map((cell, dIdx) => (
                            <td key={dIdx} className="border px-2 py-1.5">
                              {cell ? (
                                <div>
                                  <p className="font-semibold text-slate-800">{cell.subject}</p>
                                  <p className="text-[10px] text-slate-400">{cell.teacher}</p>
                                </div>
                              ) : <span className="text-slate-300">Free</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
