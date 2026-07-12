import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useAssignments } from "@/contexts/AssignmentContext";
import { useNotices } from "@/contexts/NoticeContext";
import { filterAnnouncementsForViewer } from "@/lib/announcementAudience";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { MyAppraisalWidget } from "@/pages/hr/appraisal/MyAppraisalWidget";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useTeacherCalendarEvents, TeacherCalendarEvent } from "@/hooks/useTeacherCalendarEvents";
import { useSweepProgress } from "@/hooks/useSweepProgress";
import { CountUpNumber } from "@/components/dashboard/CountUpNumber";
import {
  Users, GraduationCap, ClipboardList, CheckCircle2, MessageSquare,
  CalendarCheck, FilePlus2, UploadCloud, ClipboardCheck, FileText,
  Clock, Bell, Check, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";

/* ── Shared primitives ── */

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

/* ── KPI card — count-up, hover lift+scale, icon rotate, soft glow ── */

interface KpiSpec { icon: typeof Users; label: string; sub: string; value: number | string; bg: string; ic: string; glow: string }

function TeacherKpiCard({ icon: Icon, label, sub, value, bg, ic, glow, index }: KpiSpec & { index: number }) {
  const numeric = typeof value === "number";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="group relative bg-white border border-slate-100 rounded-2xl p-4 shadow-sm transition-shadow duration-200 hover:shadow-lg cursor-default overflow-hidden"
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-2xl"
        style={{ background: glow }}
      />
      <div className="relative flex items-center gap-2.5 mb-2.5">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:rotate-[8deg] group-hover:scale-110", bg)}>
          <Icon className={cn("h-5 w-5", ic)} />
        </div>
        <span className="text-xs text-slate-500 font-medium leading-tight">{label}</span>
      </div>
      <p className="relative text-2xl font-bold text-slate-900 leading-none tabular-nums">
        {numeric ? <CountUpNumber value={value as number} animateOnMount duration={900} /> : value}
      </p>
      <p className="relative text-xs text-slate-400 mt-1.5">{sub}</p>
    </motion.div>
  );
}

/* ── Today's Schedule — vertical timeline ── */

interface TimetablePeriod { period: number; subject: string; grade: string; time: string; status: "Completed" | "Current" | "Upcoming" }

