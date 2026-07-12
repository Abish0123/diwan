import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { RecentNotificationsCard } from "@/components/dashboard/RecentNotificationsCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import { loadGradebookSources, computeStudentGradebook, type GradebookSources } from "@/lib/gradebookEngine";
import { smartDb } from "@/lib/localDb";
import { filterAnnouncementsForViewer } from "@/lib/announcementAudience";
import { useExams, matchesSection } from "@/lib/examStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  UserCheck, BookOpen, FileText, CreditCard, Award, Calendar,
  MessageSquare, TrendingUp, Clock, Users2,
  MapPin, Megaphone, LayoutDashboard, CalendarClock,
  ShieldAlert, HeartPulse, Bus,
} from "lucide-react";

function tagColor(tag: string) {
  switch (tag) {
    case "Exams":      return "bg-rose-50 text-rose-600";
    case "Events":     return "bg-blue-50 text-purple-600";
    case "PTM":        return "bg-violet-50 text-purple-600";
    case "Library":    return "bg-amber-50 text-amber-600";
    default:           return "bg-slate-100 text-slate-600";
  }
}
function eventTypeColor(t: string) {
  switch (t) {
    case "Exam":       return "bg-rose-100 text-rose-600";
    case "Assignment": return "bg-amber-100 text-amber-600";
    default:           return "bg-blue-100 text-purple-600";
  }
}

