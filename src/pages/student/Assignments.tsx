import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FileText, Clock, CheckCircle2, Star, ChevronRight, ChevronLeft,
  Monitor, FlaskConical, Calculator, Map as MapIcon, Code2, BookOpen,
  HelpCircle, MessageSquare, CalendarDays,
  X, UploadCloud, Send, Paperclip, Link2, Download, Palette, Dumbbell,
  Scroll, Atom, Microscope, TestTube2,
} from "lucide-react";

interface Assignment {
  id: string;
  title: string;
  subject: string;
  type: string;
  chapter?: string;
  dueDate: string;
  totalMarks?: number;
  grade?: string | number;
  section?: string;
  instructions?: string;
  attachments?: { name: string; size: number; type?: string; url?: string }[];
  links?: { url: string; label: string }[];
}

interface Submission {
  id?: string;
  assignmentId: string;
  studentId: string;
  submittedAt: string;
  marks?: number;
  feedback?: string;
  status?: string;
  content?: string;
  attachments?: any[];
}

type Tab = "all" | "upcoming" | "submitted" | "graded";

// Keyed by normalized (lowercased, trimmed) subject name so real records
// created with slightly different labels than this list — "PE" vs "Physical
// Education", "Computer" vs "Computer Science", "Geography" as its own
// subject rather than folded into "Social Studies" — still resolve to a
// relevant icon instead of silently falling back to the generic one. Covers
// every subject in CreateAssignment.tsx's SUBJECTS list plus the common
// short forms used elsewhere in the app (TeacherAssignments.tsx's own
// abbreviated subject list).
const SUBJECT_ICON: Record<string, { icon: any; bg: string; ic: string }> = {
  mathematics: { icon: Calculator, bg: "bg-purple-50", ic: "text-purple-600" },
  math: { icon: Calculator, bg: "bg-purple-50", ic: "text-purple-600" },
  science: { icon: FlaskConical, bg: "bg-emerald-50", ic: "text-emerald-600" },
  biology: { icon: Microscope, bg: "bg-emerald-50", ic: "text-emerald-600" },
  physics: { icon: Atom, bg: "bg-cyan-50", ic: "text-cyan-600" },
  chemistry: { icon: TestTube2, bg: "bg-teal-50", ic: "text-teal-600" },
  english: { icon: BookOpen, bg: "bg-indigo-50", ic: "text-indigo-600" },
  arabic: { icon: BookOpen, bg: "bg-rose-50", ic: "text-rose-600" },
  "islamic studies": { icon: BookOpen, bg: "bg-orange-50", ic: "text-orange-600" },
  islamic: { icon: BookOpen, bg: "bg-orange-50", ic: "text-orange-600" },
  "social studies": { icon: MapIcon, bg: "bg-amber-50", ic: "text-amber-600" },
  social: { icon: MapIcon, bg: "bg-amber-50", ic: "text-amber-600" },
  geography: { icon: MapIcon, bg: "bg-amber-50", ic: "text-amber-600" },
  history: { icon: Scroll, bg: "bg-amber-50", ic: "text-amber-700" },
  "computer science": { icon: Monitor, bg: "bg-blue-50", ic: "text-blue-600" },
  computer: { icon: Monitor, bg: "bg-blue-50", ic: "text-blue-600" },
  ict: { icon: Monitor, bg: "bg-blue-50", ic: "text-blue-600" },
  art: { icon: Palette, bg: "bg-pink-50", ic: "text-pink-600" },
  "art & craft": { icon: Palette, bg: "bg-pink-50", ic: "text-pink-600" },
  "physical education": { icon: Dumbbell, bg: "bg-lime-50", ic: "text-lime-600" },
  pe: { icon: Dumbbell, bg: "bg-lime-50", ic: "text-lime-600" },
};
function subjectVisual(subject: string) {
  const key = (subject || "").trim().toLowerCase();
  return SUBJECT_ICON[key] || { icon: Code2, bg: "bg-slate-50", ic: "text-slate-600" };
}