function ScheduleTimeline({ periods, onViewAll }: { periods: TimetablePeriod[]; onViewAll: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-purple-500" /> Today's Schedule
        </h3>
        <button onClick={onViewAll} className="text-xs text-purple-600 font-semibold hover:underline">View Timetable</button>
      </div>
      {periods.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No timetable published yet</p>
      ) : (
        <div className="relative pl-1">
          {periods.map((p, i) => (
            <motion.div
              key={p.period}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.08, duration: 0.3 }}
              className="relative flex gap-3 pb-5 last:pb-0"
            >
              {i < periods.length - 1 && (
                <span className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-100" aria-hidden="true" />
              )}
              <div
                className={cn(
                  "relative z-10 mt-1 w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 border-2",
                  p.status === "Completed" ? "bg-emerald-500 border-emerald-500" :
                  p.status === "Current" ? "bg-white border-purple-500" :
                  "bg-white border-slate-200"
                )}
                style={p.status === "Current" ? { animation: "td-current-pulse 1.6s ease-out infinite" } : undefined}
              >
                {p.status === "Completed" && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </div>
              <div
                className={cn(
                  "flex-1 min-w-0 rounded-xl border p-3 transition-colors",
                  p.status === "Current" ? "border-purple-200 bg-purple-50/50" : "border-slate-100"
                )}
                style={p.status === "Current" ? { borderLeftWidth: 3, borderLeftColor: "#9333ea" } : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.subject}</p>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0",
                    p.status === "Completed" ? "bg-slate-100 text-slate-500" :
                    p.status === "Current" ? "bg-emerald-50 text-emerald-600" :
                    "bg-blue-50 text-purple-600"
                  )}>
                    {p.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{p.grade} · {p.time}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes td-current-pulse {
          0% { box-shadow: 0 0 0 0 rgba(147,51,234,0.35); }
          70% { box-shadow: 0 0 0 8px rgba(147,51,234,0); }
          100% { box-shadow: 0 0 0 0 rgba(147,51,234,0); }
        }
      `}</style>
    </motion.div>
  );
}

/* ── Class Overview donut — same setTimeout sweep + CountUp pattern as the
     admin dashboard's AttendanceOverviewCard, rebuilt with plain SVG here
     (no Recharts) since this card only needs a 3-segment ring, not tooltips
     or hover-expand. ── */

interface Overview { total: number; present: number; absent: number; late: number; pPct: string; aPct: string; lPct: string }

function ClassOverviewDonut({ overview, submissionStats }: { overview: Overview; submissionStats: { label: string; value: number }[] }) {
  const ready = overview.total > 0;
  const sweep = useSweepProgress(900, ready);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const segments = [
    { pct: Number(overview.pPct), color: "#10b981" },
    { pct: Number(overview.aPct), color: "#ef4444" },
    { pct: Number(overview.lPct), color: "#f59e0b" },
  ];
  let offset = -90;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.58, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm">Class Overview</h3>
      </div>
      {!ready ? (
        <div className="h-[150px] flex items-center justify-center">
          <div className="h-[110px] w-[110px] rounded-full bg-slate-100 animate-pulse" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center">
            <div className="relative">
              <svg width="130" height="130" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
                {segments.map((s, i) => {
                  const dash = (s.pct / 100) * circ * sweep;
                  const seg = (
                    <circle
                      key={i}
                      cx="55" cy="55" r={r} fill="none"
                      stroke={s.color} strokeWidth="14" strokeLinecap="round"
                      strokeDasharray={`${dash} ${circ - dash}`}
                      transform={`rotate(${offset} 55 55)`}
                      style={{ transition: "stroke-dasharray 16ms linear" }}
                    />
                  );
                  offset += (s.pct / 100) * 360;
                  return seg;
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-slate-900 leading-none tabular-nums">
                  <CountUpNumber value={Number(overview.pPct)} animateOnMount duration={900} decimals={0} suffix="%" />
                </span>
                <span className="text-[10px] text-slate-400 mt-1 font-semibold">
                  {Number(overview.pPct) >= 90 ? "Excellent Attendance" : "Attendance"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 mt-3">
            {[
              { label: "Present", value: overview.present, color: "bg-emerald-500" },
              { label: "Absent", value: overview.absent, color: "bg-rose-500" },
              { label: "Late", value: overview.late, color: "bg-amber-500" },
            ].map((r2) => (
              <div key={r2.label} className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", r2.color)} />
                <span className="text-[11px] text-slate-500">{r2.label} <span className="font-semibold text-slate-700">{r2.value}</span></span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
            {submissionStats.map((s) => (
              <div key={s.label}>
                <p className="text-base font-bold text-slate-900 leading-none tabular-nums">{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

/* ── Mini month calendar — real CalendarEvent-backed dots, today ring,
     hover enlarge, prev/next month navigation. ── */

function MiniCalendar({ events, onViewAll }: { events: TeacherCalendarEvent[]; onViewAll: () => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const today = new Date();

  const eventDatesInMonth = useMemo(() => {
    const set = new Set<number>();
    events.forEach((e) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()) {
        set.add(d.getDate());
      }
    });
    return set;
  }, [events, cursor]);

  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isToday = (day: number) =>
    day === today.getDate() && cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.66, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-purple-500" /> Calendar
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center">
            <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-500 mb-2">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-[10px] font-bold text-slate-300 py-1">{d}</span>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center py-0.5">
            {day && (
              <span
                className={cn(
                  "relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium cursor-default transition-all duration-150",
                  isToday(day) ? "bg-purple-600 text-white font-bold" : "text-slate-600 hover:bg-purple-50 hover:scale-110"
                )}
                style={isToday(day) ? { animation: "td-today-ring 2s ease-out infinite" } : undefined}
              >
                {day}
                {eventDatesInMonth.has(day) && !isToday(day) && (
                  <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-purple-500" />
                )}
              </span>
            )}
          </div>
        ))}
      </div>
      <button onClick={onViewAll} className="text-xs text-purple-600 font-semibold hover:underline mt-3">View Calendar</button>
      <style>{`
        @keyframes td-today-ring {
          0% { box-shadow: 0 0 0 0 rgba(147,51,234,0.4); }
          70% { box-shadow: 0 0 0 6px rgba(147,51,234,0); }
          100% { box-shadow: 0 0 0 0 rgba(147,51,234,0); }
        }
      `}</style>
    </motion.div>
  );
}

/* ── Recent Announcements ── */

interface NoticeItem { id: string | number; title: string; content: string; ago: string; unread: boolean }

function AnnouncementsCard({ notices, onViewAll }: { notices: NoticeItem[]; onViewAll: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.74, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <Bell className="h-4 w-4 text-purple-500" /> Recent Announcements
        </h3>
        <button onClick={onViewAll} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
      </div>
      {notices.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No notices published yet</p>
      ) : (
        <div className="space-y-1">
          {notices.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 0.08, duration: 0.3 }}
              className="flex items-start gap-2.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-slate-50"
            >
              <div className={cn("w-2 h-2 rounded-full mt-2 flex-shrink-0", n.unread ? "bg-purple-500" : "bg-transparent")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{n.content?.slice(0, 60) || ""}</p>
              </div>
              <span className="text-[10px] text-slate-300 flex-shrink-0">{n.ago}</span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Upcoming Events ── */

function UpcomingEventsCard({ events, loading, onViewAll }: { events: TeacherCalendarEvent[]; loading: boolean; onViewAll: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.82, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-purple-500" /> Upcoming Events
        </h3>
        <button onClick={onViewAll} className="text-xs text-purple-600 font-semibold hover:underline">View Calendar</button>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No upcoming events</p>
      ) : (
        <div className="space-y-2.5">
          {events.slice(0, 4).map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.88 + i * 0.08, duration: 0.3, type: "spring", stiffness: 300 }}
              className="flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{e.title}</p>
                <p className="text-[11px] text-slate-400">{new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Pending Tasks — real assignment-derived urgency + submission progress ── */

interface PendingTask { id: string; title: string; subject: string; dueLabel: string; urgency: "overdue" | "today" | "soon" | "later"; progressPct: number }

const URGENCY_STYLE: Record<PendingTask["urgency"], string> = {
  overdue: "bg-rose-50 text-rose-600",
  today: "bg-rose-50 text-rose-600",
  soon: "bg-amber-50 text-amber-600",
  later: "bg-blue-50 text-purple-600",
};

function PendingTasksCard({ tasks, onViewAll }: { tasks: PendingTask[]; onViewAll: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4 text-purple-500" /> Pending Tasks
        </h3>
        <button onClick={onViewAll} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nothing pending — you're all caught up.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tasks.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.96 + i * 0.06, duration: 0.3 }}
              whileHover={{ y: -3 }}
              className="rounded-xl border border-slate-100 p-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0", URGENCY_STYLE[t.urgency])}>{t.dueLabel}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{t.subject}</p>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-700 ease-out"
                  style={{ width: `${t.progressPct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{t.progressPct}% submitted</p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Quick Links ── */

interface QuickLink { label: string; icon: typeof Users; bg: string; ic: string; fn: () => void }

function QuickLinksRow({ links }: { links: QuickLink[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.02, duration: 0.4 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4"
    >
      <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Links</h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {links.map((q) => (
          <button
            key={q.label}
            onClick={q.fn}
            className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:rotate-[8deg]", q.bg)}>
              <q.icon className={cn("h-4.5 w-4.5", q.ic)} />
            </div>
            <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{q.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Page ── */

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { assignment, classStudents } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const { assignments } = useAssignments();
  const { notices } = useNotices();
  const { count: unreadMessages } = useUnreadMessagesCount();
  const { events: calendarEvents, upcoming: upcomingEvents, loading: eventsLoading } = useTeacherCalendarEvents();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const firstName = (() => {
    const raw = (assignment.teacherName || user?.displayName || user?.email?.split("@")[0] || "Teacher").trim();
    const parts = raw.split(/\s+/).filter(p => !/^(mr|mrs|ms|miss|dr|prof|sir|madam)\.?$/i.test(p));
    return (parts[0] || raw.split(/\s+/)[0] || "Teacher");
  })();
  const className = assignment.className || `${assignment.grade || "Grade 5"} - ${(assignment.section || "B").toUpperCase()}`;

  /* Real attendance load (unchanged wiring) */
  const [attendance, setAttendance] = useState<Record<string, string>>({});
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
    })();
    return () => { active = false; };
  }, [user, todayStr]);

  const classIds = useMemo(() => new Set(classStudents.map(s => s.id)), [classStudents]);
  const totalStudents = classStudents.length;
  const presentReal = classStudents.filter(s => attendance[s.id] === "Present" || attendance[s.id] === "P").length;
  const markedToday = Object.keys(attendance).some(id => classIds.has(id));
  const attendancePct = markedToday && totalStudents ? Math.round((presentReal / totalStudents) * 100) : 0;

  const pendingAssignmentsCount = useMemo(() =>
    assignments.filter(a => a.status !== "Completed" && a.status !== "Graded").length,
    [assignments]);

  const myClassesCount = useMemo(() =>
    new Set(mySubjects.map(s => `${s.grade}-${s.section}`)).size,
    [mySubjects]);

  /* Today's timetable with live status (unchanged wiring) */
  const timetable = useMemo(() => {
    const nowMins = today.getHours() * 60 + today.getMinutes();
    const parse = (label: string) => {
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
          const dayIdx = day === 0 ? 0 : day - 1;
          const list: { period: number; subject: string; grade: string; time: string; status: "Completed" | "Current" | "Upcoming" }[] = [];
          teacherData.schedule.forEach((row: any[], ri: number) => {
            const slot = row[dayIdx];
            if (slot) {
              const timeRange = teacherData.times?.[ri] || "08:00 - 09:00";
              const { start, end } = parse(timeRange);
              let status: "Completed" | "Current" | "Upcoming" = "Upcoming";
              if (nowMins >= end) status = "Completed";
              else if (nowMins >= start && nowMins < end) status = "Current";
              list.push({ period: ri + 1, subject: slot.subject, grade: `${slot.grade} - ${slot.section}`, time: timeRange, status });
            }
          });
          if (list.length > 0) return list;
        }
      }
    } catch { /* ignore */ }
    return [];
  }, [today, assignment.teacherName]);

  /* Recent notices (unchanged wiring) */
  const recentNotices = useMemo(() =>
    filterAnnouncementsForViewer(notices, role || "class_teacher")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((n, i) => ({ id: n.id, title: n.title, content: n.content, ago: timeAgo(n.date), unread: i < 2 })),
    [notices, role]);

  /* Class overview donut (unchanged wiring) */
  const overview = useMemo(() => {
    const total = totalStudents;
    const present = markedToday ? classStudents.filter(s => attendance[s.id] === "Present" || attendance[s.id] === "P").length : 0;
    const absent = markedToday ? classStudents.filter(s => attendance[s.id] === "Absent" || attendance[s.id] === "A").length : 0;
    const late = markedToday ? classStudents.filter(s => attendance[s.id] === "Late" || attendance[s.id] === "L").length : 0;
    const denom = present + absent + late || 1;
    return {
      total, present, absent, late,
      pPct: ((present / denom) * 100).toFixed(0),
      aPct: ((absent / denom) * 100).toFixed(0),
      lPct: ((late / denom) * 100).toFixed(0),
    };
  }, [attendance, classStudents, markedToday, totalStudents]);

  const submissionStats = useMemo(() => [
    { label: "Assignments Given", value: assignments.length },
    { label: "Submitted", value: assignments.filter(a => a.status === "Submitted" || a.status === "Graded" || a.status === "Completed").length },
  ], [assignments]);

  /* Pending tasks — real assignment status + real submission-vs-roster progress */
  const pendingTasks: PendingTask[] = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return assignments
      .filter(a => a.status !== "Completed" && a.status !== "Graded")
      .map((a) => {
        const due = new Date(a.dueDate);
        let dueLabel = "No due date";
        let urgency: PendingTask["urgency"] = "later";
        if (!isNaN(due.getTime())) {
          const diffDays = Math.round((due.getTime() - startOfToday.getTime()) / 86400000);
          if (diffDays < 0) { dueLabel = "Overdue"; urgency = "overdue"; }
          else if (diffDays === 0) { dueLabel = "Due Today"; urgency = "today"; }
          else if (diffDays === 1) { dueLabel = "Due Tomorrow"; urgency = "soon"; }
          else { dueLabel = `Due in ${diffDays} days`; urgency = "later"; }
        }
        const progressPct = totalStudents > 0 ? Math.min(100, Math.round(((a.submissionsCount || 0) / totalStudents) * 100)) : 0;
        return { id: a.id, title: `Grade — ${a.title}`, subject: `${a.subject || "—"} · ${className}`, dueLabel, urgency, progressPct };
      })
      .sort((a, b) => {
        const order = { overdue: 0, today: 1, soon: 2, later: 3 };
        return order[a.urgency] - order[b.urgency];
      })
      .slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, totalStudents]);

  const KPIS: KpiSpec[] = [
    { icon: GraduationCap, label: "My Classes", sub: `${myClassesCount} Active Class${myClassesCount === 1 ? "" : "es"}`, value: myClassesCount, bg: "bg-purple-50", ic: "text-purple-600", glow: "radial-gradient(circle, #9333ea55, transparent 70%)" },
    { icon: Users, label: "Students", sub: "Total students", value: totalStudents, bg: "bg-blue-50", ic: "text-blue-600", glow: "radial-gradient(circle, #3b82f655, transparent 70%)" },
    { icon: CheckCircle2, label: "Attendance", sub: "Present today", value: markedToday ? `${attendancePct}%` : "—", bg: "bg-emerald-50", ic: "text-emerald-600", glow: "radial-gradient(circle, #10b98155, transparent 70%)" },
    { icon: ClipboardList, label: "Pending Assignments", sub: "To be graded", value: pendingAssignmentsCount, bg: "bg-orange-50", ic: "text-orange-600", glow: "radial-gradient(circle, #f9731655, transparent 70%)" },
    { icon: MessageSquare, label: "Messages", sub: "Unread messages", value: unreadMessages, bg: "bg-pink-50", ic: "text-pink-600", glow: "radial-gradient(circle, #ec489955, transparent 70%)" },
  ];

  const quickLinks: QuickLink[] = [
    { label: "Take Attendance", icon: CalendarCheck, bg: "bg-emerald-50", ic: "text-emerald-600", fn: () => navigate("/teacher/attendance") },
    { label: "Create Assignment", icon: FilePlus2, bg: "bg-blue-50", ic: "text-purple-600", fn: () => navigate("/teacher/assignments") },
    { label: "Enter Marks", icon: ClipboardCheck, bg: "bg-purple-50", ic: "text-purple-600", fn: () => navigate("/teacher/exams") },
    { label: "Upload Material", icon: UploadCloud, bg: "bg-orange-50", ic: "text-orange-600", fn: () => navigate("/teacher/study-materials") },
    { label: "Send Message", icon: MessageSquare, bg: "bg-pink-50", ic: "text-pink-600", fn: () => navigate("/communication/messages") },
    { label: "View Reports", icon: FileText, bg: "bg-teal-50", ic: "text-teal-600", fn: () => navigate("/teacher/report-cards") },
  ];

  return (
    <DashboardLayout>
      <div className="relative space-y-5 pb-12">
        {/* Faint floating gradient blobs — page-level decoration only, not shared chrome */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full bg-purple-200/20 blur-3xl" style={{ animation: "td-blob-float 20s ease-in-out infinite" }} />
        <div className="pointer-events-none absolute top-52 -left-16 w-56 h-56 rounded-full bg-pink-200/15 blur-3xl" style={{ animation: "td-blob-float 24s ease-in-out infinite reverse" }} />

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative flex items-center gap-3">
          <StudentAvatar name={firstName} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Good Morning, {firstName}! 👋</h1>
            <p className="text-sm text-slate-400 mt-0.5">Here's what's happening in your classes today.</p>
          </div>
        </motion.div>

        <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {KPIS.map((k, i) => <TeacherKpiCard key={k.label} {...k} index={i} />)}
        </div>

        <MyAppraisalWidget />

        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ScheduleTimeline periods={timetable} onViewAll={() => navigate("/teacher/my-class")} />
          <ClassOverviewDonut overview={overview} submissionStats={submissionStats} />
          <MiniCalendar events={calendarEvents} onViewAll={() => navigate("/communication/calendar")} />
        </div>

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AnnouncementsCard notices={recentNotices} onViewAll={() => navigate("/communication/announcements")} />
          <UpcomingEventsCard events={upcomingEvents} loading={eventsLoading} onViewAll={() => navigate("/communication/calendar")} />
        </div>

        <div className="relative">
          <PendingTasksCard tasks={pendingTasks} onViewAll={() => navigate("/teacher/assignments")} />
        </div>

        <div className="relative">
          <QuickLinksRow links={quickLinks} />
        </div>

        <style>{`
          @keyframes td-blob-float {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(24px, -28px); }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
}