export default function ParentDashboard() {
  const { children, selected, loading } = useParentChildren();
  const { curriculum } = useCurriculum();
  const navigate = useNavigate();
  const allExams = useExams();

  const [noticeRows, setNoticeRows] = useState<any[]>([]);
  const [outstandingFees, setOutstandingFees] = useState(0);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<number | null>(null);
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);
  const [upcomingHomework, setUpcomingHomework] = useState<{ title: string; date: string }[]>([]);
  const [nextPTM, setNextPTM] = useState<{ date: string; time?: string; status?: string } | null>(null);
  const [latestBehaviour, setLatestBehaviour] = useState<{ type: string; category?: string; date: string } | null>(null);
  const [latestHealthVisit, setLatestHealthVisit] = useState<{ reason?: string; date: string } | null>(null);
  const [transportInfo, setTransportInfo] = useState<{ route?: string; vehicle?: string; stop?: string; status?: string } | null>(null);

  useEffect(() => {
    // Announcements live in the shared "Notice" table (same source as the
    // Announcements page); audience filtering happens below once children load.
    smartDb.getAll("Notice").then((rows: any[]) => setNoticeRows(rows || [])).catch(() => {});
    loadGradebookSources().then(setGbSources).catch(() => setGbSources(null));
  }, []);

  // Enforce audience targeting: parents only see Published notices addressed to
  // Parents/All, and class-targeted ones only when one of their children matches.
  const announcements = useMemo(() => {
    const viewerClasses = children.map((c) => ({ grade: c.grade, section: c.section }));
    const viewerStudentIds = children.map((c) => c.id);
    return filterAnnouncementsForViewer(noticeRows, "parent", viewerClasses, viewerStudentIds)
      .slice(0, 5)
      .map((a: any) => ({
        title: a.title || a.subject || a.message || "Announcement",
        date: a.date || a.createdAt || a.publishedAt || "",
        tag: a.tag || a.category || a.type || "General",
      }));
  }, [noticeRows, children]);

  useEffect(() => {
    if (!selected) return;
    // TeacherAttendance/Homework.grade are stored WITH the "Grade " prefix
    // (e.g. "Grade 3"), but the real Student.grade is stored bare (e.g. "3")
    // — a plain === never matched real records.
    const canonGrade = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const canonSection = (v: any) => String(v ?? "").trim().toUpperCase();

    smartDb.getAll("Invoice").then((rows: any[]) => {
      const mine = (rows || []).filter((inv: any) =>
        inv.studentId === selected.id || (selected.name && inv.entity === selected.name)
      );
      const owed = mine
        .filter((inv: any) => inv.status?.toLowerCase() !== "paid")
        .reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0);
      setOutstandingFees(owed);
    }).catch(() => {});

    smartDb.getAll("TeacherAttendance").then((rows: any[]) => {
      const now = new Date();
      const yr = now.getFullYear(), mo = now.getMonth() + 1;
      const relevant = (rows || []).filter((r: any) =>
        canonGrade(r.grade) === canonGrade(selected.grade) && canonSection(r.section) === canonSection(selected.section) && r.marks?.[selected.id] !== undefined
      );
      let present = 0, total = 0;
      relevant.forEach((r: any) => {
        const d = new Date(r.date || r.createdAt || "");
        if (isNaN(d.getTime()) || d.getFullYear() !== yr || d.getMonth() + 1 !== mo) return;
        const mark = r.marks?.[selected.id];
        if (mark === "P" || mark === "A" || mark === "L") { total++; if (mark === "P") present++; }
      });
      setAttendancePct(total > 0 ? Math.round((present / total) * 100) : null);
    }).catch(() => {});

    // Mirrors ParentAssignments.tsx's real merge exactly: Homework and
    // TeacherAssignment ("Create Assignment") are two separate tables, and an
    // assignment's real status for THIS child comes from their own
    // AssignmentSubmission row, not the due date alone — otherwise anything
    // published via Create Assignment (rather than legacy Homework) was
    // invisible here even though /parent/assignments showed it correctly.
    Promise.all([
      smartDb.getAll("Homework").catch(() => []),
      smartDb.getAll("TeacherAssignment").catch(() => []),
      smartDb.getAll("AssignmentSubmission").catch(() => []),
    ]).then(([hwRows, asgRows, subRows]) => {
      const now = new Date();
      const wantG = canonGrade(selected.grade);
      const wantS = canonSection(selected.section);
      const mySubs = (subRows || []).filter((s: any) => String(s.studentId) === String(selected.id));

      const hw = (hwRows || []).filter((h: any) =>
        canonGrade(h.grade) === wantG && (!h.section || canonSection(h.section) === wantS)
      ).map((h: any) => {
        const status = (h.status || "Pending").toLowerCase();
        const due = h.dueDate ? new Date(h.dueDate) : null;
        const pending = status !== "graded" && status !== "submitted" && (!due || due >= now);
        return { title: h.title || h.name || "Homework", date: h.dueDate, pending };
      });

      const asg = (asgRows || []).filter((a: any) =>
        a.status === "Active" && canonGrade(a.grade) === wantG && (!a.section || canonSection(a.section) === wantS)
      ).map((a: any) => {
        const sub = mySubs.find((s: any) => String(s.assignmentId) === String(a.id));
        const due = a.dueDate ? new Date(a.dueDate) : null;
        const pending = !sub && (!due || due >= now);
        return { title: a.title || "Assignment", date: a.dueDate, pending };
      });

      const merged = [...hw, ...asg];
      setPendingAssignments(merged.length ? merged.filter(m => m.pending).length : null);
      setUpcomingHomework(
        merged
          .filter(m => m.pending && m.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 3)
          .map(m => ({ title: m.title, date: m.date }))
      );
    }).catch(() => {});

    // Next PTM — mirrors ParentPTM.tsx's real studentId/name scoping; "next"
    // means the earliest still-actionable session (excludes Completed/Cancelled).
    smartDb.getAll("PTMSession").then((rows: any[]) => {
      const mine = (rows || []).filter((s: any) => s.studentId === selected.id || s.student === selected.name);
      const upcoming = mine
        .filter((s: any) => s.date && !["Completed", "Cancelled"].includes(s.status))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const next = upcoming[0];
      setNextPTM(next ? { date: next.date, time: next.timeRange || next.nextSlot, status: next.status } : null);
    }).catch(() => {});

    // Most recent behaviour incident — same studentId/studentName/student
    // scoping and date-descending sort as ParentBehavior.tsx.
    smartDb.getAll("BehaviorIncident").then((rows: any[]) => {
      const mine = (rows || []).filter((r: any) =>
        r.studentId === selected.id || r.studentName === selected.name || r.student === selected.name
      );
      mine.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      const latest = mine[0];
      setLatestBehaviour(latest ? { type: latest.type, category: latest.category, date: latest.date } : null);
    }).catch(() => {});

    // Most recent nurse visit — same studentId scoping and date-descending
    // sort as ParentHealth.tsx.
    smartDb.getAll("NurseVisit").then((rows: any[]) => {
      const mine = (rows || []).filter((r: any) => r.studentId === selected.id);
      mine.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      const latest = mine[0];
      setLatestHealthVisit(latest ? { reason: latest.reason || latest.complaint, date: latest.date } : null);
    }).catch(() => {});

    // Transport allocation — same studentId-first/name-fallback matching and
    // route/vehicle join as ParentTransport.tsx.
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    Promise.all([
      smartDb.getAll("TransportRecord").catch(() => []),
      smartDb.getAll("TransportRoute").catch(() => []),
      smartDb.getAll("TransportVehicle").catch(() => []),
    ]).then(([records, routes, vehicles]) => {
      const allocation = (records || []).find((r: any) => r.studentId === selected.id)
        || (records || []).find((r: any) => !r.studentId && norm(r.studentName) === norm(selected.name));
      if (!allocation) { setTransportInfo(null); return; }
      const route = (routes || []).find((r: any) => norm(r.name) === norm(allocation.route));
      const vehicle = (vehicles || []).find((v: any) => norm(v.regNumber) === norm(allocation.vehicle) || v.id === allocation.vehicle);
      setTransportInfo({
        route: route?.name || allocation.route,
        vehicle: vehicle?.regNumber,
        stop: allocation.stopName,
        status: allocation.status,
      });
    }).catch(() => {});
  }, [selected]);

  const band = useMemo(() => selected ? getBandForGrade(curriculum, selected.grade || "") : null, [curriculum, selected]);
  const gb = useMemo(() => {
    if (!gbSources || !selected) return null;
    return computeStudentGradebook(
      { id: String((selected as any).studentId ?? selected.id), name: selected.name, grade: selected.grade || "", section: selected.section || "" },
      band, gbSources
    );
  }, [gbSources, selected, band]);

  const upcomingExamRecords = useMemo(() => {
    if (!selected) return [];
    // Matches ParentExams.tsx's real audience filter exactly:
    // publishedToStudents (not the section-level `published`/`status`
    // fields) is what actually gates parent/student visibility, including
    // per-grade-plan overrides in examStore.ts. Using the wrong flag meant
    // this tile could show an exam a parent shouldn't see yet, or hide one
    // the real Exams page still lists as upcoming.
    return allExams
      .filter(e => matchesSection(e, selected.grade || "", selected.section || "") && e.publishedToStudents !== false)
      .slice(0, 3)
      .map(e => ({ title: e.subject || e.name || "Exam", date: e.date || "" }));
  }, [allExams, selected]);

  const upcomingEvents = useMemo(() => {
    const merged = [
      ...upcomingExamRecords.map(e => ({ ...e, type: "Exam" })),
      ...upcomingHomework.map(h => ({ ...h, type: "Assignment" })),
    ];
    return merged
      .filter(e => e.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [upcomingExamRecords, upcomingHomework]);

  const kpis = [
    { label: "Attendance",          value: attendancePct !== null ? `${attendancePct}%` : "—", icon: UserCheck,  color: "text-emerald-600 bg-emerald-50", href: "/parent/attendance" },
    { label: "Pending Assignments", value: pendingAssignments ?? "—",       icon: FileText,   color: "text-amber-600 bg-amber-50",    href: "/parent/assignments" },
    { label: "Outstanding Fees",    value: `QAR ${outstandingFees}`,        icon: CreditCard, color: outstandingFees > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50", href: "/parent/fees" },
    { label: "Upcoming Exams",      value: upcomingExamRecords.length,      icon: BookOpen,   color: "text-purple-600 bg-blue-50",      href: "/parent/exams" },
    { label: "Average %",           value: gb?.complete || gb?.subjects.some(s => s.hasData) ? `${Math.round(gb.overallPercentage)}%` : "—", icon: TrendingUp, color: "text-purple-600 bg-violet-50",  href: "/parent/gradebook" },
    { label: "Overall Grade",       value: gb?.overallLetter || "—",        icon: Award,      color: "text-purple-600 bg-indigo-50",  href: "/parent/gradebook" },
  ];

  const quickLinks = [
    { label: "Attendance",    icon: UserCheck,    href: "/parent/attendance",   color: "bg-emerald-100 text-emerald-700" },
    { label: "Assignments",   icon: FileText,     href: "/parent/assignments",  color: "bg-amber-100 text-amber-700" },
    { label: "Gradebook",     icon: TrendingUp,   href: "/parent/gradebook",    color: "bg-violet-100 text-violet-700" },
    { label: "Fees",          icon: CreditCard,   href: "/parent/fees",         color: "bg-rose-100 text-rose-700" },
    { label: "Report Cards",  icon: Award,        href: "/parent/report-cards", color: "bg-blue-100 text-blue-700" },
    { label: "Messages",      icon: MessageSquare,href: "/communication/messages", color: "bg-slate-100 text-slate-700" },
    { label: "PTM Booking",   icon: Calendar,     href: "/parent/ptm",          color: "bg-indigo-100 text-indigo-700" },
    { label: "Transport",     icon: MapPin,       href: "/parent/transport",    color: "bg-teal-100 text-teal-700" },
    { label: "Timetable",     icon: CalendarClock,href: "/parent/timetable",    color: "bg-sky-100 text-sky-700" },
    { label: "Behaviour",     icon: ShieldAlert,  href: "/parent/behaviour",    color: "bg-orange-100 text-orange-700" },
    { label: "Health",        icon: HeartPulse,   href: "/parent/health",       color: "bg-pink-100 text-pink-700" },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-slate-400 text-sm">Loading your dashboard…</div>
      </DashboardLayout>
    );
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
        {/* Header with child switcher */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Parent Dashboard</h1>
              <p className="text-sm text-slate-400">Overview for {selected.name}</p>
            </div>
          </div>
          <div className="w-64">
            <ChildSwitcher />
          </div>
        </div>

        {/* Child summary card */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-600 rounded-2xl p-5 text-white flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-black flex-shrink-0">
            {selected.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black">{selected.name}</h2>
            <p className="text-white/70 text-sm">{selected.grade} · Section {selected.section} · Roll {selected.rollNo}</p>
          </div>
          <div className="flex gap-6 flex-wrap">
            {[
              { l: "Attendance", v: attendancePct !== null ? `${attendancePct}%` : "—" },
              { l: "Average %",  v: gb?.subjects.some(s => s.hasData) ? `${Math.round(gb.overallPercentage)}%` : "—" },
              { l: "Pending Fees", v: outstandingFees > 0 ? `QAR ${outstandingFees}` : "Cleared" },
            ].map(s => (
              <div key={s.l} className="text-center">
                <p className="text-xl font-black">{s.v}</p>
                <p className="text-white/60 text-xs">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(k => (
            <button key={k.label} onClick={() => navigate(k.href)}
              className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-violet-200 transition group">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", k.color)}>
                <k.icon className="w-4 h-4" />
              </div>
              <p className="text-lg font-black text-slate-900 group-hover:text-violet-700 transition">{k.value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{k.label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Announcements */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-900 flex items-center gap-2"><Megaphone className="w-4 h-4 text-violet-500" /> Announcements</h3>
              <button onClick={() => navigate("/communication/announcements")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
            </div>
            <div className="space-y-3">
              {announcements.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 mt-0.5", tagColor(a.tag))}>{a.tag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{a.date}</p>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <p className="text-sm text-slate-400 py-4 text-center">No announcements.</p>
              )}
            </div>
          </div>

          {/* Upcoming — real exam dates + homework due dates */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Upcoming</h3>
              </div>
              <div className="space-y-3">
                {upcomingEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0", eventTypeColor(e.type))}>{e.type}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{e.title}</p>
                      <p className="text-[10px] text-slate-400">{e.date}</p>
                    </div>
                  </div>
                ))}
                {upcomingEvents.length === 0 && (
                  <p className="text-sm text-slate-400 py-4 text-center">Nothing upcoming.</p>
                )}
              </div>
            </div>

            <RecentNotificationsCard />
          </div>
        </div>

        {/* Family Snapshot — real PTM/Behaviour/Health/Transport summaries,
            each computed with the exact same scoping the dedicated page uses. */}
        <div>
          <h3 className="font-black text-slate-900 mb-3">Family Snapshot</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={() => navigate("/parent/ptm")}
              className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-violet-200 transition group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-indigo-50 text-indigo-600"><Calendar className="w-4 h-4" /></div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Next PTM</p>
              {nextPTM ? (
                <>
                  <p className="text-sm font-bold text-slate-900">{nextPTM.date}{nextPTM.time ? ` · ${nextPTM.time}` : ""}</p>
                  <p className="text-[11px] text-slate-400">{nextPTM.status || "Scheduled"}</p>
                </>
              ) : <p className="text-sm text-slate-400">No session booked</p>}
            </button>

            <button onClick={() => navigate("/parent/behaviour")}
              className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-violet-200 transition group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-orange-50 text-orange-600"><ShieldAlert className="w-4 h-4" /></div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Latest Behaviour</p>
              {latestBehaviour ? (
                <>
                  <p className="text-sm font-bold text-slate-900">{latestBehaviour.type}{latestBehaviour.category ? ` · ${latestBehaviour.category}` : ""}</p>
                  <p className="text-[11px] text-slate-400">{latestBehaviour.date}</p>
                </>
              ) : <p className="text-sm text-slate-400">No incidents</p>}
            </button>

            <button onClick={() => navigate("/parent/health")}
              className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-violet-200 transition group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-pink-50 text-pink-600"><HeartPulse className="w-4 h-4" /></div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Latest Health Visit</p>
              {latestHealthVisit ? (
                <>
                  <p className="text-sm font-bold text-slate-900 truncate">{latestHealthVisit.reason || "Nurse visit"}</p>
                  <p className="text-[11px] text-slate-400">{latestHealthVisit.date}</p>
                </>
              ) : <p className="text-sm text-slate-400">No visits recorded</p>}
            </button>

            <button onClick={() => navigate("/parent/transport")}
              className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-violet-200 transition group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-teal-50 text-teal-600"><Bus className="w-4 h-4" /></div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Transport</p>
              {transportInfo ? (
                <>
                  <p className="text-sm font-bold text-slate-900 truncate">{transportInfo.route || "—"}{transportInfo.vehicle ? ` · ${transportInfo.vehicle}` : ""}</p>
                  <p className="text-[11px] text-slate-400 truncate">{transportInfo.stop || transportInfo.status || ""}</p>
                </>
              ) : <p className="text-sm text-slate-400">Not assigned</p>}
            </button>
          </div>
        </div>

        {/* Quick links */}
        <div>
          <h3 className="font-black text-slate-900 mb-3">Quick Access</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {quickLinks.map(l => (
              <button key={l.label} onClick={() => navigate(l.href)}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-violet-200 transition group">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", l.color)}>
                  <l.icon className="w-5 h-5" />
                </div>
                <p className="text-[11px] font-semibold text-slate-600 group-hover:text-violet-700 text-center leading-tight">{l.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
