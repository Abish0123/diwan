import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams, examGrades, getGradePlans } from "@/lib/examStore";
import { useGrades } from "@/contexts/CurriculumContext";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LayoutGrid, Printer, Plus, Trash2, Users, DoorOpen, Armchair,
  Wand2, UserCheck, AlertTriangle, MapPin, GripHorizontal, Building2, Hash,
  GraduationCap, Layers, Eye, EyeOff, CalendarDays, RefreshCw,
} from "lucide-react";
import {
  type SeatingConfig, type SeatingMethod, type SeatGap, type ExamRoom, type SeatingStudent,
  type SeatAssignment, getSeating, saveSeating, allocateSeats, effectiveCapacity,
  newRoomId, SEATING_METHODS, SEAT_GAPS, defaultConfig, getRollRanges, isSeatingStale,
} from "@/lib/seatingStore";
import {
  downloadRoomAllocationReport, downloadStudentSeatingReport, downloadStudentSeatingCSV,
  downloadAttendanceSheets, downloadSeatingChart, downloadInvigilatorReport,
} from "@/lib/seatingReports";
import { Download, FileSpreadsheet, ClipboardCheck, BarChart3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SECTION_BADGE = ["bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700"];
const sectionColor = (s: string) => {
  const c = (s || "A").toUpperCase().charCodeAt(0) - 65;
  return SECTION_BADGE[((c % SECTION_BADGE.length) + SECTION_BADGE.length) % SECTION_BADGE.length];
};

// Distinct colour per grade so interleaving is visible at a glance in a mixed hall.
const GRADE_BADGE = ["bg-purple-600 text-white", "bg-sky-600 text-white", "bg-emerald-600 text-white", "bg-amber-600 text-white", "bg-pink-600 text-white", "bg-purple-600 text-white", "bg-rose-600 text-white"];
const gradeColor = (g: string, pool: string[]) => {
  const i = Math.max(0, pool.indexOf(g));
  return GRADE_BADGE[i % GRADE_BADGE.length];
};
// "Grade 6" → "G6", "Pre-KG" → "PK"
const gradeAbbr = (g: string) => {
  const num = (g || "").match(/\d+/);
  if (num) return `G${num[0]}`;
  return (g || "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
};
function fmtDate(iso: string): string {
  if (!iso) return "TBD";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtDay(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }); }
  catch { return ""; }
}

