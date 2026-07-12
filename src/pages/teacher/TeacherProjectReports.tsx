import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileText, Edit3, CheckCircle, Clock,
  Download, Star,
  ChevronLeft, ChevronRight, Search,
} from "lucide-react";

interface ProjectReport {
  id: string; title: string; studentName: string; subject: string;
  submittedDate: string; dueDate: string;
  status: "Submitted" | "Reviewed" | "Pending" | "Late";
  grade?: string; feedback?: string; score?: number; maxScore: number;
  assignmentId: string; attachmentUrl?: string;
}

// Real data: a "Project Report" is just a TeacherAssignment of type "Project"
// plus its AssignmentSubmission rows — the same entities the real grading
// flow (SubmissionReviewCenter) uses. Grading happens there, not in a second
// forked review UI, so marks always land in the one real Gradebook sync path.
interface TeacherAssignmentRow {
  id: string; title: string; subject: string; grade: string; section: string;
  type: string; dueDate: string; totalMarks: number;
}
interface AssignmentSubmissionRow {
  id: string; assignmentId: string; studentId: string; studentName: string;
  submittedAt?: string; status: string; marks?: number; feedback?: string;
  attachments?: { name: string; size: number; url?: string }[];
}

function statusMeta(s: string) {
  switch (s) {
    case "Reviewed":  return { cls:"bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "Submitted": return { cls:"bg-blue-50 text-blue-700 border-blue-200" };
    case "Pending":   return { cls:"bg-amber-50 text-amber-700 border-amber-200" };
    case "Late":      return { cls:"bg-rose-50 text-rose-700 border-rose-200" };
    default:          return { cls:"bg-slate-100 text-slate-600 border-slate-200" };
  }
}

function norm(s: string) { return (s || "").toLowerCase().replace(/grade\s*/i, "").trim(); }

type Tab = "all" | "pending" | "submitted" | "reviewed";

const PAGE_SIZE = 6;

export default function TeacherProjectReports() {
  const { assignment } = useTeacherClass();
  const navigate = useNavigate();
  const grade   = assignment.grade   || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();

  const [reports, setReports]         = useState<ProjectReport[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>("all");
  const [q, setQ]                     = useState("");
  const [page, setPage]               = useState(1);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [assignments, submissions] = await Promise.all([
        (smartDb.getAll("TeacherAssignment") || []) as unknown as Promise<TeacherAssignmentRow[]>,
        (smartDb.getAll("AssignmentSubmission") || []) as unknown as Promise<AssignmentSubmissionRow[]>,
      ]);
      const myProjects = (assignments || []).filter(a =>
        (a.type || "").toLowerCase() === "project" &&
        norm(a.grade) === norm(grade) &&
        (!a.section || a.section.toUpperCase() === section)
      );
      const rows: ProjectReport[] = [];
      myProjects.forEach(a => {
        const subs = (submissions || []).filter(s => s.assignmentId === a.id);
        subs.forEach(s => {
          const graded = s.status === "graded" || s.status === "closed";
          const late = !!(s.submittedAt && a.dueDate && new Date(s.submittedAt) > new Date(a.dueDate));
          rows.push({
            id: s.id,
            assignmentId: a.id,
            title: a.title,
            studentName: s.studentName || "—",
            subject: a.subject || "—",
            submittedDate: s.submittedAt || "",
            dueDate: a.dueDate,
            status: graded ? "Reviewed" : late ? "Late" : "Submitted",
            feedback: s.feedback,
            score: s.marks,
            maxScore: a.totalMarks || 100,
            attachmentUrl: s.attachments?.[0]?.url,
          });
        });
      });
      setReports(rows);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [grade, section]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const filtered = reports.filter(r => {
    const matchQ = !q || r.title.toLowerCase().includes(q.toLowerCase()) || r.studentName.toLowerCase().includes(q.toLowerCase());
    if (tab === "pending")   return matchQ && (r.status === "Pending" || r.status === "Late");
    if (tab === "submitted") return matchQ && r.status === "Submitted";
    if (tab === "reviewed")  return matchQ && r.status === "Reviewed";
    return matchQ;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const reviewed   = reports.filter(r => r.status === "Reviewed").length;
  const submitted  = reports.filter(r => r.status === "Submitted").length;
  const pending    = reports.filter(r => r.status === "Pending").length;
  // Each project can have a different maxScore (whatever the assignment's
  // totalMarks was), so scores must be normalised to a % before averaging —
  // averaging raw scores directly (e.g. 366/456) against a hardcoded "/100"
  // label produced nonsense values like "309/100".
  const gradedReports = reports.filter(r => r.score != null && r.maxScore > 0);
  const avgScorePct = gradedReports.length
    ? Math.round(gradedReports.reduce((a, r) => a + (r.score! / r.maxScore) * 100, 0) / gradedReports.length)
    : null;

  const handleExport = async () => {
    if (filtered.length === 0) { toast.error("No reports to export"); return; }
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map(r => ({
        Title: r.title, Student: r.studentName, Subject: r.subject,
        Submitted: r.submittedDate || "Not submitted", Status: r.status,
        Score: r.score != null ? `${r.score}/${r.maxScore}` : "—", Feedback: r.feedback || "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "Project Reports");
      XLSX.writeFile(wb, `project_reports_${grade}_${section}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${rows.length} report(s)`);
    } catch {
      toast.error("Could not export");
    }
  };

  const handleDownload = (r: ProjectReport) => {
    if (r.attachmentUrl) {
      window.open(r.attachmentUrl, "_blank", "noopener,noreferrer");
    } else {
      toast.info("No file attached to this submission.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Project Reports</h1>
              <p className="text-sm text-slate-400">{grade} · Section {section} — Review and evaluate student projects</p>
            </div>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Total Projects",  value: reports.length,      icon: FileText,    color:"text-purple-600 bg-violet-50" },
            { label:"Reviewed",        value: reviewed,            icon: CheckCircle, color:"text-emerald-600 bg-emerald-50" },
            { label:"Awaiting Review", value: submitted,           icon: Clock,       color:"text-purple-600 bg-blue-50" },
            { label:"Avg. Score",      value: avgScorePct != null ? `${avgScorePct}%` : "—", icon: Star, color:"text-amber-600 bg-amber-50" },
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

        {/* Tabs + search */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(["all","pending","submitted","reviewed"] as Tab[]).map(t => (
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

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Project Title</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Subject</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Loading reports…</td></tr>
              )}
              {!loading && pageData.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No reports found.</td></tr>
              )}
              {pageData.map(r => {
                const meta = statusMeta(r.status);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 text-sm line-clamp-1">{r.title}</p>
                      <p className="text-xs text-slate-400">{r.submittedDate || "Not submitted"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{r.studentName}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{r.subject}</td>
                    <td className="px-4 py-3 text-center">
                      {r.score != null ? (
                        <span className="font-bold text-emerald-600">{r.score}/{r.maxScore}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", meta.cls)}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {(r.status === "Submitted" || r.status === "Late") && (
                          <button onClick={() => navigate(`/teacher/assignments/${r.assignmentId}/submissions`)}
                            className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition">
                            Review
                          </button>
                        )}
                        {r.status === "Reviewed" && (
                          <button onClick={() => navigate(`/teacher/assignments/${r.assignmentId}/submissions`)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition" title="Edit review">
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleDownload(r)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {Math.min((page-1)*PAGE_SIZE+1,filtered.length)} to {Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 font-semibold text-slate-700">{page}/{totalPages}</span>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
