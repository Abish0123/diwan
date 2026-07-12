import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useExams, matchesSection, planForGrade, seatNumber, type ExamMode, type ExamRecord } from "@/lib/examStore";
import { loadExamMarksFresh, type GradebookSources } from "@/lib/gradebookEngine";
import { findSeat, findRoomByRoll, findSeatAnywhere } from "@/lib/seatingStore";
import { downloadHallTicketPdf, type HallTicketData } from "@/lib/hallTicketReports";
import { getSchoolName, getSchoolAddress } from "@/lib/transportSettings";
import { ExamTimetable } from "@/components/exams/ExamTimetable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileText, Calendar, Clock, AlertTriangle, Download, BarChart3, CheckCircle, Wifi, MapPin, Armchair, Users2 } from "lucide-react";

interface Exam {
  id: string; examId: string; name: string; subject: string; date: string; time: string;
  venue: string; duration: string; totalMarks: number; type: string;
  mode: ExamMode; seat?: string;
  status: "Upcoming" | "Completed";
  score?: number; grade?: string;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtTime(t: string): string {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return t; }
}

const letterFromPct = (p: number) => p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : p >= 40 ? "D" : "F";
const modeBadge = (m: ExamMode) =>
  m === "Online" ? "bg-violet-50 text-violet-700 border-violet-200" :
  m === "Hybrid" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
  "bg-orange-50 text-orange-700 border-orange-200";

