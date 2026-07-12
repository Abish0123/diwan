import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import {
  LayoutDashboard,
  BookOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Bell,
  HelpCircle,
  Send,
  FileText,
  Download,
  X,
  Paperclip,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type TabKey = "all" | "pending" | "completed" | "overdue";
type Status = "Due Today" | "Pending" | "Overdue" | "Completed";

interface HomeworkRow {
  id: string;
  title: string;
  subtitle: string;
  subject: string;
  assignedBy: string;
  initials: string;
  dueDate: string;
  dueDateDisplay: string;
  dueRelative: string;
  status: Status;
  attachment?: string;
  attachmentUrl?: string;
}


// ── Avatar color (by first char of initials)
const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700", "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700",
];
function avatarColor(initials: string): string {
  return AVATAR_PALETTE[(initials.charCodeAt(0) || 0) % AVATAR_PALETTE.length];
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    "Due Today": "bg-orange-100 text-orange-700",
    Pending: "bg-blue-100 text-blue-700",
    Overdue: "bg-red-100 text-red-700",
    Completed: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${map[status]}`}>
      {status === "Completed" && <CheckCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ── Relative due badge ─────────────────────────────────────────────────────────
function DueBadge({ relative }: { relative: string }) {
  if (relative === "Today")
    return <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{relative}</span>;
  if (relative === "Tomorrow")
    return <span className="text-xs font-semibold text-purple-600 bg-blue-50 px-2 py-0.5 rounded-full">{relative}</span>;
  if (relative.includes("Overdue"))
    return <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{relative}</span>;
  if (relative === "Completed")
    return <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{relative}</span>;
  return <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">{relative}</span>;
}

// ── Map a real teacher-published homework row into the table shape ──────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function initialsOf(name: string): string {
  const parts = name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function mapHomeworkRow(h: any, submitted: boolean): HomeworkRow {
  const teacher = h.assignedBy || h.teacher || h.createdBy || "Class Teacher";
  // Parse the teacher's dueDate (ISO "YYYY-MM-DD" from the date input) and derive
  // status + a relative label off today, so the student view always reconciles.
  const due = new Date(h.dueDate);
  const validDue = !isNaN(due.getTime());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueMidnight = validDue ? new Date(due.getFullYear(), due.getMonth(), due.getDate()) : null;
  const dayMs = 86_400_000;
  const diffDays = dueMidnight ? Math.round((dueMidnight.getTime() - today.getTime()) / dayMs) : 0;

  let status: Status;
  let dueRelative: string;
  // "Completed" comes from the student's own real HomeworkSubmission row, not
  // h.status/h.completed — the teacher's create flow (teacher/Homework.tsx)
  // never sets either of those fields, so this branch previously never fired.
  if (submitted) {
    status = "Completed";
    dueRelative = "Completed";
  } else if (!dueMidnight) {
    status = "Pending";
    dueRelative = "No due date";
  } else if (diffDays < 0) {
    status = "Overdue";
    const d = Math.abs(diffDays);
    dueRelative = `${d} Day${d === 1 ? "" : "s"} Overdue`;
  } else if (diffDays === 0) {
    status = "Due Today";
    dueRelative = "Today";
  } else if (diffDays === 1) {
    status = "Pending";
    dueRelative = "Tomorrow";
  } else {
    status = "Pending";
    dueRelative = `${diffDays} Days Left`;
  }

  return {
    id: String(h.id ?? `${h.title}-${h.dueDate}`),
    title: h.title || "Untitled Homework",
    subtitle: h.description || h.subtitle || "",
    subject: h.subject || "General",
    assignedBy: teacher,
    initials: initialsOf(teacher),
    dueDate: h.dueDate || "",
    dueDateDisplay: validDue ? fmtDate(due) : (h.dueDate || "—"),
    dueRelative,
    status,
    attachment: h.attachment || undefined,
    attachmentUrl: h.attachmentUrl || undefined,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────
// Normalize grade strings: "Grade 5", "grade 5", "5" → "5"
const normalizeGrade = (g: any) => String(g ?? "").replace(/grade\s*/i, "").trim().toLowerCase();

export default function StudentHomework() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Load current user's student profile without uid-scoping (students belong to school,
  // not creator-admin uid). Falls back to first student for demo preview.
  const [studentProfile, setStudentProfile] = useState<any>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await smartDb.getAll("Student");
        const found = (all || []).find((s: any) =>
          (user.email && s.email === user.email) ||
          (user.displayName && s.name === user.displayName)
        ) ?? null;
        if (!cancelled) setStudentProfile(found);
      } catch {
        if (!cancelled) setStudentProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Real teacher-published rows (raw, for the details/submit modal) and the
  // student's own real HomeworkSubmission rows — "Completed" status is
  // derived from actually having submitted, not a field the teacher's
  // create flow never sets.
  const [rawHomework, setRawHomework] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const reloadSubmissions = async (studentId: string) => {
    const subs = await smartDb.getAll("HomeworkSubmission").catch(() => []);
    setSubmissions((subs || []).filter((s: any) => String(s.studentId) === String(studentId)));
  };

  useEffect(() => {
    if (!studentProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const [all, subs] = await Promise.all([
          smartDb.getAll("Homework"),
          smartDb.getAll("HomeworkSubmission").catch(() => []),
        ]);
        const mine = (all || []).filter((h: any) => {
          if (!studentProfile?.grade) return true;
          const gradeMatch = normalizeGrade(h.grade) === normalizeGrade(studentProfile.grade);
          const sectionMatch = !h.section ||
            h.section.trim().toUpperCase() === (studentProfile.section ?? "").trim().toUpperCase();
          return gradeMatch && sectionMatch;
        });
        if (!cancelled) {
          setRawHomework(mine);
          setSubmissions((subs || []).filter((s: any) => String(s.studentId) === String(studentProfile.id)));
        }
      } catch {
        if (!cancelled) setRawHomework([]);
      }
    })();
    return () => { cancelled = true; };
  }, [studentProfile]);

  const getSubmission = (homeworkId: string) => submissions.find((s: any) => String(s.homeworkId) === String(homeworkId));
  const usingDemo = false;
  const HOMEWORK: HomeworkRow[] = useMemo(
    () => rawHomework.map((h: any) => mapHomeworkRow(h, !!getSubmission(h.id))),
    [rawHomework, submissions]
  );

  // ── Details / submit modal ────────────────────────────────────────────
  const [selectedHwId, setSelectedHwId] = useState<string | null>(null);
  const selectedRaw = rawHomework.find((h: any) => String(h.id) === String(selectedHwId));
  const selectedRow = HOMEWORK.find((h) => h.id === selectedHwId);
  const [submitText, setSubmitText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitHomework = async () => {
    if (!selectedRaw || !studentProfile) return;
    setIsSubmitting(true);
    try {
      const id = `hwsub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await smartDb.create("HomeworkSubmission", {
        id,
        homeworkId: selectedRaw.id,
        studentId: studentProfile.id,
        studentName: studentProfile.name || "",
        content: submitText,
        submittedAt: new Date().toISOString(),
        status: "submitted",
      } as any, id);
      toast.success("Homework submitted successfully!");
      setSubmitText("");
      await reloadSubmissions(studentProfile.id);
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All Subjects");
  const [teacherFilter, setTeacherFilter] = useState("All Teachers");
  const [dueSort, setDueSort] = useState("Due Date");
  const [todayOnly, setTodayOnly] = useState(false);
  const [calDate, setCalDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const calLabel = calDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calDaysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
  const calStartDow = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay();
  const calDays = Array.from({ length: calDaysInMonth }, (_, i) => i + 1);
  const calBlanks = Array.from({ length: calStartDow });
  const shiftCal = (delta: number) =>
    setCalDate((p) => new Date(p.getFullYear(), p.getMonth() + delta, 1));

  // Real due-date dots for the viewed month, derived from actual homework
  // rows — previously TODAY_CAL/DUE_CAL were hardcoded to the same fixed
  // day (23) regardless of any real due date.
  const now0 = new Date();
  const calIsCurrentMonth = calDate.getFullYear() === now0.getFullYear() && calDate.getMonth() === now0.getMonth();
  const dueCalDays = useMemo(() => {
    const days = new Set<number>();
    HOMEWORK.forEach((h) => {
      if (!h.dueDate) return;
      const d = new Date(h.dueDate);
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() === calDate.getFullYear() && d.getMonth() === calDate.getMonth()) days.add(d.getDate());
    });
    return days;
  }, [HOMEWORK, calDate]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Homework" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "overdue", label: "Overdue" },
  ];

  // ── KPI counts derived from the data (must match the table) ──────────────────
  const kpi = {
    total: HOMEWORK.length,
    pending: HOMEWORK.filter((h) => h.status === "Pending" || h.status === "Due Today").length,
    completed: HOMEWORK.filter((h) => h.status === "Completed").length,
    dueToday: HOMEWORK.filter((h) => h.status === "Due Today").length,
    overdue: HOMEWORK.filter((h) => h.status === "Overdue").length,
  };

  const dueTodayRows = HOMEWORK.filter((h) => h.status === "Due Today");
  const nextPendingRow = [...HOMEWORK]
    .filter((h) => h.status !== "Completed")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  // Parse "23 May 2026" → comparable timestamp for sorting.
  const dueTs = (hw: HomeworkRow) => new Date(hw.dueDateDisplay).getTime();

  const filtered = HOMEWORK.filter((hw) => {
    const matchTab =
      activeTab === "all" ||
      (activeTab === "pending" && (hw.status === "Pending" || hw.status === "Due Today")) ||
      (activeTab === "completed" && hw.status === "Completed") ||
      (activeTab === "overdue" && hw.status === "Overdue");
    const matchSearch =
      search === "" ||
      hw.title.toLowerCase().includes(search.toLowerCase()) ||
      hw.subject.toLowerCase().includes(search.toLowerCase());
    const matchSubject =
      subjectFilter === "All Subjects" || hw.subject === subjectFilter;
    const matchTeacher =
      teacherFilter === "All Teachers" || hw.assignedBy === teacherFilter;
    const matchToday = !todayOnly || hw.status === "Due Today";
    return matchTab && matchSearch && matchSubject && matchTeacher && matchToday;
  }).sort((a, b) => {
    if (dueSort === "Earliest Due") return dueTs(a) - dueTs(b);
    if (dueSort === "Latest Due") return dueTs(b) - dueTs(a);
    return 0;
  });

  const subjects = ["All Subjects", ...Array.from(new Set(HOMEWORK.map((h) => h.subject)))];
  const teachers = ["All Teachers", ...Array.from(new Set(HOMEWORK.map((h) => h.assignedBy)))];

  return (
    <DashboardLayout>
      <div className="flex gap-6 bg-slate-50 min-h-screen">
        {/* ── LEFT MAIN COLUMN ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Homework</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                View, complete and submit your homework assignments.
              </p>
              {usingDemo && (
                <p className="text-xs text-slate-400 italic mt-1">
                  Sample homework — nothing published for your class yet.
                </p>
              )}
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-5 gap-4">
            {/* Total */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Homework</span>
                <span className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-purple-600" />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{kpi.total}</p>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => { setActiveTab("all"); setTodayOnly(false); }}
              >
                View All
              </button>
            </div>
            {/* Pending */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending</span>
                <span className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-orange-500" />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{kpi.pending}</p>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => { setActiveTab("pending"); setTodayOnly(false); }}
              >
                View Pending
              </button>
            </div>
            {/* Completed */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</span>
                <span className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{kpi.completed}</p>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => { setActiveTab("completed"); setTodayOnly(false); }}
              >
                View Completed
              </button>
            </div>
            {/* Due Today */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Today</span>
                <span className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-blue-500" />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{kpi.dueToday}</p>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => { setActiveTab("all"); setTodayOnly(true); }}
              >
                View Today
              </button>
            </div>
            {/* Overdue */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Overdue</span>
                <span className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{kpi.overdue}</p>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => { setActiveTab("overdue"); setTodayOnly(false); }}
              >
                View Overdue
              </button>
            </div>
          </div>

          {/* Table card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`py-3.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === t.key
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search homework..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
              </div>
              {/* Subject filter */}
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              >
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {/* Teacher filter (backed by data) */}
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              >
                {teachers.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {/* Due-date sort */}
              <select
                value={dueSort}
                onChange={(e) => setDueSort(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              >
                <option>Due Date</option>
                <option>Earliest Due</option>
                <option>Latest Due</option>
              </select>
              {/* Clear filters */}
              <button
                onClick={() => {
                  setSearch("");
                  setSubjectFilter("All Subjects");
                  setTeacherFilter("All Teachers");
                  setDueSort("Due Date");
                  setTodayOnly(false);
                  setActiveTab("all");
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                <Filter className="w-4 h-4" />
                Clear
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                      Homework
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Subject
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Assigned By
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Due Date
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                        No homework found.
                      </td>
                    </tr>
                  )}
                  {filtered.map((hw, idx) => (
                    <tr
                      key={hw.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}
                    >
                      {/* Title */}
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{hw.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{hw.subtitle}</p>
                      </td>
                      {/* Subject */}
                      <td className="px-4 py-4">
                        <span className="text-slate-700 font-medium">{hw.subject}</span>
                      </td>
                      {/* Assigned By */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(hw.initials)}`}
                          >
                            {hw.initials}
                          </span>
                          <span className="text-slate-700 text-xs font-medium whitespace-nowrap">{hw.assignedBy}</span>
                        </div>
                      </td>
                      {/* Due Date */}
                      <td className="px-4 py-4">
                        <p className="text-slate-700 text-xs font-medium">{hw.dueDateDisplay}</p>
                        <div className="mt-1">
                          <DueBadge relative={hw.dueRelative} />
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-4">
                        <StatusBadge status={hw.status} />
                      </td>
                      {/* Action */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedHwId(hw.id); setSubmitText(""); }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                          {hw.attachmentUrl && (
                            <a
                              href={hw.attachmentUrl}
                              download={hw.attachment}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Download ${hw.attachment}`}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-purple-600"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Showing {filtered.length === 0 ? 0 : 1} to {filtered.length} of {HOMEWORK.length} homework
              </span>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" disabled>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-purple-600 text-white text-xs font-bold">1</span>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" disabled>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          {/* Homework Calendar */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">Homework Calendar</h3>
            </div>
            {/* Month/year */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shiftCal(-1)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-xs font-bold text-slate-700">{calLabel}</span>
              <button onClick={() => shiftCal(1)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 py-0.5">
                  {d}
                </div>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calBlanks.map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {calDays.map((day) => {
                const isToday = calIsCurrentMonth && day === now0.getDate();
                const isDue = dueCalDays.has(day);
                return (
                  <div
                    key={day}
                    className={`text-center text-xs py-1 rounded-full cursor-default select-none font-medium transition-colors
                      ${isToday && isDue
                        ? "bg-purple-600 text-white ring-2 ring-orange-400"
                        : isToday
                        ? "ring-2 ring-orange-400 text-slate-700"
                        : isDue
                        ? "bg-purple-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                      }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" /> Due
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full border-2 border-orange-400 inline-block" /> Today
              </span>
            </div>
          </div>

          {/* Due Today section */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-slate-800">Due Today ({dueTodayRows.length})</h3>
            </div>
            <div className="flex flex-col gap-2">
              {dueTodayRows.length === 0 && (
                <p className="text-xs text-slate-400 px-1 py-2">Nothing due today.</p>
              )}
              {dueTodayRows.map((hw) => (
                <div key={hw.id} className="flex items-start gap-2 p-2.5 bg-orange-50 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{hw.title}</p>
                    <p className="text-xs text-slate-500">{hw.subject}</p>
                    <p className="text-xs text-orange-600 font-medium mt-0.5">Due: Today</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Study Tips */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-center mb-3">
              {/* Inline SVG illustration */}
              <svg width="64" height="48" viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="8" width="36" height="32" rx="4" fill="#ede9fe" />
                <rect x="12" y="14" width="24" height="3" rx="1.5" fill="#7c3aed" opacity="0.4" />
                <rect x="12" y="20" width="20" height="3" rx="1.5" fill="#7c3aed" opacity="0.3" />
                <rect x="12" y="26" width="16" height="3" rx="1.5" fill="#7c3aed" opacity="0.2" />
                <circle cx="48" cy="16" r="10" fill="#fde68a" />
                <path d="M48 10 L50 14 L54 14 L51 17 L52 21 L48 19 L44 21 L45 17 L42 14 L46 14 Z" fill="#f59e0b" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800 text-center mb-2">Plan your time wisely</h3>
            <ul className="flex flex-col gap-1.5">
              <li className="flex items-start gap-2 text-xs text-slate-600">
                <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                Start with the hardest subject first.
              </li>
              <li className="flex items-start gap-2 text-xs text-slate-600">
                <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                Take a 5-minute break every 25 minutes.
              </li>
            </ul>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setActiveTab("completed"); setTodayOnly(false); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-purple-50 hover:border-purple-200 transition-colors group"
              >
                <FileText className="w-5 h-5 text-purple-500 group-hover:text-purple-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-purple-700 text-center leading-tight">My Submissions</span>
              </button>
              <button
                onClick={() => {
                  if (!nextPendingRow) { toast.success("You're all caught up — nothing pending!"); return; }
                  setSelectedHwId(nextPendingRow.id);
                  setSubmitText("");
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-green-50 hover:border-green-200 transition-colors group"
              >
                <Send className="w-5 h-5 text-green-500 group-hover:text-green-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-green-700 text-center leading-tight">Submit Homework</span>
              </button>
              <button
                onClick={() => navigate("/communication/messages")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-colors group"
              >
                <HelpCircle className="w-5 h-5 text-blue-500 group-hover:text-blue-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-blue-700 text-center leading-tight">Homework Help</span>
              </button>
              <button
                onClick={() => navigate("/student/notifications")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-orange-50 hover:border-orange-200 transition-colors group"
              >
                <Bell className="w-5 h-5 text-orange-500 group-hover:text-orange-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-orange-700 text-center leading-tight">Reminders</span>
              </button>
            </div>
          </div>

          {/* Stay on Top! banner */}
          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-4 flex items-center gap-3 overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute right-2 top-2 opacity-20">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="28" stroke="white" strokeWidth="2" />
                <path d="M20 40 L20 20 L30 26 L40 20 L40 40" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Illustration */}
            <div className="flex-shrink-0">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Book */}
                <rect x="6" y="12" width="26" height="30" rx="3" fill="#fde68a" />
                <rect x="10" y="12" width="3" height="30" fill="#f59e0b" />
                <rect x="15" y="18" width="12" height="2" rx="1" fill="#d97706" opacity="0.5" />
                <rect x="15" y="23" width="10" height="2" rx="1" fill="#d97706" opacity="0.4" />
                <rect x="15" y="28" width="8" height="2" rx="1" fill="#d97706" opacity="0.3" />
                {/* Pencil */}
                <rect x="32" y="6" width="8" height="28" rx="2" transform="rotate(15 32 6)" fill="#f97316" />
                <polygon points="38,32 42,36 34,36" fill="#fcd34d" transform="rotate(15 38 32)" />
                <rect x="32" y="6" width="8" height="5" rx="2" transform="rotate(15 32 6)" fill="#d1d5db" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Stay on Top!</p>
              <p className="text-purple-200 text-xs mt-1 leading-relaxed">
                Complete your homework on time and keep learning every day.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details / Submit modal */}
      {selectedRow && selectedRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedHwId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">{selectedRow.subject}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{selectedRow.title}</h3>
                <p className="text-sm text-slate-400">Due: {selectedRow.dueDateDisplay} · {selectedRow.assignedBy}</p>
              </div>
              <button onClick={() => setSelectedHwId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 mt-1">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {getSubmission(selectedRaw.id) ? (
              <div className="px-6 py-8 text-center">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <h4 className="font-bold text-slate-900 mb-1">Already Submitted</h4>
                <p className="text-sm text-slate-400">
                  You submitted this homework on{" "}
                  {new Date(getSubmission(selectedRaw.id).submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <button onClick={() => setSelectedHwId(null)} className="mt-4 h-10 px-6 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">Close</button>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 space-y-4">
                  {selectedRow.subtitle && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Description</p>
                      <p className="text-sm text-slate-700">{selectedRow.subtitle}</p>
                    </div>
                  )}
                  {selectedRow.attachmentUrl && (
                    <a
                      href={selectedRow.attachmentUrl}
                      download={selectedRow.attachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                    >
                      <span className="text-slate-700 truncate flex-1 font-medium flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> {selectedRow.attachment}</span>
                      <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0" />
                    </a>
                  )}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Your Answer / Response</label>
                    <textarea
                      value={submitText}
                      onChange={(e) => setSubmitText(e.target.value)}
                      rows={5}
                      placeholder="Write your answer here..."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={() => setSelectedHwId(null)} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                  <button
                    onClick={handleSubmitHomework}
                    disabled={isSubmitting || !submitText.trim()}
                    className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isSubmitting ? "Submitting..." : (<><Send className="h-3.5 w-3.5" /> Submit Homework</>)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
