import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeStudentGradebook,
  type GradebookSources, type StudentGradebook,
} from "@/lib/gradebookEngine";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts } from "@/lib/assessmentAttempts";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart3, BookOpen, CalendarDays, Download, ChevronDown,
  Languages, Calculator, FlaskConical, Globe2, Type,
  MonitorSmartphone, Palette, Dumbbell, Music, Library, TrendingUp,
  TrendingDown, Clock, Info,
} from "lucide-react";

/* ---------- grade helpers ---------- */
function gradeFromPct(p: number) {
  if (p >= 90) return { g: "A+", badge: "bg-emerald-50 text-emerald-700", dot: "#10b981" };
  if (p >= 80) return { g: "A",  badge: "bg-blue-50 text-blue-700",       dot: "#3b82f6" };
  if (p >= 70) return { g: "B",  badge: "bg-amber-50 text-amber-700",     dot: "#f59e0b" };
  if (p >= 60) return { g: "C",  badge: "bg-orange-50 text-orange-700",   dot: "#f97316" };
  return { g: "D", badge: "bg-rose-50 text-rose-700", dot: "#ef4444" };
}

/* Subject color/icon meta (no teacher names — pulled from real DB) */
const SUBJECT_META: Record<string, { color: string; ic: string; icon: any }> = {
  "English":             { color: "bg-blue-50",    ic: "text-purple-600",    icon: Languages },
  "Mathematics":         { color: "bg-purple-50",  ic: "text-purple-600",  icon: Calculator },
  "Science":             { color: "bg-emerald-50", ic: "text-emerald-600", icon: FlaskConical },
  "Social Studies":      { color: "bg-amber-50",   ic: "text-amber-600",   icon: Globe2 },
  "Arabic":              { color: "bg-pink-50",    ic: "text-pink-600",    icon: Type },
  "Islamic Studies":     { color: "bg-orange-50",  ic: "text-orange-600",  icon: BookOpen },
  "Computer Science":    { color: "bg-indigo-50",  ic: "text-purple-600",  icon: MonitorSmartphone },
  "Computer":            { color: "bg-indigo-50",  ic: "text-purple-600",  icon: MonitorSmartphone },
  "Art":                 { color: "bg-rose-50",    ic: "text-rose-600",    icon: Palette },
  "Physical Education":  { color: "bg-teal-50",    ic: "text-teal-600",    icon: Dumbbell },
};
const DEFAULT_META = { color: "bg-slate-50", ic: "text-slate-600", icon: BookOpen };

type Tab = "overview" | "subject" | "assessments" | "history";

