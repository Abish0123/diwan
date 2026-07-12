import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherScopes } from "@/hooks/useTeacherScopes";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileText, Clock, Calendar, CheckCircle, BarChart3,
  X, Eye, MapPin, Users, Send, Award, ClipboardCheck, Lock,
} from "lucide-react";
import {
  type ExamRecord, type ExamMode, useExams, updateExam, matchesSection, getGradePlans,
} from "@/lib/examStore";
import { matchesGradeSection } from "@/lib/studentGradeSection";
import { persistExamMarks, loadExamMarksFresh } from "@/lib/gradebookEngine";
import { isTeacherAssignedForSubject, type SubjectAssignment } from "@/lib/timetableRules";
import { logAudit } from "@/lib/auditLog";
import { notifyClassPublish } from "@/lib/classPublishNotify";

type Tab = "all" | "upcoming" | "completed" | "results";

// ── Marks persistence (shared with /exams/marks MarksEntry page) ──────────────
const LS_MARKS_KEY = "sd_exam_marks";
type MarksStore = Record<string, Record<string, Record<string, number>>>; // examId → subject → uid → mark
type RemarksStore = Record<string, Record<string, string>>;                // examId → uid → remark

const loadMarks = (): MarksStore => { try { return JSON.parse(localStorage.getItem(LS_MARKS_KEY) || "{}"); } catch { return {}; } };
// Write-through: localStorage + MySQL via persistExamMarks
const saveMarks = (d: MarksStore) => { persistExamMarks(d); };

// One "ExamRemark" MySQL row per exam (id = examId), holding a uid → remark map.
const loadAllRemarks = async (): Promise<RemarksStore> => {
  try {
    const rows = await smartDb.getAll("ExamRemark", undefined) as { id: string; remarks?: Record<string, string> }[];
    const store: RemarksStore = {};
    rows.forEach(r => { store[r.id] = r.remarks || {}; });
    return store;
  } catch {
    return {};
  }
};
const saveExamRemarks = async (examId: string, remarksForExam: Record<string, string>): Promise<void> => {
  await smartDb.create("ExamRemark", { examId, remarks: remarksForExam }, examId);
};

const letterGrade = (pct: number) =>
  pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B"
    : pct >= 50 ? "C" : pct >= 40 ? "D" : "F";

const modeBadge = (m: ExamMode) =>
  m === "Online" ? "bg-violet-50 text-violet-700 border-violet-200" :
  m === "Hybrid" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
  "bg-orange-50 text-orange-700 border-orange-200";

