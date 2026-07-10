import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams, seatNumber, getGradePlans, examGrades } from "@/lib/examStore";
import { findSeat, findRoomByRoll, findSeatAnywhere, getSeating } from "@/lib/seatingStore";
import { downloadHallTicketMappingReport, downloadHallTicketMappingCSV, type HallTicketMappingRow } from "@/lib/seatingReports";
import { downloadAllHallTicketsZip, type HallTicketData } from "@/lib/hallTicketReports";
import { getSchoolName, getSchoolAddress } from "@/lib/transportSettings";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import {
  FileText, Printer, Download, User, Calendar,
  MapPin, BookOpen, School, Hash, Shield, Table2, AlertTriangle, Lock, FolderArchive, Loader2,
} from "lucide-react";

const FALLBACK_SECTIONS = ["A", "B", "C", "D"];

const INSTRUCTIONS = [
  "Report to the examination hall at least 15 minutes before the scheduled time.",
  "This Hall Ticket must be presented along with a valid school ID card.",
  "Mobile phones and electronic devices are strictly prohibited in the hall.",
  "Write your Roll Number on every answer sheet before starting.",
  "No student will be allowed to leave the hall during the first 30 minutes.",
  "Ignorance of examination rules will not be accepted as an excuse.",
];

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}
function fmtTime(t: string): string {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return t; }
}

