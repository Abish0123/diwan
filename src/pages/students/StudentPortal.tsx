import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { filterAnnouncementsForViewer } from "@/lib/announcementAudience";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, FileText, Calendar, Trophy, Award,
  BookOpen, TrendingUp, Clock, Star, ArrowRight,
  GraduationCap, BarChart3, BookMarked, Video,
  Megaphone, Brain, Library, DollarSign, Zap,
  ChevronRight, Users, Activity, Target, Shield, AlertCircle
} from "lucide-react";
import { FeedbackRequestWidget } from "@/components/dashboard/FeedbackRequestWidget";

// Real "Today's Schedule" is derived from the same published admin timetable
// (timetable_slots) the full Timetable page reads — see src/pages/student/Timetable.tsx.
// Previously this dashboard invented a fake schedule (a seeded pick from a
// static subject/teacher list) regardless of what the school actually
// published, which could show a student a class that doesn't exist.
type PortalSlotType = { kind: "period" | "break" | "assembly"; time: string; label: string };
const PORTAL_SLOTS: PortalSlotType[] = [
  { kind: "period",   time: "08:00 - 08:45", label: "08:00 AM" },
  { kind: "period",   time: "08:45 - 09:30", label: "08:45 AM" },
  { kind: "period",   time: "09:30 - 10:15", label: "09:30 AM" },
  { kind: "break",    time: "10:15 - 10:35 AM", label: "BREAK" },
  { kind: "period",   time: "10:35 - 11:20", label: "10:35 AM" },
  { kind: "period",   time: "11:20 - 12:05", label: "11:20 AM" },
  { kind: "period",   time: "12:05 - 12:50", label: "12:05 PM" },
  { kind: "break",    time: "12:50 - 01:30 PM", label: "LUNCH BREAK" },
  { kind: "period",   time: "01:30 - 02:15", label: "01:30 PM" },
  { kind: "assembly", time: "02:15 - 02:30", label: "Assembly / School Auditorium" },
];

function mapPortalSlotToAdminPeriod(slotIndex: number): number | null {
  if (slotIndex === 0) return 0;
  if (slotIndex === 1) return 1;
  if (slotIndex === 2) return 2;
  if (slotIndex === 4) return 3;
  if (slotIndex === 5) return 4;
  return null;
}

