import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Trophy, Medal, TrendingDown, FileSpreadsheet, CheckCircle2,
  GraduationCap, Target, AlertTriangle, Sparkles, ChevronRight, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeClassGradebook, discoverSubjects,
  type GradebookSources, type GradebookStudent,
} from "@/lib/gradebookEngine";

// ── Theme tokens ────────────────────────────────────────────────────────────
const C = {
  primary: "#6C3BFF",
  secondary: "#8B5CF6",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
};

function letterGrade(pct: number) {
  if (pct >= 90) return { letter: "A+", band: "A+ (90-100%)", color: "text-emerald-700 bg-emerald-50 border-emerald-200", hex: "#10B981" };
  if (pct >= 80) return { letter: "A", band: "A (80-89%)", color: "text-emerald-700 bg-emerald-50 border-emerald-200", hex: "#34D399" };
  if (pct >= 70) return { letter: "B+", band: "B+ (70-79%)", color: "text-blue-700 bg-blue-50 border-blue-200", hex: "#3B82F6" };
  if (pct >= 60) return { letter: "B", band: "B (60-69%)", color: "text-indigo-700 bg-indigo-50 border-indigo-200", hex: "#6366F1" };
  if (pct >= 50) return { letter: "C", band: "C (50-59%)", color: "text-amber-700 bg-amber-50 border-amber-200", hex: "#F59E0B" };
  return { letter: "D", band: "D (<50%)", color: "text-red-700 bg-red-50 border-red-200", hex: "#EF4444" };
}

function cellColor(score: number) {
  if (score >= 85) return "text-emerald-600";
  if (score >= 50) return "text-slate-700";
  return "text-red-500";
}

interface GradebookProProps {
  classData: { name?: string; grade?: string; academicYear?: string; status?: string };
  // Real enrolled students. grade/section are optional — they fall back to the
  // class's own grade/section so the compute engine can match marks correctly.
  students: {
    id: string; name: string; rollNo?: string; rollNumber?: string; image?: string;
    grade?: string; section?: string; sectionName?: string;
  }[];
  subjects: string[];
  semesterName?: string | null;
  // Bubbles computed rows + subject columns up so the page header can export real data.
  onRowsChange?: (
    rows: { name: string; rollNo: string; scores: Record<string, number>; total: number; max: number; pct: number; grade: string }[],
    subjectCols: string[],
  ) => void;
}

interface Row {
  id: string;
  name: string;
  rollNo: string;
  image?: string;
  // per-subject percentage (0..100) — null means no real mark exists yet
  scores: Record<string, number | null>;
  gradedCount: number;
  total: number;
  max: number;
  pct: number;
  rank: number;
  hasData: boolean;
}

