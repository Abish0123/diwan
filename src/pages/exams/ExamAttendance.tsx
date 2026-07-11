import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams, type ExamRecord } from "@/lib/examStore";
import { getSeating } from "@/lib/seatingStore";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ClipboardCheck, Check, X, Clock, Users,
  Download, Printer, Search, AlertCircle, Flag,
} from "lucide-react";

type AttendanceStatus = "present" | "absent" | "late";

interface AttendanceRecord {
  studentId: string;
  rollNo: string;
  name: string;
  section: string;
  seatLabel: string;
  status: AttendanceStatus;
  notes: string;
  // Real exam-malpractice flag — previously exam invigilation had no
  // connection to the school's Behaviour/conduct records at all. Flagging
  // here creates a real BehaviorIncident (same entity/shape the student
  // profile's "Report Incident" action already uses).
  flaggedMalpractice?: boolean;
}

function attendanceId(examId: string, slotDate: string): string {
  return `${examId}_${slotDate}`;
}

async function loadSaved(examId: string, slotDate: string): Promise<AttendanceRecord[] | null> {
  try {
    const row = await smartDb.getOne("ExamDayAttendance", attendanceId(examId, slotDate));
    return row && Array.isArray((row as any).records) ? (row as any).records : null;
  } catch {
    return null;
  }
}

async function saveToDisk(examId: string, slotDate: string, records: AttendanceRecord[]): Promise<void> {
  await smartDb.create("ExamDayAttendance", { examId, slotDate, records }, attendanceId(examId, slotDate));
}

function formatSlotLabel(subject: string, date: string): string {
  if (!date) return subject;
  try {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString("en-US", { month: "short" });
    return `${subject} — ${day} ${mon}`;
  } catch {
    return subject;
  }
}