// The real Room Allocation UI, extracted so it can be embedded as a step inside
// the consolidated Exam Setup wizard (src/components/exams/ExamSetupWizard.tsx)
// AND still work standalone via the thin `RoomAllocation` wrapper below. The
// exam id is now an external prop (shared across every wizard step) instead of
// locally-owned state — aliased to the original `selectedId`/`setSelectedId`
// names so the rest of this file's logic is untouched.
export function RoomAllocationContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const allGrades = useGrades();
  const selectedId = examId;
  const setSelectedId = onExamIdChange;
  // Which of the exam's OWN grades (its gradePlans) are included in this
  // allocation pass — lets the officer allocate rooms grade-by-grade
  // ("according to grade I will fix the class") instead of always lumping
  // every grade in the exam into one pass.
  const [includedExamGrades, setIncludedExamGrades] = useState<string[]>([]);
  const [extraGrades, setExtraGrades] = useState<string[]>([]); // pool grades from OUTSIDE this exam into the same halls
  // Which grade's subject/date schedule is expanded for preview — lets the
  // officer see what's scheduled on which date before allocating halls.
  const [expandedScheduleGrade, setExpandedScheduleGrade] = useState<string | null>(null);
  const [students, setStudents] = useState<SeatingStudent[]>([]);
  const [cfg, setCfg] = useState<SeatingConfig>(defaultConfig(""));
  const [allocated, setAllocated] = useState(false);
  // Which subject-slot the Attendance Sheet report is generated for — an exam
  // covers many papers over several days, so the officer picks one per sheet.
  const [attendanceSlotKey, setAttendanceSlotKey] = useState("");

  const selected = exams.find(e => e.id === selectedId);
  const examOwnGrades = useMemo(() => (selected ? examGrades(selected) : []), [selected]);

  // Every subject slot across the exam's grade plans, for the attendance-sheet picker.
  const allSlots = useMemo(() => {
    if (!selected) return [];
    return getGradePlans(selected).flatMap((p, pi) =>
      p.slots.map((s, si) => ({ key: `${pi}-${si}`, grade: p.grade, ...s }))
    ).sort((a, b) => a.date.localeCompare(b.date));
  }, [selected]);
  useEffect(() => {
    if (allSlots.length > 0 && !allSlots.some(s => s.key === attendanceSlotKey)) setAttendanceSlotKey(allSlots[0].key);
    if (allSlots.length === 0) setAttendanceSlotKey("");
  }, [allSlots]);

  // Grades being pooled into one allocation: the exam's included grades + any
  // extra grades pooled in from outside the exam.
  const pooledGrades = useMemo(
    () => [...includedExamGrades, ...extraGrades],
    [includedExamGrades, extraGrades]
  );
  const multiGrade = pooledGrades.length > 1;

  // Load the saved seating config when an exam is picked. Every grade the
  // exam covers is included by default — the officer can narrow it down below.
  useEffect(() => {
    if (!selectedId || !selected) return;
    const saved = getSeating(selectedId);
    setCfg(saved);
    setAllocated(saved.assignments.length > 0);
    setIncludedExamGrades(examGrades(selected));
    setExtraGrades([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const toggleIncludedGrade = (g: string) => setIncludedExamGrades(prev =>
    prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  // Load the roster for ALL pooled grades (every allowed section per grade, so
  // mixed-grade/section seating can interleave them). Each exam grade may have
  // its own section list (set when the exam was created) — honor it per grade.
  useEffect(() => {
    if (!selected) { setStudents([]); return; }
    const norm = (g: string) => (g || "").toLowerCase().replace("grade ", "").trim();
    const wantSet = new Set(pooledGrades.map(norm));
    // grade -> allowed sections (null = all sections) from this exam's own plans
    const sectionsByGrade = new Map<string, string[] | null>();
    getGradePlans(selected).forEach(p => {
      sectionsByGrade.set(norm(p.grade), p.sections.length ? p.sections.map(s => s.toUpperCase()) : null);
    });
    smartDb.getAll("Student", "").then((all: any[]) => {
      const filtered = (all || []).filter((s: any) => {
        const g = norm(s.grade || s.gradeLevel || "");
        if (!wantSet.has(g)) return false;
        const allowedSections = sectionsByGrade.get(g);
        if (allowedSections && !allowedSections.includes((s.section || "").toUpperCase())) return false;
        return true;
      });
      const mapped: SeatingStudent[] = filtered.map((s: any, i: number) => {
        const g = norm(s.grade || s.gradeLevel || "");
        const gradeLabel = pooledGrades.find(w => norm(w) === g) || examOwnGrades[0] || "";
        return {
          id: String(s.id ?? s.uid ?? s.studentId ?? `STU-${i}`),
          rollNo: String(s.rollNo ?? s.roll ?? s.rollNumber ?? String(i + 1).padStart(2, "0")),
          grade: gradeLabel,
          section: (s.section || "A").toUpperCase(),
          name: s.name ?? s.studentName ?? s.displayName ?? `Student ${i + 1}`,
        };
      });
      setStudents(mapped);
    }).catch(() => setStudents([]));
  }, [selectedId, JSON.stringify(pooledGrades)]);

  // Warn when the exam's grades/sections/roster changed since seating was
  // last generated — the saved plan may no longer match reality (missing
  // students, stale room composition, etc).
  const seatingStale = useMemo(() => {
    if (!selected || cfg.assignments.length === 0) return false;
    return isSeatingStale(cfg, selected, students);
  }, [cfg, selected, students]);

  const sections = useMemo(() => Array.from(new Set(students.map(s => s.section))).sort(), [students]);
  const gradesInPool = useMemo(() => Array.from(new Set(students.map(s => s.grade))).sort(), [students]);

  function set<K extends keyof SeatingConfig>(k: K, v: SeatingConfig[K]) { setCfg(c => ({ ...c, [k]: v })); }

  function addRoom() {
    const n = 201 + cfg.rooms.length;
    set("rooms", [...cfg.rooms, { id: newRoomId(), roomNo: `Room ${n}`, capacity: cfg.roomCapacity, invigilator: "" }]);
  }
  function updateRoom(id: string, patch: Partial<ExamRoom>) {
    set("rooms", cfg.rooms.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function removeRoom(id: string) { set("rooms", cfg.rooms.filter(r => r.id !== id)); }

  function handleAllocate() {
    if (!selectedId) { toast.error("Select an exam first"); return; }
    if (students.length === 0) { toast.error("No students found for this exam"); return; }
    const result = allocateSeats(students, cfg);
    const next: SeatingConfig = { ...cfg, examId: selectedId, rooms: result.rooms, assignments: result.assignments };
    setCfg(next);
    saveSeating(next, selected);
    setAllocated(true);
    if (result.unallocated.length > 0) {
      toast.warning(`${result.assignments.length} seated · ${result.unallocated.length} could not be placed — add rooms or raise capacity`);
    } else {
      toast.success(`Allocated ${result.assignments.length} students across ${result.rooms.length} rooms`);
    }
  }

  // Group assignments by room for the seating plan.
  const byRoom = useMemo(() => {
    const map = new Map<string, SeatAssignment[]>();
    cfg.assignments.forEach(a => {
      if (!map.has(a.roomNo)) map.set(a.roomNo, []);
      map.get(a.roomNo)!.push(a);
    });
    return cfg.rooms
      .filter(r => map.has(r.roomNo))
      .map(r => ({ room: r, seats: map.get(r.roomNo)!.sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true })) }));
  }, [cfg.assignments, cfg.rooms]);

  // Per-room grade composition (for mixed-grade halls): grade → count + roll range.
  const roomComposition = useMemo(() => {
    const map = new Map<string, Map<string, { count: number; min: number; max: number }>>();
    cfg.assignments.forEach(a => {
      if (!map.has(a.roomNo)) map.set(a.roomNo, new Map());
      const g = map.get(a.roomNo)!;
      const roll = parseInt(String(a.rollNo).replace(/\D/g, ""), 10) || 0;
      const cur = g.get(a.grade);
      if (!cur) g.set(a.grade, { count: 1, min: roll, max: roll });
      else { cur.count++; cur.min = Math.min(cur.min, roll); cur.max = Math.max(cur.max, roll); }
    });
    return map;
  }, [cfg.assignments]);

  const totalSeated = cfg.assignments.length;
  const roomsUsed = byRoom.length;
  const unseated = Math.max(0, students.length - totalSeated);
  // Exam Operations Dashboard metrics — capacity utilization and staffing.
  const totalCapacity = byRoom.reduce((a, { room }) => a + effectiveCapacity(room.capacity, cfg.seatGap), 0);
  const utilizationPct = totalCapacity > 0 ? Math.round((totalSeated / totalCapacity) * 100) : 0;

  const attendanceSlot = allSlots.find(s => s.key === attendanceSlotKey);

  return (
      <div className="min-h-screen bg-[#F8F7FF] print:bg-white">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-[#7C3AED]" /> Exam Seating &amp; Room Allocation
            </h1>
            {allocated && (
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">
                <Printer className="h-3.5 w-3.5" /> Print Seating Plan
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Exam selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 print:hidden">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Examination</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full sm:w-96 h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white">
              <option value="">— Select exam —</option>
              {exams.map(e => {
                const eg = examGrades(e);
                const gradeLabel = eg.length > 1 ? `${eg.length} grades: ${eg.join(", ")}` : `${e.grade}${e.section !== "All Sections" ? ` · ${e.section}` : ""}`;
                return <option key={e.id} value={e.id}>{e.name} · {gradeLabel}</option>;
              })}
            </select>
            {selected && (
              <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                <span className="font-bold px-2 py-0.5 rounded-md border bg-orange-50 text-orange-700 border-orange-200">{selected.mode} Exam</span>
                <span className="text-slate-500 flex items-center gap-1"><Users className="h-3 w-3" /> {students.length} students</span>
                <span className="text-slate-500 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {gradesInPool.length} grade{gradesInPool.length === 1 ? "" : "s"}: {gradesInPool.join(", ")}</span>
                <span className="text-slate-500 flex items-center gap-1"><Hash className="h-3 w-3" /> {sections.length} section{sections.length === 1 ? "" : "s"}: {sections.join(", ")}</span>
              </div>
            )}

            {/* Grades scheduled under this exam heading — the key thing the officer
                needs to see before deciding how to fix rooms per grade. */}
            {selected && examOwnGrades.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <GraduationCap className="h-3.5 w-3.5 text-[#7C3AED]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Grades Planned Under "{selected.name}" ({examOwnGrades.length})
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">
                  Every grade sitting this exam is included by default. Uncheck a grade to allocate rooms for it separately, in its own pass.
                </p>
                <div className="flex flex-wrap gap-2">
                  {getGradePlans(selected).map(p => {
                    const on = includedExamGrades.includes(p.grade);
                    const sectionLabel = p.sections.length ? p.sections.join(", ") : "All sections";
                    return (
                      <div key={p.grade} className={cn("flex items-stretch rounded-lg border overflow-hidden transition-all",
                        on ? "border-[#7C3AED]" : "border-slate-200 opacity-60")}>
                        <button onClick={() => toggleIncludedGrade(p.grade)}
                          title={`${sectionLabel} · ${p.total || 0} students · ${p.slots.length} subjects`}
                          className={cn("flex flex-col items-start px-3 py-1.5 text-left", on ? "bg-violet-50" : "hover:bg-slate-50")}>
                          <span className={cn("text-[12px] font-bold", on ? "text-[#7C3AED]" : "text-slate-600")}>{on ? "✓ " : ""}{p.grade}</span>
                          <span className="text-[10px] text-slate-400">{sectionLabel} · {p.total || 0} students</span>
                        </button>
                        <button onClick={() => setExpandedScheduleGrade(g => g === p.grade ? null : p.grade)}
                          title="View subjects & dates scheduled for this grade"
                          className={cn("flex items-center justify-center px-2 border-l", on ? "border-[#7C3AED]/20 bg-violet-50 text-[#7C3AED]" : "border-slate-200 text-slate-400 hover:text-slate-600")}>
                          {expandedScheduleGrade === p.grade ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Subject/date schedule preview for the expanded grade — lets
                    the officer see what's scheduled before allocating halls. */}
                {expandedScheduleGrade && (() => {
                  const plan = getGradePlans(selected).find(p => p.grade === expandedScheduleGrade);
                  if (!plan) return null;
                  const rows = [...plan.slots].sort((a, b) => a.date.localeCompare(b.date));
                  return (
                    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-violet-100 flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-[#7C3AED]" />
                        <p className="text-[11px] font-bold text-violet-700">{expandedScheduleGrade} — Subjects Scheduled</p>
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-[11px] text-slate-400 px-3 py-3">No subject slots scheduled for this grade yet.</p>
                      ) : (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-left border-b border-violet-100/60">
                              {["Day", "Date", "Time", "Code", "Subject"].map(h => (
                                <th key={h} className="px-3 py-1.5 font-bold uppercase tracking-wider text-violet-400 text-[9px]">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((s, i) => (
                              <tr key={i} className="border-b border-violet-100/40 last:border-0">
                                <td className="px-3 py-1.5 font-semibold text-slate-700">{fmtDay(s.date)}</td>
                                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtDate(s.date)}</td>
                                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{s.start} - {s.end}</td>
                                <td className="px-3 py-1.5">{s.subjectCode ? <span className="font-mono font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">{s.subjectCode}</span> : "—"}</td>
                                <td className="px-3 py-1.5 font-semibold text-slate-800">{s.subject}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Pool other grades — from OUTSIDE this exam — into the same halls */}
            {selected && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="h-3.5 w-3.5 text-[#7C3AED]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Also Pool Other Grades Into These Halls</p>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">
                  Seat students from different grades together — neighbours get different papers, so copying is impossible. Pick <b>Mixed Grades</b> below after adding.
                </p>
                <div className="flex flex-wrap gap-2">
                  {allGrades.filter(g => !examOwnGrades.includes(g)).map(g => {
                    const on = extraGrades.includes(g);
                    return (
                      <button key={g} onClick={() => {
                        setExtraGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
                        if (!on) setCfg(c => ({ ...c, method: "mixed-grades" }));
                      }}
                        className={cn("px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all",
                          on ? "border-[#7C3AED] bg-violet-50 text-[#7C3AED]" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                        {on ? "✓ " : "+ "}{g}
                      </button>
                    );
                  })}
                </div>
                {multiGrade && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    Pooling <b>{pooledGrades.join(" + ")}</b> — students will be interleaved across grades in each hall.
                  </div>
                )}
              </div>
            )}
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center h-52 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4"><LayoutGrid className="h-8 w-8 text-[#7C3AED]" /></div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Plan Exam Seating</h3>
              <p className="text-sm text-slate-500">Select an exam to configure rooms and allocate students to seats.</p>
            </div>
          ) : (
            <>
              {students.length === 0 && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 print:hidden">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No enrolled students found for {pooledGrades.join(" + ") || "this exam's grade"}. Seating cannot be allocated until real students are enrolled for this grade/section.
                </div>
              )}

              {seatingStale && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 print:hidden">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                  <p className="flex-1">
                    <b>This exam's grades/sections/roster changed since seating was last generated</b> — re-allocate to make sure everyone has a seat.
                  </p>
                  <button onClick={handleAllocate}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-bold shrink-0">
                    <RefreshCw className="h-3.5 w-3.5" /> Re-allocate Now
                  </button>
                </div>
              )}

              {/* Configuration */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 print:hidden">
                <h2 className="font-black text-slate-900 mb-4 text-sm flex items-center gap-2"><Wand2 className="h-4 w-4 text-[#7C3AED]" /> Seating Configuration</h2>

                {/* Method */}
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Seating Method</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-5">
                  {SEATING_METHODS.map(m => (
                    <button key={m.id} onClick={() => set("method", m.id as SeatingMethod)}
                      className={cn("text-left p-3 rounded-xl border transition-all",
                        cfg.method === m.id ? "border-[#7C3AED] bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300")}>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0", cfg.method === m.id ? "border-[#7C3AED] bg-[#7C3AED]" : "border-slate-300")} />
                        <span className="text-[13px] font-bold text-slate-800">{m.label}</span>
                        {m.recommended && <span className="text-[9px] font-black uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Rec</span>}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 ml-5.5">{m.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {/* Room capacity */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Room Capacity</label>
                    <input type="number" min={1} max={100} value={cfg.roomCapacity}
                      onChange={e => set("roomCapacity", Math.max(1, Number(e.target.value) || 1))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100" />
                    <p className="text-[10px] text-slate-400 mt-1">Seats per auto-generated room</p>
                  </div>
                  {/* Seat gap */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Seat Gap</label>
                    <div className="flex flex-wrap gap-2">
                      {SEAT_GAPS.map(g => (
                        <button key={g.id} onClick={() => set("seatGap", g.id as SeatGap)} title={g.desc}
                          className={cn("px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all",
                            cfg.seatGap === g.id ? "border-[#7C3AED] bg-violet-50 text-[#7C3AED]" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{SEAT_GAPS.find(g => g.id === cfg.seatGap)?.desc}</p>
                  </div>
                </div>

                {/* Auto allocate */}
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Auto-allocate students</p>
                    <p className="text-[11px] text-slate-400">Automatically create enough rooms to seat everyone</p>
                  </div>
                  <button onClick={() => set("autoAllocate", !cfg.autoAllocate)}
                    className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", cfg.autoAllocate ? "bg-[#7C3AED]" : "bg-slate-200")}>
                    <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", cfg.autoAllocate && "translate-x-5")} />
                  </button>
                </div>
              </div>

              {/* Rooms editor */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 print:hidden">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-black text-slate-900 text-sm flex items-center gap-2"><DoorOpen className="h-4 w-4 text-[#7C3AED]" /> Rooms</h2>
                  <button onClick={addRoom} className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50">
                    <Plus className="h-3.5 w-3.5" /> Add Room
                  </button>
                </div>
                {cfg.rooms.length > 0 && (() => {
                  const definedCapacity = cfg.rooms.reduce((a, r) => a + effectiveCapacity(r.capacity, cfg.seatGap), 0);
                  const remaining = definedCapacity - students.length;
                  return (
                    <div className={cn("mb-4 flex items-center gap-2 text-[11px] font-semibold rounded-lg px-3 py-2 border",
                      remaining >= 0 ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-amber-700 bg-amber-50 border-amber-100")}>
                      {remaining >= 0 ? <UserCheck className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                      {students.length} students · {definedCapacity} seats defined across {cfg.rooms.length} room{cfg.rooms.length === 1 ? "" : "s"} ·{" "}
                      {remaining >= 0
                        ? `${remaining} seat${remaining === 1 ? "" : "s"} remaining`
                        : `${-remaining} more seat${-remaining === 1 ? "" : "s"} needed${cfg.autoAllocate ? " — extra rooms will be auto-generated" : " — add rooms or enable Auto-allocate"}`}
                    </div>
                  );
                })()}
                {cfg.rooms.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center">
                    <Building2 className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No rooms added. With <b>Auto-allocate</b> on, rooms are generated automatically when you allocate.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-slate-100">
                          <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Room No</th>
                          <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-28">Capacity</th>
                          <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-24">Usable</th>
                          <th className="py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cfg.rooms.map(r => (
                          <tr key={r.id} className="border-b border-slate-50">
                            <td className="py-2 pr-2">
                              <input value={r.roomNo} onChange={e => updateRoom(r.id, { roomNo: e.target.value })}
                                className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]" />
                            </td>
                            <td className="py-2 pr-2">
                              <input type="number" min={1} value={r.capacity} onChange={e => updateRoom(r.id, { capacity: Math.max(1, Number(e.target.value) || 1) })}
                                className="w-20 h-9 px-2 rounded-lg border border-slate-200 text-sm text-center outline-none focus:border-[#7C3AED]" />
                            </td>
                            <td className="py-2 pr-2 text-slate-500 font-semibold">{effectiveCapacity(r.capacity, cfg.seatGap)}</td>
                            <td className="py-2">
                              <button onClick={() => removeRoom(r.id)} className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center">
                                <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-500" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button onClick={handleAllocate}
                  className="mt-4 h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold flex items-center gap-2">
                  <Wand2 className="h-4 w-4" /> Allocate Students
                </button>
              </div>

              {/* Results */}
              {allocated && (
                <>
                  {/* Exam Operations Dashboard — KPIs */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <h2 className="font-black text-slate-900 mb-4 text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#7C3AED]" /> Exam Operations Dashboard</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: "Students Seated", value: totalSeated, Icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
                        { label: "Rooms Used", value: roomsUsed, Icon: DoorOpen, color: "text-purple-600 bg-violet-50" },
                        { label: "Capacity Utilization", value: `${utilizationPct}%`, Icon: Armchair, color: utilizationPct >= 90 ? "text-amber-600 bg-amber-50" : "text-purple-600 bg-blue-50" },
                        { label: "Unseated", value: unseated, Icon: AlertTriangle, color: unseated ? "text-rose-600 bg-rose-50" : "text-slate-400 bg-slate-50" },
                        { label: "Seat Gap Policy", value: SEAT_GAPS.find(g => g.id === cfg.seatGap)?.label, Icon: Armchair, color: "text-purple-600 bg-blue-50" },
                        { label: "Seating Method", value: SEATING_METHODS.find(m => m.id === cfg.method)?.label, Icon: LayoutGrid, color: "text-purple-600 bg-violet-50" },
                        { label: "Grades in This Pass", value: pooledGrades.length, Icon: GraduationCap, color: "text-sky-600 bg-sky-50" },
                      ].map(k => (
                        <div key={k.label} className="rounded-xl border border-slate-100 p-3 flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", k.color)}><k.Icon className="h-4 w-4" /></div>
                          <div><p className="text-[10px] text-slate-400 font-medium">{k.label}</p><p className="text-base font-black text-slate-900">{k.value}</p></div>
                        </div>
                      ))}
                    </div>
                    {unseated > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {unseated} student{unseated === 1 ? "" : "s"} could not be seated — add more rooms or raise capacity above, then re-allocate.
                      </div>
                    )}
                  </div>

                  {/* Reports & Exports */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <h2 className="font-black text-slate-900 mb-1 text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-[#7C3AED]" /> Reports &amp; Exports</h2>
                    <p className="text-[11px] text-slate-400 mb-4">Download every report the exam operations team needs, generated from this seating plan.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <button onClick={() => downloadRoomAllocationReport(selected.name, getRollRanges(selectedId), cfg.assignments)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left">
                        <Hash className="h-4 w-4 text-purple-600 shrink-0" />
                        <div><p className="text-xs font-bold text-slate-800">Room Allocation Report</p><p className="text-[10px] text-slate-400">Room · grade · roll range · totals</p></div>
                      </button>
                      <button onClick={() => downloadStudentSeatingReport(selected.name, cfg.assignments)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left">
                        <Users className="h-4 w-4 text-purple-600 shrink-0" />
                        <div><p className="text-xs font-bold text-slate-800">Student Seating Report</p><p className="text-[10px] text-slate-400">Every student's room + seat (PDF)</p></div>
                      </button>
                      <button onClick={() => downloadStudentSeatingCSV(selected.name, cfg.assignments)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left">
                        <Download className="h-4 w-4 text-purple-600 shrink-0" />
                        <div><p className="text-xs font-bold text-slate-800">Student Seating (CSV)</p><p className="text-[10px] text-slate-400">Spreadsheet export</p></div>
                      </button>
                      <button onClick={() => downloadSeatingChart(selected.name, byRoom)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left">
                        <LayoutGrid className="h-4 w-4 text-purple-600 shrink-0" />
                        <div><p className="text-xs font-bold text-slate-800">Seating Chart</p><p className="text-[10px] text-slate-400">Visual room-by-room layout (PDF)</p></div>
                      </button>
                      <button onClick={() => downloadInvigilatorReport(selected.name, byRoom)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left">
                        <UserCheck className="h-4 w-4 text-purple-600 shrink-0" />
                        <div><p className="text-xs font-bold text-slate-800">Invigilator Report</p><p className="text-[10px] text-slate-400">Per-invigilator room + roster</p></div>
                      </button>
                      <div className="flex items-center gap-2.5 p-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/30">
                        <ClipboardCheck className="h-4 w-4 text-purple-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 mb-1.5">Room-wise Attendance Sheet</p>
                          {allSlots.length === 0 ? (
                            <p className="text-[10px] text-slate-400">No subjects scheduled for this exam yet.</p>
                          ) : (
                            <>
                              <Select value={attendanceSlotKey} onValueChange={setAttendanceSlotKey}>
                                <SelectTrigger className="h-7 text-[11px] bg-white border-slate-200"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-52">
                                  {allSlots.map(s => (
                                    <SelectItem key={s.key} value={s.key} className="text-xs">{s.grade} · {s.subjectCode ? `${s.subjectCode} — ` : ""}{s.subject} · {s.date || "TBD"}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <button
                                onClick={() => attendanceSlot && downloadAttendanceSheets(selected.name, attendanceSlot.date, attendanceSlot.subjectCode || "", attendanceSlot.subject, byRoom)}
                                className="mt-1.5 text-[11px] font-bold text-violet-700 hover:underline">
                                Download for this paper →
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hall Allocation Summary */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 bg-violet-50 flex items-center justify-between">
                      <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                        <Hash className="h-4 w-4 text-[#7C3AED]" /> Hall Allocation Summary
                      </h3>
                      <span className="text-[11px] text-slate-500">{pooledGrades.join(" + ")} · {selected.name}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {["Hall / Room", "Capacity", multiGrade ? "Grade Composition (Roll Range)" : "Roll No. Range", "Students"].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getRollRanges(selectedId).map((r, i) => {
                            const roomObj = cfg.rooms.find(rm => rm.roomNo === r.roomNo);
                            const comp = roomComposition.get(r.roomNo);
                            return (
                              <tr key={r.roomNo} className="border-b border-slate-50 hover:bg-violet-50/30">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-[10px] font-black text-violet-700">{i + 1}</span>
                                    <span className="font-bold text-slate-900">{r.roomNo}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600">{roomObj?.capacity ?? cfg.roomCapacity}</td>
                                <td className="px-4 py-3">
                                  {multiGrade && comp ? (
                                    <div className="flex flex-wrap gap-1">
                                      {gradesInPool.filter(g => comp.has(g)).map(g => {
                                        const v = comp.get(g)!;
                                        return (
                                          <span key={g} className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", gradeColor(g, gradesInPool))}>
                                            {gradeAbbr(g)}: {v.min}–{v.max} ({v.count})
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span className="font-bold text-slate-900 bg-violet-50 px-2 py-0.5 rounded-md text-[12px]">{r.rollFrom} – {r.rollTo}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-semibold text-emerald-600">{r.count}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Seating plan per room */}
                  <div>
                    <div className="flex items-center justify-between mb-3 print:mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Seating Plan · {selected.name} · {pooledGrades.join(" + ")}
                      </p>
                      <p className="text-[11px] text-slate-400 hidden print:block">{SEATING_METHODS.find(m => m.id === cfg.method)?.label}</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {byRoom.map(({ room, seats }) => (
                        <div key={room.id} className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden print:break-inside-avoid">
                          <div className="bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-white">
                              <MapPin className="h-4 w-4" />
                              <span className="font-black text-sm">{room.roomNo}</span>
                            </div>
                            <div className="text-right text-white">
                              <p className="text-[10px] opacity-80 leading-none">{seats.length}/{room.capacity} seats</p>
                            </div>
                          </div>
                          {/* Grade mix chips for this hall (mixed-grade only) */}
                          {multiGrade && (
                            <div className="flex flex-wrap gap-1 px-3 pt-2.5">
                              {gradesInPool.filter(g => seats.some(s => s.grade === g)).map(g => (
                                <span key={g} className={cn("text-[9px] font-black px-1.5 py-0.5 rounded", gradeColor(g, gradesInPool))}>
                                  {g}: {seats.filter(s => s.grade === g).length}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="p-3">
                            {/* Front-of-room marker */}
                            <div className="flex items-center justify-center gap-1.5 mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-300">
                              <GripHorizontal className="h-3 w-3" /> Front / Board
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {seats.map(s => (
                                <div key={s.studentId} className={cn("rounded-lg border px-2 py-1.5",
                                  multiGrade ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/60")}>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[10px] font-black text-[#7C3AED]">{s.seatLabel}</span>
                                    {multiGrade ? (
                                      <span className={cn("text-[8px] font-black px-1 py-0.5 rounded", gradeColor(s.grade, gradesInPool))}>{gradeAbbr(s.grade)}·{s.section}{s.rollNo}</span>
                                    ) : (
                                      <span className={cn("text-[8px] font-bold px-1 py-0.5 rounded", sectionColor(s.section))}>{s.section}·{s.rollNo}</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-semibold text-slate-700 truncate leading-tight mt-0.5">{s.name}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/seating route (and anyone
// importing this file directly) still works exactly as before. The real UI
// lives in RoomAllocationContent above, shared with the Exam Setup wizard.
export default function RoomAllocation() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <RoomAllocationContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
