import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import socket from "@/lib/socket";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { StaticKpiCard } from "@/components/dashboard/StaticKpiCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, Clock, MapPin, Download, BookOpen,
  Users, FileText, ClipboardList, FolderOpen,
  BarChart3, GraduationCap, ChevronRight, X,
  ChevronLeft, Video, Monitor, LayoutGrid, List, Coffee,
} from "lucide-react";

// Same fix as the student/parent Timetable pages: an Online period's room
// used to render as inert "Virtual"/"Virtual Link" text with no way to
// actually open the meeting — this makes it a real clickable join link.
function RoomLabel({ room, className }: { room?: string; className?: string }) {
  if (!room) return <span className={className}>—</span>;
  if (!room.startsWith("http")) return <span className={className}>{room}</span>;
  return (
    <a
      href={room}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex items-center gap-1 text-primary hover:underline font-semibold", className)}
    >
      <Video className="w-3 h-3 shrink-0" /> Join Class
    </a>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
const DAYS_FULL    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DISPLAY_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const ADMIN_TIME_SLOTS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 01:00",
];

// Real minutes-since-midnight for each slot — the last slot's "01:00" is a
// 24h-schedule shorthand for 13:00 (school day is 08:00-13:00), so any hour
// under 8 is treated as a PM hour that wrapped past noon.
function parseSlotRange(label: string): { start: number; end: number } {
  const m = label.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return { start: 0, end: 0 };
  const to24 = (h: number) => (h < 8 ? h + 12 : h);
  const sh = to24(parseInt(m[1], 10));
  const eh = to24(parseInt(m[3], 10));
  return { start: sh * 60 + parseInt(m[2], 10), end: eh * 60 + parseInt(m[4], 10) };
}
function fmtMinutesLeft(mins: number): string {
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Colour maps — brand-aligned: Mathematics/primary subjects lean on the
// real brand primary/accent (#9810fa / #d12386), the rest keep distinct
// hues for scannability (same reasoning as the dashboard's KPI cards). ──
const SUBJECT_COLORS: Record<string, string> = {
  Mathematics:          "bg-primary/10 border-primary/20 text-primary",
  English:              "bg-blue-50 border-blue-200 text-blue-700",
  Science:              "bg-emerald-50 border-emerald-200 text-emerald-700",
  Arabic:               "bg-teal-50 border-teal-200 text-teal-700",
  "Islamic Studies":    "bg-emerald-50 border-emerald-300 text-emerald-800",
  "Social Studies":     "bg-amber-50 border-amber-200 text-amber-700",
  "Computer Science":   "bg-cyan-50 border-cyan-200 text-cyan-700",
  Computer:             "bg-cyan-50 border-cyan-200 text-cyan-700",
  "Physical Education": "bg-orange-50 border-orange-200 text-orange-700",
  Art:                  "bg-[#d12386]/10 border-[#d12386]/20 text-[#d12386]",
  History:              "bg-rose-50 border-rose-200 text-rose-700",
  Chemistry:            "bg-lime-50 border-lime-200 text-lime-700",
  Physics:              "bg-sky-50 border-sky-200 text-sky-700",
  Biology:              "bg-green-50 border-green-200 text-green-700",
};
const DOT_COLORS: Record<string, string> = {
  Mathematics:          "bg-primary",
  English:              "bg-blue-500",
  Science:              "bg-emerald-500",
  Arabic:               "bg-teal-500",
  "Islamic Studies":    "bg-emerald-600",
  "Social Studies":     "bg-amber-500",
  "Computer Science":   "bg-cyan-500",
  Computer:             "bg-cyan-500",
  "Physical Education": "bg-orange-500",
  Art:                  "bg-[#d12386]",
  History:              "bg-rose-500",
  Chemistry:            "bg-lime-500",
  Physics:              "bg-sky-500",
  Biology:              "bg-green-500",
};
const FALLBACK_HUES = ["bg-violet-500", "bg-fuchsia-500", "bg-indigo-500", "bg-pink-500", "bg-slate-500"];
function dotColorFor(subject: string): string {
  if (DOT_COLORS[subject]) return DOT_COLORS[subject];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
  return FALLBACK_HUES[hash % FALLBACK_HUES.length];
}
function cardColorFor(subject: string): string {
  return SUBJECT_COLORS[subject] || "bg-muted/60 border-border text-foreground";
}

// ── Week date helpers ─────────────────────────────────────────────────────────
function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}
function buildWeekDays(monday: Date) {
  return DISPLAY_DAYS.map((full, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      full,
      short: full.slice(0, 3),
      date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), // "28 Jun"
    };
  });
}
// Real "today" as one of the 5 school weekdays, or null on a weekend — used
// to decide whether the LIVE pulse / current-time marker / hero cards should
// show anything at all, instead of pretending Saturday has a "current class."
function realTodayDayName(): string | null {
  const idx = new Date().getDay() - 1; // Mon=0 ... Sat=5, Sun=-1
  return idx >= 0 && idx <= 4 ? DISPLAY_DAYS[idx] : null;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type GridCell = { mode: string; subject: string; teacher: string; room: string } | null;
type AllTimetables = Record<string, GridCell[][]>;
interface CompiledSlot {
  subject: string; mode: string; room: string;
  grade: string; section: string; classKey: string;
}
interface TeachingSlot {
  periodIdx: number; dayIdx: number;
  time: string; subject: string;
  grade: string; section: string; room: string; mode: string;
  classKey: string;
}

function readAllTimetables(dbGrid?: AllTimetables): AllTimetables {
  if (dbGrid && Object.keys(dbGrid).length > 0) return dbGrid;
  try { return JSON.parse(localStorage.getItem("sd_timetables_v3") || "{}"); }
  catch { return {}; }
}

// Strip "Mr./Mrs./Ms./Dr." and lowercase for comparison
function normName(s: string) {
  return s.toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}
function nameMatches(cellTeacher: string, myName: string): boolean {
  if (!cellTeacher || !myName) return false;
  return normName(cellTeacher) === normName(myName);
}

// Real "am I teaching a live session right now" — best-effort: this app has
// no field linking a LiveClass document to a specific timetable slot, so
// "live" here means the real current time falls inside this period's real
// time range (an in-person or scheduled-online period actually happening
// right now), not a guaranteed link to a started Jitsi room.
function liveStatusFor(time: string, isRealToday: boolean): "live" | "upcoming" | "done" | null {
  if (!isRealToday) return null;
  const { start, end } = parseSlotRange(time);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= start && nowMin < end) return "live";
  if (nowMin < start) return "upcoming";
  return "done";
}