function exportCsv(exam: ExamRecord, slotLabel: string, records: AttendanceRecord[]) {
  const rows = [
    ["Seat", "Roll No", "Student Name", "Section", "Status", "Notes"],
    ...records.map(r => [r.seatLabel, r.rollNo, r.name, r.section, r.status, r.notes]),
  ];
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${exam.id}_${slotLabel.replace(/[^a-z0-9]/gi, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Real Exam Attendance UI, extracted for embedding as a step inside the
// consolidated Exam Setup wizard — see RoomAllocation.tsx for the same pattern.
export function ExamAttendanceContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const { user } = useAuth();
  const selectedExamId = examId;
  const setSelectedExamId = onExamIdChange;
  const [selectedSlotDate, setSelectedSlotDate] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const selectedExam = useMemo(
    () => exams.find(e => e.id === selectedExamId) ?? null,
    [exams, selectedExamId]
  );

  const slots = useMemo(() => selectedExam?.slots ?? [], [selectedExam]);

  const selectedSlot = useMemo(
    () => slots.find(s => s.date === selectedSlotDate) ?? null,
    [slots, selectedSlotDate]
  );

  const seating = useMemo(
    () => (selectedExamId ? getSeating(selectedExamId) : null),
    [selectedExamId]
  );

  const rooms = useMemo(() => {
    if (!seating) return [];
    return seating.rooms;
  }, [seating]);

  const roomOptions = useMemo(() => {
    const names = Array.from(new Set(rooms.map(r => r.roomNo)));
    if (names.length === 0 && seating && seating.assignments.length > 0) {
      return Array.from(new Set(seating.assignments.map(a => a.roomNo)));
    }
    return names;
  }, [rooms, seating]);

  useEffect(() => {
    setSelectedSlotDate("");
    setSelectedRoom("all");
    setRecords([]);
  }, [selectedExamId]);

  useEffect(() => {
    setSelectedRoom("all");
  }, [selectedSlotDate]);

  useEffect(() => {
    if (!selectedExam || !selectedSlotDate) {
      setRecords([]);
      return;
    }

    let active = true;
    loadSaved(selectedExam.id, selectedSlotDate).then((saved) => {
      if (!active) return;
      if (saved) {
        setRecords(saved);
        return;
      }

      const assignments = seating?.assignments ?? [];
      if (assignments.length > 0) {
        const initial: AttendanceRecord[] = assignments.map(a => ({
          studentId: a.studentId,
          rollNo: a.rollNo,
          name: a.name,
          section: a.section,
          seatLabel: `${a.roomNo} / ${a.seatLabel}`,
          status: "present" as AttendanceStatus,
          notes: "",
        }));
        setRecords(initial);
        return;
      }

      setLoadingStudents(true);
      smartDb
        .getAll("Student")
        .then((students: any[]) => {
          if (!active) return;
          const grade = selectedExam.grade;
          const filtered = students.filter((s: any) => {
            const sg = s.grade || s.class || "";
            return sg === grade || sg.includes(grade);
          });
          const initial: AttendanceRecord[] = filtered.map((s: any, i: number) => ({
            studentId: String(s.id ?? s._id ?? i),
            rollNo: String(s.rollNo ?? s.roll_no ?? s.admissionNumber ?? i + 1),
            name: `${s.firstName ?? s.first_name ?? ""} ${s.lastName ?? s.last_name ?? ""}`.trim() || s.name || "Unknown",
            section: s.section ?? "",
            seatLabel: "—",
            status: "present" as AttendanceStatus,
            notes: "",
          }));
          setRecords(initial);
        })
        .catch(() => { if (active) setRecords([]); })
        .finally(() => { if (active) setLoadingStudents(false); });
    });
    return () => { active = false; };
  }, [selectedExam, selectedSlotDate, seating]);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (selectedRoom !== "all") {
      list = list.filter(r => r.seatLabel.startsWith(selectedRoom));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          r.rollNo.toLowerCase().includes(q) ||
          r.section.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, selectedRoom, search]);

  const summary = useMemo(() => {
    const present = records.filter(r => r.status === "present").length;
    const absent = records.filter(r => r.status === "absent").length;
    const late = records.filter(r => r.status === "late").length;
    const total = records.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, absent, late, total, rate };
  }, [records]);

  function updateStatus(studentId: string, status: AttendanceStatus) {
    setRecords(prev =>
      prev.map(r => (r.studentId === studentId ? { ...r, status } : r))
    );
  }

  function updateNotes(studentId: string, notes: string) {
    setRecords(prev =>
      prev.map(r => (r.studentId === studentId ? { ...r, notes } : r))
    );
  }

  async function handleFlagMalpractice(record: AttendanceRecord) {
    if (record.flaggedMalpractice || !user) return;
    if (!confirm(`Flag ${record.name} for exam malpractice? This creates a real Behaviour record.`)) return;
    const id = `BHV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const subject = selectedSlot?.subject || "Exam";
    try {
      await smartDb.create("BehaviorIncident", {
        id, studentId: record.studentId, studentName: record.name,
        type: "Malpractice", category: "Exam Conduct", severity: "High",
        description: `Flagged during ${subject} — ${selectedExam?.name || "exam"} (${selectedSlotDate}). Seat ${record.seatLabel}.`,
        date: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(), uid: user.uid,
      }, id);
      setRecords(prev => prev.map(r => r.studentId === record.studentId ? { ...r, flaggedMalpractice: true } : r));
      toast.success(`${record.name} flagged — Behaviour record created`);
    } catch {
      toast.error("Failed to flag malpractice");
    }
  }

  async function handleSave() {
    if (!selectedExam || !selectedSlotDate) return;
    try {
      await saveToDisk(selectedExam.id, selectedSlotDate, records);
      toast.success("Attendance saved");
    } catch {
      toast.error("Failed to save attendance");
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleExportCsv() {
    if (!selectedExam || !selectedSlotDate) return;
    const label = selectedSlot
      ? formatSlotLabel(selectedSlot.subject, selectedSlot.date)
      : selectedSlotDate;
    exportCsv(selectedExam, label, records);
  }

  return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Exam Attendance</h1>
            <p className="text-sm text-slate-400">Mark student attendance per exam sitting</p>
          </div>
        </div>

        {/* Selectors */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Examination
              </label>
              <select
                value={selectedExamId}
                onChange={e => setSelectedExamId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="">Select examination…</option>
                {exams.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.grade}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Date / Subject
              </label>
              <select
                value={selectedSlotDate}
                onChange={e => setSelectedSlotDate(e.target.value)}
                disabled={!selectedExamId || slots.length === 0}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
              >
                <option value="">Select slot…</option>
                {slots.map(s => (
                  <option key={s.date + s.subject} value={s.date}>
                    {formatSlotLabel(s.subject, s.date)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Room / Hall
              </label>
              <select
                value={selectedRoom}
                onChange={e => setSelectedRoom(e.target.value)}
                disabled={!selectedSlotDate}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
              >
                <option value="all">All Rooms</option>
                {roomOptions.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Empty: no exam selected */}
        {!selectedExamId && (
          <div className="rounded-2xl border border-slate-200 bg-white py-20 flex flex-col items-center gap-4 text-slate-400">
            <ClipboardCheck className="w-12 h-12 opacity-30" />
            <p className="text-base font-medium">Select an examination to begin</p>
          </div>
        )}

        {/* Empty: exam selected but no slots */}
        {selectedExamId && slots.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center gap-3 text-slate-400">
            <AlertCircle className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium">This exam has no subject slots defined</p>
          </div>
        )}

        {/* Slot selected */}
        {selectedExamId && slots.length > 0 && selectedSlotDate && (
          <>
            {/* Search + actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 w-56"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Attendance
                </button>
              </div>
            </div>

            {/* Print header (only visible on print) */}
            <div className="hidden print:block mb-4">
              <p className="text-lg font-bold">{selectedExam?.name} — {selectedExam?.grade}</p>
              {selectedSlot && (
                <p className="text-sm text-slate-600">
                  {selectedSlot.subject} &bull; {selectedSlot.date} &bull; {selectedSlot.start}–{selectedSlot.end}
                </p>
              )}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {loadingStudents ? (
                <div className="py-16 flex items-center justify-center text-slate-400 text-sm">
                  Loading students…
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
                  <Users className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium">No students found for this exam</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Seat</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Roll No</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Student Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Section</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide print:hidden">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map(r => (
                        <tr key={r.studentId} className="hover:bg-slate-50/60 transition-colors print:break-inside-avoid">
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{r.seatLabel}</td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{r.rollNo}</td>
                          <td className="px-4 py-3 text-slate-900">{r.name}</td>
                          <td className="px-4 py-3 text-slate-500">{r.section || "—"}</td>
                          <td className="px-4 py-3 print:hidden">
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateStatus(r.studentId, "present")}
                                className={cn(
                                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                                  r.status === "present"
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                    : "bg-white text-slate-400 border-slate-200 hover:border-emerald-200 hover:text-emerald-600"
                                )}
                              >
                                <Check className="w-3 h-3" />
                                Present
                              </button>
                              <button
                                onClick={() => updateStatus(r.studentId, "absent")}
                                className={cn(
                                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                                  r.status === "absent"
                                    ? "bg-rose-100 text-rose-700 border-rose-200"
                                    : "bg-white text-slate-400 border-slate-200 hover:border-rose-200 hover:text-rose-600"
                                )}
                              >
                                <X className="w-3 h-3" />
                                Absent
                              </button>
                              <button
                                onClick={() => updateStatus(r.studentId, "late")}
                                className={cn(
                                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                                  r.status === "late"
                                    ? "bg-amber-100 text-amber-700 border-amber-200"
                                    : "bg-white text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600"
                                )}
                              >
                                <Clock className="w-3 h-3" />
                                Late
                              </button>
                              <button
                                onClick={() => handleFlagMalpractice(r)}
                                disabled={r.flaggedMalpractice}
                                title={r.flaggedMalpractice ? "Already flagged — a Behaviour record was created" : "Flag exam malpractice — creates a real Behaviour record"}
                                className={cn(
                                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                                  r.flaggedMalpractice
                                    ? "bg-rose-100 text-rose-700 border-rose-200 cursor-default"
                                    : "bg-white text-slate-400 border-slate-200 hover:border-rose-200 hover:text-rose-600"
                                )}
                              >
                                <Flag className="w-3 h-3" />
                                {r.flaggedMalpractice ? "Flagged" : "Flag"}
                              </button>
                            </div>
                          </td>
                          {/* print-only status */}
                          <td className="px-4 py-3 hidden print:table-cell">
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                r.status === "present" && "text-emerald-700",
                                r.status === "absent" && "text-rose-700",
                                r.status === "late" && "text-amber-700"
                              )}
                            >
                              {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 print:hidden">
                            <input
                              type="text"
                              value={r.notes}
                              onChange={e => updateNotes(r.studentId, e.target.value)}
                              placeholder="Optional note…"
                              className="w-full max-w-xs text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Summary bar */}
            {records.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 flex flex-wrap gap-6 items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm text-slate-600">
                    Present: <span className="font-semibold text-slate-900">{summary.present}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="text-sm text-slate-600">
                    Absent: <span className="font-semibold text-slate-900">{summary.absent}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm text-slate-600">
                    Late: <span className="font-semibold text-slate-900">{summary.late}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-600">
                    Total: <span className="font-semibold text-slate-900">{summary.total}</span>
                  </span>
                </div>
                <div className="ml-auto">
                  <span className="text-sm text-slate-600">
                    Attendance Rate:{" "}
                    <span
                      className={cn(
                        "font-bold text-base",
                        summary.rate >= 90
                          ? "text-emerald-600"
                          : summary.rate >= 70
                          ? "text-amber-600"
                          : "text-rose-600"
                      )}
                    >
                      {summary.rate}%
                    </span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Slot not yet selected but exam has slots */}
        {selectedExamId && slots.length > 0 && !selectedSlotDate && (
          <div className="rounded-2xl border border-slate-200 bg-white py-14 flex flex-col items-center gap-3 text-slate-400">
            <ClipboardCheck className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">Select a date / subject slot to load students</p>
          </div>
        )}
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/attendance route (and
// anyone importing this file directly) still works exactly as before.
export default function ExamAttendance() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <ExamAttendanceContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