export default function StudentGradebook() {
  const { user } = useAuth();
  const { students } = useStudents();
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const year = "2026-27";
  const term = "Term 1";
  const [viewBy, setViewBy] = useState("All Subjects");
  const [expanded, setExpanded] = useState<string | null>(null);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  /* ---- gradebook engine sources (assignments + assessments + exams) ---- */
  useEffect(() => {
    loadGradebookSources().then(setSources).catch(() => setSources(null));
  }, []);

  /* ---- real data wiring (preserved) ---- */
  useEffect(() => {
    const s = student as any;
    if (!s) return;
    Promise.all([
      smartDb.getAll("assessments", undefined).catch(() => []),
      getAllAttempts().catch(() => []),
    ]).then(([rows, atts]) => {
      const filtered = (rows || []).filter((a: any) => canonGrade(a.grade) === canonGrade(s.grade) && canonSection(a.section) === canonSection(s.section));
      setAssessments(filtered);
      setAttempts(atts || []);
    }).catch(() => {});
    // cheaply load attendance the same way the Attendance page does
    smartDb.getAll("TeacherAttendance", undefined).then((rows: any[]) => {
      const filtered = (rows || []).filter((r: any) =>
        canonGrade(r.grade) === canonGrade(s.grade) && canonSection(r.section) === canonSection(s.section) && r.marks?.[s.id]
      );
      setAttendanceRecords(filtered);
    }).catch(() => {});
  }, [student]);

  /* ---- attendance (real, computed like the Attendance page) ---- */
  const attendanceStat = useMemo(() => {
    const s = student as any;
    if (!s) return { total: 0, pct: 0 };
    let present = 0, late = 0, total = 0;
    attendanceRecords.forEach(r => {
      const v = r.marks?.[s.id];
      if (v === "P") { present++; total++; }
      else if (v === "L") { late++; total++; }
      else if (v === "A") { total++; }
    });
    return { total, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
  }, [attendanceRecords, student]);

  // Real per-student score comes from the student's own assessment_attempts
  // row (same canonical contract as student/Assessments.tsx and Exams.tsx) —
  // assessments themselves carry no per-student "entries" field, so reading
  // a.entries[].marks[s.id] always resolved to nothing for real data.
  const myResults = useMemo(() => {
    const s = student as any;
    if (!s) return [];
    return assessments.map(a => {
      const released = a.resultsReleased || a.resultVisibility === "immediate" || !a.resultVisibility;
      if (!released) return null;
      const attempt = attempts.find((at: any) => at.assessmentId === a.id && at.studentId === s.id);
      const marks = attempt?.score ?? null;
      if (marks === null) return null;
      const max = a.totalMarks || 100;
      const pct = Math.round((marks / max) * 100);
      return { ...a, myMarks: marks, maxMarks: max, pct };
    }).filter((a): a is NonNullable<typeof a> => a !== null);
  }, [assessments, attempts, student]);

  /* ---- gradebook: auto-computed from assignments + assessments + exams ---- */
  const band = useMemo(
    () => (student ? getBandForGrade(curriculum, (student as any).grade) : null),
    [student, curriculum]
  );

  // Dynamic columns from the curriculum band (so weights are accurate, not faked).
  const columns = useMemo(() => {
    const cats = band?.categories ?? [
      { name: "Assignments", marks: 20, isExam: false },
      { name: "Assessments", marks: 20, isExam: false },
      { name: "Mid-Term Exam", marks: 20, isExam: true },
      { name: "Final Exam", marks: 40, isExam: true },
    ];
    return cats.map(c => ({ name: c.name, weight: c.marks }));
  }, [band]);

  const gb: StudentGradebook | null = useMemo(() => {
    const s = student as any;
    if (!s || !sources) return null;
    return computeStudentGradebook(
      { id: String(s.id), name: s.name, grade: s.grade, section: s.section }, band, sources
    );
  }, [student, sources, band]);

  // Display rows: real per-subject components + weighted percentage from the engine.
  const { subjects, isDemo } = useMemo(() => {
    if (!gb) return { subjects: [], isDemo: false };
    const built = gb.subjects.filter(s => s.hasData).map(sg => {
      const meta = SUBJECT_META[sg.subject] || DEFAULT_META;
      return {
        subject: sg.subject,
        teacher: "—",
        total: Math.round(sg.percentage * 10) / 10,
        letter: sg.letter,
        color: meta.color, ic: meta.ic, icon: meta.icon,
        components: sg.components, // aligned 1:1 with `columns`
      };
    });
    return { subjects: built, isDemo: false };
  }, [gb]);

  /* ---- aggregates ---- */
  const overallPct = useMemo(
    () => subjects.reduce((s, x) => s + x.total, 0) / (subjects.length || 1),
    [subjects],
  );
  const gpa = (overallPct / 100) * 4; // 0–4 scale
  const gpaStr = gpa.toFixed(2);
  const overallGrade = gradeFromPct(overallPct); // real computed grade band

  const gradeCounts = useMemo(() => {
    const c = { "A+": 0, A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
    subjects.forEach(s => { c[gradeFromPct(s.total).g] = (c[gradeFromPct(s.total).g] || 0) + 1; });
    return c;
  }, [subjects]);

  const strengths = useMemo(
    () => [...subjects].sort((a, b) => b.total - a.total).slice(0, 3),
    [subjects],
  );
  const needsWork = useMemo(
    () => [...subjects].sort((a, b) => a.total - b.total).slice(0, 2),
    [subjects],
  );

  const visibleSubjects = viewBy === "All Subjects" ? subjects : subjects.filter(s => s.subject === viewBy);

  // Count subjects where the engine computed a nonzero total (from exams + assignments + assessments).
  const subjectsGraded = useMemo(() => subjects.filter(s => s.total > 0).length, [subjects]);

  const KPIS = [
    {
      icon: BarChart3, bg: "bg-purple-50", tint: "bg-purple-100", ic: "text-purple-600",
      label: "Overall Average", value: `${gpaStr} / 4.00`,
      pill: overallGrade.g, pillCls: "bg-purple-100 text-purple-700",
      note: isDemo ? "Sample data — no grades recorded yet" : `Grade ${overallGrade.g} · ${overallPct.toFixed(1)}%`,
    },
    {
      icon: BookOpen, bg: "bg-emerald-50", tint: "bg-emerald-100", ic: "text-emerald-600",
      label: "Subjects Graded", value: isDemo ? "0" : String(subjectsGraded),
      pill: isDemo ? "None yet" : "Assessed", pillCls: "bg-emerald-100 text-emerald-700",
      note: "Subjects with recorded marks",
    },
    {
      icon: BookOpen, bg: "bg-blue-50", tint: "bg-blue-100", ic: "text-purple-600",
      label: "Subjects", value: String(subjects.length),
      pill: isDemo ? "Sample" : "All Active", pillCls: "bg-blue-100 text-blue-700",
      note: isDemo ? "Illustrative subjects" : "Enrolled this term",
    },
    {
      icon: CalendarDays, bg: "bg-amber-50", tint: "bg-amber-100", ic: "text-amber-600",
      label: "Attendance",
      value: attendanceStat.total > 0 ? `${attendanceStat.pct}%` : "—",
      pill: attendanceStat.total > 0 ? (attendanceStat.pct >= 75 ? "On track" : "Below 75%") : "No records",
      pillCls: "bg-amber-100 text-amber-700",
      note: attendanceStat.total > 0 ? `${attendanceStat.total} sessions logged` : "No attendance recorded",
    },
  ];

  const GRADE_LEGEND = [
    { label: "90 and above (A+)", dot: "#10b981" },
    { label: "80-89% (A)",        dot: "#3b82f6" },
    { label: "70-79% (B)",        dot: "#f59e0b" },
    { label: "60-69% (C)",        dot: "#f97316" },
    { label: "Below 60% (D)",     dot: "#ef4444" },
  ];

  /* ---- donut (Performance Summary) ---- */
  const donutSegments = [
    { label: "A+", count: gradeCounts["A+"], color: "#10b981" },
    { label: "A",  count: gradeCounts["A"],  color: "#3b82f6" },
    { label: "B",  count: gradeCounts["B"],  color: "#f59e0b" },
    { label: "C",  count: gradeCounts["C"],  color: "#f97316" },
    { label: "D",  count: gradeCounts["D"],  color: "#ef4444" },
  ];
  const donutTotal = subjects.length || 1;
  const donutCirc = 2 * Math.PI * 40;
  let donutOffset = -90;

  // Real CSV export of the subjects-performance table — previously a
  // toast-only stub with no file behind it.
  const downloadReport = () => {
    if (!subjects.length) {
      toast.error("No graded subjects to download yet.");
      return;
    }
    const header = ["Subject", ...columns.map(c => `${c.name} (${c.weight}%)`), "Total (%)", "Grade"];
    const rows = subjects.map(s => [
      s.subject,
      ...s.components.map(c => c.hasData ? `${Math.round((c.obtainedPct / 100) * c.weight * 10) / 10}/${c.weight}` : "—"),
      String(s.total),
      gradeFromPct(s.total).g,
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gradebook-${((student as any)?.name || "student").replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Gradebook report downloaded.");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Academic Gradebook</h1>
              <p className="text-sm text-slate-400">Track your academic performance across all subjects.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Read-only period indicators: only current-term data exists, so these
                are not interactive filters (would otherwise misrepresent data). */}
            <span className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 flex items-center">
              {year}
            </span>
            <span className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 flex items-center">
              {term}
            </span>
            <button onClick={downloadReport}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4 text-slate-500" /> Download Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-100">
          {([
            { k: "overview",    label: "Overview" },
            { k: "subject",     label: "Subject Wise" },
            { k: "assessments", label: "Assessments" },
            { k: "history",     label: "Grade History" },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Illustrative-data notice when no real grades exist */}
        {isDemo && (
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            No graded assessments have been recorded for you yet. The subjects below are sample data shown for illustration only — they are not your actual grades.
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k, i) => (
            <div key={i} className={cn("rounded-2xl p-5 flex items-start justify-between", k.bg)}>
              <div>
                <p className="text-xs font-semibold text-slate-500">{k.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1.5 leading-none">{k.value}</p>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", k.pillCls)}>{k.pill}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-medium">{k.note}</p>
              </div>
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", k.tint)}>
                <k.icon className={cn("h-5 w-5", k.ic)} />
              </div>
            </div>
          ))}
        </div>

        {/* OVERVIEW / SUBJECT WISE share the main table+sidebar grid */}
        {(tab === "overview" || tab === "subject") && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

            {/* LEFT: Subjects Performance table */}
            <div className="lg:col-span-3 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">Subjects Performance</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">View By:</span>
                  <select value={viewBy} onChange={e => setViewBy(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
                    <option>All Subjects</option>
                    {subjects.map(s => <option key={s.subject}>{s.subject}</option>)}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                      <th className="px-5 py-3 text-left">Subject</th>
                      {columns.map(c => (
                        <th key={c.name} className="px-3 py-3 text-center">{c.name}<br /><span className="font-normal text-slate-400">({c.weight}%)</span></th>
                      ))}
                      <th className="px-3 py-3 text-center">Total<br /><span className="font-normal text-slate-400">(100%)</span></th>
                      <th className="px-3 py-3 text-center">Grade</th>
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visibleSubjects.map(s => {
                      const gr = gradeFromPct(s.total);
                      const isOpen = expanded === s.subject;
                      return (
                        <tr key={s.subject} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", s.color)}>
                                <s.icon className={cn("h-4 w-4", s.ic)} />
                              </div>
                              <span className="font-semibold text-slate-900">{s.subject}</span>
                            </div>
                          </td>
                          {s.components.map((c, ci) => (
                            <td key={ci} className="px-3 py-3.5 text-center">
                              {c.hasData ? (
                                <>
                                  <p className="font-semibold text-slate-800">{Math.round((c.obtainedPct / 100) * c.weight * 10) / 10} / {c.weight}</p>
                                  <p className={cn("text-[11px] font-bold", c.obtainedPct >= 90 ? "text-emerald-600" : c.obtainedPct >= 80 ? "text-purple-600" : "text-amber-600")}>{Math.round(c.obtainedPct)}%</p>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-300 font-medium" title={c.source === "pending" ? "No automated source" : "Not marked yet"}>—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3.5 text-center font-bold text-slate-900">{s.total}%</td>
                          <td className="px-3 py-3.5 text-center">
                            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", gr.badge)}>{gr.g}</span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <button
                              onClick={() => { setExpanded(isOpen ? null : s.subject); toast.info(`${s.subject} · Total ${s.total}% (Grade ${gr.g})`); }}
                              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-purple-50 hover:text-purple-600 transition-colors">
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grade legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
                {GRADE_LEGEND.map(g => (
                  <span key={g.label} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.dot }} />
                    {g.label}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT sidebar */}
            <div className="space-y-4">

              {/* Performance Summary donut */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
                <h3 className="font-bold text-slate-900 text-sm mb-3">Performance Summary</h3>
                <div className="flex justify-center">
                  <div className="relative">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      {donutSegments.map((seg, i) => {
                        const frac = seg.count / donutTotal;
                        const dash = frac * donutCirc;
                        const el = frac > 0 ? (
                          <circle key={i} cx="60" cy="60" r="40" fill="none" stroke={seg.color} strokeWidth="14"
                            strokeDasharray={`${dash} ${donutCirc - dash}`} transform={`rotate(${donutOffset} 60 60)`} />
                        ) : null;
                        donutOffset += frac * 360;
                        return el;
                      })}
                      <circle cx="60" cy="60" r="30" fill="white" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-slate-900 leading-none">{gpaStr}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">GPA</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 mt-3">
                  {donutSegments.map(seg => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                      <span className="text-[11px] text-slate-600 flex-1">{seg.label}</span>
                      <span className="text-[11px] font-semibold text-slate-700">{seg.count}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total Subjects</span>
                  <span className="font-bold text-slate-900">{subjects.length}</span>
                </div>
              </div>

              {/* Subject Strength */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Subject Strength
                  </h3>
                  <button onClick={() => toast.info("All subject strengths")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
                </div>
                <div className="space-y-3">
                  {strengths.map(s => (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{s.subject}</span>
                        <span className="font-bold text-slate-900">{s.total}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.total}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Improvement */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
                <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4 text-amber-500" /> Needs Improvement
                </h3>
                <div className="space-y-3">
                  {needsWork.map((s, idx) => (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{s.subject}</span>
                        <span className="font-bold text-slate-900">{s.total}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", idx === 0 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${s.total}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recently Updated */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
                <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-purple-500" /> Recently Updated
                </h3>
                {myResults.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No assessments recorded yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {myResults.slice(0, 3).map((r, i) => {
                      const meta = SUBJECT_META[r.subject] || DEFAULT_META;
                      return (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", meta.color)}>
                            <meta.icon className={cn("h-4 w-4", meta.ic)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800">{r.subject} — {r.type || "Assessment"}</p>
                            <p className="text-[10px] text-slate-400">{r.date ? `Updated on ${new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : "Date not set"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ASSESSMENTS tab */}
        {tab === "assessments" && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Assessment Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">Weighted marks across all subjects for {term}, {year}.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                    <th className="px-5 py-3 text-left">Subject</th>
                    {columns.map(c => (
                      <th key={c.name} className="px-3 py-3 text-center">{c.name}<br /><span className="font-normal text-slate-400">({c.weight})</span></th>
                    ))}
                    <th className="px-3 py-3 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {subjects.map(s => (
                    <tr key={s.subject} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{s.subject}</td>
                      {s.components.map((c, ci) => (
                        <td key={ci} className="px-3 py-3.5 text-center text-slate-700">
                          {c.hasData ? `${Math.round((c.obtainedPct / 100) * c.weight * 10) / 10} / ${c.weight}` : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3.5 text-center font-bold text-slate-900">{s.total}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GRADE HISTORY tab */}
        {tab === "history" && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">Grade History</h3>
            <p className="text-xs text-slate-400 mb-5">Term-by-term GPA progression for {year}.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { term: "Term 1", gpa: gpaStr, note: "Current term", cls: "bg-purple-50 text-purple-700" },
                { term: "Term 2", gpa: "—", note: "Upcoming", cls: "bg-slate-50 text-slate-500" },
                { term: "Final",  gpa: "—", note: "Upcoming", cls: "bg-slate-50 text-slate-500" },
              ].map(t => (
                <div key={t.term} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">{t.term}</p>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", t.cls)}>{t.note}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{t.gpa}<span className="text-sm text-slate-400 font-medium"> / 4.00</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <Info className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          Grades are auto-calculated from your Assignment, Assessment and Exam marks, weighted per the {curriculum.shortName} curriculum. Marks cannot be entered directly here.
        </div>

      </div>
    </DashboardLayout>
  );
}
