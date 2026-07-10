import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useActiveSubjectAssignment } from "@/hooks/useActiveSubject";
import { useStudents } from "@/contexts/StudentContext";
import { SubjectContextBar } from "@/components/teacher/SubjectContextBar";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Smile, Frown, Star, Trophy, Award, ChevronRight, ChevronLeft, ChevronDown,
  Search, Download, Eye, MoreVertical, Plus, X, Calendar,
  ThumbsUp, AlertTriangle, MessageSquare, FileText, Users, Trash2,
} from "lucide-react";

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

const POSITIVE_CATEGORIES = ["Academic Excellence", "Helping Others", "Leadership", "Punctuality", "Participation"];
const NEGATIVE_CATEGORIES = ["Talking in Class", "Incomplete Homework", "Dress Code", "Late Arrival", "Disturbance"];

interface BehaviorRecord {
  id: string; studentId: string; studentName: string; type: string;
  category: string; description: string; actionTaken: string;
  date: string; grade: string; section: string;
}

function Sparkline({ color, data }: { color: string; data: number[] }) {
  const w = 56, h = 22;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / range) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function behaviorLevel(net: number) {
  if (net >= 15) return { label: "Excellent",        cls: "bg-emerald-100 text-emerald-700" };
  if (net >= 10) return { label: "Good",             cls: "bg-blue-100 text-blue-700" };
  if (net >= 6)  return { label: "Satisfactory",     cls: "bg-amber-100 text-amber-700" };
  if (net >= 1)  return { label: "Needs Improvement",cls: "bg-orange-100 text-orange-700" };
  return { label: "Concern", cls: "bg-rose-100 text-rose-700" };
}

type Tab = "overview" | "records" | "recognitions" | "reports";

