import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts } from "@/lib/assessmentAttempts";
import { publishDueScheduledAssessments } from "@/lib/classPublishNotify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Clock, BookOpen, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft,
  Play, Flag, Send, Trophy, Star, TrendingUp, Brain, RotateCcw,
  Eye, Download, Shield, Wifi, Maximize2, Copy, RefreshCw, Timer,
  ChevronDown, BarChart3, Target, Zap, FileText, ArrowLeft,
  CheckCheck, XCircle, Info, Lightbulb, BookMarked, Users,
  Calendar, Filter, Search, SortAsc, Award, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = "list" | "instructions" | "test" | "review" | "success" | "results" | "ai";
type QType = "MCQ" | "True/False" | "Short Answer" | "Long Answer" | "Fill in the Blank" | "Match the Following" | "Essay" | "Diagram Based";
type AStatus = "Active" | "Upcoming" | "Completed" | "Draft";
type QStatus = "answered" | "review" | "unanswered";

interface Option { id: string; text: string }
interface Question {
  id: string; type: QType; text: string; marks: number;
  options?: Option[]; correctAnswer?: string; diagramDescription?: string;
  isImportant?: boolean;
}
interface Assessment {
  id: string; title: string; chapter: string; type: string;
  grade: string; section: string; subject: string; date: string;
  duration: number; totalMarks: number; passingMarks: number;
  description: string; questions: Question[];
  teacher: string; status: AStatus; createdAt: string;
  resultVisibility?: "immediate" | "manual";
  resultsReleased?: boolean;
}
interface Attempt {
  id: string; assessmentId: string; studentId: string; studentName: string;
  answers: Record<string, string>; flagged: string[];
  startedAt: string; submittedAt?: string; score?: number;
  status: "in_progress" | "submitted";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function gradeLabel(pct: number) {
  if (pct >= 90) return { g: "A+", col: "text-emerald-600 bg-emerald-50" };
  if (pct >= 80) return { g: "A",  col: "text-purple-600 bg-blue-50" };
  if (pct >= 70) return { g: "B",  col: "text-purple-600 bg-violet-50" };
  if (pct >= 60) return { g: "C",  col: "text-amber-600 bg-amber-50" };
  return { g: "F", col: "text-red-600 bg-red-50" };
}
function subjectColor(sub: string): string {
  const map: Record<string, string> = {
    Mathematics: "bg-violet-100 text-violet-700", Science: "bg-emerald-100 text-emerald-700",
    English: "bg-blue-100 text-blue-700", Arabic: "bg-pink-100 text-pink-700",
    Physics: "bg-cyan-100 text-cyan-700", Chemistry: "bg-teal-100 text-teal-700",
    Biology: "bg-green-100 text-green-700", "Social Studies": "bg-amber-100 text-amber-700",
    "Islamic Studies": "bg-rose-100 text-rose-700", Computer: "bg-indigo-100 text-indigo-700",
  };
  return map[sub] ?? "bg-slate-100 text-slate-700";
}
function statusStyle(s: string) {
  if (s === "Active") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "Upcoming") return "bg-violet-50 text-violet-700 border-violet-200";
  if (s === "Completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}
function daysLeft(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: "Overdue", color: "text-red-500" };
  if (diff === 0) return { text: "Due today", color: "text-orange-500" };
  if (diff <= 3) return { text: `${diff}d left`, color: "text-orange-500" };
  return { text: `${diff}d left`, color: "text-slate-500" };
}

// ─── Screen 1: Assessment List ────────────────────────────────────────────────
function AssessmentList({
  assessments, attempts, onStart, onViewResult,
}: {
  assessments: Assessment[];
  attempts: Record<string, Attempt>;
  onStart: (a: Assessment) => void;
  onViewResult: (a: Assessment) => void;
}) {
  const [tab, setTab] = useState<"all" | "upcoming" | "completed" | "overdue">("all");
  const [filterSubject, setFilterSubject] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title" | "marks">("date");
  const [page, setPage] = useState(1);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const PER_PAGE = 6;

  const now = new Date();

  const subjects = useMemo(() => [...new Set(assessments.map(a => a.subject))].sort(), [assessments]);

  const enriched = useMemo(() => assessments.map(a => {
    const attempt = attempts[a.id];
    const submitted = attempt?.status === "submitted";
    const overdue = !submitted && new Date(a.date) < now;
    const displayStatus = submitted ? "Completed" : overdue ? "Overdue" : "Upcoming";
    return { ...a, submitted, overdue, displayStatus };
  }), [assessments, attempts]);

  const filtered = useMemo(() => {
    let list = enriched.filter(a => {
      if (filterSubject && a.subject !== filterSubject) return false;
      if (tab === "upcoming") return !a.submitted && !a.overdue;
      if (tab === "completed") return a.submitted;
      if (tab === "overdue") return a.overdue;
      return true;
    });
    if (sortBy === "date") list = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sortBy === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "marks") list = [...list].sort((a, b) => b.totalMarks - a.totalMarks);
    return list;
  }, [enriched, filterSubject, tab, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = useMemo(() => {
    const done = Object.values(attempts).filter(a => a.status === "submitted" && a.score != null);
    const avgScore = done.length
      ? Math.round(done.reduce((s, a) => s + (a.score! / (assessments.find(x => x.id === a.assessmentId)?.totalMarks ?? 100)) * 100, 0) / done.length)
      : null;
    let highestScore: { pct: number; subject: string } | null = null;
    done.forEach(a => {
      const assessment = assessments.find(x => x.id === a.assessmentId);
      if (!assessment) return;
      const pct = Math.round((a.score! / assessment.totalMarks) * 100);
      if (!highestScore || pct > highestScore.pct) highestScore = { pct, subject: assessment.subject };
    });
    return {
      upcoming: enriched.filter(a => !a.submitted && !a.overdue).length,
      completed: enriched.filter(a => a.submitted).length,
      avgScore,
      highestScore,
      totalAttempts: done.length,
      totalSubjects: [...new Set(done.map(a => assessments.find(x => x.id === a.assessmentId)?.subject).filter(Boolean))].length,
    };
  }, [enriched, attempts, assessments]);

  // Calendar: current month
  const calYear = now.getFullYear();
  const calMonth = now.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calDays: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  // Map assessment dates to calendar dots
  const assessmentDateMap = useMemo(() => {
    const map: Record<number, { type: string }[]> = {};
    enriched.forEach(a => {
      const d = new Date(a.date);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push({ type: a.displayStatus });
      }
    });
    return map;
  }, [enriched, calYear, calMonth]);

  // Upcoming assessments for sidebar (next 5 not submitted, not overdue)
  const upcomingList = useMemo(() =>
    enriched.filter(a => !a.submitted && !a.overdue)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5),
    [enriched]);