export default function GradebookPro({ classData, students, subjects, semesterName, onRowsChange }: GradebookProProps) {
  // ── Real compute sources: assignments + assessments + exams, weighted by the
  //    active curriculum's gradebook band. NO marks are entered here — this view
  //    is read-only, exactly like the teacher/student/parent gradebooks.
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  useEffect(() => {
    let alive = true;
    loadGradebookSources()
      .then(s => { if (alive) setSources(s); })
      .catch(() => { if (alive) setSources(null); })
      .finally(() => { if (alive) setLoadingSources(false); });
    return () => { alive = false; };
  }, []);

  const classGrade = classData.grade || "";
  const band = useMemo(() => getBandForGrade(curriculum, classGrade), [curriculum, classGrade]);

  // Section fallback parsed from the class name ("Grade 5 - B" → "B").
  const classSection = useMemo(() => {
    const name = classData.name || "";
    for (const prefix of [`${classGrade} - `, `${classGrade} `]) {
      if (classGrade && name.startsWith(prefix)) return name.slice(prefix.length).trim();
    }
    return "";
  }, [classData.name, classGrade]);

  // Roster: real enrolled students only — no demo names, ever. Keyed on the
  // students' CONTENT (not array identity) so parents that rebuild the array
  // every render don't retrigger compute + onRowsChange in a loop.
  const rosterKey = students.map((s, i) =>
    [s.id, s.name, s.grade || "", s.section || s.sectionName || "", s.rollNo || s.rollNumber || String(i + 1)].join("^")).join("|");
  const roster: (GradebookStudent & { rollNo: string; image?: string })[] = useMemo(() =>
    students.map((s, i) => ({
      id: String(s.id),
      name: s.name,
      grade: s.grade || classGrade,
      section: s.section || s.sectionName || classSection,
      rollNo: s.rollNo || s.rollNumber || String(i + 1),
      image: s.image,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey, classGrade, classSection]);

  // Subject columns: the class's real subjects; if none configured, whatever
  // subjects have real marks/activity for these students.
  const subjectsKey = subjects.filter(Boolean).join("|");
  const subjectList = useMemo(() => {
    const configured = Array.from(new Set(subjects.filter(Boolean)));
    if (configured.length > 0) return configured;
    if (!sources) return [];
    const set = new Set<string>();
    roster.forEach(st => discoverSubjects(st, sources).forEach(sub => set.add(sub)));
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectsKey, sources, roster]);

  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"marks" | "grades">("marks");

  // Compute every student × subject from the real engine (ranked by overall %).
  const rows: Row[] = useMemo(() => {
    if (!sources || roster.length === 0 || subjectList.length === 0) return [];
    const computed = computeClassGradebook(roster, band, sources, subjectList);
    const byId = new Map(roster.map(r => [String(r.id), r]));
    const out = computed.map(gb => {
      const stu = byId.get(gb.studentId)!;
      const scores: Record<string, number | null> = {};
      gb.subjects.forEach(sg => {
        scores[sg.subject] = sg.hasData ? Math.round(sg.percentage * 10) / 10 : null;
      });
      const gradedCount = gb.subjects.filter(sg => sg.hasData).length;
      const total = gb.subjects.reduce((a, sg) => a + (sg.hasData ? Math.round(sg.percentage * 10) / 10 : 0), 0);
      return {
        id: gb.studentId,
        name: gb.name,
        rollNo: stu?.rollNo || "",
        image: stu?.image,
        scores,
        gradedCount,
        total: Math.round(total * 10) / 10,
        max: gradedCount * 100,
        pct: gb.overallPercentage,
        rank: gb.rank,
        hasData: gradedCount > 0,
      };
    });
    // Stable roll-number ordering for the rendered table.
    out.sort((a, b) => {
      const aNum = parseInt(a.rollNo, 10);
      const bNum = parseInt(b.rollNo, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNo.localeCompare(b.rollNo);
    });
    return out;
  }, [sources, roster, band, subjectList]);

  const graded = useMemo(() => rows.filter(r => r.hasData), [rows]);

  // Bubble REAL computed rows (name/roll/scores/total/pct/grade) to the parent export.
  useEffect(() => {
    onRowsChange?.(
      rows.map(r => {
        const bubbledScores: Record<string, number> = {};
        subjectList.forEach(sub => {
          const v = r.scores[sub];
          if (v !== null && v !== undefined) bubbledScores[sub] = v;
        });
        return {
          name: r.name,
          rollNo: r.rollNo,
          scores: bubbledScores,
          total: r.total,
          max: r.max,
          pct: r.pct,
          grade: r.hasData ? letterGrade(r.pct).letter : "—",
        };
      }),
      subjectList,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subjectList.join("|")]);

  // KPIs — over students with at least one real mark.
  const kpi = useMemo(() => {
    if (graded.length === 0) return null;
    const sorted = [...graded].sort((a, b) => b.pct - a.pct);
    const avg = graded.reduce((a, r) => a + r.pct, 0) / graded.length;
    const above90 = graded.filter(r => r.pct >= 90).length;
    const below50 = graded.filter(r => r.pct < 50).length;
    const passed = graded.filter(r => r.pct >= 50).length;
    return {
      avg, high: sorted[0], low: sorted[sorted.length - 1], above90, below50,
      passPct: (passed / graded.length) * 100, passed, total: graded.length,
    };
  }, [graded]);

  // Subject averages — over students actually marked in that subject.
  const subjectAverages = useMemo(() =>
    subjectList.map(sub => {
      const vals = rows.map(r => r.scores[sub]).filter((v): v is number => v !== null && v !== undefined);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { subject: sub, avg, markedCount: vals.length };
    }), [rows, subjectList]);

  // Grade distribution — graded students only.
  const gradeDist = useMemo(() => {
    const bands = ["A+ (90-100%)", "A (80-89%)", "B+ (70-79%)", "B (60-69%)", "C (50-59%)", "D (<50%)"];
    const counts: Record<string, { count: number; hex: string }> = {};
    bands.forEach(b => (counts[b] = { count: 0, hex: "#94A3B8" }));
    graded.forEach(r => {
      const g = letterGrade(r.pct);
      counts[g.band].count++;
      counts[g.band].hex = g.hex;
    });
    return bands.map(b => ({ name: b, value: counts[b].count, hex: counts[b].hex }));
  }, [graded]);

  const passFailData = useMemo(() => subjectList.map(sub => ({
    subject: sub.length > 6 ? sub.slice(0, 5) + "…" : sub,
    pass: rows.filter(r => (r.scores[sub] ?? -1) >= 50).length,
    fail: rows.filter(r => r.scores[sub] !== null && r.scores[sub] !== undefined && (r.scores[sub] as number) < 50).length,
  })), [rows, subjectList]);

  const topPerformers = useMemo(() =>
    [...graded].sort((a, b) => b.pct - a.pct).slice(0, 5), [graded]);

  const visibleRows = rows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) || r.rollNo.includes(search.trim()));

  // Real CSV export of the computed gradebook.
  function handleExportExcel() {
    if (rows.length === 0) { toast.error("No gradebook data to export"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["Roll No", "Student", ...subjectList.map(s => `${s} (%)`), "Total", "Max", "Percentage", "Grade"];
    const lines = [cols.map(esc).join(",")];
    rows.forEach(r => lines.push([
      r.rollNo, r.name,
      ...subjectList.map(s => (r.scores[s] === null || r.scores[s] === undefined ? "" : r.scores[s])),
      r.hasData ? r.total : "", r.hasData ? r.max : "",
      r.hasData ? `${r.pct.toFixed(1)}%` : "", r.hasData ? letterGrade(r.pct).letter : "—",
    ].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(classData.name || "class").replace(/\s+/g, "-")}-gradebook.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported gradebook for ${rows.length} students`);
  }

  const subTabs = ["overview", "subject", "grade"];
  const subTabLabels: Record<string, string> = {
    overview: "Marks Overview", subject: "Subject Wise", grade: "Grade Analysis",
  };

  const initials = (n: string) => n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  if (loadingSources) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white py-24 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-slate-300 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Computing gradebook from assignments, assessments &amp; exams…</p>
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-24 text-center">
        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-white shadow-sm flex items-center justify-center">
          <GraduationCap className="w-10 h-10 text-slate-300" />
        </div>
        <p className="text-lg font-bold text-slate-700">No Students Enrolled</p>
        <p className="text-sm text-slate-400 mt-1">Enroll students to see their computed gradebook.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-24 text-center">
        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-white shadow-sm flex items-center justify-center">
          <GraduationCap className="w-10 h-10 text-slate-300" />
        </div>
        <p className="text-lg font-bold text-slate-700">No Marks Available Yet</p>
        <p className="text-sm text-slate-400 mt-1">
          Marks are auto-pulled from Assignments, Assessments &amp; Exams — grade some work to see the gradebook.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Class Average", value: kpi ? `${kpi.avg.toFixed(1)}%` : "—", sub: kpi ? `${kpi.total} of ${rows.length} students graded` : "No marks yet", icon: Target, hex: C.primary, good: true },
          { label: "Highest Score", value: kpi ? `${kpi.high.pct.toFixed(1)}%` : "—", sub: kpi?.high.name || "—", icon: Trophy, hex: C.success, good: true },
          { label: "Lowest Score", value: kpi ? `${kpi.low.pct.toFixed(1)}%` : "—", sub: kpi?.low.name || "—", icon: TrendingDown, hex: C.warning },
          { label: "Above 90%", value: kpi ? kpi.above90 : "—", sub: kpi ? `${((kpi.above90 / kpi.total) * 100).toFixed(0)}% of graded` : "—", icon: Sparkles, hex: C.secondary, good: true },
          { label: "Below 50%", value: kpi ? kpi.below50 : "—", sub: kpi ? `${((kpi.below50 / kpi.total) * 100).toFixed(0)}% of graded` : "—", icon: AlertTriangle, hex: C.error },
          { label: "Pass Percentage", value: kpi ? `${kpi.passPct.toFixed(1)}%` : "—", sub: kpi ? `${kpi.passed} of ${kpi.total}` : "—", icon: CheckCircle2, hex: C.success, good: true },
        ].map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm hover:shadow-md transition-shadow rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${k.hex}15` }}>
                  <k.icon className="w-4.5 h-4.5" style={{ color: k.hex, width: 18, height: 18 }} />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5 leading-none">{k.value}</p>
              <p className={cn("text-[11px] font-medium mt-1.5 truncate", k.good ? "text-emerald-600" : "text-slate-400")}>{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Sub Tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {subTabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn("relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
              activeTab === t ? "text-slate-900" : "text-slate-400 hover:text-slate-600")}>
            {subTabLabels[t]}
            {activeTab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: C.primary }} />}
          </button>
        ))}
      </div>

      {/* ── Main grid: table + sidebar ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* LEFT */}
        <div className="space-y-4 min-w-0">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value="t1"><SelectTrigger className="w-[150px] rounded-xl border-slate-200 h-10"><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent><SelectItem value="t1">{semesterName || "Current Term"}</SelectItem></SelectContent>
            </Select>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-[150px] rounded-xl border-slate-200 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjectList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search by student name or roll no…" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 rounded-xl border-slate-200 h-10" />
            </div>
            <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-white">
              {(["marks", "grades"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors",
                    viewMode === m ? "text-white" : "text-slate-500")}
                  style={viewMode === m ? { background: C.primary } : undefined}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Table — marks overview */}
          {activeTab === "overview" && (
            <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-12">Rank</th>
                      <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 sticky left-0 bg-slate-50 min-w-[190px]">Student</th>
                      {subjectFilter === "all"
                        ? subjectList.map(s => (
                          <th key={s} className="text-center px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 min-w-[64px]">
                            <div className="truncate max-w-[64px] mx-auto" title={s}>{s}</div>
                            <div className="text-[9px] text-slate-300 font-bold">%</div>
                          </th>))
                        : (<th className="text-center px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">{subjectFilter}<div className="text-[9px] text-slate-300">%</div></th>)}
                      <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 min-w-[70px]">Total</th>
                      <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 min-w-[80px]">Percentage</th>
                      <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 min-w-[60px]">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r, idx) => {
                      const g = r.hasData ? letterGrade(r.pct) : null;
                      const shownSubjects = subjectFilter === "all" ? subjectList : [subjectFilter];
                      return (
                        <tr key={r.id} className={cn("border-b border-slate-50 transition-colors hover:bg-violet-50/40", idx % 2 ? "bg-slate-50/30" : "bg-white")}>
                          <td className="px-3 py-2.5 text-center">
                            {r.hasData && r.rank <= 3
                              ? <span className="inline-flex items-center justify-center"><Medal className="w-4 h-4" style={{ color: r.rank === 1 ? "#F59E0B" : r.rank === 2 ? "#94A3B8" : "#D97706" }} /></span>
                              : <span className="text-xs font-bold text-slate-400">{r.hasData ? r.rank : "—"}</span>}
                          </td>
                          <td className={cn("px-3 py-2.5 sticky left-0", idx % 2 ? "bg-slate-50/60" : "bg-white")}>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="w-8 h-8 border border-slate-100">
                                {r.image && <AvatarImage src={r.image} />}
                                <AvatarFallback className="text-[10px] font-bold text-white" style={{ background: C.secondary }}>{initials(r.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 text-xs truncate max-w-[130px]">{r.name}</p>
                                <p className="text-[10px] text-slate-400">Roll {r.rollNo}</p>
                              </div>
                            </div>
                          </td>
                          {shownSubjects.map(sub => {
                            const sc = r.scores[sub];
                            const marked = sc !== null && sc !== undefined;
                            return (
                              <td key={sub} className="px-2 py-2 text-center">
                                {!marked ? (
                                  <span className="text-xs font-bold text-slate-300" title="Not marked yet">—</span>
                                ) : viewMode === "grades" ? (
                                  <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded border", letterGrade(sc).color)}>{letterGrade(sc).letter}</span>
                                ) : (
                                  <span className={cn("text-xs font-bold", cellColor(sc))}>{sc}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center"><span className="text-xs font-black text-slate-700">{r.hasData ? `${r.total}/${r.max}` : "—"}</span></td>
                          <td className="px-3 py-2.5 text-center">{r.hasData ? <span className="text-sm font-black" style={{ color: g!.hex }}>{r.pct.toFixed(1)}%</span> : <span className="text-sm font-black text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{r.hasData ? <span className={cn("text-xs font-black px-2 py-1 rounded-full border", g!.color)}>{g!.letter}</span> : <span className="text-xs font-black px-2 py-1 rounded-full border text-slate-400 bg-slate-50 border-slate-200">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                <span className="text-xs text-slate-400 font-medium">Showing {visibleRows.length} of {rows.length} students</span>
                <span className="text-xs text-slate-400 font-medium">Auto-calculated from Assignments, Assessments &amp; Exams · read-only</span>
              </div>
            </Card>
          )}

          {/* Subject Wise */}
          {activeTab === "subject" && (
            <Card className="border border-slate-100 shadow-sm rounded-2xl">
              <CardContent className="p-5">
                <p className="font-bold text-slate-900 mb-4">Subject-wise Class Averages</p>
                <div className="space-y-4">
                  {subjectAverages.map(s => {
                    const g = letterGrade(s.avg);
                    return (
                      <div key={s.subject}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-slate-700">{s.subject}
                            <span className="text-[11px] text-slate-400 font-medium ml-2">{s.markedCount} of {rows.length} marked</span>
                          </span>
                          <span className="text-sm font-black" style={{ color: s.markedCount ? g.hex : "#94A3B8" }}>{s.markedCount ? `${s.avg.toFixed(1)}%` : "—"}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${s.avg}%`, background: g.hex }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grade Analysis */}
          {activeTab === "grade" && (
            <Card className="border border-slate-100 shadow-sm rounded-2xl">
              <CardContent className="p-5">
                <p className="font-bold text-slate-900 mb-1">Pass / Fail by Subject</p>
                <p className="text-xs text-slate-400 mb-4">Students passing (≥50%) vs failing per subject — unmarked students excluded</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={passFailData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="subject" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="pass" stackId="a" fill={C.success} radius={[0, 0, 0, 0]} name="Pass" />
                      <Bar dataKey="fail" stackId="a" fill={C.error} radius={[4, 4, 0, 0]} name="Fail" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-4">
          {/* Subject Performance */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900 text-sm">Subject Performance</p>
                <button className="text-[11px] font-semibold" style={{ color: C.primary }} onClick={() => setActiveTab("subject")}>View All</button>
              </div>
              <div className="space-y-3">
                {subjectAverages.slice(0, 7).map(s => {
                  const g = letterGrade(s.avg);
                  return (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-600">{s.subject}</span>
                        <span className="text-xs font-bold text-slate-700">{s.markedCount ? `${s.avg.toFixed(1)}%` : "—"}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.avg}%`, background: g.hex }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Grade Distribution */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-slate-900 text-sm">Grade Distribution</p>
                <button className="text-[11px] font-semibold" style={{ color: C.primary }} onClick={() => setActiveTab("grade")}>View Details</button>
              </div>
              {graded.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No graded students yet</p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={gradeDist.filter(d => d.value > 0)} dataKey="value" innerRadius={34} outerRadius={52} paddingAngle={2} stroke="none">
                          {gradeDist.filter(d => d.value > 0).map((d, i) => <Cell key={i} fill={d.hex} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-black text-slate-900 leading-none">{graded.length}</span>
                      <span className="text-[9px] text-slate-400 font-semibold">Graded</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {gradeDist.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-2 h-2 rounded-full" style={{ background: d.hex }} />
                          {d.name}
                        </span>
                        <span className="font-bold text-slate-700">{d.value} ({graded.length ? ((d.value / graded.length) * 100).toFixed(0) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Performers */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <p className="font-bold text-slate-900 text-sm mb-3">Top Performers</p>
              {topPerformers.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No graded students yet</p>
              ) : (
                <div className="space-y-2.5">
                  {topPerformers.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2.5">
                      <span className={cn("w-5 text-center text-xs font-black", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-slate-300")}>{i + 1}</span>
                      <Avatar className="w-7 h-7 border border-slate-100">
                        {r.image && <AvatarImage src={r.image} />}
                        <AvatarFallback className="text-[9px] font-bold text-white" style={{ background: C.secondary }}>{initials(r.name)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{r.name}</span>
                      <span className="text-xs font-black" style={{ color: C.success }}>{r.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <p className="font-bold text-slate-900 text-sm mb-3">Quick Actions</p>
              <div className="space-y-1.5">
                <button onClick={handleExportExcel}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors group">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${C.primary}12` }}>
                    <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: C.primary }} />
                  </span>
                  Export Excel (CSV)
                  <ChevronRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-slate-400" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                Marks flow in automatically from Assignments, Assessments &amp; Exams — nothing is entered directly into the gradebook.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Insights row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="font-bold text-slate-900 text-sm">At-Risk Students</p>
            </div>
            <div className="space-y-2">
              {graded.filter(r => r.pct < 60).slice(0, 4).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 truncate">{r.name}</span>
                  <span className="font-bold text-red-500">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {graded.filter(r => r.pct < 60).length === 0 && <p className="text-xs text-slate-400">No graded students below 60%</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm rounded-2xl" style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})` }}>
          <CardContent className="p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" />
              <p className="font-bold text-sm">Insight</p>
            </div>
            <p className="text-xs leading-relaxed text-white/90">
              {kpi ? (
                <>Class average is <b>{kpi.avg.toFixed(1)}%</b> with a <b>{kpi.passPct.toFixed(0)}%</b> pass rate across {kpi.total} graded student{kpi.total !== 1 ? "s" : ""}.
                {kpi.below50 > 0 ? ` ${kpi.below50} student${kpi.below50 > 1 ? "s" : ""} need attention in the lowest-scoring subjects.` : " Strong performance across the board — consider stretch goals for top performers."}</>
              ) : (
                <>No graded work yet — insights will appear once assignments, assessments or exam marks are recorded.</>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