// ── Quick Action Panel — right-side drawer ──────────────────────────────────
interface SlotAction {
  time: string; subject: string;
  grade: string; section: string; room: string; mode: string;
}
function QuickActionPanel({ slot, onClose }: { slot: SlotAction; onClose: () => void }) {
  const navigate = useNavigate();
  const modeIcon =
    slot.mode === "Online"  ? <Video className="w-3.5 h-3.5" /> :
    slot.mode === "Hybrid"  ? <Monitor className="w-3.5 h-3.5" /> :
                              <MapPin className="w-3.5 h-3.5" />;
  const actions = [
    { label: "Take Attendance",   icon: Users,         path: "/teacher/attendance",       color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { label: "Create Homework",   icon: BookOpen,      path: "/teacher/homework",         color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
    { label: "Create Assignment", icon: ClipboardList, path: "/teacher/assignments",      color: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15" },
    { label: "Study Materials",   icon: FolderOpen,    path: "/teacher/study-materials",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { label: "Create Assessment", icon: BarChart3,     path: "/teacher/assessments",      color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
    { label: "View Exams",        icon: FileText,      path: "/teacher/exams",            color: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
  ];
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.div
          key="drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          className="bg-card h-full w-full sm:max-w-sm shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-5 text-white shrink-0" style={{ background: "linear-gradient(135deg, #d12386 0%, #9810fa 100%)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-black text-lg">{slot.subject}</p>
                <p className="text-white/80 text-xs mt-0.5">{slot.grade} · Section {slot.section}</p>
                <p className="text-white/70 text-xs flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Clock className="w-3 h-3" /> {slot.time}
                  {slot.room && (
                    <span className="flex items-center gap-1">
                      {!slot.room.startsWith("http") && modeIcon}
                      <RoomLabel room={slot.room} className="text-white hover:text-white" />
                    </span>
                  )}
                </p>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Teaching Actions</p>
            <div className="grid grid-cols-2 gap-2.5">
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => { navigate(a.path); onClose(); }}
                  className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-transform hover:scale-[1.03]", a.color)}
                >
                  <a.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-left leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 shrink-0">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Subject legend — real distinct subjects only ────────────────────────────
function SubjectLegend({ subjects }: { subjects: string[] }) {
  if (subjects.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
      {subjects.map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", dotColorFor(s))} />
          <span className="text-[11px] text-muted-foreground font-medium">{s}</span>
        </div>
      ))}
    </div>
  );
}

// A slim "now" marker inserted between periods in the daily list — real
// position derived from comparing the actual current time against each
// period's real start time, not a decorative always-on line.
function NowMarker() {
  const [label, setLabel] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  useEffect(() => {
    const t = setInterval(() => setLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative flex items-center gap-2 px-5 py-0.5" aria-hidden="true">
      <span className="text-[9px] font-black text-rose-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-rose-400 relative">
        <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-rose-500" />
      </div>
    </div>
  );
}

// ── Loading skeleton — shimmer, not a spinner ───────────────────────────────
function TimetableSkeleton() {
  return (
    <div className="space-y-5 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-[24px] p-4 h-32 animate-pulse" />
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-[24px] p-4 space-y-2.5">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ── Tab 1: My Class Timetable ─────────────────────────────────────────────────
function ClassTimetableTab({ grade, section, assignment, dbGrid }: {
  grade: string; section: string; assignment: any; dbGrid?: AllTimetables;
}) {
  const classKey = `${grade}-${section}`;
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const todayName = realTodayDayName();

  const [activeDay, setActiveDay] = useState(() => {
    const idx = Math.min(new Date().getDay() - 1, 4);
    return idx >= 0 ? DISPLAY_DAYS[idx] : "Monday";
  });

  const dayIdx = DAYS_FULL.indexOf(activeDay);

  const classGrid = useMemo<GridCell[][]>(() => {
    try {
      const all = readAllTimetables(dbGrid);
      return all[classKey] || [];
    } catch { return []; }
  }, [classKey, dbGrid]);

  const hasTimetable = classGrid.some(row => Array.isArray(row) && row.some(Boolean));

  const dayPeriods = useMemo(() =>
    ADMIN_TIME_SLOTS.map((time, ti) => ({
      time, periodNum: ti + 1,
      cell: classGrid[ti]?.[dayIdx] ?? null,
    })), [classGrid, dayIdx]);

  const totalPeriods = useMemo(() =>
    classGrid.flatMap(r => r || []).filter(Boolean).length, [classGrid]);
  const todayCount = dayPeriods.filter(p => p.cell).length;
  const activeDayInfo = weekDays.find(d => d.full === activeDay);

  const subjects = useMemo(() =>
    Array.from(new Set(classGrid.flatMap(r => (r || []).filter(Boolean).map(c => c!.subject)))).sort(),
    [classGrid]);

  const isRealToday = activeDay === todayName;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowMarkerBeforeIdx = isRealToday
    ? dayPeriods.findIndex(p => parseSlotRange(p.time).start > nowMin)
    : -1;

  if (!hasTimetable) {
    return (
      <div className="premium-card p-16 text-center mt-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground">No Timetable Published</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          Admin hasn't published a timetable for {classKey} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-4">
      {/* Class header */}
      <div className="rounded-[24px] p-5 text-white" style={{ background: "linear-gradient(135deg, #d12386 0%, #9810fa 100%)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Homeroom Class</p>
            <h2 className="text-2xl font-black mt-0.5">{grade} · Section {section}</h2>
            <p className="text-white/80 text-sm mt-1">{assignment.teacherName} · {assignment.subject}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-white/15 rounded-xl px-4 py-2.5">
              <p className="text-xl font-black">{totalPeriods}</p>
              <p className="text-white/70 text-[10px] leading-tight">Periods/Week</p>
            </div>
            <div className="bg-white/15 rounded-xl px-4 py-2.5">
              <p className="text-xl font-black">{todayCount}</p>
              <p className="text-white/70 text-[10px] leading-tight">Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Week navigator + day pills with dates */}
      <div className="premium-card p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-foreground/90">
            {weekDays[0]?.date} – {weekDays[4]?.date}
          </span>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {weekDays.map(d => (
            <button key={d.full} onClick={() => setActiveDay(d.full)}
              className={cn("flex flex-col items-center py-2 rounded-xl border transition",
                activeDay === d.full
                  ? "border-primary/30 bg-primary/10"
                  : "border-border hover:border-primary/20 hover:bg-muted/40")}>
              <span className={cn("text-[10px] font-bold", activeDay === d.full ? "text-primary" : "text-muted-foreground")}>
                {d.short}
              </span>
              <span className={cn("text-base font-black mt-0.5 leading-none", activeDay === d.full ? "text-primary" : "text-foreground")}>
                {d.date.split(" ")[0]}
              </span>
              <span className={cn("text-[9px] mt-0.5", activeDay === d.full ? "text-primary/70" : "text-muted-foreground")}>
                {d.date.split(" ")[1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Day schedule */}
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
          <h3 className="font-bold text-foreground">
            {activeDay}
            {activeDayInfo && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">{activeDayInfo.date}</span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground">{todayCount} of {ADMIN_TIME_SLOTS.length} periods</span>
        </div>
        <div className="divide-y divide-border/60">
          {dayPeriods.map(({ time, periodNum, cell }, idx) => {
            const live = cell ? liveStatusFor(time, isRealToday) : null;
            return (
              <div key={periodNum}>
                {nowMarkerBeforeIdx === idx && <NowMarker />}
                <motion.div
                  whileHover={cell ? { scale: 1.01 } : undefined}
                  className="px-5 py-3 flex items-center gap-4"
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0",
                    cell ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {periodNum}
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {time}
                    </p>
                  </div>
                  {cell ? (
                    <div className={cn("flex-1 flex items-center gap-3 px-3 py-2 rounded-xl border transition-all",
                      cardColorFor(cell.subject),
                      live === "live" && "ring-2 ring-rose-400/60")}>
                      <div className={cn("w-1.5 h-8 rounded-full flex-shrink-0", dotColorFor(cell.subject))} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{cell.subject}</p>
                          {live === "live" && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" style={{ animation: "tt-live-pulse 1.4s ease-out infinite" }} />
                              LIVE
                            </span>
                          )}
                        </div>
                        {cell.teacher && <p className="text-[11px] opacity-60 truncate">{cell.teacher}</p>}
                      </div>
                      {cell.room && (
                        <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
                          {!cell.room.startsWith("http") && <MapPin className="w-3 h-3 opacity-60" />}
                          <RoomLabel room={cell.room} className="opacity-100" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 px-3 py-2 rounded-xl bg-muted/40 border border-dashed border-border flex items-center gap-2">
                      <Coffee className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground italic">Free Period</p>
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
          {nowMarkerBeforeIdx === dayPeriods.length && <NowMarker />}
        </div>
      </div>

      <SubjectLegend subjects={subjects} />

      {/* Weekly overview grid */}
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40">
          <h3 className="font-bold text-foreground">Weekly Overview</h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr>
                <th className="p-2 text-left text-muted-foreground font-semibold w-28">Time</th>
                {weekDays.map(d => (
                  <th key={d.full}
                    className={cn("p-2 text-center font-semibold", activeDay === d.full ? "text-primary" : "text-muted-foreground")}>
                    <div>{d.short}</div>
                    <div className={cn("text-[9px] font-normal mt-0.5", activeDay === d.full ? "text-primary/70" : "text-muted-foreground/70")}>
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_TIME_SLOTS.map((time, ti) => (
                <tr key={ti} className="border-t border-border/60">
                  <td className="p-2 text-muted-foreground font-mono text-[10px]">{time}</td>
                  {DISPLAY_DAYS.map((d, di) => {
                    const c = classGrid[ti]?.[di] ?? null;
                    return (
                      <td key={d} className="p-1">
                        {c ? (
                          <div className={cn("rounded-lg px-1.5 py-1 text-center text-[10px] font-semibold border",
                            cardColorFor(c.subject),
                            activeDay === d && "ring-1 ring-primary/40")}>
                            {c.subject.length > 7 ? c.subject.slice(0, 7) + "…" : c.subject}
                          </div>
                        ) : (
                          <div className="rounded-lg px-1.5 py-1 text-center text-[10px] text-muted-foreground/50 bg-muted/30">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: My Teaching Schedule ───────────────────────────────────────────────
function TeachingScheduleTab({ allSlots, todayName }: { allSlots: TeachingSlot[]; todayName: string | null }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const [view, setView] = useState<"daily" | "weekly">("daily");

  const [activeDay, setActiveDay] = useState(() => {
    const idx = Math.min(new Date().getDay() - 1, 4);
    return idx >= 0 ? DISPLAY_DAYS[idx] : "Monday";
  });
  const dayIdx = DAYS_FULL.indexOf(activeDay);

  const [selectedSlot, setSelectedSlot] = useState<SlotAction | null>(null);

  const totalWeeklyPeriods = allSlots.length;
  const uniqueClasses      = new Set(allSlots.map(s => s.classKey)).size;
  const todayCount         = allSlots.filter(s => s.dayIdx === dayIdx).length;

  const subjects = useMemo(() =>
    Array.from(new Set(allSlots.map(s => s.subject))).sort(), [allSlots]);

  const weekSummary = useMemo(() =>
    DISPLAY_DAYS.map((d, di) => ({
      day: d, count: allSlots.filter(s => s.dayIdx === di).length,
    })), [allSlots]);

  const daySlots = useMemo(() =>
    ADMIN_TIME_SLOTS.map((time, pIdx) => ({
      time, periodNum: pIdx + 1,
      slot: allSlots.find(s => s.periodIdx === pIdx && s.dayIdx === dayIdx) || null,
    })), [allSlots, dayIdx]);

  const activeDayInfo = weekDays.find(d => d.full === activeDay);
  const isRealToday = activeDay === todayName;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowMarkerBeforeIdx = isRealToday
    ? daySlots.findIndex(p => parseSlotRange(p.time).start > nowMin)
    : -1;

  if (totalWeeklyPeriods === 0) {
    return (
      <div className="premium-card p-16 text-center mt-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground">No Teaching Slots Found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          No periods assigned to you in the published timetable.
          Ask admin to assign you as subject teacher and re-publish.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-4">
      <AnimatePresence>
        {selectedSlot && <QuickActionPanel slot={selectedSlot} onClose={() => setSelectedSlot(null)} />}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Periods / Week", value: totalWeeklyPeriods, color: "text-primary bg-primary/10" },
          { label: "Classes",        value: uniqueClasses,      color: "text-blue-600 bg-blue-50" },
          { label: "Today",          value: todayCount,         color: "text-emerald-600 bg-emerald-50" },
        ].map(k => (
          <div key={k.label} className={cn("rounded-2xl p-4 text-center", k.color)}>
            <p className="text-3xl font-black">{k.value}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-70">{k.label}</p>
          </div>
        ))}
      </div>

      {/* View toggle — chips, not a dropdown */}
      <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
        <button onClick={() => setView("daily")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
            view === "daily" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <List className="w-3.5 h-3.5" /> Daily View
        </button>
        <button onClick={() => setView("weekly")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
            view === "weekly" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <LayoutGrid className="w-3.5 h-3.5" /> Weekly View
        </button>
      </div>

      {/* Week navigator + day pills with dates + period count badges */}
      <div className="premium-card p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-foreground/90">
            {weekDays[0]?.date} – {weekDays[4]?.date}
          </span>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {view === "daily" && (
        <div className="grid grid-cols-5 gap-1.5">
          {weekDays.map((d, di) => {
            const cnt = weekSummary[di]?.count ?? 0;
            return (
              <button key={d.full} onClick={() => setActiveDay(d.full)}
                className={cn("flex flex-col items-center py-2 rounded-xl border transition",
                  activeDay === d.full
                    ? "border-primary/30 bg-primary/10"
                    : "border-border hover:border-primary/20 hover:bg-muted/40")}>
                <span className={cn("text-[10px] font-bold", activeDay === d.full ? "text-primary" : "text-muted-foreground")}>
                  {d.short}
                </span>
                <span className={cn("text-base font-black mt-0.5 leading-none", activeDay === d.full ? "text-primary" : "text-foreground")}>
                  {d.date.split(" ")[0]}
                </span>
                <span className={cn("text-[9px] mt-0.5", activeDay === d.full ? "text-primary/70" : "text-muted-foreground")}>
                  {d.date.split(" ")[1]}
                </span>
                {cnt > 0 && (
                  <span className={cn("mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full",
                    activeDay === d.full ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Day schedule (Daily View only) */}
      {view === "daily" && (
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
          <h3 className="font-bold text-foreground">
            {activeDay}
            {activeDayInfo && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">{activeDayInfo.date}</span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground">
            {todayCount} class{todayCount !== 1 ? "es" : ""}
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {daySlots.map(({ time, periodNum, slot }, idx) => {
            const live = slot ? liveStatusFor(time, isRealToday) : null;
            return (
              <div key={periodNum}>
                {nowMarkerBeforeIdx === idx && <NowMarker />}
                <motion.div
                  whileHover={slot ? { scale: 1.015, y: -2 } : undefined}
                  className={cn("px-5 py-3.5 flex items-center gap-4 transition-shadow",
                    slot ? "cursor-pointer group hover:shadow-md" : "")}
                  onClick={() => slot && setSelectedSlot({
                    time: slot.time, subject: slot.subject,
                    grade: slot.grade, section: slot.section,
                    room: slot.room, mode: slot.mode,
                  })}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0",
                    slot ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {periodNum}
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {time}
                    </p>
                  </div>
                  {slot ? (
                    <div className={cn("flex-1 flex items-center gap-3 px-3 py-2 rounded-xl border transition-all",
                      cardColorFor(slot.subject),
                      live === "live" ? "ring-2 ring-rose-400/60" : "group-hover:border-primary/40")}>
                      <div className={cn("w-1.5 h-10 rounded-full flex-shrink-0", dotColorFor(slot.subject))} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{slot.subject}</p>
                          {live === "live" && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" style={{ animation: "tt-live-pulse 1.4s ease-out infinite" }} />
                              LIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] opacity-70 flex items-center gap-1 mt-0.5">
                          <GraduationCap className="w-3 h-3" />
                          {slot.grade} · Section {slot.section}
                        </p>
                      </div>
                      {slot.room && (
                        <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
                          {!slot.room.startsWith("http") && <MapPin className="w-3 h-3 opacity-60" />}
                          <RoomLabel room={slot.room} className="opacity-100" />
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 flex-shrink-0 transition-all" />
                    </div>
                  ) : (
                    <div className="flex-1 px-3 py-2.5 rounded-xl bg-muted/40 border border-dashed border-border flex items-center gap-2">
                      <Coffee className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground italic">Free Period</p>
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
          {nowMarkerBeforeIdx === daySlots.length && <NowMarker />}
        </div>
      </div>
      )}

      <SubjectLegend subjects={subjects} />

      {/* Weekly overview grid — every period × every day, across all my classes (Weekly View only) */}
      {view === "weekly" && (
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40">
          <h3 className="font-bold text-foreground">Weekly Overview</h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr>
                <th className="p-2 text-left text-muted-foreground font-semibold w-28">Time</th>
                {weekDays.map(d => (
                  <th key={d.full}
                    className={cn("p-2 text-center font-semibold", activeDay === d.full ? "text-primary" : "text-muted-foreground")}>
                    <div>{d.short}</div>
                    <div className={cn("text-[9px] font-normal mt-0.5", activeDay === d.full ? "text-primary/70" : "text-muted-foreground/70")}>
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_TIME_SLOTS.map((time, ti) => (
                <tr key={ti} className="border-t border-border/60">
                  <td className="p-2 text-muted-foreground font-mono text-[10px]">{time}</td>
                  {DISPLAY_DAYS.map((d, di) => {
                    const s = allSlots.find(x => x.periodIdx === ti && x.dayIdx === di) || null;
                    return (
                      <td key={d} className="p-1">
                        {s ? (
                          <div className={cn("rounded-lg px-1.5 py-1 text-center text-[10px] font-semibold border",
                            cardColorFor(s.subject),
                            activeDay === d && "ring-1 ring-primary/40")}
                            title={`${s.subject} · ${s.grade} Section ${s.section}`}>
                            {s.subject.length > 7 ? s.subject.slice(0, 7) + "…" : s.subject}
                          </div>
                        ) : (
                          <div className="rounded-lg px-1.5 py-1 text-center text-[10px] text-muted-foreground/50 bg-muted/30">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* All assigned classes summary */}
      {uniqueClasses > 0 && (
        <div className="premium-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/40">
            <h3 className="font-bold text-foreground">All Assigned Classes</h3>
          </div>
          <div className="divide-y divide-border/60">
            {Array.from(new Map(allSlots.map(s => [s.classKey, s])).values())
              .sort((a, b) => a.classKey.localeCompare(b.classKey))
              .map(s => {
                const count = allSlots.filter(x => x.classKey === s.classKey).length;
                return (
                  <div key={s.classKey} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{s.grade} · Section {s.section}</p>
                      <p className="text-xs text-muted-foreground">{s.subject}</p>
                    </div>
                    <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {count}×/wk
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────
export default function TeacherTimetable() {
  const { assignment } = useTeacherClass();
  const grade       = assignment.grade    || "Grade 5";
  const section     = (assignment.section || "B").toUpperCase();
  const teacherName = assignment.teacherName || "";

  const [tab, setTab] = useState<"class" | "teaching">("teaching");

  // Fetch published timetable from DB (shared MySQL — works across any port/origin)
  const [dbGrid, setDbGrid]         = useState<AllTimetables | undefined>(undefined);
  const [dbTeachers, setDbTeachers] = useState<Record<string, any> | undefined>(undefined);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const lastPublishedAt = useRef<string | null>(null);

  const fetchTimetableFromDb = useCallback(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setInitialLoaded(true);
        if (!data || data.error) return;
        if (data.gridJson)    { try { setDbGrid(JSON.parse(data.gridJson)); }    catch {} }
        if (data.teacherJson) { try { setDbTeachers(JSON.parse(data.teacherJson)); } catch {} }
        // Toast when the published timetable actually changed (not on first load)
        const pub = data.publishedAt || data.updatedAt || null;
        if (pub && lastPublishedAt.current && pub !== lastPublishedAt.current) {
          toast.info("Your timetable was just updated by admin.");
        }
        if (pub) lastPublishedAt.current = pub;
      })
      .catch(() => setInitialLoaded(true));
  }, []);

  useEffect(() => {
    fetchTimetableFromDb();

    // Poll every 10 s — catches cross-port publishes (different server processes)
    const poll = setInterval(fetchTimetableFromDb, 10_000);

    // Instant update when on the same port — server emits "notification" via socket.io
    const onNotification = (n: any) => {
      if (n?.entity === "timetable_slots") fetchTimetableFromDb();
    };
    socket.on("notification", onNotification);
    // Also listen for the dedicated publish event
    socket.on("timetable-published", fetchTimetableFromDb);

    // Refetch when user switches back to this tab
    const onVisible = () => { if (document.visibilityState === "visible") fetchTimetableFromDb(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      socket.off("notification", onNotification);
      socket.off("timetable-published", fetchTimetableFromDb);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchTimetableFromDb]);

  // Real weekly teaching slots — every period this teacher teaches, across
  // every class, lifted up from the old per-tab computation so both the
  // hero KPI row and the "My Teaching Schedule" tab share one real source.
  const allSlots = useMemo<TeachingSlot[]>(() => {
    const slots: TeachingSlot[] = [];
    const myNorm = normName(teacherName);

    try {
      const compiled: Record<string, { schedule: (CompiledSlot | null)[][]; days: string[] }> =
        dbTeachers && Object.keys(dbTeachers).length > 0
          ? dbTeachers
          : JSON.parse(localStorage.getItem("sd_teacher_timetables") || "{}");

      const key = Object.keys(compiled).find(k =>
        k === teacherName ||
        k.toLowerCase() === teacherName.toLowerCase() ||
        normName(k) === myNorm
      );

      if (key) {
        const { schedule, days } = compiled[key];
        const resolvedDays: string[] = Array.isArray(days) ? days : DISPLAY_DAYS;
        schedule.forEach((row, pi) => {
          if (!Array.isArray(row)) return;
          row.forEach((cell, di) => {
            if (!cell) return;
            const dayName = resolvedDays[di] ?? DISPLAY_DAYS[di];
            const realDayIdx = DAYS_FULL.indexOf(dayName);
            if (realDayIdx < 0) return;
            slots.push({
              periodIdx: pi, dayIdx: realDayIdx,
              time: ADMIN_TIME_SLOTS[pi] || `Period ${pi + 1}`,
              subject: cell.subject || "",
              grade: cell.grade || "", section: cell.section || "",
              room: cell.room || "", mode: cell.mode || "Physical",
              classKey: cell.classKey || `${cell.grade}-${cell.section}`,
            });
          });
        });
        if (slots.length > 0) return slots;
      }
    } catch { /* fall through to grid scan */ }

    const allTimetables = readAllTimetables(dbGrid);
    Object.entries(allTimetables).forEach(([classKey, grid]) => {
      if (!Array.isArray(grid)) return;
      const dash = classKey.lastIndexOf("-");
      const gradeK   = dash > 0 ? classKey.slice(0, dash).trim() : classKey;
      const sectionK = dash > 0 ? classKey.slice(dash + 1).trim() : "";
      grid.forEach((row, pi) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, di) => {
          if (!cell) return;
          if (nameMatches(cell.teacher, teacherName)) {
            slots.push({
              periodIdx: pi, dayIdx: di,
              time: ADMIN_TIME_SLOTS[pi] || `Period ${pi + 1}`,
              subject: cell.subject, grade: gradeK, section: sectionK,
              room: cell.room || "", mode: cell.mode || "Physical",
              classKey,
            });
          }
        });
      });
    });
    return slots;
  }, [teacherName, dbGrid, dbTeachers]);

  const todayName = realTodayDayName();
  const todayDayIdx = todayName ? DAYS_FULL.indexOf(todayName) : -1;

  // Real hero KPIs — Today's Classes / Current Class / Next Class / Free
  // Periods / Weekly Hours, all derived from allSlots + the real clock.
  const heroData = useMemo(() => {
    const todaySlots = todayDayIdx >= 0
      ? allSlots.filter(s => s.dayIdx === todayDayIdx).sort((a, b) => a.periodIdx - b.periodIdx)
      : [];
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    let current: TeachingSlot | null = null;
    let currentEndsIn = 0;
    let next: TeachingSlot | null = null;
    let nextStartsIn = 0;

    for (const s of todaySlots) {
      const { start, end } = parseSlotRange(s.time);
      if (nowMin >= start && nowMin < end) { current = s; currentEndsIn = end - nowMin; }
      if (!next && nowMin < start) { next = s; nextStartsIn = start - nowMin; }
    }

    const freeToday = todayDayIdx >= 0 ? Math.max(0, ADMIN_TIME_SLOTS.length - todaySlots.length) : 0;

    // Real weekly teaching minutes -> hours, from each slot's actual parsed duration.
    const weeklyMinutes = allSlots.reduce((sum, s) => {
      const { start, end } = parseSlotRange(s.time);
      return sum + Math.max(0, end - start);
    }, 0);

    return {
      todayCount: todaySlots.length,
      current, currentEndsIn,
      next, nextStartsIn,
      freeToday,
      weeklyHours: Math.round((weeklyMinutes / 60) * 10) / 10,
    };
  }, [allSlots, todayDayIdx]);

  return (
    <DashboardLayout>
      <div className="relative space-y-5 p-1">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Timetable</h1>
              <p className="text-sm text-muted-foreground">
                {grade} · Section {section} · Academic Year 2026–27
              </p>
            </div>
          </div>
          <button onClick={() => toast.info("Timetable PDF export coming soon.")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/60 transition">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>

        {!initialLoaded ? (
          <TimetableSkeleton />
        ) : (
          <>
            {/* Hero KPI cards — same shared StaticKpiCard the dashboards use */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StaticKpiCard
                title="Today's Classes"
                value={todayName ? heroData.todayCount : "—"}
                icon={Calendar}
                description={todayName ? "Total periods" : "No school today"}
                iconClassName="bg-primary/10 text-primary"
                accentColor="#9810fa"
              />
              <StaticKpiCard
                title="Current Class"
                value={heroData.current ? heroData.current.subject : "—"}
                icon={Video}
                trend={heroData.current ? "Live Now" : undefined}
                trendType={heroData.current ? "up" : "neutral"}
                description={heroData.current
                  ? `${heroData.current.grade} · Ends in ${fmtMinutesLeft(heroData.currentEndsIn)}`
                  : "No class right now"}
                iconClassName="bg-emerald-50 text-emerald-600"
                accentColor="#10b981"
              />
              <StaticKpiCard
                title="Next Class"
                value={heroData.next ? heroData.next.subject : "—"}
                icon={Clock}
                trend={heroData.next ? `Starts in ${fmtMinutesLeft(heroData.nextStartsIn)}` : undefined}
                trendType="neutral"
                description={heroData.next ? `${heroData.next.grade} · Room ${heroData.next.room || "—"}` : "Nothing scheduled after this"}
                iconClassName="bg-blue-50 text-blue-600"
                accentColor="#3b82f6"
              />
              <StaticKpiCard
                title="Free Periods"
                value={todayName ? heroData.freeToday : "—"}
                icon={Coffee}
                description="Periods today"
                iconClassName="bg-orange-50 text-orange-600"
                accentColor="#f97316"
              />
              <StaticKpiCard
                title="Weekly Hours"
                value={heroData.weeklyHours}
                icon={BarChart3}
                description="Total teaching hours"
                iconClassName="bg-[#d12386]/10 text-[#d12386]"
                accentColor="#d12386"
              />
            </div>

            {/* Tab switcher */}
            <div className="flex bg-muted rounded-xl p-1 w-full sm:w-fit gap-1">
              <button onClick={() => setTab("teaching")}
                className={cn("flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition",
                  tab === "teaching" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <GraduationCap className="w-4 h-4" />
                My Teaching Schedule
              </button>
              <button onClick={() => setTab("class")}
                className={cn("flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition",
                  tab === "class" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <BookOpen className="w-4 h-4" />
                My Class Timetable
              </button>
            </div>

            {/* Tab content */}
            {tab === "class" ? (
              <ClassTimetableTab grade={grade} section={section} assignment={assignment} dbGrid={dbGrid} />
            ) : (
              <TeachingScheduleTab allSlots={allSlots} todayName={todayName} />
            )}
          </>
        )}

        <style>{`
          @keyframes tt-live-pulse {
            0% { box-shadow: 0 0 0 0 rgba(244,63,94,0.5); }
            70% { box-shadow: 0 0 0 6px rgba(244,63,94,0); }
            100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
}