  // Recent completed for bottom cards
  const recentCompleted = useMemo(() =>
    enriched.filter(a => a.submitted && ((a as any).resultsReleased || (a as any).resultVisibility === "immediate" || !(a as any).resultVisibility))
      .sort((a, b) => {
        const aAttempt = attempts[a.id];
        const bAttempt = attempts[b.id];
        return new Date(bAttempt?.submittedAt ?? 0).getTime() - new Date(aAttempt?.submittedAt ?? 0).getTime();
      })
      .slice(0, 3),
    [enriched, attempts]);

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  function dotColor(type: string) {
    if (type === "Completed") return "bg-emerald-500";
    if (type === "Overdue") return "bg-red-500";
    return "bg-blue-500";
  }

  function performanceGradeLabel(pct: number) {
    if (pct >= 85) return { label: "Excellent", color: "text-emerald-600 bg-emerald-50" };
    if (pct >= 70) return { label: "Good", color: "text-purple-600 bg-blue-50" };
    if (pct >= 50) return { label: "Average", color: "text-amber-600 bg-amber-50" };
    return { label: "Needs Work", color: "text-red-600 bg-red-50" };
  }

  // Donut chart SVG helper
  function DonutChart({ pct }: { pct: number }) {
    const r = 40, cx = 50, cy = 50;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#7C3AED" strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 font-black" style={{ fontSize: 18, fontWeight: 900 }}>
          {pct}%
        </text>
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-[1400px] mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">Assessments</h1>
            <p className="text-sm text-slate-500 mt-0.5">View all tests, quizzes, exams and assessments.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowGuidelines(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <Shield className="w-4 h-4" /> Assessment Guidelines
            </button>
            <button
              onClick={() => {
                const u = enriched.find(a => !a.submitted && !a.overdue);
                if (u) onStart(u);
                else toast.info("No upcoming assessments available.");
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-sm font-bold shadow-sm hover:bg-[#6D28D9] transition-colors">
              <Play className="w-4 h-4 fill-white" /> Take Online Test
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-[1400px] mx-auto grid grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-black text-blue-700">{stats.upcoming}</p>
              <p className="text-xs text-blue-500 font-medium">Upcoming Tests</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-black text-emerald-700">{stats.completed}</p>
              <p className="text-xs text-emerald-500 font-medium">Completed Assessments</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-black text-violet-700">{stats.avgScore != null ? `${stats.avgScore}%` : "—"}</p>
              <p className="text-xs text-violet-500 font-medium">Average Score</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-black text-amber-700">{stats.highestScore ? `${stats.highestScore.pct}%` : "—"}</p>
              <p className="text-xs text-amber-500 font-medium">Highest Score{stats.highestScore ? ` In ${stats.highestScore.subject}` : ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main layout: content + sidebar ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6">
        {/* ── Left: Table area ── */}
        <div className="flex-1 min-w-0">
          {/* Tab filters + dropdowns */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            {/* Underline tabs */}
            <div className="flex gap-0 border-b border-slate-200">
              {(["All","Upcoming","Completed","Overdue"] as const).map(t => {
                const key = t.toLowerCase() as "all" | "upcoming" | "completed" | "overdue";
                return (
                  <button key={t} onClick={() => { setTab(key); setPage(1); }}
                    className={cn("px-4 py-2 text-sm font-semibold transition-all border-b-2 -mb-px",
                      tab === key
                        ? "border-[#7C3AED] text-[#7C3AED]"
                        : "border-transparent text-slate-500 hover:text-slate-700")}>
                    {t}
                  </button>
                );
              })}
            </div>
            {/* Filter dropdowns */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <select value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(1); }}
                  className="pl-8 pr-8 h-9 rounded-lg border border-slate-200 text-sm outline-none focus:border-violet-400 bg-white text-slate-700 appearance-none cursor-pointer">
                  <option value="">All Subjects</option>
                  {subjects.map(s => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <SortAsc className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <select value={sortBy} onChange={e => setSortBy(e.target.value as "date" | "title" | "marks")}
                  className="pl-8 pr-8 h-9 rounded-lg border border-slate-200 text-sm outline-none focus:border-violet-400 bg-white text-slate-700 appearance-none cursor-pointer">
                  <option value="date">Sort by: Due Date</option>
                  <option value="title">Sort by: Title</option>
                  <option value="marks">Sort by: Marks</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[2.5fr_1fr_1.2fr_0.8fr_1fr_1.1fr] text-[11px] font-bold uppercase tracking-wider text-slate-400 px-5 py-3 border-b border-slate-100 bg-slate-50/80">
              <span>Assessment</span>
              <span>Subject</span>
              <span>Due Date</span>
              <span>Total Marks</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>

            {paginated.length === 0 ? (
              <div className="py-16 text-center">
                <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No assessments found</p>
              </div>
            ) : paginated.map((a) => {
              const attempt = attempts[a.id];
              const due = daysLeft(a.date);
              const dueDate = new Date(a.date);
              return (
                <div key={a.id} className="grid grid-cols-[2.5fr_1fr_1.2fr_0.8fr_1fr_1.1fr] items-center px-5 py-3.5 border-b border-slate-50 last:border-0 hover:bg-violet-50/20 transition-colors">
                  {/* Assessment */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{a.title}</p>
                      <p className="text-xs text-slate-400 truncate">{a.chapter || a.type}</p>
                    </div>
                  </div>
                  {/* Subject */}
                  <span className={cn("inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold w-fit", subjectColor(a.subject))}>
                    {a.subject}
                  </span>
                  {/* Due Date */}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{dueDate.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</p>
                      <p className="text-[11px] text-slate-400">11:59 PM</p>
                    </div>
                  </div>
                  {/* Total Marks */}
                  <span className="text-sm font-bold text-slate-700">{a.totalMarks}</span>
                  {/* Status */}
                  <span className={cn("inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border w-fit",
                    a.submitted ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    a.overdue ? "bg-red-50 text-red-600 border-red-200" :
                    "bg-blue-50 text-blue-700 border-blue-200")}>
                    {a.displayStatus}
                  </span>
                  {/* Action */}
                  <div className="flex justify-end">
                    {a.submitted ? (
                      (a as any).resultsReleased || (a as any).resultVisibility === "immediate" || !(a as any).resultVisibility ? (
                        <button onClick={() => onViewResult(a)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                          <Eye className="w-3.5 h-3.5" /> View Result
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-semibold border border-amber-200">
                          Results Pending
                        </span>
                      )
                    ) : a.overdue ? (
                      <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
                        Closed
                      </span>
                    ) : (
                      <button onClick={() => onStart(a)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs font-bold shadow-sm hover:bg-[#6D28D9] transition-colors">
                        <Play className="w-3 h-3 fill-white" /> Start Test
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
            <span>
              Showing {filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} assessments
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={cn("w-8 h-8 rounded-lg text-xs font-bold border transition-colors",
                    page === p ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Recent Results Cards ── */}
          {recentCompleted.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Recent Results
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {recentCompleted.map(a => {
                  const attempt = attempts[a.id];
                  const score = attempt?.score ?? 0;
                  const pct = Math.round((score / a.totalMarks) * 100);
                  const gl = performanceGradeLabel(pct);
                  return (
                    <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewResult(a)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-bold", gl.color)}>{gl.label}</span>
                      </div>
                      <p className="font-bold text-slate-900 text-sm leading-tight mb-1 line-clamp-2">{a.title}</p>
                      <p className="text-xs text-slate-400 mb-3">{a.subject}</p>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-black text-slate-900">{score}<span className="text-sm text-slate-400 font-medium">/{a.totalMarks}</span></p>
                          <p className="text-xs text-slate-500 font-medium">{pct}%</p>
                        </div>
                        <div className="h-1.5 flex-1 mx-3 bg-slate-100 rounded-full overflow-hidden self-center">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-72 shrink-0 space-y-4 sticky top-6 self-start">
          {/* Assessment Calendar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-500" /> Assessment Calendar
            </h3>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">{MONTH_NAMES[calMonth]} {calYear}</span>
            </div>
            {/* Day name headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {calDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const dots = assessmentDateMap[day] ?? [];
                const isToday = day === now.getDate();
                return (
                  <div key={day} className={cn("flex flex-col items-center py-0.5 rounded-md", isToday ? "bg-violet-100" : "")}>
                    <span className={cn("text-[11px] font-semibold", isToday ? "text-violet-700" : "text-slate-600")}>{day}</span>
                    {dots.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dots.slice(0, 3).map((dot, i) => (
                          <span key={i} className={cn("w-1 h-1 rounded-full", dotColor(dot.type))} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Upcoming</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Done</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Overdue</span>
            </div>
          </div>

          {/* Upcoming Assessments */}
          {upcomingList.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" /> Upcoming Assessments
              </h3>
              <div className="space-y-2.5">
                {upcomingList.map(a => {
                  const dl = daysLeft(a.date);
                  return (
                    <div key={a.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 hover:bg-violet-50/50 cursor-pointer transition-colors" onClick={() => onStart(a)}>
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <BookOpen className="w-3 h-3 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{a.title}</p>
                        <p className="text-[11px] text-slate-500">{a.subject}</p>
                        <p className={cn("text-[11px] font-semibold mt-0.5", dl.color)}>{dl.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance Overview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-500" /> Performance Overview
            </h3>
            <div className="flex flex-col items-center">
              {stats.avgScore != null ? (
                <DonutChart pct={stats.avgScore} />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-slate-100 flex items-center justify-center">
                  <span className="text-slate-300 text-xs font-bold">No data</span>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2 font-medium">Average Score</p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" />Improvement</span>
                <span className="font-bold text-emerald-600">+{stats.avgScore != null ? Math.max(0, stats.avgScore - 50) : 0}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />Assessments</span>
                <span className="font-bold text-slate-700">{stats.totalAttempts}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-violet-500" />Subjects</span>
                <span className="font-bold text-slate-700">{stats.totalSubjects}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Assessment Guidelines modal — static reference content, not fabricated data */}
      {showGuidelines && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowGuidelines(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-slate-900">Assessment Guidelines</h3>
              </div>
              <button onClick={() => setShowGuidelines(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <ul className="px-6 py-5 space-y-3 text-sm text-slate-700">
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Start the assessment before its scheduled window closes — once time runs out, it auto-submits with whatever has been answered.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Stay on this tab for the full duration — leaving or refreshing may end your attempt early.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Flag questions you want to revisit and review them before submitting.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Each assessment can only be attempted once — there is no retake unless your teacher reopens it.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Results appear here once your teacher releases them — an "Upcoming" or "Overdue" status does not mean your score is hidden on purpose.</li>
            </ul>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowGuidelines(false)} className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Screen 2: Instructions ───────────────────────────────────────────────────
function Instructions({ assessment, onBack, onStart }: { assessment: Assessment; onBack: () => void; onStart: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const RULES = [
    { icon: Timer, text: "Timer starts immediately when you begin the test." },
    { icon: RefreshCw, text: "No retakes allowed — you only get one attempt." },
    { icon: Shield, text: "Auto-save is enabled every 15 seconds." },
    { icon: Clock, text: "Test auto-submits when the timer reaches zero." },
    { icon: Wifi, text: "Ensure a stable internet connection throughout." },
    { icon: Copy, text: "Copy/paste and tab switching are restricted." },
    { icon: Maximize2, text: "Full-screen mode is recommended." },
    { icon: Eye, text: "All interactions are monitored and logged." },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-start justify-center pt-10 px-6">
      <div className="w-full max-w-2xl">
        {/* Back */}
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 font-medium transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Assessments
        </button>

        {/* Header card */}
        <div className="bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] rounded-2xl p-6 text-white mb-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className={cn("inline-flex px-2.5 py-1 rounded-lg text-xs font-bold mb-3 bg-white/20")}>{assessment.subject}</p>
              <h1 className="text-xl font-black mb-1">{assessment.title}</h1>
              <p className="text-violet-200 text-sm">{assessment.chapter}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><BookOpen className="w-6 h-6" /></div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[
              { label: "Duration", value: `${assessment.duration} min` },
              { label: "Questions", value: String(assessment.questions?.length ?? 0) },
              { label: "Total Marks", value: String(assessment.totalMarks) },
              { label: "Passing", value: String(assessment.passingMarks) },
            ].map(s => (
              <div key={s.label} className="bg-white/15 rounded-xl p-3 text-center">
                <p className="text-[10px] text-violet-200 uppercase tracking-wider font-semibold">{s.label}</p>
                <p className="text-lg font-black mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
          {assessment.teacher && (
            <p className="mt-4 text-xs text-violet-200"><span className="font-semibold">Teacher:</span> {assessment.teacher}</p>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-black text-slate-900 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-violet-500" /> Read Before You Begin
          </h2>
          <div className="space-y-3">
            {RULES.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <r.icon className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-sm text-slate-700 font-medium">{r.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Confirm + buttons */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-600 cursor-pointer" />
            <span className="text-sm text-amber-800 font-medium leading-relaxed">
              I have read all instructions, I understand the rules, and I am ready to begin. I confirm I will not use any unauthorized resources.
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={onStart} disabled={!confirmed}
            className={cn("flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
              confirmed ? "bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-md hover:shadow-lg hover:opacity-90" : "bg-slate-100 text-slate-300 cursor-not-allowed")}>
            <Play className="w-4 h-4 fill-white" /> Start Assessment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 3: Test Environment ───────────────────────────────────────────────
function TestEnvironment({
  assessment, answers, flagged, currentQ, timeLeft,
  onAnswer, onFlag, onNext, onPrev, onJump, onReview, onBack,
}: {
  assessment: Assessment; answers: Record<string, string>; flagged: Set<string>;
  currentQ: number; timeLeft: number;
  onAnswer: (qId: string, val: string) => void;
  onFlag: (qId: string) => void;
  onNext: () => void; onPrev: () => void;
  onJump: (i: number) => void;
  onReview: () => void;
  onBack?: () => void;
}) {
  const questions = assessment.questions ?? [];
  const q = questions[currentQ];
  if (!q) return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[9999]">
      <div className="text-center space-y-4">
        <p className="text-slate-500 text-lg font-semibold">No questions available for this assessment.</p>
        <p className="text-slate-400 text-sm">Please contact your teacher or admin.</p>
        {onBack && (
          <button onClick={onBack} className="mt-4 px-6 py-2 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors">
            Back to Assessments
          </button>
        )}
      </div>
    </div>
  );

  const answered = Object.keys(answers).filter(id => answers[id] !== "").length;
  const reviewLater = flagged.size;
  const pct = Math.round((answered / questions.length) * 100);
  const urgent = timeLeft < 300;

  function qStatus(qId: string): QStatus {
    if (flagged.has(qId)) return "review";
    if (answers[qId]) return "answered";
    return "unanswered";
  }

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col" style={{ zIndex: 9999 }}>
      {/* Top bar */}
      <div className="bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] px-6 py-3 flex items-center gap-4 shrink-0 shadow-md">
        <div className="flex-1">
          <p className="text-white font-black text-sm truncate">{assessment.title}</p>
          <p className="text-violet-200 text-xs">{assessment.subject} · {assessment.teacher}</p>
        </div>
        {/* Timer */}
        <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl font-black text-lg font-mono", urgent ? "bg-red-500 text-white animate-pulse" : "bg-white/20 text-white")}>
          <Clock className="w-4 h-4" />{fmt(timeLeft)}
        </div>
        {/* Progress */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-white text-xs font-semibold">{pct}% complete</p>
            <p className="text-violet-200 text-xs">Q {currentQ + 1}/{questions.length}</p>
          </div>
          <div className="w-24 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* Question header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-lg">{q.type}</span>
                <span className="text-xs text-slate-400 font-medium">{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                {q.isImportant && <span className="flex items-center gap-1 text-xs text-amber-600 font-bold"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />Important</span>}
              </div>
              <span className="text-xs text-slate-400 font-semibold">Question {currentQ + 1} of {questions.length}</span>
            </div>

            {/* Question card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <p className="text-slate-900 font-semibold text-base leading-relaxed mb-5">{q.text}</p>

              {/* Diagram */}
              {q.type === "Diagram Based" && q.diagramDescription && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-4 text-sm text-violet-800 leading-relaxed">
                  <p className="font-bold text-violet-700 mb-1 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Diagram Instructions</p>
                  {q.diagramDescription}
                </div>
              )}

              {/* MCQ */}
              {q.type === "MCQ" && q.options && (
                <div className="space-y-2.5">
                  {q.options.map(opt => (
                    <button key={opt.id} onClick={() => onAnswer(q.id, opt.id)}
                      className={cn("w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all font-medium text-sm",
                        answers[q.id] === opt.id ? "border-violet-500 bg-violet-50 text-violet-900" : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50 text-slate-700")}>
                      <span className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0",
                        answers[q.id] === opt.id ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 text-slate-400")}>
                        {String.fromCharCode(65 + (q.options?.indexOf(opt) ?? 0))}
                      </span>
                      {opt.text}
                    </button>
                  ))}
                </div>
              )}

              {/* True/False */}
              {q.type === "True/False" && (
                <div className="flex gap-3">
                  {["True", "False"].map(v => (
                    <button key={v} onClick={() => onAnswer(q.id, v)}
                      className={cn("flex-1 py-4 rounded-xl border-2 font-bold text-sm transition-all",
                        answers[q.id] === v ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white hover:border-violet-300 text-slate-600")}>
                      {v === "True" ? "✓ True" : "✗ False"}
                    </button>
                  ))}
                </div>
              )}

              {/* Short Answer / Fill in the Blank */}
              {(q.type === "Short Answer" || q.type === "Fill in the Blank") && (
                <input value={answers[q.id] || ""} onChange={e => onAnswer(q.id, e.target.value)}
                  placeholder={q.type === "Fill in the Blank" ? "Type the missing word or phrase…" : "Type your answer…"}
                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all" />
              )}

              {/* Long Answer / Essay / Diagram Based */}
              {(q.type === "Long Answer" || q.type === "Essay" || q.type === "Diagram Based") && (
                <textarea value={answers[q.id] || ""} onChange={e => onAnswer(q.id, e.target.value)}
                  placeholder={q.type === "Diagram Based" ? "Describe your diagram or answer here…" : "Write your detailed answer…"}
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none transition-all" />
              )}

              {/* Match the Following */}
              {q.type === "Match the Following" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium mb-2">Type matching answers for each item</p>
                  <textarea value={answers[q.id] || ""} onChange={e => onAnswer(q.id, e.target.value)}
                    placeholder="Format: A-1, B-3, C-2, D-4 (or describe your matches)"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none transition-all" />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button onClick={onPrev} disabled={currentQ === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => onFlag(q.id)}
                  className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
                    flagged.has(q.id) ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700")}>
                  <Flag className="w-3.5 h-3.5" /> {flagged.has(q.id) ? "Flagged" : "Flag"}
                </button>
                {currentQ === questions.length - 1 ? (
                  <button onClick={onReview}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-sm font-bold shadow-sm hover:shadow-md transition-all">
                    Review & Submit <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={onNext}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-sm font-bold shadow-sm hover:shadow-md transition-all">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Navigator */}
        <div className="w-64 bg-white border-l border-slate-200 p-4 overflow-y-auto shrink-0 hidden md:block">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Question Navigator</h3>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {questions.map((qs, i) => {
              const st = qStatus(qs.id);
              return (
                <button key={qs.id} onClick={() => onJump(i)}
                  className={cn("w-full aspect-square rounded-lg text-xs font-black flex items-center justify-center transition-all border",
                    i === currentQ ? "bg-purple-600 text-white border-purple-600 shadow-sm scale-110" :
                    st === "answered" ? "bg-emerald-500 text-white border-emerald-500" :
                    st === "review" ? "bg-amber-400 text-white border-amber-400" :
                    "bg-slate-100 text-slate-500 border-slate-200 hover:bg-violet-100 hover:border-violet-300")}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          {/* Legend */}
          <div className="space-y-1.5 text-xs">
            {[
              { color: "bg-emerald-500", label: "Answered", count: answered },
              { color: "bg-amber-400", label: "Review Later", count: reviewLater },
              { color: "bg-slate-200", label: "Not Answered", count: questions.length - answered - reviewLater },
            ].map(l => (
              <div key={l.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("w-3 h-3 rounded-sm", l.color)} />
                  <span className="text-slate-600 font-medium">{l.label}</span>
                </div>
                <span className="font-black text-slate-700">{l.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <button onClick={onReview}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold shadow-sm hover:shadow-md transition-all">
              Review & Submit
            </button>
          </div>
          {/* Auto-save notice */}
          <p className="mt-3 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" /> Auto-saving every 15s
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4: Review ─────────────────────────────────────────────────────────
function ReviewScreen({
  assessment, answers, flagged, onBack, onSubmit, onJump,
}: {
  assessment: Assessment; answers: Record<string, string>; flagged: Set<string>;
  onBack: () => void; onSubmit: () => void; onJump: (i: number) => void;
}) {
  const questions = assessment.questions ?? [];
  const answered = questions.filter(q => answers[q.id]).length;
  const review = questions.filter(q => flagged.has(q.id)).length;
  const unanswered = questions.length - answered;
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="fixed inset-0 bg-slate-50 overflow-y-auto" style={{ zIndex: 9999 }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
          <h2 className="text-lg font-black text-slate-900 mb-1">Review Your Answers</h2>
          <p className="text-sm text-slate-500">{assessment.title}</p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Answered", value: answered, color: "bg-emerald-50 border-emerald-200", v: "text-emerald-700", ic: CheckCircle2, ic2: "text-emerald-500" },
              { label: "Review Later", value: review, color: "bg-amber-50 border-amber-200", v: "text-amber-700", ic: Flag, ic2: "text-amber-500" },
              { label: "Not Answered", value: unanswered, color: "bg-slate-50 border-slate-200", v: "text-slate-600", ic: AlertCircle, ic2: "text-slate-400" },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl border p-4 text-center", s.color)}>
                <s.ic className={cn("w-5 h-5 mx-auto mb-1", s.ic2)} />
                <p className={cn("text-2xl font-black", s.v)}>{s.value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Question grid */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
          <h3 className="text-sm font-black text-slate-700 mb-4">Click any question to go back and change your answer</h3>
          <div className="grid grid-cols-8 gap-2">
            {questions.map((q, i) => {
              const st = flagged.has(q.id) ? "review" : answers[q.id] ? "answered" : "unanswered";
              return (
                <button key={q.id} onClick={() => { onBack(); onJump(i); }}
                  title={`Q${i + 1}: ${st}`}
                  className={cn("aspect-square rounded-lg text-xs font-black flex items-center justify-center border transition-all hover:scale-110",
                    st === "answered" ? "bg-emerald-500 text-white border-emerald-500" :
                    st === "review" ? "bg-amber-400 text-white border-amber-400" :
                    "bg-slate-100 text-slate-500 border-slate-200 hover:bg-red-50 hover:border-red-300")}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs">
            {[{ color: "bg-emerald-500", label: "Answered" }, { color: "bg-amber-400", label: "Review Later" }, { color: "bg-slate-200", label: "Not Answered" }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={cn("w-3 h-3 rounded-sm", l.color)} />
                <span className="text-slate-600 font-medium">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {unanswered > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">You have {unanswered} unanswered question{unanswered > 1 ? "s" : ""}</p>
              <p className="text-xs text-amber-600 mt-0.5">You can still go back and answer them before submitting.</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Test
          </button>
          <button onClick={() => setShowConfirm(true)}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> Submit Assessment
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-black text-slate-900 text-center mb-2">Submit Assessment?</h3>
            <p className="text-sm text-slate-500 text-center mb-1">You answered <strong className="text-slate-700">{answered}</strong> of <strong className="text-slate-700">{questions.length}</strong> questions.</p>
            <p className="text-xs text-red-500 text-center font-medium mb-6">Once submitted, answers cannot be changed.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={onSubmit} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white font-bold text-sm shadow-sm hover:shadow-md">Confirm Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Screen 5: Success ────────────────────────────────────────────────────────
function SuccessScreen({ assessment, submittedAt, onBack, onViewResult }: { assessment: Assessment; submittedAt: string; onBack: () => void; onViewResult: () => void }) {
  const resultsAvailable = assessment.resultsReleased || assessment.resultVisibility === "immediate" || !assessment.resultVisibility;
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-violet-50 to-white flex items-center justify-center px-6" style={{ zIndex: 9999 }}>
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
          <CheckCheck className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Assessment Submitted!</h1>
        <p className="text-slate-500 mb-6">Your responses have been recorded successfully.</p>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Assessment</span>
            <span className="font-bold text-slate-800">{assessment.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Subject</span>
            <span className="font-bold text-slate-800">{assessment.subject}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Submitted At</span>
            <span className="font-bold text-slate-800">{new Date(submittedAt).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Questions Attempted</span>
            <span className="font-bold text-slate-800">{assessment.questions?.length ?? 0}</span>
          </div>
        </div>
        {resultsAvailable ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-sm text-emerald-700 flex items-start gap-2">
            <CheckCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your score has been calculated. View your results now!</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Results will be published by your teacher. You'll be notified when they are available.</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {resultsAvailable && (
            <button onClick={onViewResult} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white font-bold text-sm shadow-sm hover:shadow-md transition-all">
              View My Results
            </button>
          )}
          <button onClick={onBack} className={cn("w-full py-3 rounded-xl font-bold text-sm transition-all", resultsAvailable ? "border border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-sm hover:shadow-md")}>
            Back to Assessments
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 6: Results ────────────────────────────────────────────────────────
function ResultsScreen({ assessment, attempt, onBack }: { assessment: Assessment; attempt: Attempt; onBack: () => void }) {
  const score = attempt.score ?? 0;
  const pct = Math.round((score / assessment.totalMarks) * 100);
  const passed = score >= assessment.passingMarks;
  const grade = gradeLabel(pct);

  // Simple topic performance derived from questions + answers
  const topicPerf = useMemo(() => {
    const topics: Record<string, { total: number; got: number }> = {};
    (assessment.questions ?? []).forEach(q => {
      const topic = q.type;
      if (!topics[topic]) topics[topic] = { total: 0, got: 0 };
      topics[topic].total += q.marks;
      const ans = attempt.answers?.[q.id];
      if (ans && q.correctAnswer && ans === q.correctAnswer) topics[topic].got += q.marks;
      else if (ans && !q.correctAnswer) topics[topic].got += q.marks; // essay/open — full marks
    });
    return Object.entries(topics).map(([k, v]) => ({ label: k, pct: v.total > 0 ? Math.round((v.got / v.total) * 100) : 0 }));
  }, [assessment, attempt]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <div className="bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-1.5 text-violet-200 hover:text-white text-sm mb-4 font-medium">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-start gap-6">
            {/* Score circle */}
            <div className="text-center bg-white/15 rounded-2xl p-5 shrink-0">
              <p className="text-[10px] text-violet-200 uppercase tracking-wider font-semibold mb-1">Score</p>
              <p className="text-4xl font-black text-white">{score}<span className="text-xl text-violet-200">/{assessment.totalMarks}</span></p>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3">
              {[
                { label: "Percentage", value: `${pct}%`, sub: pct >= 50 ? "Passing" : "Below Passing" },
                { label: "Grade", value: grade.g, sub: passed ? "PASS" : "FAIL" },
                { label: "Status", value: passed ? "PASS" : "FAIL", sub: `Passing: ${assessment.passingMarks}` },
              ].map(s => (
                <div key={s.label} className="bg-white/15 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-violet-200 uppercase tracking-wider font-semibold">{s.label}</p>
                  <p className={cn("text-3xl font-black mt-1", s.value === "PASS" ? "text-emerald-300" : s.value === "FAIL" ? "text-red-300" : "text-white")}>{s.value}</p>
                  <p className="text-[10px] text-violet-200 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-3 gap-5">
        {/* Performance by type */}
        <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-500" /> Performance by Question Type</h3>
          <div className="space-y-3">
            {topicPerf.map(t => (
              <div key={t.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">{t.label}</span>
                  <span className="font-black text-slate-800">{t.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${t.pct}%`, background: t.pct >= 70 ? "#10b981" : t.pct >= 50 ? "#f59e0b" : "#ef4444" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Summary</h3>
            {[
              { label: "Total Questions", value: assessment.questions?.length ?? 0 },
              { label: "Attempted", value: Object.values(attempt.answers ?? {}).filter(Boolean).length },
              { label: "Total Marks", value: assessment.totalMarks },
              { label: "Score", value: score },
            ].map(s => (
              <div key={s.label} className="flex justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-500">{s.label}</span>
                <span className="font-black text-slate-800">{s.value}</span>
              </div>
            ))}
          </div>
          <div className={cn("rounded-2xl border p-4 text-center", passed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
            {passed ? <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" /> : <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />}
            <p className={cn("font-black text-lg", passed ? "text-emerald-700" : "text-red-600")}>{passed ? "Congratulations!" : "Keep Trying"}</p>
            <p className={cn("text-xs mt-1", passed ? "text-emerald-600" : "text-red-500")}>{passed ? "You passed this assessment." : `You need ${assessment.passingMarks - score} more marks to pass.`}</p>
          </div>
        </div>

        {/* Teacher feedback placeholder */}
        <div className="col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Teacher Feedback</h3>
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 italic text-center">
            Feedback from {assessment.teacher || "your teacher"} will appear here once the assessment is reviewed.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 7: AI Recommendations ────────────────────────────────────────────
function AIInsights({ assessment, attempt, onBack }: { assessment: Assessment; attempt: Attempt; onBack: () => void }) {
  const score = attempt.score ?? 0;
  const pct = Math.round((score / assessment.totalMarks) * 100);
  const weak = pct < 60;
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm mb-6 font-medium">
          <ChevronLeft className="w-4 h-4" /> Back to Results
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">AI Learning Recommendations</h1>
            <p className="text-sm text-slate-500">Personalized improvement plan based on your performance</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-emerald-700 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Strong Areas</h3>
            <div className="space-y-2">
              {pct >= 70 ? (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {assessment.subject} — Good performance
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Complete more assessments to identify strengths.</p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-red-600 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Areas to Improve</h3>
            <div className="space-y-2">
              {weak ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-600 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {assessment.subject} — Needs revision
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">You scored above 60% — keep it up!</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-violet-500" /> Recommended Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: BookMarked, label: "Review Study Materials", desc: `Revisit ${assessment.chapter || assessment.subject} notes`, color: "bg-blue-50 border-blue-200 text-blue-700" },
              { icon: RotateCcw, label: "Practice Questions", desc: "Try similar question types for more practice", color: "bg-violet-50 border-violet-200 text-violet-700" },
              { icon: Users, label: "Join Study Group", desc: "Collaborate with classmates on weak topics", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
              { icon: Brain, label: "Use Flashcards", desc: "Quick revision with AI-generated flashcards", color: "bg-amber-50 border-amber-200 text-amber-700" },
            ].map(a => (
              <div key={a.label} className={cn("rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all", a.color)}>
                <a.icon className="w-5 h-5 mb-2" />
                <p className="text-sm font-bold">{a.label}</p>
                <p className="text-xs opacity-80 mt-0.5">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <Brain className="w-5 h-5" />
            <h3 className="font-black">AI Revision Plan</h3>
          </div>
          <p className="text-violet-200 text-sm leading-relaxed">
            Based on your score of <strong className="text-white">{pct}%</strong> in <strong className="text-white">{assessment.title}</strong>,
            {pct >= 80 ? " you're performing excellently! Focus on maintaining your consistency and attempting advanced practice questions." :
             pct >= 60 ? " you have a solid foundation. Revisit the topics where you lost marks and practice with similar questions." :
             " we recommend intensive revision of the core concepts in this chapter. Start with your study materials, then attempt practice questions progressively."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentAssessments() {
  const { user } = useAuth();
  const { students } = useStudents();
  const student = useMemo(() => students.find(s => s.email === user?.email || s.name === user?.displayName), [students, user]);

  const [screen, setScreen] = useState<Screen>("list");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [selected, setSelected] = useState<Assessment | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<Attempt | null>(null);

  // Test state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  // Load assessments. Student.grade is stored WITHOUT the "Grade " prefix
  // (e.g. "3"), but assessments.grade is stored WITH it (e.g. "Grade 3") —
  // a plain === never matched real records, so a published assessment could
  // silently never appear for the very section it was published to.
  useEffect(() => {
    if (!student) return;
    const canonGrade = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const canonSection = (v: any) => String(v ?? "").trim().toUpperCase();
    smartDb.getAll("assessments", undefined)
      .then((rawRows: any[]) => publishDueScheduledAssessments(rawRows ?? []))
      .then((rows: any[]) => {
        const active = (rows ?? []).filter((a: any) =>
          (a.status === "Active" || a.status === "Completed") &&
          (!a.grade || canonGrade(a.grade) === canonGrade(student.grade)) &&
          (!a.section || canonSection(a.section) === canonSection(student.section))
        ).map((a: any) => ({ ...a, questions: typeof a.questions === "string" ? JSON.parse(a.questions) : (a.questions ?? []) }));
        setAssessments(active);
      }).catch(() => {});
  }, [student]);

  // Load attempts
  useEffect(() => {
    if (!student) return;
    getAllAttempts()
      .then(rows => {
        const mine: Record<string, Attempt> = {};
        (rows ?? []).filter((r: any) => r.studentId === String(student.id) || r.studentName === student.name)
          .forEach((r: any) => {
            const a = { ...r, answers: typeof r.answers === "string" ? JSON.parse(r.answers) : (r.answers ?? {}), flagged: typeof r.flagged === "string" ? JSON.parse(r.flagged) : (r.flagged ?? []) };
            if (!mine[r.assessmentId] || r.submittedAt) mine[r.assessmentId] = a;
          });
        setAttempts(mine);
      }).catch(() => {});
  }, [student]);

  // Timer
  function startTimer(durationMinutes: number) {
    setTimeLeft(durationMinutes * 60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Auto-save every 15s
  function startAutoSave(attemptId: string) {
    autoSaveRef.current = setInterval(() => {
      setAnswers(ans => {
        setFlagged(fl => {
          smartDb.update("assessment_attempts", attemptId, {
            answers: JSON.stringify(ans),
            flagged: JSON.stringify([...fl]),
            lastSavedAt: new Date().toISOString(),
          }).catch(() => {});
          return fl;
        });
        return ans;
      });
    }, 15000);
  }

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
  }

  // Security: tab-switch detection
  useEffect(() => {
    if (screen !== "test") return;
    const onBlur = () => toast.warning("Tab switch detected. This has been logged.", { duration: 4000 });
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [screen]);

  // Browser refresh protection
  useEffect(() => {
    if (screen !== "test") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [screen]);

  // Copy-paste restriction during test
  useEffect(() => {
    if (screen !== "test") return;
    const block = (e: ClipboardEvent) => { e.preventDefault(); toast.warning("Copy/paste is disabled during the assessment."); };
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    return () => { document.removeEventListener("copy", block); document.removeEventListener("paste", block); };
  }, [screen]);

  async function handleStartTest() {
    if (!selected || !student) return;
    if (!selected.questions?.length) {
      toast.error("This assessment has no questions. Please contact your teacher.");
      return;
    }
    submittedRef.current = false;
    const attemptId = `ATT-${Date.now()}`;
    const attempt: Attempt = {
      id: attemptId,
      assessmentId: selected.id,
      studentId: String(student.id),
      studentName: student.name,
      answers: {},
      flagged: [],
      startedAt: new Date().toISOString(),
      status: "in_progress",
    };
    await smartDb.create("assessment_attempts", attempt, attemptId).catch(() => {});
    setCurrentAttempt(attempt);
    setAnswers({});
    setFlagged(new Set());
    setCurrentQ(0);
    startTimer(selected.duration);
    startAutoSave(attemptId);
    setScreen("test");
  }

  const autoSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    clearTimers();
    toast.info("Time's up! Your assessment has been auto-submitted.");
    handleSubmit();
  }, [currentAttempt, answers, flagged, selected]);

  async function handleSubmit() {
    if (!currentAttempt || !selected || !student) return;
    submittedRef.current = true;
    clearTimers();
    const submittedAt = new Date().toISOString();

    // Compute score for auto-gradable questions
    let score = 0;
    (selected.questions ?? []).forEach(q => {
      if (q.correctAnswer && answers[q.id] === q.correctAnswer) score += q.marks;
      else if (!q.correctAnswer && answers[q.id]) score += q.marks; // open-ended: full marks
    });

    const updated: Attempt = {
      ...currentAttempt,
      answers,
      flagged: [...flagged],
      submittedAt,
      score,
      status: "submitted",
    };
    await smartDb.update("assessment_attempts", currentAttempt.id, {
      answers: JSON.stringify(answers),
      flagged: JSON.stringify([...flagged]),
      submittedAt,
      score,
      status: "submitted",
    }).catch(() => {});

    setCurrentAttempt(updated);
    setAttempts(prev => ({ ...prev, [selected.id]: updated }));
    setScreen("success");
  }

  function handleStartFlow(a: Assessment) {
    setSelected(a);
    setScreen("instructions");
  }

  function handleViewResult(a: Assessment) {
    setSelected(a);
    const attempt = attempts[a.id];
    if (attempt) setCurrentAttempt(attempt);
    setScreen("results");
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  // ── Render ──
  if (screen === "list") {
    return (
      <DashboardLayout>
        <AssessmentList assessments={assessments} attempts={attempts} onStart={handleStartFlow} onViewResult={handleViewResult} />
      </DashboardLayout>
    );
  }
  if (screen === "instructions" && selected) {
    return (
      <DashboardLayout>
        <Instructions assessment={selected} onBack={() => setScreen("list")} onStart={handleStartTest} />
      </DashboardLayout>
    );
  }
  if (screen === "test" && selected) {
    return (
      <TestEnvironment
        assessment={selected} answers={answers} flagged={flagged}
        currentQ={currentQ} timeLeft={timeLeft}
        onAnswer={(qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }))}
        onFlag={qId => setFlagged(prev => { const s = new Set(prev); s.has(qId) ? s.delete(qId) : s.add(qId); return s; })}
        onNext={() => setCurrentQ(q => Math.min(q + 1, (selected.questions?.length ?? 1) - 1))}
        onPrev={() => setCurrentQ(q => Math.max(q - 1, 0))}
        onJump={i => setCurrentQ(i)}
        onReview={() => setScreen("review")}
        onBack={() => { clearTimers(); setScreen("list"); setSelected(null); }}
      />
    );
  }
  if (screen === "review" && selected) {
    return (
      <ReviewScreen
        assessment={selected} answers={answers} flagged={flagged}
        onBack={() => setScreen("test")}
        onSubmit={handleSubmit}
        onJump={i => { setCurrentQ(i); setScreen("test"); }}
      />
    );
  }
  if (screen === "success" && selected && currentAttempt) {
    return (
      <DashboardLayout>
        <SuccessScreen assessment={selected} submittedAt={currentAttempt.submittedAt!} onBack={() => setScreen("list")} onViewResult={() => setScreen("results")} />
      </DashboardLayout>
    );
  }
  if (screen === "results" && selected && currentAttempt) {
    return (
      <DashboardLayout>
        <ResultsScreen assessment={selected} attempt={currentAttempt} onBack={() => setScreen("list")} />
      </DashboardLayout>
    );
  }
  if (screen === "ai" && selected && currentAttempt) {
    return (
      <DashboardLayout>
        <AIInsights assessment={selected} attempt={currentAttempt} onBack={() => setScreen("results")} />
      </DashboardLayout>
    );
  }
  return <DashboardLayout><div /></DashboardLayout>;
}
