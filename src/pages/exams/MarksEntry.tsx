import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams, updateExam, getGradePlans, examGrades } from "@/lib/examStore";
import { smartDb } from "@/lib/localDb";
import { persistExamMarks, loadExamMarksFresh } from "@/lib/gradebookEngine";
import { useAuth } from "@/hooks/useAuth";
import { isCentralAdmin } from "@/lib/roles";
import { isTeacherAssignedForSubject, findAssignedTeacher, type SubjectAssignment } from "@/lib/timetableRules";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck, Save, CheckCircle2,
  Users, BookOpen, Calendar, Award, Lock, GraduationCap,
} from "lucide-react";

// Strip "Mr./Mrs./Ms./Dr." titles for tolerant name comparison — same
// normalization used elsewhere (e.g. notification recipient matching) so a
// teacher's login name matches however their name was typed on the slot.
function normName(s?: string) {
  return (s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}

const LETTER_GRADE = (pct: number) =>
  pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B"
    : pct >= 50 ? "C" : pct >= 40 ? "D" : "F";

const LS_MARKS_KEY = "sd_exam_marks";

function loadMarks(): Record<string, Record<string, Record<string, number>>> {
  try { return JSON.parse(localStorage.getItem(LS_MARKS_KEY) || "{}"); } catch { return {}; }
}
function saveMarks(data: Record<string, Record<string, Record<string, number>>>) {
  persistExamMarks(data); // write-through: localStorage + MySQL
}

// Real Marks Entry UI, extracted for embedding as a step inside the
// consolidated Exam Setup wizard — see RoomAllocation.tsx for the same
// pattern. RBAC (isAdmin / canEnter) is unchanged from the standalone page.
//
// Layout note: the standalone page used to have its own left-hand exam list
// (320px rail) as the only way to pick an exam. Now that examId is shared
// across every wizard step, that list is redundant — replaced with the same
// compact "Examination" dropdown used by the other 5 steps, freeing the rail
// for the actual marks-entry content.
export function MarksEntryContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const { user, role } = useAuth();
  const isAdmin = isCentralAdmin(role);
  const myName = normName((user as any)?.displayName || (user as any)?.name || "");

  const selectedId = examId;
  const setSelectedId = onExamIdChange;
  // Which grade's plan is active — an exam like "Mid Term - 1" can span
  // several grades, each with its own subject list and roster.
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [students, setStudents] = useState<{ uid: string; name: string }[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  // Loaded from localStorage first (instant paint) then replaced with the
  // MySQL-merged truth — never rely on the localStorage-only snapshot when
  // deciding what to WRITE, or a second teacher's save can silently erase a
  // first teacher's already-persisted marks for a different subject (the
  // backend replaces the whole per-exam blob, it doesn't merge server-side).
  const [allMarks, setAllMarks] = useState<Record<string, Record<string, Record<string, number>>>>(loadMarks);
  const [saving, setSaving] = useState(false);

  // Real Subject → Teacher → Grade → Section allocation — the authoritative
  // source for "who may enter marks for this subject", since ExamSlot's own
  // subjectTeacher field is never populated at exam-creation time.
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((data: SubjectAssignment[]) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => setAssignments([]));
  }, []);

  useEffect(() => {
    loadExamMarksFresh().then(setAllMarks).catch(() => {});
  }, []);

  const selected = exams.find(e => e.id === selectedId) || null;
  const gradePlans = useMemo(() => (selected ? getGradePlans(selected) : []), [selected]);
  const activePlan = useMemo(
    () => gradePlans.find(p => p.grade === selectedGrade) || gradePlans[0] || null,
    [gradePlans, selectedGrade]
  );

  // Selecting a new exam defaults to its first grade.
  useEffect(() => {
    setSelectedGrade(gradePlans[0]?.grade || null);
    setSelectedSubject(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePlan) { setStudents([]); return; }
    const grade = activePlan.grade;
    const wantG = grade.toLowerCase().replace("grade ", "").trim();
    const allowedSections = activePlan.sections.length ? activePlan.sections.map(s => s.toUpperCase()) : null;
    smartDb.getAll("Student", "").then((all: any[]) => {
      const filtered = (all || []).filter((s: any) => {
        const g = (s.grade || s.gradeLevel || "").toLowerCase().replace("grade ", "").trim();
        if (g !== wantG) return false;
        if (allowedSections && !allowedSections.includes((s.section || "").toUpperCase())) return false;
        return true;
      });
      setStudents(filtered.map((s: any) => ({ uid: s.id || s.uid || s.studentId || "", name: s.name || s.studentName || s.displayName || "Student" })));
    }).catch(() => setStudents([]));
  }, [activePlan]);

  useEffect(() => {
    if (!selectedId || !selectedSubject) { setMarks({}); return; }
    const saved = allMarks[selectedId]?.[selectedSubject] || {};
    setMarks(saved);
  }, [selectedId, selectedSubject, allMarks]);

  function handleMark(uid: string, val: string) {
    // Was hardcoded to 100 regardless of the exam's actual maxMarks, so a
    // 50-mark exam could silently accept a mark of 100 — clamp to the real
    // ceiling instead (matches src/pages/teacher/TeacherExams.tsx).
    const cap = selected?.maxMarks ?? 100;
    const n = Math.max(0, Math.min(cap, Number(val) || 0));
    setMarks(prev => ({ ...prev, [uid]: n }));
  }

  // Real access check: is this teacher assigned (Subject Allocation) to teach
  // `slot.subject` for the active grade in ANY section this grade-plan covers?
  // (ExamSlot.subjectTeacher is never populated at exam-creation time, so it
  // can't be used as the gate — see timetableRules.ts for why.)
  function canEnter(slot: { subject: string }) {
    if (isAdmin) return true;
    if (!activePlan) return false;
    return isTeacherAssignedForSubject(assignments, myName, activePlan.grade, slot.subject, activePlan.sections);
  }

  async function handleSave() {
    if (!selectedId || !selectedSubject || !activeSlot) return;
    if (!canEnter(activeSlot)) {
      toast.error("You are not assigned to this subject — cannot save marks.");
      return;
    }
    setSaving(true);
    // Re-fetch the latest server state right before writing — closes the
    // window where another subject-teacher's marks, saved after this page
    // loaded, would otherwise be silently wiped by this save (the backend
    // replaces the whole per-exam marks blob, it doesn't merge).
    const latest = await loadExamMarksFresh().catch(() => allMarks);
    const updated = {
      ...latest,
      [selectedId]: {
        ...(latest[selectedId] || {}),
        [selectedSubject]: marks,
      },
    };
    setAllMarks(updated);
    saveMarks(updated);
    // Mark this grade's plan as done rather than blindly completing the whole
    // (possibly multi-grade) exam — other grades may still be in progress.
    if (activePlan && gradePlans.every(p =>
      p.grade === activePlan.grade || p.slots.every(sl => !!updated[selectedId]?.[sl.subject])
    ) && activePlan.slots.every(sl => sl.subject === selectedSubject || !!updated[selectedId]?.[sl.subject])) {
      updateExam(selectedId, { status: "Completed" });
    }
    void logAudit({
      user_id: user?.uid || "unknown", user_name: user?.displayName || user?.email || "Unknown", role: role || "admin",
      module: "Academics", action: "marks_entry_save", entity: "ExamMark",
      entity_id: `${selectedId}:${selectedSubject}:${activePlan?.grade || ""}`, status: "success",
    });
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast.success("Marks saved successfully");
  }

  const subjectSlots = activePlan?.slots || [];
  const activeSlot = subjectSlots.find(sl => sl.subject === selectedSubject) || null;

  // Once results are published (Exam Results → Publish), marks are locked for
  // everyone — parents/students may already be viewing report cards built from
  // them. Only an admin can deliberately unlock via a "Result Revision", which
  // reverts the exam to Completed so entry (and later re-publish) can happen again.
  const isLocked = selected?.status === "Published";
  function requestRevision() {
    if (!selectedId) return;
    const ok = window.confirm(
      "This will unlock marks entry for a result revision. Students & parents may already be viewing report cards built from the current marks — re-publish from Exam Results once the revision is done. Continue?"
    );
    if (!ok) return;
    updateExam(selectedId, { status: "Completed" });
    toast.info("Marks unlocked for revision — re-publish from Exam Results when done.");
  }

  return (
      <div className="min-h-screen bg-[#F8F7FF]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="h-5 w-5 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Marks Entry</h1>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Exam selector — same pattern as the other wizard steps */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Examination</label>
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setSelectedSubject(null); }}
              className="w-full sm:w-96 h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white"
            >
              <option value="">— Select exam —</option>
              {exams.map(e => {
                const grades = examGrades(e);
                return <option key={e.id} value={e.id}>{e.name} · {grades.join(", ")}</option>;
              })}
            </select>
          </div>

          <div>
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-52 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                  <ClipboardCheck className="h-8 w-8 text-[#7C3AED]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Select an Exam</h3>
                <p className="text-sm text-slate-500">Choose an exam above to enter marks</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Exam info */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-900">{selected.name}</h2>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{activePlan?.grade || selected.grade}</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{activePlan?.sections?.length ? activePlan.sections.join(", ") : "All Sections"}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{selected.startDate} → {selected.endDate}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">{selected.type}</span>
                  </div>
                  {isLocked && (
                    <div className="mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <Lock className="h-4 w-4" /> Results Published — marks are locked
                      </span>
                      {isAdmin ? (
                        <button onClick={requestRevision}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors">
                          Unlock for Revision
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-600">Contact an admin to request a revision.</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Grade selector — an exam can span multiple grades, each with its own timetable */}
                {gradePlans.length > 1 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Select Grade</p>
                    <div className="flex flex-wrap gap-2">
                      {gradePlans.map(plan => (
                        <button
                          key={plan.grade}
                          onClick={() => { setSelectedGrade(plan.grade); setSelectedSubject(null); }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all",
                            activePlan?.grade === plan.grade
                              ? "bg-slate-900 border-slate-900 text-white"
                              : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"
                          )}
                        >
                          <GraduationCap className="h-3.5 w-3.5" />
                          {plan.grade}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subject tabs */}
                {subjectSlots.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Select Subject</p>
                    <div className="flex flex-wrap gap-2">
                      {subjectSlots.map(slot => {
                        const done = !!(allMarks[selected.id]?.[slot.subject]);
                        const allowed = canEnter(slot);
                        return (
                          <button
                            key={slot.subject}
                            onClick={() => allowed && setSelectedSubject(slot.subject)}
                            disabled={!allowed}
                            title={!allowed ? `Only ${(activePlan?.sections.length ? activePlan.sections : [""]).map(sec => findAssignedTeacher(assignments, activePlan!.grade, sec, slot.subject)).find(Boolean) || "the assigned teacher"} can enter marks for this subject` : undefined}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all",
                              !allowed
                                ? "bg-slate-50 border-slate-100 text-slate-350 opacity-60 cursor-not-allowed"
                                : selectedSubject === slot.subject
                                ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                                : done
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "bg-white border-slate-200 text-slate-700 hover:border-violet-300"
                            )}
                          >
                            {!allowed && <Lock className="h-3 w-3" />}
                            {allowed && done && selectedSubject !== slot.subject && <CheckCircle2 className="h-3 w-3" />}
                            {slot.subject}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Marks table */}
                {selectedSubject && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                      <div>
                        <h3 className="font-bold text-slate-900">{selectedSubject}</h3>
                        <p className="text-[12px] text-slate-400 mt-0.5">{students.length} students · Max 100 marks</p>
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={saving || !activeSlot || !canEnter(activeSlot) || isLocked}
                        className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving…" : "Save Marks"}
                      </button>
                    </div>

                    {activeSlot && !canEnter(activeSlot) ? (
                      <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                        <Lock className="h-6 w-6 text-slate-300" />
                        You are not the assigned subject teacher for {selectedSubject}.
                      </div>
                    ) : isLocked ? (
                      <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                        <Lock className="h-6 w-6 text-slate-300" />
                        Results for this exam are published — marks entry is locked.
                      </div>
                    ) : students.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-sm">
                        No students found for {activePlan?.grade} · {activePlan?.sections?.length ? activePlan.sections.join(", ") : "All Sections"}
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">#</th>
                            <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Student</th>
                            <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Marks / 100</th>
                            <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((s, i) => {
                            const m = marks[s.uid] ?? "";
                            const pct = m !== "" ? (Number(m) / 100) * 100 : null;
                            const lg = pct !== null ? LETTER_GRADE(pct) : "–";
                            return (
                              <tr key={s.uid} className={cn("border-b border-slate-50", i % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                                <td className="px-5 py-3 text-slate-400 text-[12px]">{i + 1}</td>
                                <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                                <td className="px-5 py-3">
                                  <input
                                    type="number" min={0} max={100}
                                    value={m === 0 ? "0" : m || ""}
                                    onChange={e => handleMark(s.uid, e.target.value)}
                                    placeholder="—"
                                    className="w-20 h-8 px-2 rounded-lg border border-slate-200 text-sm text-center outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"
                                  />
                                </td>
                                <td className="px-5 py-3">
                                  <span className={cn("text-[12px] font-bold px-2 py-0.5 rounded-lg",
                                    lg === "A+" || lg === "A" ? "bg-emerald-100 text-emerald-700" :
                                    lg === "B+" || lg === "B" ? "bg-blue-100 text-blue-700" :
                                    lg === "C" || lg === "D" ? "bg-amber-100 text-amber-700" :
                                    lg === "F" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"
                                  )}>{lg}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {subjectSlots.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                    <Award className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <p className="font-semibold text-amber-800 text-sm">No subjects scheduled for this exam.</p>
                    <p className="text-amber-600 text-xs mt-1">Add subject slots from Exam Setup first.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/marks route (and anyone
// importing this file directly) still works exactly as before.
export default function MarksEntry() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <MarksEntryContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