function statusColor(s: string) {
  return s === "Upcoming" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function examStatusFromStore(e: any): "Upcoming" | "Completed" {
  if (e.status === "Published" || e.status === "Completed") return "Completed";
  return "Upcoming";
}

export default function ParentExams() {
  const { selected, loading } = useParentChildren();
  const allStoreExams = useExams();

  // Real cross-session marks source (merges MySQL ExamMark rows), the exact
  // same one ParentGradebook.tsx uses — this page used to read ONLY the
  // localStorage cache, so a mark entered by a teacher on a different
  // device/session could show correctly on the Gradebook page while staying
  // stale/missing here for the identical exam and child.
  const [marks, setMarks] = useState<GradebookSources["examMarks"]>({});
  useEffect(() => { loadExamMarksFresh().then(setMarks).catch(() => {}); }, []);

  // Map examStore ExamRecord[] → flat Exam[] visible to this child's grade/section.
  // Only exams the admin has published to students/parents are shown.
  const exams: Exam[] = useMemo(() => {
    if (!selected) return [];
    const childUid = String((selected as any).studentId ?? selected.id ?? "");
    const storeMatches = allStoreExams.filter(e =>
      matchesSection(e, selected.grade || "", selected.section || "") && e.publishedToStudents !== false
    );
    // Expand each ExamRecord into one Exam per slot (subject), or one summary Exam if no slots
    return storeMatches.flatMap(rec => {
      const status = examStatusFromStore(rec) as "Upcoming" | "Completed";
      const seat = seatNumber(rec.id, childUid);
      const lookupScore = (subject: string) => {
        const m = marks[rec.id]?.[subject]?.[childUid];
        return m === undefined ? undefined : m;
      };
      // A multi-grade exam's top-level `slots` mirror only its FIRST grade
      // plan — use the plan for this child's own grade instead, or every
      // family would see whichever grade was entered first in Exam Setup.
      const slots = planForGrade(rec, selected.grade || "")?.slots || rec.slots || [];
      if (slots.length === 0) {
        const score = lookupScore(rec.subjects || "Overall");
        const pct = score !== undefined ? Math.round((score / rec.maxMarks) * 100) : undefined;
        return [{
          id: rec.id, examId: rec.id, name: rec.name, subject: rec.subjects || "All Subjects",
          date: rec.startDate, time: "09:00", venue: rec.venue || rec.room || "Main Hall",
          duration: "—", totalMarks: rec.maxMarks, type: rec.type, mode: rec.mode, seat,
          status, score, grade: pct !== undefined ? letterFromPct(pct) : undefined,
        }];
      }
      return slots.map((sl, i) => {
        const score = lookupScore(sl.subject);
        const pct = score !== undefined ? Math.round((score / rec.maxMarks) * 100) : undefined;
        return {
          id: `${rec.id}-${i}`, examId: rec.id, name: rec.name, subject: sl.subject,
          date: sl.date, time: sl.start, venue: `${sl.room || rec.room || "Hall"} · Seat ${seat}`,
          duration: `${sl.start}–${sl.end}`, totalMarks: rec.maxMarks, type: rec.type, mode: rec.mode, seat,
          status, score, grade: pct !== undefined ? letterFromPct(pct) : undefined,
        };
      });
    });
  }, [allStoreExams, selected, marks]);

  const isLive = !!selected && allStoreExams.some(e =>
    matchesSection(e, selected.grade || "", selected.section || "") && e.publishedToStudents !== false
  );

  // Real upcoming exam records (with a subject timetable) for this child — drives
  // the professional timetable view.
  const childUid = String((selected as any)?.studentId ?? selected?.id ?? "");
  const upcomingRecords = useMemo<ExamRecord[]>(() => {
    if (!selected) return [];
    return allStoreExams
      .filter(e =>
        matchesSection(e, selected.grade || "", selected.section || "")
        && e.publishedToStudents !== false
        && e.status !== "Published" && e.status !== "Completed"
      )
      .map(e => {
        const plan = planForGrade(e, selected.grade || "");
        return plan ? { ...e, slots: plan.slots } : e;
      })
      .filter(e => (e.slots?.length || 0) > 0);
  }, [allStoreExams, selected]);

  const upcoming  = exams.filter(e => e.status === "Upcoming");
  const completed = exams.filter(e => e.status === "Completed");
  const avgScore  = completed.length ? Math.round(completed.reduce((a,e)=>a+(e.score||0)/e.totalMarks*100,0)/completed.length) : 0;

  // Real hall ticket — same room/seat resolution chain (and same real-PDF
  // generator) the admin's Hall Tickets page uses, gated on an actual
  // allocation existing. Previously this button was a toast.info() stub
  // that never produced a file.
  const handleDownloadHallTicket = (e: Exam) => {
    if (!selected) return;
    const rec = allStoreExams.find(r => r.id === e.examId);
    if (!rec) { toast.error("Exam details unavailable."); return; }
    const rollNo = String((selected as any).rollNo ?? (selected as any).roll ?? "");
    const placed = findSeat(rec.id, childUid)
      || findRoomByRoll(rec.id, rollNo)
      || findSeatAnywhere(childUid, { grade: selected.grade, section: selected.section, rollNo });
    if (!placed) {
      toast.error("Hall ticket not available yet — seating hasn't been finalized for this exam.");
      return;
    }
    const slots = planForGrade(rec, selected.grade || "")?.slots || rec.slots || [];
    const ticket: HallTicketData = {
      studentId: childUid, studentName: selected.name,
      admissionNo: String((selected as any).admissionNo ?? (selected as any).admNo ?? "—"),
      rollNo, grade: selected.grade || "", section: selected.section || "",
      venue: rec.venue || rec.room || "TBD",
      hallNo: placed.roomNo || rec.room || "—",
      seatNo: placed.seatLabel || e.seat || "—",
      schedule: (slots.length ? slots : [{ subject: e.subject, date: e.date, start: e.time, room: e.venue }])
        .map(sl => ({ subject: sl.subject, date: fmtDate(sl.date), time: fmtTime(sl.start), hall: placed.roomNo || sl.room || rec.room || "—" })),
    };
    downloadHallTicketPdf(getSchoolName(), getSchoolAddress(), rec.name, ticket);
  };

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
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
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Exams &amp; Results</h1>
              <p className="text-sm text-slate-400">{selected.name} — Exam schedule and results</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Upcoming Exams",  value: upcoming.length,  icon: Calendar,    color:"text-purple-600 bg-blue-50" },
            { label:"Completed",       value: completed.length, icon: CheckCircle, color:"text-emerald-600 bg-emerald-50" },
            { label:"Avg. Score",      value: completed.length ? `${avgScore}%` : "—", icon: BarChart3, color:"text-purple-600 bg-violet-50" },
            { label:"Total Exams",     value: exams.length,     icon: FileText,    color:"text-slate-600 bg-slate-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs border",
          isLive
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-amber-50 border-amber-200 text-amber-700")}>
          {isLive ? <Wifi className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
          {isLive
            ? "Live exam schedule from admin exam board. Published exams appear here automatically."
            : "No exams published yet for this class."}
        </div>

        {/* Upcoming — professional exam timetable (live data) */}
        {upcomingRecords.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <h3 className="font-bold text-slate-800">Upcoming Exam Timetable</h3>
            </div>
            {upcomingRecords.map(rec => (
              <ExamTimetable
                key={rec.id}
                exam={rec}
                studentId={childUid}
                identity={{ grade: selected.grade, section: selected.section, rollNo: (selected as any).rollNo ?? (selected as any).roll }}
              />
            ))}
          </div>
        )}

        {/* Upcoming — published exams without a subject-slot timetable */}
        {upcomingRecords.length === 0 && upcoming.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">Upcoming Exams</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {upcoming.map(e => (
                <div key={e.id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-slate-50 transition">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{e.name}</p>
                      <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border", modeBadge(e.mode))}>{e.mode}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {e.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {e.time} · {e.duration}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.venue}</span>
                      {e.mode !== "Online" && e.seat && <span className="flex items-center gap-1"><Armchair className="w-3 h-3" /> Seat {e.seat}</span>}
                      <span>{e.totalMarks} marks</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDownloadHallTicket(e)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                      <Download className="w-3.5 h-3.5" /> Hall Ticket
                    </button>
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", statusColor(e.status))}>{e.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed results */}
        {completed.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">Results</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {completed.map(e => {
                const pct = e.score != null ? Math.round(e.score/e.totalMarks*100) : 0;
                return (
                  <div key={e.id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-slate-50 transition">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{e.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{e.subject} · {e.date} · {e.type}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-black text-slate-900">{e.score}/{e.totalMarks}</p>
                      <p className="text-[10px] text-slate-400">{pct}%</p>
                    </div>
                    {e.grade && (
                      <span className={cn("text-lg font-black px-3 py-1 rounded-xl",
                        e.grade.startsWith("A")?"bg-emerald-50 text-emerald-700":"bg-blue-50 text-blue-700")}>
                        {e.grade}
                      </span>
                    )}
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", statusColor(e.status))}>{e.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {exams.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            No exams scheduled yet.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
