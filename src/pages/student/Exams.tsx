import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { useExams, matchesSection, planForGrade, type ExamMode, type ExamRecord } from "@/lib/examStore";
import { ExamTimetable } from "@/components/exams/ExamTimetable";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ClipboardList, Calendar, TrendingUp, Award, MapPin, Play } from "lucide-react";
import { motion } from "framer-motion";

function gradeFromPct(p: number) {
  if (p >= 90) return { g: "A+", c: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-none" };
  if (p >= 80) return { g: "A",  c: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-none" };
  if (p >= 70) return { g: "B+", c: "bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border-none" };
  if (p >= 60) return { g: "B",  c: "bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border-none" };
  if (p >= 50) return { g: "C",  c: "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-none" };
  return { g: "F", c: "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-none" };
}

const modeBadge = (m: ExamMode) =>
  m === "Online" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/20 dark:text-violet-400" :
  m === "Hybrid" ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-400" :
  "bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400";

const LS_MARKS_KEY = "sd_exam_marks";
function loadMarks(): Record<string, Record<string, Record<string, number>>> {
  try { return JSON.parse(localStorage.getItem(LS_MARKS_KEY) || "{}"); } catch { return {}; }
}

function fmtDate(iso: string) {
  if (!iso) return "TBD";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return iso; }
}

export default function StudentExams() {
  const { user } = useAuth();
  const { students } = useStudents();
  const allExams = useExams(); // shared localStorage store — same source admin writes to
  const [results, setResults] = useState<any[]>([]);
  const [tab, setTab] = useState<"schedule" | "results">("schedule");

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  // Exams visible to this student: matched to their grade/section AND published to students.
  // A multi-grade exam's top-level `slots` always mirror its FIRST grade plan
  // (see examStore.ts normalize()) — every exam here is re-pointed at the
  // plan for the student's own grade so the timetable shows their subjects,
  // not whichever grade happened to be entered first in Exam Setup.
  const exams = useMemo<ExamRecord[]>(() => {
    const s = student as any;
    if (!s) return [];
    return allExams
      .filter(e => matchesSection(e, s.grade || "", s.section || "") && e.publishedToStudents !== false)
      .map(e => {
        const plan = planForGrade(e, s.grade || "");
        return plan ? { ...e, slots: plan.slots } : e;
      });
  }, [allExams, student]);

  // Online assessment results (separate store) — kept for backward compatibility.
  useEffect(() => {
    const s = student as any;
    if (!s) return;
    smartDb.getAll("Assessment", undefined).then((rows: any[]) => {
      const filtered = (rows || []).filter((a: any) => canonGrade(a.grade) === canonGrade(s.grade) && canonSection(a.section) === canonSection(s.section));
      setResults(filtered);
    }).catch(() => {});
  }, [student]);

  // Scheduled / upcoming exams (have at least one subject slot).
  const scheduleExams = useMemo(
    () => exams.filter(e => (e.slots?.length || 0) > 0 && e.status !== "Published"),
    [exams]
  );

  // Next paper across all scheduled exams for the countdown banner.
  const nextExamPaper = useMemo(() => {
    let next: { subject: string; date: Date; title: string; time: string; room: string } | null = null;
    const now = new Date();
    scheduleExams.forEach(e => {
      e.slots.forEach(sl => {
        if (!sl.date) return;
        const d = new Date(sl.date + "T00:00:00");
        if (d >= now && (!next || d < next.date)) {
          next = { subject: sl.subject, date: d, title: e.name, time: sl.start || "09:00", room: sl.room || e.room };
        }
      });
    });
    return next as { subject: string; date: Date; title: string; time: string; room: string } | null;
  }, [scheduleExams]);

  const countdownText = useMemo(() => {
    if (!nextExamPaper) return null;
    const diff = nextExamPaper.date.getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Today!";
    if (days === 1) return "Tomorrow!";
    return `in ${days} days`;
  }, [nextExamPaper]);

  // Offline exam results from the shared marks store, for published exams.
  const offlineResults = useMemo(() => {
    const s = student as any;
    if (!s) return [];
    const marks = loadMarks();
    const uid = String(s.id ?? s.uid ?? "");
    const rows: { id: string; title: string; subject: string; myMarks: number; maxMarks: number; pct: number }[] = [];
    exams.filter(e => e.status === "Published").forEach(e => {
      const examMarks = marks[e.id];
      if (!examMarks) return;
      Object.entries(examMarks).forEach(([subject, perStudent]) => {
        const m = (perStudent as Record<string, number>)[uid];
        if (m === undefined || m === null) return;
        const max = e.maxMarks || 100;
        rows.push({ id: `${e.id}-${subject}`, title: e.name, subject, myMarks: m, maxMarks: max, pct: Math.round((m / max) * 100) });
      });
    });
    return rows;
  }, [exams, student]);

  // Online assessment results (legacy entries store).
  const onlineResults = useMemo(() => {
    const s = student as any;
    if (!s) return [];
    return results.map(a => {
      const entries = a.entries || [];
      const entry = entries.find((e: any) => e.studentId === s.id);
      const m = entry?.marks?.[s.id] ?? null;
      const max = a.maxMarks || 100;
      return { id: a.id, title: a.title, subject: a.subject, myMarks: m, maxMarks: max, pct: m !== null ? Math.round((m / max) * 100) : null };
    }).filter(a => a.myMarks !== null);
  }, [results, student]);

  const myResults = useMemo(() => [...offlineResults, ...onlineResults], [offlineResults, onlineResults]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="h-5.5 w-5.5 text-purple-600" /> Exams &amp; Evaluations
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Check scheduled term exams, hall &amp; seat allocations, and terminal marksheets.</p>
            </div>

            <div className="flex gap-1 bg-white dark:bg-[#16162A] rounded-xl p-1 border border-slate-100 dark:border-slate-800/40 w-fit shadow-sm">
              {(["schedule", "results"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn("px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
                    tab === t ? "bg-[#9810fa] text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white")}>
                  {t === "schedule" ? "Exam Schedules" : "My Results"}
                </button>
              ))}
            </div>
          </div>

          {/* Countdown Widget */}
          {tab === "schedule" && nextExamPaper && (
            <div className="bg-gradient-to-r from-[#9810fa] via-[#a322a3] to-[#d12386] rounded-[24px] p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xl shadow-purple-600/10 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-lg" />
              <div className="flex items-center gap-4 relative shrink-0">
                <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center border border-white/15">
                  <Play className="h-5 w-5 text-yellow-300 fill-yellow-300" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-white/70 uppercase tracking-widest leading-none">Upcoming Exam</p>
                  <h4 className="font-extrabold mt-2 text-sm">{nextExamPaper.subject} — {nextExamPaper.title}</h4>
                  <p className="text-xs text-white/70 mt-1">Starts {nextExamPaper.time}{nextExamPaper.room ? ` · Room ${nextExamPaper.room}` : ""}</p>
                </div>
              </div>
              <div className="bg-white/15 px-5 py-3 rounded-2xl border border-white/10 text-center shrink-0">
                <span className="text-xl font-black block leading-none">{countdownText}</span>
                <span className="text-[9px] font-extrabold text-white/70 tracking-widest mt-1 block uppercase">Time left</span>
              </div>
            </div>
          )}

          {/* tab schedule */}
          {tab === "schedule" && (
            <div className="space-y-4">
              {scheduleExams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] text-slate-400 transition-colors shadow-sm">
                  <Calendar className="h-12 w-12 mb-3 opacity-25" />
                  <p className="font-extrabold text-sm text-slate-800 dark:text-white">No Upcoming Exams</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">No exam papers have been published to your profile yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduleExams.map(exam => (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={exam.id}>
                      <ExamTimetable
                        exam={exam}
                        studentId={String((student as any)?.id ?? (student as any)?.uid ?? "")}
                        identity={{ grade: (student as any)?.grade, section: (student as any)?.section, rollNo: (student as any)?.rollNo ?? (student as any)?.roll }}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* tab results */}
          {tab === "results" && (
            <div className="space-y-4">
              {myResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] text-slate-400 transition-colors shadow-sm">
                  <Award className="h-12 w-12 mb-3 opacity-25" />
                  <p className="font-extrabold text-sm text-slate-800 dark:text-white">No Results Recorded</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Term exam evaluations are currently pending publication.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] overflow-hidden transition-colors shadow-sm">
                  <div className="px-6 py-5 border-b border-slate-50 dark:border-slate-800/20 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Subject-wise Performance</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800/30">
                          <th className="text-left px-6 py-4 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Exam / Subject</th>
                          <th className="text-center px-4 py-4 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Marks</th>
                          <th className="text-center px-4 py-4 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Percentage</th>
                          <th className="text-center px-6 py-4 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/20">
                        {myResults.map(r => {
                          const gr = r.pct !== null ? gradeFromPct(r.pct) : null;
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10">
                              <td className="px-6 py-4">
                                <p className="font-bold text-slate-800 dark:text-slate-200">{r.title}</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{r.subject}</p>
                              </td>
                              <td className="px-4 py-4 text-center font-bold text-slate-850 dark:text-slate-250">{r.myMarks}/{r.maxMarks}</td>
                              <td className="px-4 py-4 text-center">
                                <span className={cn("font-black text-sm", (r.pct ?? 0) >= 60 ? "text-emerald-500" : "text-rose-500")}>{r.pct}%</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                {gr && <Badge className={cn("text-[10px] font-black border-none px-2.5 py-0.5 rounded-lg", gr.c)}>{gr.g}</Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
