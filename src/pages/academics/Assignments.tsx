import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { useGrades } from '@/contexts/CurriculumContext';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import * as XLSX from "xlsx";
import { pushNotify } from "@/lib/pushNotifications";
import { useTranslation } from "react-i18next";
import {
  ClipboardList, FileText, Plus, ChevronRight, ChevronLeft,
  Filter, RotateCcw, Settings, Calendar, Eye, BarChart3,
  LayoutTemplate, UploadCloud, CheckSquare, MessageSquare, Download, Clock, Trash2,
  X, Search, Star, Edit2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignmentRow {
  id: string; title: string; subject: string; type: string;
  grade: string; section: string; teacher: string;
  dueDate: string; totalMarks: number;
  submitted?: number; total?: number; status: string; createdAt: string;
  instructions?: string;
}

interface StudentRow {
  id?: string; uid?: string; name?: string; displayName?: string;
  grade?: string; gradeLevel?: string; section?: string;
}

interface Submission {
  id: string; assignmentId: string; studentId: string; studentName: string;
  grade?: string; section?: string; submittedAt: string; content?: string;
  attachments?: any[]; status?: string; marks?: number; feedback?: string; gradedAt?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadSubs(): Promise<Submission[]> {
  try { return await smartDb.getAll("AssignmentSubmission", undefined) as Submission[]; } catch { return []; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECTS = ["Mathematics","English","Science","Arabic","Islamic Studies","Social Studies","Computer Science","Physical Education","History","Biology","Physics","Chemistry"];
const TYPES    = ["Homework","Project","Essay","Lab Report","Presentation","Quiz","Worksheet","Research Work","Lab Activity","Reading Assignment","Writing Assignment","Assessment","Practical Work","Group Activity","Art & Craft Activity","Notebook Work"];

const SUBJECT_BADGE: Record<string, string> = {
  Mathematics:         "bg-purple-50 text-purple-600",
  Science:             "bg-emerald-50 text-emerald-600",
  English:             "bg-blue-50 text-purple-600",
  "Islamic Studies":   "bg-teal-50 text-teal-600",
  Arabic:              "bg-pink-50 text-pink-600",
  "Social Studies":    "bg-amber-50 text-amber-600",
  "Computer Science":  "bg-indigo-50 text-purple-600",
  "Physical Education":"bg-rose-50 text-rose-600",
  History:             "bg-orange-50 text-orange-600",
  Biology:             "bg-green-50 text-green-600",
  Physics:             "bg-sky-50 text-sky-600",
  Chemistry:           "bg-violet-50 text-purple-600",
};

const STATUS_BADGE: Record<string, string> = {
  Active:   "bg-emerald-100 text-emerald-700",
  Closed:   "bg-slate-100 text-slate-600",
  Returned: "bg-amber-100 text-amber-700",
  Draft:    "bg-blue-100 text-blue-700",
  Upcoming: "bg-orange-100 text-orange-700",
  Archived: "bg-slate-100 text-slate-500",
};

function normalizeGrade(g: string) {
  return (g || "").toLowerCase().replace("grade ", "").trim();
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ color, data }: { color: string; data: number[] }) {
  const w = 56, h = 22;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / range) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ assignment, onClose }: { assignment: AssignmentRow; onClose: () => void }) {
  const { t } = useTranslation();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [gradingStudentId, setGradingStudentId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");

  useEffect(() => {
    Promise.all([
      smartDb.getAll("Student", undefined),
    ]).then(([studs]) => {
      const all = (studs || []) as StudentRow[];
      const filtered = all.filter((s: StudentRow) => {
        const sGrade = normalizeGrade((s as any).grade || (s as any).gradeLevel || "");
        const aGrade = normalizeGrade(assignment.grade || "");
        if (sGrade !== aGrade) return false;
        if (assignment.section) {
          const sSection = ((s as any).section || "").toLowerCase().trim();
          const aSection = assignment.section.toLowerCase().trim();
          if (sSection !== aSection) return false;
        }
        return true;
      });
      setStudents(filtered);
    }).catch(() => {});
    loadSubs().then(all => setSubs(all.filter(s => s.assignmentId === assignment.id)));
  }, [assignment.id, assignment.grade, assignment.section]);

  function getSubForStudent(studentId: string) {
    return subs.find(s => s.studentId === studentId);
  }

  const filteredStudents = useMemo(() =>
    students.filter(s => {
      const name = ((s as any).name || (s as any).displayName || "").toLowerCase();
      return name.includes(search.toLowerCase());
    }), [students, search]);

  const totalStudents = students.length;
  const submittedCount = subs.length;
  const notSubmittedCount = Math.max(0, totalStudents - submittedCount);
  const submissionRate = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

  async function saveGrade(studentId: string) {
    const score = Number(scoreInput);
    const existing = subs.find(s => s.assignmentId === assignment.id && s.studentId === studentId);
    try {
      if (existing) {
        await smartDb.update("AssignmentSubmission", existing.id, {
          marks: score, feedback: feedbackInput, status: "graded", gradedAt: new Date().toISOString(),
        });
      } else {
        await smartDb.create("AssignmentSubmission", {
          assignmentId: assignment.id,
          studentId,
          studentName: (students.find(s => (s.id || s.uid) === studentId) as any)?.name || "",
          submittedAt: new Date().toISOString(),
          marks: score,
          feedback: feedbackInput,
          status: "graded",
          gradedAt: new Date().toISOString(),
        });
      }
      const all = await loadSubs();
      setSubs(all.filter(s => s.assignmentId === assignment.id));
    } catch {
      toast.error(t('admin.academics.assignments.toastFailedSaveGrade'));
      return;
    }
    const gradedStudent = students.find(s => (s as any).id === studentId || (s as any).uid === studentId);
    const gradedName = (gradedStudent as any)?.name || "";
    setGradingStudentId(null);
    setScoreInput(""); setFeedbackInput("");
    toast.success(t('admin.academics.assignments.toastGradeSaved'));
    // Notify the student that their assignment has been marked
    pushNotify({
      title: t('admin.academics.assignments.notifyMarkedTitle', { title: assignment.title }),
      message: t('admin.academics.assignments.notifyGradedMessage', { subject: assignment.subject, score, totalMarks: assignment.totalMarks }),
      audienceRole: "student",
      recipientUid: studentId,
      recipientName: gradedName,
      category: "academic",
      entity: "assignment",
    }).catch(() => {});
  }

  function exportExcel() {
    const rows = students.map(s => {
      const sid = (s as any).id || (s as any).uid || "";
      const name = (s as any).name || (s as any).displayName || "";
      const sub = getSubForStudent(sid);
      return {
        [t('admin.academics.assignments.excelHeaderStudentName')]: name,
        [t('admin.academics.assignments.excelHeaderStatus')]: sub ? (sub.marks !== undefined ? "Graded" : "Submitted") : "Not Submitted",
        [t('admin.academics.assignments.excelHeaderSubmittedOn')]: sub ? new Date(sub.submittedAt).toLocaleDateString() : "",
        [t('admin.academics.assignments.excelHeaderScore')]: sub?.marks !== undefined ? sub.marks : "",
        [t('admin.academics.assignments.excelHeaderOutOf')]: assignment.totalMarks,
        [t('admin.academics.assignments.excelHeaderFeedback')]: sub?.feedback || "",
      };
    });
    const statusKey = t('admin.academics.assignments.excelHeaderStatus');
    const submitted = rows.filter(r => (r as any)[statusKey] !== "Not Submitted");
    const notSubmitted = rows.filter(r => (r as any)[statusKey] === "Not Submitted");

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(submitted.length ? submitted : [{ "Info": t('admin.academics.assignments.excelNoSubmissions') }]);
    const ws2 = XLSX.utils.json_to_sheet(notSubmitted.length ? notSubmitted : [{ "Info": t('admin.academics.assignments.excelAllSubmitted') }]);
    XLSX.utils.book_append_sheet(wb, ws1, "Submitted");
    XLSX.utils.book_append_sheet(wb, ws2, "Not Submitted");
    XLSX.writeFile(wb, `${assignment.title.replace(/\s+/g,"_")}_submissions.xlsx`);
    toast.success(t('admin.academics.assignments.toastExportedExcel'));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md", SUBJECT_BADGE[assignment.subject] || "bg-slate-100 text-slate-600")}>
                {assignment.subject}
              </span>
              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", STATUS_BADGE[assignment.status] || "bg-slate-100 text-slate-600")}>
                {assignment.status}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-2">{assignment.title}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
              <span>{assignment.grade}{assignment.section ? t('admin.academics.assignments.sectionLabel', { section: assignment.section }) : ""}</span>
              {assignment.teacher && <span>· {assignment.teacher}</span>}
              {assignment.dueDate && <span>{t('admin.academics.assignments.dueLabel', { date: new Date(assignment.dueDate).toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric"}) })}</span>}
              <span>{t('admin.academics.assignments.marksSuffix', { marks: assignment.totalMarks })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ms-4 flex-shrink-0">
            <button onClick={exportExcel}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5"/> {t('admin.academics.assignments.exportExcelButton')}
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4"/>
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-slate-50/50 border-b border-slate-100">
          {[
            { label: t('admin.academics.assignments.statsTotalStudents'), value: totalStudents, color: "text-slate-900" },
            { label: t('admin.academics.assignments.statsSubmitted'), value: submittedCount, color: "text-emerald-600" },
            { label: t('admin.academics.assignments.statsNotSubmitted'), value: notSubmittedCount, color: "text-rose-500" },
            { label: t('admin.academics.assignments.statsSubmissionRate'), value: `${submissionRate}%`, color: "text-purple-600" },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 text-center">
              <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Search + Table */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('admin.academics.assignments.searchStudentsPlaceholder')}
                className="w-full h-9 ps-9 pe-3 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {students.length === 0 ? t('admin.academics.assignments.noStudentsFoundGradeSection') : t('admin.academics.assignments.noStudentsMatchSearch')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {[
                      "#",
                      t('admin.academics.assignments.excelHeaderStudentName'),
                      t('admin.academics.assignments.excelHeaderStatus'),
                      t('admin.academics.assignments.excelHeaderSubmittedOn'),
                      t('admin.academics.assignments.tableHeaderScoreMarks'),
                      t('admin.academics.assignments.excelHeaderFeedback'),
                      t('admin.academics.assignments.tableHeaderActions'),
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredStudents.map((st, idx) => {
                    const sid = (st as any).id || (st as any).uid || "";
                    const name = (st as any).name || (st as any).displayName || "—";
                    const sub = getSubForStudent(sid);
                    const isGraded = sub && sub.marks !== undefined;
                    const isSubmitted = !!sub;
                    const isGrading = gradingStudentId === sid;
                    return (
                      <>
                        <tr key={sid} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800 text-sm">{name}</p>
                          </td>
                          <td className="px-4 py-3">
                            {isGraded ? (
                              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700">✅ {t('admin.academics.assignments.badgeGraded')}</span>
                            ) : isSubmitted ? (
                              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-700">📤 {t('admin.academics.assignments.badgeSubmittedEmoji')}</span>
                            ) : (
                              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-600">⏳ {t('admin.academics.assignments.badgeNotSubmittedEmoji')}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {sub ? new Date(sub.submittedAt).toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                            {sub?.marks !== undefined ? `${sub.marks} / ${assignment.totalMarks}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">
                            {sub?.feedback || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {isSubmitted && (
                              <button
                                onClick={() => { setGradingStudentId(isGrading ? null : sid); setScoreInput(String(sub?.marks ?? "")); setFeedbackInput(sub?.feedback || ""); }}
                                className="h-7 px-3 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors border border-purple-200">
                                {isGrading ? t('admin.academics.assignments.cancelButton') : isGraded ? t('admin.academics.assignments.regradeButton') : t('admin.academics.assignments.gradeButton')}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isGrading && (
                          <tr key={`grade_${sid}`}>
                            <td colSpan={7} className="px-4 pb-4 pt-0">
                              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                                <p className="text-xs font-bold text-purple-700 mb-3">{t('admin.academics.assignments.gradingLabel', { name })}</p>
                                <div className="flex items-end gap-3 flex-wrap">
                                  <div>
                                    <label className="text-xs font-semibold text-slate-600 block mb-1">{t('admin.academics.assignments.scoreMaxLabel', { max: assignment.totalMarks })}</label>
                                    <input
                                      type="number" min={0} max={assignment.totalMarks}
                                      value={scoreInput} onChange={e => setScoreInput(e.target.value)}
                                      className="h-9 w-28 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-purple-400"/>
                                  </div>
                                  <div className="flex-1 min-w-[160px]">
                                    <label className="text-xs font-semibold text-slate-600 block mb-1">{t('admin.academics.assignments.excelHeaderFeedback')}</label>
                                    <input
                                      value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)}
                                      placeholder={t('admin.academics.assignments.feedbackPlaceholder')}
                                      className="h-9 w-full px-3 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-purple-400"/>
                                  </div>
                                  <button
                                    onClick={() => saveGrade(sid)}
                                    className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
                                    {t('admin.academics.assignments.saveGradeButton')}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "all" | "active" | "draft" | "closed";

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AssignmentManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const grades = useGrades();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<AssignmentRow | null>(null);

  const [tab,           setTab]           = useState<Tab>("all");
  const [gradeFilter,   setGradeFilter]   = useState("All Grades");
  const [subjectFilter, setSubjectFilter] = useState("All Subjects");
  const [typeFilter,    setTypeFilter]    = useState("All Types");
  const [statusFilter,  setStatusFilter]  = useState("All Status");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");
  const [page,          setPage]          = useState(1);
  const PER_PAGE = 7;

  const allRows = rows;

  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);

  function loadAssignments() {
    setLoading(true);
    smartDb.getAll("TeacherAssignment", undefined).then((data: any) => {
      const list = (data || []) as AssignmentRow[];
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRows(list);
    }).catch(() => {
      setRows([]);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadAssignments(); loadSubs().then(setAllSubmissions); }, []);

  async function deleteRow(id: string) {
    try {
      await smartDb.delete("TeacherAssignment", id);
      setRows(prev => prev.filter(r => r.id !== id));
      toast.success(t('admin.academics.assignments.toastAssignmentDeleted'));
    } catch {
      toast.error(t('admin.academics.assignments.toastFailedDeleteAssignment'));
    }
  }

  const filtered = useMemo(() => allRows.filter(r => {
    if (tab === "active" && r.status !== "Active") return false;
    if (tab === "closed" && r.status !== "Closed") return false;
    if (tab === "draft"  && r.status !== "Draft")  return false;
    if (gradeFilter   !== "All Grades"   && r.grade   !== gradeFilter)   return false;
    if (subjectFilter !== "All Subjects" && r.subject !== subjectFilter) return false;
    if (typeFilter    !== "All Types"    && r.type    !== typeFilter)    return false;
    if (statusFilter  !== "All Status"   && r.status  !== statusFilter)  return false;
    if (dateFrom && r.dueDate && new Date(r.dueDate) < new Date(dateFrom)) return false;
    if (dateTo   && r.dueDate && new Date(r.dueDate) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }), [allRows, tab, gradeFilter, subjectFilter, typeFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const reset = () => {
    setGradeFilter("All Grades"); setSubjectFilter("All Subjects");
    setTypeFilter("All Types"); setStatusFilter("All Status");
    setDateFrom(""); setDateTo(""); setPage(1);
    toast.success(t('admin.academics.assignments.toastFiltersReset'));
  };

  function exportCSV() {
    const headers = [
      t('admin.academics.assignments.tableHeaderTitle'),
      t('admin.academics.assignments.tableHeaderSubject'),
      t('admin.academics.assignments.filterGradeLabel'),
      t('admin.academics.assignments.csvHeaderSection'),
      t('admin.academics.assignments.tableHeaderTeacher'),
      t('admin.academics.assignments.csvHeaderType'),
      t('admin.academics.assignments.tableHeaderDueDate'),
      t('admin.academics.assignments.tableHeaderSubmissions'),
      t('admin.academics.assignments.excelHeaderStatus'),
    ];
    const csvRows = filtered.map(r => [
      r.title, r.subject, r.grade, r.section || "", r.teacher || "",
      r.type, r.dueDate || "", `${r.submitted ?? 0}/${r.total ?? 0}`, r.status,
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "assignments.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('admin.academics.assignments.toastExportedCsv'));
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Sparkline = real day-by-day count of assignments actually created in the
  // last 7 days (from each row's real createdAt), scoped to whichever subset
  // that KPI counts — not the flat "five zeros then the current total" filler
  // this used to show, which wasn't a trend at all.
  function last7DaysCounts(items: { createdAt?: string }[]): number[] {
    const days = new Array(7).fill(0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    items.forEach(item => {
      if (!item.createdAt) return;
      const d = new Date(item.createdAt); d.setHours(0, 0, 0, 0);
      const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) days[6 - diff]++;
    });
    return days;
  }
  const activeRows = allRows.filter(r => r.status === "Active");
  const draftRows  = allRows.filter(r => r.status === "Draft");
  const closedRows = allRows.filter(r => r.status === "Closed");
  const KPIS = [
    { icon: ClipboardList, bg:"bg-purple-50",  ic:"text-purple-500",  value: allRows.length,   label:t('admin.academics.assignments.kpiTotalAssignments'),   sub:t('admin.academics.assignments.kpiTotalAssignmentsSub'),        spark:"#8b5cf6", data: last7DaysCounts(allRows) },
    { icon: FileText,      bg:"bg-emerald-50", ic:"text-emerald-500", value: activeRows.length, label:t('admin.academics.assignments.kpiActiveAssignments'),  sub:t('admin.academics.assignments.kpiActiveAssignmentsSub'), spark:"#10b981", data: last7DaysCounts(activeRows) },
    { icon: Clock,         bg:"bg-orange-50",  ic:"text-orange-500",  value: draftRows.length,  label:t('admin.academics.assignments.kpiPendingDraft'),     sub:t('admin.academics.assignments.kpiPendingDraftSub'),     spark:"#f97316", data: last7DaysCounts(draftRows) },
    { icon: BarChart3,     bg:"bg-blue-50",    ic:"text-blue-500",    value: closedRows.length, label:t('admin.academics.assignments.kpiCompleted'),           sub:t('admin.academics.assignments.kpiCompletedSub'),          spark:"#3b82f6", data: last7DaysCounts(closedRows) },
    { icon: CheckSquare,   bg:"bg-pink-50",    ic:"text-pink-500",    value: allRows.length > 0 ? `${Math.round((closedRows.length/allRows.length)*100)}%` : "0%", label:t('admin.academics.assignments.kpiCompletionRate'), sub:t('admin.academics.assignments.kpiCompletionRateSub'), spark:"#ec4899", data: last7DaysCounts(closedRows) },
  ];

  // ── Donut ────────────────────────────────────────────────────────────────
  // Real per-assignment submission counts (not a flat all-time total) against
  // each assignment's real roster target (r.total). "Pending" = shortfall on
  // still-open (Active) assignments — there's still time to submit.
  // "Not Submitted" = shortfall on Closed assignments — deadline has passed,
  // so these genuinely never came in. The old version mislabeled "assignments
  // still in Draft" (never even published to students) as "Not Submitted",
  // which isn't a submission-status concept at all.
  const submittedByAssignment = new Map<string, number>();
  allSubmissions.forEach(s => submittedByAssignment.set(s.assignmentId, (submittedByAssignment.get(s.assignmentId) || 0) + 1));
  let realSubmitted = 0, realPending = 0, realNotSubmitted = 0;
  [...activeRows, ...closedRows].forEach(r => {
    const submitted = submittedByAssignment.get(r.id) || 0;
    const expected = r.total || 0;
    const shortfall = Math.max(0, expected - submitted);
    realSubmitted += submitted;
    if (r.status === "Active") realPending += shortfall; else realNotSubmitted += shortfall;
  });
  const DONUT_LABEL_KEYS: Record<string, string> = {
    Submitted: 'admin.academics.assignments.statsSubmitted',
    Pending: 'admin.academics.assignments.donutPendingLabel',
    "Not Submitted": 'admin.academics.assignments.statsNotSubmitted',
  };
  const donutData = [
    { label:"Submitted",     value: realSubmitted,    pct: 0, color:"#8b5cf6" },
    { label:"Pending",       value: realPending,      pct: 0, color:"#f59e0b" },
    { label:"Not Submitted", value: realNotSubmitted, pct: 0, color:"#e2e8f0" },
  ];
  const donutTotal = donutData.reduce((s,d) => s+d.value, 0) || 1;
  donutData.forEach(d => { d.pct = Math.round((d.value / donutTotal) * 100); });
  const donutCirc = 2 * Math.PI * 36;
  let donutOff = -90;

  // ── Upcoming Deadlines ────────────────────────────────────────────────────
  const deadlines = allRows
    .filter(r => r.status === "Active" && r.dueDate)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3)
    .map(r => {
      const days = Math.ceil((new Date(r.dueDate).getTime() - Date.now()) / 86400000);
      const d = new Date(r.dueDate);
      const monthKeys = ['monthJan','monthFeb','monthMar','monthApr','monthMay','monthJun','monthJul','monthAug','monthSep','monthOct','monthNov','monthDec'];
      const mo = t(`admin.academics.assignments.${monthKeys[d.getMonth()]}`);
      return { title: r.title, date: `${mo} ${d.getDate()}`, days };
    });

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-5 w-5 text-purple-600"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.assignments.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.academics.assignments.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4 text-slate-500"/> {t('admin.academics.assignments.exportCsvButton')}
            </button>
            <button onClick={() => navigate("/assignments/new")}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Plus className="h-4 w-4"/> {t('admin.academics.assignments.createNewAssignmentButton')}
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-3">
          {KPIS.map((k, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)}/>
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{k.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{loading ? "—" : k.value}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-slate-400">{k.sub}</span>
                <Sparkline color={k.spark} data={k.data}/>
              </div>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterGradeLabel')}</label>
            <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300">
              <option value="All Grades">{t('admin.academics.assignments.allGradesOption')}</option>{grades.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterSubjectLabel')}</label>
            <select value={subjectFilter} onChange={e => { setSubjectFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300">
              <option value="All Subjects">{t('admin.academics.assignments.allSubjectsOption')}</option>{SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterTypeLabel')}</label>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300">
              <option value="All Types">{t('admin.academics.assignments.allTypesOption')}</option>{TYPES.map(ty => <option key={ty}>{ty}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterStatusLabel')}</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300">
              <option value="All Status">{t('admin.academics.assignments.allStatusOption')}</option>
              <option value="Active">{t('admin.academics.assignments.statusActiveOption')}</option>
              <option value="Closed">{t('admin.academics.assignments.statusClosedOption')}</option>
              <option value="Draft">{t('admin.academics.assignments.statusDraftOption')}</option>
              <option value="Upcoming">{t('admin.academics.assignments.statusUpcomingOption')}</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterFromLabel')}</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t('admin.academics.assignments.filterToLabel')}</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
          <button onClick={reset} className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-4 w-4"/> {t('admin.academics.assignments.resetButton')}
          </button>
        </div>

        {/* Main grid — fills remaining viewport height so page doesn't outer-scroll */}
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-5" style={{minHeight: 0}}>

          {/* LEFT: table */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{maxHeight: "calc(100vh - 380px)"}}>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100">
              {([
                { k:"all",    label:t('admin.academics.assignments.tabAllAssignments') },
                { k:"active", label:t('admin.academics.assignments.statusActiveOption') },
                { k:"draft",  label:t('admin.academics.assignments.tabDrafts') },
                { k:"closed", label:t('admin.academics.assignments.statusClosedOption') },
              ] as const).map(tabItem => (
                <button key={tabItem.k} onClick={() => { setTab(tabItem.k); setPage(1); }}
                  className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                    tab === tabItem.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                  {tabItem.label}
                </button>
              ))}
            </div>

            {/* Loading */}
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">{t('admin.academics.assignments.loadingAssignments')}</div>
            ) : allRows.length === 0 ? (
              <div className="py-16 text-center">
                <ClipboardList className="h-10 w-10 text-slate-200 mx-auto mb-3"/>
                <p className="text-sm font-semibold text-slate-500 mb-1">{t('admin.academics.assignments.noAssignmentsYet')}</p>
                <p className="text-xs text-slate-400 mb-4">{t('admin.academics.assignments.noAssignmentsYetSub')}</p>
                <button onClick={() => navigate("/assignments/new")}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
                  <Plus className="h-4 w-4"/> {t('admin.academics.assignments.createFirstAssignmentButton')}
                </button>
              </div>
            ) : (
              <>
                {/* Table */}
                <div className="overflow-x-auto overflow-y-auto flex-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        {[
                          t('admin.academics.assignments.tableHeaderTitle'),
                          t('admin.academics.assignments.tableHeaderSubject'),
                          t('admin.academics.assignments.filterGradeLabel'),
                          t('admin.academics.assignments.tableHeaderTeacher'),
                          t('admin.academics.assignments.tableHeaderDueDate'),
                          t('admin.academics.assignments.tableHeaderSubmissions'),
                          t('admin.academics.assignments.excelHeaderStatus'),
                          t('admin.academics.assignments.tableHeaderActions'),
                        ].map(h => (
                          <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pageRows.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">{t('admin.academics.assignments.noAssignmentsMatchFilters')}</td></tr>
                      ) : pageRows.map(r => {
                        const dueStr = r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-US", { day:"2-digit", month:"short", year:"numeric" }) : "—";
                        const subs = allSubmissions.filter(s => s.assignmentId === r.id);
                        const subCount = subs.length;
                        const pct = r.total && r.total > 0 ? Math.round((subCount / r.total) * 100) : 0;
                        return (
                          <tr key={r.id} onClick={() => navigate("/assignments/" + r.id + "/submissions")} className="hover:bg-purple-50/30 transition-colors cursor-pointer">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                                  <FileText className="h-4 w-4"/>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 text-sm leading-tight truncate max-w-[150px]">{r.title}</p>
                                  <p className="text-[11px] text-slate-400 truncate">{r.type}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap", SUBJECT_BADGE[r.subject] || "bg-slate-100 text-slate-600")}>
                                {r.subject}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-medium text-slate-700 whitespace-nowrap">{r.grade}</p>
                              {r.section && <p className="text-[10px] text-slate-400">{t('admin.academics.assignments.secLabel', { section: r.section })}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-slate-600 whitespace-nowrap">{r.teacher || "—"}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-slate-700 font-medium whitespace-nowrap">{dueStr}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-xs font-bold text-slate-800">{subCount} / {r.total ?? "—"}</p>
                              {r.total ? <p className="text-[10px] text-slate-400">{pct}%</p> : null}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap", STATUS_BADGE[r.status] || "bg-slate-100 text-slate-600")}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button onClick={() => navigate("/assignments/" + r.id + "/submissions")}
                                  title={t('admin.academics.assignments.actionReviewSubmissions')}
                                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                                  <Eye className="h-3.5 w-3.5"/>
                                </button>
                                <button onClick={() => navigate("/assignments/" + r.id + "/edit")}
                                  title={t('admin.academics.assignments.actionEditAssignment')}
                                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-amber-50 hover:text-amber-600 text-slate-400 transition-colors">
                                  <Edit2 className="h-3.5 w-3.5"/>
                                </button>
                                <button onClick={() => deleteRow(r.id)}
                                  title={t('admin.academics.assignments.actionDelete')}
                                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 text-slate-400 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5"/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
                  <p className="text-xs text-slate-500">
                    {t('admin.academics.assignments.paginationShowing', { from: filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1, to: Math.min(page * PER_PAGE, filtered.length), total: filtered.length })}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                      <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180"/>
                    </button>
                    {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)}
                        className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                          page === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180"/>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT sidebar — 260px fixed, internal scroll */}
          <div className="space-y-4 overflow-y-auto" style={{maxHeight: "calc(100vh - 380px)"}}>

            {/* Submission Overview donut */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t('admin.academics.assignments.submissionOverviewHeading')}</h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="90" height="90" viewBox="0 0 100 100">
                    {donutData.map((seg) => {
                      const dash = (seg.pct / 100) * donutCirc;
                      const el = (
                        <circle key={seg.label} cx="50" cy="50" r="36" fill="none" stroke={seg.color} strokeWidth="13"
                          strokeDasharray={`${dash} ${donutCirc - dash}`} transform={`rotate(${donutOff} 50 50)`}/>
                      );
                      donutOff += (seg.pct / 100) * 360;
                      return el;
                    })}
                    <circle cx="50" cy="50" r="27" fill="white"/>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-base font-bold text-slate-900">{donutData[0].pct}%</span>
                    <span className="text-[9px] text-slate-400 leading-none">{t('admin.academics.assignments.donutAverageLabel')}</span>
                  </div>
                </div>
                <div className="space-y-1.5 flex-1">
                  {donutData.map(seg => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }}/>
                      <span className="text-[10px] text-slate-600 flex-1">{DONUT_LABEL_KEYS[seg.label] ? t(DONUT_LABEL_KEYS[seg.label]) : seg.label}</span>
                      <span className="text-[10px] font-semibold text-slate-700">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            {deadlines.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-slate-900 text-sm mb-3">{t('admin.academics.assignments.upcomingDeadlinesHeading')}</h3>
                <div className="space-y-2.5">
                  {deadlines.map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-semibold text-purple-500 leading-none uppercase">{d.date.split(" ")[0]}</span>
                        <span className="text-sm font-bold text-purple-700 leading-tight">{d.date.split(" ")[1]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{d.title}</p>
                        <p className={cn("text-[10px] font-semibold mt-0.5", d.days <= 2 ? "text-rose-500" : "text-amber-500")}>
                          {d.days > 0 ? t('admin.academics.assignments.daysLeftLabel', { days: d.days }) : t('admin.academics.assignments.overdueLabel')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t('admin.academics.assignments.quickActionsHeading')}</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label:t('admin.academics.assignments.qaCreateAssignment'), icon:Plus,          bg:"bg-purple-100",  ic:"text-purple-600",  fn:()=>navigate("/assignments/new") },
                  { label:t('admin.academics.assignments.qaTemplates'),         icon:LayoutTemplate, bg:"bg-blue-100",   ic:"text-purple-600",    fn:()=>toast.info(t('admin.academics.assignments.toastOpeningTemplates')) },
                  { label:t('admin.academics.assignments.qaBulkUpload'),       icon:UploadCloud,   bg:"bg-emerald-100", ic:"text-emerald-600", fn:()=>toast.info(t('admin.academics.assignments.toastBulkUpload')) },
                  { label:t('admin.academics.assignments.qaGradeSubmissions'), icon:CheckSquare,   bg:"bg-amber-100",   ic:"text-amber-600",   fn:()=>toast.info(t('admin.academics.assignments.toastGradingQueue')) },
                  { label:t('admin.academics.assignments.qaGiveFeedback'),     icon:MessageSquare, bg:"bg-pink-100",    ic:"text-pink-600",    fn:()=>toast.info(t('admin.academics.assignments.toastComposeFeedback')) },
                  { label:t('admin.academics.assignments.qaExportReport'),     icon:Download,      bg:"bg-indigo-100",  ic:"text-purple-600",  fn:exportCSV },
                ].map((a, i) => (
                  <button key={i} onClick={a.fn}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", a.bg)}>
                      <a.icon className={cn("h-4 w-4", a.ic)}/>
                    </div>
                    <span className="text-[9px] font-semibold text-slate-600 text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <DetailModal assignment={selectedRow} onClose={() => setSelectedRow(null)}/>
      )}
    </DashboardLayout>
  );
}
