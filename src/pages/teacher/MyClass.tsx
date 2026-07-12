import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useAuth } from "@/hooks/useAuth";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import { loadGradebookSources, computeClassGradebook, type GradebookSources } from "@/lib/gradebookEngine";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { useTeacherCalendarEvents } from "@/hooks/useTeacherCalendarEvents";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users, UserCheck, FileText, BarChart3, Star, ChevronRight,
  Search, Plus, Eye, MessageSquare, Clock,
  Calendar, ClipboardList, Award, BookOpen,
  ChevronLeft,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const SUBJECTS = ["Mathematics", "Science", "English", "History", "Computer", "Arabic", "Islamic Studies", "Physical Ed."];
const SLOT_TIMES = [
  { start: "08:00 AM", end: "08:45 AM" },
  { start: "08:45 AM", end: "09:30 AM" },
  { start: "09:45 AM", end: "10:30 AM" },
  { start: "10:30 AM", end: "11:15 AM" },
  { start: "12:00 PM", end: "12:45 PM" },
  { start: "12:45 PM", end: "01:30 PM" },
];
const ROOMS = ["Room 201", "Lab 3", "Room 105", "Room 203", "Lab 1", "Room 107"];
const AVATAR_COLORS = [
  "bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500",
  "bg-sky-500", "bg-rose-500", "bg-violet-500", "bg-teal-500",
];

function getSlotStatus(start: string): "Completed" | "Current" | "Upcoming" {
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  const [hm, ap] = start.split(" ");
  let [hh, mm] = hm.split(":").map(Number);
  if (ap === "PM" && hh !== 12) hh += 12;
  if (ap === "AM" && hh === 12) hh = 0;
  const s = hh * 60 + mm;
  if (total > s + 45) return "Completed";
  if (total >= s) return "Current";
  return "Upcoming";
}

function getGrade(letter: string) {
  const map: Record<string, string> = {
    "A+": "bg-emerald-100 text-emerald-700",
    "A": "bg-blue-100 text-blue-700",
    "B+": "bg-purple-100 text-purple-700",
    "B": "bg-amber-100 text-amber-700",
  };
  return { g: letter, cls: map[letter] || "bg-rose-100 text-rose-700" };
}

function StudentAvatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = name.charAt(0).toUpperCase() + (name.split(" ")[1]?.charAt(0).toUpperCase() || "");
  return (
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", color)}>
      {initials}
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 110 }: { segments: { color: string; pct: number }[]; size?: number }) {
  const r = 40;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = -90;
  const arcs = segments.map(s => {
    const dash = (s.pct / 100) * circ;
    const gap = circ - dash;
    const rotate = offset;
    offset += (s.pct / 100) * 360;
    return { ...s, dash, gap, rotate };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={a.color} strokeWidth="14"
          strokeDasharray={`${a.dash} ${a.gap}`}
          transform={`rotate(${a.rotate} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r="33" fill="white" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MyClass() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { assignment, classStudents } = useTeacherClass();
  const { curriculum } = useCurriculum();
  const { upcoming: upcomingEvents } = useTeacherCalendarEvents();

  const [searchQ, setSearchQ] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 7;

  const grade    = assignment.grade    || "Grade 5";
  const section  = (assignment.section || "B").toUpperCase();
  const gradeNum = parseInt(grade.replace(/grade\s*/i, "").trim() || "5", 10);
  const className = `${grade} - ${section}`;

  const [dbAssignments, setDbAssignments] = useState<any[]>([]);
  const [attRecords, setAttRecords] = useState<any[]>([]);
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);

  useEffect(() => {
    Promise.allSettled([
      smartDb.getAll("TeacherAssignment", undefined),
      smartDb.getAll("TeacherAttendance", undefined),
      loadGradebookSources(),
    ]).then(([a, att, gb]) => {
      if (a.status === "fulfilled") {
        setDbAssignments(((a.value as any[]) || []).filter(r =>
          canonGrade(r.grade) === canonGrade(grade) && canonSection(r.section) === canonSection(section)));
      }
      if (att.status === "fulfilled") {
        setAttRecords(((att.value as any[]) || []).filter(r =>
          canonGrade(r.grade) === canonGrade(grade) && canonSection(r.section) === canonSection(section)));
      }
      if (gb.status === "fulfilled") setGbSources(gb.value as GradebookSources);
    });
  }, [grade, section]);

  // Most recent real attendance record for THIS class (not the whole
  // school's last row, and not today only — falls back to the latest date
  // this class actually has a record for).
  const attMap: Record<string, string> = useMemo(() => {
    const sorted = [...attRecords].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return sorted[0]?.marks || {};
  }, [attRecords]);

  // Real per-student month attendance % from actual TeacherAttendance rows,
  // same computation TeacherAttendance.tsx uses for "This Month Average" —
  // replaces the static seed-time Student.attendance field, which never
  // changes when a teacher actually marks attendance.
  const attPctByStudent = useMemo(() => {
    const map: Record<string, number> = {};
    classStudents.forEach((s: any) => {
      const marked = attRecords.filter(r => r.marks && s.id in r.marks);
      if (marked.length === 0) { map[s.id] = -1; return; }
      const present = marked.filter(r => r.marks[s.id] === "P" || r.marks[s.id] === "Present").length;
      map[s.id] = Math.round((present / marked.length) * 100);
    });
    return map;
  }, [classStudents, attRecords]);

  // Real per-subject, per-student grades via the shared gradebook engine
  // (same source TeacherGradebook.tsx uses) — replaces the always-empty
  // Student.gpa field, which is never populated anywhere in the app.
  const band = useMemo(() => getBandForGrade(curriculum, grade), [curriculum, grade]);
  const gbStudents = useMemo(() =>
    classStudents.map((s: any) => ({ id: String(s.id), name: s.name, grade, section })),
    [classStudents, grade, section]);
  const classGradebook = useMemo(() => {
    if (!gbSources) return [];
    return computeClassGradebook(gbStudents, band, gbSources);
  }, [gbSources, gbStudents, band]);
  const gradebookByStudent = useMemo(() => {
    const map = new Map(classGradebook.map(r => [r.studentId, r]));
    return map;
  }, [classGradebook]);

  const students = useMemo(() => {
    return classStudents.map((s: any, i: number) => {
      const gb = gradebookByStudent.get(String(s.id));
      const avg = gb?.overallPercentage ?? 0;
      const hasGrade = gb?.subjects.some(sub => sub.hasData) ?? false;
      const attPct = attPctByStudent[s.id];
      const att = attPct !== undefined && attPct >= 0 ? attPct : 0;
      const hasAtt = attPct !== undefined && attPct >= 0;
      const { g, cls } = getGrade(hasGrade ? (gb?.overallLetter || "—") : "—");
      return {
        ...s,
        rollNo: s.rollNumber || String(i + 1).padStart(2, "0"),
        admNo: s.studentId || s.id || `—`,
        avg, hasGrade, att, hasAtt, grade: g, gradeCls: cls,
      };
    });
  }, [classStudents, gradebookByStudent, attPctByStudent]);

  const filtered = useMemo(() =>
    students.filter(s =>
      !searchQ ||
      (s.name || "").toLowerCase().includes(searchQ.toLowerCase()) ||
      (s.admNo || "").includes(searchQ)
    ), [students, searchQ]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageStudents = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const presentToday = useMemo(() => {
    return students.filter(s => attMap[s.id] === "P" || attMap[s.id] === "Present").length;
  }, [students, attMap]);

  const pendingAssignments = dbAssignments.filter(a => a.status !== "Graded").length;
  const gradedStudents = students.filter(s => s.hasGrade);
  const classAvg = gradedStudents.length ? Math.round(gradedStudents.reduce((s, st) => s + st.avg, 0) / gradedStudents.length) : 0;
  const achievements = gradedStudents.filter(s => s.avg >= 90).length;
  const attendedStudents = students.filter(s => s.hasAtt);
  const attPct = attendedStudents.length ? Math.round(attendedStudents.reduce((s, st) => s + st.att, 0) / attendedStudents.length) : 0;

  // Real Present/Absent/Late split for the latest marked day (attMap) —
  // previously fabricated as an arbitrary 70/30 split of the remainder.
  const attendanceBreakdown = useMemo(() => {
    const vals = Object.values(attMap);
    const present = vals.filter(v => v === "P" || v === "Present").length;
    const absent = vals.filter(v => v === "A" || v === "Absent").length;
    const late = vals.filter(v => v === "L" || v === "Late").length;
    const total = vals.length || 1;
    return {
      present, absent, late,
      presentPct: Math.round((present / total) * 100),
      absentPct: Math.round((absent / total) * 100),
      latePct: Math.round((late / total) * 100),
    };
  }, [attMap]);

  const todaySchedule = useMemo(() => {
    try {
      const raw = localStorage.getItem("sd_timetables_v3");
      if (!raw) return [];
      const all = JSON.parse(raw);
      const classKey = `${grade}-${section}`;
      const grid = all[classKey];
      if (!grid) return [];
      const dayIdx = Math.min(new Date().getDay() - 1, 5);
      const daySlots: any[] = [];
      (grid as any[][]).forEach((row, ti) => {
        const cell = row[dayIdx];
        if (cell) {
          daySlots.push({
            period: ti + 1,
            subject: cell.subject,
            room: cell.room || "—",
            start: SLOT_TIMES[ti]?.start || "—",
            end: SLOT_TIMES[ti]?.end || "—",
            status: getSlotStatus(SLOT_TIMES[ti]?.start || "08:00 AM"),
          });
        }
      });
      return daySlots;
    } catch { return []; }
  }, [grade, section]);

  const gradeDistribution = useMemo(() => {
    const total = gradedStudents.length || 1;
    const aPlus = gradedStudents.filter(s => s.avg >= 90).length;
    const a = gradedStudents.filter(s => s.avg >= 80 && s.avg < 90).length;
    const bPlus = gradedStudents.filter(s => s.avg >= 70 && s.avg < 80).length;
    const b = gradedStudents.filter(s => s.avg >= 60 && s.avg < 70).length;
    const c = gradedStudents.filter(s => s.avg < 60).length;
    return [
      { label: "A+ (90–100)", color: "#6366f1", pct: Math.round(aPlus / total * 100), count: aPlus },
      { label: "A  (80–89)",  color: "#3b82f6", pct: Math.round(a / total * 100),     count: a },
      { label: "B+ (70–79)", color: "#8b5cf6",  pct: Math.round(bPlus / total * 100), count: bPlus },
      { label: "B  (60–69)",  color: "#f59e0b", pct: Math.round(b / total * 100),     count: b },
      { label: "C  (<60)",    color: "#ef4444", pct: Math.round(c / total * 100),     count: c },
    ];
  }, [gradedStudents]);

  // Real per-subject class averages — mean of each graded student's
  // percentage in that subject, from the same gradebook computation as the
  // roster's Average column (not a hardcoded subject list at 0%).
  const subjectAvgs = useMemo(() => {
    const bySubject = new Map<string, number[]>();
    classGradebook.forEach(row => {
      row.subjects.forEach(sub => {
        if (!sub.hasData) return;
        if (!bySubject.has(sub.subject)) bySubject.set(sub.subject, []);
        bySubject.get(sub.subject)!.push(sub.percentage);
      });
    });
    return Array.from(bySubject.entries())
      .map(([subj, vals]) => ({ subj, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }, [classGradebook]);

  // Real upcoming CalendarEvent rows (same source/audience filter as
  // TeacherDashboard's Upcoming Events) — previously a hardcoded, stale
  // May-2025-dated array.
  const realUpcomingEvents = useMemo(() =>
    upcomingEvents.slice(0, 3).map(ev => {
      const d = new Date(ev.date);
      return {
        id: ev.id,
        day: isNaN(d.getTime()) ? "—" : String(d.getDate()).padStart(2, "0"),
        month: isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short" }),
        title: ev.title,
        sub: ev.time ? `Starts at ${ev.time}` : `Due on ${d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`,
      };
    }), [upcomingEvents]);

  const paginationPages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">My Class</h1>
              <p className="text-sm text-slate-400">Overview and management of your assigned class</p>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { icon: Users,     bg: "bg-purple-50",  ic: "text-purple-500",  value: students.length,    label: "Total Students",       link: "View All Students",  fn: () => navigate("/teacher/students") },
            { icon: UserCheck, bg: "bg-emerald-50", ic: "text-emerald-500", value: presentToday,        label: "Present Today",        link: "View Attendance",    fn: () => navigate("/teacher/attendance") },
            { icon: FileText,  bg: "bg-orange-50",  ic: "text-orange-500",  value: pendingAssignments, label: "Pending Assignments",  link: "View Assignments",   fn: () => navigate("/teacher/assignments") },
            { icon: BarChart3, bg: "bg-blue-50",    ic: "text-blue-500",    value: `${classAvg}%`,     label: "Class Average",        link: "View Gradebook",     fn: () => navigate("/teacher/assessments") },
            { icon: Star,      bg: "bg-pink-50",    ic: "text-pink-500",    value: achievements,       label: "Achievements",         link: "View Achievements",  fn: () => toast.info("Achievements coming soon") },
          ].map((k, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900 leading-none">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
                </div>
              </div>
              <button onClick={k.fn} className="flex items-center gap-1 text-xs text-purple-600 font-semibold hover:underline">
                {k.link} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* ── 2-Column Main Body ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">

          {/* LEFT COLUMN (2/3) */}
          <div className="col-span-2 space-y-5">

            {/* Students in Class */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 text-sm">Students in {className}</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={searchQ}
                      onChange={e => { setSearchQ(e.target.value); setPage(1); }}
                      placeholder="Search student..."
                      className="pl-8 pr-3 h-8 text-xs rounded-lg border border-slate-200 bg-slate-50 w-44 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                  <button
                    onClick={() => navigate("/admissions/new")}
                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700">
                    <Plus className="h-3.5 w-3.5" /> Add Student
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 w-8">#</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Student Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Admission No.</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Attendance</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Average</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Grade</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pageStudents.map((s, i) => (
                      <tr key={s.id || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-sm text-slate-400">{(page - 1) * PER_PAGE + i + 1}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar name={s.name} />
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{s.name}</p>
                              <p className="text-xs text-slate-400">Roll No. {s.rollNo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-500">{s.admNo}</td>
                        <td className="px-5 py-3.5 text-center">
                          {s.hasAtt ? (
                            <span className={cn("text-sm font-semibold",
                              s.att >= 90 ? "text-emerald-600" : s.att >= 75 ? "text-amber-600" : "text-rose-600")}>
                              {s.att}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">No records</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {s.hasGrade ? (
                            <span className={cn("text-sm font-semibold",
                              s.avg >= 80 ? "text-emerald-600" : s.avg >= 70 ? "text-purple-600" : s.avg >= 60 ? "text-amber-600" : "text-rose-600")}>
                              {s.avg.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not graded</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", s.gradeCls)}>
                            {s.grade}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => navigate(`/teacher/students?id=${encodeURIComponent(s.id)}`)}
                              title="View profile"
                              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 transition-colors text-slate-400">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => navigate("/communication/messages")}
                              title="Message parent"
                              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-200 hover:text-purple-600 transition-colors text-slate-400">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} students
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {paginationPages.map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                        page === p
                          ? "bg-purple-600 text-white"
                          : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Class Performance Overview */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900 text-sm">Class Performance Overview</h2>
                <span className="text-xs text-slate-400">All graded work to date</span>
              </div>
              <div className="grid grid-cols-3 gap-6">

                {/* Grade Distribution */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-3">Grade Distribution</p>
                  <div className="flex items-center gap-3">
                    <DonutChart segments={gradeDistribution.map(g => ({ color: g.color, pct: g.pct }))} />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {gradeDistribution.map(g => (
                        <div key={g.label} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                          <span className="text-[10px] text-slate-500 flex-1 truncate">{g.label}</span>
                          <span className="text-[10px] font-semibold text-slate-700 flex-shrink-0 ml-1">
                            {g.count} ({g.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subject Average */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-3">Subject Average</p>
                  {subjectAvgs.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No graded work yet.</p>
                  ) : (
                  <div className="space-y-2.5">
                    {subjectAvgs.map(s => (
                      <div key={s.subj}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600">{s.subj}</span>
                          <span className="text-xs font-semibold text-slate-700">{s.avg}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.avg}%`,
                              background: "linear-gradient(90deg, #7c3aed, #ec4899)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>

                {/* Attendance Overview */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-3">Attendance Overview</p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <DonutChart segments={[
                        { color: "#10b981", pct: attendanceBreakdown.presentPct },
                        { color: "#ef4444", pct: attendanceBreakdown.absentPct },
                        { color: "#f59e0b", pct: attendanceBreakdown.latePct },
                      ]} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-base font-bold text-slate-900">{attPct}%</span>
                        <span className="text-[9px] text-slate-400 leading-none">Average</span>
                        <span className="text-[9px] text-slate-400 leading-none">Attendance</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 w-full">
                      {[
                        { label: "Present", color: "#10b981", icon: "✓", count: attendanceBreakdown.present },
                        { label: "Absent",  color: "#ef4444", icon: "✗", count: attendanceBreakdown.absent },
                        { label: "Late",    color: "#f59e0b", icon: "!", count: attendanceBreakdown.late },
                      ].map(l => (
                        <div key={l.label} className="flex items-center gap-2">
                          <span className="text-[11px] font-bold" style={{ color: l.color }}>{l.icon}</span>
                          <span className="text-[11px] text-slate-500 flex-1">{l.label} Today</span>
                          <span className="text-[11px] font-semibold text-slate-700">{l.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (1/3) */}
          <div className="space-y-4">

            {/* Today's Timetable */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  Class Timetable (Today)
                </h3>
                <button
                  onClick={() => navigate("/teacher/timetable")}
                  className="text-xs text-purple-600 font-semibold hover:underline flex items-center gap-0.5">
                  View Full Timetable <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {todaySchedule.length === 0 && (
                  <p className="text-xs text-slate-400 px-4 py-4 text-center">No timetable published for today.</p>
                )}
                {todaySchedule.map(slot => (
                  <div key={slot.period}
                    className={cn("flex items-center gap-3 px-4 py-2.5",
                      slot.status === "Current" && "bg-purple-50/50")}>
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                      slot.status === "Current"   ? "bg-purple-600 text-white" :
                      slot.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                                                    "bg-slate-100 text-slate-500"
                    )}>
                      {slot.period}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{slot.subject}</p>
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
                          slot.status === "Current"   ? "bg-purple-100 text-purple-700" :
                          slot.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                                                        "bg-slate-100 text-slate-500"
                        )}>
                          {slot.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {slot.start} – {slot.end} · {slot.room}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  Upcoming Events
                </h3>
                <button
                  onClick={() => navigate("/communication/calendar")}
                  className="text-xs text-purple-600 font-semibold hover:underline flex items-center gap-0.5">
                  View Calendar <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {realUpcomingEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 px-4 py-4 text-center">No upcoming events.</p>
                ) : realUpcomingEvents.map((ev, i) => (
                  <div key={ev.id ?? i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex flex-col items-center justify-center flex-shrink-0">
                      <p className="text-[9px] font-bold text-purple-500 uppercase leading-none">{ev.month}</p>
                      <p className="text-base font-bold text-purple-700 leading-tight">{ev.day}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{ev.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ev.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Take\nAttendance",    icon: ClipboardList, bg: "bg-purple-100", ic: "text-purple-600", href: "/teacher/attendance" },
                  { label: "Create\nAssignment",  icon: FileText,      bg: "bg-orange-100", ic: "text-orange-500", href: "/teacher/assignments" },
                  { label: "Enter\nMarks",        icon: BookOpen,      bg: "bg-yellow-100", ic: "text-yellow-600", href: "/teacher/assessments" },
                  { label: "View\nGradebook",     icon: BarChart3,     bg: "bg-blue-100",   ic: "text-purple-600",   href: "/teacher/assessments" },
                  { label: "Message\nClass",      icon: MessageSquare, bg: "bg-pink-100",   ic: "text-pink-600",   href: "/communication/messages" },
                  { label: "Generate\nReport Card",icon: Award,        bg: "bg-emerald-100",ic: "text-emerald-600",href: "/teacher/report-cards" },
                ].map((a, i) => (
                  <button key={i}
                    onClick={() => a.fn ? a.fn() : (window as any).__navigate?.(a.href!) || navigate(a.href!)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", a.bg)}>
                      <a.icon className={cn("h-5 w-5", a.ic)} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight whitespace-pre-line">
                      {a.label}
                    </span>
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
