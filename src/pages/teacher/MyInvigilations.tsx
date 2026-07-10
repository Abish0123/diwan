import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { MapPin, Calendar, Clock, Users, ShieldCheck } from "lucide-react";
import { useExams, getGradePlans, type ExamRecord } from "@/lib/examStore";
import type { SeatingConfig, ExamRoom, SeatAssignment } from "@/lib/seatingStore";

// Strip "Mr./Mrs./Ms./Dr." titles for tolerant name comparison — same
// convention as useNotifications.ts's normName / timetableRules.ts's norm.
function normName(s?: string) {
  return (s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}

interface Duty {
  key: string;
  exam: ExamRecord;
  room: ExamRoom;
  studentCount: number;
  date: string;     // earliest slot date covering this room, if resolvable
  start: string;    // HH:mm
  end: string;      // HH:mm
  subjects: string[]; // subjects sitting in this room, if resolvable
}

function fmtDate(iso: string) {
  if (!iso) return "Date TBD";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function MyInvigilations() {
  const { user } = useAuth();
  const { assignment } = useTeacherClass();
  const myName = user?.displayName || (assignment as any)?.teacherName || "";

  const allExams = useExams();
  const [seatingRows, setSeatingRows] = useState<SeatingConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("ExamSeating", "")
      .then(rows => { if (!cancelled) setSeatingRows(Array.isArray(rows) ? (rows as unknown as SeatingConfig[]) : []); })
      .catch(() => { if (!cancelled) setSeatingRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const duties = useMemo<Duty[]>(() => {
    const wantName = normName(myName);
    if (!wantName) return [];
    const examsById = new Map(allExams.map(e => [e.id, e]));
    const out: Duty[] = [];

    for (const cfg of seatingRows) {
      if (!cfg || !Array.isArray(cfg.rooms)) continue;
      const exam = examsById.get(cfg.examId);
      if (!exam) continue;

      for (const room of cfg.rooms) {
        if (normName(room.invigilator) !== wantName) continue;

        const studentCount = (cfg.assignments || []).filter(
          (a: SeatAssignment) => a.roomNo === room.roomNo
        ).length;

        // Try to resolve the time window + subject(s) sitting in this room by
        // scanning every grade plan's slots for a per-slot room match. A slot's
        // `room` field may name this exact room, or (for legacy/simple exams)
        // the exam-level `room`/default fields apply to every room.
        const matchingSlots = getGradePlans(exam).flatMap(p => p.slots || [])
          .filter(s => s.room && s.room === room.roomNo);

        let date = "", start = "", end = "";
        let subjects: string[] = [];
        if (matchingSlots.length > 0) {
          const sorted = [...matchingSlots].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || ""));
          date = sorted[0].date || "";
          start = sorted[0].start || "";
          end = sorted[sorted.length - 1].end || sorted[0].end || "";
          subjects = Array.from(new Set(sorted.map(s => s.subject).filter(Boolean)));
        } else {
          // Fall back to the exam's own date range / default room-level info.
          date = exam.startDate || "";
          start = "";
          end = "";
          subjects = [];
        }

        out.push({
          key: `${cfg.examId}::${room.id || room.roomNo}`,
          exam, room, studentCount, date, start, end, subjects,
        });
      }
    }

    return out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [seatingRows, allExams, myName]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = duties.filter(d => !d.date || d.date >= today);
  const past = duties.filter(d => d.date && d.date < today);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Invigilations</h1>
              <p className="text-sm text-slate-400">Exam rooms you've been assigned to invigilate</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Total Duties", value: duties.length, icon: ShieldCheck, color: "text-purple-600 bg-violet-50" },
            { label: "Upcoming",     value: upcoming.length, icon: Calendar,   color: "text-purple-600 bg-blue-50" },
            { label: "Completed",    value: past.length,     icon: Clock,      color: "text-slate-600 bg-slate-100" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}><k.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Duty list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {!loading && duties.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="font-semibold">No invigilation duties assigned.</p>
              <p className="text-sm mt-1">Rooms the admin assigns you to invigilate will appear here.</p>
            </div>
          )}
          {loading && (
            <div className="py-16 text-center text-slate-400">
              <p className="text-sm">Loading invigilation duties…</p>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {duties.map(d => {
              const isPast = d.date && d.date < today;
              return (
                <div key={d.key} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition flex-wrap">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", isPast ? "bg-slate-100" : "bg-violet-50")}>
                    <ShieldCheck className={cn("w-5 h-5", isPast ? "text-slate-400" : "text-violet-500")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{d.exam.name}</p>
                      {d.subjects.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
                          {d.subjects.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(d.date)}</span>
                      {(d.start || d.end) && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {d.start || "?"}–{d.end || "?"}</span>
                      )}
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.room.roomNo}{d.room.block ? ` · ${d.room.block}` : ""}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {d.studentCount} student{d.studentCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0",
                    isPast ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-blue-50 text-blue-700 border-blue-200")}>
                    {isPast ? "Completed" : "Upcoming"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