const WHATS_NEXT: { title: string; type: string; date: string; time: string; bg: string; ic: string; icon: any }[] = [];

const TODAY_DAY = new Date().getDate();

function fmtDue(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fmtSize(bytes: number) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Files and links the teacher attached when publishing the assignment —
// previously fetched and typed but never rendered anywhere on this page, so
// a student had no way to open a file their teacher had genuinely attached.
function TeacherResources({ assignment }: { assignment: Assignment }) {
  const files = assignment.attachments || [];
  const links = assignment.links || [];
  if (files.length === 0 && links.length === 0) return null;
  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5" /> Attached by your teacher
      </p>
      {files.map((f, i) => (
        f.url ? (
          <a key={i} href={f.url} download={f.name}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-purple-300 hover:bg-purple-50 transition-colors group">
            <span className="text-slate-700 truncate flex-1 font-medium">{f.name}</span>
            <span className="text-slate-400 mr-2">{fmtSize(f.size)}</span>
            <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0" />
          </a>
        ) : (
          <div key={i} className="flex items-center justify-between bg-white border border-dashed border-slate-200 rounded-lg px-3 py-2 text-xs">
            <span className="text-slate-500 truncate flex-1">{f.name}</span>
            <span className="text-slate-400">File unavailable</span>
          </div>
        )
      ))}
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-purple-300 hover:bg-purple-50 transition-colors group">
          <Link2 className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0" />
          <span className="text-purple-700 font-medium truncate">{l.label || l.url}</span>
        </a>
      ))}
    </div>
  );
}

