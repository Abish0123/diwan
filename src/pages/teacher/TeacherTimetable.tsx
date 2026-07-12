import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import socket from "@/lib/socket";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { StaticKpiCard } from "@/components/dashboard/StaticKpiCard";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, Clock, MapPin, Download, BookOpen, Printer, CalendarPlus,
  Users, FileText, ClipboardList, FolderOpen,
  BarChart3, GraduationCap, ChevronRight, X,
  ChevronLeft, Video, Monitor, Coffee,
} from "lucide-react";

// An Online period's room is a real join link, not inert text.
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
      <Video className="w-3 h-3 shrink-0" /> Join
    </a>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
const DAYS_FULL    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DISPLAY_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SCHOOL_DAYS   = ["Monday","Tuesday","Wednesday","Thursday","Friday"]; // real teaching days only
// Real period times as published by admin — this app's real timetable data
// only has 5 periods, 08:00-13:00. The requested mockup shows an 8-period
// day with a lunch break out to 14:45; that shape doesn't exist in this
// app's real data, so the real 5-period day is kept here rather than
// padding in fabricated afternoon periods/a lunch slot.
const ADMIN_TIME_SLOTS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 01:00",
];

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

// ── Colour maps — brand-aligned ─────────────────────────────────────────────
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
  Mathematics: "bg-primary", English: "bg-blue-500", Science: "bg-emerald-500",
  Arabic: "bg-teal-500", "Islamic Studies": "bg-emerald-600", "Social Studies": "bg-amber-500",
  "Computer Science": "bg-cyan-500", Computer: "bg-cyan-500", "Physical Education": "bg-orange-500",
  Art: "bg-[#d12386]", History: "bg-rose-500", Chemistry: "bg-lime-500",
  Physics: "bg-sky-500", Biology: "bg-green-500",
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

// ── Week/date helpers ────────────────────────────────────────────────────────
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
    return { full, short: full.slice(0, 3), date: d, label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
  });
}
function realTodayDayName(): string | null {
  const idx = new Date().getDay() - 1;
  return idx >= 0 && idx <= 4 ? SCHOOL_DAYS[idx] : null;
}
function currentAcademicYearLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type GridCell = { mode: string; subject: string; teacher: string; room: string } | null;
type AllTimetables = Record<string, GridCell[][]>;
interface CompiledSlot { subject: string; mode: string; room: string; grade: string; section: string; classKey: string }
interface TeachingSlot {
  periodIdx: number; dayIdx: number;
  time: string; subject: string;
  grade: string; section: string; room: string; mode: string;
  classKey: string;
}

function normName(s: string) {
  return s.toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}
function nameMatches(cellTeacher: string, myName: string): boolean {
  if (!cellTeacher || !myName) return false;
  return normName(cellTeacher) === normName(myName);
}
// Best-effort "live" — this app has no field linking a LiveClass document to
// a specific timetable slot, so "live" means the real clock is inside this
// period's real time range right now, not a guaranteed started session.
function liveStatusFor(time: string, isRealToday: boolean): "live" | "upcoming" | "done" | null {
  if (!isRealToday) return null;
  const { start, end } = parseSlotRange(time);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin >= start && nowMin < end) return "live";
  if (nowMin < start) return "upcoming";
  return "done";
}