function getPeriodStatus(start: string): "Completed" | "Current" | "Upcoming" {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const total = h * 60 + m;

  const parseTime = (t: string) => {
    const [hm, ampm] = t.split(" ");
    let [hh, mm] = hm.split(":").map(Number);
    if (ampm === "PM" && hh !== 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;
    return hh * 60 + mm;
  };

  const startMin = parseTime(start);
  if (total > startMin + 45) return "Completed";
  if (total >= startMin) return "Current";
  return "Upcoming";
}

// Mirrors the grade-key normalization in student/Timetable.tsx so lookups
// against the admin-published grid ("Grade 3-B") actually match.
function normalizeTimetableGrade(raw?: string): string {
  const g = raw ? String(raw).trim() : "";
  if (!g) return "";
  if (/^grade\s/i.test(g)) return g.replace(/^grade\s+/i, "Grade ");
  if (/^(pre-?kg|lkg|ukg|kg)/i.test(g)) return g;
  return `Grade ${g}`;
}

// Circular Progress Component for Premium Stats
function CircularProgress({ percent, size = 60, strokeWidth = 5, colorClass = "text-purple-600" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        <circle
          className="text-slate-100 dark:text-slate-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={colorClass}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-xs font-black text-slate-800 dark:text-white">{percent}%</span>
    </div>
  );
}

export default function StudentPortal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students } = useStudents();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [timetableGrid, setTimetableGrid] = useState<Record<string, any> | null>(null);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return (students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0]) as any;
  }, [students, user]);

  const grade = student?.grade || "Grade 5";
  const section = student?.section || "A";
  const firstName = (student?.name || user?.displayName || "Student").split(" ")[0];

  // Real published timetable, same source as the full Timetable page.
  const todayTimetable = useMemo(() => {
    if (!timetableGrid || !student) return [];
    const normGrade = normalizeTimetableGrade(student.grade);
    const normSection = student.section ? String(student.section).trim().toUpperCase() : "";
    if (!normGrade || !normSection) return [];
    const key = `${normGrade}-${normSection}`;
    const norm = (k: string) => k.replace(/\s+/g, "").toLowerCase();
    const foundKey = Object.keys(timetableGrid).find(k => norm(k) === norm(key));
    const classGrid = foundKey ? timetableGrid[foundKey] : null;
    if (!classGrid) return [];

    const day = new Date().getDay();
    const dayIdx = day === 0 ? -1 : day - 1; // 0=Mon..5=Sat, -1 = Sunday (no school)
    if (dayIdx < 0 || dayIdx > 5) return [];

    const out: { period: number; start: string; subject: { name: string; teacher: string; room: string }; status: "Completed" | "Current" | "Upcoming" }[] = [];
    let periodNo = 0;
    PORTAL_SLOTS.forEach((slot, si) => {
      if (slot.kind !== "period") return;
      periodNo += 1;
      const adminIdx = mapPortalSlotToAdminPeriod(si);
      const cell = adminIdx !== null ? classGrid[adminIdx]?.[dayIdx] : null;
      if (!cell) return;
      out.push({
        period: periodNo,
        start: slot.label,
        subject: { name: cell.subject, teacher: cell.teacher, room: cell.room },
        status: getPeriodStatus(slot.label),
      });
    });
    return out;
  }, [timetableGrid, student]);

  useEffect(() => {
    const load = async () => {
      try {
        const [asgn, ex, asmt, ntc, achv, att] = await Promise.allSettled([
          smartDb.getAll("TeacherAssignment", undefined),
          smartDb.getAll("sd_exams", undefined),
          smartDb.getAll("Assessment", undefined),
          smartDb.getAll("Notice", undefined),
          smartDb.getAll("Achievement", undefined),
          smartDb.getAll("TeacherAttendance", undefined),
        ]);
        if (asgn.status === "fulfilled") setAssignments((asgn.value || []) as any[]);
        if (ex.status === "fulfilled") setExams((ex.value || []) as any[]);
        if (asmt.status === "fulfilled") setAssessments((asmt.value || []) as any[]);
        if (ntc.status === "fulfilled") setNotices((ntc.value || []) as any[]);
        if (achv.status === "fulfilled") setAchievements((achv.value || []) as any[]);
        if (att.status === "fulfilled") setAttendance((att.value || []) as any[]);
      } catch (_) {}
      try {
        const res = await fetch("/api/data/timetable_slots/published-timetable-v3");
        if (res.ok) {
          const data = await res.json();
          if (data?.gridJson && !data.error) setTimetableGrid(JSON.parse(data.gridJson));
        }
      } catch (_) {}
    };
    load();
  }, []);

  const myAssignments = assignments.filter((a: any) =>
    (!a.grade || a.grade == grade) && (!a.section || a.section === section)
  );
  const pendingCount = myAssignments.filter((a: any) => a.status !== "Submitted").length || myAssignments.length;

  const myExams = exams.filter((e: any) => {
    const g = e.grade || e.Grade || "";
    const s = e.section || e.Section || "";
    return (!g || g == grade) && (!s || s === section);
  });
  const upcomingExams = myExams.filter((e: any) => {
    const d = e.date || e.startDate || "";
    return d ? new Date(d) >= new Date() : true;
  }).length;

  const myAttRec = attendance.filter((a: any) =>
    (!a.grade || a.grade == grade) && (!a.section || a.section === section)
  );
  const attendancePct = useMemo(() => {
    if (!myAttRec.length || !student) return null;
    let present = 0, total = 0;
    myAttRec.forEach((rec: any) => {
      const s = rec.students || {};
      const sid = student.id;
      if (s[sid]) { total++; if (s[sid] === "P") present++; }
    });
    return total ? Math.round((present / total) * 100) : null;
  }, [myAttRec, student]);

  const myAchievements = achievements.filter((a: any) => {
    const r = a.recipients || a.students || [];
    return r.some((x: any) => x.id === student?.id || x.name === student?.name);
  });

  const myAssessments = assessments.filter((a: any) =>
    (!a.grade || a.grade == grade) && (!a.section || a.section === section)
  );
  const subjectScores = useMemo(() => {
    const map: Record<string, { total: number; count: number; max: number }> = {};
    myAssessments.forEach((a: any) => {
      const subj = a.subject || "General";
      const entries = a.entries || {};
      const marks = entries[student?.id] ?? (typeof entries === "object" ? Object.values(entries)[0] : null);
      if (marks !== null && marks !== undefined) {
        if (!map[subj]) map[subj] = { total: 0, count: 0, max: 0 };
        map[subj].total += Number(marks);
        map[subj].count++;
        map[subj].max += Number(a.totalMarks || 100);
      }
    });
    return Object.entries(map).map(([subject, v]) => {
      const pct = v.max ? Math.round((v.total / v.max) * 100) : 0;
      const grade = pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B" : pct >= 50 ? "C" : "F";
      return { subject, score: `${v.total}/${v.max}`, pct, grade };
    }).sort((a, b) => b.pct - a.pct);
  }, [myAssessments, student]);

  const avgScore = subjectScores.length
    ? Math.round(subjectScores.reduce((s, x) => s + x.pct, 0) / subjectScores.length)
    : null;

  // No fake fallback data: an empty array renders an honest "nothing yet"
  // state in the JSX below instead of a sample dataset dressed up as real.
  const displayGrades = subjectScores.slice(0, 5);

  const displayTasks = myAssignments.slice(0, 5).map((a: any) => ({
    title: a.title, subject: a.subject || "General",
    due: a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
    priority: a.priority || "Medium",
    submitted: a.status === "Submitted",
  }));

  // Audience-enforced: students only see Published notices addressed to
  // Students/All, and class-targeted ones only for their own grade/section.
  const visibleNotices = filterAnnouncementsForViewer(notices, "student", [{ grade, section }], student?.id ? [student.id] : []);
  const displayNotices = visibleNotices.slice(0, 3).map((n: any, i: number) => ({
    title: n.title || n.subject || "Notice",
    desc: n.content || n.body || n.description || "",
    time: n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-GB") : `${i + 1} day${i ? "s" : ""} ago`,
    icon: Megaphone,
    color: "bg-violet-50 text-purple-600 dark:bg-violet-950/20",
  }));

  // Calendar & Tests widget: real upcoming exams/assessments/assignment due
  // dates merged and sorted, not a static fabricated events list.
  const upcomingEvents = useMemo(() => {
    const items: { date: Date; title: string; sub: string }[] = [];
    myExams.forEach((e: any) => {
      const d = e.date || e.startDate;
      if (d) items.push({ date: new Date(d), title: e.name || e.title || e.subject || "Exam", sub: e.subject || "Exam" });
    });
    myAssessments.forEach((a: any) => {
      const d = a.date || a.dueDate;
      if (d) items.push({ date: new Date(d), title: a.title || a.name || a.subject || "Assessment", sub: a.subject || "Assessment" });
    });
    myAssignments.forEach((a: any) => {
      if (a.dueDate) items.push({ date: new Date(a.dueDate), title: a.title || "Assignment", sub: `${a.subject || "Assignment"} due` });
    });
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return items
      .filter(x => !isNaN(x.date.getTime()) && x.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 4)
      .map(x => ({
        month: x.date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
        day: String(x.date.getDate()).padStart(2, "0"),
        monthColor: "bg-gradient-to-br from-violet-500 to-purple-600",
        title: x.title,
        sub: x.sub,
      }));
  }, [myExams, myAssessments, myAssignments]);

  // Today's real attendance mark, if the school has taken it yet — no
  // hardcoded "Present" badge regardless of what actually happened today.
  const todayAttendanceStatus = useMemo(() => {
    if (!student) return null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const rec = myAttRec.find((r: any) => String(r.date || "").slice(0, 10) === todayStr);
    if (!rec) return null;
    const val = (rec.students || {})[student.id];
    if (val === "P") return "Present";
    if (val === "A") return "Absent";
    if (val === "L") return "Late";
    return null;
  }, [myAttRec, student]);

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const QUICK_LINKS = [
    { label: "Study Materials", icon: BookOpen,   color: "bg-violet-55/10 text-violet-700 dark:bg-violet-950/20 hover:scale-105", href: "/student/study-materials" },
    { label: "Flash Cards",     icon: Brain,      color: "bg-amber-55/10 text-amber-700 dark:bg-amber-950/20 hover:scale-105",   href: "/student/flashcards" },
    { label: "Live Classes",    icon: Video,      color: "bg-sky-55/10 text-sky-700 dark:bg-sky-950/20 hover:scale-105",       href: "/academics/live-classes" },
    { label: "Library",         icon: Library,    color: "bg-emerald-55/10 text-emerald-700 dark:bg-emerald-950/20 hover:scale-105", href: "/student/library" },
    { label: "Certificates",    icon: Award,      color: "bg-pink-55/10 text-pink-700 dark:bg-pink-950/20 hover:scale-105",     href: "/student/certificates" },
    { label: "Fee Details",     icon: DollarSign, color: "bg-orange-55/10 text-orange-700 dark:bg-orange-950/20 hover:scale-105", href: "/student/profile" },
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-[1440px] mx-auto space-y-6"
        >
          {/* ── 1. WELCOME BANNER ─────────────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 bg-gradient-to-r from-[#9810fa] via-[#a322a3] to-[#d12386] rounded-[24px] p-8 text-white shadow-xl shadow-[#9810fa]/15 relative overflow-hidden flex flex-col justify-between">
              {/* decorative visual glassmorphism blobs */}
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-xl" />
              <div className="absolute -bottom-16 right-24 w-36 h-36 bg-white/10 rounded-full blur-lg" />
              
              <div>
                <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1.5">{todayStr}</p>
                <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">Hello, {firstName}! 👋</h1>
                <p className="text-white/85 text-sm mt-2 max-w-lg leading-relaxed">
                  Welcome back to your dashboard. Your academics are on track! Check your schedule and achievements below.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-6">
                <span className="flex items-center gap-1.5 text-xs bg-white/15 px-3.5 py-2 rounded-xl font-bold backdrop-blur-md border border-white/10">
                  <GraduationCap className="h-4 w-4 text-pink-200" /> {grade} · Section {section}
                </span>
                {todayAttendanceStatus && (
                  <span className="flex items-center gap-1.5 text-xs bg-white/15 px-3.5 py-2 rounded-xl font-bold backdrop-blur-md border border-white/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300 animate-pulse" /> Today: {todayAttendanceStatus}
                  </span>
                )}
                {student?.studentId && (
                  <span className="text-xs bg-white/15 px-3.5 py-2 rounded-xl font-bold backdrop-blur-md border border-white/10">
                    ID: {student.studentId}
                  </span>
                )}
              </div>
            </div>

            {/* Keep it up card */}
            <div className="w-full lg:w-72 bg-white dark:bg-[#16162A] rounded-[24px] p-6 shadow-sm border border-slate-100 dark:border-slate-800/40 flex flex-col justify-between transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center flex-shrink-0">
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Trophy Track</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Excellent progress this term!</p>
                </div>
              </div>
              
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-500 dark:text-slate-400">Term Progress</span>
                  <span className="text-purple-600 dark:text-violet-400">{avgScore !== null ? `${avgScore}%` : "No data yet"}</span>
                </div>
                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#9810fa] to-[#d12386] rounded-full transition-all duration-1000"
                    style={{ width: `${avgScore ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <FeedbackRequestWidget role="student" uid={user?.uid} studentId={student?.id} grade={student?.grade} section={student?.section} />

          {/* ── 2. PREMIUM STAT CARDS ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Attendance", value: attendancePct !== null ? `${attendancePct}%` : "—", sub: "This Month", icon: Activity, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/10", border: "hover:border-emerald-200 dark:hover:border-emerald-950" },
              { label: "Pending Tasks", value: String(pendingCount), sub: "Due Soon", icon: FileText, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/10", border: "hover:border-blue-200 dark:hover:border-blue-950" },
              { label: "Exams", value: String(upcomingExams), sub: "Scheduled", icon: BookOpen, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/10", border: "hover:border-orange-200 dark:hover:border-orange-950" },
              { label: "Average Score", value: avgScore !== null ? `${avgScore}%` : "—", sub: "Grade average", icon: TrendingUp, color: "text-sky-500", bg: "bg-sky-50 dark:bg-sky-950/10", border: "hover:border-sky-200 dark:hover:border-sky-950" },
              { label: "Achievements", value: String(myAchievements.length), sub: "Medals & Badges", icon: Award, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/10", border: "hover:border-rose-200 dark:hover:border-rose-950" }
            ].map((stat, i) => (
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 300 }}
                key={i}
                className={cn(
                  "bg-white dark:bg-[#16162A] rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800/40 flex items-center gap-4 transition-all",
                  stat.border
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                  <stat.icon className={cn("h-6 w-6", stat.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight mt-0.5">{stat.value}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{stat.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── 3. MAIN CONTENT GRID ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* Timeline Scheduler (Today's Timetable) - 2 cols */}
            <div className="lg:col-span-2 bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 overflow-hidden flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50 dark:border-slate-800/20">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Today's Schedule</h3>
                <Badge variant="secondary" className="text-[10px] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Class Timetable</Badge>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-slate-800/20 flex-1">
                {todayTimetable.length === 0 && (
                  <div className="px-6 py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                    No published classes for today yet.
                  </div>
                )}
                {todayTimetable.map((slot) => {
                  const isLive = slot.status === "Current";
                  return (
                    <div 
                      key={slot.period} 
                      className={cn(
                        "flex items-center gap-4 px-6 py-4 transition-colors relative",
                        isLive && "bg-violet-50/40 dark:bg-violet-950/10"
                      )}
                    >
                      {isLive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600 rounded-r-md" />
                      )}
                      <div className={cn(
                        "w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0",
                        isLive ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      )}>
                        {slot.period}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-extrabold text-slate-800 dark:text-slate-200 text-sm truncate">{slot.subject.name}</p>
                          {isLive && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-purple-600 bg-violet-100 dark:bg-violet-950/50 dark:text-violet-400 px-2 py-0.5 rounded-full animate-pulse border border-violet-200 dark:border-violet-800">
                              ● Ongoing
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{slot.subject.teacher} · {slot.subject.room}</p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{slot.start}</p>
                        <span className={cn(
                          "text-[9px] font-extrabold px-2 py-0.5 rounded-full mt-1 inline-block uppercase tracking-wider",
                          slot.status === "Completed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                          slot.status === "Current"   ? "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" :
                                                        "bg-slate-50 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500"
                        )}>
                          {slot.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-slate-50 dark:border-slate-800/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-purple-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-xs font-bold h-9 rounded-xl"
                  onClick={() => navigate("/student/timetable")}
                >
                  View Full Schedule <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* My Tasks Tracker - 2 cols */}
            <div className="lg:col-span-2 bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 overflow-hidden flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50 dark:border-slate-800/20">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Tasks & Homework</h3>
                <button 
                  onClick={() => navigate("/student/assignments")}
                  className="text-xs text-purple-600 dark:text-violet-400 font-bold hover:underline"
                >
                  View All
                </button>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-slate-800/20 flex-1">
                {displayTasks.length === 0 && (
                  <div className="px-6 py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                    No assignments yet.
                  </div>
                )}
                {displayTasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      task.submitted ? "bg-emerald-50 dark:bg-emerald-950/10" : "bg-blue-50 dark:bg-blue-950/10"
                    )}>
                      {task.submitted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <FileText className="h-5 w-5 text-blue-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{task.subject} · Due {task.due}</p>
                    </div>

                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border-none tracking-wider",
                        task.priority === "High" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400" :
                        task.priority === "Medium" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" :
                                                     "bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-50 dark:border-slate-800/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-purple-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-xs font-bold h-9 rounded-xl"
                  onClick={() => navigate("/student/assignments")}
                >
                  View All Assignments <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Notice Board (Announcements) - 1 col */}
            <div className="lg:col-span-1 bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 overflow-hidden flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50 dark:border-slate-800/20">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Notices</h3>
                <button 
                  onClick={() => navigate("/communication/announcements")}
                  className="text-xs text-purple-600 dark:text-violet-400 font-bold hover:underline"
                >
                  All
                </button>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-slate-800/20 flex-1">
                {displayNotices.length === 0 && (
                  <div className="px-5 py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                    No notices yet.
                  </div>
                )}
                {displayNotices.map((n, i) => (
                  <div key={i} className="p-5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{n.time}</span>
                    </div>
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs leading-tight">{n.title}</h4>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">{n.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-50 dark:border-slate-800/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-purple-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-xs font-bold h-9 rounded-xl"
                  onClick={() => navigate("/communication/announcements")}
                >
                  Open Notices
                </Button>
              </div>
            </div>
          </div>

          {/* ── 4. QUICK LINKS & ACADEMICS ROW ──────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Quick Links Menu */}
            <div className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 p-6 flex flex-col justify-between transition-colors">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base mb-1">Quick Portals</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Access essential modules instantly</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {QUICK_LINKS.map((link, i) => (
                  <button 
                    key={i} 
                    onClick={() => navigate(link.href)}
                    className="flex flex-col items-center gap-2 group outline-none"
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm border border-transparent group-hover:-translate-y-1 group-hover:shadow-md",
                      link.color
                    )}>
                      <link.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 text-center leading-tight group-hover:text-slate-800 dark:group-hover:text-white transition-colors">
                      {link.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Analytics (Grades) */}
            <div className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 overflow-hidden flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50 dark:border-slate-800/20">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Course Grades</h3>
                <button 
                  onClick={() => navigate("/student/gradebook")}
                  className="text-xs text-purple-600 dark:text-violet-400 font-bold hover:underline"
                >
                  Report Card
                </button>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-slate-800/20 flex-1">
                {displayGrades.length === 0 && (
                  <div className="px-6 py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                    No graded assessments yet.
                  </div>
                )}
                {displayGrades.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3.5">
                    <div>
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{g.subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{g.score}</p>
                    </div>
                    <Badge 
                      className={cn(
                        "text-[10px] font-black border-none px-2.5 py-1 rounded-lg",
                        g.grade.includes("A") ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                        g.grade.includes("B") ? "bg-sky-50 text-sky-600 dark:bg-sky-950/20 dark:text-sky-400" :
                                                "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                      )}
                    >
                      {g.grade}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-50 dark:border-slate-800/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-purple-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-xs font-bold h-9 rounded-xl"
                  onClick={() => navigate("/student/gradebook")}
                >
                  Gradebook
                </Button>
              </div>
            </div>

            {/* Academic Growth Progress */}
            <div className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 p-6 flex flex-col justify-between transition-colors">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base mb-1">Learning Path</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Subject progress breakdown</p>
              </div>

              <div className="space-y-4 flex-1 flex flex-col justify-center">
                {displayGrades.length === 0 && (
                  <div className="text-center text-xs text-slate-400 dark:text-slate-500">
                    No subject progress yet.
                  </div>
                )}
                {displayGrades.slice(0, 4).map((g, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{g.subject}</span>
                      <span className="font-black text-[#9810fa] dark:text-violet-400">{g.pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${g.pct}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className={cn(
                          "h-full rounded-full",
                          g.pct >= 85 ? "bg-gradient-to-r from-purple-600 to-purple-600" :
                          g.pct >= 75 ? "bg-gradient-to-r from-pink-500 to-rose-600" :
                                        "bg-gradient-to-r from-amber-500 to-orange-500"
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Events / Calendar */}
            <div className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 p-6 flex flex-col justify-between transition-colors">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base mb-1">Calendar & Tests</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Upcoming assessment deadlines</p>
              </div>

              <div className="space-y-4">
                {upcomingEvents.length === 0 && (
                  <div className="text-center text-xs text-slate-400 dark:text-slate-500">
                    No upcoming exams or deadlines.
                  </div>
                )}
                {upcomingEvents.map((ev, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className={cn("w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm", ev.monthColor)}>
                      <span className="text-[9px] font-black tracking-wider opacity-75">{ev.month}</span>
                      <span className="text-base font-black leading-none mt-0.5">{ev.day}</span>
                    </div>
                    <div className="min-w-0 pt-1">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate leading-snug">{ev.title}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {ev.sub}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 5. ACHIEVEMENTS & INSPIRATIONAL BANNER ────────────────────── */}
          {myAchievements.length > 0 && (
            <div className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800/40 p-6 transition-colors">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" /> Achievement Spotlight
                </h3>
                <button 
                  onClick={() => navigate("/student/achievements")}
                  className="text-xs text-purple-600 dark:text-violet-400 font-bold hover:underline"
                >
                  View Trophy Cabinet
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                {myAchievements.slice(0, 5).map((a: any, i: number) => (
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    key={i} 
                    className="min-w-[200px] bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/10 dark:to-orange-950/10 border border-amber-100/50 dark:border-amber-900/20 rounded-2xl p-5 flex-shrink-0"
                  >
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/40 rounded-xl flex items-center justify-center mb-3">
                      <Trophy className="h-5 w-5 text-amber-600" />
                    </div>
                    <h4 className="font-extrabold text-slate-900 dark:text-slate-200 text-xs leading-snug">{a.title}</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{a.event || a.type}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Inspirational banner */}
          <div className="bg-gradient-to-r from-[#9810fa] to-[#d12386] rounded-[24px] p-8 flex flex-col md:flex-row items-center justify-between shadow-xl shadow-[#9810fa]/15 relative overflow-hidden gap-6">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-lg" />
            <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-white/5 rounded-full blur-md" />
            
            <div className="flex items-center gap-4 relative">
              <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shrink-0">
                <Zap className="h-6 w-6 text-yellow-300" />
              </div>
              <div>
                <h2 className="font-extrabold text-white text-lg">Unleash Your Potential!</h2>
                <p className="text-white/70 text-sm mt-1">Every small effort you make today builds a path toward a global future.</p>
              </div>
            </div>

            <Button 
              className="bg-white text-violet-700 hover:bg-white/95 font-black text-sm px-6 h-11 rounded-2xl shrink-0 shadow-md border-none flex items-center gap-1.5 transition-transform hover:scale-102"
              onClick={() => navigate("/student/study-materials")}
            >
              Access Study Materials <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

        </motion.div>
      </div>
    </DashboardLayout>
  );
}
