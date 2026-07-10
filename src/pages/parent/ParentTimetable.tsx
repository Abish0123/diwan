import { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import socket from "@/lib/socket";
import { cn } from "@/lib/utils";
import { Calendar, Clock, Users2, LayoutGrid, List, MapPin, GraduationCap, Video } from "lucide-react";

// Same fix as the student portal's Timetable page: an Online period's room
// used to render as inert "Virtual Link" text with no way to actually open
// the meeting — this makes it a real clickable join link.
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

// Same published-timetable source, slot layout and admin-period mapping the
// student's own Timetable page reads — the parent must see identical data,
// not a separate (and previously always-empty) TimetableEntry table.
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function mapStudentSlotToAdminPeriod(slotIndex: number): number | null {
  if (slotIndex === 0) return 0;
  if (slotIndex === 1) return 1;
  if (slotIndex === 2) return 2;
  if (slotIndex === 4) return 3;
  if (slotIndex === 5) return 4;
  return null;
}

type SlotType =
  | { kind: "period"; time: string; label: string; startMin: number; endMin: number }
  | { kind: "break"; time: string; label: string; startMin: number; endMin: number }
  | { kind: "assembly"; time: string; label: string; startMin: number; endMin: number };

// startMin/endMin let the UI highlight "happening now" — minutes since midnight.
const SLOTS: SlotType[] = [
  { kind: "period",   time: "08:00 - 08:45", label: "08:00 AM", startMin: 480, endMin: 525 },
  { kind: "period",   time: "08:45 - 09:30", label: "08:45 AM", startMin: 525, endMin: 570 },
  { kind: "period",   time: "09:30 - 10:15", label: "09:30 AM", startMin: 570, endMin: 615 },
  { kind: "break",    time: "10:15 - 10:35 AM", label: "BREAK", startMin: 615, endMin: 635 },
  { kind: "period",   time: "10:35 - 11:20", label: "10:35 AM", startMin: 635, endMin: 680 },
  { kind: "period",   time: "11:20 - 12:05", label: "11:20 AM", startMin: 680, endMin: 725 },
  { kind: "period",   time: "12:05 - 12:50", label: "12:05 PM", startMin: 725, endMin: 770 },
  { kind: "break",    time: "12:50 - 01:30 PM", label: "LUNCH BREAK", startMin: 770, endMin: 810 },
  { kind: "period",   time: "01:30 - 02:15", label: "01:30 PM", startMin: 810, endMin: 855 },
  { kind: "assembly", time: "02:15 - 02:30", label: "Assembly / School Auditorium", startMin: 855, endMin: 870 },
];

type Cell = { subject: string; teacher: string; room: string };

// Pastel palette, hashed per subject name so colors stay stable without a
// hardcoded subject list — works for any curriculum's subject names.
const PALETTE = [
  { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500" },
  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500" },
  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500" },
  { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500" },
  { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     dot: "bg-sky-500" },
  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500" },
  { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    dot: "bg-teal-500" },
];
function colorForSubject(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function ParentTimetable() {
  const { selected, loading } = useParentChildren();
  const [view, setView] = useState<"weekly" | "daily">("weekly");
  const [activeDayIdx, setActiveDayIdx] = useState<number>(() => {
    const day = new Date().getDay();
    return day === 0 ? 0 : day - 1;
  });

  // Normalize the child's grade the same way the student portal does, so it
  // matches the admin's published class keys exactly ("Grade 3-B").
  const normalizedGrade = useMemo(() => {
    const raw = selected?.grade ? String(selected.grade).trim() : "";
    if (!raw) return "";
    if (/^grade\s/i.test(raw)) return raw.replace(/^grade\s+/i, "Grade ");
    if (/^(pre-?kg|lkg|ukg|kg)/i.test(raw)) return raw;
    return `Grade ${raw}`;
  }, [selected]);
  const normalizedSection = useMemo(
    () => (selected?.section ? String(selected.section).trim().toUpperCase() : ""),
    [selected]
  );

  const [dbTimetables, setDbTimetables] = useState<Record<string, any> | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const fetchTimetable = useCallback(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.gridJson && !data.error) {
          try { setDbTimetables(JSON.parse(data.gridJson)); } catch { setDbTimetables({}); }
        } else {
          setDbTimetables({});
        }
      })
      .catch(() => setDbTimetables({}))
      .finally(() => setDataLoaded(true));
  }, []);

  useEffect(() => {
    fetchTimetable();
    const poll = setInterval(fetchTimetable, 10_000);
    const onNotification = (n: any) => { if (n?.entity === "timetable_slots") fetchTimetable(); };
    socket.on("notification", onNotification);
    socket.on("timetable-published", fetchTimetable);
    const onVisible = () => { if (document.visibilityState === "visible") fetchTimetable(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      socket.off("notification", onNotification);
      socket.off("timetable-published", fetchTimetable);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchTimetable]);

  // Live clock, minute resolution — drives the "happening now" highlight.
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 30_000);
    return () => clearInterval(t);
  }, []);

  const classKey = normalizedGrade && normalizedSection ? `${normalizedGrade}-${normalizedSection}` : "";

  const classGrid = useMemo(() => {
    if (!dbTimetables || !classKey) return [];
    if (dbTimetables[classKey]) return dbTimetables[classKey];
    const norm = (k: string) => k.replace(/\s+/g, "").toLowerCase();
    const target = norm(classKey);
    const foundKey = Object.keys(dbTimetables).find(k => norm(k) === target);
    return foundKey ? dbTimetables[foundKey] : [];
  }, [dbTimetables, classKey]);

  const hasAnyPeriod = useMemo(
    () => Array.isArray(classGrid) && classGrid.some((row: any[]) => Array.isArray(row) && row.some(c => c)),
    [classGrid]
  );

  const periodsForDay = useMemo(() => {
    return SLOTS.map((slot, si) => {
      if (slot.kind !== "period") return { slot, cell: undefined as Cell | undefined };
      const adminIdx = mapStudentSlotToAdminPeriod(si);
      const cell = adminIdx !== null ? (classGrid[adminIdx]?.[activeDayIdx] as Cell | undefined) : undefined;
      return { slot, cell };
    });
  }, [classGrid, activeDayIdx]);

  // Full week grid — every slot row × every day column, for the Weekly View.
  const weeklyRows = useMemo(() => {
    return SLOTS.map((slot, si) => {
      if (slot.kind !== "period") return { slot, cells: [] as (Cell | undefined)[] };
      const adminIdx = mapStudentSlotToAdminPeriod(si);
      const cells = DAY_NAMES.map((_, di) => (adminIdx !== null ? (classGrid[adminIdx]?.[di] as Cell | undefined) : undefined));
      return { slot, cells };
    });
  }, [classGrid]);

  const todayColIdx = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? -1 : day - 1;
  }, []);

  // The single period happening right now (only meaningful for today's column).
  const currentPeriodLabel = useMemo(() => {
    if (todayColIdx === -1) return null;
    const slot = SLOTS.find(s => nowMin >= s.startMin && nowMin < s.endMin);
    if (!slot || slot.kind !== "period") return null;
    const adminIdx = mapStudentSlotToAdminPeriod(SLOTS.indexOf(slot));
    const cell = adminIdx !== null ? (classGrid[adminIdx]?.[todayColIdx] as Cell | undefined) : undefined;
    return cell ? { subject: cell.subject, teacher: cell.teacher } : null;
  }, [nowMin, todayColIdx, classGrid]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
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

  const initials = (selected.name || "?").split(" ").map(p => p[0] || "").join("").slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero header */}
        <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-600 p-6 text-white flex items-center gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold tracking-wide">{initials}</span>
          </div>
          <div className="flex-1 min-w-[180px]">
            <h1 className="text-xl font-black">Timetable</h1>
            <p className="text-sm text-violet-100 mt-0.5 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" />
              {selected.name} · {normalizedGrade}{normalizedSection ? ` - Section ${normalizedSection}` : ""}
            </p>
          </div>
          {currentPeriodLabel && (
            <div className="flex items-center gap-2 bg-white/15 border border-white/20 rounded-xl px-3.5 py-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
              </span>
              <div className="text-xs leading-tight">
                <p className="font-bold">Now: {currentPeriodLabel.subject}</p>
                <p className="text-violet-100">{currentPeriodLabel.teacher}</p>
              </div>
            </div>
          )}
          <ChildSwitcher className="w-56" />
        </div>

        {!dataLoaded && (
          <div className="space-y-3">
            <div className="h-10 w-64 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        )}

        {dataLoaded && !hasAnyPeriod && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No timetable published</h2>
            <p className="text-sm text-slate-500 mt-2">
              No timetable has been published yet for {normalizedGrade || "this grade"}{normalizedSection ? ` · Section ${normalizedSection}` : ""}.
            </p>
          </div>
        )}

        {dataLoaded && hasAnyPeriod && (
          <>
            {/* View toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setView("weekly")}
                  className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
                    view === "weekly" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                  <LayoutGrid className="w-3.5 h-3.5" /> Weekly View
                </button>
                <button onClick={() => setView("daily")}
                  className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
                    view === "daily" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                  <List className="w-3.5 h-3.5" /> Daily View
                </button>
              </div>

              {view === "daily" && (
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                  {DAY_NAMES.map((d, i) => (
                    <button key={d} onClick={() => setActiveDayIdx(i)}
                      className={cn("relative px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition flex-shrink-0",
                        activeDayIdx === i ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                      {d}
                      {i === todayColIdx && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 border-2 border-slate-100" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {view === "weekly" ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-500" />
                  <h3 className="font-bold text-slate-800">Week Overview</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[760px]">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-28">Time</th>
                        {DAY_FULL.map((d, i) => (
                          <th key={d} className={cn("px-3 py-3 text-left text-xs font-bold uppercase tracking-wide",
                            i === todayColIdx ? "text-violet-700" : "text-slate-400")}>
                            <span className="flex items-center gap-1.5">
                              {DAY_NAMES[i]}
                              {i === todayColIdx && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyRows.map(({ slot, cells }, i) => {
                        if (slot.kind === "break" || slot.kind === "assembly") {
                          return (
                            <tr key={i} className={slot.kind === "break" ? "bg-slate-50/60" : "bg-violet-50/50"}>
                              <td colSpan={DAY_NAMES.length + 1} className="px-4 py-2 text-center">
                                <span className={cn("text-xs font-bold uppercase tracking-wider", slot.kind === "break" ? "text-slate-500" : "text-violet-700")}>
                                  {slot.kind === "break" ? "☕ " : ""}{slot.label}
                                </span>
                                <span className="text-[11px] text-slate-400 ml-2">{slot.time}</span>
                              </td>
                            </tr>
                          );
                        }
                        const isCurrentRow = todayColIdx !== -1 && nowMin >= slot.startMin && nowMin < slot.endMin;
                        return (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-3 text-xs font-mono text-slate-400 align-top whitespace-nowrap">
                              {slot.label}
                              {isCurrentRow && <span className="block mt-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">● Now</span>}
                            </td>
                            {cells.map((cell, di) => {
                              const c = cell ? colorForSubject(cell.subject) : null;
                              return (
                                <td key={di} className={cn("px-2.5 py-2.5 align-top",
                                  di === todayColIdx && "bg-violet-50/40",
                                  di === todayColIdx && isCurrentRow && "bg-emerald-50/70")}>
                                  {cell && c ? (
                                    <div className={cn("rounded-xl border px-2.5 py-2", c.bg, c.border)}>
                                      <p className={cn("text-xs font-bold leading-tight", c.text)}>{cell.subject}</p>
                                      <p className="text-[11px] text-slate-500 mt-1 truncate">{cell.teacher}</p>
                                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                        {!cell.room?.startsWith("http") && <MapPin className="w-2.5 h-2.5" />}
                                        <RoomLabel room={cell.room} className="text-[10px]" />
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-300 pl-2.5">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Today
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-500" />
                  <h3 className="font-bold text-slate-800">{DAY_FULL[activeDayIdx]}</h3>
                  {activeDayIdx === todayColIdx && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full ml-1">Today</span>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {periodsForDay.map(({ slot, cell }, i) => {
                    if (slot.kind === "break") {
                      return (
                        <div key={i} className="px-5 py-3 flex items-center gap-3 bg-slate-50/60">
                          <span className="text-base">☕</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{slot.label}</span>
                          <span className="text-xs text-slate-400 ml-auto">{slot.time}</span>
                        </div>
                      );
                    }
                    if (slot.kind === "assembly") {
                      return (
                        <div key={i} className="px-5 py-3 flex items-center gap-3 bg-violet-50/60">
                          <span className="text-xs font-bold text-violet-700">Assembly</span>
                          <span className="text-xs text-violet-400 ml-auto">{slot.time}</span>
                        </div>
                      );
                    }
                    const c = cell ? colorForSubject(cell.subject) : null;
                    const isCurrent = activeDayIdx === todayColIdx && nowMin >= slot.startMin && nowMin < slot.endMin;
                    return (
                      <div key={i} className={cn("px-5 py-4 flex items-center gap-4 transition", isCurrent ? "bg-emerald-50/60" : "hover:bg-slate-50")}>
                        <div className="text-xs font-mono text-slate-400 w-28 flex-shrink-0 flex flex-col gap-0.5">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{slot.label}</span>
                          {isCurrent && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">● Now</span>}
                        </div>
                        {cell && c ? (
                          <>
                            <span className={cn("px-2.5 py-0.5 rounded-lg text-xs font-bold flex-shrink-0 border", c.bg, c.text, c.border)}>
                              {cell.subject}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-500">{cell.teacher}</p>
                            </div>
                            <span className="text-xs text-slate-400 flex-shrink-0 flex items-center gap-1">
                              {!cell.room?.startsWith("http") && <MapPin className="w-3 h-3" />}
                              <RoomLabel room={cell.room} />
                            </span>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400">Free Period</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
