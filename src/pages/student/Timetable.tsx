import { useState, useMemo, useEffect, useCallback } from "react";
import socket from "@/lib/socket";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/contexts/ClassContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
  CalendarDays, List, LayoutGrid, GraduationCap, User, Info, Bell, Video,
} from "lucide-react";

// A period's `room` was always rendered as the plain text "Virtual Link" for
// an Online period — no actual way to reach the meeting from here despite
// looking like a link. Every place that shows a room now goes through this,
// so an Online period is a real clickable join link everywhere consistently.
function RoomLabel({ room, className }: { room?: string; className?: string }) {
  if (!room) return <span className={cn("text-slate-400", className)}>—</span>;
  if (!room.startsWith("http")) return <span className={cn("text-slate-400", className)}>{room}</span>;
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

/* ------------------------------------------------------------------ */
/* Static schedule definition                                          */
/* ------------------------------------------------------------------ */

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function mapStudentSlotToAdminPeriod(slotIndex: number): number | null {
  if (slotIndex === 0) return 0;
  if (slotIndex === 1) return 1;
  if (slotIndex === 2) return 2;
  if (slotIndex === 4) return 3;
  if (slotIndex === 5) return 4;
  return null;
}

type SlotType =
  | { kind: "period"; time: string; label: string }
  | { kind: "break"; time: string; label: string }
  | { kind: "assembly"; time: string; label: string };

const SLOTS: SlotType[] = [
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

/* Pastel color map keyed by subject prefix */
const SUBJECT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  English:        { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    border: "border-l-blue-400" },
  Mathematics:    { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500", border: "border-l-emerald-400" },
  Science:        { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500",   border: "border-l-amber-400" },
  "Social Studies": { bg: "bg-indigo-50", text: "text-indigo-700",  dot: "bg-indigo-500",  border: "border-l-indigo-400" },
  Hindi:          { bg: "bg-rose-50",     text: "text-rose-700",    dot: "bg-rose-500",    border: "border-l-rose-400" },
  Computers:      { bg: "bg-sky-50",      text: "text-sky-700",     dot: "bg-sky-500",     border: "border-l-sky-400" },
  Computer:       { bg: "bg-sky-50",      text: "text-sky-700",     dot: "bg-sky-500",     border: "border-l-sky-400" },
  Art:            { bg: "bg-pink-50",     text: "text-pink-700",    dot: "bg-pink-500",    border: "border-l-pink-400" },
  "Physical Edu.": { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500",  border: "border-l-orange-400" },
  Library:        { bg: "bg-violet-50",   text: "text-violet-700",  dot: "bg-violet-500",  border: "border-l-violet-400" },
  Music:          { bg: "bg-teal-50",     text: "text-teal-700",    dot: "bg-teal-500",    border: "border-l-teal-400" },
  "Life Skills":  { bg: "bg-cyan-50",     text: "text-cyan-700",    dot: "bg-cyan-500",    border: "border-l-cyan-400" },
  "Value Edu.":   { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-500",   border: "border-l-slate-400" },
};
const colorFor = (subj: string) =>
  SUBJECT_COLORS[subj] || { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400", border: "border-l-slate-400" };

const LEGEND_ORDER = [
  "English", "Mathematics", "Science", "Social Studies", "Hindi", "Computers",
  "Art", "Physical Edu.", "Library", "Music", "Life Skills", "Value Edu.",
];

type Cell = { subject: string; teacher: string; room: string };

/* ------------------------------------------------------------------ */
/* Calendar (May 2026)                                                 */
/* ------------------------------------------------------------------ */

const MARKED_DAYS: number[] = []; // populated from real events

function buildCalendar(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return { cells, label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
}

/* ------------------------------------------------------------------ */
/* Notices (static)                                                   */
/* ------------------------------------------------------------------ */

const NOTICES: { title: string; body: string; color: string }[] = [];

/* ================================================================== */

export default function StudentTimetable() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [view, setView] = useState<"weekly" | "daily" | "list">("weekly");

  // Preserve real-data wiring: resolve current student (used for grade/section label)
  const student = useMemo(() => {
    if (!students?.length) return null;
    return (
      students.find(
        (s: any) =>
          (user?.email && s.email === user.email) ||
          (user?.displayName && s.name === user.displayName)
      ) || students[0]
    );
  }, [students, user]) as any;

  // Normalize the grade so it matches the admin's published class keys exactly.
  // Admin keys look like "Grade 3-B" (the grade portion already carries the "Grade " prefix).
  // Student records may store grade as "Grade 12", "12", or a named grade like "Pre-KG"/"LKG"/"UKG",
  // so we must avoid double-prefixing ("Grade Grade 12") which never matches.
  const normalizedGrade = useMemo(() => {
    const raw = student?.grade ? String(student.grade).trim() : "";
    if (!raw) return "Grade 5";
    if (/^grade\s/i.test(raw)) return raw.replace(/^grade\s+/i, "Grade "); // already prefixed
    if (/^(pre-?kg|lkg|ukg|kg)/i.test(raw)) return raw;                     // named grade, no prefix
    return `Grade ${raw}`;                                                  // bare number → add prefix
  }, [student]);

  const normalizedSection = useMemo(
    () => (student?.section ? String(student.section).trim().toUpperCase() : "A"),
    [student]
  );

  const gradeLabel = `${normalizedGrade} - ${normalizedSection}`;
  const isSampleTimetable = !student?.grade;

  // Real class teacher for this student's own section, looked up from the
  // same Class/Section records the admin's Classes module manages — no
  // placeholder name is shown; "Not assigned" is honest when the school
  // hasn't set one for this section yet.
  const { classes, sections } = useClasses();
  const classTeacherName = useMemo(() => {
    const stripGrade = (g: string) => g.replace(/^grade\s+/i, "").trim().toLowerCase();
    const cls = classes.find(c => stripGrade(String(c.grade || "")) === stripGrade(normalizedGrade));
    if (!cls) return null;
    const sec = sections.find(s => s.classId === cls.id && String(s.name || "").trim().toUpperCase() === normalizedSection);
    return sec?.teacherName || null;
  }, [classes, sections, normalizedGrade, normalizedSection]);

  // Dynamic Calendar / Week navigation states
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));

  const weekDaysList = useMemo(() => {
    const list = [];
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 6; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      const dateStr = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
      list.push({
        day: names[i],
        date: dateStr,
        rawDate: d,
      });
    }
    return list;
  }, [currentWeekStart]);

  const weekRangeStr = useMemo(() => {
    const monday = currentWeekStart;
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const startStr = monday.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const endStr = saturday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    return `${startStr} – ${endStr}`;
  }, [currentWeekStart]);

  const handlePrevWeek = () => {
    setCurrentWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  // Which day (0=Mon..5=Sat) Daily/List view is showing — independent of
  // "today" so a student can browse a different day instead of being stuck
  // looking at an empty Saturday/Sunday whenever they open those views.
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => {
    const day = new Date().getDay();
    return day === 0 ? 0 : day - 1;
  });

  const handlePrevDay = () => {
    setSelectedDayIdx(prev => {
      if (prev === 0) { handlePrevWeek(); return 5; }
      return prev - 1;
    });
  };

  const handleNextDay = () => {
    setSelectedDayIdx(prev => {
      if (prev === 5) { handleNextWeek(); return 0; }
      return prev + 1;
    });
  };

  const handleJumpToToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
    const day = new Date().getDay();
    setSelectedDayIdx(day === 0 ? 0 : day - 1);
    toast.success("Jumped to today");
  };

  // Load admin timetables — DB first (shared MySQL), fall back to localStorage
  const [dbTimetables, setDbTimetables] = useState<Record<string, any> | null>(null);

  const fetchTimetableFromDb = useCallback(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.gridJson && !data.error) {
          try { setDbTimetables(JSON.parse(data.gridJson)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTimetableFromDb();

    // Poll every 10 s — catches cross-port publishes
    const poll = setInterval(fetchTimetableFromDb, 10_000);

    // Instant update on same-port socket.io notification
    const onNotification = (n: any) => {
      if (n?.entity === "timetable_slots") fetchTimetableFromDb();
    };
    socket.on("notification", onNotification);
    socket.on("timetable-published", fetchTimetableFromDb);

    // Refetch when tab becomes active again
    const onVisible = () => { if (document.visibilityState === "visible") fetchTimetableFromDb(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      socket.off("notification", onNotification);
      socket.off("timetable-published", fetchTimetableFromDb);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchTimetableFromDb]);

  const timetables = useMemo(() => {
    if (dbTimetables && Object.keys(dbTimetables).length > 0) return dbTimetables;
    try {
      const s = localStorage.getItem("sd_timetables_v3");
      if (s) return JSON.parse(s);
    } catch {}
    return {};
  }, [dbTimetables]);

  const studentClassKey = useMemo(() => {
    return `${normalizedGrade}-${normalizedSection}`;
  }, [normalizedGrade, normalizedSection]);

  const activeClassGrid = useMemo(() => {
    // Exact match first
    if (timetables[studentClassKey]) return timetables[studentClassKey];
    // Fuzzy fallback: normalize whitespace/case on both sides so "Grade 3 - B" matches "Grade 3-B"
    const norm = (k: string) => k.replace(/\s+/g, "").toLowerCase();
    const target = norm(studentClassKey);
    const foundKey = Object.keys(timetables).find(k => norm(k) === target);
    return foundKey ? timetables[foundKey] : [];
  }, [timetables, studentClassKey]);

  // Load admin time slots if available
  const activeSlots = useMemo(() => {
    try {
      const stored = localStorage.getItem("sd_timetable_time_slots");
      if (stored) {
        const adminTimes = JSON.parse(stored);
        return SLOTS.map((slot, idx) => {
          if (slot.kind === "period") {
            const adminIdx = mapStudentSlotToAdminPeriod(idx);
            if (adminIdx !== null && adminTimes[adminIdx]) {
              const range = adminTimes[adminIdx];
              const start = range.split(" - ")[0];
              return {
                ...slot,
                time: range,
                label: start
              };
            }
          }
          return slot;
        });
      }
    } catch {}
    return SLOTS;
  }, []);

  // Map slot index to timetable grid
  const grid = useMemo(() => {
    const map: Record<number, (Cell | null)[]> = {};
    activeSlots.forEach((slot, si) => {
      if (slot.kind !== "period") return;
      const adminPeriodIdx = mapStudentSlotToAdminPeriod(si);
      map[si] = weekDaysList.map((_, di) => {
        if (adminPeriodIdx !== null && activeClassGrid[adminPeriodIdx]?.[di]) {
          const adminSlot = activeClassGrid[adminPeriodIdx][di];
          return {
            subject: adminSlot.subject,
            teacher: adminSlot.teacher,
            room: adminSlot.room,
          };
        }
        return null;
      });
    });
    return map;
  }, [activeClassGrid, weekDaysList, activeSlots]);

  // Calendar month/year navigation state
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const calendar = useMemo(() => buildCalendar(calYear, calMonth), [calYear, calMonth]);

  const handlePrevMonth = () => {
    setCalMonth(prev => {
      if (prev === 0) {
        setCalYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCalMonth(prev => {
      if (prev === 11) {
        setCalYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  // Today's column idx (or default to Monday, 0)
  const todayColIdx = useMemo(() => {
    const day = new Date().getDay(); // 0 is Sun, 1 is Mon...
    if (day === 0) return 0; // default to Mon
    return day - 1;
  }, []);

  // Derive "Today's Classes" from the SAME already-built grid so it matches
  // the main weekly grid exactly (uses today's column).
  const upcomingClasses = useMemo(() => {
    const dayIdx = todayColIdx;
    const list: { subject: string; teacher: string; room: string; time: string; inTxt: string }[] = [];
    let periodNo = 0;

    activeSlots.forEach((slot, si) => {
      if (slot.kind !== "period") return;
      periodNo += 1;
      const cell = grid[si]?.[dayIdx];
      if (cell) {
        list.push({
          subject: cell.subject,
          teacher: cell.teacher,
          room: cell.room,
          time: slot.time,
          inTxt: `Period ${periodNo}`,
        });
      }
    });
    return list.slice(0, 3);
  }, [grid, todayColIdx, activeSlots]);

  // Periods for the day Daily/List view is showing (browsable — see selectedDayIdx above).
  const todayPeriods = useMemo(() => {
    return activeSlots.map((slot, i) => {
      if (slot.kind === "period") {
        const cell = grid[i]?.[selectedDayIdx];
        return { slot, cell };
      }
      return { slot, cell: undefined };
    });
  }, [grid, selectedDayIdx, activeSlots]);

  // Whether the day currently shown in Daily/List view is the real "today".
  const isViewingActualToday = useMemo(() => {
    const monday = getMonday(new Date());
    return selectedDayIdx === todayColIdx && monday.toDateString() === currentWeekStart.toDateString();
  }, [selectedDayIdx, todayColIdx, currentWeekStart]);

  // Weekday label for whichever day Daily/List view is currently showing.
  const todayDateLabel = useMemo(() => {
    const d = weekDaysList[selectedDayIdx]?.rawDate ?? new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [weekDaysList, selectedDayIdx]);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Timetable</h1>
              <p className="text-sm text-slate-400">Stay on track with your class schedule</p>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Academic Year</label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 select-none">
              2026-27
            </div>
          </div>
        </div>

        {/* View toggle row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
            {([
              { k: "weekly", label: "Weekly View", icon: LayoutGrid },
              { k: "daily",  label: "Daily View",  icon: CalendarIcon },
              { k: "list",   label: "List View",   icon: List },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all",
                  view === t.k ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleJumpToToday}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Today
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevWeek}
                className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 text-slate-500 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleNextWeek}
                className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 text-slate-500 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 select-none">
              {weekRangeStr}
            </span>
          </div>
        </div>

        {/* Class info banner */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white flex-shrink-0">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base leading-tight">{gradeLabel}</p>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" /> Class Teacher: {classTeacherName || "Not assigned"}</span>
              </div>
              {isSampleTimetable && (
                <p className="flex items-center gap-1 mt-1.5 text-[11px] font-medium text-amber-600">
                  <Info className="h-3 w-3 flex-shrink-0" /> Showing sample timetable — your class is not assigned yet.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <CalendarIcon className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 leading-tight">Current Week</p>
                <p className="text-sm font-semibold text-slate-700">{weekRangeStr}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 leading-tight">School Timing</p>
                <p className="text-sm font-semibold text-slate-700">08:00 AM - 02:30 PM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main grid + sidebar */}
        <div className="grid grid-cols-4 gap-5">

          {/* LEFT (3/4) */}
          <div className="col-span-3 space-y-4">

            {/* WEEKLY VIEW */}
            {view === "weekly" && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[760px]">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 w-28">Time</th>
                        {weekDaysList.map((d, di) => (
                          <th
                            key={d.day}
                            className={cn(
                              "px-3 py-3 text-center font-semibold",
                              di === weekDaysList.length - 1 ? "text-purple-600" : "text-slate-700"
                            )}
                          >
                            <span className="block text-[13px]">{d.day}</span>
                            <span className="block text-[10px] font-medium text-slate-400">{d.date}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {activeSlots.map((slot, si) => {
                        if (slot.kind === "break") {
                          return (
                            <tr key={si}>
                              <td colSpan={weekDaysList.length + 1} className="px-4 py-2 bg-slate-50/80 text-center">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  {slot.label}
                                </span>
                                <span className="text-[11px] text-slate-400 ml-2">{slot.time}</span>
                              </td>
                            </tr>
                          );
                        }
                        if (slot.kind === "assembly") {
                          return (
                            <tr key={si}>
                              <td className="px-4 py-3 text-[11px] font-semibold text-slate-500 align-middle">
                                {slot.time}
                              </td>
                              <td colSpan={weekDaysList.length} className="px-3 py-3">
                                <div className="rounded-lg bg-purple-50 border border-purple-100 px-4 py-2.5 text-center">
                                  <span className="text-[12px] font-bold text-purple-700">Assembly</span>
                                  <span className="text-[11px] text-purple-500 ml-2">School Auditorium</span>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        // period row
                        return (
                          <tr key={si} className="hover:bg-slate-50/30 transition-colors">
                            <td className="px-4 py-2.5 align-middle">
                              <span className="text-[12px] font-semibold text-slate-700">{slot.label}</span>
                            </td>
                            {weekDaysList.map((d, di) => {
                              const cell = grid[si]?.[di];
                              if (!cell) return <td key={di} className="px-2 py-2.5 text-center text-slate-300">—</td>;
                              const c = colorFor(cell.subject);
                              return (
                                <td key={di} className="px-1.5 py-1.5 align-middle">
                                  <div className={cn("rounded-lg px-2 py-2 min-h-[58px] flex flex-col justify-center", c.bg)}>
                                    <span className={cn("font-bold text-[11px] leading-tight", c.text)}>{cell.subject}</span>
                                    <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">{cell.teacher}</span>
                                    <RoomLabel room={cell.room} className="text-[9px] leading-tight" />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-slate-100 bg-slate-50/40">
                  {LEGEND_ORDER.map((subj) => {
                    const c = colorFor(subj);
                    return (
                      <span key={subj} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <span className={cn("w-2.5 h-2.5 rounded-full", c.dot)} /> {subj}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAILY VIEW — today's column as a list */}
            {view === "daily" && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4 gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrevDay} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <h2 className="font-bold text-slate-900 text-sm">{todayDateLabel}</h2>
                    <button onClick={handleNextDay} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isViewingActualToday ? (
                    <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">Today</span>
                  ) : (
                    <button onClick={handleJumpToToday} className="text-[11px] font-semibold text-purple-600 hover:underline px-2.5 py-1">Jump to Today</button>
                  )}
                </div>
                <div className="space-y-2.5">
                  {todayPeriods.map(({ slot, cell }, i) => {
                    if (slot.kind === "break") {
                      return (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-2.5">
                          <span className="text-base">☕</span>
                          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{slot.label}</span>
                          <span className="text-[11px] text-slate-400 ml-auto">{slot.time}</span>
                        </div>
                      );
                    }
                    if (slot.kind === "assembly") {
                      return (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-purple-50 border border-purple-100 px-4 py-2.5">
                          <span className="text-[12px] font-bold text-purple-700">Assembly</span>
                          <span className="text-[11px] text-purple-500">School Auditorium</span>
                          <span className="text-[11px] text-purple-400 ml-auto">{slot.time}</span>
                        </div>
                      );
                    }
                    const c = cell ? colorFor(cell.subject) : colorFor("");
                    return (
                      <div key={i} className={cn("flex items-center gap-4 rounded-xl border-l-4 bg-white border border-slate-100 px-4 py-3", c.border)}>
                        <div className="w-16 flex-shrink-0">
                          <p className="text-[12px] font-bold text-slate-700">{slot.label}</p>
                        </div>
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", c.bg)}>
                          <span className={cn("text-[11px] font-bold", c.text)}>{cell ? cell.subject.charAt(0) : "—"}</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-900 text-sm leading-tight">{cell ? cell.subject : "Free Period"}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">{cell ? <>{cell.teacher} · <RoomLabel room={cell.room} className="text-[11px]" /></> : "No assigned class"}</p>
                        </div>
                        <span className="text-[11px] text-slate-400">{slot.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW — flat list of today's periods */}
            {view === "list" && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrevDay} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500 shrink-0">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <h2 className="font-bold text-slate-900 text-sm">Periods — {todayDateLabel}</h2>
                    <button onClick={handleNextDay} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500 shrink-0">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {!isViewingActualToday && (
                    <button onClick={handleJumpToToday} className="text-[11px] font-semibold text-purple-600 hover:underline shrink-0">Jump to Today</button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Time</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Subject</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Teacher</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {todayPeriods
                      .filter((p) => p.slot.kind === "period" && p.cell)
                      .map(({ slot, cell }, i) => {
                        const c = colorFor(cell!.subject);
                        return (
                          <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                            <td className="px-5 py-3 text-xs font-medium text-slate-600">{slot.time}</td>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-2">
                                <span className={cn("w-2.5 h-2.5 rounded-full", c.dot)} />
                                <span className="font-semibold text-slate-900 text-sm">{cell!.subject}</span>
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-500">{cell!.teacher}</td>
                            <td className="px-5 py-3 text-sm text-slate-500"><RoomLabel room={cell!.room} /></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RIGHT (1/4) sidebar */}
          <div className="space-y-4">

            {/* Calendar */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Calendar</h3>
                <div className="flex items-center gap-1">
                  <button onClick={handlePrevMonth} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500 cursor-pointer">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={handleNextMonth} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500 cursor-pointer">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-center text-xs font-semibold text-slate-700 mb-2">{calendar.label}</p>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendar.cells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
                  const marked = MARKED_DAYS.includes(day) && !isToday;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        const sel = new Date(calYear, calMonth, day);
                        setCurrentWeekStart(getMonday(sel));
                        toast.success(`Viewing week of ${sel.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
                      }}
                      className={cn(
                        "relative aspect-square rounded-lg text-[11px] font-semibold flex items-center justify-center transition-colors cursor-pointer",
                        isToday ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {day}
                      {marked && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-purple-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Classes */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Today's Classes</h3>
                <button onClick={() => toast.info("All of today's classes")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-2.5">
                {upcomingClasses.length > 0 ? (
                  upcomingClasses.map((u, i) => {
                    const c = colorFor(u.subject);
                    return (
                      <div key={i} className={cn("rounded-lg border-l-4 bg-slate-50/60 px-3 py-2.5", c.border)}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-900 text-[13px] leading-tight">{u.subject}</p>
                          <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{u.inTxt}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">{u.teacher} · <RoomLabel room={u.room} className="text-[11px]" /></p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">{u.time}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 text-xs text-slate-400">No classes scheduled for today.</div>
                )}
              </div>
            </div>

            {/* Today's Notices */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Today's Notices</h3>
                <button onClick={() => toast.info("All notices")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              {NOTICES.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-2">No notices today</p>
              ) : (
                <div className="space-y-2.5">
                  {NOTICES.map((n, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", n.color)}>
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-[12px] leading-tight">{n.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{n.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer note */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <p className="text-xs text-slate-500">Timetable is subject to change. Please check regularly for updates.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
