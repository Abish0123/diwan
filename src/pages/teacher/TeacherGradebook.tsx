import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useTeacherScopes } from "@/hooks/useTeacherScopes";
import { smartDb } from "@/lib/localDb";
import { canonGrade as sharedCanonGrade } from "@/lib/studentGradeSection";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade, getPeriodLabels } from "@/lib/curriculumConfig";
import { loadGradebookSources, computeSubject, type GradebookSources } from "@/lib/gradebookEngine";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, BookOpen, TrendingUp, CheckCircle2, AlertTriangle, Search, Trophy, Download,
  Pencil, Send, ShieldCheck, Undo2, History,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MarkOverride, GradebookSubmission, SUBMISSION_STATUS_COLORS,
  getOverridesFor, saveMarkOverride, overrideKey,
  getSubmission, submitToClassTeacher, classTeacherApprove, classTeacherReturn,
} from "@/lib/gradebookApproval";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AssessmentCol { key: string; label: string; max: number; weight: number }

const FALLBACK_COLUMNS: AssessmentCol[] = [
  { key: "assignments", label: "Assignments", max: 20, weight: 20 },
  { key: "assessments", label: "Assessments", max: 20, weight: 20 },
  { key: "mid_term_exam", label: "Mid-Term Exam", max: 20, weight: 20 },
  { key: "final_exam", label: "Final Exam", max: 40, weight: 40 },
];

