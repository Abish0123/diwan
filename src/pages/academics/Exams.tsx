import { useState, useMemo, useEffect } from "react";
import jsPDF from "jspdf";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Calendar, Users, TrendingUp, FileText, BarChart3, BookOpen,
  MoreVertical, CheckCircle2, Clock, CalendarDays,
  ClipboardList, Trophy, Award, FileBarChart, Settings,
  Eye, Send, Download, ArrowRight, AlertCircle,
  MapPin, UserCheck, Printer, Pencil, Trash2,
  X, PlusCircle, Minus, GraduationCap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type ExamRecord, type ExamSlot, type ExamStatus, type ExamMode, type GradePlan,
  useExams, addExam, updateExam, deleteExam, nextExamId, getGradePlans, examGrades, summarizeSlots, setGradePublished,
  isForwardStatusTransition, loadExamSettings, EXAM_SETTINGS_LS_KEY,
} from "@/lib/examStore";
import { useGrades } from '@/contexts/CurriculumContext';
import { useGradeCoordinator } from '@/hooks/useGradeCoordinator';
import { canonGrade } from '@/lib/studentGradeSection';
import { useSubjects } from '@/lib/subjectRegistry';
import { subjectsAssignedForGradeSections, type SubjectAssignment } from '@/lib/timetableRules';
import { ExamSetupWizard } from "@/components/exams/ExamSetupWizard";
import { type WizardStepId } from "@/components/exams/ExamWizardSteps";
import { smartDb } from "@/lib/localDb";
import { loadGradebookSources, loadExamMarksLocal } from "@/lib/gradebookEngine";
import { formatTime12h } from "@/lib/dateScope";
import {
  type ExamStudentMini, type ExamMarksMap, type ResultSummaryRow,
  loadExamStudents, hasAnyMarks,
  computeResultSummary, downloadResultSummaryPDF, downloadResultSummaryCSV,
  computeSubjectAnalysis, downloadSubjectAnalysisPDF,
  computePassFail, downloadPassFailPDF, downloadPassFailCSV,
  computeTeacherPerformance, downloadTeacherPerformancePDF,
  computeTopperList, downloadTopperListPDF, downloadTopperListCSV,
  downloadBulkReportCardsPDF, printBulkReportCards,
  printReportTable,
} from "@/lib/examReports";

// ─── Types & Data ─────────────────────────────────────────────────────────────
type Exam = ExamRecord;

