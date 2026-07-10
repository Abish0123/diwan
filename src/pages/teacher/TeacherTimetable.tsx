import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import socket from "@/lib/socket";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, Clock, MapPin, Download, BookOpen,
  Users, FileText, ClipboardList, FolderOpen,
  BarChart3, GraduationCap, ChevronRight, X,
  ChevronLeft, Video, Monitor, LayoutGrid, List,
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
      className={cn("inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 hover:underline font-semibold", className)}
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

// ── Colour maps ───────────────────────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, string> = {
  Mathematics:          "bg-violet-50 border-violet-200 text-violet-700",
  English:              "bg-blue-50 border-blue-200 text-blue-700",
  Science:              "bg-emerald-50 border-emerald-200 text-emerald-700",
  Arabic:               "bg-amber-50 border-amber-200 text-amber-700",
  "Islamic Studies":    "bg-orange-50 border-orange-200 text-orange-700",
  "Social Studies":     "bg-indigo-50 border-indigo-200 text-indigo-700",
  "Computer Science":   "bg-sky-50 border-sky-200 text-sky-700",
  Computer:             "bg-sky-50 border-sky-200 text-sky-700",
  "Physical Education": "bg-teal-50 border-teal-200 text-teal-700",
  Art:                  "bg-pink-50 border-pink-200 text-pink-700",
  History:              "bg-rose-50 border-rose-200 text-rose-700",
  Chemistry:            "bg-lime-50 border-lime-200 text-lime-700",
  Physics:              "bg-cyan-50 border-cyan-200 text-cyan-700",
  Biology:              "bg-green-50 border-green-200 text-green-700",
};
const DOT_COLORS: Record<string, string> = {
  Mathematics:          "bg-violet-500",
  English:              "bg-blue-500",
  Science:              "bg-emerald-500",
  Arabic:               "bg-amber-500",
  "Islamic Studies":    "bg-orange-500",
  "Social Studies":     "bg-indigo-500",
  "Computer Science":   "bg-sky-500",
  Computer:             "bg-sky-500",
  "Physical Education": "bg-teal-500",
  Art:                  "bg-pink-500",
  History:              "bg-rose-500",
  Chemistry:            "bg-lime-500",
  Physics:              "bg-cyan-500",
  Biology:              "bg-green-500",
};

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