export default function StudentAssignments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students } = useStudents();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tab, setTab] = useState<Tab>("all");

  // Submit modal state
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submitText, setSubmitText] = useState("");
  const [submitFiles, setSubmitFiles] = useState<{name:string;size:number;url:string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitFileRef = useRef<HTMLInputElement>(null);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  useEffect(() => {
    const s = student as any;
    if (!s) return;
    const uid = s.id || s.uid || "";
    Promise.all([
      smartDb.getAll("TeacherAssignment", undefined),
      smartDb.getAll("AssignmentSubmission", undefined),
    ]).then(([asmts, subs]) => {
      // Student.grade is stored WITHOUT the "Grade " prefix (e.g. "3"), but
      // TeacherAssignment.grade is stored WITH it (e.g. "Grade 3") — a plain
      // == never matches real records, so no published assignment ever
      // showed up here. Canonicalize both sides before comparing.
      const canon = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
      // Only published assignments are visible to students — Draft/Upcoming
      // (scheduled-for-later) rows aren't live yet.
      const filtered = (asmts || []).filter((a: any) =>
        a.status === "Active" &&
        canon(a.grade) === canon(s.grade) &&
        (!a.section || String(a.section).trim().toUpperCase() === String(s.section || "").trim().toUpperCase())
      );
      filtered.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setAssignments(filtered);
      setSubmissions((subs || []).filter((s2: any) => s2.studentId === uid));
    }).catch(() => {});
  }, [student]);

  const hasRealData = assignments.length > 0;
  const getSubmission = (id: string) => submissions.find(s => s.assignmentId === id);

  // ── Submit file handler ───────────────────────────────────────────────
  function handleSubmitFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setSubmitFiles(prev => [...prev, { name: file.name, size: file.size, url: ev.target?.result as string }]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  // ── Submit handler ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedAssignment || !student) return;
    setIsSubmitting(true);
    try {
      const uid = (student as any).id || (student as any).uid || "";
      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const sub = {
        id, assignmentId: selectedAssignment.id,
        studentId: uid, studentName: (student as any).name || (student as any).displayName || "",
        grade: (student as any).grade || (student as any).gradeLevel || "",
        section: (student as any).section || "",
        submittedAt: new Date().toISOString(),
        content: submitText,
        attachments: submitFiles.map(f => ({name: f.name, size: f.size, url: f.url || ""})),
        status: "submitted",
      };
      await smartDb.create("AssignmentSubmission", sub as any, id);
      toast.success("Assignment submitted successfully!");
      setSelectedAssignment(null);
      setSubmitText(""); setSubmitFiles([]);
      // Refresh submissions
      const newSubs = await smartDb.getAll("AssignmentSubmission", undefined);
      setSubmissions((newSubs || []).filter((s: any) => s.studentId === uid));
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Unified row shape rendered everywhere on the page ─────────────────
  type Row = Assignment & {
    status: "due" | "upcoming" | "overdue";
    weekday: string;
    chapter: string;
    submitted: boolean;
    graded: boolean;
    resubmissionRequested: boolean;
    resubmissionNote?: string;
    grade?: string;
    submittedDate?: string;
    subStatus?: string;
  };

  // Build the canonical list of rows from real data when present, else demo.
  const allRows: Row[] = useMemo(() => {
    if (hasRealData) {
      return assignments.map(a => {
        const sub = getSubmission(a.id);
        const d = new Date(a.dueDate);
        const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
        const submitted = !!sub && sub.status !== "resubmission_requested";
        const status: "due" | "upcoming" | "overdue" =
          !submitted && diff < 0 ? "overdue" : diff <= 3 ? "due" : "upcoming";
        return {
          id: a.id, subject: a.subject, title: a.title, type: a.type,
          chapter: a.chapter || "—",
          dueDate: (a.dueDate || "").slice(0, 10),
          totalMarks: a.totalMarks,
          instructions: a.instructions,
          attachments: a.attachments,
          links: a.links,
          weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
          status,
          submitted,
          graded: sub?.marks !== undefined && sub.status !== "resubmission_requested",
          resubmissionRequested: sub?.status === "resubmission_requested",
          resubmissionNote: sub?.status === "resubmission_requested" ? (sub as any).resubmissionNote : undefined,
          grade: sub?.marks !== undefined ? String(sub?.marks) : undefined,
          submittedDate: sub?.submittedAt
            ? new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : undefined,
          subStatus: sub?.status,
        };
      });
    }
    return [];
  }, [assignments, submissions, hasRealData]);

  // ── Tab-filtered rows (drives the visible list) ───────────────────────
  const tabRows = useMemo(() => {
    switch (tab) {
      case "upcoming": return allRows.filter(r => !r.submitted);
      case "submitted": return allRows.filter(r => r.submitted && !r.graded);
      case "graded": return allRows.filter(r => r.graded);
      default: return allRows;
    }
  }, [allRows, tab]);

  // ── KPI counts derived from the same source array as the list ─────────
  const counts = useMemo(() => {
    const submitted = allRows.filter(r => r.submitted && !r.graded).length;
    const graded = allRows.filter(r => r.graded).length;
    const overdue = allRows.filter(r => r.status === "overdue").length;
    const upcoming = allRows.filter(r => !r.submitted && r.status !== "overdue").length;
    return { total: allRows.length, upcoming, submitted, graded, overdue };
  }, [allRows]);

  // Rows shown in the "Upcoming Assignments" card = the not-yet-submitted ones.
  const upcomingRows = useMemo(() => allRows.filter(r => !r.submitted), [allRows]);

  // "Recently Submitted" derived from real submissions, else demo.
  const recentRows = useMemo(() => {
    const subs = allRows.filter(r => r.submitted);
    return subs.slice(0, 4);
  }, [allRows]);

  // "What's Next?" derived from soonest upcoming, else demo list.
  const whatsNext = useMemo(() => {
    if (hasRealData && upcomingRows.length) {
      return upcomingRows.slice(0, 3).map(r => {
        const v = subjectVisual(r.subject);
        return {
          title: r.title, type: r.type,
          date: r.dueDate ? fmtDue(r.dueDate) : "—", time: "11:59 PM",
          bg: v.bg, ic: v.ic, icon: v.icon,
        };
      });
    }
    return WHATS_NEXT;
  }, [hasRealData, upcomingRows]);

  const TAB_EMPTY: Record<Tab, string> = {
    all: "No assignments yet.",
    upcoming: "Nothing upcoming — you're all caught up!",
    submitted: "No submitted assignments awaiting grades.",
    graded: "No graded assignments yet.",
  };

  const KPIS = [
    { value: counts.total, label: "Total Assignments", sub: "All Subjects", bg: "bg-purple-50", chip: "bg-purple-100", ic: "text-purple-600", icon: FileText },
    { value: counts.upcoming, label: "Upcoming", sub: "Due Soon", bg: "bg-amber-50", chip: "bg-amber-100", ic: "text-amber-600", icon: Clock },
    { value: counts.submitted, label: "Submitted", sub: "Completed", bg: "bg-emerald-50", chip: "bg-emerald-100", ic: "text-emerald-600", icon: CheckCircle2 },
    { value: counts.graded, label: "Graded", sub: "Reviewed", bg: "bg-rose-50", chip: "bg-rose-100", ic: "text-rose-600", icon: Star },
  ];

  const TABS: { k: Tab; label: string }[] = [
    { k: "all", label: "All Assignments" },
    { k: "upcoming", label: "Upcoming" },
    { k: "submitted", label: "Submitted" },
    { k: "graded", label: "Graded" },
  ];

  // ── Donut (Tasks Summary) ─────────────────────────────────────────────
  const donutSegs = [
    { label: "Upcoming", value: counts.upcoming, color: "#3b82f6" },
    { label: "Submitted", value: counts.submitted, color: "#10b981" },
    { label: "Graded", value: counts.graded, color: "#8b5cf6" },
    { label: "Overdue", value: counts.overdue, color: "#f43f5e" },
  ];
  const donutTotal = donutSegs.reduce((s, x) => s + x.value, 0) || 1;
  const R = 40, C = 2 * Math.PI * R;
  let donutOffset = 0;

  // ── Calendar (navigable, defaults to current month) ────────────────────
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const calLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const now0 = new Date();
  const isCurrentMonth = viewMonth.getFullYear() === now0.getFullYear() && viewMonth.getMonth() === now0.getMonth();
  // Real due-date dots for the viewed month, derived from the same rows the
  // list/KPIs use — previously a permanently-empty static array, so no due
  // date ever showed regardless of what was actually assigned.
  const dueDays = useMemo(() => {
    const days = new Set<number>();
    allRows.forEach(r => {
      if (!r.dueDate) return;
      const d = new Date(r.dueDate + "T00:00:00");
      if (d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth()) days.add(d.getDate());
    });
    return days;
  }, [allRows, viewMonth]);
  const calCells = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    return cells;
  }, [viewMonth]);
  const shiftMonth = (delta: number) =>
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Assignments</h1>
              <p className="text-sm text-slate-400">Stay organized and never miss an assignment.</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k, i) => (
            <div key={i} className={cn("rounded-2xl p-5 flex items-center justify-between", k.bg)}>
              <div>
                <p className="text-3xl font-bold text-slate-900 leading-none">{k.value}</p>
                <p className="text-sm font-semibold text-slate-700 mt-2">{k.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
              </div>
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", k.chip)}>
                <k.icon className={cn("h-6 w-6", k.ic)} />
              </div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* LEFT (3/4) */}
          <div className="lg:col-span-3 space-y-5">

            {/* Assignments list (tab-filtered) */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 text-base">{TABS.find(t => t.k === tab)?.label}</h2>
                <button onClick={() => setTab("all")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="divide-y divide-slate-50">
                {tabRows.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-slate-400">{TAB_EMPTY[tab]}</div>
                )}
                {tabRows.map(row => {
                  const v = subjectVisual(row.subject);
                  return (
                    <div key={row.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", v.bg)}>
                        <v.icon className={cn("h-5 w-5", v.ic)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{row.subject}</p>
                        <p className="font-bold text-slate-900 text-sm truncate">{row.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{row.type}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{row.chapter}</span>
                          {((row.attachments?.length || 0) + (row.links?.length || 0)) > 0 && (
                            <span title="Has attachments" className="flex items-center text-slate-400"><Paperclip className="h-3 w-3" /></span>
                          )}
                        </div>
                      </div>
                      <div className="hidden sm:block text-right flex-shrink-0">
                        {row.submitted ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700">Submitted{row.submittedDate ? `: ${row.submittedDate}` : ""}</p>
                            <p className="text-[11px] text-slate-400">{row.graded ? `Grade ${row.grade}` : "Awaiting grade"}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-slate-700">Due{row.dueDate ? `: ${fmtDue(row.dueDate)}` : ""}</p>
                            <p className="text-[11px] text-slate-400">{row.weekday}</p>
                          </>
                        )}
                      </div>
                      <span className={cn("hidden sm:inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0",
                        row.resubmissionRequested ? "bg-orange-100 text-orange-700"
                          : row.graded ? "bg-violet-100 text-violet-700"
                          : row.submitted ? "bg-emerald-100 text-emerald-700"
                          : row.status === "overdue" ? "bg-rose-100 text-rose-700"
                          : row.status === "due" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
                        {row.resubmissionRequested ? "⚠ Resubmit Required"
                          : row.graded ? "Graded"
                          : row.submitted ? "Submitted"
                          : row.status === "overdue" ? "Overdue"
                          : row.status === "due" ? "Due Soon" : "Upcoming"}
                      </span>
                      <button
                        onClick={() => { setSelectedAssignment(row as any); setSubmitText(""); setSubmitFiles([]); }}
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-purple-50 hover:text-purple-600 transition-colors flex-shrink-0">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-4 border-t border-slate-100 flex justify-center">
                <button onClick={() => setTab("all")}
                  className="h-9 px-5 rounded-lg border border-purple-200 text-sm font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
                  View All Assignments
                </button>
              </div>
            </div>

            {/* Recently Submitted */}
            <div>
              <h2 className="font-bold text-slate-900 text-base mb-3">Recently Submitted</h2>
              {recentRows.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center text-sm text-slate-400">
                  Nothing submitted yet.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {recentRows.map(r => {
                  const v = subjectVisual(r.subject);
                  const graded = r.graded;
                  return (
                    <div key={r.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", v.bg)}>
                          <v.icon className={cn("h-5 w-5", v.ic)} />
                        </div>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                          graded ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                          {graded ? `Graded ${r.grade ?? ""}`.trim() : "Submitted"}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{r.subject}</p>
                      <p className="font-bold text-slate-900 text-sm leading-snug mt-0.5">{r.title}</p>
                      {r.submittedDate && <p className="text-[11px] text-slate-400 mt-2">Submitted on {r.submittedDate}</p>}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>

          {/* RIGHT sidebar (1/4) */}
          <div className="space-y-5">

            {/* Calendar */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Calendar</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => shiftMonth(-1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => shiftMonth(1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-center text-xs font-semibold text-slate-700 mb-2">{calLabel}</p>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                  <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const isToday = isCurrentMonth && day === TODAY_DAY;
                  const isDue = dueDays.has(day);
                  return (
                    <div key={i}
                      className={cn("relative aspect-square rounded-lg text-[11px] font-semibold flex items-center justify-center",
                        isToday ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                      {day}
                      {isDue && !isToday && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-purple-500" />}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-slate-50 text-[9px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-600" /> Today</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Due Date</span>
              </div>
            </div>

            {/* Tasks Summary donut */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Tasks Summary</h3>
                <button onClick={() => setTab("all")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                    {donutSegs.map((seg, i) => {
                      const len = (seg.value / donutTotal) * C;
                      const el = (
                        <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={seg.color} strokeWidth="12"
                          strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-donutOffset}
                          transform="rotate(-90 50 50)" />
                      );
                      donutOffset += len;
                      return el;
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-900">{counts.total}</span>
                    <span className="text-[9px] text-slate-400 leading-none">Total</span>
                  </div>
                </div>
                <div className="space-y-1.5 flex-1">
                  {donutSegs.map(seg => (
                    <div key={seg.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
                        {seg.label}
                      </span>
                      <span className="font-bold text-slate-900">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* What's Next? */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-purple-600" /> What's Next?
              </h3>
              <div className="space-y-3">
                {whatsNext.map((w, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", w.bg)}>
                      <w.icon className={cn("h-4 w-4", w.ic)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{w.title}</p>
                      <p className="text-[11px] text-slate-400">{w.type}</p>
                      <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{w.date} · {w.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Need Help? */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-purple-600" /> Need Help?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                If you have any questions about assignments, deadlines or submissions, contact your teacher.
              </p>
              <button onClick={() => navigate("/communication/messages")}
                className="mt-3 w-full h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                <MessageSquare className="h-4 w-4" /> Message Teacher
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Submit Assignment Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedAssignment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">{selectedAssignment.subject}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{selectedAssignment.title}</h3>
                <p className="text-sm text-slate-400">Due: {selectedAssignment.dueDate ? fmtDue(selectedAssignment.dueDate) : "—"} · {selectedAssignment.totalMarks || 0} marks</p>
              </div>
              <button onClick={() => setSelectedAssignment(null)} className="p-1.5 rounded-lg hover:bg-slate-100 mt-1">
                <X className="h-4 w-4 text-slate-400"/>
              </button>
            </div>

            {(() => {
              const sub = getSubmission(selectedAssignment.id);
              if (sub?.status === "resubmission_requested") {
                /* Resubmission required — let student resubmit */
                return (
                  <>
                    <div className="px-6 py-4 bg-orange-50 border-b border-orange-100">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                          <Send className="h-5 w-5 text-orange-600"/>
                        </div>
                        <div>
                          <h4 className="font-bold text-orange-900">Resubmission Required</h4>
                          <p className="text-sm text-orange-700 mt-0.5">Your teacher has requested you to resubmit this assignment.</p>
                          {(sub as any).resubmissionNote && (
                            <div className="mt-2 bg-white border border-orange-200 rounded-xl p-3">
                              <p className="text-xs font-semibold text-orange-600 mb-1">Teacher's Note</p>
                              <p className="text-sm text-slate-700">{(sub as any).resubmissionNote}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                      {(selectedAssignment as any).instructions && (
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-slate-500 mb-1">Instructions</p>
                          <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: (selectedAssignment as any).instructions}}/>
                        </div>
                      )}
                      <TeacherResources assignment={selectedAssignment} />
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Your Updated Response</label>
                        <textarea value={submitText} onChange={e => setSubmitText(e.target.value)} rows={5}
                          placeholder="Write your updated answer here..."
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Attach Files <span className="text-slate-400 font-normal">(Optional)</span></label>
                        <div onClick={() => submitFileRef.current?.click()} onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(f => { const r=new FileReader(); r.onload=ev=>setSubmitFiles(p=>[...p,{name:f.name,size:f.size,url:ev.target?.result as string}]); r.readAsDataURL(f); }); }}
                          className="border-2 border-dashed border-orange-200 rounded-xl p-5 text-center cursor-pointer hover:bg-orange-50 transition-colors">
                          <UploadCloud className="h-6 w-6 text-orange-400 mx-auto mb-1.5"/>
                          <p className="text-sm text-slate-500">Click to upload or drag &amp; drop</p>
                        </div>
                        <input type="file" ref={submitFileRef} multiple onChange={handleSubmitFileChange} className="hidden"/>
                        {submitFiles.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {submitFiles.map((f, i) => (
                              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
                                <span className="text-slate-600 truncate flex-1">{f.name}</span>
                                <button onClick={() => setSubmitFiles(p => p.filter((_,j) => j !== i))} className="ml-2 text-slate-400 hover:text-rose-500">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                      <button onClick={() => setSelectedAssignment(null)} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                      <button onClick={handleSubmit} disabled={isSubmitting || (!submitText.trim() && submitFiles.length === 0)}
                        className="h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-1.5">
                        {isSubmitting ? "Submitting..." : (<><Send className="h-3.5 w-3.5"/> Resubmit Assignment</>)}
                      </button>
                    </div>
                  </>
                );
              }
              if (sub) {
                /* Already submitted view */
                return (
                  <div className="px-6 py-8 text-center">
                    <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600"/>
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">Already Submitted</h4>
                    <p className="text-sm text-slate-400">You submitted this assignment on {new Date(sub.submittedAt).toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"})}</p>
                    {sub.marks !== undefined && (
                      <div className="mt-4 inline-flex items-center gap-2 bg-emerald-50 px-4 py-2.5 rounded-xl">
                        <Star className="h-4 w-4 text-emerald-600"/>
                        <span className="text-emerald-700 font-bold text-sm">Score: {sub.marks} / {selectedAssignment.totalMarks}</span>
                      </div>
                    )}
                    {sub.feedback && (
                      <div className="mt-3 bg-blue-50 rounded-xl p-3 text-left">
                        <p className="text-xs font-semibold text-purple-600 mb-1">Teacher Feedback</p>
                        <p className="text-sm text-slate-700">{sub.feedback}</p>
                      </div>
                    )}
                    <div className="mt-3 text-left">
                      <TeacherResources assignment={selectedAssignment} />
                    </div>
                    <button onClick={() => setSelectedAssignment(null)} className="mt-4 h-10 px-6 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">Close</button>
                  </div>
                );
              }
              return (
              /* Submit form */
              <>
                <div className="px-6 py-5 space-y-4">
                  {(selectedAssignment as any).instructions && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Instructions</p>
                      <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: (selectedAssignment as any).instructions}}/>
                    </div>
                  )}
                  <TeacherResources assignment={selectedAssignment} />
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Your Answer / Response</label>
                    <textarea value={submitText} onChange={e => setSubmitText(e.target.value)} rows={5}
                      placeholder="Write your answer here..."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"/>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Attach Files <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <div
                      onClick={() => submitFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(f => { const r=new FileReader(); r.onload=ev=>setSubmitFiles(p=>[...p,{name:f.name,size:f.size,url:ev.target?.result as string}]); r.readAsDataURL(f); }); }}
                      className="border-2 border-dashed border-purple-200 rounded-xl p-5 text-center cursor-pointer hover:bg-purple-50 transition-colors">
                      <UploadCloud className="h-6 w-6 text-purple-400 mx-auto mb-1.5"/>
                      <p className="text-sm text-slate-500">Click to upload or drag &amp; drop</p>
                      <p className="text-xs text-slate-400 mt-0.5">PDF, DOC, JPG, PNG (max 50MB)</p>
                    </div>
                    <input type="file" ref={submitFileRef} multiple onChange={handleSubmitFileChange} className="hidden"/>
                    {submitFiles.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {submitFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
                            <span className="text-slate-600 truncate flex-1">{f.name}</span>
                            <button onClick={() => setSubmitFiles(p => p.filter((_,j) => j !== i))} className="ml-2 text-slate-400 hover:text-rose-500">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={() => setSelectedAssignment(null)} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                  <button onClick={handleSubmit} disabled={isSubmitting || (!submitText.trim() && submitFiles.length === 0)}
                    className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-1.5">
                    {isSubmitting ? "Submitting..." : (<><Send className="h-3.5 w-3.5"/> Submit Assignment</>)}
                  </button>
                </div>
              </>
            );
            })()}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