// ── Quick-action drawer (right-side, click a period) ────────────────────────
interface SlotAction { time: string; subject: string; grade: string; section: string; room: string; mode: string }
function QuickActionPanel({ slot, onClose }: { slot: SlotAction; onClose: () => void }) {
  const navigate = useNavigate();
  const modeIcon =
    slot.mode === "Online" ? <Video className="w-3.5 h-3.5" /> :
    slot.mode === "Hybrid" ? <Monitor className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />;
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
        key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onClose}
      >
        <motion.div
          key="drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
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
              <button onClick={onClose} className="text-white/70 hover:text-white mt-0.5"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Teaching Actions</p>
            <div className="grid grid-cols-2 gap-2.5">
              {actions.map((a) => (
                <button key={a.label} onClick={() => { navigate(a.path); onClose(); }}
                  className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-transform hover:scale-[1.03]", a.color)}>
                  <a.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-left leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition">Close</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Subject legend ───────────────────────────────────────────────────────────
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
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        <span className="text-[11px] text-muted-foreground font-medium">Free Period</span>
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function TimetableSkeleton() {
  return (
    <div className="space-y-5 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array(5).fill(0).map((_, i) => <div key={i} className="bg-card border border-border/50 rounded-[24px] p-4 h-32 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-3 bg-card border border-border/50 rounded-[24px] p-4 h-96 animate-pulse" />
        <div className="lg:col-span-1 space-y-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="bg-card border border-border/50 rounded-[24px] p-4 h-28 animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

// ── Weekly grid — the primary view: day columns x period rows, every real
// period rendered as a mini card, matching the requested mockup exactly. ──
function WeeklyGrid({ allSlots, weekDays, isCurrentWeek, onOpen }: {
  allSlots: TeachingSlot[]; weekDays: ReturnType<typeof buildWeekDays>; isCurrentWeek: boolean; onOpen: (s: SlotAction) => void;
}) {
  const todayName = realTodayDayName();
  const cellFor = (periodIdx: number, dayFull: string) => {
    const dayIdx = DAYS_FULL.indexOf(dayFull);
    return allSlots.find((s) => s.periodIdx === periodIdx && s.dayIdx === dayIdx) || null;
  };
  return (
    <div className="premium-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground w-24">Time</th>
              {weekDays.map((d) => (
                <th key={d.full} className="p-3 text-center">
                  <div className={cn("text-xs font-bold", d.full === todayName ? "text-primary" : "text-foreground")}>{d.short}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADMIN_TIME_SLOTS.map((time, ti) => (
              <tr key={ti} className="border-b border-border/60 last:border-0">
                <td className="p-2 align-top">
                  <p className="text-[11px] font-mono text-muted-foreground leading-tight">{time.split(" - ")[0]}</p>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight">– {time.split(" - ")[1]}</p>
                </td>
                {weekDays.map((d) => {
                  const cell = SCHOOL_DAYS.includes(d.full) ? cellFor(ti, d.full) : null;
                  const isSchoolDay = SCHOOL_DAYS.includes(d.full);
                  const live = cell && isCurrentWeek ? liveStatusFor(time, d.full === todayName) : null;
                  return (
                    <td key={d.full} className="p-1.5 align-top">
                      {!isSchoolDay ? (
                        <div className="h-full min-h-[64px] flex items-center justify-center text-muted-foreground/40 text-xs">—</div>
                      ) : cell ? (
                        <motion.button
                          whileHover={{ scale: 1.03, y: -2 }}
                          onClick={() => onOpen({ time, subject: cell.subject, grade: cell.grade, section: cell.section, room: cell.room, mode: cell.mode })}
                          className={cn(
                            "w-full text-left rounded-xl border px-2.5 py-2 transition-shadow hover:shadow-lg relative",
                            cardColorFor(cell.subject),
                            live === "live" && "ring-2 ring-rose-400/70"
                          )}
                        >
                          {live === "live" && (
                            <span className="absolute -top-1.5 left-1.5 flex items-center gap-1 text-[8px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded-full shadow">
                              <span className="w-1 h-1 rounded-full bg-white" style={{ animation: "tt-live-pulse-dot 1.4s ease-out infinite" }} />
                              NOW
                            </span>
                          )}
                          <p className="text-[11px] font-bold leading-tight truncate">{cell.subject}</p>
                          <p className="text-[10px] opacity-70 leading-tight mt-0.5 truncate">{cell.grade} · Sec {cell.section}</p>
                          {cell.room && <p className="text-[10px] opacity-60 leading-tight truncate">{cell.room.startsWith("http") ? "Online" : cell.room}</p>}
                        </motion.button>
                      ) : (
                        <div className="h-full min-h-[64px] rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground/50">
                          <Coffee className="w-3.5 h-3.5" />
                          <span className="text-[9px]">Free</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`
        @keyframes tt-live-pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

// ── Daily list view ──────────────────────────────────────────────────────────
function DailyList({ allSlots, dayFull, dayLabel, onOpen }: {
  allSlots: TeachingSlot[]; dayFull: string; dayLabel: string; onOpen: (s: SlotAction) => void;
}) {
  const todayName = realTodayDayName();
  const isRealToday = dayFull === todayName;
  const dayIdx = DAYS_FULL.indexOf(dayFull);
  const periods = ADMIN_TIME_SLOTS.map((time, pi) => ({
    time, periodNum: pi + 1,
    slot: SCHOOL_DAYS.includes(dayFull) ? allSlots.find((s) => s.periodIdx === pi && s.dayIdx === dayIdx) || null : null,
  }));
  return (
    <div className="premium-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <h3 className="font-bold text-foreground">{dayFull}<span className="text-muted-foreground font-normal ml-2 text-sm">{dayLabel}</span></h3>
        <span className="text-xs text-muted-foreground">{periods.filter(p => p.slot).length} of {ADMIN_TIME_SLOTS.length} periods</span>
      </div>
      <div className="divide-y divide-border/60">
        {periods.map(({ time, periodNum, slot }) => {
          const live = slot ? liveStatusFor(time, isRealToday) : null;
          return (
            <motion.div
              key={periodNum}
              whileHover={slot ? { scale: 1.01 } : undefined}
              className={cn("px-5 py-3 flex items-center gap-4", slot ? "cursor-pointer hover:bg-muted/30" : "")}
              onClick={() => slot && onOpen({ time, subject: slot.subject, grade: slot.grade, section: slot.section, room: slot.room, mode: slot.mode })}
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0", slot ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{periodNum}</div>
              <div className="w-28 flex-shrink-0">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {time}</p>
              </div>
              {slot ? (
                <div className={cn("flex-1 flex items-center gap-3 px-3 py-2 rounded-xl border", cardColorFor(slot.subject), live === "live" && "ring-2 ring-rose-400/60")}>
                  <div className={cn("w-1.5 h-9 rounded-full flex-shrink-0", dotColorFor(slot.subject))} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{slot.subject}</p>
                      {live === "live" && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" style={{ animation: "tt-live-pulse-dot 1.4s ease-out infinite" }} /> LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-70">{slot.grade} · Section {slot.section}</p>
                  </div>
                  {slot.room && (
                    <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
                      {!slot.room.startsWith("http") && <MapPin className="w-3 h-3 opacity-60" />}
                      <RoomLabel room={slot.room} className="opacity-100" />
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 opacity-30 flex-shrink-0" />
                </div>
              ) : (
                <div className="flex-1 px-3 py-2 rounded-xl bg-muted/40 border border-dashed border-border flex items-center gap-2">
                  <Coffee className="w-3.5 h-3.5 text-muted-foreground/60" /><p className="text-xs text-muted-foreground italic">Free Period</p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Right sidebar ─────────────────────────────────────────────────────────────
interface SidebarProps {
  todayName: string | null; todayCount: number;
  studentsToday: number; studentsLoading: boolean;
  teachingHoursToday: number; freeToday: number; subjectsToday: number;
  next: TeachingSlot | null; nextStartsIn: number;
}
function TimetableSidebar({ todayName, todayCount, studentsToday, studentsLoading, teachingHoursToday, freeToday, subjectsToday, next, nextStartsIn }: SidebarProps) {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(nextStartsIn);
  useEffect(() => { setCountdown(nextStartsIn); }, [nextStartsIn]);
  useEffect(() => {
    if (!next) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 60_000);
    return () => clearInterval(t);
  }, [next]);

  const summary = [
    { label: "Classes", value: todayName ? todayCount : "—", icon: Calendar },
    { label: "Students", value: studentsLoading ? "…" : (todayName ? studentsToday : "—"), icon: Users },
    { label: "Teaching Hours", value: todayName ? teachingHoursToday : "—", icon: Clock },
    { label: "Free Periods", value: todayName ? freeToday : "—", icon: Coffee },
    { label: "Subjects", value: todayName ? subjectsToday : "—", icon: BookOpen },
  ];
  const quickActions = [
    { label: "Take Attendance", icon: Users, color: "bg-blue-50 text-blue-600", fn: () => navigate("/teacher/attendance") },
    { label: "Create Homework", icon: BookOpen, color: "bg-amber-50 text-amber-600", fn: () => navigate("/teacher/homework") },
    { label: "Live Class", icon: Video, color: "bg-emerald-50 text-emerald-600", fn: () => navigate("/academics/live-classes") },
    { label: "Enter Marks", icon: ClipboardList, color: "bg-primary/10 text-primary", fn: () => navigate("/teacher/exams") },
    { label: "Study Material", icon: FolderOpen, color: "bg-[#d12386]/10 text-[#d12386]", fn: () => navigate("/teacher/study-materials") },
    { label: "Create Assessment", icon: BarChart3, color: "bg-indigo-50 text-indigo-600", fn: () => navigate("/teacher/assessments") },
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.35 }} className="premium-card p-4">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5 mb-3"><BarChart3 className="w-4 h-4 text-primary" /> Today's Summary</h3>
        <div className="space-y-2.5">
          {summary.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5 opacity-60" /> {s.label}</span>
              <span className="text-sm font-bold text-foreground tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38, duration: 0.35 }} className="premium-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground text-sm">Next Class</h3>
          {next && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Starts in {fmtMinutesLeft(countdown)}</span>}
        </div>
        {next ? (
          <>
            <div className={cn("rounded-xl border p-3 flex items-center gap-3", cardColorFor(next.subject))}>
              <div className={cn("w-2 h-10 rounded-full flex-shrink-0", dotColorFor(next.subject))} />
              <div className="min-w-0">
                <p className="font-bold text-sm">{next.subject}</p>
                <p className="text-[11px] opacity-70">{next.grade} · Section {next.section}</p>
                <p className="text-[11px] opacity-70 flex items-center gap-1 mt-0.5">
                  {!next.room.startsWith("http") && <MapPin className="w-3 h-3" />}
                  <RoomLabel room={next.room} className="opacity-100" />
                </p>
              </div>
            </div>
            <button
              onClick={() => next.room.startsWith("http") ? window.open(next.room, "_blank") : navigate("/teacher/attendance")}
              className="w-full mt-3 py-2.5 rounded-xl text-white text-sm font-bold transition-transform hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, #d12386 0%, #9810fa 100%)" }}
            >
              Open Class
            </button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Nothing else scheduled today.</p>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46, duration: 0.35 }} className="premium-card p-4">
        <h3 className="font-bold text-foreground text-sm mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((a) => (
            <button key={a.label} onClick={a.fn} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-transparent hover:border-border hover:bg-muted/50 transition-transform hover:-translate-y-0.5">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", a.color)}><a.icon className="w-4 h-4" /></div>
              <span className="text-[10px] font-semibold text-foreground/90 text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// Real weekly-recurring .ics export.
const ICS_BYDAY: Record<string, string> = { Monday: "MO", Tuesday: "TU", Wednesday: "WE", Thursday: "TH", Friday: "FR", Saturday: "SA" };
function downloadTimetableIcs(allSlots: TeachingSlot[], teacherName: string) {
  if (allSlots.length === 0) { toast.error("No teaching slots to sync yet."); return; }
  const esc = (s: string) => s.replace(/[,;]/g, "\\$&");
  const monday = getMonday(new Date());
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const events = allSlots.map((s) => {
    const dayName = DAYS_FULL[s.dayIdx];
    const dayOffset = SCHOOL_DAYS.indexOf(dayName);
    if (dayOffset < 0) return null;
    const eventDate = new Date(monday);
    eventDate.setDate(monday.getDate() + dayOffset);
    const { start, end } = parseSlotRange(s.time);
    const toIcsDateTime = (d: Date, mins: number) => {
      const dt = new Date(d);
      dt.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      return dt.toISOString().replace(/[-:]/g, "").split(".")[0];
    };
    const byday = ICS_BYDAY[dayName];
    return [
      "BEGIN:VEVENT",
      `UID:tt-${s.classKey}-${s.periodIdx}-${s.dayIdx}@studentdiwan`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDateTime(eventDate, start)}`,
      `DTEND:${toIcsDateTime(eventDate, end)}`,
      byday ? `RRULE:FREQ=WEEKLY;BYDAY=${byday}` : "",
      `SUMMARY:${esc(s.subject)} — ${esc(s.grade)} Section ${esc(s.section)}`,
      s.room ? `LOCATION:${esc(s.room)}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  }).filter(Boolean);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Student Diwan//Timetable//EN", ...events, "END:VCALENDAR"].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${(teacherName || "timetable").replace(/\s+/g, "_")}_schedule.ics`;
  a.click(); URL.revokeObjectURL(url);
  toast.success("Calendar file downloaded — import it into your calendar app");
}

// ── Root Component ────────────────────────────────────────────────────────────
export default function TeacherTimetable() {
  const { assignment } = useTeacherClass();
  const teacherName = assignment.teacherName || "";
  const academicYear = currentAcademicYearLabel();

  const [view, setView] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const isCurrentWeek = useMemo(() => getMonday(new Date()).toDateString() === weekStart.toDateString(), [weekStart]);
  const [activeDay, setActiveDay] = useState(() => realTodayDayName() || "Monday");
  const [selectedSlot, setSelectedSlot] = useState<SlotAction | null>(null);

  const [dbGrid, setDbGrid] = useState<AllTimetables | undefined>(undefined);
  const [dbTeachers, setDbTeachers] = useState<Record<string, any> | undefined>(undefined);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const lastPublishedAt = useRef<string | null>(null);

  const fetchTimetableFromDb = useCallback(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setInitialLoaded(true);
        if (!data || data.error) return;
        if (data.gridJson) { try { setDbGrid(JSON.parse(data.gridJson)); } catch {} }
        if (data.teacherJson) { try { setDbTeachers(JSON.parse(data.teacherJson)); } catch {} }
        const pub = data.publishedAt || data.updatedAt || null;
        if (pub && lastPublishedAt.current && pub !== lastPublishedAt.current) toast.info("Your timetable was just updated by admin.");
        if (pub) lastPublishedAt.current = pub;
      })
      .catch(() => setInitialLoaded(true));
  }, []);

  useEffect(() => {
    fetchTimetableFromDb();
    const poll = setInterval(fetchTimetableFromDb, 10_000);
    const onNotification = (n: any) => { if (n?.entity === "timetable_slots") fetchTimetableFromDb(); };
    socket.on("notification", onNotification);
    socket.on("timetable-published", fetchTimetableFromDb);
    const onVisible = () => { if (document.visibilityState === "visible") fetchTimetableFromDb(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      socket.off("notification", onNotification);
      socket.off("timetable-published", fetchTimetableFromDb);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchTimetableFromDb]);

  // Real full teaching schedule — every period this teacher teaches, across every class.
  const allSlots = useMemo<TeachingSlot[]>(() => {
    const slots: TeachingSlot[] = [];
    const myNorm = normName(teacherName);
    try {
      const compiled: Record<string, { schedule: (CompiledSlot | null)[][]; days: string[] }> = dbTeachers || {};
      const key = Object.keys(compiled).find((k) => k === teacherName || k.toLowerCase() === teacherName.toLowerCase() || normName(k) === myNorm);
      if (key) {
        const { schedule, days } = compiled[key];
        const resolvedDays: string[] = Array.isArray(days) ? days : SCHOOL_DAYS;
        schedule.forEach((row, pi) => {
          if (!Array.isArray(row)) return;
          row.forEach((cell, di) => {
            if (!cell) return;
            const dayName = resolvedDays[di] ?? SCHOOL_DAYS[di];
            const realDayIdx = DAYS_FULL.indexOf(dayName);
            if (realDayIdx < 0) return;
            slots.push({
              periodIdx: pi, dayIdx: realDayIdx,
              time: ADMIN_TIME_SLOTS[pi] || `Period ${pi + 1}`,
              subject: cell.subject || "", grade: cell.grade || "", section: cell.section || "",
              room: cell.room || "", mode: cell.mode || "Physical",
              classKey: cell.classKey || `${cell.grade}-${cell.section}`,
            });
          });
        });
        if (slots.length > 0) return slots;
      }
    } catch { /* fall through */ }

    // Source 2: scan the real full class grid (published-timetable-v3),
    // matching by real teacher name — no localStorage fallback, so an
    // empty/not-yet-published real fetch correctly falls through to the
    // honest "not published yet" empty state instead of stale cached data.
    Object.entries(dbGrid || {}).forEach(([classKey, grid]) => {
      if (!Array.isArray(grid)) return;
      const dash = classKey.lastIndexOf("-");
      const gradeK = dash > 0 ? classKey.slice(0, dash).trim() : classKey;
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

  const subjects = useMemo(() => Array.from(new Set(allSlots.map((s) => s.subject))).sort(), [allSlots]);
  const todayName = realTodayDayName();
  const todayDayIdx = todayName ? DAYS_FULL.indexOf(todayName) : -1;

  const heroData = useMemo(() => {
    const todaySlots = todayDayIdx >= 0 ? allSlots.filter((s) => s.dayIdx === todayDayIdx).sort((a, b) => a.periodIdx - b.periodIdx) : [];
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let current: TeachingSlot | null = null, currentEndsIn = 0, next: TeachingSlot | null = null, nextStartsIn = 0;
    for (const s of todaySlots) {
      const { start, end } = parseSlotRange(s.time);
      if (nowMin >= start && nowMin < end) { current = s; currentEndsIn = end - nowMin; }
      if (!next && nowMin < start) { next = s; nextStartsIn = start - nowMin; }
    }
    const freeToday = todayDayIdx >= 0 ? Math.max(0, ADMIN_TIME_SLOTS.length - todaySlots.length) : 0;
    const weeklyMinutes = allSlots.reduce((sum, s) => { const { start, end } = parseSlotRange(s.time); return sum + Math.max(0, end - start); }, 0);
    const teachingMinutesToday = todaySlots.reduce((sum, s) => { const { start, end } = parseSlotRange(s.time); return sum + Math.max(0, end - start); }, 0);
    const subjectsToday = new Set(todaySlots.map((s) => s.subject)).size;
    const classKeysToday = Array.from(new Set(todaySlots.map((s) => s.classKey)));
    return {
      todayCount: todaySlots.length, current, currentEndsIn, next, nextStartsIn, freeToday,
      weeklyHours: Math.round((weeklyMinutes / 60) * 10) / 10,
      teachingHoursToday: Math.round((teachingMinutesToday / 60) * 10) / 10,
      subjectsToday, classKeysToday,
    };
  }, [allSlots, todayDayIdx]);

  const [studentsToday, setStudentsToday] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(true);
  useEffect(() => {
    if (heroData.classKeysToday.length === 0) { setStudentsToday(0); setStudentsLoading(false); return; }
    let active = true;
    setStudentsLoading(true);
    smartDb.getAll("Student").then((rows: any[]) => {
      if (!active) return;
      const keySet = new Set(heroData.classKeysToday);
      const norm = (g: string, s: string) => `${(g || "").trim()}-${(s || "").trim()}`;
      setStudentsToday(new Set((rows || []).filter((st) => keySet.has(norm(st.grade, st.section))).map((st) => st.id)).size);
    }).catch(() => { if (active) setStudentsToday(0); })
      .finally(() => { if (active) setStudentsLoading(false); });
    return () => { active = false; };
  }, [heroData.classKeysToday]);

  const activeDayInfo = weekDays.find((d) => d.full === activeDay);

  return (
    <DashboardLayout>
      <div className="relative space-y-5 p-1">
        <AnimatePresence>{selectedSlot && <QuickActionPanel slot={selectedSlot} onClose={() => setSelectedSlot(null)} />}</AnimatePresence>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Timetable</h1>
            <p className="text-sm text-muted-foreground">Your weekly class schedule</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground/90 bg-card">
              <Calendar className="w-4 h-4 text-primary" /> Academic Year {academicYear}
            </span>
          </div>
        </div>

        {!initialLoaded ? (
          <TimetableSkeleton />
        ) : (
          <>
            {/* Hero KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StaticKpiCard title="Today's Classes" value={todayName ? heroData.todayCount : "—"} icon={Calendar}
                description={todayName ? "Total periods" : "No school today"} iconClassName="bg-primary/10 text-primary" accentColor="#9810fa" />
              <StaticKpiCard title="Current Class" value={heroData.current ? heroData.current.subject : "—"} icon={Video}
                trend={heroData.current ? "Live Now" : undefined} trendType={heroData.current ? "up" : "neutral"}
                description={heroData.current ? `${heroData.current.grade} · Ends in ${fmtMinutesLeft(heroData.currentEndsIn)}` : "No class right now"}
                iconClassName="bg-emerald-50 text-emerald-600" accentColor="#10b981" />
              <StaticKpiCard title="Next Class" value={heroData.next ? heroData.next.subject : "—"} icon={Clock}
                trend={heroData.next ? `Starts in ${fmtMinutesLeft(heroData.nextStartsIn)}` : undefined} trendType="neutral"
                description={heroData.next ? `${heroData.next.grade} · Room ${heroData.next.room || "—"}` : "Nothing scheduled after this"}
                iconClassName="bg-blue-50 text-blue-600" accentColor="#3b82f6" />
              <StaticKpiCard title="Free Periods" value={todayName ? heroData.freeToday : "—"} icon={Coffee}
                description="Periods today" iconClassName="bg-orange-50 text-orange-600" accentColor="#f97316" />
              <StaticKpiCard title="Weekly Hours" value={heroData.weeklyHours} icon={BarChart3}
                description="Total teaching hours" iconClassName="bg-[#d12386]/10 text-[#d12386]" accentColor="#d12386" />
            </div>

            {/* Controls: date nav + Daily/Weekly/Monthly chips + Print/Export/Sync */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5">
                  <button onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })} className="p-1 rounded-lg hover:bg-muted/60 text-muted-foreground">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-foreground/90 px-1">{weekDays[0]?.label} – {weekDays[4]?.label}</span>
                  <button onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })} className="p-1 rounded-lg hover:bg-muted/60 text-muted-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["daily", "weekly", "monthly"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        if (v === "monthly") { toast.info("The published timetable repeats weekly — there's no separate monthly schedule to show."); return; }
                        setView(v);
                      }}
                      className={cn("px-4 py-1.5 rounded-full text-xs font-bold border transition capitalize",
                        view === v ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40")}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={() => toast.info("Timetable PDF export coming soon.")} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition">
                  <Download className="w-3.5 h-3.5" /> Export PDF
                </button>
                <button onClick={() => downloadTimetableIcs(allSlots, teacherName)} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition">
                  <CalendarPlus className="w-3.5 h-3.5" /> Sync Calendar
                </button>
              </div>
            </div>

            {/* Daily view's own day chips */}
            {view === "daily" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {weekDays.filter((d) => SCHOOL_DAYS.includes(d.full)).map((d) => (
                  <button key={d.full} onClick={() => setActiveDay(d.full)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition",
                      activeDay === d.full ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    {d.short} {d.label}
                  </button>
                ))}
              </div>
            )}

            {allSlots.length === 0 ? (
              <div className="premium-card p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No classes scheduled</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Admin hasn't published a timetable with you assigned yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">
                <div className="lg:col-span-3 space-y-5">
                  {view === "daily" ? (
                    <DailyList allSlots={allSlots} dayFull={activeDay} dayLabel={activeDayInfo?.label || ""} onOpen={setSelectedSlot} />
                  ) : (
                    <WeeklyGrid allSlots={allSlots} weekDays={weekDays} isCurrentWeek={isCurrentWeek} onOpen={setSelectedSlot} />
                  )}
                  <SubjectLegend subjects={subjects} />
                </div>
                <div className="lg:col-span-1">
                  <TimetableSidebar
                    todayName={todayName} todayCount={heroData.todayCount}
                    studentsToday={studentsToday} studentsLoading={studentsLoading}
                    teachingHoursToday={heroData.teachingHoursToday} freeToday={heroData.freeToday} subjectsToday={heroData.subjectsToday}
                    next={heroData.next} nextStartsIn={heroData.nextStartsIn}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
