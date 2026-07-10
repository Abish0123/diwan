import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeStudentGradebook,
  type GradebookSources, type StudentGradebook,
} from "@/lib/gradebookEngine";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TrendingUp, AlertTriangle, Download, Info, BarChart3, Users2 } from "lucide-react";

function gradeColor(g: string) {
  if (g.startsWith("A")) return "bg-emerald-50 text-emerald-700";
  if (g.startsWith("B")) return "bg-blue-50 text-blue-700";
  if (g.startsWith("C")) return "bg-amber-50 text-amber-700";
  if (g === "—") return "bg-slate-100 text-slate-400";
  return "bg-rose-50 text-rose-700";
}

export default function ParentGradebook() {
  const { selected, loading: childrenLoading } = useParentChildren();
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);

  useEffect(() => {
    loadGradebookSources().then(setSources).catch(() => setSources(null));
  }, []);

  const band = useMemo(
    () => getBandForGrade(curriculum, selected?.grade || ""),
    [curriculum, selected?.grade]
  );

  const columns = useMemo(() => {
    const cats = band?.categories ?? [
      { name: "Assignments", marks: 20 },
      { name: "Assessments", marks: 20 },
      { name: "Mid-Term Exam", marks: 20 },
      { name: "Final Exam", marks: 40 },
    ];
    return cats.map(c => ({ name: c.name, weight: c.marks }));
  }, [band]);

  // Auto-computed from the child's real Assignment + Assessment + Exam marks.
  const gb: StudentGradebook | null = useMemo(() => {
    if (!sources || !selected) return null;
    return computeStudentGradebook(
      { id: String((selected as any).studentId ?? selected.id), name: selected.name, grade: selected.grade || "", section: selected.section || "" },
      band, sources
    );
  }, [sources, selected, band]);

  const graded = gb?.subjects.filter(s => s.hasData) ?? [];
  const avgPct = gb ? Math.round(gb.overallPercentage) : 0;
  const topSubject = graded.length ? graded.reduce((a, s) => (s.percentage > a.percentage ? s : a), graded[0]) : null;
  const lowSubject = graded.length ? graded.reduce((a, s) => (s.percentage < a.percentage ? s : a), graded[0]) : null;

  if (childrenLoading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Gradebook</h1>
              <p className="text-sm text-slate-400">{selected.name} — {curriculum.shortName} · Auto-calculated</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChildSwitcher className="w-56" />
            <button onClick={() => toast.info("Downloading grade report…")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Average %", value: graded.length ? `${avgPct}%` : "—", color: "text-purple-600 bg-violet-50" },
            { label: "Subjects Graded", value: graded.length, color: "text-purple-600 bg-blue-50" },
            { label: "Strongest", value: topSubject?.subject.split(" ")[0] || "—", color: "text-emerald-600 bg-emerald-50" },
            { label: "Needs Attention", value: lowSubject?.subject.split(" ")[0] || "—", color: "text-amber-600 bg-amber-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Marks are auto-pulled and weighted from {selected.name}'s Assignments, Assessments and Exams — the same figures the teacher records. Nothing is entered here directly.
        </div>

        {/* Marks table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">Subject-wise Marks</h3>
          </div>

          {graded.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <BarChart3 className="w-12 h-12 mb-3 opacity-25" />
              <p className="font-bold text-slate-700">No marks recorded yet</p>
              <p className="text-sm mt-1 max-w-md">
                Once teachers grade {selected.name}'s assignments, assessments or exams, the calculated grades will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Subject</th>
                    {columns.map(c => (
                      <th key={c.name} className="px-4 py-3 text-center">{c.name}<br /><span className="font-normal normal-case text-slate-400">({c.weight})</span></th>
                    ))}
                    <th className="px-4 py-3 text-center">Total %</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {graded.map(s => {
                    const pct = Math.round(s.percentage);
                    return (
                      <tr key={s.subject} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.subject}</td>
                        {s.components.map((c, ci) => (
                          <td key={ci} className="px-4 py-3 text-center font-mono text-slate-700">
                            {c.hasData
                              ? `${Math.round((c.obtainedPct / 100) * c.weight * 10) / 10}/${c.weight}`
                              : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 min-w-[40px]">
                              <div className={cn("h-full rounded-full", pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-black", gradeColor(s.letter))}>{s.letter}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
