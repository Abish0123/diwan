import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useAssignments } from "@/contexts/AssignmentContext";
import { useNotices } from "@/contexts/NoticeContext";
import { filterAnnouncementsForViewer } from "@/lib/announcementAudience";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users, GraduationCap, ClipboardList, CheckCircle2, BarChart3, Award,
  CalendarCheck, FilePlus2, UploadCloud, CalendarRange, ChevronDown, ChevronRight,
  Clock, FileText, Bell, Trophy, Medal, BookOpen, MessageSquare, Video,
  ClipboardCheck, Smile,
} from "lucide-react";

/* ── Shared primitives (matched to TeacherAttendance / StudyMaterials / TeacherBehavior) ── */

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

const EVENT_BADGE: Record<string, string> = {
  Academic: "bg-blue-50 text-purple-600",
  Exam: "bg-rose-50 text-rose-600",
  Meeting: "bg-amber-50 text-amber-600",
};

const MEDAL_TONE = ["bg-amber-100 text-amber-600", "bg-slate-200 text-slate-600", "bg-orange-100 text-orange-600"];

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return "recently";
  const diff = Date.now() - d;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

const SECTION_DOT: Record<string, string> = {
  A: "bg-purple-500", B: "bg-blue-500", C: "bg-green-500",
};
const SUBJECT_ACTION_LINKS = [
  { label: "Attendance", path: "/teacher/attendance", icon: CalendarCheck },
  { label: "Materials",  path: "/teacher/study-materials", icon: UploadCloud },
  { label: "Assignments",path: "/teacher/assignments", icon: ClipboardList },
  { label: "Homework",   path: "/teacher/homework", icon: FilePlus2 },
];

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { assignment, classStudents } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const { assignments } = useAssignments();
  const { notices } = useNotices();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const grade = assignment.grade || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();
  const className = assignment.className || `${grade} - ${section}`;
  const firstName = (() => {
    const raw = (assignment.teacherName || user?.displayName || user?.email?.split("@")[0] || "Teacher").trim();
    const parts = raw.split(/\s+/).filter(p => !/^(mr|mrs|ms|miss|dr|prof|sir|madam)\.?$/i.test(p));
    return (parts[0] || raw.split(/\s+/)[0] || "Teacher");
  })();

  /* ── Real attendance / behavior load (preserved wiring) ── */
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [behaviorIncidents, setBehaviorIncidents] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const recs = await smartDb.getAll("AttendanceRecord", user.uid) as any[];
        if (!active) return;
        const map: Record<string, string> = {};
        (recs || []).filter(r => (r.date || "").slice(0, 10) === todayStr)
          .forEach(r => { map[r.studentId] = r.status; });
        setAttendance(map);
      } catch { /* ignore */ }
      try {
        const inc = await smartDb.getAll("BehaviorIncident", user.uid) as any[];
        if (active) setBehaviorIncidents(inc || []);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [user, todayStr]);

  const classIds = useMemo(() => new Set(classStudents.map(s => s.id)), [classStudents]);

  const totalStudents = classStudents.length;
  const presentReal = classStudents.filter(s => attendance[s.id] === "Present" || attendance[s.id] === "P").length;
  const markedToday = Object.keys(attendance).some(id => classIds.has(id));

  const attendancePct = markedToday && totalStudents
    ? Math.round((presentReal / totalStudents) * 100)
    : 0;

  const pendingAssignments = useMemo(() =>
    assignments.filter(a => a.status !== "Completed" && a.status !== "Graded").length,
    [assignments]);

  /* ── Today's timetable with live "Current" derivation ── */
  const timetable = useMemo(() => {
    const nowMins = today.getHours() * 60 + today.getMinutes();
    const parse = (label: string) => {
      // label like "08:00 - 08:45 AM" or "08:00 - 09:00" — derive a comparable start/end in minutes
      const m = label.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (!m) return { start: 0, end: 0 };
      const mer = (m[5] || "AM").toUpperCase();
      const to24 = (h: number) => (mer === "PM" && h !== 12 ? h + 12 : mer === "AM" && h === 12 ? 0 : h);
      const sh = to24(parseInt(m[1], 10));
      const eh = to24(parseInt(m[3], 10));
      return { start: sh * 60 + parseInt(m[2], 10), end: eh * 60 + parseInt(m[4], 10) };
    };

    try {
      const stored = localStorage.getItem("sd_teacher_timetables");
      if (stored) {
        const data = JSON.parse(stored);
        const name = assignment.teacherName || "Mr. Rizwan Ahmed";
        const teacherData = data[name];
        if (teacherData && teacherData.schedule) {
          const day = today.getDay();
          const dayIdx = day === 0 ? 0 : day - 1; // default Monday
          const list: { period: number; subject: string; grade: string; time: string; status: "Completed" | "Current" | "Upcoming" }[] = [];
          
          teacherData.schedule.forEach((row: any[], ri: number) => {
            const slot = row[dayIdx];
            if (slot) {
              const timeRange = teacherData.times?.[ri] || "08:00 - 09:00";
              const { start, end } = parse(timeRange);
              let status: "Completed" | "Current" | "Upcoming" = "Upcoming";
              if (nowMins >= end) status = "Completed";
              else if (nowMins >= start && nowMins < end) status = "Current";
              
              list.push({
                period: ri + 1,
                subject: slot.subject,
                grade: `${slot.grade} - ${slot.section}`,
                time: timeRange,
                status
              });
            }
          });
          if (list.length > 0) return list;
        }
      }
    } catch {}

    return [];
  }, [today, assignment.teacherName]);

  /* ── Recent Assignments ── */
  const recentAssignments = useMemo(() => {
    return assignments.slice(0, 4).map(a => ({
      id: a.id,
      title: a.title,
      subject: a.subject || "—",
      grade: className,
      due: a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : "—",
      status: a.status || "Pending",
      tone: a.status === "Completed" || a.status === "Graded" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
    }));
  }, [assignments, className]);

  /* ── Recent Notices — audience-scoped: staff only see Staff/All broadcasts ── */
  const recentNotices = useMemo(() => {
    return filterAnnouncementsForViewer(notices, role || "class_teacher")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
      .map((n, i) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        ago: timeAgo(n.date),
        unread: i < 2,
      }));
  }, [notices, role]);

  /* ── Class overview donut ── */
  const overview = useMemo(() => {
    const total = totalStudents;
    const present = markedToday ? classStudents.filter(s => attendance[s.id] === "Present" || attendance[s.id] === "P").length : 0;
    const absent  = markedToday ? classStudents.filter(s => attendance[s.id] === "Absent"  || attendance[s.id] === "A").length : 0;
    const late    = markedToday ? classStudents.filter(s => attendance[s.id] === "Late"    || attendance[s.id] === "L").length : 0;
    const denom = present + absent + late || 1;
    return {
      total,
      present, absent, late,
      pPct: ((present / denom) * 100).toFixed(2),
      aPct: ((absent / denom) * 100).toFixed(2),
      lPct: ((late / denom) * 100).toFixed(2),
    };
  }, [attendance, classStudents, markedToday, totalStudents]);

  const donutCirc = 2 * Math.PI * 40;
  const donutSegments = [
    { value: Number(overview.pPct), color: "#10b981" },
    { value: Number(overview.aPct), color: "#ef4444" },
    { value: Number(overview.lPct), color: "#f59e0b" },
  ];
  let donutOffset = -90;

  /* ── KPI cards ── */
  const KPIS = [
    { icon: GraduationCap, bg: "bg-purple-50",  ic: "text-purple-500",  value: 3,              label: "My Classes",          sub: "3 Active Classes",  spark: "#8b5cf6", data: [2, 2, 3, 3, 3, 3, 3] },
    { icon: Users,         bg: "bg-blue-50",     ic: "text-blue-500",    value: totalStudents,  label: "Total Students",      sub: "Across all classes", spark: "#3b82f6", data: [80, 84, 88, 90, 92, 94, 96] },
    { icon: ClipboardList, bg: "bg-orange-50",   ic: "text-orange-500",  value: pendingAssignments, label: "Pending Assignments", sub: "Need your review", spark: "#f97316", data: [18, 16, 15, 14, 13, 12, 12] },
    { icon: CheckCircle2,  bg: "bg-emerald-50",  ic: "text-emerald-500", value: `${attendancePct}%`, label: "Attendance Today", sub: "Present Students", spark: "#10b981", data: [86, 88, 90, 89, 91, 92, attendancePct] },
    { icon: BarChart3,     bg: "bg-pink-50",     ic: "text-pink-500",    value: "85%",          label: "Class Average",       sub: "This Month",         spark: "#ec4899", data: [78, 80, 81, 83, 82, 84, 85] },
    { icon: Award,         bg: "bg-amber-50",    ic: "text-amber-500",   value: 18,             label: "Achievements",        sub: "This Month",         spark: "#f59e0b", data: [9, 11, 12, 14, 15, 16, 18] },
  ];

  const headerButtons = [
    { label: "Take Attendance",   icon: CalendarCheck, fn: () => navigate("/teacher/attendance") },
    { label: "Create Assignment", icon: FilePlus2,     fn: () => navigate("/teacher/assignments") },
    { label: "Upload Material",   icon: UploadCloud,   fn: () => navigate("/teacher/study-materials") },
  ];

  const quickLinks = [
    { label: "Gradebook",       icon: ClipboardCheck, bg: "bg-purple-50",  ic: "text-purple-600", fn: () => navigate("/teacher/assessments") },
    { label: "Report Cards",    icon: FileText,       bg: "bg-blue-50",    ic: "text-purple-600",   fn: () => navigate("/teacher/report-cards") },
    { label: "Students",        icon: Users,          bg: "bg-emerald-50", ic: "text-emerald-600", fn: () => navigate("/teacher/my-class") },
    { label: "Message Class",   icon: MessageSquare,  bg: "bg-amber-50",   ic: "text-amber-600",  fn: () => toast.success(`Message sent to ${className}`) },
    { label: "Study Materials", icon: BookOpen,       bg: "bg-pink-50",    ic: "text-pink-600",   fn: () => navigate("/teacher/study-materials") },
    { label: "Live Classes",    icon: Video,          bg: "bg-indigo-50",  ic: "text-purple-600", fn: () => navigate("/academics/live-classes") },
    { label: "Exams",           icon: ClipboardList,  bg: "bg-rose-50",    ic: "text-rose-600",   fn: () => navigate("/teacher/assessments") },
    { label: "Behavior",        icon: Smile,          bg: "bg-teal-50",    ic: "text-teal-600",   fn: () => navigate("/teacher/behavior") },
  ];

  const statusBadge = (s: string) =>
    s === "Completed" ? "bg-slate-100 text-slate-500" :
    s === "Current"   ? "bg-emerald-50 text-emerald-600" :
    "bg-blue-50 text-purple-600";

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Greeting header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StudentAvatar name={firstName} />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Good Morning, {firstName}! 👋</h1>
              <p className="text-sm text-slate-400">Welcome back! Here's what's happening in your classes today.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerButtons.map(b => (
              <button key={b.label} onClick={b.fn}
                className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <b.icon className="h-4 w-4 text-slate-500" /> {b.label}
              </button>
            ))}
            <button onClick={() => navigate("/teacher/my-class")}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <CalendarRange className="h-4 w-4" /> View Timetable <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-6 gap-3">
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

        {/* ── My Subject Classes ─────────────────────────────────── */}
        {mySubjects.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">My Subject Classes</p>
                  <p className="text-[11px] text-slate-400">{mySubjects.length} subject{mySubjects.length !== 1 ? "s" : ""} assigned · full access per class</p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {mySubjects.map(sa => (
                <div key={sa.id} className="px-5 py-3 flex items-center gap-4">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", SECTION_DOT[sa.section] || "bg-slate-400")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{sa.subject}</p>
                    <p className="text-[11px] text-slate-400">{sa.grade} · Section {sa.section}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {SUBJECT_ACTION_LINKS.map(link => (
                      <button key={link.label} onClick={() => navigate(link.path)}
                        title={link.label}
                        className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-violet-50 hover:text-purple-600 text-slate-500 flex items-center justify-center transition-colors">
                        <link.icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Three-column body */}
        <div className="grid grid-cols-3 gap-5">

          {/* LEFT column */}
          <div className="space-y-5">

            {/* Today's Timetable */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Today's Timetable</h3>
                <button onClick={() => navigate("/teacher/my-class")}
                  className="text-xs text-purple-600 font-semibold hover:underline">View Full Timetable</button>
              </div>
              {timetable.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No timetable published yet</p>
              )}
              {timetable.length > 0 && (
                <div className="space-y-2">
                  {timetable.map(p => (
                    <div key={p.period} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.period}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{p.subject}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {p.time}
                        </p>
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0", statusBadge(p.status))}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Events */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Upcoming Events</h3>
                <button className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <p className="text-sm text-slate-400 text-center py-4">No upcoming events</p>
            </div>
          </div>

          {/* CENTER column */}
          <div className="space-y-5">

            {/* Class Overview */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Class Overview</h3>
                <button className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                  This Month <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="110" height="110" viewBox="0 0 110 110">
                    {donutSegments.map((s, i) => {
                      const dash = (s.value / 100) * donutCirc;
                      const seg = (
                        <circle key={i} cx="55" cy="55" r="40" fill="none" stroke={s.color} strokeWidth="14"
                          strokeDasharray={`${dash} ${donutCirc - dash}`} transform={`rotate(${donutOffset} 55 55)`} />
                      );
                      donutOffset += (s.value / 100) * 360;
                      return seg;
                    })}
                    <circle cx="55" cy="55" r="31" fill="white" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-900 leading-none">{overview.total}</span>
                    <span className="text-[9px] text-slate-400 leading-none mt-0.5">Students</span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {[
                    { label: "Present", value: overview.present, pct: overview.pPct, color: "bg-emerald-500" },
                    { label: "Absent",  value: overview.absent,  pct: overview.aPct, color: "bg-rose-500" },
                    { label: "Late",    value: overview.late,    pct: overview.lPct, color: "bg-amber-500" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1.5">
                      <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", r.color)} />
                      <span className="text-[11px] text-slate-600 flex-1">{r.label}</span>
                      <span className="text-[11px] font-semibold text-slate-700">{r.value} ({r.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-100">
                {[
                  { label: "Assignments Given", value: assignments.length },
                  { label: "Submitted",         value: assignments.filter(a => a.status === "Submitted" || a.status === "Graded" || a.status === "Completed").length },
                  { label: "Graded",            value: assignments.filter(a => a.status === "Graded").length },
                  { label: "Pending Review",    value: assignments.filter(a => a.status === "Submitted").length },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-lg font-bold text-slate-900 leading-none">{s.value}</p>
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Assignments */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Recent Assignments</h3>
                <button onClick={() => navigate("/teacher/assignments")}
                  className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              {recentAssignments.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No assignments yet</p>
              )}
              {recentAssignments.length > 0 && (
                <div className="space-y-2.5">
                  {recentAssignments.map(a => (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{a.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">{a.subject} · {a.grade}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-slate-400">{a.due}</p>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md inline-block mt-0.5", a.tone)}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Recent Notices */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Recent Notices</h3>
                <button onClick={() => navigate("/communication/announcements")}
                  className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              {recentNotices.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No notices published yet</p>
              )}
              {recentNotices.length > 0 && (
                <div className="space-y-3">
                  {recentNotices.map(n => (
                    <div key={n.id} className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{n.title}</p>
                          {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug mt-0.5">{n.content}</p>
                        <p className="text-[10px] text-slate-300 mt-1">{n.ago}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Performers */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-500" /> Top Performers
                </h3>
                <button onClick={() => navigate("/teacher/my-class")}
                  className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              {classStudents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No student data available yet</p>
              ) : (
                <div className="space-y-2.5">
                  {classStudents.slice(0, 3).map((p: any, i) => (
                    <div key={p.id} className="flex items-center gap-2.5">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0", MEDAL_TONE[i])}>
                        {i + 1}
                      </div>
                      <StudentAvatar name={p.name || "—"} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{className}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Links</h3>
              <div className="grid grid-cols-4 gap-2">
                {quickLinks.map(q => (
                  <button key={q.label} onClick={q.fn}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", q.bg)}>
                      <q.icon className={cn("h-4 w-4", q.ic)} />
                    </div>
                    <span className="text-[9px] font-semibold text-slate-600 text-center leading-tight">{q.label}</span>
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
