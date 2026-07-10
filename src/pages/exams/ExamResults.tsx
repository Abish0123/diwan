import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams, updateExam } from "@/lib/examStore";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart3, Send, Users, Award, TrendingUp,
  CheckCircle2, XCircle, Search, Filter, Download,
} from "lucide-react";

const LS_MARKS_KEY = "sd_exam_marks";
function loadMarks(): Record<string, Record<string, Record<string, number>>> {
  try { return JSON.parse(localStorage.getItem(LS_MARKS_KEY) || "{}"); } catch { return {}; }
}

const LETTER_GRADE = (pct: number) =>
  pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B"
    : pct >= 50 ? "C" : pct >= 40 ? "D" : "F";

const GRADE_COLOR: Record<string, string> = {
  "A+": "bg-emerald-100 text-emerald-700",
  "A":  "bg-emerald-100 text-emerald-600",
  "B+": "bg-blue-100 text-blue-700",
  "B":  "bg-blue-100 text-purple-600",
  "C":  "bg-amber-100 text-amber-700",
  "D":  "bg-orange-100 text-orange-700",
  "F":  "bg-rose-100 text-rose-700",
};

// Real Exam Results UI, extracted for embedding as a step inside the
// consolidated Exam Setup wizard — see RoomAllocation.tsx for the same pattern.
export function ExamResultsContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const selectedId = examId;
  const setSelectedId = onExamIdChange;
  const [students, setStudents] = useState<{ uid: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [publishing, setPublishing] = useState(false);

  const allMarks = loadMarks();
  const selected = exams.find(e => e.id === selectedId);
  const completedExams = exams.filter(e => e.status === "Completed" || e.status === "Published");

  useEffect(() => {
    if (!selected) return;
    smartDb.getAll("Student", "").then((all: any[]) => {
      const grade = selected.grade;
      const section = selected.section === "All Sections" ? "" : selected.section;
      const f = (all || []).filter((s: any) => {
        const g = (s.grade || s.gradeLevel || "").toLowerCase().replace("grade ", "").trim();
        const wantG = grade.toLowerCase().replace("grade ", "").trim();
        if (g !== wantG) return false;
        if (section && (s.section || "").toUpperCase() !== section.toUpperCase()) return false;
        return true;
      });
      setStudents(f.map((s: any) => ({ uid: s.id || s.uid || s.studentId || "", name: s.name || s.displayName || "Student" })));
    }).catch(() => setStudents([]));
  }, [selectedId, selected?.grade, selected?.section]);

  const subjectSlots = selected?.slots || [];
  const subjectNames = subjectSlots.map(s => s.subject);

  const studentResults = useMemo(() => {
    if (!selectedId || subjectNames.length === 0) return [];
    const examMarks = allMarks[selectedId] || {};
    return students.map((s, idx) => {
      const subjectMarks = subjectNames.map(sub => ({
        subject: sub,
        marks: examMarks[sub]?.[s.uid] ?? null,
      }));
      const scored = subjectMarks.filter(m => m.marks !== null);
      const total = scored.reduce((acc, m) => acc + (m.marks || 0), 0);
      const maxTotal = scored.length * 100;
      const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
      const lg = scored.length > 0 ? LETTER_GRADE(pct) : "–";
      const pass = pct >= 40;
      return { ...s, rollNo: idx + 1, subjectMarks, total, maxTotal, pct, lg, pass, scored };
    }).sort((a, b) => b.pct - a.pct).map((s, i) => ({ ...s, rank: i + 1 }));
  }, [students, allMarks, selectedId, subjectNames.join(",")]);

  const filtered = studentResults.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const passed = studentResults.filter(s => s.pass && s.scored.length > 0).length;
  const appeared = studentResults.filter(s => s.scored.length > 0).length;
  const passRate = appeared > 0 ? Math.round((passed / appeared) * 100) : 0;
  const topScore = appeared > 0 ? Math.max(...studentResults.filter(s => s.scored.length > 0).map(s => s.pct)) : 0;

  async function handlePublish() {
    if (!selectedId) return;
    setPublishing(true);
    await new Promise(r => setTimeout(r, 800));
    updateExam(selectedId, { status: "Published", published: true });
    setPublishing(false);
    toast.success("Results published successfully");
  }

  return (
      <div className="min-h-screen bg-[#F8F7FF]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#7C3AED]" />
              Exam Results
            </h1>
            {selected && selected.status !== "Published" && appeared > 0 && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {publishing ? "Publishing…" : "Publish Results"}
              </button>
            )}
            {selected?.status === "Published" && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="h-3.5 w-3.5" /> Published
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Exam selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">Select Exam</label>
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setSearch(""); }}
              className="w-full max-w-md h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white"
            >
              <option value="">— Choose an exam —</option>
              {completedExams.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.grade} · {e.section}
                  {e.status === "Published" ? " ✓" : ""}
                </option>
              ))}
            </select>
            {exams.filter(e => e.status === "Scheduled" || e.status === "Ongoing").length > 0 && completedExams.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">No completed exams yet. Enter marks first in Marks Entry.</p>
            )}
          </div>

          {selected && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Students", value: students.length, icon: Users, color: "text-[#7C3AED]", bg: "bg-violet-50" },
                  { label: "Appeared", value: appeared, icon: CheckCircle2, color: "text-purple-600", bg: "bg-blue-50" },
                  { label: "Pass Rate", value: `${passRate}%`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Top Score", value: `${topScore}%`, icon: Award, color: "text-amber-600", bg: "bg-amber-50" },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", card.bg)}>
                      <card.icon className={cn("h-5 w-5", card.color)} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-medium">{card.label}</p>
                      <p className="text-xl font-black text-slate-900">{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Results table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900">{selected.name} · Results</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search student…"
                        className="pl-8 pr-3 h-8 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-[#7C3AED] w-44"
                      />
                    </div>
                    <button className="flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50">
                      <Download className="h-3.5 w-3.5" /> Export
                    </button>
                  </div>
                </div>

                {appeared === 0 ? (
                  <div className="py-14 text-center">
                    <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm font-medium">No marks entered yet</p>
                    <p className="text-slate-300 text-xs mt-1">Go to Marks Entry to add student marks</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Rank</th>
                          <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Student</th>
                          {subjectNames.map(sub => (
                            <th key={sub} className="text-center px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                              {sub.length > 6 ? sub.slice(0, 6) + "…" : sub}
                            </th>
                          ))}
                          <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">%</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Grade</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s, i) => (
                          <tr key={s.uid} className={cn("border-b border-slate-50", i % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                            <td className="px-4 py-3 text-slate-400 text-[12px] font-bold">#{s.rank}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                            {s.subjectMarks.map(sm => (
                              <td key={sm.subject} className="px-3 py-3 text-center text-[13px]">
                                {sm.marks !== null ? sm.marks : <span className="text-slate-300">–</span>}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-center font-bold text-slate-900">
                              {s.scored.length > 0 ? `${s.total}/${s.maxTotal}` : "–"}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-[#7C3AED]">
                              {s.scored.length > 0 ? `${s.pct}%` : "–"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-[12px] font-bold px-2 py-0.5 rounded-lg", GRADE_COLOR[s.lg] || "bg-slate-100 text-slate-400")}>
                                {s.lg}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.scored.length > 0 ? (
                                s.pass
                                  ? <span className="flex items-center justify-center gap-1 text-emerald-600 text-[12px] font-semibold"><CheckCircle2 className="h-3.5 w-3.5" />Pass</span>
                                  : <span className="flex items-center justify-center gap-1 text-rose-600 text-[12px] font-semibold"><XCircle className="h-3.5 w-3.5" />Fail</span>
                              ) : <span className="text-slate-300 text-[12px]">–</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {!selected && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-[#7C3AED]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Select an Exam</h3>
              <p className="text-sm text-slate-500">Choose a completed exam to view results</p>
            </div>
          )}
        </div>
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/results route (and anyone
// importing this file directly) still works exactly as before.
export default function ExamResults() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <ExamResultsContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