// ── Types ─────────────────────────────────────────────────────────────────────
type GridCell = { mode: string; subject: string; teacher: string; room: string } | null;
type AllTimetables = Record<string, GridCell[][]>;
interface CompiledSlot {
  subject: string; mode: string; room: string;
  grade: string; section: string; classKey: string;
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

// ── Quick Action Panel ────────────────────────────────────────────────────────
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
    { label: "Create Assignment", icon: ClipboardList, path: "/teacher/assignments",      color: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" },
    { label: "Study Materials",   icon: FolderOpen,    path: "/teacher/study-materials",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { label: "Create Assessment", icon: BarChart3,     path: "/teacher/assessments",      color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
    { label: "View Exams",        icon: FileText,      path: "/teacher/exams",            color: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 bg-gradient-to-r from-purple-600 to-purple-600 flex items-start justify-between">
          <div>
            <p className="text-white font-black text-base">{slot.subject}</p>
            <p className="text-white/80 text-xs mt-0.5">{slot.grade} · Section {slot.section}</p>
            <p className="text-white/70 text-xs flex items-center gap-1.5 mt-1 flex-wrap">
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
        <div className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Teaching Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            {actions.map(a => (
              <button key={a.label} onClick={() => { navigate(a.path); onClose(); }}
                className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition", a.color)}>
                <a.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-left leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition">
            Close
          </button>
        </div>
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

  if (!hasTimetable) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center mt-4">
        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-400">No Timetable Published</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
          Admin hasn't published a timetable for {classKey} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-4">
      {/* Class header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-600 rounded-2xl p-5 text-white">
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
      <div className="bg-white rounded-2xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-600">
            {weekDays[0]?.date} – {weekDays[4]?.date}
          </span>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {weekDays.map(d => (
            <button key={d.full} onClick={() => setActiveDay(d.full)}
              className={cn("flex flex-col items-center py-2 rounded-xl border transition",
                activeDay === d.full
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50")}>
              <span className={cn("text-[10px] font-bold", activeDay === d.full ? "text-violet-700" : "text-slate-500")}>
                {d.short}
              </span>
              <span className={cn("text-base font-black mt-0.5 leading-none", activeDay === d.full ? "text-purple-600" : "text-slate-700")}>
                {d.date.split(" ")[0]}
              </span>
              <span className={cn("text-[9px] mt-0.5", activeDay === d.full ? "text-violet-500" : "text-slate-400")}>
                {d.date.split(" ")[1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Day schedule */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">
            {activeDay}
            {activeDayInfo && (
              <span className="text-slate-400 font-normal ml-2 text-sm">{activeDayInfo.date}</span>
            )}
          </h3>
          <span className="text-xs text-slate-400">{todayCount} of {ADMIN_TIME_SLOTS.length} periods</span>
        </div>
        <div className="divide-y divide-slate-50">
          {dayPeriods.map(({ time, periodNum, cell }) => (
            <div key={periodNum} className="px-5 py-3 flex items-center gap-4">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0",
                cell ? "bg-violet-100 text-purple-600" : "bg-slate-100 text-slate-400")}>
                {periodNum}
              </div>
              <div className="w-32 flex-shrink-0">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {time}
                </p>
              </div>
              {cell ? (
                <div className={cn("flex-1 flex items-center gap-3 px-3 py-2 rounded-xl border",
                  SUBJECT_COLORS[cell.subject] || "bg-slate-50 border-slate-200 text-slate-700")}>
                  <div className={cn("w-1.5 h-8 rounded-full flex-shrink-0", DOT_COLORS[cell.subject] || "bg-slate-300")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{cell.subject}</p>
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
                <div className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                  <p className="text-xs text-slate-300 italic">Free Period</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly overview grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Weekly Overview</h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr>
                <th className="p-2 text-left text-slate-400 font-semibold w-28">Time</th>
                {weekDays.map(d => (
                  <th key={d.full}
                    className={cn("p-2 text-center font-semibold", activeDay === d.full ? "text-violet-700" : "text-slate-500")}>
                    <div>{d.short}</div>
                    <div className={cn("text-[9px] font-normal mt-0.5", activeDay === d.full ? "text-violet-400" : "text-slate-300")}>
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_TIME_SLOTS.map((time, ti) => (
                <tr key={ti} className="border-t border-slate-50">
                  <td className="p-2 text-slate-400 font-mono text-[10px]">{time}</td>
                  {DISPLAY_DAYS.map((d, di) => {
                    const c = classGrid[ti]?.[di] ?? null;
                    return (
                      <td key={d} className="p-1">
                        {c ? (
                          <div className={cn("rounded-lg px-1.5 py-1 text-center text-[10px] font-semibold border",
                            SUBJECT_COLORS[c.subject] || "bg-slate-50 border-slate-100 text-slate-500",
                            activeDay === d && "ring-1 ring-violet-400")}>
                            {c.subject.length > 7 ? c.subject.slice(0, 7) + "…" : c.subject}
                          </div>
                        ) : (
                          <div className="rounded-lg px-1.5 py-1 text-center text-[10px] text-slate-200 bg-slate-50">—</div>
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
function TeachingScheduleTab({ teacherName, dbGrid, dbTeachers }: {
  teacherName: string; dbGrid?: AllTimetables; dbTeachers?: Record<string, any>;
}) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const [view, setView] = useState<"daily" | "weekly">("daily");

  const [activeDay, setActiveDay] = useState(() => {
    const idx = Math.min(new Date().getDay() - 1, 4);
    return idx >= 0 ? DISPLAY_DAYS[idx] : "Monday";
  });
  const dayIdx = DAYS_FULL.indexOf(activeDay);

  const [selectedSlot, setSelectedSlot] = useState<SlotAction | null>(null);

  interface TeachingSlot {
    periodIdx: number; dayIdx: number;
    time: string; subject: string;
    grade: string; section: string; room: string; mode: string;
    classKey: string;
  }

  // Build slots — Source 1: compiled teacher schedules (DB or localStorage), Source 2: scan grid (DB or localStorage)
  const allSlots = useMemo<TeachingSlot[]>(() => {
    const slots: TeachingSlot[] = [];
    const myNorm = normName(teacherName);

    // Source 1: compiled per-teacher schedule (DB teacherJson takes priority over localStorage)
    try {
      const compiled: Record<string, { schedule: (CompiledSlot|null)[][]; days: string[] }> =
        dbTeachers && Object.keys(dbTeachers).length > 0
          ? dbTeachers
          : JSON.parse(localStorage.getItem("sd_teacher_timetables") || "{}");

      // Find our key (exact → case-insensitive → title-stripped)
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
    } catch {}

    // Source 2: scan grid (DB takes priority over localStorage) with fuzzy name matching
    const allTimetables = readAllTimetables(dbGrid);
    Object.entries(allTimetables).forEach(([classKey, grid]) => {
      if (!Array.isArray(grid)) return;
      const dash = classKey.lastIndexOf("-");
      const grade   = dash > 0 ? classKey.slice(0, dash).trim() : classKey;
      const section = dash > 0 ? classKey.slice(dash + 1).trim() : "";
      grid.forEach((row, pi) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, di) => {
          if (!cell) return;
          if (nameMatches(cell.teacher, teacherName)) {
            slots.push({
              periodIdx: pi, dayIdx: di,
              time: ADMIN_TIME_SLOTS[pi] || `Period ${pi + 1}`,
              subject: cell.subject, grade, section,
              room: cell.room || "", mode: cell.mode || "Physical",
              classKey,
            });
          }
        });
      });
    });
    return slots;
  }, [teacherName, dbGrid, dbTeachers]);

  const totalWeeklyPeriods = allSlots.length;
  const uniqueClasses      = new Set(allSlots.map(s => s.classKey)).size;
  const todayCount         = allSlots.filter(s => s.dayIdx === dayIdx).length;

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

  const anyDataExists =
    (dbGrid && Object.keys(dbGrid).length > 0) ||
    (dbTeachers && Object.keys(dbTeachers).length > 0) ||
    (() => {
      try {
        const t = localStorage.getItem("sd_timetables_v3");
        const c = localStorage.getItem("sd_teacher_timetables");
        return (t && t !== "{}") || (c && c !== "{}");
      } catch { return false; }
    })();

  if (!anyDataExists) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center mt-4">
        <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-400">No Timetable Published</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
          Admin hasn't published any timetables yet. Your teaching schedule will appear here automatically.
        </p>
      </div>
    );
  }

  if (totalWeeklyPeriods === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center mt-4">
        <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-400">No Teaching Slots Found</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
          No periods assigned to you in the published timetable.
          Ask admin to assign you as subject teacher and re-publish.
        </p>
        <p className="text-[11px] text-slate-300 mt-3 font-mono">Matching name: "{teacherName}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-4">
      {selectedSlot && <QuickActionPanel slot={selectedSlot} onClose={() => setSelectedSlot(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Periods / Week", value: totalWeeklyPeriods, color: "text-purple-600 bg-violet-50" },
          { label: "Classes",        value: uniqueClasses,      color: "text-purple-600 bg-blue-50" },
          { label: "Today",          value: todayCount,         color: "text-emerald-600 bg-emerald-50" },
        ].map(k => (
          <div key={k.label} className={cn("rounded-2xl p-4 text-center", k.color)}>
            <p className="text-3xl font-black">{k.value}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-70">{k.label}</p>
          </div>
        ))}
      </div>

      {/* View toggle — Daily (single-day schedule) vs Weekly (full grid) */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setView("daily")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
            view === "daily" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
          <List className="w-3.5 h-3.5" /> Daily View
        </button>
        <button onClick={() => setView("weekly")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
            view === "weekly" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
          <LayoutGrid className="w-3.5 h-3.5" /> Weekly View
        </button>
      </div>

      {/* Week navigator + day pills with dates + period count badges */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-600">
            {weekDays[0]?.date} – {weekDays[4]?.date}
          </span>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
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
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-100 hover:border-slate-200 hover:bg-slate-50")}>
                <span className={cn("text-[10px] font-bold", activeDay === d.full ? "text-violet-700" : "text-slate-500")}>
                  {d.short}
                </span>
                <span className={cn("text-base font-black mt-0.5 leading-none", activeDay === d.full ? "text-purple-600" : "text-slate-700")}>
                  {d.date.split(" ")[0]}
                </span>
                <span className={cn("text-[9px] mt-0.5", activeDay === d.full ? "text-violet-500" : "text-slate-400")}>
                  {d.date.split(" ")[1]}
                </span>
                {cnt > 0 && (
                  <span className={cn("mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full",
                    activeDay === d.full ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-600")}>
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">
            {activeDay}
            {activeDayInfo && (
              <span className="text-slate-400 font-normal ml-2 text-sm">{activeDayInfo.date}</span>
            )}
          </h3>
          <span className="text-xs text-slate-400">
            {todayCount} class{todayCount !== 1 ? "es" : ""}
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {daySlots.map(({ time, periodNum, slot }) => (
            <div key={periodNum}
              className={cn("px-5 py-3.5 flex items-center gap-4 transition",
                slot ? "hover:bg-slate-50/60 cursor-pointer group" : "")}
              onClick={() => slot && setSelectedSlot({
                time: slot.time, subject: slot.subject,
                grade: slot.grade, section: slot.section,
                room: slot.room, mode: slot.mode,
              })}>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0",
                slot ? "bg-violet-100 text-purple-600" : "bg-slate-100 text-slate-400")}>
                {periodNum}
              </div>
              <div className="w-32 flex-shrink-0">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {time}
                </p>
              </div>
              {slot ? (
                <div className={cn("flex-1 flex items-center gap-3 px-3 py-2 rounded-xl border",
                  SUBJECT_COLORS[slot.subject] || "bg-slate-50 border-slate-200 text-slate-700")}>
                  <div className={cn("w-1.5 h-10 rounded-full flex-shrink-0", DOT_COLORS[slot.subject] || "bg-slate-300")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{slot.subject}</p>
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
                  <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-60 flex-shrink-0 transition" />
                </div>
              ) : (
                <div className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                  <p className="text-xs text-slate-300 italic">Free Period</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Weekly overview grid — every period × every day, across all my classes (Weekly View only) */}
      {view === "weekly" && (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Weekly Overview</h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr>
                <th className="p-2 text-left text-slate-400 font-semibold w-28">Time</th>
                {weekDays.map(d => (
                  <th key={d.full}
                    className={cn("p-2 text-center font-semibold", activeDay === d.full ? "text-violet-700" : "text-slate-500")}>
                    <div>{d.short}</div>
                    <div className={cn("text-[9px] font-normal mt-0.5", activeDay === d.full ? "text-violet-400" : "text-slate-300")}>
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_TIME_SLOTS.map((time, ti) => (
                <tr key={ti} className="border-t border-slate-50">
                  <td className="p-2 text-slate-400 font-mono text-[10px]">{time}</td>
                  {DISPLAY_DAYS.map((d, di) => {
                    const s = allSlots.find(x => x.periodIdx === ti && x.dayIdx === di) || null;
                    return (
                      <td key={d} className="p-1">
                        {s ? (
                          <div className={cn("rounded-lg px-1.5 py-1 text-center text-[10px] font-semibold border",
                            SUBJECT_COLORS[s.subject] || "bg-slate-50 border-slate-100 text-slate-500",
                            activeDay === d && "ring-1 ring-violet-400")}
                            title={`${s.subject} · ${s.grade} Section ${s.section}`}>
                            {s.subject.length > 7 ? s.subject.slice(0, 7) + "…" : s.subject}
                          </div>
                        ) : (
                          <div className="rounded-lg px-1.5 py-1 text-center text-[10px] text-slate-200 bg-slate-50">—</div>
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">All Assigned Classes</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {Array.from(new Map(allSlots.map(s => [s.classKey, s])).values())
              .sort((a, b) => a.classKey.localeCompare(b.classKey))
              .map(s => {
                const count = allSlots.filter(x => x.classKey === s.classKey).length;
                return (
                  <div key={s.classKey} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{s.grade} · Section {s.section}</p>
                      <p className="text-xs text-slate-400">{s.subject}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
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
  const lastPublishedAt = useRef<string | null>(null);

  const fetchTimetableFromDb = useCallback(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
      .catch(() => {});
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

  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Timetable</h1>
              <p className="text-sm text-slate-400">
                {grade} · Section {section} · Academic Year 2026–27
              </p>
            </div>
          </div>
          <button onClick={() => toast.info("Timetable PDF export coming soon.")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-xl p-1 w-full sm:w-fit gap-1">
          <button onClick={() => setTab("teaching")}
            className={cn("flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition",
              tab === "teaching" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <GraduationCap className="w-4 h-4" />
            My Teaching Schedule
          </button>
          <button onClick={() => setTab("class")}
            className={cn("flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition",
              tab === "class" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <BookOpen className="w-4 h-4" />
            My Class Timetable
          </button>
        </div>

        {/* Tab content */}
        {tab === "class" ? (
          <ClassTimetableTab grade={grade} section={section} assignment={assignment} dbGrid={dbGrid} />
        ) : (
          <TeachingScheduleTab teacherName={teacherName} dbGrid={dbGrid} dbTeachers={dbTeachers} />
        )}
      </div>
    </DashboardLayout>
  );
}
