import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { type ExamRecord, type ExamMode, seatNumber } from "@/lib/examStore";
import { resolveSeat } from "@/lib/seatingStore";
import { CalendarDays, MapPin, Armchair, Clock, BookOpen, Info } from "lucide-react";

// Professional exam timetable — a clean, print-friendly table rendered for one
// exam. Resolves each student's allocated hall + seat from the seating plan
// (falling back to a deterministic seat when no plan exists), and is shared by
// the student and parent exam pages so both portals show identical data.

function fmtDate(iso: string): string {
  if (!iso) return "TBD";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtDay(iso: string): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }); }
  catch { return ""; }
}
function fmtTime(t: string): string {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return t; }
}
function duration(start: string, end: string): string {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hr`;
}

const modeBadge = (m: ExamMode) =>
  m === "Online" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" :
  m === "Hybrid" ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300" :
  "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300";

export interface TimetableIdentity { grade?: string; section?: string; rollNo?: string | number }

export function ExamTimetable({
  exam, studentId, identity, className,
}: {
  exam: ExamRecord;
  studentId: string;
  identity?: TimetableIdentity;
  className?: string;
}) {
  // One seat per student per exam — resolve once, reuse for every subject row.
  const placed = useMemo(
    () => resolveSeat(exam.id, studentId, identity),
    [exam.id, studentId, identity?.grade, identity?.section, identity?.rollNo]
  );
  const allocatedRoom = placed?.roomNo || "";
  const seat = placed?.seatLabel || seatNumber(exam.id, studentId);
  const isOffline = exam.mode !== "Online";

  const slots = useMemo(
    () => [...(exam.slots || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [exam.slots]
  );
  // Hall shown in the header callout: allocated plan first, then a slot room, then
  // the exam default — keeps the callout consistent with the per-row Hall column.
  const headerRoom = allocatedRoom || slots.find(s => s.room)?.room || exam.room || "TBD";

  return (
    <div className={cn("bg-white dark:bg-[#16162A] border border-slate-200 dark:border-slate-800/40 rounded-2xl overflow-hidden shadow-sm print:shadow-none print:border-slate-300", className)}>
      {/* Header band */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/40 bg-gradient-to-r from-slate-50 to-white dark:from-[#1b1b33] dark:to-[#16162A] flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight">{exam.name}</h4>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", modeBadge(exam.mode))}>{exam.mode}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
            <span>{exam.type}</span>
            {exam.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {exam.venue}</span>}
            <span>Max {exam.maxMarks} · Pass {exam.passingMarks}</span>
          </div>
        </div>
        {/* Hall + Seat callout for offline exams */}
        {isOffline && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-center px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30">
              <p className="text-[8px] font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1 justify-center"><MapPin className="h-2.5 w-2.5" /> Hall</p>
              <p className="text-[12px] font-black text-violet-700 dark:text-violet-300 leading-tight mt-0.5">{headerRoom}</p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1 justify-center"><Armchair className="h-2.5 w-2.5" /> Seat</p>
              <p className="text-[12px] font-black text-emerald-700 dark:text-emerald-300 leading-tight mt-0.5">{seat}</p>
            </div>
          </div>
        )}
      </div>

      {/* Timetable table */}
      {slots.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/40">
                {["#", "Subject", "Date", "Day", "Time", "Duration", isOffline ? "Hall" : "Mode", isOffline ? "Seat" : ""].filter(Boolean).map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {slots.map((s, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[10px] font-black">{i + 1}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" /> {s.subject}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap font-medium">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold text-purple-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md">{fmtDay(s.date)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtTime(s.start)}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-md whitespace-nowrap">{duration(s.start, s.end)}</span>
                  </td>
                  {isOffline ? (
                    <>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap">
                          <MapPin className="h-3 w-3 text-slate-400" /> {allocatedRoom || s.room || exam.room || "TBD"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-black text-emerald-600 dark:text-emerald-300">{seat}</span>
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold text-purple-600 dark:text-violet-300">Online</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">
          Subject-wise timetable not published yet.
        </div>
      )}

      {/* Footnote */}
      {isOffline && slots.length > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-800/10 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          <Info className="h-3 w-3 shrink-0" />
          Report 15 minutes early. Carry your printed hall ticket and school ID. Hall &amp; seat are auto-assigned from the seating plan.
        </div>
      )}
    </div>
  );
}
