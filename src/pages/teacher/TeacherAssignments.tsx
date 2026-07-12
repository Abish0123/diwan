import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useActiveSubjectAssignment } from "@/hooks/useActiveSubject";
import { SubjectContextBar } from "@/components/teacher/SubjectContextBar";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  ClipboardList, FileText, Plus, ChevronRight, ChevronLeft,
  Eye, Edit2, Trash2, RefreshCw,
  Download, Clock, GraduationCap,
  Calculator, FlaskConical, BookOpen, Monitor, Map as MapIcon, Dumbbell,
} from "lucide-react";

const SUBJECTS = ["Mathematics", "English", "Science", "Arabic", "Islamic", "Social", "Computer", "PE"];
const TYPES = ["Homework", "Project", "Essay", "Lab Report", "Presentation", "Quiz"];

// Matches SubmissionReviewCenter.tsx's own normalization exactly — that page
// already computes real submission counts correctly; this file previously
// didn't compute them at all (see the hardcoded 32/0 this replaces).
const normGrade = (g: string) => (g || "").toLowerCase().replace(/grade\s*/i, "").trim();
const normSection = (s: string) => (s || "").toLowerCase().replace(/section\s*/i, "").trim();

interface Assignment {
  id: string;
  title: string;
  subject: string;
  type: string;
  dueDate: string;
  totalMarks: number;
  instructions: string;
  grade: string;
  section: string;
  createdAt: string;
  status?: string;
}

const SUBJECT_BADGE: Record<string, string> = {
  Mathematics: "bg-purple-50 text-purple-600",
  Science: "bg-emerald-50 text-emerald-600",
  English: "bg-blue-50 text-purple-600",
  Islamic: "bg-teal-50 text-teal-600",
  Arabic: "bg-pink-50 text-pink-600",
  Social: "bg-amber-50 text-amber-600",
  Computer: "bg-indigo-50 text-purple-600",
  PE: "bg-rose-50 text-rose-600",
};

// Row icon was hardcoded to FileText for every subject — matches the same
// "irrelevant icon" complaint fixed on the student assignments page.
const SUBJECT_ICON: Record<string, any> = {
  Mathematics: Calculator, Science: FlaskConical, English: BookOpen,
  Islamic: BookOpen, Arabic: BookOpen, Social: MapIcon, Computer: Monitor, PE: Dumbbell,
};
function subjectIcon(subject: string) {
  return SUBJECT_ICON[subject] || FileText;
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Closed: "bg-slate-100 text-slate-600",
  Draft: "bg-blue-100 text-blue-700",
  Upcoming: "bg-purple-100 text-purple-700",
};

interface Row {
  id: string;
  title: string;
  desc: string;
  subject: string;
  assignedDate: string;
  assignedTime: string;
  dueDate: string;
  dueTime: string;
  submitted: number;
  total: number;
  pct: number;
  status: string;
}


const AVATAR_COLORS = [
  "bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500",
  "bg-sky-500", "bg-rose-500", "bg-violet-500", "bg-teal-500",
];
function StudentAvatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = name.charAt(0).toUpperCase() + (name.split(" ")[1]?.charAt(0).toUpperCase() || "");
  return (
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", color)}>
      {initials}
    </div>
  );
}

type Tab = "all" | "drafts" | "active" | "closed";