// Real Hall Tickets UI, extracted for embedding as a step inside the
// consolidated Exam Setup wizard — see RoomAllocation.tsx for the same pattern.
export function HallTicketsContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const selectedId = examId;
  const setSelectedId = onExamIdChange;
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [preview, setPreview] = useState(false);
  const [roster, setRoster] = useState<{ id: string; rollNo: string; name: string; admissionNo: string }[]>([]);
  const [isZipping, setIsZipping] = useState(false);

  const selected = exams.find(e => e.id === selectedId);

  // Only the grades this specific exam actually covers — never the full
  // school grade list — so a hall ticket can't be generated for a grade/section
  // that isn't even sitting this exam.
  const examOwnGrades = useMemo(() => (selected ? examGrades(selected) : []), [selected]);
  const activePlan = useMemo(() => {
    if (!selected) return null;
    const plans = getGradePlans(selected);
    return plans.find(p => p.grade === grade) || plans[0] || null;
  }, [selected, grade]);
  // Sections actually scheduled for this grade under this exam. An empty
  // sections list on the plan means "all sections" — fall back to the
  // standard section set in that case.
  const validSections = activePlan?.sections?.length ? activePlan.sections : FALLBACK_SECTIONS;

  // Picking an exam resets grade/section to the first valid combination for it.
  useEffect(() => {
    if (!selected) { setGrade(""); setSection(""); setPreview(false); return; }
    const plans = getGradePlans(selected);
    const firstPlan = plans[0];
    setGrade(firstPlan?.grade || "");
    setSection((firstPlan?.sections?.length ? firstPlan.sections[0] : FALLBACK_SECTIONS[0]) || "");
    setPreview(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching grade (multi-grade exam) resets section to a valid one for that grade.
  useEffect(() => {
    if (!activePlan) return;
    if (!validSections.includes(section)) setSection(validSections[0] || "");
  }, [activePlan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !grade || !section) { setRoster([]); return; }
    smartDb.getAll("Student", "").then((all: any[]) => {
      const wantG = grade.toLowerCase().replace("grade ", "").trim();
      const filtered = (all || []).filter((s: any) => {
        const g = (s.grade || s.gradeLevel || "").toLowerCase().replace("grade ", "").trim();
        if (g !== wantG) return false;
        if ((s.section || "").toUpperCase() !== section.toUpperCase()) return false;
        return true;
      });
      setRoster(filtered.map((s: any, i: number) => ({
        id: String(s.id ?? s.uid ?? s.studentId ?? `STU-${i}`),
        rollNo: String(s.rollNo ?? s.roll ?? String(i + 1).padStart(3, "0")),
        name: s.name ?? s.studentName ?? s.displayName ?? "Student",
        admissionNo: s.admissionNo ?? s.admNo ?? s.admission_number ?? `ADM-${new Date().getFullYear()}-${String(i + 1).padStart(4, "0")}`,
      })));
    }).catch(() => setRoster([]));
  }, [selected, grade, section]);

  const students = roster;

  // A hall ticket is only valid once a room/seat has actually been allocated —
  // no seating plan for this exam means nothing can be issued yet.
  const seatingCfg = useMemo(() => (selected ? getSeating(selected.id) : null), [selected]);
  const hasSeatingForExam = !!seatingCfg && seatingCfg.rooms.length > 0;

  // Student → allocated hall/seat mapping (the data behind the ticket cards),
  // exported as a flat table for the exam operations team.
  const hallTicketMapping: HallTicketMappingRow[] = useMemo(() => students.map(student => {
    const placed = selected ? (findSeat(selected.id, student.id) || findRoomByRoll(selected.id, student.rollNo) || findSeatAnywhere(student.id, { grade, section, rollNo: student.rollNo })) : null;
    return {
      studentId: student.id, name: student.name, admissionNo: student.admissionNo,
      grade, section, rollNo: student.rollNo,
      allocatedRoom: placed?.roomNo || "", allocatedSeat: placed?.seatLabel || (selected ? seatNumber(selected.id, student.id) : ""),
    };
  }), [students, selected, grade, section]);
  // Only students with a confirmed hall/seat allocation get an issuable ticket.
  const seatedStudents = students.filter(s => {
    const m = hallTicketMapping.find(r => r.studentId === s.id);
    return !!m?.allocatedRoom && !!m?.allocatedSeat;
  });
  const unseatedCount = students.length - seatedStudents.length;
  const slots = activePlan?.slots || [];
  const schoolName = getSchoolName();
  const schoolAddress = getSchoolAddress();

  // Same data the ticket cards render from — bundled into one PDF per student,
  // zipped into a single download instead of N separate browser downloads.
  const handleDownloadAllZip = async () => {
    if (!selected || isZipping) return;
    const sortedSlots = [...slots].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
    const tickets: HallTicketData[] = seatedStudents.map(student => {
      const m = hallTicketMapping.find(r => r.studentId === student.id);
      const allocatedRoom = m?.allocatedRoom || "";
      const allocatedSeat = m?.allocatedSeat || "";
      return {
        studentId: student.id,
        studentName: student.name,
        admissionNo: student.admissionNo,
        rollNo: student.rollNo,
        grade,
        section,
        venue: selected.venue || "TBD",
        hallNo: allocatedRoom || selected.room || "—",
        seatNo: allocatedSeat,
        schedule: sortedSlots.map(slot => ({
          subject: slot.subject,
          date: fmtDate(slot.date),
          time: fmtTime(slot.start),
          hall: allocatedRoom || slot.room || selected.room || "—",
        })),
      };
    });
    setIsZipping(true);
    try {
      await downloadAllHallTicketsZip(schoolName, schoolAddress, selected.name, grade, section, tickets);
    } finally {
      setIsZipping(false);
    }
  };

  return (
      <div className="min-h-screen bg-[#F8F7FF]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#7C3AED]" /> Hall Tickets
            </h1>
            {preview && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold"
                >
                  <Printer className="h-3.5 w-3.5" /> Print All
                </button>
                <button
                  onClick={handleDownloadAllZip}
                  disabled={isZipping || seatedStudents.length === 0}
                  title={seatedStudents.length === 0 ? "No seated students to include" : undefined}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isZipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />}
                  {isZipping ? "Zipping…" : `Download All (${seatedStudents.length} PDFs, ZIP)`}
                </button>
                <button
                  onClick={() => selected && downloadHallTicketMappingReport(selected.name, hallTicketMapping)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Table2 className="h-3.5 w-3.5" /> Hall Ticket Mapping (PDF)
                </button>
                <button
                  onClick={() => selected && downloadHallTicketMappingCSV(selected.name, hallTicketMapping)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="h-3.5 w-3.5" /> Mapping (CSV)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 print:hidden">
            <h2 className="font-bold text-slate-900 mb-4 text-sm">Generate Hall Tickets</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Examination
                </label>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white"
                >
                  <option value="">— Select exam —</option>
                  {exams.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.grade}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Grade
                </label>
                <select
                  value={grade}
                  onChange={e => setGrade(e.target.value)}
                  disabled={!selected}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {!selected ? (
                    <option value="">Select an exam first</option>
                  ) : (
                    examOwnGrades.map(g => <option key={g} value={g}>{g}</option>)
                  )}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Section
                </label>
                <select
                  value={section}
                  onChange={e => setSection(e.target.value)}
                  disabled={!selected}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {!selected ? (
                    <option value="">Select an exam first</option>
                  ) : (
                    validSections.map(s => <option key={s} value={s}>Section {s}</option>)
                  )}
                </select>
              </div>
            </div>
            {selected && !hasSeatingForExam && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                No room/seat allocation exists yet for this exam — hall tickets cannot be issued until seating is completed in Room Allocation.
              </div>
            )}
            {selected && (
              <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                <span className={cn("font-bold px-2 py-0.5 rounded-md border",
                  selected.mode === "Online" ? "bg-violet-50 text-violet-700 border-violet-200" :
                  selected.mode === "Hybrid" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
                  "bg-orange-50 text-orange-700 border-orange-200"
                )}>{selected.mode} Exam</span>
                {selected.venue && (
                  <span className="text-slate-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {selected.venue}
                  </span>
                )}
                <span className="text-slate-400">Max {selected.maxMarks} · Pass {selected.passingMarks}</span>
              </div>
            )}
            <button
              onClick={() => setPreview(true)}
              disabled={!selectedId || !hasSeatingForExam}
              title={!hasSeatingForExam ? "Allocate rooms for this exam first" : undefined}
              className="mt-4 h-10 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              {!hasSeatingForExam && <Lock className="h-3.5 w-3.5" />}
              Generate Hall Tickets
            </button>
          </div>

          {/* Hall ticket grid */}
          {preview && selected ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 print:hidden">
                {seatedStudents.length} Hall Tickets · {grade} Section {section}
              </p>
              {unseatedCount > 0 && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 print:hidden">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {unseatedCount} student{unseatedCount === 1 ? "" : "s"} in {grade} Section {section} {unseatedCount === 1 ? "has" : "have"} no room/seat allocated yet — their hall tickets are withheld until seating is completed.
                </div>
              )}
              {students.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="font-semibold text-slate-500">No students found for {grade} Section {section}.</p>
                </div>
              ) : seatedStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <Lock className="h-8 w-8 text-amber-300 mb-2" />
                  <p className="font-semibold text-slate-500">No students in {grade} Section {section} have a room/seat allocated yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Complete Room Allocation for this exam before issuing hall tickets.</p>
                </div>
              ) : (
              /* Screen: 2-column grid for compact browsing. Print: forced to plain
                 block flow — CSS Grid containers do not reliably paginate across
                 printed pages (Chrome/most browsers can clip or drop items after
                 the first page), so `print:block` switches every ticket back to
                 normal document flow, which browsers paginate correctly. */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:block print:gap-0">
                {seatedStudents.map((student, idx) => {
                  // Resolve the hall/seat: this exam's plan first, then a roll-range
                  // match, then ANY saved plan (covers mixed-grade halls where this
                  // student was seated inside a pooled plan saved under another exam).
                  const placed = findSeat(selected.id, student.id)
                    || findRoomByRoll(selected.id, student.rollNo)
                    || findSeatAnywhere(student.id, { grade, section, rollNo: student.rollNo });
                  const allocatedRoom = placed?.roomNo || "";
                  const allocatedSeat = placed?.seatLabel || seatNumber(selected.id, student.id);

                  return (
                    <div
                      key={student.id}
                      className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden print:break-inside-avoid print:break-after-page print:last:break-after-auto print:border-2 print:border-slate-800 print:rounded-none print:mb-6 print:last:mb-0 print:flex print:flex-col print:min-h-[260mm]"
                    >
                      {/* ── Ticket Header ── */}
                      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] px-5 py-4 flex items-center gap-4 print:px-10 print:py-8">
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 print:w-20 print:h-20">
                          <School className="h-7 w-7 text-white print:h-11 print:w-11" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-black text-base leading-tight print:text-3xl">{schoolName}</p>
                          {schoolAddress && <p className="text-white/70 text-[11px] print:text-sm print:mt-1">{schoolAddress}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white/70 text-[9px] font-bold uppercase tracking-widest print:text-xs print:tracking-[0.2em]">HALL TICKET</p>
                          <p className="text-white font-black text-[11px] mt-0.5 print:text-lg print:mt-1.5">{selected.name}</p>
                        </div>
                      </div>

                      <div className="p-4 space-y-3 print:p-10 print:space-y-8 print:flex-1 print:flex print:flex-col">
                        {/* ── Student Info ── */}
                        <div className="flex items-start gap-3 print:gap-6">
                          <div className="w-14 h-14 rounded-xl bg-blue-50 border-2 border-blue-100 flex items-center justify-center shrink-0 print:w-24 print:h-24 print:rounded-2xl">
                            <User className="h-7 w-7 text-blue-400 print:h-12 print:w-12" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-900 text-base leading-tight print:text-2xl">{student.name}</p>
                            <div className="grid grid-cols-2 gap-x-3 mt-1.5 print:gap-x-10 print:gap-y-3 print:mt-4">
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 print:text-xs">Admission No.</p>
                                <p className="text-[12px] font-bold text-slate-700 print:text-lg">{student.admissionNo}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 print:text-xs">Roll No.</p>
                                <p className="text-[12px] font-black text-[#7C3AED] print:text-lg">{student.rollNo}</p>
                              </div>
                              <div className="mt-1 print:mt-0">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 print:text-xs">Grade</p>
                                <p className="text-[12px] font-bold text-slate-700 print:text-lg">{grade}</p>
                              </div>
                              <div className="mt-1 print:mt-0">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 print:text-xs">Section</p>
                                <p className="text-[12px] font-bold text-slate-700 print:text-lg">Section {section}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Venue / Hall / Seat ── */}
                        <div className="grid grid-cols-3 gap-2 print:gap-5">
                          <div className="col-span-1 bg-blue-50 rounded-xl p-2.5 print:p-5 print:rounded-2xl">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1 print:text-xs print:gap-1.5">
                              <MapPin className="h-2.5 w-2.5 print:h-3.5 print:w-3.5" /> Venue
                            </p>
                            <p className="text-[11px] font-bold text-slate-800 mt-0.5 leading-tight print:text-base print:mt-1.5">{selected.venue || "TBD"}</p>
                          </div>
                          <div className="bg-violet-50 rounded-xl p-2.5 print:p-5 print:rounded-2xl">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-violet-400 print:text-xs">Hall No.</p>
                            <p className="text-[11px] font-black text-violet-700 mt-0.5 print:text-xl print:mt-1.5">{allocatedRoom || selected.room || "—"}</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-2.5 print:p-5 print:rounded-2xl">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1 print:text-xs print:gap-1.5">
                              <Hash className="h-2.5 w-2.5 print:h-3.5 print:w-3.5" /> Seat No.
                            </p>
                            <p className="text-[11px] font-black text-emerald-700 mt-0.5 print:text-xl print:mt-1.5">{allocatedSeat}</p>
                          </div>
                        </div>

                        {/* ── Exam Schedule ── */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1.5 print:text-sm print:mb-3 print:gap-2">
                            <BookOpen className="h-3 w-3 print:h-4 print:w-4" /> Examination Schedule
                          </p>
                          <div className="rounded-xl border border-slate-100 overflow-hidden print:rounded-2xl print:border-slate-200">
                            <table className="w-full text-[11px] print:text-base">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-2.5 py-1.5 text-left font-bold text-slate-500 uppercase tracking-wide text-[9px] print:px-5 print:py-3 print:text-xs">Subject</th>
                                  <th className="px-2.5 py-1.5 text-left font-bold text-slate-500 uppercase tracking-wide text-[9px] print:px-5 print:py-3 print:text-xs">Date</th>
                                  <th className="px-2.5 py-1.5 text-left font-bold text-slate-500 uppercase tracking-wide text-[9px] print:px-5 print:py-3 print:text-xs">Time</th>
                                  <th className="px-2.5 py-1.5 text-left font-bold text-slate-500 uppercase tracking-wide text-[9px] print:px-5 print:py-3 print:text-xs">Hall</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...slots].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((slot, i) => (
                                  <tr key={slot.subject + i} className={cn("border-b border-slate-50", i % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                                    <td className="px-2.5 py-1.5 font-semibold text-slate-800 print:px-5 print:py-3">{slot.subject}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap print:px-5 print:py-3">{fmtDate(slot.date)}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap print:px-5 print:py-3">{fmtTime(slot.start)}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 print:px-5 print:py-3">{allocatedRoom || slot.room || selected.room || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* ── Instructions ── */}
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 print:p-6 print:rounded-2xl">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5 mb-1.5 print:text-sm print:mb-3 print:gap-2">
                            <Shield className="h-3 w-3 print:h-4 print:w-4" /> Important Instructions
                          </p>
                          <ol className="space-y-0.5 print:space-y-1.5">
                            {INSTRUCTIONS.map((ins, i) => (
                              <li key={i} className="text-[10px] text-amber-900 flex items-start gap-1.5 leading-tight print:text-sm print:gap-2">
                                <span className="font-black shrink-0">{i + 1}.</span> {ins}
                              </li>
                            ))}
                          </ol>
                        </div>

                        {/* Spacer pushes the signature footer to the bottom of the
                            printed page, only on print — on screen the card should
                            still hug its content. */}
                        <div className="hidden print:block print:flex-1" />

                        {/* ── Footer ── */}
                        <div className="flex items-end justify-between pt-1 border-t border-slate-100 print:pt-6 print:border-t-2 print:border-slate-200">
                          <div className="text-center">
                            <div className="w-28 border-b border-slate-300 mb-0.5 print:w-44 print:mb-1.5" />
                            <p className="text-[9px] text-slate-400 print:text-xs">Principal's Signature</p>
                          </div>
                          <div className="text-center">
                            <div className="w-20 border-b border-slate-300 mb-0.5 print:w-36 print:mb-1.5" />
                            <p className="text-[9px] text-slate-400 print:text-xs">Controller of Exams</p>
                          </div>
                          <div className="w-16 h-10 bg-slate-100 rounded flex items-center justify-center print:w-28 print:h-16 print:rounded-lg">
                            <p className="text-[8px] text-slate-400 font-mono print:text-[10px]">BARCODE</p>
                          </div>
                        </div>

                        <p className="text-center text-[9px] text-slate-300 print:text-xs print:pt-1">
                          Valid only with original school ID card · {selected.name} · Roll No. {student.rollNo}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          ) : !preview ? (
            <div className="flex flex-col items-center justify-center h-52 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-[#7C3AED]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Generate Hall Tickets</h3>
              <p className="text-sm text-slate-500">Select an exam, grade and section above to preview hall tickets</p>
            </div>
          ) : null}
        </div>
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/hall-tickets route (and
// anyone importing this file directly) still works exactly as before.
export default function HallTickets() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <HallTicketsContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