function statusMeta(s: string) {
  switch (s) {
    case "Scheduled": return { cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "Ongoing":   return { cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "Completed": return { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "Published": return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    default:          return { cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

function fmtRange(start: string, end: string) {
  if (!start) return "TBD";
  const f = (iso: string, y: boolean) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(y ? { year: "numeric" } : {}) }); } catch { return iso; } };
  if (!end || end === start) return f(start, true);
  return `${f(start, false)} – ${f(end, true)}`;
}

// Marks entry is only allowed once the exam is actually under way / done.
const canEnterMarks = (status: string) => status === "Ongoing" || status === "Completed";

export default function TeacherExams() {
  const { assignment } = useTeacherClass();
  const { user } = useAuth();
  // Full unscoped roster — NOT useStudents()/StudentContext, which fetches
  // Student rows filtered by the logged-in user's own uid (correct for an
  // admin viewing the students they own, but a teacher's uid never matches
  // the uid stamped on student records, so it silently returns zero rows).
  const [allStudents, setAllStudents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    smartDb.getAll("Student", "").then(data => setAllStudents(Array.isArray(data) ? data : [])).catch(() => setAllStudents([]));
  }, []);
  const myName = user?.displayName || (assignment as any)?.teacherName || "";
  const grade = assignment.grade || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();

  const { assignments, scopes } = useTeacherScopes(myName, { grade, section });

  const allExams = useExams();
  const [tab, setTab] = useState<Tab>("all");
  const [marksFor, setMarksFor] = useState<{ exam: ExamRecord; grade: string; section: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Exams visible to this teacher: matched to ANY grade/section they're scoped
  // to — their homeroom class AND every section they subject-teach in, not
  // just their own homeroom (a subject teacher's classes are usually not the
  // same section they're the class teacher of).
  const exams = useMemo(
    () => allExams.filter(e => scopes.some(sc => matchesSection(e, sc.grade, sc.section)) && e.publishedToTeachers !== false),
    [allExams, scopes]
  );

  // The (grade, section) this teacher should view/grade a given exam through.
  // A multi-grade exam can match more than one of the teacher's scopes (e.g.
  // their homeroom grade AND a different grade/section they subject-teach) —
  // prefer whichever scope they can actually enter marks for, so the modal
  // never opens on a class where every subject shows up locked while the one
  // they're really assigned to sits in a scope that just wasn't picked first.
  function scopeFor(e: ExamRecord) {
    const plans = getGradePlans(e);
    const editable = scopes.find(sc => {
      const plan = plans.find(p => p.grade === sc.grade);
      if (!plan) return false;
      return plan.slots.some(slot => isTeacherAssignedForSubject(assignments, myName, sc.grade, slot.subject, [sc.section]));
    });
    if (editable) return editable;
    return scopes.find(sc => matchesSection(e, sc.grade, sc.section)) || { grade, section };
  }

  // Deep-link from a "marks entry ready" notification (?examId=EXM-123) —
  // jump straight into that exam's marks modal instead of leaving the
  // teacher to hunt for it in the list.
  useEffect(() => {
    const wantId = searchParams.get("examId");
    if (!wantId || marksFor) return;
    const target = exams.find(e => e.id === wantId);
    if (!target) return;
    const scope = scopeFor(target);
    setMarksFor({ exam: target, grade: scope.grade, section: scope.section });
    const next = new URLSearchParams(searchParams);
    next.delete("examId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams, searchParams]);

  function rosterFor(g: string, s: string) {
    // matchesGradeSection handles the "1" vs "Grade 1" format inconsistency
    // and falls back to parsing classId when grade/section are blank on a
    // record — a raw strict-equality filter here previously dropped any
    // student whose grade/section didn't happen to match this exact format,
    // even though the Student Directory (which uses the same shared helper)
    // counted them correctly.
    return (allStudents as any[])
      .filter(st => matchesGradeSection(st, g, s))
      .map(st => ({ uid: String(st.id ?? st.uid ?? ""), name: st.name ?? st.displayName ?? "Student" }));
  }

  const filtered = exams.filter(e => {
    if (tab === "upcoming")  return e.status === "Scheduled" || e.status === "Ongoing";
    if (tab === "completed") return e.status === "Completed";
    if (tab === "results")   return e.status === "Published";
    return true;
  });

  const scheduled = exams.filter(e => e.status === "Scheduled" || e.status === "Ongoing").length;
  const toGrade   = exams.filter(e => e.status === "Completed").length;
  const published = exams.filter(e => e.status === "Published").length;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Exams &amp; Results</h1>
              <p className="text-sm text-slate-400">{grade} · Section {section} — Exam schedule, marks entry &amp; results</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Assigned Exams", value: exams.length, icon: FileText,    color: "text-purple-600 bg-violet-50" },
            { label: "Scheduled",      value: scheduled,    icon: Calendar,    color: "text-purple-600 bg-blue-50" },
            { label: "Awaiting Marks", value: toGrade,      icon: ClipboardCheck, color: "text-amber-600 bg-amber-50" },
            { label: "Results Out",    value: published,    icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
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

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(["all", "upcoming", "completed", "results"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition",
                tab === t ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {t}
            </button>
          ))}
        </div>

        {/* Exam list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="font-semibold">No exams in this category.</p>
              <p className="text-sm mt-1">Exams the admin publishes for {grade} · Section {section} appear here.</p>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {filtered.map(e => {
              const meta = statusMeta(e.status);
              const scope = scopeFor(e);
              // For multi-grade exams, count only THIS teacher's grade's own slots.
              const myPlan = getGradePlans(e).find(p => p.grade === scope.grade) || getGradePlans(e)[0];
              const subjectCount = myPlan?.slots.length || 1;
              return (
                <div key={e.id} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition flex-wrap">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{e.name}</p>
                      <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border", modeBadge(e.mode))}>{e.mode}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
                        {scope.grade} · Section {scope.section}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtRange(e.startDate, e.endDate)}</span>
                      <span>{subjectCount} subject{subjectCount === 1 ? "" : "s"}</span>
                      {e.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.venue}{e.room ? ` · ${e.room}` : ""}</span>}
                      <span>Max {e.maxMarks} · Pass {e.passingMarks}</span>
                    </div>
                  </div>
                  <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0", meta.cls)}>{e.status}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEnterMarks(e.status) ? (
                      <button onClick={() => setMarksFor({ exam: e, grade: scope.grade, section: scope.section })}
                        className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition flex items-center gap-1.5">
                        <ClipboardCheck className="w-3.5 h-3.5" /> Enter Marks
                      </button>
                    ) : (
                      <span title="Marks entry opens once the exam is Ongoing or Completed"
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5" /> Marks Locked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {marksFor && (
        <MarksModal
          exam={marksFor.exam}
          myName={myName}
          grade={marksFor.grade}
          section={marksFor.section}
          students={rosterFor(marksFor.grade, marksFor.section)}
          onClose={() => setMarksFor(null)}
        />
      )}
    </DashboardLayout>
  );
}

// ── Marks entry + result publishing modal ─────────────────────────────────────
function MarksModal({ exam, students, myName, grade, section, onClose }: {
  exam: ExamRecord;
  students: { uid: string; name: string }[];
  myName: string;
  grade: string;
  section: string;
  onClose: () => void;
}) {
  const { user, role } = useAuth();
  // A multi-grade exam has its own subject-wise timetable per grade — always
  // pull THIS teacher's grade plan, never the legacy exam.slots mirror (which
  // is just the first grade's slots and would show the wrong subjects here).
  const plan = useMemo(() => {
    const plans = getGradePlans(exam);
    return plans.find(p => p.grade === grade) || plans[0] || null;
  }, [exam, grade]);
  const slots = plan?.slots || [];
  const subjects = slots.length ? slots.map(s => s.subject) : [exam.subjects || "Overall"];

  // Real Subject → Teacher → Grade → Section allocation — the authoritative
  // source for "who may enter marks for this subject". ExamSlot.subjectTeacher
  // is never populated at exam-creation time, so it can't be used as the gate.
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((data: SubjectAssignment[]) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => setAssignments([]));
  }, []);
  const canEditSubject = (sub: string) => isTeacherAssignedForSubject(assignments, myName, grade, sub, [section]);
  // Who IS assigned, for the "locked" tooltip/notice — informational only.
  const assignedTeacherOf = (sub: string) =>
    assignments.find(a => a.subject === sub && a.grade === grade && a.section.toUpperCase() === section.toUpperCase())?.teacherName || "another teacher";

  // Start on the first subject this teacher is allowed to grade.
  const firstEditable = subjects.find(canEditSubject) ?? subjects[0];
  const [subject, setSubject] = useState(firstEditable);
  const editable = canEditSubject(subject);
  // Loaded from localStorage first (instant paint) then replaced with the
  // MySQL-merged truth — see loadExamMarksFresh() for why this matters.
  const [allMarks, setAllMarks] = useState<MarksStore>(loadMarks);
  const [allRemarks, setAllRemarks] = useState<RemarksStore>({});
  const [marks, setMarks] = useState<Record<string, number>>(() => loadMarks()[exam.id]?.[subjects[0]] || {});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExamMarksFresh().then(fresh => {
      setAllMarks(fresh);
      setMarks(fresh[exam.id]?.[subject] || {});
    }).catch(() => {});
    loadAllRemarks().then(fresh => {
      setAllRemarks(fresh);
      setRemarks(fresh[exam.id] || {});
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);

  const roster = students;

  function pickSubject(sub: string) {
    setSubject(sub);
    setMarks(allMarks[exam.id]?.[sub] || {});
  }
  function setMark(uid: string, val: string) {
    const n = Math.max(0, Math.min(exam.maxMarks, Number(val) || 0));
    setMarks(prev => ({ ...prev, [uid]: n }));
  }

  // Re-fetches the latest server marks right before writing so a second
  // subject-teacher's save can never clobber a first teacher's already-saved
  // marks with a stale local view (the backend replaces the whole per-exam
  // marks blob, it doesn't merge server-side).
  async function persist(status?: "Completed" | "Published") {
    const latest = await loadExamMarksFresh().catch(() => allMarks);
    const nextMarks: MarksStore = { ...latest, [exam.id]: { ...(latest[exam.id] || {}), [subject]: marks } };
    const nextRemarks: RemarksStore = { ...allRemarks, [exam.id]: remarks };
    setAllMarks(nextMarks); saveMarks(nextMarks);
    setAllRemarks(nextRemarks); await saveExamRemarks(exam.id, remarks);
    const appeared = Object.keys(marks).length;
    if (status) updateExam(exam.id, { status, appeared, publishedToStudents: status === "Published" ? true : exam.publishedToStudents });
    else updateExam(exam.id, { appeared });
  }

  async function handleSave() {
    setSaving(true);
    await persist("Completed");
    void logAudit({
      user_id: user?.uid || "unknown", user_name: user?.displayName || user?.email || myName, role: role || "class_teacher",
      module: "Academics", action: "marks_entry_save", entity: "ExamMark",
      entity_id: `${exam.id}:${subject}:${grade}-${section}`, status: "success",
    });
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
    toast.success(`Marks saved for ${subject}`);
  }
  async function handlePublish() {
    await persist("Published");
    void logAudit({
      user_id: user?.uid || "unknown", user_name: user?.displayName || user?.email || myName, role: role || "class_teacher",
      module: "Academics", action: "exam_results_published", entity: "ExamMark",
      entity_id: `${exam.id}:${subject}:${grade}-${section}`, status: "success",
    });
    // Real notification to every student + parent in this grade/section
    // (plus the class teacher and school leadership) — the toast previously
    // claimed this happened but nothing was ever actually sent.
    await notifyClassPublish({
      grade, section, entity: "Exam", type: "exam_results_published",
      title: `${subject} Results Published`,
      message: `${subject} results for ${exam.name} have been published.`,
      sourceId: `${exam.id}-${subject}`,
      redirectUrlStudent: "/student/exams",
      redirectUrlParent: "/parent/exams",
      redirectUrlTeacher: "/teacher/exams",
    }).catch(() => {});
    toast.success("Results published to students & parents");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-black text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-purple-600" /> Enter Marks &amp; Remarks
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-violet-50 text-violet-700 border-violet-200">{grade} · Section {section}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{exam.name} · Max {exam.maxMarks} · Pass {exam.passingMarks}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        {/* Subject picker — locked tabs show the assigned teacher */}
        {subjects.length > 1 && (
          <div className="px-5 pt-4 flex flex-wrap gap-2 flex-shrink-0">
            {subjects.map(s => {
              const canEdit = canEditSubject(s);
              return (
                <button key={s} onClick={() => pickSubject(s)} title={canEdit ? "" : `Assigned to ${assignedTeacherOf(s)}`}
                  className={cn("px-3 py-1.5 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5",
                    subject === s ? "bg-purple-600 border-purple-600 text-white"
                      : canEdit ? "bg-white border-slate-200 text-slate-700 hover:border-violet-300"
                      : "bg-slate-50 border-slate-200 text-slate-400")}>
                  {!canEdit && <Lock className="w-3 h-3" />}{s}
                </button>
              );
            })}
          </div>
        )}

        {/* RBAC notice when the selected subject belongs to another teacher */}
        {!editable && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex-shrink-0">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span><b>{subject}</b> is assigned to <b>{assignedTeacherOf(subject)}</b>. Only the assigned subject teacher can enter these marks.</span>
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Student</th>
                <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-24">Marks</th>
                <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-20">Result</th>
                <th className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Remark</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(s => {
                const m = marks[s.uid];
                const has = m !== undefined && m !== null;
                const pct = has ? (Number(m) / exam.maxMarks) * 100 : null;
                const lg = pct !== null ? letterGrade(pct) : "–";
                const pass = has ? Number(m) >= exam.passingMarks : null;
                return (
                  <tr key={s.uid} className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">{s.name}</td>
                    <td className="py-2.5">
                      <input type="number" min={0} max={exam.maxMarks} value={m === 0 ? "0" : (m || "")}
                        onChange={e => setMark(s.uid, e.target.value)} placeholder="—" disabled={!editable}
                        className="w-20 h-8 px-2 rounded-lg border border-slate-200 text-sm text-center outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-300" />
                    </td>
                    <td className="py-2.5">
                      {has ? (
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg",
                          pass ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                          {lg}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="py-2.5">
                      <input value={remarks[s.uid] || ""} onChange={e => setRemarks(prev => ({ ...prev, [s.uid]: e.target.value }))}
                        placeholder="Optional remark…" disabled={!editable}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-400 mr-auto flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {roster.length} students</span>
          <button onClick={onClose} className="py-2 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={handleSave} disabled={saving || !editable}
            className="py-2 px-4 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Marks"}
          </button>
          <button onClick={handlePublish} disabled={!editable}
            className="py-2 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> Publish Results
          </button>
        </div>
      </div>
    </div>
  );
}
