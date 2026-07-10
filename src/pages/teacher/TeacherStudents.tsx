import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users, Search, Filter, Download, Eye, Mail, Phone,
  ChevronLeft, ChevronRight, UserCheck, UserX, AlertTriangle,
  BookOpen, BarChart3, MessageSquare, X, GraduationCap,
} from "lucide-react";

const AVATAR_COLORS = [
  "bg-indigo-500","bg-pink-500","bg-emerald-500","bg-amber-500",
  "bg-sky-500","bg-rose-500","bg-violet-500","bg-teal-500",
];
function Avatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const ini = name.charAt(0).toUpperCase() + (name.split(" ")[1]?.charAt(0)?.toUpperCase() || "");
  return (
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", color)}>
      {ini}
    </div>
  );
}

type StudentRow = {
  id: string; name: string; rollNo: string; gender: string; dob: string;
  parentName: string; parentPhone: string; email: string;
  attendance: number; gpa: number; status: string; remarks: string;
};

function gpaColor(g: number) {
  if (g >= 3.7) return "text-emerald-600 bg-emerald-50";
  if (g >= 3.0) return "text-purple-600 bg-blue-50";
  if (g >= 2.5) return "text-amber-600 bg-amber-50";
  return "text-rose-600 bg-rose-50";
}
function attColor(a: number) {
  if (a >= 90) return "text-emerald-600";
  if (a >= 75) return "text-amber-600";
  return "text-rose-600";
}

const PAGE_SIZE = 8;

export default function TeacherStudents() {
  const { assignment, classStudents } = useTeacherClass();
  const grade   = assignment.grade   || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();

  const [q, setQ]           = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage]     = useState(1);
  const [selected, setSelected] = useState<StudentRow | null>(null);

  const baseList = useMemo<StudentRow[]>(() => {
    return classStudents.map((s, i) => ({
      id: s.id || String(i),
      name: s.name || "Student",
      rollNo: (s as any).rollNumber || String(i + 1).padStart(3, "0"),
      gender: (s as any).gender || "—",
      dob: (s as any).dob || "—",
      parentName: (s as any).parentName || "—",
      parentPhone: (s as any).parentPhone || "—",
      email: (s as any).email || "—",
      attendance: (s as any).attendance ?? (s as any).attendancePct ?? 0,
      gpa: (s as any).gpa ?? 0,
      status: (s as any).riskScore > 60 ? "At Risk" : "Active",
      remarks: "",
    }));
  }, [classStudents]);

  const filtered = useMemo(() => {
    let r = baseList;
    if (q) r = r.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || s.rollNo.includes(q));
    if (statusFilter !== "All") r = r.filter(s => s.status === statusFilter);
    return r;
  }, [baseList, q, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total    = baseList.length;
  const active   = baseList.filter(s => s.status === "Active").length;
  const atRisk   = baseList.filter(s => s.status === "At Risk").length;
  const avgAtt   = baseList.length ? Math.round(baseList.reduce((a, s) => a + s.attendance, 0) / baseList.length) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Students</h1>
              <p className="text-sm text-slate-400">{grade} · Section {section} &mdash; {total} students enrolled</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => toast.info("Export to Excel coming soon.")} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => toast.info("Opening message composer…")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
              <MessageSquare className="w-4 h-4" /> Message All
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Total Students", value: total,    icon: Users,      color:"text-purple-600 bg-violet-50" },
            { label:"Active",         value: active,   icon: UserCheck,  color:"text-emerald-600 bg-emerald-50" },
            { label:"At Risk",        value: atRisk,   icon: AlertTriangle, color:"text-rose-600 bg-rose-50" },
            { label:"Avg. Attendance",value:`${avgAtt}%`, icon: BarChart3, color:"text-purple-600 bg-blue-50" },
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name or roll no…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-slate-400" /></button>}
          </div>
          {["All","Active","At Risk"].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition",
                statusFilter === s ? "bg-purple-600 text-white border-purple-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {s}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Roll No.</th>
                <th className="px-4 py-3 text-left">Gender</th>
                <th className="px-4 py-3 text-left">Parent</th>
                <th className="px-4 py-3 text-center">Attendance</th>
                <th className="px-4 py-3 text-center">GPA</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageData.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">No students found.</td></tr>
              )}
              {pageData.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} />
                      <div>
                        <p className="font-semibold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.rollNo}</td>
                  <td className="px-4 py-3 text-slate-600">{s.gender}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700 text-xs">{s.parentName}</p>
                    <p className="text-slate-400 text-xs">{s.parentPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("font-bold text-sm", attColor(s.attendance))}>{s.attendance}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", gpaColor(s.gpa))}>{s.gpa.toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold",
                      s.status === "Active" ? "bg-emerald-50 text-emerald-700" :
                      s.status === "At Risk" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setSelected(s)} title="View profile"
                        className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-purple-600 transition"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => toast.info(`Messaging parent of ${s.name}…`)} title="Message parent"
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition"><MessageSquare className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {Math.min((page-1)*PAGE_SIZE+1, filtered.length)} to {Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length} students</span>
            <div className="flex items-center gap-1">
              <button disabled={page===1} onClick={() => setPage(p=>p-1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 font-semibold text-slate-700">{page}/{totalPages}</span>
              <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)}
                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Profile drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-900">Student Profile</h2>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-4">
                  <Avatar name={selected.name} />
                  <div>
                    <p className="font-black text-lg text-slate-900">{selected.name}</p>
                    <p className="text-xs text-slate-500">Roll No. {selected.rollNo} · {grade} - {section}</p>
                  </div>
                </div>
                {[
                  { label:"Gender", val: selected.gender },
                  { label:"Date of Birth", val: selected.dob },
                  { label:"Email", val: selected.email },
                  { label:"Parent/Guardian", val: selected.parentName },
                  { label:"Parent Phone", val: selected.parentPhone },
                  { label:"Status", val: selected.status },
                  { label:"Remarks", val: selected.remarks || "—" },
                ].map(f => (
                  <div key={f.label} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-500 font-medium">{f.label}</span>
                    <span className="text-xs font-semibold text-slate-800">{f.val}</span>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl bg-emerald-50 p-3 text-center">
                    <p className="text-2xl font-black text-emerald-700">{selected.attendance}%</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Attendance</p>
                  </div>
                  <div className="rounded-xl bg-violet-50 p-3 text-center">
                    <p className="text-2xl font-black text-violet-700">{selected.gpa.toFixed(1)}</p>
                    <p className="text-xs text-purple-600 mt-0.5">GPA</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => { toast.info(`Messaging parent of ${selected.name}…`); setSelected(null); }}
                    className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition flex items-center justify-center gap-1.5">
                    <MessageSquare className="w-4 h-4" /> Message Parent
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
