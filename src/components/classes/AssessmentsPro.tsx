// Section-scoped Assessments tab for the class detail page.
// Reads the shared `assessments` table (same store the teacher Assessments
// builder writes to) and shows only the rows for THIS grade + section.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts } from "@/lib/assessmentAttempts";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck, Plus, Search, FileText, Calendar, Users,
  CheckCircle2, Clock, BarChart3, ArrowUpRight,
} from "lucide-react";

interface AssessmentRow {
  id: string; title: string; type: string; grade: string; section: string;
  subject: string; date: string; totalMarks: number; passingMarks?: number;
  submissions?: number; totalStudents?: number; status: string;
}

const TYPE_COLORS: Record<string, string> = {
  Quiz: "bg-violet-100 text-violet-700", Worksheet: "bg-orange-100 text-orange-700",
  Project: "bg-emerald-100 text-emerald-700", "Lab Assessment": "bg-teal-100 text-teal-700",
  Test: "bg-blue-100 text-blue-700", "Oral Assessment": "bg-pink-100 text-pink-700",
  Practical: "bg-amber-100 text-amber-700", Assignment: "bg-indigo-100 text-indigo-700",
};
const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700", Upcoming: "bg-blue-100 text-blue-700",
  Completed: "bg-slate-100 text-slate-600", Draft: "bg-amber-100 text-amber-700",
};

export default function AssessmentsPro({
  classData, section, semesterName,
}: {
  classData: { grade?: string; name?: string };
  section: string;
  semesterName?: string | null;
}) {
  const navigate = useNavigate();
  const [all, setAll] = useState<AssessmentRow[]>([]);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Upcoming" | "Completed" | "Draft">("all");

  useEffect(() => {
    let alive = true;
    // "Submissions" must reflect real attempts, not the stale `submissions`
    // field on the assessment row (frozen at creation, never incremented) —
    // count live rows from getAllAttempts() per assessment instead.
    Promise.all([smartDb.getAll("assessments"), getAllAttempts()]).then(([rows, attempts]: [any[], any[]]) => {
      if (!alive) return;
      const arr = Array.isArray(rows) ? rows : [];
      setAll(arr);
      const counts: Record<string, number> = {};
      for (const a of arr) counts[a.id] = attempts.filter(s => s.assessmentId === String(a.id)).length;
      setLiveCounts(counts);
    }).catch(() => setAll([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // Scope to this grade + section. "" / "All Sections" assessments show in every section.
  const scoped = useMemo(() => {
    const wantG = (classData.grade || "").toLowerCase().replace("grade ", "").trim();
    const wantS = (section || "").toUpperCase().replace("SECTION", "").trim();
    return all.filter(a => {
      const g = (a.grade || "").toLowerCase().replace("grade ", "").trim();
      if (g !== wantG) return false;
      const s = (a.section || "").toUpperCase().replace("SECTION", "").trim();
      return !s || s === "ALL SECTIONS" || s === wantS;
    });
  }, [all, classData.grade, section]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(a => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !`${a.title} ${a.subject} ${a.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scoped, search, statusFilter]);

  const stats = useMemo(() => ({
    total: scoped.length,
    active: scoped.filter(a => a.status === "Active").length,
    completed: scoped.filter(a => a.status === "Completed").length,
    submissions: scoped.reduce((sum, a) => sum + (liveCounts[a.id] ?? 0), 0),
  }), [scoped, liveCounts]);

  const kpis = [
    { label: "Total Assessments", value: stats.total, Icon: ClipboardCheck, color: "text-purple-600 bg-violet-50" },
    { label: "Active", value: stats.active, Icon: Clock, color: "text-emerald-600 bg-emerald-50" },
    { label: "Completed", value: stats.completed, Icon: CheckCircle2, color: "text-purple-600 bg-blue-50" },
    { label: "Submissions", value: stats.submissions, Icon: BarChart3, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", k.color)}><k.Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">{k.label}</p>
              <p className="text-xl font-black text-slate-900">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assessments…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#9810fa] focus:ring-2 focus:ring-violet-100" />
        </div>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {(["all", "Active", "Upcoming", "Completed", "Draft"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-3 py-2 text-[12px] font-semibold capitalize transition-colors",
                statusFilter === s ? "bg-[#9810fa] text-white" : "text-slate-500 hover:bg-slate-50")}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => navigate("/teacher/assessments")}
          className="flex items-center gap-1.5 h-10 px-4 rounded-xl gradient-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> Create Assessment
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading assessments…</div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
            <ClipboardCheck className="h-7 w-7 text-[#9810fa]" />
          </div>
          <p className="font-bold text-slate-900 mb-1">No assessments for {classData.grade} · Section {section}</p>
          <p className="text-sm text-slate-400 mb-4">Create a quiz, worksheet or test to evaluate this section.</p>
          <button onClick={() => navigate("/teacher/assessments")}
            className="flex items-center gap-2 h-9 px-5 rounded-xl gradient-primary text-white text-sm font-bold">
            <Plus className="h-4 w-4" /> Create Assessment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(a => {
            const liveSubmissions = liveCounts[a.id] ?? 0;
            const subRate = a.totalStudents ? Math.round((liveSubmissions / a.totalStudents) * 100) : 0;
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg", TYPE_COLORS[a.type] || "bg-slate-100 text-slate-600")}>{a.type}</span>
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full", STATUS_COLORS[a.status] || "bg-slate-100 text-slate-600")}>{a.status}</span>
                </div>
                <h4 className="font-black text-slate-900 text-sm leading-tight mb-1 line-clamp-2">{a.title}</h4>
                <p className="text-[11px] text-slate-400 mb-3">{a.subject}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-3 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {a.date || "—"}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {a.totalMarks} marks</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {liveSubmissions}/{a.totalStudents || 0}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-[#9810fa]" style={{ width: `${subRate}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{subRate}% submitted</span>
                  <button onClick={() => navigate("/teacher/assessments")}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#9810fa] opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
