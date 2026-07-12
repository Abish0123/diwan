import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { FileText, Clock, CheckCircle, AlertTriangle, Search, ChevronLeft, ChevronRight, Wifi, Users2 } from "lucide-react";

interface Assignment {
  id: string; title: string; subject: string; dueDate: string;
  status: "Submitted" | "Pending" | "Graded" | "Overdue";
  grade?: string; feedback?: string; teacher: string;
}

function statusMeta(s: string) {
  switch (s) {
    case "Submitted": return { cls:"bg-blue-50 text-blue-700 border-blue-200" };
    case "Graded":    return { cls:"bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "Pending":   return { cls:"bg-amber-50 text-amber-700 border-amber-200" };
    case "Overdue":   return { cls:"bg-rose-50 text-rose-700 border-rose-200" };
    default:          return { cls:"bg-slate-100 text-slate-600 border-slate-200" };
  }
}

function mapHomework(hw: any): Assignment {
  const now = new Date();
  const due = hw.dueDate ? new Date(hw.dueDate) : null;
  const raw = hw.status || "Pending";
  let status: Assignment["status"] = "Pending";
  if (raw === "Graded" || raw === "graded") status = "Graded";
  else if (raw === "Submitted" || raw === "submitted") status = "Submitted";
  else if (due && due < now) status = "Overdue";
  return {
    id: hw.id,
    title: hw.title || hw.name || "Homework",
    subject: hw.subject || "General",
    dueDate: hw.dueDate || "—",
    status,
    grade: hw.grade || undefined,
    feedback: hw.feedback || undefined,
    teacher: hw.teacherName || hw.teacher || hw.createdBy || "—",
  };
}

// Real assignments published via the teacher/admin Assignments module
// (Create Assignment) — a distinct table/flow from Homework, but shown
// together here since this is the only "Assignments & Homework" view a
// parent has. Status must come from the student's real AssignmentSubmission
// row (matched by studentId), not just the due date — otherwise a child who
// already submitted (or was already graded) keeps showing "Pending"/
// "Overdue" forever, since the assignment record itself never changes.
function mapAssignment(a: any, sub?: any): Assignment {
  const now = new Date();
  const due = a.dueDate ? new Date(a.dueDate) : null;
  let status: Assignment["status"];
  if (sub?.status === "graded" || sub?.status === "closed") status = "Graded";
  else if (sub) status = "Submitted"; // submitted / resubmitted / resubmission_requested — student has acted
  else status = due && due < now ? "Overdue" : "Pending";
  return {
    id: a.id,
    title: a.title || "Assignment",
    subject: a.subject || "General",
    dueDate: a.dueDate || "—",
    status,
    grade: a.grade || undefined,
    feedback: sub?.feedback || undefined,
    teacher: a.teacher || "—",
  };
}

// Student.grade is stored WITHOUT the "Grade " prefix (e.g. "3"), but
// Homework/TeacherAssignment.grade is stored WITH it (e.g. "Grade 3") — a
// plain === never matches real records.
function canonGrade(v: any): string {
  return String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}
function canonSection(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

type Tab = "all" | "pending" | "submitted" | "graded";
const PAGE_SIZE = 6;

export default function ParentAssignments() {
  const { selected, loading } = useParentChildren();
  const [tab, setTab]   = useState<Tab>("all");
  const [q, setQ]       = useState("");
  const [page, setPage] = useState(1);
  const [liveData, setLiveData] = useState<Assignment[] | null>(null);

  // Fetch real homework, real published assignments, AND the child's real
  // AssignmentSubmission rows — the submission table is the source of truth
  // for whether this specific child has actually submitted/been graded;
  // without it every assignment looked "Pending" forever regardless of what
  // the student did in their own portal.
  useEffect(() => {
    setLiveData(null);
    if (!selected) return;
    Promise.all([
      smartDb.getAll("Homework").catch(() => []),
      smartDb.getAll("TeacherAssignment").catch(() => []),
      smartDb.getAll("AssignmentSubmission").catch(() => []),
    ]).then(([hwRows, asgRows, subRows]) => {
      const wantG = canonGrade(selected.grade);
      const wantS = canonSection(selected.section);
      const mySubs = (subRows || []).filter((s: any) => String(s.studentId) === String(selected.id));
      const hw = (hwRows || []).filter((h: any) =>
        canonGrade(h.grade) === wantG && (!h.section || canonSection(h.section) === wantS)
      ).map(mapHomework);
      const asg = (asgRows || []).filter((a: any) =>
        a.status === "Active" && canonGrade(a.grade) === wantG && (!a.section || canonSection(a.section) === wantS)
      ).map((a: any) => mapAssignment(a, mySubs.find((s: any) => String(s.assignmentId) === String(a.id))));
      setLiveData([...hw, ...asg]);
    }).catch(() => {});
  }, [selected?.id, selected?.grade, selected?.section]);

  const all = liveData ?? [];
  const filtered = all.filter(a => {
    const matchTab = tab === "all" ? true :
      tab === "pending" ? (a.status === "Pending" || a.status === "Overdue") :
      tab === "submitted" ? a.status === "Submitted" : a.status === "Graded";
    const matchQ = !q || a.title.toLowerCase().includes(q.toLowerCase()) || a.subject.toLowerCase().includes(q.toLowerCase());
    return matchTab && matchQ;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const pending  = all.filter(a => a.status === "Pending" || a.status === "Overdue").length;
  const submitted = all.filter(a => a.status === "Submitted").length;
  const graded   = all.filter(a => a.status === "Graded").length;
  const overdue  = all.filter(a => a.status === "Overdue").length;

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
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Assignments & Homework</h1>
              <p className="text-sm text-slate-400">{selected.name} — {selected.grade} · Section {selected.section}</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Total",    value: all.length, icon: FileText,    color:"text-purple-600 bg-violet-50" },
            { label:"Pending",  value: pending,    icon: Clock,       color:"text-amber-600 bg-amber-50" },
            { label:"Submitted",value: submitted,  icon: CheckCircle, color:"text-purple-600 bg-blue-50" },
            { label:"Overdue",  value: overdue,    icon: AlertTriangle,color:"text-rose-600 bg-rose-50" },
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
            ? `Live assignments from ${selected.grade} · Section ${selected.section} teacher records.`
            : "No homework assigned yet for this class."}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(["all","pending","submitted","graded"] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition",
                  tab===t ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Search…"
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 w-48" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {pageData.length === 0 && <div className="py-12 text-center text-slate-400">No assignments found.</div>}
            {pageData.map(a => {
              const meta = statusMeta(a.status);
              return (
                <div key={a.id} className="px-5 py-4 flex items-start gap-3 hover:bg-slate-50 transition">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                      <span>{a.subject}</span>
                      <span>Due: {a.dueDate}</span>
                      <span>Teacher: {a.teacher}</span>
                    </div>
                    {a.feedback && (
                      <p className="text-xs text-emerald-600 mt-1 italic">"{a.feedback}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {a.grade && (
                      <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">{a.grade}</span>
                    )}
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", meta.cls)}>{a.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {Math.min((page-1)*PAGE_SIZE+1,filtered.length)} to {Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 font-semibold text-slate-700">{page}/{totalPages}</span>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