const SECTION_OPTIONS = ["All Sections", "A", "B", "C", "D"];
const TYPE_OPTIONS = ["Unit Test", "Monthly Test", "Mid Term", "Main Exam", "Practical", "Mock"];
const STATUS_OPTIONS: ExamStatus[] = ["Scheduled", "Ongoing", "Completed", "Published"];
const SUBJECT_OPTIONS = [
  "Mathematics", "Science", "English", "Urdu", "Social Studies", "Islamiyat",
  "Computer Science", "Art & Craft", "Physical Education", "Chemistry", "Physics",
  "Biology", "History", "Geography", "Quran Studies", "Arabic", "Pakistan Studies",
  "Economics", "Accounting", "Business Studies",
];
const DURATION_OPTIONS = [
  { label: "30 min", min: 30 }, { label: "45 min", min: 45 },
  { label: "1 hour", min: 60 }, { label: "1.5 hours", min: 90 },
  { label: "2 hours", min: 120 }, { label: "2.5 hours", min: 150 },
  { label: "3 hours", min: 180 }, { label: "3.5 hours", min: 210 },
];
function exportExamCSV(exam: Exam) {
  const plans = getGradePlans(exam);
  const multi = plans.length > 1;
  const headers = [...(multi ? ["Grade"] : []), "Day", "Date", "Time", "Subject Code", "Subject Name"];
  const rows = plans.flatMap(plan =>
    [...plan.slots].sort((a, b) => a.date.localeCompare(b.date)).map(s => [
      ...(multi ? [plan.grade] : []),
      fmtDay(s.date), fmtDate(s.date), `${s.start} - ${s.end}`,
      s.subjectCode || "", s.subject,
    ])
  );
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exam.name.replace(/\s+/g, "-")}-schedule.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Prints the full timetable — every grade this exam covers — in a dedicated
// window instead of window.print() on the whole SPA (which was printing the
// app shell/sidebar behind the dialog, not the timetable — the reported
// "printout not working" bug).
function printExamTimetable(exam: Exam, onlyGrade?: string) {
  const plans = onlyGrade ? getGradePlans(exam).filter(p => p.grade === onlyGrade) : getGradePlans(exam);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    toast.error("Pop-up blocked — allow pop-ups for this site to print.");
    return;
  }
  const sections = plans.map(plan => {
    const rows = [...plan.slots].sort((a, b) => a.date.localeCompare(b.date));
    const bodyRows = rows.map(s => `
      <tr>
        <td>${fmtDay(s.date)}</td><td>${fmtDate(s.date)}</td><td>${s.start} - ${s.end}</td>
        <td>${s.subjectCode || "—"}</td><td>${s.subject}</td>
      </tr>`).join("");
    const sectionLabel = plan.sections?.length ? plan.sections.join(", ") : plan.section;
    return `
      <h2>${plan.grade} <span class="meta">· Section ${sectionLabel}</span></h2>
      ${rows.length === 0
        ? `<p class="empty">No subject slots scheduled yet.</p>`
        : `<table><thead><tr><th>Day</th><th>Date</th><th>Time</th><th>Subject Code</th><th>Subject Name</th></tr></thead><tbody>${bodyRows}</tbody></table>`}
    `;
  }).join("<hr/>");
  win.document.write(`<!DOCTYPE html><html><head><title>${exam.name} — Timetable</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 20px 0 8px; }
      h2 .meta, p.meta { color: #6b7280; font-weight: normal; }
      p.meta { margin: 0 0 20px; font-size: 12px; }
      p.empty { color: #9ca3af; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
      th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; color: #6b7280; }
      hr { border: none; border-top: 1px dashed #e5e7eb; margin: 20px 0; }
      @media print { body { padding: 0; } hr { display: none; } h2 { page-break-before: auto; } }
    </style></head>
    <body>
      <h1>${exam.name}</h1>
      <p class="meta">${exam.type} · ${exam.mode} · ${plans.length > 1 ? `${plans.length} grades` : plans[0].grade}</p>
      ${sections}
    </body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// Generates a downloadable PDF of the subject-wise timetable — one table per
// grade this exam covers, each on its own page when there's more than one.
// `onlyGrade` scopes the download to a single grade's timetable — each grade
// under a shared exam title (e.g. "Mid Term - 1") can be downloaded on its
// own, independent of the other grades' papers.
function downloadTimetablePDF(exam: Exam, onlyGrade?: string) {
  const plans = onlyGrade ? getGradePlans(exam).filter(p => p.grade === onlyGrade) : getGradePlans(exam);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const cols = [
    { label: "Day", width: 40 },
    { label: "Date", width: 50 },
    { label: "Time", width: 70 },
    { label: "Code", width: 40 },
    { label: "Subject Name", width: 80 },
  ];
  const tableWidth = cols.reduce((a, c) => a + c.width, 0);
  const startX = (pageWidth - tableWidth) / 2;
  const rowH = 9;

  const drawHeaderRow = (y: number) => {
    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(229, 231, 235);
    doc.rect(startX, y, tableWidth, rowH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    let x = startX;
    cols.forEach(c => { doc.text(c.label, x + 2, y + 6); x += c.width; });
    return y + rowH;
  };

  plans.forEach((plan, planIdx) => {
    if (planIdx > 0) doc.addPage();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(exam.name, 14, 16);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const sectionLabel = plan.sections?.length ? plan.sections.join(", ") : plan.section;
    doc.text(`${plan.grade} · Section ${sectionLabel} · ${exam.type} · ${exam.mode}${plans.length > 1 ? ` · Grade ${planIdx + 1} of ${plans.length}` : ""}`, 14, 23);

    const rows = [...plan.slots].sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) {
      doc.setTextColor(150);
      doc.text("No subject slots scheduled yet.", 14, 36);
      return;
    }

    let y = drawHeaderRow(34);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(17, 24, 39);

    rows.forEach((s, i) => {
      if (y + rowH > pageHeight - 12) {
        doc.addPage();
        y = drawHeaderRow(16);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(17, 24, 39);
      }
      doc.setDrawColor(229, 231, 235);
      doc.rect(startX, y, tableWidth, rowH, "S");
      const values = [
        fmtDay(s.date), fmtDate(s.date), `${s.start} - ${s.end}`,
        s.subjectCode || "—", s.subject,
      ];
      let x = startX;
      cols.forEach((c, ci) => { doc.text(values[ci], x + 2, y + 6, { maxWidth: c.width - 3 }); x += c.width; });
      y += rowH;
    });
  });

  const suffix = onlyGrade ? `${onlyGrade.replace(/\s+/g, "-")}-timetable` : "timetable";
  doc.save(`${exam.name.replace(/\s+/g, "-")}-${suffix}.pdf`);
}

function calcEnd(start: string, durMin: number): string {
  if (!start) return "";
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
function fmtRange(start: string, end: string): string {
  if (!start) return "TBD";
  const f = (iso: string, withYear: boolean) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) }); }
    catch { return iso; }
  };
  if (!end || end === start) return f(start, true);
  return `${f(start, false)} – ${f(end, true)}`;
}
function durationLabel(start: string, end: string): string {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const emptySlot = (): ExamSlot => ({ subject: "", date: "", start: "09:00", end: "11:00", invigilator: "", room: "", subjectTeacher: "" });
const emptyForm = (): Exam => ({ id: "", name: "", type: "Unit Test", grade: "", section: "All Sections", sections: [], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, status: "Scheduled", slots: [], published: false, gradePlans: [],
  // Teachers should see exams for their own classes/subjects by default — real
  // access to grade is still gated separately by exam status + Subject
  // Allocation RBAC, so hiding the exam itself behind a manual publish step
  // just meant admins forgot it and assigned teachers never got marks-entry
  // access even after marking the exam Completed.
  mode: "Offline", venue: "", room: "", invigilator: "", durationMin: 120, maxMarks: 100, passingMarks: 40, publishedToTeachers: true, publishedToStudents: false, examFee: 0 });

// One grade's in-progress edit state inside the Create/Edit Exam dialog —
// its own sections, roll counts and subject-wise schedule.
interface GradePlanEdit {
  sections: string[];
  total: number;
  appeared: number;
  slotRows: (ExamSlot & { durMin: number })[];
}
const emptyGradePlanEdit = (): GradePlanEdit => ({ sections: [], total: 0, appeared: 0, slotRows: [] });
const slotToRow = (s: ExamSlot): ExamSlot & { durMin: number } => {
  const [sh, sm] = s.start.split(":").map(Number);
  const [eh, em] = s.end.split(":").map(Number);
  const durMin = Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
  return { ...s, durMin };
};

const MODE_OPTIONS: { value: ExamMode; label: string; hint: string }[] = [
  { value: "Offline", label: "Offline", hint: "Paper-based, in a hall/room" },
  { value: "Online", label: "Online", hint: "Conducted on devices" },
  { value: "Hybrid", label: "Hybrid", hint: "Mix of paper + online" },
];
const modeBadge = (m: ExamMode) =>
  m === "Online" ? "bg-violet-50 text-violet-700 border-violet-200" :
  m === "Hybrid" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
  "bg-orange-50 text-orange-700 border-orange-200";

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
];

const statusBadge = (s: string) =>
  s === "Scheduled" ? "bg-blue-50 text-blue-700 border-blue-200" :
  s === "Ongoing" ? "bg-amber-50 text-amber-700 border-amber-200" :
  s === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
  s === "Pending" ? "bg-gray-100 text-gray-600 border-gray-200" :
  "bg-green-50 text-green-700 border-green-200";

const SLOT_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#3B82F6", "#EC4899", "#14B8A6", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16"];

function KPI({ icon: Icon, label, value, sub, color, bg }: { icon: typeof Users; label: string; value: string; sub: string; color: string; bg: string }) {
  return (
    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[11px] font-semibold text-gray-500">{label}</p>
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}><Icon className={cn("w-4 h-4", color)} /></div>
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-gray-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[135px] text-sm border-gray-200"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function totalSlotCount(e: Exam): number { return getGradePlans(e).reduce((a, p) => a + p.slots.length, 0); }

// Shown in place of fabricated stats/charts — this data has no real source yet
// (no per-student marks are recorded against exams), so we say so instead of
// making numbers up.
function EmptyState({ icon: Icon, title, hint, cta, onCta }: { icon: typeof FileText; title: string; hint: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-center">
      <Icon className="w-9 h-9 mb-2 text-gray-200" />
      <p className="font-semibold text-gray-500">{title}</p>
      <p className="text-xs mt-1 max-w-xs">{hint}</p>
      {cta && onCta && (
        <Button size="sm" variant="outline" className="mt-3 border-gray-200 gap-1.5" onClick={onCta}>
          <ArrowRight className="w-3.5 h-3.5" /> {cta}
        </Button>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
const Exams = () => {
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState("2024-25");
  const [term, setTerm] = useState("All Terms");
  const [grade, setGrade] = useState("All Grades");
  const [section, setSection] = useState("All Sections");
  const [subject, setSubject] = useState("All Subjects");
  const [examType, setExamType] = useState("All Types");

  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // A coordinator only ever sees/creates exams for their own grade — same
  // restriction as Classes/Gradebook/Report Cards. `grades` feeds both the
  // "Grade" filter dropdown and the multi-grade exam-creation checkboxes;
  // `exams` is scoped at the source so every KPI/list/table on this page
  // (all of which read straight off `exams`) stays inside the boundary with
  // no per-usage changes needed.
  const allGrades = useGrades();
  const grades = isGradeCoordinator ? (coordAssignedGrade ? [coordAssignedGrade] : []) : allGrades;
  const rawExams = useExams();
  const exams = useMemo(
    () => isGradeCoordinator
      ? rawExams.filter(e => getGradePlans(e).some(p => canonGrade(p.grade) === canonGrade(coordAssignedGrade)))
      : rawExams,
    [rawExams, isGradeCoordinator, coordAssignedGrade]
  );
  const navigate = useNavigate();
  const { subjects } = useSubjects();

  // Multi-strategy subject → code lookup. Priority:
  //   1. Exact name match (case+space sensitive)
  //   2. Lowercase trimmed match
  //   3. First registry entry whose name is fully contained in the search name or vice-versa
  // This survives minor capitalisation/spacing differences between the Subject
  // Registry and the Subject Allocation table (e.g. "Art & Craft" vs "Art").
  const subjectCodeMap = useMemo(() => {
    const exact  = new Map<string, string>();          // "Mathematics" → "MAT101"
    const lower  = new Map<string, string>();          // "mathematics" → "MAT101"
    const words  = new Map<string, string>();          // for fuzzy fallback
    subjects.forEach(s => {
      if (!s.code) return;
      exact.set(s.name, s.code);
      lower.set(s.name.toLowerCase().trim(), s.code);
      // Also index by every word so "Art" matches "Art & Craft"
      s.name.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 2 && !words.has(w)) words.set(w, s.code);
      });
    });
    return {
      get(name: string): string {
        if (!name) return "";
        const trimmed = name.trim();
        return (
          exact.get(trimmed) ||
          lower.get(trimmed.toLowerCase()) ||
          (() => {
            const nl = trimmed.toLowerCase();
            // Try any registry subject whose lowercase name is a substring (or vice-versa)
            for (const [key, code] of lower.entries()) {
              if (nl.includes(key) || key.includes(nl)) return code;
            }
            // Last resort: match on a shared significant word
            const firstWord = nl.split(/\s+/)[0];
            return (firstWord && firstWord.length > 2 ? words.get(firstWord) : undefined) || "";
          })()
        );
      },
    };
  }, [subjects]);

  // Single exam-operations wizard state, driven by the URL so bookmarks/back-
  // button work and old standalone routes (/exams/seating etc.) can redirect
  // straight into the right step.
  const [searchParams, setSearchParams] = useSearchParams();
  const wizardStep = (searchParams.get("step") as WizardStepId) || "schedule";
  const wizardExamId = searchParams.get("examId") || "";
  const setWizardStep = (s: WizardStepId) => {
    const p = new URLSearchParams(searchParams);
    p.set("step", s);
    setSearchParams(p, { replace: true });
  };
  const setWizardExamId = (id: string) => {
    const p = new URLSearchParams(searchParams);
    if (id) p.set("examId", id); else p.delete("examId");
    setSearchParams(p, { replace: true });
  };
  const goToWizardStep = (id: string, s: WizardStepId) => {
    const p = new URLSearchParams(searchParams);
    if (id) p.set("examId", id); else p.delete("examId");
    p.set("step", s);
    setSearchParams(p, { replace: true });
  };

  // Real subject → teacher → grade → section allocation (Academics > Subject
  // Allocation), same source Timetable reads. A subject may only be scheduled
  // for a grade's exam if it's actually allocated to a teacher for the
  // section(s) this exam plan covers — "All Sections" falls back to the
  // grade-wide union, but a specific section only offers that section's
  // allocated subjects.
  const [allSubjectAssignments, setAllSubjectAssignments] = useState<SubjectAssignment[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((data: any[]) => setAllSubjectAssignments(Array.isArray(data) ? data : []))
      .catch(() => setAllSubjectAssignments([]));
  }, []);

  // ── Settings tab: real, persisted (localStorage + MySQL write-through) —
  // previously every control here was uncontrolled/`defaultChecked` and "Save
  // Settings" just fired a toast with nothing actually saved.
  const [examSettings, setExamSettings] = useState(loadExamSettings);
  useEffect(() => {
    smartDb.getOne("ExamSettings", "global").then(row => {
      if (row) setExamSettings(s => ({ ...s, ...row }));
    }).catch(() => {});
  }, []);
  function saveExamSettings() {
    try { localStorage.setItem(EXAM_SETTINGS_LS_KEY, JSON.stringify(examSettings)); } catch { /* ignore */ }
    void smartDb.create("ExamSettings", examSettings as unknown as Record<string, unknown>, "global").catch(() => {});
    toast.success("Settings saved");
  }

  // ── Reports tab: exam-scoped, marks-backed report generation ────────────────
  // Every report reads real enrolled students + real sd_exam_marks/ExamMark
  // data for the selected exam — never a fabricated roster or invented score.
  const [reportExamId, setReportExamId] = useState("");
  const reportExam = exams.find(e => e.id === reportExamId) || null;
  const [reportStudents, setReportStudents] = useState<ExamStudentMini[]>([]);
  const [reportExamMarks, setReportExamMarks] = useState<ExamMarksMap>({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportPreview, setReportPreview] = useState<{ title: string; subtitle: string; headers: string[]; rows: string[][] } | null>(null);

  useEffect(() => {
    if (!reportExamId) { setReportStudents([]); setReportExamMarks({}); return; }
    let active = true;
    setReportsLoading(true);
    Promise.all([
      smartDb.getAll("Student", "").catch(() => []),
      loadGradebookSources().then(src => src.examMarks).catch(() => loadExamMarksLocal()),
    ]).then(([allStudents, examMarks]) => {
      if (!active) return;
      const exam = exams.find(e => e.id === reportExamId);
      setReportStudents(exam ? loadExamStudents(exam, Array.isArray(allStudents) ? allStudents : []) : []);
      setReportExamMarks(examMarks || {});
    }).finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportExamId]);

  // Shared gate: every Generate/Download/Print click runs through this first,
  // so a report can never silently "succeed" with no exam picked or no marks
  // entered yet — it tells the admin exactly what to do instead.
  function reportsReady(): boolean {
    if (!reportExamId) { toast.error("Select an exam first."); return false; }
    if (reportsLoading) { toast.info("Loading exam data — try again in a moment."); return false; }
    if (!hasAnyMarks(reportExamMarks, reportExamId)) {
      toast.error(`No marks entered for "${reportExam?.name}" yet.`, {
        description: "Go to Mark Entry first, then come back to generate this report.",
      });
      return false;
    }
    if (reportStudents.length === 0) {
      toast.error("No enrolled students found for this exam's grade(s)/section(s).");
      return false;
    }
    return true;
  }

  function handleReportAction(key: string, action: "generate" | "download" | "print") {
    if (!reportsReady()) return;
    const exam = reportExam!;

    if (key === "result-summary") {
      const rows = computeResultSummary(exam, reportStudents, reportExamMarks);
      const subjectList = Array.from(new Set(rows.flatMap(r => r.subjects.map(s => s.subject))));
      if (action === "download") downloadResultSummaryPDF(exam.name, rows, subjectList);
      else if (action === "print") {
        printReportTable(exam.name, "Result Summary Report", `${rows.length} students`,
          ["Roll No", "Name", "Grade", "Section", "Total %", "Letter Grade", "Result"],
          rows.map(r => [r.rollNo, r.name, r.grade, r.section, r.maxTotal ? `${r.percentage.toFixed(1)}%` : "—", r.letter, r.result]));
      } else {
        setReportPreview({
          title: "Result Summary Report", subtitle: `${rows.length} students`,
          headers: ["Roll No", "Name", "Grade", "Section", "Total %", "Letter Grade", "Result"],
          rows: rows.map(r => [r.rollNo, r.name, r.grade, r.section, r.maxTotal ? `${r.percentage.toFixed(1)}%` : "—", r.letter, r.result]),
        });
      }
      return;
    }

    if (key === "subject-analysis") {
      const rows = computeSubjectAnalysis(exam, reportStudents, reportExamMarks);
      if (rows.length === 0) { toast.error("No graded subjects found for this exam yet."); return; }
      if (action === "download") downloadSubjectAnalysisPDF(exam.name, rows);
      else if (action === "print") {
        printReportTable(exam.name, "Subject Analysis", `${rows.length} subjects`,
          ["Subject", "Entries", "Highest", "Lowest", "Average", "Pass", "Fail", "Pass Rate"],
          rows.map(r => [r.subject, String(r.entries), String(r.highest), String(r.lowest), r.average.toFixed(1), String(r.passCount), String(r.failCount), `${r.passRate.toFixed(1)}%`]));
      } else {
        setReportPreview({
          title: "Subject Analysis", subtitle: `${rows.length} subjects`,
          headers: ["Subject", "Entries", "Highest", "Lowest", "Average", "Pass", "Fail", "Pass Rate"],
          rows: rows.map(r => [r.subject, String(r.entries), String(r.highest), String(r.lowest), r.average.toFixed(1), String(r.passCount), String(r.failCount), `${r.passRate.toFixed(1)}%`]),
        });
      }
      return;
    }

    if (key === "report-cards") {
      const rows = computeResultSummary(exam, reportStudents, reportExamMarks);
      if (action === "download") downloadBulkReportCardsPDF(exam.name, rows);
      else if (action === "print") printBulkReportCards(exam.name, rows);
      else {
        setReportPreview({
          title: "Report Cards (Bulk)", subtitle: `${rows.length} students will get a report card`,
          headers: ["Roll No", "Name", "Grade", "Section", "Total %", "Result"],
          rows: rows.map(r => [r.rollNo, r.name, r.grade, r.section, r.maxTotal ? `${r.percentage.toFixed(1)}%` : "—", r.result]),
        });
      }
      return;
    }

    if (key === "pass-fail") {
      const rows = computePassFail(exam, reportStudents, reportExamMarks);
      if (action === "download") downloadPassFailPDF(exam.name, rows);
      else if (action === "print") {
        printReportTable(exam.name, "Pass / Fail Report", `${rows.length} groups`,
          ["Grade", "Section", "Total Students", "Passed", "Failed", "Incomplete", "Pass Rate"],
          rows.map(r => [r.grade, r.section, String(r.totalStudents), String(r.passed), String(r.failed), String(r.incomplete), `${r.passRate.toFixed(1)}%`]));
      } else {
        setReportPreview({
          title: "Pass / Fail Report", subtitle: `${rows.length} groups`,
          headers: ["Grade", "Section", "Total Students", "Passed", "Failed", "Incomplete", "Pass Rate"],
          rows: rows.map(r => [r.grade, r.section, String(r.totalStudents), String(r.passed), String(r.failed), String(r.incomplete), `${r.passRate.toFixed(1)}%`]),
        });
      }
      return;
    }

    if (key === "teacher-performance") {
      const rows = computeTeacherPerformance(exam, reportStudents, reportExamMarks, allSubjectAssignments);
      if (rows.length === 0) { toast.error("No graded subjects found for this exam yet."); return; }
      if (action === "download") downloadTeacherPerformancePDF(exam.name, rows);
      else if (action === "print") {
        printReportTable(exam.name, "Teacher Performance", `${rows.length} subject sittings`,
          ["Teacher", "Subject", "Grade", "Section", "Entries", "Average", "Pass Rate"],
          rows.map(r => [r.teacherName, r.subject, r.grade, r.section, String(r.entries), r.average.toFixed(1), `${r.passRate.toFixed(1)}%`]));
      } else {
        setReportPreview({
          title: "Teacher Performance", subtitle: `${rows.length} subject sittings`,
          headers: ["Teacher", "Subject", "Grade", "Section", "Entries", "Average", "Pass Rate"],
          rows: rows.map(r => [r.teacherName, r.subject, r.grade, r.section, String(r.entries), r.average.toFixed(1), `${r.passRate.toFixed(1)}%`]),
        });
      }
      return;
    }

    if (key === "topper-list") {
      const rows = computeTopperList(exam, reportStudents, reportExamMarks, 10);
      if (rows.length === 0) { toast.error("No students have complete marks yet — toppers need every subject graded."); return; }
      if (action === "download") downloadTopperListPDF(exam.name, rows);
      else if (action === "print") {
        printReportTable(exam.name, "Topper List", `Top ${rows.length}`,
          ["Rank", "Name", "Grade", "Section", "Roll No", "Percentage", "Letter Grade"],
          rows.map(r => [String(r.rank), r.name, r.grade, r.section, r.rollNo, `${r.percentage.toFixed(1)}%`, r.letter]));
      } else {
        setReportPreview({
          title: "Topper List", subtitle: `Top ${rows.length}`,
          headers: ["Rank", "Name", "Grade", "Section", "Roll No", "Percentage", "Letter Grade"],
          rows: rows.map(r => [String(r.rank), r.name, r.grade, r.section, r.rollNo, `${r.percentage.toFixed(1)}%`, r.letter]),
        });
      }
      return;
    }
  }

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Exam>(emptyForm);
  // Multi-grade editing: which grades this exam covers, each grade's own
  // sections/roll-counts/subject schedule, and which grade's tab is active.
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [gradePlanData, setGradePlanData] = useState<Record<string, GradePlanEdit>>({});
  const [activeGrade, setActiveGrade] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  // What deleting this exam will actually take with it — surfaced before the
  // admin confirms, since delete cascades exam_marks/exam_seating and that
  // used to happen silently with zero warning.
  const [deleteImpact, setDeleteImpact] = useState<{ markedStudents: number; seatingRooms: number } | null>(null);
  useEffect(() => {
    if (!deleteTarget) { setDeleteImpact(null); return; }
    let active = true;
    Promise.all([
      smartDb.getOne("ExamMark", deleteTarget.id).catch(() => null),
      smartDb.getAll("ExamSeating", "").catch(() => []),
    ]).then(([markRow, seatingRows]) => {
      if (!active) return;
      const markedStudents = markRow
        ? new Set(Object.values(markRow as Record<string, unknown>).flatMap(v => (v && typeof v === "object") ? Object.keys(v as Record<string, unknown>) : [])).size
        : 0;
      const seatingRooms = ((seatingRows as { examId: string; rooms?: unknown[] }[]) || [])
        .filter(r => r.examId === deleteTarget.id)
        .reduce((a, r) => a + (Array.isArray(r.rooms) ? r.rooms.length : 0), 0);
      setDeleteImpact({ markedStudents, seatingRooms });
    });
    return () => { active = false; };
  }, [deleteTarget]);
  const [viewTarget, setViewTarget] = useState<Exam | null>(null);
  // Which grade's schedule is shown in the read-only View Timetable dialog —
  // relevant only for exams that span multiple grades.
  const [viewGrade, setViewGrade] = useState<string>("");
  const openView = (e: Exam) => { setViewTarget(e); setViewGrade(examGrades(e)[0] || ""); };

  // Per-subject marks-entry progress for the View Timetable dialog — lets an
  // admin see at a glance which subjects of a multi-subject/multi-teacher
  // exam still need marks entered, instead of opening Marks Entry per subject.
  const [viewProgress, setViewProgress] = useState<{ students: ExamStudentMini[]; examMarks: ExamMarksMap } | null>(null);
  useEffect(() => {
    if (!viewTarget) { setViewProgress(null); return; }
    let active = true;
    Promise.all([
      smartDb.getAll("Student", "").catch(() => []),
      loadGradebookSources().then(src => src.examMarks).catch(() => loadExamMarksLocal()),
    ]).then(([allStudents, examMarks]) => {
      if (!active) return;
      setViewProgress({
        students: loadExamStudents(viewTarget, Array.isArray(allStudents) ? allStudents : []),
        examMarks: examMarks || {},
      });
    });
    return () => { active = false; };
  }, [viewTarget]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSelectedGrades([]);
    setGradePlanData({});
    setActiveGrade("");
    setFormOpen(true);
  };
  const openEdit = (e: Exam) => {
    setEditingId(e.id);
    setForm({ ...e });
    const plans = getGradePlans(e);
    setSelectedGrades(plans.map(p => p.grade));
    setGradePlanData(Object.fromEntries(plans.map(p => [p.grade, {
      sections: p.sections, total: p.total, appeared: p.appeared,
      // Backfill subjectCode from registry for any slot that was saved without one
      // (e.g. exams created before the code lookup was in place).
      slotRows: p.slots.map(slot => {
        const row = slotToRow(slot);
        if (!row.subjectCode && row.subject) {
          row.subjectCode = subjectCodeMap.get(row.subject) || "";
        }
        return row;
      }),
    }])));
    setActiveGrade(plans[0]?.grade || "");
    setFormOpen(true);
  };

  // Add/remove a grade from this exam's plan. Toggling on seeds an empty
  // plan for it (or restores its previously-entered data if toggled back on
  // within the same dialog session); toggling off drops its data.
  const toggleGrade = (g: string) => {
    setSelectedGrades(prev => {
      if (prev.includes(g)) {
        const next = prev.filter(x => x !== g);
        setActiveGrade(cur => (cur === g ? (next[0] || "") : cur));
        return next;
      }
      setGradePlanData(d => (d[g] ? d : { ...d, [g]: emptyGradePlanEdit() }));
      setActiveGrade(g);
      return [...prev, g];
    });
  };

  const toggleGradeSection = (g: string, sec: string) => setGradePlanData(d => {
    const cur = d[g] || emptyGradePlanEdit();
    const secs = sec === "All Sections" ? [] : (cur.sections.includes(sec) ? cur.sections.filter(s => s !== sec) : [...cur.sections, sec]);
    // Narrowing the section selection can strand an already-picked subject
    // that isn't allocated to the new, smaller section set — drop it rather
    // than silently save an exam slot for a subject nobody teaches there.
    const stillAllowed = new Set(subjectsAssignedForGradeSections(allSubjectAssignments, g, secs).map(n => n.toLowerCase()));
    const slotRows = cur.slotRows.map(s => s.subject && !stillAllowed.has(s.subject.toLowerCase()) ? { ...s, subject: "", subjectCode: "" } : s);
    return { ...d, [g]: { ...cur, sections: secs, slotRows } };
  });
  const updateGradeCount = (g: string, key: "total" | "appeared", val: number) => setGradePlanData(d => ({
    ...d, [g]: { ...(d[g] || emptyGradePlanEdit()), [key]: val },
  }));
  const addSlotRow = (g: string) => setGradePlanData(d => ({
    ...d, [g]: { ...(d[g] || emptyGradePlanEdit()), slotRows: [...(d[g]?.slotRows || []), { ...emptySlot(), durMin: 120 }] },
  }));
  const removeSlotRow = (g: string, i: number) => setGradePlanData(d => ({
    ...d, [g]: { ...d[g], slotRows: d[g].slotRows.filter((_, idx) => idx !== i) },
  }));
  const updateSlotRow = (g: string, i: number, key: string, val: string | number) =>
    setGradePlanData(d => ({
      ...d,
      [g]: {
        ...d[g],
        slotRows: d[g].slotRows.map((s, idx) => {
          if (idx !== i) return s;
          const updated = { ...s, [key]: val } as ExamSlot & { durMin: number };
          if (key === "start" || key === "durMin") {
            updated.end = calcEnd(String(updated.start), Number(updated.durMin));
          }
          return updated;
        }),
      },
    }));

  const handleSave = () => {
    // ── Basic Info ────────────────────────────────────────────────────────
    if (!form.name.trim()) { toast.error("Exam name is required"); return; }
    if (form.mode !== "Online" && !form.venue.trim()) { toast.error("Exam venue is required for Offline/Hybrid exams"); return; }
    if (!form.maxMarks || form.maxMarks <= 0) { toast.error("Maximum marks must be greater than 0"); return; }
    if (form.passingMarks == null || form.passingMarks < 0) { toast.error("Passing marks cannot be negative"); return; }
    if (form.passingMarks > form.maxMarks) { toast.error("Passing marks cannot exceed maximum marks"); return; }
    if (selectedGrades.length === 0) { toast.error("Select at least one grade"); return; }

    // Status is meant to move strictly forward (Scheduled → Ongoing →
    // Completed → Published). Reverting or skipping backward is sometimes a
    // legitimate correction (e.g. undoing an accidental publish), but it
    // should never happen silently from a plain dropdown — confirm first.
    if (editingId) {
      const original = exams.find(e => e.id === editingId);
      if (original && !isForwardStatusTransition(original.status, form.status)) {
        const ok = window.confirm(
          `You're changing "${form.name.trim() || "this exam"}" from "${original.status}" back to "${form.status}". ` +
          `This can hide already-published results/marks-entry access from teachers and students. Continue?`
        );
        if (!ok) return;
      }
    }

    // ── Per-grade subject schedule ───────────────────────────────────────
    for (const g of selectedGrades) {
      const gd = gradePlanData[g] || emptyGradePlanEdit();
      const allRows = gd.slotRows;

      // Reject rows that are partially filled — a subject picked with no
      // date, or a date set with no subject, is a broken timetable entry
      // that would otherwise be saved silently and confuse everyone downstream.
      const incomplete = allRows.find(s => (s.subject || s.date || s.start) && (!s.subject || !s.date || !s.start));
      if (incomplete) {
        toast.error(`${g}: complete or remove the "${incomplete.subject || "untitled"}" row — subject, date and start time are all required.`);
        return;
      }

      const rows = allRows.filter(s => s.subject && s.date && s.start && s.end);
      if (rows.length === 0) {
        toast.error(`${g}: add at least one subject exam slot with a date and start time.`);
        return;
      }

      // No subject may appear twice in the same grade's datesheet — the UI
      // dropdown already filters out already-picked subjects, but that alone
      // doesn't stop a save if two rows end up with the same subject.
      const subjectCounts = new Map<string, number>();
      rows.forEach(s => subjectCounts.set(s.subject.toLowerCase(), (subjectCounts.get(s.subject.toLowerCase()) || 0) + 1));
      const dupe = [...subjectCounts.entries()].find(([, count]) => count > 1);
      if (dupe) {
        toast.error(`${g}: "${rows.find(s => s.subject.toLowerCase() === dupe[0])?.subject}" is scheduled twice — each subject may only appear once per grade.`);
        return;
      }

      // Guard against stale allocations — an exam slot's subject must still
      // be assigned to a teacher for this grade+section(s) in Subject
      // Allocation. Catches edits to exams whose allocations changed since
      // creation (the dropdown alone can't stop a save from an older draft).
      const allowedSubjects = new Set(subjectsAssignedForGradeSections(allSubjectAssignments, g, gd.sections).map(n => n.toLowerCase()));
      const unassigned = rows.find(s => !allowedSubjects.has((s.subject || "").toLowerCase()));
      if (unassigned) {
        const scopeLabel = gd.sections.length === 0 ? g : `${g} · Section ${gd.sections.join("/")}`;
        toast.error(`${g}: "${unassigned.subject}" has no teacher assigned for ${scopeLabel} in Subject Allocation.`, {
          description: "Assign a teacher to this subject for the selected section(s) first, or remove this exam slot.",
        });
        return;
      }

      // Date sanity — no exam slot may be scheduled in the past.
      const pastDated = rows.find(s => s.date < todayStr);
      if (pastDated) {
        toast.error(`${g}: "${pastDated.subject}" is dated ${pastDated.date}, which is in the past. Pick a future date.`);
        return;
      }

      // Timetable conflict check — no student can sit two overlapping papers
      // on the same day, so block save if any grade's slots overlap in time.
      for (let a = 0; a < rows.length; a++) {
        for (let b = a + 1; b < rows.length; b++) {
          if (rows[a].date !== rows[b].date) continue;
          const overlap = rows[a].start < rows[b].end && rows[b].start < rows[a].end;
          if (overlap) {
            toast.error(`Timetable conflict in ${g}: "${rows[a].subject || "Subject"}" and "${rows[b].subject || "Subject"}" overlap on ${rows[a].date}.`);
            return;
          }
        }
      }
    }

    const gradePlans: GradePlan[] = selectedGrades.map(g => {
      const gd = gradePlanData[g] || emptyGradePlanEdit();
      const sortedSlots = [...gd.slotRows].sort((a, b) => a.date.localeCompare(b.date));
      const derived = summarizeSlots(sortedSlots);
      const section = gd.sections.length === 0 ? "All Sections" : gd.sections.length === 1 ? gd.sections[0] : "All Sections";
      return {
        grade: g, section, sections: gd.sections,
        subjects: derived.subjects,
        startDate: derived.startDate, endDate: derived.endDate || derived.startDate,
        total: Number(gd.total) || 0,
        appeared: Math.min(Number(gd.appeared) || 0, Number(gd.total) || 0),
        slots: sortedSlots.map(({ durMin: _d, ...s }) => s),
      };
    });
    const primary = gradePlans[0];
    const clean: Exam = {
      ...form,
      name: form.name.trim(),
      gradePlans,
      grade: primary.grade, section: primary.section, sections: primary.sections,
      subjects: primary.subjects, startDate: primary.startDate, endDate: primary.endDate || primary.startDate,
      total: gradePlans.reduce((a, p) => a + p.total, 0),
      appeared: gradePlans.reduce((a, p) => a + p.appeared, 0),
      slots: primary.slots,
    };
    if (editingId) {
      updateExam(editingId, { ...clean, id: editingId });
      toast.success(`"${clean.name}" updated`);
    } else {
      const id = nextExamId();
      addExam({ ...clean, id });
      const gradeLabel = gradePlans.length > 1 ? `${gradePlans.length} grades (${gradePlans.map(p => p.grade).join(", ")})` : `${primary.grade} · ${primary.section}`;
      toast.success(`"${clean.name}" created for ${gradeLabel}`);
    }
    setFormOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteExam(deleteTarget.id);
    toast.success(`"${deleteTarget.name}" deleted`);
    setDeleteTarget(null);
  };

  const filtered = useMemo(() => exams.filter(e => {
    const plans = getGradePlans(e);
    const relevantPlans = grade !== "All Grades" ? plans.filter(p => p.grade === grade) : plans;
    if (grade !== "All Grades" && relevantPlans.length === 0) return false;
    if (section !== "All Sections" && !relevantPlans.some(p => p.section === "All Sections" || p.section === section || p.sections.includes(section))) return false;
    if (examType !== "All Types" && e.type !== examType) return false;
    if (subject !== "All Subjects") {
      const matchSubjects = relevantPlans.some(p => p.subjects.toLowerCase().includes(subject.toLowerCase()));
      const matchSlot = relevantPlans.some(p => p.slots.some(s => s.subject.toLowerCase().includes(subject.toLowerCase())));
      if (!matchSubjects && !matchSlot) return false;
    }
    return true;
  }), [exams, grade, section, examType, subject]);

  const kpiTotal = exams.length;
  const kpiUpcoming = exams.filter(e => e.status === "Scheduled").length;
  const kpiCompleted = exams.filter(e => e.status === "Completed" || e.status === "Published").length;
  const kpiPublished = exams.filter(e => e.status === "Published").length;
  const kpiAppeared = exams.reduce((a, e) => a + (e.appeared || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Exam &amp; Results</h1>
              <p className="text-sm text-slate-400">Create exams, manage schedules, publish results and analyze performance across the school.</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Create Exam
          </Button>
        </div>

        <ExamSetupWizard examId={wizardExamId} onExamIdChange={setWizardExamId} step={wizardStep} onStepChange={setWizardStep}>
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors", tab === t.id ? "text-purple-600" : "text-gray-400 hover:text-gray-600")}>
              <t.icon className="w-4 h-4" /> {t.label}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-purple-600" />}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPI icon={FileText} label="Total Exams" value={String(kpiTotal)} sub="All Terms" color="text-purple-600" bg="bg-violet-50" />
          <KPI icon={CalendarDays} label="Upcoming Exams" value={String(kpiUpcoming)} sub="Scheduled" color="text-purple-600" bg="bg-blue-50" />
          <KPI icon={CheckCircle2} label="Completed Exams" value={String(kpiCompleted)} sub="This Academic Year" color="text-emerald-600" bg="bg-emerald-50" />
          <KPI icon={Eye} label="Published Results" value={String(kpiPublished)} sub="Published" color="text-amber-600" bg="bg-amber-50" />
          <KPI icon={Users} label="Students Appeared" value={kpiAppeared.toLocaleString()} sub="Across All Exams" color="text-rose-600" bg="bg-rose-50" />
          <KPI icon={TrendingUp} label="Overall Pass Rate" value="—" sub="No results recorded yet" color="text-green-600" bg="bg-green-50" />
        </div>

        {/* Filters */}
        {(tab === "overview" || tab === "schedule") && (
          <div className="flex items-end gap-3 flex-wrap bg-gray-50/60 border border-gray-100 rounded-xl px-4 py-3">
            <FilterSelect label="Academic Year" value={year} onChange={setYear} options={["2024-25", "2023-24"]} />
            <FilterSelect label="Term" value={term} onChange={setTerm} options={["All Terms", "Final Term", "Mid Term", "Unit Test"]} />
            <FilterSelect label="Grade" value={grade} onChange={setGrade} options={["All Grades", ...grades]} />
            <FilterSelect label="Section" value={section} onChange={setSection} options={SECTION_OPTIONS} />
            <FilterSelect label="Subject" value={subject} onChange={setSubject} options={["All Subjects", ...SUBJECT_OPTIONS.slice(0, 10)]} />
            <FilterSelect label="Exam Type" value={examType} onChange={setExamType} options={["All Types", ...TYPE_OPTIONS]} />
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="gap-1.5 border-gray-200 h-9 self-end"
              onClick={() => { setGrade("All Grades"); setSection("All Sections"); setSubject("All Subjects"); setExamType("All Types"); toast.success("Filters cleared"); }}>
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
            <Button variant="outline" size="icon" className="border-gray-200 h-9 w-9 self-end" onClick={() => setTab("schedule")}>
              <Calendar className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        )}

        {/* ═══ OVERVIEW ═══ (merged with the former "Exams" tab — full list, no right rail) */}
        {tab === "overview" && (
          <div className="space-y-5">
            <Card className="border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <p className="font-bold text-gray-900">All Exams <span className="text-gray-400 font-normal">({filtered.length})</span></p>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={openCreate}><Plus className="w-4 h-4" /> Create Exam</Button>
              </div>
              <ExamTable rows={filtered} onEdit={openEdit} onDelete={setDeleteTarget} onView={openView} nav={navigate} />
            </Card>

            <Card className="border border-gray-100 shadow-sm"><CardContent className="p-5">
              <div className="flex items-center justify-between mb-1"><p className="font-bold text-gray-900">Results &amp; Performance Analytics</p></div>
              <EmptyState icon={BarChart3} title="No results recorded yet"
                hint="Subject averages, grade distribution and pass-rate trends will appear here once exam marks are entered and published."
                cta="Enter Marks" onCta={() => navigate("/exams/marks")} />
            </CardContent></Card>

            <Card className="border border-gray-100 shadow-sm"><CardContent className="p-5">
              <p className="font-bold text-gray-900 mb-4">System Alerts</p>
              {(() => {
                const unscheduled = exams.filter(e => e.slots.length === 0 && e.status === "Scheduled").length;
                const pendingPublish = exams.filter(e => e.slots.length > 0 && !e.publishedToStudents).length;
                const notAppeared = exams.reduce((a, e) => a + Math.max(0, (e.total || 0) - (e.appeared || 0)), 0);
                const alerts = [
                  { icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50", count: unscheduled, desc: "Have not been scheduled yet", unit: "Exam" },
                  { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", count: pendingPublish, desc: "Timetable pending to publish", unit: "Exam" },
                  { icon: Users, color: "text-blue-500", bg: "bg-blue-50", count: notAppeared, desc: "Have not appeared in some exams", unit: "Student" },
                ];
                if (alerts.every(a => a.count === 0)) {
                  return <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-emerald-50/40">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                    <p className="text-sm font-semibold text-gray-700">All caught up — no scheduling or publishing gaps.</p>
                  </div>;
                }
                return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {alerts.map(a => (
                    <div key={a.desc} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100"><div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", a.bg)}><a.icon className={cn("w-4 h-4", a.color)} /></div><div><p className="text-sm font-bold text-gray-900">{a.count} {a.unit}{a.count === 1 ? "" : "s"}</p><p className="text-[11px] text-gray-500">{a.desc}</p></div></div>
                  ))}
                </div>;
              })()}
            </CardContent></Card>
          </div>
        )}

        {/* ═══ SCHEDULE ═══ */}
        {tab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-gray-900 text-lg">Exam Schedule</p><p className="text-xs text-gray-400">Subject-wise exam timetable across all grades</p></div>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={openCreate}><Plus className="w-4 h-4" /> Create Exam</Button>
            </div>
            {exams.filter(e => totalSlotCount(e) > 0).map(exam => (
              <Card key={exam.id} className="border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/60 to-indigo-50/30">
                  <div className="flex items-center gap-3">
                    <span className={cn("inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border", statusBadge(exam.status))}>{exam.status}</span>
                    <div>
                      <p className="font-bold text-gray-900">{exam.name}</p>
                      <p className="text-xs text-gray-500">{examGrades(exam).join(", ") || exam.grade} · {fmtRange(exam.startDate, exam.endDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-gray-200 gap-1.5 text-xs" onClick={() => openView(exam)}>
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </Button>
                    <Button size="sm" className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white gap-1.5 text-xs" onClick={() => goToWizardStep(exam.id, "rooms")}>
                      Continue Setup <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-0 divide-y divide-gray-100">
                  {getGradePlans(exam).filter(p => p.slots.length > 0).map(plan => (
                    <div key={plan.grade} className="overflow-x-auto">
                      {examGrades(exam).length > 1 && (
                        <p className="px-5 pt-3 text-[11px] font-bold uppercase tracking-wider text-purple-600">{plan.grade} · Section {plan.sections.length ? plan.sections.join(", ") : plan.section}</p>
                      )}
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 border-b border-gray-200">{["#", "Day", "Date", "Time", "Subject Code", "Subject Name"].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>)}</tr></thead>
                        <tbody>
                          {[...plan.slots].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                              <td className="px-4 py-3"><span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }}>{i + 1}</span></td>
                              <td className="px-4 py-3"><span className="text-xs font-bold text-purple-600 bg-blue-50 px-2 py-0.5 rounded-md">{fmtDay(s.date)}</span></td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">{fmtDate(s.date)}</td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTime12h(s.start)} – {formatTime12h(s.end)} <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md ml-1">{durationLabel(s.start, s.end)}</span></td>
                              <td className="px-4 py-3">{s.subjectCode ? <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md">{s.subjectCode}</span> : <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3"><span className="font-semibold text-gray-900">{s.subject}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            {exams.filter(e => totalSlotCount(e) > 0).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <CalendarDays className="w-12 h-12 mb-3 text-gray-200" />
                <p className="font-semibold">No exam schedules yet</p>
                <p className="text-sm mt-1">Create an exam with subject-wise slots to see the timetable here.</p>
                <Button className="mt-4 bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={openCreate}><Plus className="w-4 h-4" /> Create Exam</Button>
              </div>
            )}
          </div>
        )}

        </ExamSetupWizard>
      </div>

      {/* ═══ VIEW EXAM TIMETABLE DIALOG ═══ */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-4xl bg-white max-h-[90vh] overflow-hidden flex flex-col">
          {viewTarget && (<>
            <DialogHeader className="pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md shadow-blue-200">
                    <CalendarDays className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <DialogTitle className="text-base font-bold text-gray-900">{viewTarget.name}</DialogTitle>
                    <DialogDescription className="text-xs text-gray-400 mt-0">
                      {viewTarget.type} · {examGrades(viewTarget).length > 1 ? `${examGrades(viewTarget).length} grades` : `${viewTarget.grade} · Section ${viewTarget.section}`}
                    </DialogDescription>
                  </div>
                </div>
                <span className={cn("inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 mt-1", statusBadge(viewTarget.status))}>{viewTarget.status}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-3">
                {[
                  { icon: Settings, label: `${viewTarget.mode} Exam`, color: viewTarget.mode === "Online" ? "text-purple-600" : viewTarget.mode === "Hybrid" ? "text-cyan-600" : "text-orange-600", bg: viewTarget.mode === "Online" ? "bg-violet-50" : viewTarget.mode === "Hybrid" ? "bg-cyan-50" : "bg-orange-50" },
                  { icon: Calendar, label: fmtRange(viewTarget.startDate, viewTarget.endDate), color: "text-purple-600", bg: "bg-blue-50" },
                  ...(viewTarget.venue ? [{ icon: MapPin, label: viewTarget.venue, color: "text-rose-600", bg: "bg-rose-50" }] : []),
                  { icon: Award, label: `Max ${viewTarget.maxMarks} · Pass ${viewTarget.passingMarks}`, color: "text-purple-600", bg: "bg-indigo-50" },
                  { icon: Users, label: `${viewTarget.appeared || 0} / ${viewTarget.total || 0} Students`, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { icon: GraduationCap, label: examGrades(viewTarget).join(", ") || viewTarget.grade, color: "text-amber-600", bg: "bg-amber-50" },
                ].map((chip, i) => (
                  <div key={i} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold", chip.bg)}>
                    <chip.icon className={cn("w-3.5 h-3.5", chip.color)} />
                    <span className={chip.color}>{chip.label}</span>
                  </div>
                ))}
              </div>
              {/* Grade tabs — only shown for exams spanning more than one grade */}
              {examGrades(viewTarget).length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  {getGradePlans(viewTarget).map(p => (
                    <button key={p.grade} type="button" onClick={() => setViewGrade(p.grade)}
                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        viewGrade === p.grade ? "bg-purple-600 text-white shadow-sm" : "bg-gray-50 text-gray-600 hover:bg-gray-100")}>
                      {p.grade}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", viewGrade === p.grade ? "bg-white/20" : "bg-gray-200 text-gray-500")}>{p.slots.length}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Grade-wise publish — each grade's timetable can go live to its
                  students/parents independently of the other grades in this exam. */}
              {(() => {
                const activeForPublish = getGradePlans(viewTarget).find(p => p.grade === viewGrade) || getGradePlans(viewTarget)[0];
                const isPublished = !!activeForPublish.publishedToStudents;
                return (
                  <div className="flex items-center justify-between gap-3 flex-wrap mt-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-xs text-gray-600">
                      <b>{activeForPublish.grade}</b> timetable is {isPublished ? <span className="text-emerald-600 font-bold">published</span> : <span className="text-gray-400 font-bold">not published</span>} to students
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="border-gray-200 gap-1.5 h-7 text-xs"
                        onClick={() => printExamTimetable(viewTarget, activeForPublish.grade)}>
                        <Printer className="w-3 h-3" /> Print {activeForPublish.grade}
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-200 gap-1.5 h-7 text-xs"
                        onClick={() => { downloadTimetablePDF(viewTarget, activeForPublish.grade); toast.success(`${activeForPublish.grade} timetable PDF downloaded`); }}>
                        <Download className="w-3 h-3" /> Download {activeForPublish.grade} PDF
                      </Button>
                      <Button size="sm" variant={isPublished ? "outline" : "default"} className={isPublished ? "border-gray-200 gap-1.5 h-7 text-xs" : "bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-7 text-xs"}
                        onClick={async () => {
                          if (!isPublished) {
                            const ok = await confirmPublishToStudents(viewTarget, activeForPublish.grade);
                            if (!ok) return;
                          }
                          setGradePublished(viewTarget.id, activeForPublish.grade, !isPublished);
                          toast.success(`${activeForPublish.grade} ${isPublished ? "unpublished" : "published"} ${isPublished ? "from" : "to"} students`);
                        }}>
                        <Send className="w-3 h-3" /> {isPublished ? "Unpublish" : `Publish ${activeForPublish.grade}`}
                      </Button>
                    </div>
                  </div>
                );
              })()}
              {/* Per-subject marks-entry progress — how far along grading is for
                  this grade's plan, without opening Marks Entry subject by subject. */}
              {viewProgress && (() => {
                const activePlan = getGradePlans(viewTarget).find(p => p.grade === viewGrade) || getGradePlans(viewTarget)[0];
                const gradeStudents = viewProgress.students.filter(s => canonGrade(s.grade) === canonGrade(activePlan.grade));
                if (activePlan.slots.length === 0 || gradeStudents.length === 0) return null;
                const bySubject = activePlan.slots.map(slot => {
                  const graded = gradeStudents.filter(s => typeof viewProgress.examMarks[viewTarget.id]?.[slot.subject]?.[s.id] === "number").length;
                  return { subject: slot.subject, graded, total: gradeStudents.length };
                });
                const overallGraded = bySubject.reduce((a, s) => a + s.graded, 0);
                const overallTotal = bySubject.reduce((a, s) => a + s.total, 0);
                const allDone = bySubject.every(s => s.graded === s.total);
                return (
                  <div className="mt-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Marks Entry Progress — {activePlan.grade}</span>
                      <span className={cn("text-[11px] font-bold", allDone ? "text-emerald-600" : "text-amber-600")}>
                        {overallGraded}/{overallTotal} students graded
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bySubject.map(s => (
                        <span key={s.subject} title={`${s.graded}/${s.total} students graded`}
                          className={cn("inline-flex items-center gap-1 text-[10px] font-semibold rounded-md border px-1.5 py-0.5",
                            s.graded === s.total ? "bg-emerald-50 text-emerald-700 border-emerald-200" : s.graded === 0 ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
                          {s.subject} {s.graded}/{s.total}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              {(() => {
                const activePlan = getGradePlans(viewTarget).find(p => p.grade === viewGrade) || getGradePlans(viewTarget)[0];
                return activePlan.slots.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["#", "Code", "Subject", "Date", "Day", "Start", "End", "Duration"].map(h =>
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {[...activePlan.slots].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                          <td className="px-4 py-3.5">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }}>{i + 1}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            {s.subjectCode ? <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md">{s.subjectCode}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }} />
                              <span className="font-semibold text-gray-900">{s.subject}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-gray-700 whitespace-nowrap font-medium">{fmtDate(s.date)}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: `${SLOT_COLORS[i % SLOT_COLORS.length]}18`, color: SLOT_COLORS[i % SLOT_COLORS.length] }}>
                              {fmtDay(s.date)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-700 font-medium whitespace-nowrap">{formatTime12h(s.start)}</td>
                          <td className="px-4 py-3.5 text-gray-700 font-medium whitespace-nowrap">{formatTime12h(s.end)}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{durationLabel(s.start, s.end)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <CalendarDays className="w-10 h-10 mb-2 text-gray-200" />
                  <p className="font-semibold">No subject slots scheduled yet{examGrades(viewTarget).length > 1 ? ` for ${activePlan.grade}` : ""}</p>
                  <p className="text-sm mt-1">Edit this exam to add a subject-wise timetable.</p>
                  <Button className="mt-4 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => { const v = viewTarget; setViewTarget(null); openEdit(v); }}>
                    <Pencil className="w-4 h-4" /> Edit &amp; Add Schedule
                  </Button>
                </div>
              );
              })()}
            </div>

            <DialogFooter className="pt-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2 mr-auto">
                <Button variant="outline" className="border-gray-200 gap-1.5" onClick={() => printExamTimetable(viewTarget!)}><Printer className="w-4 h-4" /> Print</Button>
                <Button variant="outline" className="border-gray-200 gap-1.5" onClick={() => { downloadTimetablePDF(viewTarget!); toast.success("Timetable PDF downloaded"); }}><Download className="w-4 h-4" /> Download PDF</Button>
                <Button variant="outline" className="border-gray-200 gap-1.5" onClick={() => { exportExamCSV(viewTarget!); toast.success("Schedule downloaded"); }}><Download className="w-4 h-4" /> Export CSV</Button>
              </div>
              <Button variant="outline" className="border-gray-200" onClick={() => setViewTarget(null)}>Close</Button>
              <Button variant="outline" className="border-gray-200 gap-1.5" onClick={() => { const v = viewTarget; setViewTarget(null); openEdit(v); }}>
                <Pencil className="w-4 h-4" /> Edit Exam
              </Button>
              {viewTarget && totalSlotCount(viewTarget) > 0 && (
                <Button className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white gap-1.5" onClick={() => { const v = viewTarget!; setViewTarget(null); goToWizardStep(v.id, "rooms"); }}>
                  Continue Setup <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ═══ CREATE / EDIT EXAM DIALOG ═══ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl bg-white max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-3 border-b border-gray-100 shrink-0">
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md shadow-blue-200">
                <FileText className="w-4 h-4 text-white" />
              </span>
              {editingId ? "Edit Exam" : "Create Exam"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400 ml-11">
              {editingId ? "Update exam details and subject-wise schedule." : "Create a new exam with a complete subject-wise timetable for any grade."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 pt-1 -mx-1">
            {/* Basic Info */}
            <div className="py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-3 flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Exam Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Exam Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Final Term Examination 2025" className="border-gray-200" />
                </div>
                {/* Exam Mode — Online / Offline / Hybrid */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Exam Mode</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODE_OPTIONS.map(m => (
                      <button key={m.value} type="button" onClick={() => setForm(f => ({ ...f, mode: m.value }))}
                        className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-all",
                          form.mode === m.value ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/40")}>
                        <span className={cn("text-sm font-bold", form.mode === m.value ? "text-blue-700" : "text-gray-700")}>{m.label}</span>
                        <span className="text-[10px] text-gray-400 leading-tight">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Exam Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ExamStatus }))}>
                    <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Grades — an exam like "Mid Term - 1" can span several grades under
                    one name; each gets its own sections + subject schedule below. */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Grades <span className="text-red-500">*</span></Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {grades.map(g => {
                      const checked = selectedGrades.includes(g);
                      return (
                        <label key={g} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all select-none",
                          checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-200")}>
                          <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleGrade(g)} />
                          {g}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {selectedGrades.length === 0 ? "Select every grade sitting this exam." : `${selectedGrades.length} grade${selectedGrades.length === 1 ? "" : "s"} selected — each gets its own sections and subject schedule below.`}
                  </p>
                </div>
                {/* Venue + marks — most relevant for Offline/Hybrid paper exams */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Exam Venue {form.mode !== "Online" && <span className="text-gray-300 font-normal">(building / campus)</span>}</Label>
                  <Input value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} placeholder="e.g. Main Block, Examination Hall" className="border-gray-200" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Maximum Marks</Label>
                  <Input type="number" min={1} value={form.maxMarks || ""} onChange={e => setForm(f => ({ ...f, maxMarks: Number(e.target.value) }))} placeholder="100" className="border-gray-200" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Passing Marks</Label>
                  <Input type="number" min={0} value={form.passingMarks || ""} onChange={e => setForm(f => ({ ...f, passingMarks: Number(e.target.value) }))} placeholder="40" className="border-gray-200" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Exam Fee (QAR) <span className="text-gray-300 font-normal">(optional)</span></Label>
                  <Input type="number" min={0} value={form.examFee || ""} onChange={e => setForm(f => ({ ...f, examFee: Number(e.target.value) }))} placeholder="0 — free" className="border-gray-200" />
                  <p className="text-[10px] text-gray-400 mt-1">A real invoice is generated per student when seats are allocated in Room Allocation.</p>
                </div>
              </div>
            </div>

            {/* Per-grade sections + subject-wise schedule. Each selected grade gets
                its own tab since different grades sit different subjects/dates. */}
            <div className="py-4 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 flex items-center gap-1.5 mb-3">
                <CalendarDays className="w-3 h-3" /> Grade-wise Schedule
              </p>

              {selectedGrades.length === 0 ? (
                <div className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-1.5 text-gray-400">
                  <GraduationCap className="w-7 h-7" />
                  <span className="text-sm font-semibold">Select at least one grade above</span>
                  <span className="text-xs">Its sections and subject-wise datesheet will be built here</span>
                </div>
              ) : (
                <>
                  {/* Grade tabs */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-4 border-b border-gray-100 pb-3">
                    {selectedGrades.map(g => {
                      const gd = gradePlanData[g] || emptyGradePlanEdit();
                      return (
                        <button key={g} type="button" onClick={() => setActiveGrade(g)}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                            activeGrade === g ? "bg-purple-600 text-white shadow-sm" : "bg-gray-50 text-gray-600 hover:bg-gray-100")}>
                          {g}
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", activeGrade === g ? "bg-white/20" : "bg-gray-200 text-gray-500")}>
                            {gd.slotRows.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeGrade && (() => {
                    const g = activeGrade;
                    const gd = gradePlanData[g] || emptyGradePlanEdit();
                    return (
                      <div>
                        {/* Sections + roll counts for this grade */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <Label className="text-xs font-semibold text-gray-600 mb-1 block">Sections — {g}</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {SECTION_OPTIONS.map(sec => {
                                const isAll = sec === "All Sections";
                                const checked = isAll ? gd.sections.length === 0 : gd.sections.includes(sec);
                                return (
                                  <label key={sec} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-[11px] font-semibold transition-all select-none",
                                    checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-200")}>
                                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleGradeSection(g, sec)} />
                                    {sec}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs font-semibold text-gray-600 mb-1 block">Total Students</Label>
                              <Input type="number" min={0} value={gd.total || ""} onChange={e => updateGradeCount(g, "total", Number(e.target.value))} placeholder="0" className="border-gray-200" />
                            </div>
                            <div>
                              <Label className="text-xs font-semibold text-gray-600 mb-1 block">Appeared</Label>
                              <Input type="number" min={0} value={gd.appeared || ""} onChange={e => updateGradeCount(g, "appeared", Number(e.target.value))} placeholder="0" className="border-gray-200" />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Subject-wise Exam Schedule — {g}</p>
                          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-blue-200 text-purple-600 hover:bg-blue-50" onClick={() => addSlotRow(g)}>
                            <PlusCircle className="w-3.5 h-3.5" /> Add Subject
                          </Button>
                        </div>

                        {gd.slotRows.length === 0 ? (
                          <button onClick={() => addSlotRow(g)}
                            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all">
                            <PlusCircle className="w-7 h-7" />
                            <span className="text-sm font-semibold">Add subject exam slots for {g}</span>
                            <span className="text-xs">Define date, time, duration, invigilator and room per subject</span>
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-12 gap-2 px-1">
                              <span className="col-span-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Subject</span>
                              <span className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</span>
                              <span className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start</span>
                              <span className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Duration</span>
                              <span className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ends</span>
                              <span className="col-span-1" />
                            </div>
                            {gd.slotRows.map((slot, i) => (
                              <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50/30">
                                <div className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-3">
                                    {(() => {
                                      // Only subjects actually ASSIGNED to a teacher in Subject
                                      // Allocation — for the section(s) this grade plan covers —
                                      // may be scheduled for an exam. The global Subject Codes
                                      // registry (subjectCodeMap) resolves the code with multi-
                                      // strategy matching so minor name differences don't lose the code.
                                      const allocatedNames = subjectsAssignedForGradeSections(allSubjectAssignments, g, gd.sections);
                                      const gradeSubjects = allocatedNames
                                        .map(name => ({ code: subjectCodeMap.get(name), name }))
                                        .sort((a, b) => a.name.localeCompare(b.name));
                                      const usedNames = new Set(gd.slotRows.filter((_, idx) => idx !== i).map(s => s.subject).filter(Boolean).map(n => n.toLowerCase()));
                                      const available = gradeSubjects.filter(sub => !usedNames.has(sub.name.toLowerCase()));
                                      const scopeLabel = gd.sections.length === 0 ? g : `${g} · Section ${gd.sections.join("/")}`;
                                      return (
                                        <Select value={slot.subject || ""} onValueChange={name => {
                                          const chosen = gradeSubjects.find(sub => sub.name === name);
                                          // Resolve code: prefer the registry match; fall back to the
                                          // subjectCodeMap multi-strategy lookup on the raw name.
                                          const resolvedCode = chosen?.code || subjectCodeMap.get(name);
                                          setGradePlanData(d => ({
                                            ...d,
                                            [g]: { ...d[g], slotRows: d[g].slotRows.map((s, idx) => idx === i ? { ...s, subjectCode: resolvedCode, subject: name } : s) },
                                          }));
                                        }}>
                                          <SelectTrigger className="h-9 text-xs border-gray-200 bg-white">
                                            <SelectValue placeholder="Select Subject">
                                              {slot.subject
                                                ? slot.subjectCode
                                                  ? <span className="flex items-center gap-1.5">
                                                      <span className="font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded text-[10px]">{slot.subjectCode}</span>
                                                      <span>{slot.subject}</span>
                                                    </span>
                                                  : slot.subject
                                                : undefined}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent className="max-h-52">
                                            {available.length > 0
                                              ? available.map(sub => (
                                                  <SelectItem key={sub.name} value={sub.name}>
                                                    <span className="flex items-center gap-2">
                                                      {sub.code
                                                        ? <span className="font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded text-[10px] shrink-0">{sub.code}</span>
                                                        : null}
                                                      <span>{sub.name}</span>
                                                    </span>
                                                  </SelectItem>
                                                ))
                                              : <div className="px-3 py-2 text-xs text-gray-400 max-w-[220px]">
                                                  {gradeSubjects.length === 0 ? `No subjects assigned to ${scopeLabel} yet. Assign subjects & teachers in Subject Allocation first.` : `All subjects assigned to ${scopeLabel} are already scheduled.`}
                                                </div>}
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                  </div>
                                  <div className="col-span-2 relative">
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      aria-label="Open calendar"
                                      onClick={(e) => {
                                        const input = e.currentTarget.parentElement?.querySelector('input[type="date"]') as (HTMLInputElement & { showPicker?: () => void }) | null;
                                        if (!input) return;
                                        if (typeof input.showPicker === "function") {
                                          try { input.showPicker(); } catch { input.focus(); }
                                        } else {
                                          input.focus();
                                        }
                                      }}
                                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                                    >
                                      <CalendarDays className="h-3.5 w-3.5" />
                                    </button>
                                    <Input
                                      type="date"
                                      value={slot.date}
                                      min={todayStr}
                                      onClick={(e) => {
                                        const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                                        if (typeof input.showPicker === "function") {
                                          try { input.showPicker(); } catch { /* fall back to native click behavior */ }
                                        }
                                      }}
                                      onChange={e => updateSlotRow(g, i, "date", e.target.value)}
                                      className={cn(
                                        "h-9 text-xs border-gray-200 bg-white pl-7 pr-2 w-full cursor-pointer",
                                        "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer",
                                        !slot.date && slot.subject ? "border-rose-300 focus-visible:ring-rose-300" : ""
                                      )}
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <Input type="time" value={slot.start} onChange={e => updateSlotRow(g, i, "start", e.target.value)} className="h-9 text-xs border-gray-200 bg-white px-2 w-full" />
                                  </div>
                                  <div className="col-span-2">
                                    <Select value={String(slot.durMin)} onValueChange={v => updateSlotRow(g, i, "durMin", Number(v))}>
                                      <SelectTrigger className="h-9 text-xs border-gray-200 bg-white"><SelectValue /></SelectTrigger>
                                      <SelectContent>{DURATION_OPTIONS.map(d => <SelectItem key={d.min} value={String(d.min)}>{d.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-2 flex items-center">
                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded-md w-full text-center whitespace-nowrap">{slot.end ? formatTime12h(slot.end) : "—"}</span>
                                  </div>
                                  <div className="col-span-1 flex justify-end">
                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeSlotRow(g, i)}>
                                      <Minus className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button onClick={() => addSlotRow(g)} className="w-full border border-dashed border-blue-200 rounded-xl py-2 flex items-center justify-center gap-2 text-xs text-blue-500 font-semibold hover:bg-blue-50 transition-colors">
                              <PlusCircle className="w-3.5 h-3.5" /> Add Another Subject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-gray-100 shrink-0">
            <Button variant="outline" className="border-gray-200" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 shadow-md shadow-blue-200" onClick={handleSave}>
              <CheckCircle2 className="w-4 h-4" /> {editingId ? "Save Changes" : "Create Exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE CONFIRM ═══ */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <span className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><Trash2 className="w-4 h-4 text-rose-600" /></span> Delete Exam
            </DialogTitle>
            <DialogDescription>This permanently removes <strong>{deleteTarget?.name}</strong> ({deleteTarget?.grade} · {deleteTarget?.section}) from all views. This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteImpact && (deleteImpact.markedStudents > 0 || deleteImpact.seatingRooms > 0) && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This exam also has real data that will be deleted with it:
                {deleteImpact.markedStudents > 0 && <> <strong>{deleteImpact.markedStudents} students'</strong> entered marks</>}
                {deleteImpact.markedStudents > 0 && deleteImpact.seatingRooms > 0 && " and"}
                {deleteImpact.seatingRooms > 0 && <> <strong>{deleteImpact.seatingRooms} allocated room{deleteImpact.seatingRooms === 1 ? "" : "s"}</strong>' seating</>}.
              </span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-gray-200" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5" onClick={confirmDelete}><Trash2 className="w-4 h-4" /> Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Exams;

// Publishing an exam here is ONLY a timetable announcement — "this exam is
// scheduled, go see the dates/times". It never releases marks or results:
// that publish flow lives exclusively in the Report Card and Gradebook
// sections, each with their own explicit publish action. Keeping the two
// separate avoids the exam-status dropdown (a manually-chosen label an
// admin can set to "Published" the moment an exam is created, long before
// it's actually happened) ever being read as "results are ready".
async function confirmPublishToStudents(exam: Exam, gradeFilter?: string): Promise<boolean> {
  return window.confirm(
    `Publish the "${exam.name}" timetable${gradeFilter ? ` for ${gradeFilter}` : ""}? ` +
    `Students, parents, assigned subject teachers, the class teacher, and school leadership will be notified immediately by email and in-app.`
  );
}

// ─── Exam table ───────────────────────────────────────────────────────────────
function ExamTable({
  rows, onEdit, onDelete, onView, nav, compact,
}: {
  rows: Exam[];
  onEdit: (e: Exam) => void;
  onDelete: (e: Exam) => void;
  onView: (e: Exam) => void;
  nav: (path: string) => void;
  compact?: boolean;
}) {
  const hasResults = (e: Exam) => e.status === "Completed" || e.status === "Published";
  return (
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Exam Name", "Type", "Grade / Section", "Subjects", "Exam Dates", "Appeared", "Status", "Actions"].map(h =>
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" /><p>No exams match your filters.</p>
              </td></tr>
            ) : rows.map(e => {
              const rate = e.total > 0 ? ((e.appeared / e.total) * 100).toFixed(1) : "0";
              const withResults = hasResults(e);
              return (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors cursor-pointer" onClick={() => onView(e)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        e.status === "Ongoing" ? "bg-amber-50" : e.status === "Completed" ? "bg-emerald-50" : e.status === "Scheduled" ? "bg-blue-50" : "bg-green-50")}>
                        <FileText className={cn("w-3.5 h-3.5",
                          e.status === "Ongoing" ? "text-amber-500" : e.status === "Completed" ? "text-emerald-500" : e.status === "Scheduled" ? "text-blue-500" : "text-green-500")} />
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">{e.name}</span>
                        {totalSlotCount(e) > 0 && (
                          <span className="ml-2 text-[10px] font-semibold text-purple-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">{totalSlotCount(e)} slots</span>
                        )}
                        {examGrades(e).length > 1 && (
                          <span className="ml-2 text-[10px] font-semibold text-purple-600 bg-violet-50 px-1.5 py-0.5 rounded-md">{examGrades(e).length} grades</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex flex-col gap-1">
                      <span>{e.type}</span>
                      <span className={cn("inline-flex w-fit items-center text-[10px] font-bold rounded-md border px-1.5 py-0.5", modeBadge(e.mode))}>{e.mode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap max-w-[200px]">
                    <span className="font-medium text-gray-800">{examGrades(e).join(", ") || e.grade}</span>
                    {examGrades(e).length <= 1 && (
                      <span className="text-gray-400"> · {(e.sections ?? []).length > 0 ? (e.sections ?? []).join(", ") : e.section}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.subjects}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtRange(e.startDate, e.endDate)}</td>
                  <td className="px-4 py-3">
                    {e.appeared > 0
                      ? <><p className="font-semibold text-gray-900">{e.appeared} / {e.total}</p><p className="text-[11px] text-emerald-600 font-semibold">{rate}%</p></>
                      : <span className="text-gray-400 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={cn("inline-flex items-center text-xs font-semibold rounded-full border px-2.5 py-1", statusBadge(e.status))}>{e.status}</span>
                      <div className="flex items-center gap-1">
                        <span title="Visible to teachers for marks entry" className={cn("inline-flex items-center text-[9px] font-bold rounded-md border px-1.5 py-0.5",
                          e.publishedToTeachers ? "bg-blue-50 text-purple-600 border-blue-200" : "bg-gray-50 text-gray-400 border-gray-200")}>
                          Teachers {e.publishedToTeachers ? "✓" : "—"}
                        </span>
                        <span title="Visible to students/parents" className={cn("inline-flex items-center text-[9px] font-bold rounded-md border px-1.5 py-0.5",
                          e.publishedToStudents ? "bg-violet-50 text-purple-600 border-violet-200" : "bg-gray-50 text-gray-400 border-gray-200")}>
                          Students {e.publishedToStudents ? "✓" : "—"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-100 shadow-lg rounded-xl p-1 z-50">
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => onView(e)}>
                          <Eye className="w-4 h-4 text-blue-500" /> View Timetable
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => onEdit(e)}>
                          <Pencil className="w-4 h-4 text-gray-500" /> Edit Exam
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {/* Publish workflow — Teachers first, then Students */}
                        {!e.publishedToTeachers ? (
                          <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => { updateExam(e.id, { publishedToTeachers: true }); toast.success(`"${e.name}" published to teachers`); }}>
                            <UserCheck className="w-4 h-4 text-blue-500" /> Publish to Teachers
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg text-gray-400" onClick={() => { updateExam(e.id, { publishedToTeachers: false }); toast.info("Unpublished from teachers"); }}>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Teachers Notified
                          </DropdownMenuItem>
                        )}
                        {!e.publishedToStudents ? (
                          <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={async () => {
                            const ok = await confirmPublishToStudents(e);
                            if (!ok) return;
                            updateExam(e.id, { publishedToStudents: true });
                            toast.success(`"${e.name}" published to students & parents`);
                          }}>
                            <Send className="w-4 h-4 text-violet-500" /> Publish to Students
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg text-gray-400" onClick={() => { updateExam(e.id, { publishedToStudents: false }); toast.info("Unpublished from students"); }}>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Students Notified
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {withResults && (
                          <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => nav("/exams/results")}>
                            <ClipboardList className="w-4 h-4 text-emerald-500" /> View Results
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => nav("/exams/seating")}>
                          <MapPin className="w-4 h-4 text-violet-500" /> Room Allocation
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => printExamTimetable(e)}>
                          <Printer className="w-4 h-4 text-gray-500" /> Print Timetable
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => { downloadTimetablePDF(e); toast.success("Timetable PDF downloaded"); }}>
                          <Download className="w-4 h-4 text-gray-500" /> Download Timetable (PDF)
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg" onClick={() => { exportExamCSV(e); toast.success("Schedule downloaded"); }}>
                          <Download className="w-4 h-4 text-gray-500" /> Export to CSV
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 cursor-pointer rounded-lg text-red-600 focus:text-red-600" onClick={() => onDelete(e)}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardContent>
  );
}