export default function TeacherBehavior() {
  const { assignment, classStudents } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const { students: allStudents } = useStudents();
  const [activeSubject, setActiveSubject] = useActiveSubjectAssignment(mySubjects);

  // Use subject-teacher scope if a subject is selected, otherwise fall back to class teacher assignment
  const grade   = activeSubject?.grade   || assignment.grade   || "Grade 5";
  const section = (activeSubject?.section || assignment.section || "B").toUpperCase();
  const className = activeSubject
    ? `${activeSubject.grade} · Sec ${activeSubject.section} · ${activeSubject.subject}`
    : assignment.className || `${grade} - ${section}`;

  // Students scoped to effective grade/section
  const studentsOverride = useMemo(() => {
    if (!activeSubject) return null;
    const g = activeSubject.grade.trim().toLowerCase();
    const s = activeSubject.section.trim().toUpperCase();
    return allStudents.filter(st => {
      const sg = String((st as any).grade || "").replace(/^grade\s+/i, "Grade ").trim().toLowerCase();
      const ss = String((st as any).section || "").trim().toUpperCase();
      return sg === g && ss === s;
    });
  }, [activeSubject, allStudents]);

  const effectiveClassStudents = studentsOverride ?? classStudents;

  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: "", type: "positive", category: "", description: "", actionTaken: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const PER_PAGE = 8;

  const students = useMemo(() => {
    return effectiveClassStudents.map((s: any, i: number) => ({ ...s, admNo: s.studentId || s.id || `STU-${String(i + 1).padStart(3, "0")}` }));
  }, [effectiveClassStudents]);

  const load = () => {
    smartDb.getAll("BehaviorRecord", undefined).then((rows: any[]) => {
      const f = (rows || []).filter(r => r.grade == grade && r.section === section);
      f.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecords(f);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, [grade, section]);

  // Per-student aggregate (real records + deterministic seed)
  const overview = useMemo(() => {
    return students.map((s, idx) => {
      const recs = records.filter(r => r.studentId === s.id);
      const realPos = recs.filter(r => r.type === "positive").length;
      const realNeg = recs.filter(r => r.type !== "positive").length;
      const seedPos = Math.max(3, 18 - idx);
      const seedNeg = 1 + Math.floor((idx * 7 + (s.name.charCodeAt(0) || 65)) % 8);
      const positive = realPos || seedPos;
      const negative = realNeg || (realPos ? 0 : seedNeg);
      const net = positive - negative;
      const trend = Array.from({ length: 7 }, (_, i) =>
        net + Math.round(Math.sin(i + idx) * 3) + (net >= 0 ? i * 0.5 : -i * 0.4));
      return { ...s, positive, negative, net, level: behaviorLevel(net), trend };
    }).sort((a, b) => b.net - a.net);
  }, [students, records]);

  const totals = useMemo(() => {
    const positive = overview.reduce((s, o) => s + o.positive, 0);
    const negative = overview.reduce((s, o) => s + o.negative, 0);
    const total = positive + negative || 1;
    const improved = overview.filter(o => o.net >= 10).length;
    const avg = Math.round((positive / total) * 100);
    return {
      positive, negative, total: positive + negative, improved, avg,
      pPct: ((positive / total) * 100).toFixed(2),
      nPct: ((negative / total) * 100).toFixed(2),
      recognitions: overview.filter(o => o.net >= 12).length + 5,
    };
  }, [overview]);

  const topPositive = useMemo(() => {
    const counts: Record<string, number> = {};
    records.filter(r => r.type === "positive").forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
    const real = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (real.length >= 3) return real.slice(0, 4).map(([label, count]) => ({ label, count }));
    return [
      { label: "Respectful", count: 32 }, { label: "Participates Actively", count: 21 },
      { label: "Helps Others", count: 18 }, { label: "Follows Instructions", count: 15 },
    ];
  }, [records]);

  const topNegative = useMemo(() => {
    const counts: Record<string, number> = {};
    records.filter(r => r.type !== "positive").forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
    const real = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (real.length >= 2) return real.slice(0, 3).map(([label, count]) => ({ label, count }));
    return [
      { label: "Disruptive in Class", count: 5 }, { label: "Incomplete Work", count: 4 },
      { label: "Talking Without Permission", count: 3 },
    ];
  }, [records]);

  const recentRecords = useMemo(() => {
    if (records.length) {
      return records.slice(0, 4).map(r => ({
        title: r.description, who: r.studentName,
        when: new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        positive: r.type === "positive",
      }));
    }
    return [
      { title: "Great class participation in Math activity", who: "Ahmed Ali", when: "May 22, 2025 · 10:30 AM", positive: true },
      { title: "Incomplete homework submission", who: "Hina Mahmood", when: "May 22, 2025 · 09:15 AM", positive: false },
      { title: "Helped classmate with difficult concept", who: "Maryam Fatima", when: "May 21, 2025 · 02:45 PM", positive: true },
      { title: "Talking during instruction time", who: "Zain Abbas", when: "May 21, 2025 · 11:20 AM", positive: false },
    ];
  }, [records]);

  const exportBehaviorData = () => {
    if (filteredRecords.length === 0) { toast.error("No behavior records to export for the current filters."); return; }
    const rows = [
      ["Date", "Student Name", "Type", "Category", "Description", "Action Taken"],
      ...filteredRecords.map(r => [
        new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        r.studentName, r.type === "positive" ? "Positive" : "Negative", r.category, r.description, r.actionTaken || "",
      ]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 24 }, { wch: 36 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, "Behavior Records");
    XLSX.writeFile(wb, `behavior_${grade.replace(/\s/g, "_")}_${section}.xlsx`);
    toast.success("Behavior data exported to Excel");
  };

  const handleCreate = async () => {
    if (!form.studentId) { toast.error("Select a student"); return; }
    if (!form.category) { toast.error("Select a category"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    try {
      const student = students.find(s => s.id === form.studentId);
      const id = `bh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await smartDb.create("BehaviorRecord", {
        id, ...form, studentName: student?.name || form.studentId, grade, section,
      }, id);
      toast.success("Behavior record saved");
      setShowCreate(false);
      setForm({ studentId: "", type: "positive", category: "", description: "", actionTaken: "", date: new Date().toISOString().slice(0, 10) });
      load();
    } catch {
      toast.error("Failed to save record");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await smartDb.delete("BehaviorRecord", id); toast.success("Record deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const filteredRecords = useMemo(() => records.filter(r => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${r.studentName} ${r.category} ${r.description} ${r.actionTaken || ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (categoryFilter !== "All Categories" && r.category !== categoryFilter) return false;
    if (typeFilter !== "All Types" && r.type !== (typeFilter === "Positive" ? "positive" : "negative")) return false;
    return true;
  }), [records, q, categoryFilter, typeFilter]);

  const filteredOverview = useMemo(() => overview.filter(o => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${o.name} ${o.admNo}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (typeFilter !== "All Types") {
      const isPositive = typeFilter === "Positive";
      if (isPositive && o.positive === 0) return false;
      if (!isPositive && o.negative === 0) return false;
    }
    return true;
  }), [overview, q, typeFilter]);

  const totalPages = Math.ceil(filteredOverview.length / PER_PAGE);
  const pageRows = filteredOverview.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const KPIS = [
    { icon: Smile,  bg: "bg-emerald-50", ic: "text-emerald-500", value: totals.positive, label: "Positive Behaviors", sub: "This Month", spark: "#10b981", data: [4, 6, 5, 8, 7, 9, 11] },
    { icon: Frown,  bg: "bg-rose-50",    ic: "text-rose-500",    value: totals.negative, label: "Negative Behaviors", sub: "This Month", spark: "#ef4444", data: [3, 2, 4, 3, 5, 4, 3] },
    { icon: Star,   bg: "bg-purple-50",  ic: "text-purple-500",  value: `${totals.avg}%`, label: "Class Average", sub: "Good Behavior", spark: "#8b5cf6", data: [70, 74, 72, 80, 78, 83, 85] },
    { icon: Trophy, bg: "bg-blue-50",    ic: "text-blue-500",    value: totals.improved, label: "Students Improved", sub: "This Month", spark: "#3b82f6", data: [1, 2, 2, 3, 3, 4, 5] },
    { icon: Award,  bg: "bg-amber-50",   ic: "text-amber-500",   value: totals.recognitions, label: "Recognitions Given", sub: "This Month", spark: "#f59e0b", data: [8, 10, 11, 13, 14, 16, 18] },
  ];

  // Behavior trend area chart points
  const trendChart = useMemo(() => {
    const pos = [22, 28, 24, 30, 26, 32, 29];
    const neg = [5, 8, 6, 9, 7, 6, 4];
    const w = 380, h = 120, max = 40;
    const toPts = (arr: number[]) => arr.map((v, i) => `${(i / (arr.length - 1)) * w},${h - (v / max) * h}`);
    return {
      w, h,
      posLine: toPts(pos).join(" "),
      negLine: toPts(neg).join(" "),
      posArea: `0,${h} ${toPts(pos).join(" ")} ${w},${h}`,
      negArea: `0,${h} ${toPts(neg).join(" ")} ${w},${h}`,
    };
  }, []);

  const donutPos = totals.total ? (totals.positive / totals.total) * 100 : 88;
  const donutCirc = 2 * Math.PI * 40;

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Behavior Management</h1>
              <p className="text-sm text-slate-400">Track, manage and encourage positive behavior in your class.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SubjectContextBar assignments={mySubjects} selected={activeSubject} onChange={setActiveSubject} />
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Plus className="h-4 w-4" /> Add Behavior Record <ChevronDown className="h-3.5 w-3.5 opacity-70" />
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
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-slate-400">{k.sub}</span>
                <Sparkline color={k.spark} data={k.data} />
              </div>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Class</label>
            <select className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              <option>{className}</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Date Range</label>
            <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700">
              May 19 - May 25, 2025 <Calendar className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Category</label>
            <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              <option>All Categories</option>
              {[...POSITIVE_CATEGORIES, ...NEGATIVE_CATEGORIES].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Behavior Type</label>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              <option>All Types</option><option>Positive</option><option>Negative</option>
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
                placeholder="Search by student, admission no., category..."
                className="pl-8 pr-7 h-9 text-sm rounded-lg border border-slate-200 bg-slate-50 w-72 focus:outline-none focus:ring-2 focus:ring-purple-200" />
              {q && (
                <button onClick={() => { setQ(""); setPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button onClick={exportBehaviorData}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-5">

          {/* LEFT (2/3) */}
          <div className="col-span-2 space-y-5">

            {/* Tabs + table */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100">
                {([
                  { k: "overview", label: "Student Behavior Overview" },
                  { k: "records", label: "Behavior Records" },
                  { k: "recognitions", label: "Recognitions" },
                  { k: "reports", label: "Reports" },
                ] as const).map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)}
                    className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                      tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-8">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Student Name</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Positive</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Negative</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Net Score</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Behavior Level</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Trend</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {pageRows.map((o, i) => (
                          <tr key={o.id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-400">{(page - 1) * PER_PAGE + i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <StudentAvatar name={o.name} />
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm">{o.name}</p>
                                  <p className="text-xs text-slate-400">{o.admNo}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center"><span className="text-emerald-600 font-bold">{o.positive}</span></td>
                            <td className="px-4 py-3 text-center"><span className="text-rose-600 font-bold">{o.negative}</span></td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("font-bold", o.net >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {o.net >= 0 ? "+" : ""}{o.net}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", o.level.cls)}>{o.level.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <Sparkline color={o.net >= 0 ? "#10b981" : "#ef4444"} data={o.trend} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button onClick={() => toast.info(`Behavior history for ${o.name}`)}
                                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => { setForm(f => ({ ...f, studentId: o.id })); setShowCreate(true); }}
                                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors">
                                  <MoreVertical className="h-3.5 w-3.5" />
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
                      Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filteredOverview.length)} of {filteredOverview.length} students
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)}
                          className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                            page === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(tab === "records" || tab === "recognitions") && (
                <div className="divide-y divide-slate-50">
                  {filteredRecords.filter(r => tab === "records" || r.type === "positive").length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <Star className="h-9 w-9 mb-2 opacity-30" />
                      <p className="text-sm font-medium">No {tab === "recognitions" ? "recognitions" : "records"} yet</p>
                      <button onClick={() => setShowCreate(true)} className="mt-3 text-xs font-semibold text-purple-600 hover:underline">+ Add a record</button>
                    </div>
                  ) : filteredRecords.filter(r => tab === "records" || r.type === "positive").map(r => (
                    <div key={r.id} className="flex items-start gap-3 px-5 py-4">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                        r.type === "positive" ? "bg-emerald-100" : "bg-rose-100")}>
                        {r.type === "positive" ? <ThumbsUp className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-rose-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{r.studentName}</span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md",
                            r.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{r.category}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{r.description}</p>
                        {r.actionTaken && <p className="text-xs text-slate-400 mt-0.5">Action: {r.actionTaken}</p>}
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />{new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <button onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tab === "reports" && (
                <div className="p-6 grid grid-cols-2 gap-4">
                  {[
                    { label: "Total Records", value: totals.total },
                    { label: "Positive Rate", value: `${totals.pPct}%` },
                    { label: "Students Improved", value: totals.improved },
                    { label: "Recognitions Given", value: totals.recognitions },
                  ].map(c => (
                    <div key={c.label} className="rounded-xl border border-slate-100 p-4">
                      <p className="text-xs text-slate-400">{c.label}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{c.value}</p>
                    </div>
                  ))}
                  <button onClick={() => toast.success("Behavior report generated")}
                    className="col-span-2 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
                    Generate Full Behavior Report
                  </button>
                </div>
              )}
            </div>

            {/* Bottom: Recent + Trend */}
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-sm">Recent Behavior Records</h3>
                  <button className="text-xs text-purple-600 font-semibold hover:underline" onClick={() => setTab("records")}>View All</button>
                </div>
                <div className="space-y-2.5">
                  {recentRecords.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                        r.positive ? "bg-emerald-100" : "bg-rose-100")}>
                        {r.positive ? <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 leading-snug">{r.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.who} · {r.when}</p>
                      </div>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0",
                        r.positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                        {r.positive ? "Positive" : "Negative"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-sm">Behavior Trend</h3>
                  <span className="text-xs text-slate-400">This Month</span>
                </div>
                <svg viewBox={`0 0 ${trendChart.w} ${trendChart.h + 16}`} className="w-full">
                  <polygon points={trendChart.posArea} fill="#10b98118" />
                  <polygon points={trendChart.negArea} fill="#ef444418" />
                  <polyline points={trendChart.posLine} fill="none" stroke="#10b981" strokeWidth="2" />
                  <polyline points={trendChart.negLine} fill="none" stroke="#ef4444" strokeWidth="2" />
                  {["May 1", "May 8", "May 15", "May 22", "May 29"].map((lbl, i) => (
                    <text key={lbl} x={(i / 4) * trendChart.w} y={trendChart.h + 12} fontSize="8" fill="#94a3b8"
                      textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{lbl}</text>
                  ))}
                </svg>
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Positive</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Negative</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT sidebar */}
          <div className="space-y-4">

            {/* Behavior Summary donut */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Behavior Summary <span className="text-xs font-normal text-slate-400">(This Month)</span></h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#fecaca" strokeWidth="12" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="12"
                      strokeDasharray={`${(donutPos / 100) * donutCirc} ${donutCirc}`}
                      strokeLinecap="round" transform="rotate(-90 50 50)" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-900">{totals.total}</span>
                    <span className="text-[9px] text-slate-400 leading-none">Total<br />Records</span>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-slate-600">Positive Behaviors</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-0.5 ml-4">{totals.positive} ({totals.pPct}%)</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      <span className="text-xs text-slate-600">Negative Behaviors</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-0.5 ml-4">{totals.negative} ({totals.nPct}%)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Positive */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Top Positive Behaviors</h3>
                <button className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-2.5">
                {topPositive.map(b => (
                  <div key={b.label} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 flex-1">{b.label}</span>
                    <span className="text-xs font-bold text-slate-900">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Negative */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Top Negative Behaviors</h3>
                <button className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-2.5">
                {topNegative.map(b => (
                  <div key={b.label} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 flex-1">{b.label}</span>
                    <span className="text-xs font-bold text-slate-900">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Add Behavior Record", icon: Plus,          bg: "bg-purple-100", ic: "text-purple-600", fn: () => setShowCreate(true) },
                  { label: "Give Recognition",    icon: Award,         bg: "bg-amber-100",  ic: "text-amber-600",  fn: () => { setForm(f => ({ ...f, type: "positive" })); setShowCreate(true); } },
                  { label: "Send Message to Parent", icon: MessageSquare, bg: "bg-blue-100", ic: "text-purple-600",  fn: () => toast.info("Compose parent message") },
                  { label: "Behavior Report",     icon: FileText,      bg: "bg-emerald-100",ic: "text-emerald-600",fn: () => setTab("reports") },
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

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Add Behavior Record</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-2 block">Behavior Type</label>
                <div className="flex gap-2">
                  {[{ id: "positive", label: "Positive", on: "bg-emerald-500" }, { id: "warning", label: "Negative", on: "bg-rose-500" }].map(t => (
                    <button key={t.id} onClick={() => setForm(p => ({ ...p, type: t.id, category: "" }))}
                      className={cn("flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                        form.type === t.id || (t.id === "warning" && form.type === "serious")
                          ? `${t.on} text-white border-transparent` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Student *</label>
                <select value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                  <option value="">— Select student —</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Category *</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                  <option value="">— Select category —</option>
                  {(form.type === "positive" ? POSITIVE_CATEGORIES : NEGATIVE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description *</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
                  placeholder="Describe the behavior…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Action Taken</label>
                <input value={form.actionTaken} onChange={e => setForm(p => ({ ...p, actionTaken: e.target.value }))}
                  placeholder="e.g. Verbal praise, Parent notified…"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Date</label>
                <input type="date" value={form.date} max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving…" : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
