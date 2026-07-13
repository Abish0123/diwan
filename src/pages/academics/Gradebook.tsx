import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade, getPeriodLabels, type GradebookCategory } from "@/lib/curriculumConfig";
import { useGradebookStructure } from "@/hooks/useGradebookStructure";
import { useAuth } from "@/hooks/useAuth";
import { getRole, resolveRoleId } from "@/lib/roles";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import {
  loadGradebookSources, computeSubject, computeClassGradebook,
  type GradebookSources,
} from "@/lib/gradebookEngine";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, TrendingUp, CheckCircle2, AlertTriangle,
  Settings2, RotateCcw, Plus, X as XIcon, Download, ChevronRight,
  Trophy, Search, ListChecks, BarChart3, Medal, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudents } from "@/contexts/StudentContext";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { smartDb } from "@/lib/localDb";
import {
  GradebookSubmission, SUBMISSION_STATUS_COLORS, getSubmission, gradeCoordinatorApprove,
  principalApprove, getPrincipalName,
} from "@/lib/gradebookApproval";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AssessmentCol { key: string; label: string; max: number; weight: number }
type Tab = "marks" | "results" | "analytics" | "rankings";

const TABS: { key: Tab; label: string; icon: typeof ListChecks }[] = [
  { key: "marks",     label: "Marks",     icon: BookOpen },
  { key: "results",   label: "Results",   icon: ListChecks },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "rankings",  label: "Rankings",  icon: Medal },
];

const TAB_LABEL_KEYS: Record<Tab, string> = {
  marks: "admin.academics.gradebook.tabMarks",
  results: "admin.academics.gradebook.tabResults",
  analytics: "admin.academics.gradebook.tabAnalytics",
  rankings: "admin.academics.gradebook.tabRankings",
};

const SUBMISSION_STATUS_LABEL_KEYS: Record<GradebookSubmission["status"], string> = {
  "Draft": "admin.academics.gradebook.statusDraft",
  "Submitted to Class Teacher": "admin.academics.gradebook.statusSubmittedToClassTeacher",
  "Returned to Subject Teacher": "admin.academics.gradebook.statusReturnedToSubjectTeacher",
  "Submitted to Grade Coordinator": "admin.academics.gradebook.statusSubmittedToGradeCoordinator",
  "Submitted to Principal": "admin.academics.gradebook.statusSubmittedToPrincipal",
  "Approved by Principal": "admin.academics.gradebook.statusApprovedByPrincipal",
};

// Fallback columns used only if curriculum band lookup fails
const FALLBACK_COLUMNS: AssessmentCol[] = [
  { key: "assignments", label: "Assignments", max: 15, weight: 15 },
  { key: "quizzes",     label: "Quizzes",     max: 10, weight: 10 },
  { key: "projects",    label: "Projects",    max: 10, weight: 10 },
  { key: "assessments", label: "Assessments", max: 20, weight: 20 },
  { key: "term_exam",   label: "Term Exam",   max: 45, weight: 45 },
];

