import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts } from "@/lib/assessmentAttempts";
import { publishDueScheduledAssessments } from "@/lib/classPublishNotify";
import { cn } from "@/lib/utils";
import { ClipboardCheck, Clock, CheckCircle, AlertTriangle, Search, ChevronLeft, ChevronRight, Wifi, Users2, Star } from "lucide-react";

interface AssessmentRow {
  id: string; title: string; subject: string; type: string; date: string;
  status: "Upcoming" | "Awaiting Marks" | "Graded" | "Missed";
  grade?: string; score?: number; totalMarks?: number;
}

function statusMeta(s: string) {
  switch (s) {
    case "Graded":        return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "Awaiting Marks":return { cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "Upcoming":       return { cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "Missed":         return { cls: "bg-rose-50 text-rose-700 border-rose-200" };
    default:               return { cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

// Real assessments (quizzes/tests/exams) published via the teacher/admin
// Assessments module — status must come from the child's real
// assessment_attempts row, not the assessment date alone, otherwise a
// graded test would still show as "Upcoming" forever.
function mapAssessment(a: any, attempt?: any): AssessmentRow {
  const now = new Date();
  const testDate = a.date ? new Date(a.date) : null;
  let status: AssessmentRow["status"];
  if (attempt?.isMarked || attempt?.score != null) status = "Graded";
  else if (attempt) status = "Awaiting Marks";
  else status = testDate && testDate < now ? "Missed" : "Upcoming";
  return {
    id: a.id,
    title: a.title || "Assessment",
    subject: a.subject || "General",
    type: a.type || "Test",
    date: a.date || "—",
    status,
    grade: a.grade || undefined,
    score: attempt?.score ?? undefined,
    totalMarks: a.totalMarks || undefined,
  };
}

// Student.grade is stored WITHOUT the "Grade " prefix (e.g. "3"), but
// assessments.grade is stored WITH it (e.g. "Grade 3") — a plain === never
// matches real records.
function canonGrade(v: any): string {
  return String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}
function canonSection(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

type Tab = "all" | "upcoming" | "awaiting" | "graded";
const PAGE_SIZE = 6;

export default function ParentAssessments() {
  const { selected, loading } = useParentChildren();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [liveData, setLiveData] = useState<AssessmentRow[] | null>(null);

  useEffect(() => {
    setLiveData(null);
    if (!selected) return;
    Promise.all([
      smartDb.getAll("assessments").catch(() => []),
      getAllAttempts().catch(() => []),
    ]).then(([rawRows, attempts]) => publishDueScheduledAssessments(rawRows || []).then(rows => [rows, attempts] as const))
      .then(([rows, attempts]) => {
      const wantG = canonGrade(selected.grade);
      const wantS = canonSection(selected.section);
      const myAttempts = (attempts || []).filter((at: any) => String(at.studentId) === String(selected.id));
      // Only actually-published assessments are visible — "Upcoming" here
      // means scheduled-but-not-yet-live (see the teacher Assessments
      // "Schedule for later" flow), not something a parent should see early.
      const mine = (rows || []).filter((a: any) =>
        (a.status === "Active" || a.status === "Completed") &&
        canonGrade(a.grade) === wantG && (!a.section || canonSection(a.section) === wantS)
      ).map((a: any) => mapAssessment(a, myAttempts.find((at: any) => String(at.assessmentId) === String(a.id))));
      setLiveData(mine);
    }).catch(() => {});
  }, [selected?.id, selected?.grade, selected?.section]);

  const all = liveData ?? [];
  const filtered = all.filter(a => {
    const matchTab = tab === "all" ? true :
      tab === "upcoming" ? a.status === "Upcoming" :
      tab === "awaiting" ? a.status === "Awaiting Marks" : a.status === "Graded";
    const matchQ = !q || a.title.toLowerCase().includes(q.toLowerCase()) || a.subject.toLowerCase().includes(q.toLowerCase());
    return matchTab && matchQ;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const upcoming = all.filter(a => a.status === "Upcoming").length;
  const awaiting = all.filter(a => a.status === "Awaiting Marks").length;
  const graded   = all.filter(a => a.status === "Graded").length;
  const missed   = all.filter(a => a.status === "Missed").length;

  if (loading) {
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
              <ClipboardCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Assessments</h1>
              <p className="text-sm text-slate-400">{selected.name} — {selected.grade} · Section {selected.section}</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Upcoming",      value: upcoming, icon: Clock,         color: "text-amber-600 bg-amber-50" },
            { label: "Awaiting Marks",value: awaiting, icon: CheckCircle,   color: "text-purple-600 bg-blue-50" },
            { label: "Graded",        value: graded,   icon: Star,         color: "text-emerald-600 bg-emerald-50" },
            { label: "Missed",        value: missed,   icon: AlertTriangle,color: "text-rose-600 bg-rose-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs border",
          all.length > 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-amber-50 border-amber-200 text-amber-700")}>
          {all.length > 0 ? <Wifi className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
          {all.length > 0
            ? `Live assessments from ${selected.grade} · Section ${selected.section} teacher records.`
            : "No assessments published yet for this class."}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(["all", "upcoming", "awaiting", "graded"] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition",
                  tab === t ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search…"
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 w-48" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {pageData.length === 0 && <div className="py-12 text-center text-slate-400">No assessments found.</div>}
            {pageData.map(a => {
              const meta = statusMeta(a.status);
              return (
                <div key={a.id} className="px-5 py-4 flex items-start gap-3 hover:bg-slate-50 transition">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ClipboardCheck className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                      <span>{a.subject}</span>
                      <span>{a.type}</span>
                      <span>Date: {a.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {a.score != null && (
                      <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                        {a.score}{a.totalMarks ? `/${a.totalMarks}` : ""}
                      </span>
                    )}
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", meta.cls)}>{a.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 font-semibold text-slate-700">{page}/{totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