export default function TeacherAssignments() {
  const navigate = useNavigate();
  const { assignment } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const [activeSubject, setActiveSubject] = useActiveSubjectAssignment(mySubjects);

  const grade   = activeSubject?.grade   || assignment.grade   || "Grade 5";
  const section = (activeSubject?.section || assignment.section || "B").toUpperCase();
  const className = activeSubject
    ? `${activeSubject.grade} · Sec ${activeSubject.section} · ${activeSubject.subject}`
    : assignment.className || `${grade} - ${section}`;

  const [items, setItems] = useState<Assignment[]>([]);
  // Real per-assignment submission counts — replaces the old hardcoded
  // "32 submitted once past due, else 0" placeholder, which never reflected
  // actual student activity no matter how many students had submitted.
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [rosterSize, setRosterSize] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [subjectFilter, setSubjectFilter] = useState("All Subjects");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [page, setPage] = useState(1);
  const PER_PAGE = 7;

  const load = () => {
    smartDb.getAll("TeacherAssignment", undefined).then((rows: any[]) => {
      const filtered = (rows || []).filter(
        r => r.grade == grade && r.section === section
      );
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(filtered);
    }).catch(() => {});
    smartDb.getAll("Student", undefined).then((rows: any[]) => {
      const aGrade = normGrade(grade);
      const aSection = normSection(section);
      const roster = (rows || []).filter((s: any) => {
        const sGrade = normGrade(s.grade || s.gradeLevel || s.class || s.className || "");
        if (!sGrade || sGrade !== aGrade) return false;
        const sSection = normSection(s.section || s.sectionName || "");
        return !aSection || sSection === aSection || !sSection;
      });
      setRosterSize(roster.length);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, [grade, section]);

  // Submissions are the actually-changing data here (students submit at any
  // time, independent of this teacher's own page actions), so this is a live
  // watch (same 20s local-poll / realtime-listener mechanism every other
  // reactive feed in this app uses) rather than a one-time fetch — the whole
  // point of this fix is that the count no longer needs a manual refresh.
  useEffect(() => {
    const unsubscribe = smartDb.watch("AssignmentSubmission", undefined, (rows) => {
      setSubmissions((rows as any[]) || []);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await smartDb.delete("TeacherAssignment", id);
      toast.success("Assignment deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Merge real assignments (top) with demo rows
  const allRows = useMemo<Row[]>(() => {
    const real: Row[] = items.map(a => {
      const created = new Date(a.createdAt);
      const due = a.dueDate ? new Date(a.dueDate) : created;
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
      const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      // Use the real persisted status (Draft/Upcoming/Active/Closed, set by
      // CreateAssignment.tsx and SubmissionReviewCenter.tsx's Close action)
      // instead of recomputing purely from the due date — that overwrite was
      // why Drafts could never appear in the Drafts tab.
      const status = a.status || (due < new Date() ? "Closed" : "Active");
      const submitted = submissions.filter(s => s.assignmentId === a.id).length;
      const total = rosterSize;
      return {
        id: a.id, title: a.title, desc: (a.instructions ? a.instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g," ").trim() : null) || `${a.type} · ${a.totalMarks} marks`,
        subject: a.subject, assignedDate: fmt(created), assignedTime: time(created),
        dueDate: fmt(due), dueTime: "11:59 PM",
        submitted, total,
        pct: total > 0 ? Math.round((submitted / total) * 100) : 0, status,
      };
    });
    return real;
  }, [items, submissions, rosterSize]);

  const filtered = useMemo(() => allRows.filter(r => {
    if (tab === "active" && r.status !== "Active") return false;
    if (tab === "closed" && r.status !== "Closed") return false;
    if (tab === "drafts" && r.status !== "Draft") return false;
    if (subjectFilter !== "All Subjects" && r.subject !== subjectFilter) return false;
    if (statusFilter !== "All Status" && r.status !== statusFilter) return false;
    return true;
  }), [allRows, tab, subjectFilter, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const reset = () => {
    setSubjectFilter("All Subjects"); setTypeFilter("All Types");
    setStatusFilter("All Status"); setPage(1); toast.success("Filters reset");
  };

  // Real ungraded-submission count across this teacher's own assignments —
  // replaces the old "Pending Review" KPI, which was a verbatim duplicate of
  // the Active Assignments count under a misleading label.
  const assignmentIds = useMemo(() => new Set(items.map(a => a.id)), [items]);
  const pendingReviewCount = useMemo(
    () => submissions.filter(s => assignmentIds.has(s.assignmentId) && (s.status === "submitted" || s.status === "resubmitted")).length,
    [submissions, assignmentIds]
  );
  // Real class average across graded submissions — replaces a permanent "—"
  // placeholder that never computed anything.
  const classAverage = useMemo(() => {
    const graded = submissions.filter(s => assignmentIds.has(s.assignmentId) && typeof s.marks === "number");
    if (!graded.length) return "—";
    const pctSum = graded.reduce((sum, s) => {
      const a = items.find(x => x.id === s.assignmentId);
      const total = a?.totalMarks || 0;
      return sum + (total > 0 ? (s.marks / total) * 100 : 0);
    }, 0);
    return `${Math.round(pctSum / graded.length)}%`;
  }, [submissions, assignmentIds, items]);

  const KPIS = [
    { icon: ClipboardList, bg: "bg-purple-50",  ic: "text-purple-500",  value: allRows.length,                                     label: "Total Assignments", sub: "All time" },
    { icon: FileText,      bg: "bg-emerald-50", ic: "text-emerald-500", value: allRows.filter(r => r.status === "Active").length,   label: "Active Assignments",sub: "Currently running" },
    { icon: Clock,         bg: "bg-orange-50",  ic: "text-orange-500",  value: pendingReviewCount,                                  label: "Pending Review",    sub: "Ungraded submissions" },
    { icon: FileText,      bg: "bg-blue-50",    ic: "text-blue-500",    value: allRows.filter(r => r.status === "Draft").length,    label: "Drafts",            sub: "Not yet published" },
    { icon: GraduationCap, bg: "bg-pink-50",    ic: "text-pink-500",    value: classAverage,                                        label: "Class Average",     sub: "Across graded work" },
  ];

  // Submission overview donut
  const submission = [
    { label: "Active", value: allRows.filter(r=>r.status==="Active").length, pct: allRows.length ? Math.round(allRows.filter(r=>r.status==="Active").length/allRows.length*100) : 0, color: "#8b5cf6" },
    { label: "Closed", value: allRows.filter(r=>r.status==="Closed").length, pct: allRows.length ? Math.round(allRows.filter(r=>r.status==="Closed").length/allRows.length*100) : 0, color: "#10b981" },
    { label: "Draft", value: allRows.filter(r=>r.status==="Draft").length, pct: allRows.length ? Math.round(allRows.filter(r=>r.status==="Draft").length/allRows.length*100) : 0, color: "#e2e8f0" },
  ];
  const donutCirc = 2 * Math.PI * 36;
  let donutOffset = -90;

  const deadlines = items.filter(a => { const d = new Date(a.dueDate); return d > new Date(); }).sort((a,b) => new Date(a.dueDate).getTime()-new Date(b.dueDate).getTime()).slice(0,3).map(a => { const d = new Date(a.dueDate); const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]; const days = Math.ceil((d.getTime()-Date.now())/86400000); return { title: a.title, date: `${mo} ${d.getDate()}`, days }; });

  const exportExcel = () => {
    const data = allRows.map(r => ({
      Title: r.title,
      Subject: r.subject,
      "Assigned Date": r.assignedDate,
      "Due Date": r.dueDate,
      Status: r.status,
      "Submitted": r.submitted,
      "Total": r.total,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assignments");
    XLSX.writeFile(wb, "assignments.xlsx");
    toast.success("Exported to Excel");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
              <p className="text-sm text-slate-400">{className} · Create and manage assignments.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubjectContextBar assignments={mySubjects} selected={activeSubject} onChange={setActiveSubject} />
            <button onClick={() => load()}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4 text-slate-500" /> Refresh
            </button>
            <button onClick={() => navigate("/teacher/assignments/new")}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Plus className="h-4 w-4" /> Create New Assignment
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-3">
          {KPIS.map((k, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{k.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{k.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-5">

          {/* LEFT (2/3): tabs + table */}
          <div className="col-span-2 bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100">
              {([
                { k: "all", label: "All Assignments" },
                { k: "drafts", label: "Drafts" },
                { k: "active", label: "Active" },
                { k: "closed", label: "Closed" },
              ] as const).map(t => (
                <button key={t.k} onClick={() => { setTab(t.k); setPage(1); }}
                  className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                    tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Assigned On</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Due Date</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Submissions</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No assignments found</td></tr>
                  ) : pageRows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", SUBJECT_BADGE[r.subject] || "bg-purple-100 text-purple-600")}>
                            {(() => { const Icon = subjectIcon(r.subject); return <Icon className="h-4 w-4" />; })()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{r.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{r.desc}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md", SUBJECT_BADGE[r.subject] || "bg-slate-100 text-slate-600")}>
                          {r.subject}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 font-medium">{r.assignedDate}</p>
                        <p className="text-[10px] text-slate-400">{r.assignedTime}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 font-medium">{r.dueDate}</p>
                        <p className="text-[10px] text-slate-400">{r.dueTime}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs font-bold text-slate-800">{r.submitted} / {r.total}</p>
                        <p className="text-[10px] text-slate-400">{r.pct}%</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", STATUS_BADGE[r.status] || "bg-slate-100 text-slate-600")}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => navigate("/teacher/assignments/" + r.id + "/submissions")}
                            title="Review Submissions"
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => navigate(`/teacher/assignments/${r.id}/edit`)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 text-slate-400 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(r.id)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Showing {filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} assignments
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                      page === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                    {p}
                  </button>
                ))}
                {totalPages > 4 && <span className="px-1 text-slate-400 text-xs">…</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT sidebar */}
          <div className="space-y-4">

            {/* Submission Overview donut */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Submission Overview</h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    {submission.map((t, i) => {
                      const dash = (t.pct / 100) * donutCirc;
                      const seg = (
                        <circle key={i} cx="50" cy="50" r="36" fill="none" stroke={t.color} strokeWidth="13"
                          strokeDasharray={`${dash} ${donutCirc - dash}`} transform={`rotate(${donutOffset} 50 50)`} />
                      );
                      donutOffset += (t.pct / 100) * 360;
                      return seg;
                    })}
                    <circle cx="50" cy="50" r="27" fill="white" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-900">{allRows.length}</span>
                    <span className="text-[9px] text-slate-400 leading-none">Total</span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {submission.map(t => (
                    <div key={t.label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      <span className="text-[11px] text-slate-600 flex-1">{t.label}</span>
                      <span className="text-[11px] font-semibold text-slate-700">{t.value} ({t.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Upcoming Deadlines</h3>
                <button onClick={() => navigate("/teacher/assignments")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-2.5">
                {deadlines.map(d => (
                  <div key={d.title} className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-semibold text-purple-500 leading-none uppercase">{d.date.split(" ")[0]}</span>
                      <span className="text-sm font-bold text-purple-700 leading-tight">{d.date.split(" ")[1]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{d.title}</p>
                      <p className={cn("text-[10px] font-semibold mt-0.5", d.days <= 2 ? "text-rose-500" : "text-amber-500")}>
                        {d.days} Days Left
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Create Assignment", icon: Plus,     bg: "bg-purple-100", ic: "text-purple-600", fn: () => navigate("/teacher/assignments/new") },
                  { label: "Export Excel",      icon: Download, bg: "bg-indigo-100", ic: "text-purple-600", fn: () => exportExcel() },
                ].map((a, i) => (
                  <button key={i} onClick={a.fn}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", a.bg)}>
                      <a.icon className={cn("h-4 w-4", a.ic)} />
                    </div>
                    <span className="text-[9px] font-semibold text-slate-600 text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

    </DashboardLayout>
  );
}