function gradeFromPct(pct: number) {
  if (pct >= 90) return { letter: "A+", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", hex: "#10B981" };
  if (pct >= 80) return { letter: "A", bg: "bg-green-50 text-green-700 border-green-200", hex: "#22C55E" };
  if (pct >= 70) return { letter: "B+", bg: "bg-blue-50 text-blue-700 border-blue-200", hex: "#3B82F6" };
  if (pct >= 60) return { letter: "B", bg: "bg-violet-50 text-violet-700 border-violet-200", hex: "#8B5CF6" };
  if (pct >= 50) return { letter: "C", bg: "bg-amber-50 text-amber-700 border-amber-200", hex: "#F59E0B" };
  if (pct > 0) return { letter: "D", bg: "bg-orange-50 text-orange-700 border-orange-200", hex: "#F97316" };
  return { letter: "—", bg: "bg-gray-50 text-gray-400 border-gray-200", hex: "#94A3B8" };
}
function pctColor(pct: number) {
  if (pct >= 85) return "text-emerald-600";
  if (pct >= 70) return "text-purple-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-500";
}

function KPI({ icon: Icon, label, value, sub, color, bg }: {
  icon: typeof Users; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-500 truncate">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bg)}>
            <Icon className={cn("w-5 h-5", color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function normName(s: string | undefined | null): string {
  return (s || "").toLowerCase().trim();
}

export default function TeacherGradebook() {
  const { user } = useAuth();
  const { assignment } = useTeacherClass();
  const myName = user?.displayName || (assignment as any)?.teacherName || "";
  const homeroom = { grade: assignment.grade || "", section: (assignment.section || "").toUpperCase() };
  const { assignments, scopes } = useTeacherScopes(myName, homeroom);

  const { curriculum } = useCurriculum();
  const TERMS = getPeriodLabels(curriculum);
  const [term, setTerm] = useState(() => TERMS[0] ?? "Term 1");
  useEffect(() => { setTerm(TERMS[0] ?? "Term 1"); }, [curriculum.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which of this teacher's real classes (homeroom + subject-taught sections)
  // to view — never a hardcoded/demo class list.
  const [scopeKey, setScopeKey] = useState("");
  useEffect(() => {
    if (scopes.length > 0 && !scopeKey) setScopeKey(`${scopes[0].grade}|${scopes[0].section}`);
  }, [scopes, scopeKey]);
  const activeScope = scopes.find(s => `${s.grade}|${s.section}` === scopeKey) || scopes[0] || { grade: "", section: "" };
  const isHomeroom = normName(activeScope.grade) === normName(homeroom.grade) && normName(activeScope.section) === normName(homeroom.section);

  // Subjects available in the selected class — full subject list for their own
  // homeroom (class teacher sees the whole class), otherwise only the
  // subject(s) this teacher is actually assigned to teach there.
  const myAssignments = useMemo(() => assignments.filter(a => normName(a.teacherName) === normName(myName)), [assignments, myName]);
  const subjectOptions = useMemo(() => {
    const forScope = (list: typeof assignments) => Array.from(new Set(
      list.filter(a => normName(a.grade) === normName(activeScope.grade) &&
        (normName(a.section) === normName(activeScope.section) || normName(a.section) === "all sections"))
        .map(a => a.subject)
    )).sort();
    const mine = forScope(myAssignments);
    if (isHomeroom) {
      const all = forScope(assignments);
      return all.length > 0 ? all : mine;
    }
    return mine;
  }, [assignments, myAssignments, activeScope, isHomeroom]);
  const [subject, setSubject] = useState("");
  useEffect(() => {
    if (subjectOptions.length > 0 && !subjectOptions.includes(subject)) setSubject(subjectOptions[0]);
    if (subjectOptions.length === 0) setSubject("");
  }, [subjectOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState("");

  // Is the viewer the actual assigned subject teacher for this class+subject?
  // Only they can manually correct a mark — a class teacher reviewing a
  // subject that isn't theirs can approve/return the submission but not edit it.
  const isMySubject = useMemo(() => myAssignments.some(a =>
    normName(a.grade) === normName(activeScope.grade) &&
    (normName(a.section) === normName(activeScope.section) || normName(a.section) === "all sections") &&
    a.subject === subject
  ), [myAssignments, activeScope, subject]);

  // Real class teacher + grade coordinator for the ACTIVE scope (not
  // necessarily this viewer's own homeroom — a subject teacher's active
  // scope is often a different section) — who a submission actually routes to.
  const [classes, setClasses] = useState<any[]>([]);
  useEffect(() => { smartDb.getAll("Class", undefined).then((d: any[]) => setClasses(Array.isArray(d) ? d : [])).catch(() => setClasses([])); }, []);
  const activeScopeClassTeacher = useMemo(() => {
    const canonGrade = (v: string) => normName(v).replace(/^grade\s*/, "").replace(/\s+/g, "");
    const cls = classes.find(c => canonGrade(c.grade) === canonGrade(activeScope.grade) && normName(c.section) === normName(activeScope.section));
    return cls?.teacher || "";
  }, [classes, activeScope]);
  const [gradeCoordinatorName, setGradeCoordinatorName] = useState("");
  useEffect(() => {
    if (!activeScope.grade) { setGradeCoordinatorName(""); return; }
    // Not a getOne-by-id lookup — GradeCoordinator rows aren't reliably
    // keyed by grade name (batch-seeded rows use ids like "GC-3"; only
    // rows created through the Classes UI use the grade itself as the id),
    // so this must scan and match on the row's own `grade` field instead.
    smartDb.getAll("GradeCoordinator", undefined).then((rows: any[]) => {
      const wantGrade = sharedCanonGrade(activeScope.grade);
      const match = (rows || []).find((r: any) => sharedCanonGrade(r.grade) === wantGrade);
      setGradeCoordinatorName(match?.name || "");
    }).catch(() => setGradeCoordinatorName(""));
  }, [activeScope.grade]);

  // Manual mark corrections for this exact class+subject+term.
  const [overrides, setOverrides] = useState<MarkOverride[]>([]);
  const reloadOverrides = () => {
    if (!subject) { setOverrides([]); return; }
    getOverridesFor(activeScope.grade, activeScope.section, subject, term).then(setOverrides).catch(() => setOverrides([]));
  };
  useEffect(reloadOverrides, [activeScope.grade, activeScope.section, subject, term]); // eslint-disable-line react-hooks/exhaustive-deps

  const [overrideCell, setOverrideCell] = useState<{ studentId: string; studentName: string; columnKey: string; columnLabel: string; original: number | null } | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const saveOverride = async () => {
    if (!overrideCell) return;
    const val = Number(overrideValue);
    if (!overrideValue || Number.isNaN(val)) { toast.error("Enter a valid number"); return; }
    if (!overrideReason.trim()) { toast.error("A reason is required for a manual correction"); return; }
    setSavingOverride(true);
    try {
      const o: MarkOverride = {
        id: overrideKey(overrideCell.studentId, subject, overrideCell.columnKey, term),
        studentId: overrideCell.studentId, studentName: overrideCell.studentName,
        grade: activeScope.grade, section: activeScope.section, subject, term,
        columnKey: overrideCell.columnKey, columnLabel: overrideCell.columnLabel,
        originalValue: overrideCell.original, overrideValue: val, reason: overrideReason.trim(),
        overriddenBy: myName,
      };
      await saveMarkOverride(o);
      toast.success("Mark corrected");
      setOverrideCell(null); setOverrideValue(""); setOverrideReason("");
      reloadOverrides();
    } catch {
      toast.error("Failed to save correction");
    } finally {
      setSavingOverride(false);
    }
  };

  // Submission workflow: Subject Teacher -> Class Teacher -> Grade Coordinator
  const [submission, setSubmission] = useState<GradebookSubmission | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const reloadSubmission = () => {
    if (!subject) { setSubmission(null); return; }
    getSubmission(activeScope.grade, activeScope.section, subject, term).then(setSubmission).catch(() => setSubmission(null));
  };
  useEffect(reloadSubmission, [activeScope.grade, activeScope.section, subject, term]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitToClassTeacher = async () => {
    setWorkflowBusy(true);
    try {
      const sub = await submitToClassTeacher({
        grade: activeScope.grade, section: activeScope.section, subject, term,
        subjectTeacherName: myName, classTeacherName: activeScopeClassTeacher || undefined,
      });
      setSubmission(sub);
      toast.success(activeScopeClassTeacher ? `Submitted to ${activeScopeClassTeacher}` : "Submitted — no class teacher assigned to this section yet");
    } catch {
      toast.error("Failed to submit");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleClassTeacherApprove = async () => {
    if (!submission) return;
    setWorkflowBusy(true);
    try {
      const updated = await classTeacherApprove(submission, myName, gradeCoordinatorName || undefined);
      setSubmission(updated);
      toast.success(gradeCoordinatorName ? `Approved and sent to ${gradeCoordinatorName}` : "Approved — no grade coordinator assigned to this grade yet");
    } catch {
      toast.error("Failed to approve");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleClassTeacherReturn = async () => {
    if (!submission || !returnReason.trim()) { toast.error("Add a reason for returning it"); return; }
    setWorkflowBusy(true);
    try {
      const updated = await classTeacherReturn(submission, myName, returnReason.trim());
      setSubmission(updated);
      setReturnOpen(false); setReturnReason("");
      toast.success("Returned to subject teacher");
    } catch {
      toast.error("Failed to return");
    } finally {
      setWorkflowBusy(false);
    }
  };

  // Real, unscoped student roster (NOT useStudents()/StudentContext, which
  // filters by the logged-in user's own uid and returns nothing for a
  // teacher — see TeacherExams.tsx for the same fix).
  const [allStudents, setAllStudents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    smartDb.getAll("Student", "").then(data => setAllStudents(Array.isArray(data) ? data : [])).catch(() => setAllStudents([]));
  }, []);
  const classStudents = useMemo(() => {
    // activeScope.grade comes from subject_assignments/homeroom and is
    // stored WITH the "Grade " prefix (e.g. "Grade 3"), but the real
    // Student.grade is stored bare (e.g. "3") — normName() alone (just
    // lowercase) never matched real records, so a teacher's own gradebook
    // could never find any students in their class at all.
    const canonGrade = (v: string) => normName(v).replace(/^grade\s*/, "").replace(/\s+/g, "");
    const g = canonGrade(activeScope.grade);
    const s = (activeScope.section || "").toUpperCase();
    return allStudents.filter(st => {
      const sg = canonGrade(String((st as any).grade ?? ""));
      const ss = String((st as any).section ?? "").toUpperCase();
      return sg === g && ss === s;
    }).map(st => ({
      id: String((st as any).id ?? (st as any).uid ?? ""),
      name: String((st as any).name ?? (st as any).displayName ?? "Student"),
      rollNo: String((st as any).rollNumber ?? (st as any).rollNo ?? ""),
      grade: activeScope.grade,
      section: activeScope.section,
    }));
  }, [allStudents, activeScope]);

  // Real marks (assignments + assessments + exams) — auto-pulled by the
  // engine, exactly like the admin Gradebook and student/parent portals.
  // Nothing here is entered or edited on this page.
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);
  useEffect(() => { loadGradebookSources().then(setGbSources).catch(() => setGbSources(null)); }, []);
  const band = useMemo(() => getBandForGrade(curriculum, activeScope.grade), [curriculum, activeScope.grade]);
  const columns = useMemo<AssessmentCol[]>(() => {
    if (!band) return FALLBACK_COLUMNS;
    return band.categories.map(cat => ({
      key: cat.name.toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+$/, ""),
      label: cat.name, max: cat.marks, weight: cat.marks,
    }));
  }, [band]);
  const maxTotal = useMemo(() => columns.reduce((a, c) => a + c.max, 0), [columns]);

  const rows = useMemo(() => {
    if (!subject) return [];
    return classStudents.map((s, idx) => {
      const sg = gbSources ? computeSubject(subject, s, band, gbSources) : null;
      const marks: Record<string, number | ""> = {};
      const autos: Record<string, number | ""> = {};
      const overridden: Record<string, boolean> = {};
      columns.forEach((c, ci) => {
        const comp = sg?.components[ci];
        const auto = comp && comp.hasData ? Math.round((comp.obtainedPct / 100) * c.max * 10) / 10 : "";
        const ov = overrides.find(o => o.studentId === s.id && o.columnKey === c.key);
        autos[c.key] = auto;
        marks[c.key] = ov ? ov.overrideValue : auto;
        overridden[c.key] = !!ov;
      });
      const hasData = !!sg?.hasData || Object.values(overridden).some(Boolean);
      const total = columns.reduce((a, c) => a + (Number(marks[c.key]) || 0), 0);
      const pct = hasData ? Math.round((total / (columns.reduce((a, c) => a + c.max, 0) || 1)) * 1000) / 10 : 0;
      return { id: s.id, name: s.name, rollNo: s.rollNo || String(idx + 1), marks, autos, overridden, total, pct, hasData };
    });
  }, [classStudents, subject, gbSources, band, columns, overrides]);

  const ranked = useMemo(() =>
    [...rows].sort((a, b) => b.pct - a.pct).map((r, i) => ({ ...r, rank: i + 1 })),
  [rows]);

  const graded = ranked.filter(r => r.hasData);
  const classAvgPct = graded.length ? graded.reduce((a, r) => a + r.pct, 0) / graded.length : 0;
  const above80 = graded.filter(r => r.pct >= 80).length;
  const below50 = graded.filter(r => r.pct < 50).length;

  const classAvgPerCol = useMemo(() => {
    const out: Record<string, number> = {};
    columns.forEach(c => {
      const vals = rows.filter(r => r.marks[c.key] !== "").map(r => Number(r.marks[c.key]));
      out[c.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return out;
  }, [rows, columns]);

  const gradeDist = useMemo(() => {
    const total = graded.length;
    if (total === 0) return [];
    const counts: Record<string, { count: number; hex: string }> = {};
    graded.forEach(r => {
      const g = gradeFromPct(r.pct);
      counts[g.letter] = counts[g.letter] || { count: 0, hex: g.hex };
      counts[g.letter].count++;
    });
    return Object.entries(counts).map(([letter, v]) => ({ letter, value: v.count, hex: v.hex, pct: Math.round((v.count / total) * 100) }));
  }, [graded]);

  const filteredRanked = useMemo(() => {
    if (!search.trim()) return ranked;
    const q = search.toLowerCase().trim();
    return ranked.filter(r => r.name.toLowerCase().includes(q) || r.rollNo.includes(q));
  }, [ranked, search]);

  function exportCsv() {
    const headers = ["Roll No", "Student Name", "Grade", "Section", "Subject", "Term",
      ...columns.map(c => `${c.label} (Max ${c.max})`), `Total (Max ${maxTotal})`, "Percentage (%)", "Grade Letter"];
    const sorted = [...ranked].sort((a, b) => Number(a.rollNo) - Number(b.rollNo));
    const body = sorted.map(r => [
      r.rollNo, `"${r.name}"`, `"${activeScope.grade}"`, `Section ${activeScope.section}`, `"${subject}"`, `"${term}"`,
      ...columns.map(c => (r.marks[c.key] === "" ? "" : r.marks[c.key])),
      r.total, r.pct.toFixed(1), gradeFromPct(r.pct).letter,
    ].join(","));
    const csv = "﻿" + [headers.join(","), ...body].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Gradebook_${subject}_${activeScope.grade}_${activeScope.section}_${term}.csv`.replace(/\s+/g, "_");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${sorted.length} students`);
  }

  const displaySectionLabel = activeScope.section ? `Section ${activeScope.section}` : "";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Gradebook</h1>
              <p className="text-sm text-slate-400">Real marks from Assignments, Assessments &amp; Exams</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Auto-calculated · click a mark to correct it
          </span>
        </div>

        {scopes.length === 0 ? (
          <Card className="border border-gray-100 shadow-sm"><CardContent className="p-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
            <p className="font-semibold text-gray-600">No classes assigned yet</p>
            <p className="text-sm text-gray-400 mt-1">Once you're assigned a homeroom or a subject in Subject Allocation, your classes will appear here.</p>
          </CardContent></Card>
        ) : (
        <>
          {/* Filter bar */}
          <Card className="border border-gray-100 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pl-0.5">Class</span>
                  <Select value={scopeKey} onValueChange={setScopeKey}>
                    <SelectTrigger className="h-9 w-48 text-sm border-gray-200 font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {scopes.map(s => (
                        <SelectItem key={`${s.grade}|${s.section}`} value={`${s.grade}|${s.section}`}>
                          {s.grade} · Section {s.section}{normName(s.grade) === normName(homeroom.grade) && normName(s.section) === normName(homeroom.section) ? " (Homeroom)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pl-0.5">Subject</span>
                  <Select value={subject} onValueChange={setSubject} disabled={subjectOptions.length === 0}>
                    <SelectTrigger className="h-9 w-44 text-sm border-gray-200 font-medium"><SelectValue placeholder="No subjects" /></SelectTrigger>
                    <SelectContent>{subjectOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pl-0.5">Term</span>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger className="h-9 w-36 text-sm border-gray-200 font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="h-9 w-px bg-gray-200 mx-1 self-end mb-0.5" />
                <div className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pl-0.5">Search Student</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <Input placeholder="Name or roll no…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-sm border-gray-200" />
                  </div>
                </div>
                <button onClick={exportCsv} disabled={ranked.length === 0}
                  className="self-end mb-0.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Approval workflow — Subject Teacher submits, Class Teacher reviews,
              Grade Coordinator gives final sign-off (visible on academics/Gradebook). */}
          {subject && (
            <Card className="border border-gray-100 shadow-sm">
              <CardContent className="p-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={cn("text-xs px-2.5 py-1 border font-semibold", submission ? SUBMISSION_STATUS_COLORS[submission.status] : SUBMISSION_STATUS_COLORS.Draft)}>
                    {submission?.status || "Draft"}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {submission?.subjectTeacherName && `Submitted by ${submission.subjectTeacherName}`}
                    {submission?.status === "Returned to Subject Teacher" && submission.returnReason && ` — "${submission.returnReason}"`}
                    {!submission && isMySubject && "Not submitted for review yet"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isMySubject && (!submission || submission.status === "Draft" || submission.status === "Returned to Subject Teacher") && (
                    <button onClick={handleSubmitToClassTeacher} disabled={workflowBusy}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-60">
                      <Send className="w-3.5 h-3.5" /> Submit to Class Teacher
                    </button>
                  )}
                  {isHomeroom && submission?.status === "Submitted to Class Teacher" && (
                    <>
                      <button onClick={() => setReturnOpen(true)} disabled={workflowBusy}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50">
                        <Undo2 className="w-3.5 h-3.5" /> Return
                      </button>
                      <button onClick={handleClassTeacherApprove} disabled={workflowBusy}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60">
                        <ShieldCheck className="w-3.5 h-3.5" /> Approve &amp; Send to Grade Coordinator
                      </button>
                    </>
                  )}
                  {submission && submission.history.length > 0 && (
                    <button onClick={() => toast.message(submission.history.map(h => `${h.action} — ${h.by}`).join("\n"))}
                      className="flex items-center gap-1.5 h-8 px-2 text-gray-400 hover:text-gray-600" title="History">
                      <History className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!subject ? (
            <Card className="border border-gray-100 shadow-sm"><CardContent className="p-16 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="font-semibold text-gray-600">No subject to show yet</p>
              <p className="text-sm text-gray-400 mt-1">You aren't assigned a subject in {activeScope.grade} · {displaySectionLabel} in Subject Allocation.</p>
            </CardContent></Card>
          ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon={Users} label="Students" value={String(classStudents.length)} sub={`${activeScope.grade} · ${displaySectionLabel}`} color="text-purple-600" bg="bg-violet-50" />
              <KPI icon={TrendingUp} label="Class Average" value={graded.length ? `${classAvgPct.toFixed(1)}%` : "—"} sub={`${subject} · ${term}`} color="text-amber-600" bg="bg-amber-50" />
              <KPI icon={CheckCircle2} label="Above 80%" value={String(above80)} sub={graded.length ? `${Math.round((above80 / graded.length) * 100)}% of graded` : "—"} color="text-emerald-600" bg="bg-emerald-50" />
              <KPI icon={AlertTriangle} label="Below 50%" value={String(below50)} sub={graded.length ? `${Math.round((below50 / graded.length) * 100)}% at risk` : "—"} color="text-red-500" bg="bg-red-50" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
              {/* Table */}
              <Card className="xl:col-span-3 border border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <p className="font-bold text-gray-900 text-sm">{subject}</p>
                    <span className="text-xs font-semibold text-purple-600 bg-indigo-50 rounded-md px-2 py-0.5">{activeScope.grade} · {displaySectionLabel}</span>
                    <span className="text-xs text-gray-400">{filteredRanked.length} student{filteredRanked.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/50">
                          <th className="text-left py-2.5 px-3 sticky left-0 bg-gray-50/80 min-w-[48px]"><span className="text-[10px] font-bold uppercase text-gray-400">#</span></th>
                          <th className="text-left py-2.5 pr-3 sticky left-10 bg-gray-50/80 min-w-[160px]"><span className="text-[10px] font-bold uppercase text-gray-400">Student</span></th>
                          {columns.map(c => (
                            <th key={c.key} className="px-2 py-2.5 text-center min-w-[70px]"><p className="text-[11px] font-bold text-gray-700 whitespace-nowrap">{c.label}</p></th>
                          ))}
                          <th className="px-2 py-2.5 text-center min-w-[56px]"><p className="text-[11px] font-bold text-gray-700">Total</p></th>
                          <th className="px-2 py-2.5 text-center min-w-[52px]"><p className="text-[11px] font-bold text-gray-700">Grade</p></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRanked.length === 0 && (
                          <tr><td colSpan={columns.length + 4} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-2 text-gray-400">
                              <Users className="w-10 h-10 opacity-30" />
                              <p className="text-sm font-semibold text-gray-500">No students enrolled</p>
                              <p className="text-xs">{search ? `No results for "${search}"` : `No students in ${activeScope.grade} · ${displaySectionLabel}`}</p>
                            </div>
                          </td></tr>
                        )}
                        {filteredRanked.slice().sort((a, b) => Number(a.rollNo) - Number(b.rollNo)).map(r => {
                          const g = gradeFromPct(r.pct);
                          return (
                            <tr key={r.id} className="border-b border-gray-50 hover:bg-indigo-50/20 transition-colors">
                              <td className="py-2.5 px-3 sticky left-0 bg-white"><span className="text-xs font-bold text-gray-400">{r.rollNo}</span></td>
                              <td className="py-2.5 pr-3 sticky left-10 bg-white"><p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">{r.name}</p></td>
                              {columns.map(c => (
                                <td key={c.key} className="px-2 py-2 text-center">
                                  {isMySubject ? (
                                    <button
                                      onClick={() => {
                                        setOverrideCell({ studentId: r.id, studentName: r.name, columnKey: c.key, columnLabel: c.label, original: r.autos[c.key] === "" ? null : Number(r.autos[c.key]) });
                                        setOverrideValue(r.marks[c.key] === "" ? "" : String(r.marks[c.key]));
                                        setOverrideReason("");
                                      }}
                                      className={cn("inline-flex items-center gap-1 font-semibold rounded px-1.5 py-0.5 hover:bg-indigo-50 transition-colors",
                                        r.overridden[c.key] ? "text-amber-700 bg-amber-50" : "text-gray-900")}
                                      title={r.overridden[c.key] ? "Manually corrected — click to edit" : "Click to manually correct this mark"}
                                    >
                                      {r.marks[c.key] === "" ? <span className="text-gray-300">—</span> : r.marks[c.key]}
                                      {r.overridden[c.key] && <Pencil className="h-2.5 w-2.5" />}
                                    </button>
                                  ) : (
                                    <span className="text-gray-900 font-semibold">{r.marks[c.key] === "" ? <span className="text-gray-300" title="Not marked yet">—</span> : r.marks[c.key]}</span>
                                  )}
                                </td>
                              ))}
                              <td className="px-2 py-2.5 text-center"><p className="text-sm font-bold text-gray-900">{r.hasData ? r.total : "—"}</p></td>
                              <td className="px-2 py-2.5 text-center"><span className={cn("inline-flex items-center justify-center text-xs font-bold rounded-md border px-2 py-0.5", g.bg)}>{g.letter}</span></td>
                            </tr>
                          );
                        })}
                        {rows.length > 0 && (
                          <tr className="bg-indigo-50/40 border-t-2 border-indigo-100">
                            <td className="py-3 px-3 sticky left-0 bg-indigo-50/40"><span className="text-[10px] font-bold text-gray-400 uppercase">Avg</span></td>
                            <td className="py-3 pr-3 sticky left-10 bg-indigo-50/40"><span className="text-sm font-bold text-gray-900">Class Average</span></td>
                            {columns.map(c => (
                              <td key={c.key} className="px-2 py-3 text-center"><p className="text-sm font-bold text-gray-900">{classAvgPerCol[c.key].toFixed(1)}</p></td>
                            ))}
                            <td className="px-2 py-3 text-center"><p className="text-sm font-bold text-gray-900">{Object.values(classAvgPerCol).reduce((a, b) => a + b, 0).toFixed(1)}</p></td>
                            <td className="px-2 py-3 text-center"><span className={cn("inline-flex text-xs font-bold rounded-md border px-2 py-0.5", gradeFromPct(classAvgPct).bg)}>{gradeFromPct(classAvgPct).letter}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3">Marks are auto-calculated from real assignments, assessments and exam marks · read-only</p>
                </CardContent>
              </Card>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card className="border border-gray-100 shadow-sm">
                  <CardContent className="p-4">
                    <p className="font-bold text-gray-900 text-sm mb-0.5">Grade Distribution</p>
                    <p className="text-[10px] text-gray-400 mb-3">{activeScope.grade} · {displaySectionLabel} · {subject}</p>
                    {gradeDist.length === 0 ? (
                      <p className="text-xs text-gray-400 py-8 text-center">No graded students yet</p>
                    ) : (
                      <>
                        <div className="relative h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={gradeDist} dataKey="value" nameKey="letter" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                                {gradeDist.map((d, i) => <Cell key={i} fill={d.hex} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <p className="text-xl font-bold text-gray-900">{graded.length}</p>
                            <p className="text-[10px] text-gray-400">Graded</p>
                          </div>
                        </div>
                        <div className="space-y-1.5 mt-2">
                          {gradeDist.map(d => (
                            <div key={d.letter} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.hex }} />
                                <span className="text-xs text-gray-600">{d.letter}</span>
                              </div>
                              <span className="text-xs font-bold text-gray-900">{d.value} ({d.pct}%)</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-gray-100 shadow-sm">
                  <CardContent className="p-4">
                    <p className="font-bold text-gray-900 text-sm mb-3">Top 5 Students</p>
                    {graded.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center">No graded students yet</p>
                    ) : (
                      <div className="space-y-2">
                        {graded.slice(0, 5).map((r, i) => (
                          <div key={r.id} className="flex items-center gap-2.5">
                            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-400")}>
                              {i < 3 ? <Trophy className="w-3 h-3" /> : i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{r.name}</p>
                              <p className="text-[10px] text-gray-400">Roll #{r.rollNo}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn("text-xs font-bold", pctColor(r.pct))}>{r.pct.toFixed(1)}%</span>
                              <span className={cn("text-[10px] font-bold rounded border px-1.5 py-0.5", gradeFromPct(r.pct).bg)}>{gradeFromPct(r.pct).letter}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
          )}
        </>
        )}
      </div>

      {/* Manual mark correction */}
      <Dialog open={!!overrideCell} onOpenChange={(o) => !o && setOverrideCell(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Correct a Mark</DialogTitle>
          </DialogHeader>
          {overrideCell && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                {overrideCell.studentName} — <span className="font-semibold">{overrideCell.columnLabel}</span>
              </p>
              <p className="text-xs text-gray-400">
                Auto-calculated value: {overrideCell.original === null ? "not marked yet" : overrideCell.original}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="ov-value">Corrected Value *</Label>
                <Input id="ov-value" type="number" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} placeholder="Enter the correct mark" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ov-reason">Reason *</Label>
                <Textarea id="ov-reason" rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why is this being corrected? (e.g. re-checked answer sheet, entry error)" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setOverrideCell(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">Cancel</button>
            <button onClick={saveOverride} disabled={savingOverride}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60">
              {savingOverride ? "Saving…" : "Save Correction"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to subject teacher */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Return for Corrections</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="return-reason">What needs to be corrected? *</Label>
            <Textarea id="return-reason" rows={3} className="mt-2" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Explain what the subject teacher should fix…" />
          </div>
          <DialogFooter>
            <button onClick={() => setReturnOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">Cancel</button>
            <button onClick={handleClassTeacherReturn} disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60">
              Return to Subject Teacher
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