// English column-key -> translation key, used to render translated labels for
// the fallback columns (whose `key`/`label` fields are also used as data keys
// in logic, so the underlying identifiers must stay in English).
const FALLBACK_COLUMN_LABEL_KEYS: Record<string, string> = {
  assignments: "admin.academics.gradebook.colAssignments",
  quizzes: "admin.academics.gradebook.colQuizzes",
  projects: "admin.academics.gradebook.colProjects",
  assessments: "admin.academics.gradebook.colAssessments",
  term_exam: "admin.academics.gradebook.colTermExam",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "#10B981", "A": "#6C3BFF", "B+": "#3B82F6", "B": "#8B5CF6", "C": "#F59E0B", "D": "#EF4444", "F": "#DC2626",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rowTotal = (marks: Record<string,number|string>, cols: AssessmentCol[]) =>
  cols.reduce((s, c) => s + (Number(marks[c.key]) || 0), 0);
const maxTotal = (cols: AssessmentCol[]) => cols.reduce((s, c) => s + c.max, 0);

function gradeFromPct(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "D";
}
function gradeBadge(g: string) {
  switch (g) {
    case "A+": return "bg-emerald-100 text-emerald-700";
    case "A":  return "bg-violet-100 text-violet-700";
    case "B+": return "bg-blue-100 text-blue-700";
    case "B":  return "bg-indigo-100 text-indigo-700";
    case "C":  return "bg-amber-100 text-amber-700";
    default:   return "bg-rose-100 text-rose-700";
  }
}
function subjectShort(s: string) { return s.length > 6 ? s.slice(0, 6) + "…" : s; }

// ─── Donut Chart ─────────────────────────────────────────────────────────────
function DonutChart({ data, total, label = "Students" }: { data: { label: string; value: number; color: string }[]; total: number; label?: string }) {
  let offset = 0;
  const r = 40, circ = 2 * Math.PI * r;
  const slices = data.map(d => {
    const dash = total > 0 ? (d.value / total) * circ : 0;
    const s = { ...d, dash, offset };
    offset += dash;
    return s;
  });
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
      {slices.map((s, i) => (
        <circle key={i} cx="50" cy="50" r={r} fill="none"
          stroke={s.color} strokeWidth="14"
          strokeDasharray={`${s.dash} ${circ - s.dash}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 50 50)" strokeLinecap="butt" />
      ))}
      <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">{total}</text>
      <text x="50" y="60" textAnchor="middle" fontSize="7.5" fill="#94a3b8">{label}</text>
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, sub, bg, ic }: {
  icon: typeof Users; label: string; value: string; sub: string; bg: string; ic: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
          <Icon className={cn("h-5 w-5", ic)} />
        </div>
        <span className="text-xs text-slate-500 font-medium leading-tight">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Gradebook() {
  const { t } = useTranslation();
  const colLabel = (c: AssessmentCol) => FALLBACK_COLUMN_LABEL_KEYS[c.key] ? t(FALLBACK_COLUMN_LABEL_KEYS[c.key]) : c.label;
  const { curriculum } = useCurriculum();
  const { role, user } = useAuth();
  const canConfigureStructure = getRole(role).full === true;

  // Derived from active curriculum
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // A coordinator only ever gets their own grade in the picker — same
  // restriction as the Classes module, applied here since Gradebook has its
  // own independent grade selector rather than reading one from a shared
  // scoped source.
  const GRADES = isGradeCoordinator
    ? (coordAssignedGrade ? [coordAssignedGrade] : [])
    : curriculum.grades;
  const TERMS  = getPeriodLabels(curriculum);

  const [tab,     setTab]     = useState<Tab>("marks");
  const [term,    setTerm]    = useState(() => TERMS[0] ?? "Term 1");
  const [grade,   setGrade]   = useState(() => (isGradeCoordinator ? coordAssignedGrade : null) ?? curriculum.primary[0] ?? GRADES[3] ?? "Grade 1");
  const [section, setSection] = useState("A");
  const [subject, setSubject] = useState("");
  const [search,  setSearch]  = useState("");

  // Reset grade & term when curriculum changes (e.g. after school switches curriculum)
  useEffect(() => {
    setTerm(TERMS[0] ?? "Term 1");
    if (isGradeCoordinator) return;
    setGrade(g => GRADES.includes(g) ? g : (curriculum.primary[0] ?? GRADES[0]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculum.id]);

  // `coordAssignedGrade` comes from an async query (useGradeCoordinator) that
  // hasn't resolved yet on first render — the `grade` state above gets
  // initialized from curriculum.primary[0] before the coordinator's real
  // assigned grade is known. Without this effect, `grade` stays stuck on
  // that wrong default forever (the effect above only re-runs on curriculum
  // change), so a Grade Coordinator's own students never appear: every
  // student-matching computation below filters by the wrong grade.
  useEffect(() => {
    if (isGradeCoordinator && coordAssignedGrade) setGrade(coordAssignedGrade);
  }, [isGradeCoordinator, coordAssignedGrade]);

  // Curriculum defines the DEFAULT structure for this grade's band; a school
  // can override it (categories/weights) via "Configure Structure" below —
  // the curriculum guides the structure, it doesn't permanently lock it.
  const curriculumBand = useMemo(() => getBandForGrade(curriculum, grade), [curriculum, grade]);
  const { effectiveCategories, isCustomized, saveStructure, resetToDefault } =
    useGradebookStructure(curriculum.id, curriculumBand);

  const columns = useMemo<AssessmentCol[]>(() => {
    if (!curriculumBand) return FALLBACK_COLUMNS;
    if (effectiveCategories.length === 0) return FALLBACK_COLUMNS;
    return effectiveCategories.map(cat => ({
      key:    cat.name.toLowerCase().replace(/[\s/()]+/g, '_').replace(/_+$/, ''),
      label:  cat.name,
      max:    cat.marks,
      weight: cat.marks,
    }));
  }, [curriculumBand, effectiveCategories]);
  const [structureOpen, setStructureOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState<GradebookCategory[]>([]);
  const openStructureEditor = () => {
    setDraftCategories(effectiveCategories.map(c => ({ ...c })));
    setStructureOpen(true);
  };
  const draftTotal = draftCategories.reduce((s, c) => s + (Number(c.marks) || 0), 0);
  const updateDraftCategory = (i: number, patch: Partial<GradebookCategory>) => {
    setDraftCategories(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  };
  const removeDraftCategory = (i: number) => setDraftCategories(prev => prev.filter((_, idx) => idx !== i));
  const addDraftCategory = () => setDraftCategories(prev => [...prev, { name: t('admin.academics.gradebook.newCategoryDefaultName'), count: null, marks: 0, isExam: false }]);
  const handleSaveStructure = async () => {
    if (draftCategories.length === 0) { toast.error(t('admin.academics.gradebook.toastAddCategory')); return; }
    if (draftCategories.some(c => !c.name.trim())) { toast.error(t('admin.academics.gradebook.toastCategoryNeedsName')); return; }
    await saveStructure(draftCategories);
    setStructureOpen(false);
    toast.success(t('admin.academics.gradebook.toastStructureUpdated', { band: curriculumBand?.label ?? grade }));
  };
  const handleResetStructure = async () => {
    await resetToDefault();
    setResetConfirmOpen(false);
    setStructureOpen(false);
    toast.success(t('admin.academics.gradebook.toastResetDefault', { curriculum: curriculum.shortName }));
  };
  const { students: liveStudents } = useStudents();

  // Real subject-teacher assignments — same source /academics/subjects reads
  // (the subject_assignments table: one row per grade+section+subject with
  // the teacher actually assigned to teach it), unscoped so admin/grade
  // coordinators see every assignment regardless of who created it.
  const [subjectAssignments, setSubjectAssignments] = useState<{ grade: string; section: string; subject: string; teacherName: string }[]>([]);
  useEffect(() => {
    smartDb.getAll("subject_assignments", undefined).then((rows: any[]) => {
      setSubjectAssignments(Array.isArray(rows) ? rows : []);
    }).catch(() => setSubjectAssignments([]));
  }, []);

  // Real sections — only the ones actually enrolled for the selected grade
  // (previously a fixed ["All","A","B","C","D"] regardless of grade, which
  // showed sections that don't exist for grades with fewer real sections).
  // Matched via canonGrade, not bare string equality — some student records
  // store grade as bare "3" instead of "Grade 3"; a strict-equality compare
  // against a normalized "Grade 3" selector silently dropped those students.
  const SECTIONS = useMemo(() => {
    const wantGrade = canonGrade(grade);
    const real = new Set<string>();
    liveStudents.forEach(s => {
      if (canonGrade(s.grade) === wantGrade && s.section) {
        real.add(canonSection(s.section));
      }
    });
    return ["All", ...Array.from(real).sort()];
  }, [liveStudents, grade]);

  // Real subjects — only subjects that actually have a teacher assigned for
  // THIS exact grade + section in Subject Allocation (previously showed
  // every subject the curriculum allows for the grade band, regardless of
  // whether anyone teaches it in this specific section, or even whether the
  // section itself exists).
  const SUBJECTS = useMemo(() => {
    const wantGrade = canonGrade(grade);
    const wantSection = section === "All" ? null : section.toUpperCase();
    const forSection = subjectAssignments.filter(a =>
      canonGrade(a.grade) === wantGrade &&
      (wantSection === null || String(a.section || "").trim().toUpperCase() === wantSection || String(a.section || "").trim().toLowerCase() === "all sections")
    );
    const names = Array.from(new Set(forSection.map(a => a.subject))).sort();
    return names.length ? names : (subjectAssignments.length ? [] : [subject]);
  }, [subjectAssignments, grade, section, subject]);

  // Keep the selected section/subject valid whenever the grade (or the real
  // data behind these lists) changes — never leave the picker pointed at a
  // section/subject that doesn't actually exist for this grade.
  useEffect(() => {
    if (!SECTIONS.includes(section)) setSection(SECTIONS[1] ?? "All");
  }, [SECTIONS, section]);
  useEffect(() => {
    if (!SUBJECTS.includes(subject)) setSubject(SUBJECTS[0] ?? "");
  }, [SUBJECTS, subject]);

  // Grade Coordinator escalation + Principal final-approval — the last two
  // steps of the Subject Teacher -> Class Teacher -> Grade Coordinator ->
  // Principal sign-off chain. Both roles use this exact page (Grade
  // Coordinator scoped to their own grade, Principal school-wide); this is
  // purely a read + one action, the marks table above stays untouched.
  const [submission, setSubmission] = useState<GradebookSubmission | null>(null);
  const [approving, setApproving] = useState(false);
  const isPrincipal = resolveRoleId(role) === "principal";
  const canEscalateToPrincipal = isGradeCoordinator && coordAssignedGrade === grade;
  const canGiveFinalApproval = isPrincipal;
  useEffect(() => {
    if (tab !== "marks" || !subject) { setSubmission(null); return; }
    getSubmission(grade, section === "All" ? (SECTIONS[1] || section) : section, subject, term)
      .then(setSubmission).catch(() => setSubmission(null));
  }, [tab, grade, section, subject, term, SECTIONS]);

  const handleEscalateToPrincipal = async () => {
    if (!submission) return;
    setApproving(true);
    try {
      const name = (user as any)?.displayName || (user as any)?.name || "Grade Coordinator";
      const principalName = await getPrincipalName();
      const updated = await gradeCoordinatorApprove(submission, name, principalName || undefined);
      setSubmission(updated);
      toast.success(principalName ? t('admin.academics.gradebook.toastSentToPrincipal', { principalName }) : t('admin.academics.gradebook.toastApprovedNoPrincipal'));
    } catch {
      toast.error(t('admin.academics.gradebook.toastApprovalFailed'));
    } finally {
      setApproving(false);
    }
  };

  const handleFinalApprove = async () => {
    if (!submission) return;
    setApproving(true);
    try {
      const name = (user as any)?.displayName || (user as any)?.name || "Principal";
      const updated = await principalApprove(submission, name);
      setSubmission(updated);
      toast.success(t('admin.academics.gradebook.toastFinalApprovalRecorded'));
    } catch {
      toast.error(t('admin.academics.gradebook.toastApprovalFailed'));
    } finally {
      setApproving(false);
    }
  };

  // Real marks (assignments + assessments + exams) — auto-pulled by the engine.
  // The gradebook never stores marks itself; it computes them from the source stores.
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);
  useEffect(() => { loadGradebookSources().then(setGbSources).catch(() => setGbSources(null)); }, []);
  const band = curriculumBand;

  // Live students for grade + section — matched via canonGrade/canonSection,
  // not bare string equality. Some student records store grade as bare "3"
  // instead of "Grade 3" (or vice versa); a strict-equality compare against
  // the normalized grade selector silently excluded those students entirely
  // — this was why an assigned Grade Coordinator's own class could appear
  // empty here.
  const filteredLiveStudents = useMemo(() => {
    const wantGrade = canonGrade(grade);
    return liveStudents.filter(s => {
      if (!s.grade) return false;
      const gradeMatch = canonGrade(s.grade) === wantGrade;
      if (section === "All") return gradeMatch;
      return gradeMatch && canonSection(s.section) === canonSection(section);
    });
  }, [liveStudents, grade, section]);

  const rollOf = useMemo(() => {
    const map = new Map<string, string>();
    filteredLiveStudents.forEach((s, idx) => map.set(String(s.id), s.rollNumber || String(idx + 1)));
    return map;
  }, [filteredLiveStudents]);

  // ── Marks tab: single-subject grid (existing behaviour) ──
  const studentRows = useMemo(() => {
    return filteredLiveStudents.map((s, idx) => {
      const rowMarks: Record<string, number | string> = {};
      // Auto-pull each component from the engine (assignment/assessment/exam),
      // mapped to the band columns by position. No fabrication, no manual entry.
      const sg = gbSources
        ? computeSubject(subject, { id: String(s.id), name: s.name, grade: s.grade || grade, section: s.section || section }, band, gbSources, term)
        : null;
      columns.forEach((c, ci) => {
        const comp = sg?.components[ci];
        rowMarks[c.key] = comp && comp.hasData ? Math.round((comp.obtainedPct / 100) * c.max * 10) / 10 : "";
      });
      const rollNo = s.rollNumber || String(idx + 1);
      return { id: s.id, name: s.name, rollNo, marks: rowMarks };
    });
  }, [filteredLiveStudents, columns, subject, band, gbSources, grade, section, term]);

  const max = useMemo(() => maxTotal(columns), [columns]);

  const byRoll = useMemo(() =>
    [...studentRows]
      .map(s => { const total = rowTotal(s.marks, columns); return { ...s, total, pct: Math.round((total / max) * 1000) / 10 }; })
      .sort((a, b) => Number(a.rollNo) - Number(b.rollNo))
  , [studentRows, columns, max]);

  const classAvg = useMemo(() => {
    const avgPerCol: Record<string, number> = {};
    columns.forEach(c => {
      const sum = studentRows.reduce((a, s) => a + (Number(s.marks[c.key]) || 0), 0);
      avgPerCol[c.key] = Math.round((sum / Math.max(studentRows.length, 1)) * 10) / 10;
    });
    const totalAvg = Object.values(avgPerCol).reduce((a, b) => a + b, 0);
    return { avgPerCol, totalAvg: Math.round(totalAvg * 10) / 10, pct: Math.round((totalAvg / max) * 1000) / 10 };
  }, [studentRows, columns, max]);

  const liveStats = useMemo(() => {
    const total = byRoll.length;
    const above80 = byRoll.filter(s => s.pct >= 80).length;
    const below50 = byRoll.filter(s => s.pct < 50).length;
    return { totalStudents: total, above80, below50,
      above80Pct: total ? Math.round(above80/total*100) : 0,
      below50Pct: total ? Math.round(below50/total*100) : 0 };
  }, [byRoll]);

  const filteredByRoll = useMemo(() => {
    if (!search.trim()) return byRoll;
    const q = search.toLowerCase().trim();
    return byRoll.filter(s => s.name.toLowerCase().includes(q) || s.rollNo.includes(q));
  }, [byRoll, search]);

  // ── Results / Analytics / Rankings: whole-class, all-subjects (real engine data) ──
  const classGradebook = useMemo(() => {
    if (!gbSources) return [];
    return computeClassGradebook(
      filteredLiveStudents.map(s => ({ id: String(s.id), name: s.name, grade: s.grade || grade, section: s.section || section })),
      band, gbSources, SUBJECTS, term
    );
  }, [gbSources, filteredLiveStudents, band, grade, section, term]);

  const resultsByRoll = useMemo(() =>
    [...classGradebook].sort((a, b) => Number(rollOf.get(a.studentId) ?? 0) - Number(rollOf.get(b.studentId) ?? 0))
  , [classGradebook, rollOf]);

  const filteredResults = useMemo(() => {
    if (!search.trim()) return resultsByRoll;
    const q = search.toLowerCase().trim();
    return resultsByRoll.filter(s => s.name.toLowerCase().includes(q) || (rollOf.get(s.studentId) ?? "").includes(q));
  }, [resultsByRoll, search, rollOf]);

  const rankedClass = useMemo(() => [...classGradebook].sort((a, b) => a.rank - b.rank), [classGradebook]);
  const filteredRanked = useMemo(() => {
    if (!search.trim()) return rankedClass;
    const q = search.toLowerCase().trim();
    return rankedClass.filter(s => s.name.toLowerCase().includes(q) || (rollOf.get(s.studentId) ?? "").includes(q));
  }, [rankedClass, search, rollOf]);

  // Subject-wise class average — only subjects with at least one real mark, no fabricated bars.
  const subjectAverages = useMemo(() => {
    return SUBJECTS.map(subj => {
      const data = classGradebook
        .map(cg => cg.subjects.find(s => s.subject === subj))
        .filter((s): s is NonNullable<typeof s> => !!s && s.hasData);
      const avg = data.length ? Math.round(data.reduce((a, s) => a + s.percentage, 0) / data.length) : 0;
      return { subject: subj, avg, count: data.length };
    }).filter(x => x.count > 0).sort((a, b) => b.avg - a.avg);
  }, [classGradebook]);

  // Overall grade distribution across every graded student (not just one subject).
  const overallGradeDist = useMemo(() => {
    const graded = classGradebook.filter(cg => cg.subjects.some(s => s.hasData));
    const counts: Record<string, number> = {};
    graded.forEach(cg => { counts[cg.overallLetter] = (counts[cg.overallLetter] || 0) + 1; });
    return (["A+","A","B+","B","C","D","F"] as const)
      .map(g => ({ label: g, value: counts[g] || 0, color: GRADE_COLORS[g] }))
      .filter(d => d.value > 0);
  }, [classGradebook]);

  const gradedCount = classGradebook.filter(cg => cg.subjects.some(s => s.hasData)).length;
  const overallClassAvg = gradedCount
    ? Math.round(classGradebook.reduce((a, cg) => a + cg.overallPercentage, 0) / gradedCount)
    : 0;
  const overallPassRate = gradedCount
    ? Math.round(classGradebook.filter(cg => cg.overallPercentage >= 50).length / gradedCount * 100)
    : 0;

  // ── Export: UTF-8 BOM so Excel opens it correctly with full column data ──
  const exportCsv = () => {
    const headers = [
      t('admin.academics.gradebook.csvRollNo'), t('admin.academics.gradebook.csvStudentName'), t('admin.academics.gradebook.csvGrade'), t('admin.academics.gradebook.csvSection'), t('admin.academics.gradebook.csvSubject'), t('admin.academics.gradebook.csvTerm'),
      ...columns.map(c => `${colLabel(c)} (Max ${c.max})`),
      `${t('admin.academics.gradebook.csvTotal')} (Max ${max})`, t('admin.academics.gradebook.csvPercentage'), t('admin.academics.gradebook.csvGradeLetter'),
    ];
    const rows = byRoll.map(s => [
      s.rollNo,
      `"${s.name}"`,
      `"${grade}"`,
      section === "All" ? t('admin.academics.gradebook.allSections') : `${t('admin.academics.gradebook.sectionPrefix')} ${section}`,
      `"${subject}"`,
      `"${term}"`,
      ...columns.map(c => (s.marks[c.key] === "" ? "" : (s.marks[c.key] ?? 0))),
      s.total, s.pct, gradeFromPct(s.pct),
    ].join(","));

    const avgRow = [
      "", `"${t('admin.academics.gradebook.classAverage')}"`, `"${grade}"`,
      section === "All" ? t('admin.academics.gradebook.allSections') : `${t('admin.academics.gradebook.sectionPrefix')} ${section}`,
      `"${subject}"`, `"${term}"`,
      ...columns.map(c => classAvg.avgPerCol[c.key] ?? 0),
      classAvg.totalAvg, classAvg.pct, gradeFromPct(classAvg.pct),
    ].join(",");

    // UTF-8 BOM (﻿) ensures Excel reads special characters correctly
    const csv = "﻿" + [headers.join(","), ...rows, avgRow].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Gradebook_${subject}_${grade}_${section === "All" ? "AllSections" : "Sec" + section}_${term}.csv`.replace(/ /g, "_");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success(t('admin.academics.gradebook.toastExportedStudents', { count: byRoll.length }));
  };

  const exportResultsCsv = () => {
    const headers = [t('admin.academics.gradebook.csvRollNo'), t('admin.academics.gradebook.csvStudentName'), t('admin.academics.gradebook.csvGrade'), t('admin.academics.gradebook.csvSection'), t('admin.academics.gradebook.csvTerm'), ...SUBJECTS, t('admin.academics.gradebook.csvOverallPct'), t('admin.academics.gradebook.csvOverallGrade')];
    const rows = resultsByRoll.map(s => [
      rollOf.get(s.studentId) ?? "", `"${s.name}"`, `"${grade}"`,
      section === "All" ? t('admin.academics.gradebook.allSections') : `${t('admin.academics.gradebook.sectionPrefix')} ${section}`, `"${term}"`,
      ...SUBJECTS.map(subj => { const sg = s.subjects.find(x => x.subject === subj); return sg?.hasData ? Math.round(sg.percentage) : ""; }),
      Math.round(s.overallPercentage), s.overallLetter,
    ].join(","));
    const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Gradebook_Results_${grade}_${section === "All" ? "AllSections" : "Sec" + section}_${term}.csv`.replace(/ /g, "_");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success(t('admin.academics.gradebook.toastExportedStudents', { count: resultsByRoll.length }));
  };

  const displaySectionLabel = section === "All" ? t('admin.academics.gradebook.allSections') : `${t('admin.academics.gradebook.sectionPrefix')} ${section}`;

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.gradebook.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.academics.gradebook.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canConfigureStructure && (
              <button onClick={openStructureEditor}
                className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Settings2 className="h-4 w-4 text-slate-500" /> {t('admin.academics.gradebook.configureStructure')}
                {isCustomized && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
              </button>
            )}
            <button onClick={tab === "results" ? exportResultsCsv : exportCsv}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Download className="h-4 w-4" /> {t('admin.academics.gradebook.exportCsv')}
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI icon={Users} label={t('admin.academics.gradebook.kpiStudents')} value={String(liveStats.totalStudents)} sub={`${grade} · ${displaySectionLabel}`} bg="bg-violet-50" ic="text-violet-500" />
          <KPI icon={TrendingUp} label={t('admin.academics.gradebook.kpiClassAverage')} value={`${classAvg.pct}%`} sub={`${subject} · ${term}`} bg="bg-blue-50" ic="text-blue-500" />
          <KPI icon={CheckCircle2} label={t('admin.academics.gradebook.kpiAbove80')} value={String(liveStats.above80)} sub={t('admin.academics.gradebook.kpiPercentOfClass', { pct: liveStats.above80Pct })} bg="bg-emerald-50" ic="text-emerald-500" />
          <KPI icon={AlertTriangle} label={t('admin.academics.gradebook.kpiBelow50')} value={String(liveStats.below50)} sub={t('admin.academics.gradebook.kpiPercentAtRisk', { pct: liveStats.below50Pct })} bg="bg-rose-50" ic="text-rose-500" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-100">
          {TABS.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={cn("flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === tb.key ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
              <tb.icon className="h-3.5 w-3.5" /> {t(TAB_LABEL_KEYS[tb.key])}
            </button>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.gradebook.filterTerm')}</label>
            <select value={term} onChange={e => setTerm(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-300">
              {TERMS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.gradebook.filterGrade')}</label>
            <select value={grade} onChange={e => setGrade(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-300">
              {GRADES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.gradebook.filterSection')}</label>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-300">
              {SECTIONS.map(o => <option key={o} value={o}>{o === "All" ? t('admin.academics.gradebook.allSections') : `${t('admin.academics.gradebook.sectionPrefix')} ${o}`}</option>)}
            </select>
          </div>
          {tab === "marks" && (
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.gradebook.filterSubject')}</label>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-300">
                {SUBJECTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          )}
          {tab !== "analytics" && (
            <div className="relative flex-1 min-w-[180px]">
              <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.gradebook.filterSearch')}</label>
              <Search className="absolute start-3 top-1/2 mt-[3px] -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="h-9 ps-9"
                placeholder={t('admin.academics.gradebook.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          {search && tab !== "analytics" && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setSearch("")}>{t('admin.academics.gradebook.clear')}</Button>
          )}
        </div>

        {/* Approval status — Subject Teacher -> Class Teacher -> Grade Coordinator -> Principal */}
        {tab === "marks" && submission && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", SUBMISSION_STATUS_COLORS[submission.status])}>
                {t(SUBMISSION_STATUS_LABEL_KEYS[submission.status] ?? submission.status)}
              </span>
              <span className="text-xs text-slate-400">
                {submission.subjectTeacherName && t('admin.academics.gradebook.submittedBy', { name: submission.subjectTeacherName })}
                {submission.classTeacherName && submission.status !== "Submitted to Class Teacher" && ` · ${t('admin.academics.gradebook.classTeacherLabel', { name: submission.classTeacherName })}`}
                {submission.gradeCoordinatorName && (submission.status === "Submitted to Principal" || submission.status === "Approved by Principal") && ` · ${t('admin.academics.gradebook.gradeCoordinatorLabel', { name: submission.gradeCoordinatorName })}`}
                {submission.status === "Approved by Principal" && submission.principalName && ` · ${t('admin.academics.gradebook.approvedByLabel', { name: submission.principalName })}`}
              </span>
            </div>
            {canEscalateToPrincipal && submission.status === "Submitted to Grade Coordinator" && (
              <Button size="sm" onClick={handleEscalateToPrincipal} disabled={approving} className="bg-amber-600 hover:bg-amber-700 text-white">
                <ShieldCheck className="h-3.5 w-3.5 me-1.5" /> {approving ? t('admin.academics.gradebook.approving') : t('admin.academics.gradebook.approveSendToPrincipal')}
              </Button>
            )}
            {canGiveFinalApproval && submission.status === "Submitted to Principal" && (
              <Button size="sm" onClick={handleFinalApprove} disabled={approving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <ShieldCheck className="h-3.5 w-3.5 me-1.5" /> {approving ? t('admin.academics.gradebook.approving') : t('admin.academics.gradebook.giveFinalApproval')}
              </Button>
            )}
          </div>
        )}

        {/* ═══ MARKS TAB ═══ */}
        {tab === "marks" && !subject && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-16 text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-semibold text-slate-600">{t('admin.academics.gradebook.noSubjectAssignedTitle')}</p>
            <p className="text-sm text-slate-400 mt-1">{t('admin.academics.gradebook.noSubjectAssignedBody', { grade, section: displaySectionLabel })}</p>
          </div>
        )}
        {tab === "marks" && subject && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <span className="font-semibold text-slate-800 text-sm">{subject} · {grade} · {displaySectionLabel} · {term}</span>
              <span className="text-xs text-slate-400">{filteredByRoll.length === 1 ? t('admin.academics.gradebook.studentCountSingular', { count: filteredByRoll.length }) : t('admin.academics.gradebook.studentCountPlural', { count: filteredByRoll.length })}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 w-12">#</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 min-w-[150px]">{t('admin.academics.gradebook.colStudent')}</th>
                    {columns.map(c => (
                      <th key={c.key} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {colLabel(c)} <span className="text-slate-300">/{c.max}</span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colTotal')}</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">%</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colGrade')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredByRoll.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 5} className="px-4 py-14 text-center text-sm text-slate-400">
                        {search ? t('admin.academics.gradebook.noResultsFor', { search }) : t('admin.academics.gradebook.noStudentsIn', { grade, section: displaySectionLabel })}
                      </td>
                    </tr>
                  )}
                  {filteredByRoll.map(s => {
                    const g = gradeFromPct(s.pct);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-400">{s.rollNo}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{s.name}</td>
                        {columns.map(c => {
                          const v = s.marks[c.key] ?? "";
                          return (
                            <td key={c.key} className="px-3 py-3 text-center text-slate-700">
                              {v === "" ? <span className="text-slate-300" title={t('admin.academics.gradebook.notMarkedYet')}>—</span> : v}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center font-bold text-slate-900">{s.total}</td>
                        <td className="px-3 py-3 text-center text-slate-700">{s.pct}%</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", gradeBadge(g))}>{g}</span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Class Average row */}
                  <tr className="bg-violet-50/40 border-t-2 border-violet-100">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 font-bold text-slate-800 text-sm">{t('admin.academics.gradebook.classAverage')}</td>
                    {columns.map(c => (
                      <td key={c.key} className="px-3 py-3 text-center font-semibold text-slate-800">{(classAvg.avgPerCol[c.key] ?? 0).toFixed(1)}</td>
                    ))}
                    <td className="px-3 py-3 text-center font-bold text-slate-900">{classAvg.totalAvg.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-900">{classAvg.pct}%</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", gradeBadge(gradeFromPct(classAvg.pct)))}>{gradeFromPct(classAvg.pct)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 px-4 py-2.5 border-t border-slate-100">{t('admin.academics.gradebook.marksAutoCalcFooter')}</p>
          </div>
        )}

        {/* ═══ RESULTS TAB — student-wise score across every subject ═══ */}
        {tab === "results" && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <span className="font-semibold text-slate-800 text-sm">{t('admin.academics.gradebook.allSubjectsHeading')} · {grade} · {displaySectionLabel} · {term}</span>
              <span className="text-xs text-slate-400">{filteredResults.length === 1 ? t('admin.academics.gradebook.studentCountSingular', { count: filteredResults.length }) : t('admin.academics.gradebook.studentCountPlural', { count: filteredResults.length })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 w-12">#</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 min-w-[150px]">{t('admin.academics.gradebook.colStudent')}</th>
                    {SUBJECTS.map(subj => (
                      <th key={subj} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap" title={subj}>
                        {subjectShort(subj)}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colOverallPct')}</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colGrade')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={SUBJECTS.length + 4} className="px-4 py-14 text-center text-sm text-slate-400">
                        {search ? t('admin.academics.gradebook.noResultsFor', { search }) : t('admin.academics.gradebook.noStudentsIn', { grade, section: displaySectionLabel })}
                      </td>
                    </tr>
                  )}
                  {filteredResults.map(s => (
                    <tr key={s.studentId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400">{rollOf.get(s.studentId) ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{s.name}</td>
                      {SUBJECTS.map(subj => {
                        const sg = s.subjects.find(x => x.subject === subj);
                        return (
                          <td key={subj} className="px-3 py-3 text-center text-slate-700">
                            {sg?.hasData ? `${Math.round(sg.percentage)}%` : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center font-bold text-slate-900">
                        {s.subjects.some(x => x.hasData) ? `${Math.round(s.overallPercentage)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", gradeBadge(s.overallLetter))}>{s.overallLetter}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 px-4 py-2.5 border-t border-slate-100">{t('admin.academics.gradebook.resultsFooter')}</p>
          </div>
        )}

        {/* ═══ ANALYTICS TAB ═══ */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon={TrendingUp} label={t('admin.academics.gradebook.kpiOverallClassAverage')} value={`${overallClassAvg}%`} sub={gradedCount === 1 ? t('admin.academics.gradebook.acrossGradedStudentsSingular', { count: gradedCount }) : t('admin.academics.gradebook.acrossGradedStudentsPlural', { count: gradedCount })} bg="bg-violet-50" ic="text-violet-500" />
              <KPI icon={CheckCircle2} label={t('admin.academics.gradebook.kpiPassRate')} value={`${overallPassRate}%`} sub={t('admin.academics.gradebook.passRateSub')} bg="bg-emerald-50" ic="text-emerald-500" />
              <KPI icon={Trophy} label={t('admin.academics.gradebook.kpiStrongestSubject')} value={subjectAverages[0]?.subject ?? "—"} sub={subjectAverages[0] ? t('admin.academics.gradebook.classAvgSub', { pct: subjectAverages[0].avg }) : t('admin.academics.gradebook.noDataYet')} bg="bg-blue-50" ic="text-blue-500" />
              <KPI icon={AlertTriangle} label={t('admin.academics.gradebook.kpiWeakestSubject')} value={subjectAverages[subjectAverages.length - 1]?.subject ?? "—"} sub={subjectAverages.length ? t('admin.academics.gradebook.classAvgSub', { pct: subjectAverages[subjectAverages.length - 1].avg }) : t('admin.academics.gradebook.noDataYet')} bg="bg-rose-50" ic="text-rose-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              {/* Subject-wise class average bars */}
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-slate-900 text-sm mb-1">{t('admin.academics.gradebook.subjectWiseClassAverage')}</h3>
                <p className="text-[11px] text-slate-400 mb-4">{grade} · {displaySectionLabel} · {term}</p>
                {subjectAverages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">{t('admin.academics.gradebook.noGradedMarksYet')}</p>
                ) : (
                  <div className="space-y-3">
                    {subjectAverages.map(sa => (
                      <div key={sa.subject}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">{sa.subject}</span>
                          <span className="font-bold text-slate-900">{sa.avg}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${sa.avg}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overall grade distribution */}
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-slate-900 text-sm mb-1">{t('admin.academics.gradebook.overallGradeDistribution')}</h3>
                <p className="text-[11px] text-slate-400 mb-3">{t('admin.academics.gradebook.allSubjectsCombined')}</p>
                <div className="w-full aspect-square max-w-[150px] mx-auto">
                  <DonutChart data={overallGradeDist} total={gradedCount} label={t('admin.academics.gradebook.donutStudentsLabel')} />
                </div>
                <div className="space-y-1.5 mt-4">
                  {overallGradeDist.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-2">{t('admin.academics.gradebook.noGradedDataYet')}</p>
                  ) : overallGradeDist.map(d => (
                    <div key={d.label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-slate-600 flex-1">{d.label}</span>
                      <span className="text-xs font-semibold text-slate-700">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RANKINGS TAB ═══ */}
        {tab === "rankings" && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <span className="font-semibold text-slate-800 text-sm">{t('admin.academics.gradebook.classRankingHeading')} — {grade} · {displaySectionLabel} · {term}</span>
              <span className="text-xs text-slate-400">{filteredRanked.length === 1 ? t('admin.academics.gradebook.studentCountSingular', { count: filteredRanked.length }) : t('admin.academics.gradebook.studentCountPlural', { count: filteredRanked.length })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 w-16">{t('admin.academics.gradebook.colRank')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 min-w-[150px]">{t('admin.academics.gradebook.colStudent')}</th>
                    <th className="px-3 py-3 text-start text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colRollNo')}</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colSubjectsGraded')}</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colOverallPct')}</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{t('admin.academics.gradebook.colGrade')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRanked.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">
                        {search ? t('admin.academics.gradebook.noResultsFor', { search }) : t('admin.academics.gradebook.noStudentsIn', { grade, section: displaySectionLabel })}
                      </td>
                    </tr>
                  )}
                  {filteredRanked.map(s => {
                    const graded = s.subjects.filter(x => x.hasData).length;
                    return (
                      <tr key={s.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold",
                            s.rank === 1 ? "bg-amber-100 text-amber-700" : s.rank === 2 ? "bg-slate-100 text-slate-600" : s.rank === 3 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-400")}>
                            {s.rank <= 3 && graded > 0 ? <Trophy className="w-3.5 h-3.5" /> : s.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{s.name}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{rollOf.get(s.studentId) ?? "—"}</td>
                        <td className="px-3 py-3 text-center text-xs text-slate-500">{graded} / {SUBJECTS.length}</td>
                        <td className="px-3 py-3 text-center font-bold text-slate-900">{graded ? `${Math.round(s.overallPercentage)}%` : "—"}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", gradeBadge(s.overallLetter))}>{s.overallLetter}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 px-4 py-2.5 border-t border-slate-100">{t('admin.academics.gradebook.rankingsFooter')}</p>
          </div>
        )}
      </div>

      {/* ── Gradebook Structure Editor ── */}
      <Dialog open={structureOpen} onOpenChange={setStructureOpen}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> {t('admin.academics.gradebook.dialogStructureTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.academics.gradebook.dialogStructureDescription', { band: curriculumBand?.label ?? grade, curriculum: curriculum.shortName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{isCustomized ? t('admin.academics.gradebook.customStructure') : t('admin.academics.gradebook.curriculumDefault')}</span>
              <span className={cn("font-semibold", draftTotal === 100 ? "text-emerald-600" : "text-amber-600")}>
                {t('admin.academics.gradebook.totalOutOf100', { total: draftTotal })}
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pe-1">
              {draftCategories.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={c.name} onChange={e => updateDraftCategory(i, { name: e.target.value })}
                    className="h-9 text-sm flex-1" placeholder={t('admin.academics.gradebook.categoryNamePlaceholder')} />
                  <Input type="number" min={0} max={100} value={c.marks}
                    onChange={e => updateDraftCategory(i, { marks: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-9 text-sm w-20" placeholder={t('admin.academics.gradebook.marksPlaceholder')} />
                  <button onClick={() => removeDraftCategory(i)} className="p-1.5 rounded text-slate-400 hover:text-rose-500">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {draftCategories.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t('admin.academics.gradebook.noCategoriesYet')}</p>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={addDraftCategory}>
              <Plus className="w-3.5 h-3.5" /> {t('admin.academics.gradebook.addCategory')}
            </Button>

            {draftTotal !== 100 && (
              <p className="text-xs text-amber-600">{t('admin.academics.gradebook.categoryMarksShouldAddUp')}</p>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="ghost" size="sm" disabled={!isCustomized} onClick={() => setResetConfirmOpen(true)}>
              <RotateCcw className="w-3.5 h-3.5 me-1.5" /> {t('admin.academics.gradebook.resetToDefault')}
            </Button>
            <Button size="sm" onClick={handleSaveStructure}>{t('admin.academics.gradebook.saveStructure')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset confirmation ── */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.academics.gradebook.resetConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.academics.gradebook.resetConfirmDescription', { band: curriculumBand?.label ?? grade, curriculum: curriculum.shortName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('admin.academics.gradebook.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleResetStructure}>
              {t('admin.academics.gradebook.resetStructure')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
