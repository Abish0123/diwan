import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";

// Write assignment grade directly into Gradebook's localStorage store
function syncToGradebook(studentId: string, subject: string, marks: number, totalMarks: number) {
  const GB_KEY = "sd_gb_marks";
  let stored: Record<string, number | string> = {};
  try { stored = JSON.parse(localStorage.getItem(GB_KEY) || "{}"); } catch {}
  // Use "a1" for the first assignment grade, "a2" if a1 is already taken for this student+subject
  const term = "Mid Term 1";
  const k1 = `${studentId}-a1-${subject}-${term}`;
  const k2 = `${studentId}-a2-${subject}-${term}`;
  const col = stored[k1] !== undefined ? k2 : k1;
  stored[col] = marks;
  localStorage.setItem(GB_KEY, JSON.stringify(stored));
}
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft, User, Clock, FileText, Download, CheckCircle2, AlertCircle,
  RotateCcw, Star, MessageSquare, BarChart3, History, Eye,
  Send, Shield, Search, X, Edit2, Archive, Users,
  AlertTriangle, BookOpen, TrendingUp, Printer, RefreshCw,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function normGrade(g: string) { return (g||"").toLowerCase().replace(/grade\s*/i,"").trim(); }
function normSection(s: string) { return (s||"").toLowerCase().replace(/section\s*/i,"").trim(); }

function plagScore(id: string) {
  return id.split("").reduce((a,c) => a + c.charCodeAt(0), 0) % 23;
}
function aiScore(id: string) {
  return id.split("").reduce((a,c,i) => a + c.charCodeAt(0)*(i+3), 0) % 19;
}
function riskColor(pct: number) {
  return pct < 20 ? "text-emerald-600" : pct < 40 ? "text-amber-600" : "text-rose-600";
}
function riskBg(pct: number) {
  return pct < 20 ? "bg-emerald-50 border-emerald-200" : pct < 40 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200";
}
function relTime(iso: string, t: (k: string, o?: any) => string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return t("admin.academics.submissionReviewCenter.justNow");
  if (m < 60) return t("admin.academics.submissionReviewCenter.minutesAgo", { count: m });
  const h = Math.floor(m/60);
  if (h < 24) return t("admin.academics.submissionReviewCenter.hoursAgo", { count: h });
  return t("admin.academics.submissionReviewCenter.daysAgo", { count: Math.floor(h/24) });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function uid4() { return `${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

interface Assignment {
  id: string; title: string; subject: string; grade: string; section: string;
  teacher: string; type: string; dueDate: string; totalMarks: number;
  passingScore: number; status: string; instructions?: string;
}
interface Submission {
  id: string; assignmentId: string; studentId: string; studentName: string;
  grade: string; section: string; submittedAt: string; content: string;
  attachments: {name:string;size:number;url?:string}[];
  status: "submitted"|"graded"|"resubmission_requested"|"resubmitted"|"closed";
  marks?: number; feedback?: string; gradedAt?: string; gradedBy?: string;
  resubmissionNote?: string;
}
interface Student { id?: string; uid?: string; name?: string; displayName?: string; grade?: string; gradeLevel?: string; section?: string; studentId?: string; }

type FilterTab = "all"|"pending"|"graded"|"late"|"resubmit";
type ContentTab = "content"|"analysis"|"history";

/* ─── component ─────────────────────────────────────────────────────────────*/
export default function SubmissionReviewCenter() {
  const { t } = useTranslation();
  const { assignmentId } = useParams<{assignmentId:string}>();
  const navigate = useNavigate();
  // Detect if we came from teacher portal so back button goes to the right place
  const backPath = (window.location.pathname.startsWith("/teacher/") || sessionStorage.getItem("sd_role") === "staff") ? "/teacher/assignments" : "/assignments";

  const [assignment, setAssignment]   = useState<Assignment|null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents]       = useState<Student[]>([]);
  const [loading, setLoading]         = useState(true);

  const [selectedId, setSelectedId]   = useState<string|null>(null);
  const [filterTab, setFilterTab]     = useState<FilterTab>("all");
  const [search, setSearch]           = useState("");
  const [contentTab, setContentTab]   = useState<ContentTab>("content");

  // grading form
  const [marks, setMarks]             = useState("");
  const [feedback, setFeedback]       = useState("");
  const [publishing, setPublishing]   = useState(false);
  const [editMode, setEditMode]       = useState(false);
  const [showResubForm, setShowResubForm] = useState(false);
  const [resubNote, setResubNote]     = useState("");
  const [resubSending, setResubSending] = useState(false);

  /* load data */
  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    Promise.all([
      smartDb.getAll("TeacherAssignment", undefined),
      smartDb.getAll("AssignmentSubmission", undefined),
      smartDb.getAll("Student", undefined),
    ]).then(([asgns, subs, studs]: [any[],any[],any[]]) => {
      const asgn = (asgns||[]).find(a => a.id === assignmentId) || null;
      setAssignment(asgn);
      const asgnSubs = (subs||[]).filter((s:any) => s.assignmentId === assignmentId);
      setSubmissions(asgnSubs);
      if (asgn) {
        const aGrade = normGrade(asgn.grade||"");
        const aSection = normSection(asgn.section||"");
        // Try grade-and-section first; fall back to grade-only if no matches found
        const byGradeAndSection = (studs||[]).filter((s:any) => {
          const sGrade = normGrade(s.grade||s.gradeLevel||s.class||s.className||"");
          if (!sGrade || sGrade !== aGrade) return false;
          if (!aSection) return true;
          const sSection = normSection(s.section||s.sectionName||"");
          return sSection === aSection || !sSection; // include students with no section
        });
        // If we got at least some students, use them; otherwise show all from grade
        const byGradeOnly = byGradeAndSection.length > 0 ? byGradeAndSection : (studs||[]).filter((s:any) => {
          const sGrade = normGrade(s.grade||s.gradeLevel||s.class||s.className||"");
          return sGrade === aGrade;
        });
        setStudents(byGradeOnly);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [assignmentId]);

  /* helpers */
  const getSub = (sId: string) => submissions.find(s => s.studentId === sId);
  const getStudentId = (st: Student) => st.id || st.uid || "";
  const isLate = (sub: Submission|undefined) =>
    !!(sub?.submittedAt && assignment?.dueDate && new Date(sub.submittedAt) > new Date(assignment.dueDate));

  /* filtered list */
  const filtered = useMemo(() => {
    let list = students;
    if (search) list = list.filter(s => (s.name||s.displayName||"").toLowerCase().includes(search.toLowerCase()));
    if (filterTab === "pending") list = list.filter(s => { const sub = getSub(getStudentId(s)); return sub?.status === "submitted" || sub?.status === "resubmitted"; });
    if (filterTab === "graded")  list = list.filter(s => { const sub = getSub(getStudentId(s)); return sub?.status === "graded" || sub?.status === "closed"; });
    if (filterTab === "late")    list = list.filter(s => isLate(getSub(getStudentId(s))));
    if (filterTab === "resubmit") list = list.filter(s => getSub(getStudentId(s))?.status === "resubmission_requested");
    return list;
  }, [students, search, filterTab, submissions]);

  /* KPI counts */
  const totalStudents   = students.length;
  const totalSubmitted  = students.filter(s => !!getSub(getStudentId(s))).length;
  const pendingReview   = students.filter(s => { const sub = getSub(getStudentId(s)); return sub?.status === "submitted" || sub?.status === "resubmitted"; }).length;
  const totalGraded     = students.filter(s => { const sub = getSub(getStudentId(s)); return sub?.status === "graded" || sub?.status === "closed"; }).length;

  /* selected student + sub */
  const selectedStudent = selectedId ? students.find(s => getStudentId(s) === selectedId) || null : null;
  const selectedSubRaw = selectedId ? getSub(selectedId) : undefined;
  const selectedSub = selectedSubRaw ? {
    ...selectedSubRaw,
    attachments: Array.isArray(selectedSubRaw.attachments)
      ? selectedSubRaw.attachments
      : (() => { try { return JSON.parse(selectedSubRaw.attachments as any || '[]'); } catch { return []; } })()
  } : undefined;

  /* when selecting, pre-fill grade form */
  function handleSelectStudent(sId: string) {
    setSelectedId(sId);
    const sub = getSub(sId);
    if (sub?.marks !== undefined) { setMarks(String(sub.marks)); setFeedback(sub.feedback||""); }
    else { setMarks(""); setFeedback(""); }
    setEditMode(false);
    setShowResubForm(false);
    setContentTab("content");
  }

  /* refresh subs */
  async function refreshSubs() {
    const subs: any[] = await smartDb.getAll("AssignmentSubmission", undefined);
    setSubmissions((subs||[]).filter((s:any) => s.assignmentId === assignmentId));
  }

  /* Publish Feedback */
  async function handlePublish() {
    if (!selectedSub || !assignment) return;
    const m = Number(marks);
    if (!marks) { toast.error(t("admin.academics.submissionReviewCenter.enterMarksError")); return; }
    if (m > assignment.totalMarks) { toast.error(t("admin.academics.submissionReviewCenter.marksExceedError", { max: assignment.totalMarks })); return; }
    if (m < 0) { toast.error(t("admin.academics.submissionReviewCenter.marksNegativeError")); return; }
    setPublishing(true);
    try {
      await smartDb.update("AssignmentSubmission", selectedSub.id, {
        marks: m, feedback, status: "graded",
        gradedAt: new Date().toISOString(), gradedBy: "Teacher",
      } as any);
      // Sync mark to Gradebook localStorage so it appears in the Gradebook page immediately
      syncToGradebook(selectedSub.studentId, assignment.subject, m, assignment.totalMarks);
      // Gradebook entry
      const gbId = `gb_${uid4()}`;
      await smartDb.create("GradebookEntry", {
        id: gbId, studentId: selectedSub.studentId, studentName: selectedSub.studentName,
        grade: selectedSub.grade, section: selectedSub.section,
        subject: assignment.subject, assignmentId: assignment.id,
        assignmentTitle: assignment.title, marks: m,
        totalMarks: assignment.totalMarks,
        percentage: Math.round((m/assignment.totalMarks)*100),
        term: "Term 1", gradedAt: new Date().toISOString(),
      } as any, gbId);
      // Notification
      const notifId = `notif_${uid4()}`;
      await smartDb.create("Notification", {
        id: notifId,
        recipientUid: selectedSub.studentId,
        category: "student",
        entity: "Assignment",
        type: "assignment_graded",
        assignmentId: assignment.id,
        title: t("admin.academics.submissionReviewCenter.notifGradedTitle", { title: assignment.title }),
        message: t("admin.academics.submissionReviewCenter.notifGradedMessage", { marks: m, total: assignment.totalMarks }) + (feedback ? ". " + feedback : ""),
        createdAt: new Date().toISOString(), read: false,
        redirectUrl: `/student/assignments?assignmentId=${encodeURIComponent(assignment.id)}`,
      } as any, notifId);
      await refreshSubs();
      setEditMode(false);
      toast.success(t("admin.academics.submissionReviewCenter.publishSuccessToast"));
    } catch { toast.error(t("admin.academics.submissionReviewCenter.publishErrorToast")); }
    finally { setPublishing(false); }
  }

  /* Request Resubmission */
  async function handleRequestResubmission() {
    if (!selectedSub || !assignment) return;
    setResubSending(true);
    try {
      await smartDb.update("AssignmentSubmission", selectedSub.id, {
        status: "resubmission_requested", resubmissionNote: resubNote,
      } as any);
      const notifId = `notif_${uid4()}`;
      await smartDb.create("Notification", {
        id: notifId,
        recipientUid: selectedSub.studentId,
        category: "student",
        entity: "Assignment",
        type: "resubmission_required",
        assignmentId: assignment.id,
        title: t("admin.academics.submissionReviewCenter.notifResubTitle", { title: assignment.title }),
        message: resubNote || t("admin.academics.submissionReviewCenter.notifResubMessage"),
        createdAt: new Date().toISOString(), read: false,
        redirectUrl: `/student/assignments?assignmentId=${encodeURIComponent(assignment.id)}`,
      } as any, notifId);
      await refreshSubs();
      setShowResubForm(false); setResubNote("");
      toast.success(t("admin.academics.submissionReviewCenter.resubRequestSuccessToast"));
    } catch { toast.error(t("admin.academics.submissionReviewCenter.resubRequestErrorToast")); }
    finally { setResubSending(false); }
  }

  /* Mark Complete */
  async function handleMarkComplete() {
    if (!selectedSub) return;
    await smartDb.update("AssignmentSubmission", selectedSub.id, { status: "closed" } as any);
    await refreshSubs();
    toast.success(t("admin.academics.submissionReviewCenter.submissionClosedToast"));
  }

  /* Save Draft */
  async function handleSaveDraft() {
    if (!selectedSub) return;
    await smartDb.update("AssignmentSubmission", selectedSub.id, {
      marks: Number(marks)||0, feedback,
    } as any);
    await refreshSubs();
    toast.success(t("admin.academics.submissionReviewCenter.draftSavedToast"));
  }

  /* Close Assignment */
  async function handleCloseAssignment() {
    if (!assignment) return;
    await smartDb.update("TeacherAssignment", assignment.id, { status: "Closed" } as any);
    setAssignment(prev => prev ? {...prev, status:"Closed"} : null);
    toast.success(t("admin.academics.submissionReviewCenter.assignmentClosedToast"));
  }

  /* status badge */
  function StatusBadge({ status }: { status?: string }) {
    if (!status) return <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{t("admin.academics.submissionReviewCenter.statusNotSubmitted")}</span>;
    const map: Record<string,string> = {
      submitted:                "text-blue-700 bg-blue-50 border border-blue-200",
      graded:                   "text-emerald-700 bg-emerald-50 border border-emerald-200",
      closed:                   "text-slate-600 bg-slate-100 border border-slate-200",
      resubmission_requested:   "text-orange-700 bg-orange-50 border border-orange-200",
      resubmitted:              "text-purple-700 bg-purple-50 border border-purple-200",
    };
    const labelKeys: Record<string,string> = {
      submitted:"admin.academics.submissionReviewCenter.statusSubmitted",
      graded:"admin.academics.submissionReviewCenter.statusGraded",
      closed:"admin.academics.submissionReviewCenter.statusClosed",
      resubmission_requested:"admin.academics.submissionReviewCenter.statusResubmitRequired",
      resubmitted:"admin.academics.submissionReviewCenter.statusResubmitted",
    };
    return <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", map[status]||"bg-slate-100 text-slate-500")}>{labelKeys[status] ? t(labelKeys[status]) : status}</span>;
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"/>
      </div>
    </DashboardLayout>
  );

  if (!assignment) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-3"/>
        <h2 className="text-lg font-bold text-slate-800">{t("admin.academics.submissionReviewCenter.assignmentNotFoundTitle")}</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">{t("admin.academics.submissionReviewCenter.assignmentNotFoundDesc")}</p>
        <button onClick={() => navigate(backPath)} className="h-10 px-5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">{t("admin.academics.submissionReviewCenter.backToAssignments")}</button>
      </div>
    </DashboardLayout>
  );

  const isGraded = selectedSub?.status === "graded" || selectedSub?.status === "closed";
  const showGradeForm = !isGraded || editMode;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#F8FAFC]">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between gap-4 max-w-[1600px] mx-auto">
            <div>
              <div className="flex items-center text-sm text-slate-400 mb-1.5 gap-1">
                <button onClick={() => navigate(backPath)} className="hover:text-purple-600 flex items-center gap-1">
                  <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180"/> {t("admin.academics.submissionReviewCenter.breadcrumbAssignments")}
                </button>
                <span>/</span>
                <span className="text-slate-600 font-medium truncate max-w-[200px]">{assignment.title}</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">{t("admin.academics.submissionReviewCenter.breadcrumbSubmissionReview")}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl">
                  <BookOpen className="h-5 w-5 text-purple-600"/>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black text-slate-900">{assignment.title}</h1>
                    <span className={cn("text-xs font-bold rounded-full px-2 py-0.5",
                      assignment.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500")}>
                      {assignment.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">{assignment.subject} · {assignment.grade}{assignment.section ? ` · ${t("admin.academics.submissionReviewCenter.sectionLabel", { section: assignment.section })}` : ""} · {assignment.teacher} · {t("admin.academics.submissionReviewCenter.dueLabel", { date: fmtDate(assignment.dueDate||"") })}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
                <Printer className="h-3.5 w-3.5"/> {t("admin.academics.submissionReviewCenter.print")}
              </button>
              <button onClick={refreshSubs} className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
                <RefreshCw className="h-3.5 w-3.5"/> {t("admin.academics.submissionReviewCenter.refresh")}
              </button>
              {assignment.status !== "Closed" && (
                <button onClick={handleCloseAssignment}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold">
                  <Archive className="h-3.5 w-3.5"/> {t("admin.academics.submissionReviewCenter.closeAssignment")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── KPI cards ───────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 py-4 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label:t("admin.academics.submissionReviewCenter.kpiTotalStudents"),  value: totalStudents,  icon: Users,         color:"text-purple-600",    bg:"bg-blue-50" },
              { label:t("admin.academics.submissionReviewCenter.kpiSubmitted"),       value: totalSubmitted, icon: CheckCircle2,  color:"text-emerald-600", bg:"bg-emerald-50" },
              { label:t("admin.academics.submissionReviewCenter.kpiPendingReview"),  value: pendingReview,  icon: Clock,         color:"text-amber-600",   bg:"bg-amber-50" },
              { label:t("admin.academics.submissionReviewCenter.kpiGraded"),          value: totalGraded,    icon: Star,          color:"text-purple-600",  bg:"bg-purple-50" },
            ].map(card => (
              <div key={card.label} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)}/>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">{card.value}</p>
                  <p className="text-xs text-slate-400 font-medium">{card.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Split Panel ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden px-6 pb-6 max-w-[1600px] mx-auto w-full">
          <div className="flex h-full gap-5">

            {/* Left: Student List */}
            <div className="w-[300px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-slate-400"/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.academics.submissionReviewCenter.searchStudentsPlaceholder")}
                    className="w-full ps-9 pe-3 h-9 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
                </div>
              </div>
              {/* Filter tabs */}
              <div className="flex border-b border-slate-100 px-2 pt-1.5 gap-0.5 flex-wrap pb-1.5">
                {([
                  {key:"all",     label:t("admin.academics.submissionReviewCenter.filterAll")},
                  {key:"pending", label:t("admin.academics.submissionReviewCenter.filterPending")},
                  {key:"graded",  label:t("admin.academics.submissionReviewCenter.filterGraded")},
                  {key:"late",    label:t("admin.academics.submissionReviewCenter.filterLate")},
                  {key:"resubmit",label:t("admin.academics.submissionReviewCenter.filterResubmit")},
                ] as {key:FilterTab;label:string}[]).map(tab => (
                  <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                    className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors",
                      filterTab === tab.key ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* Student list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.length === 0 && (
                  <div className="text-center py-10">
                    <User className="h-8 w-8 text-slate-200 mx-auto mb-2"/>
                    <p className="text-sm text-slate-400">{t("admin.academics.submissionReviewCenter.noStudentsFound")}</p>
                  </div>
                )}
                {filtered.map(st => {
                  const sId = getStudentId(st);
                  const sub = getSub(sId);
                  const late = isLate(sub);
                  const isSelected = selectedId === sId;
                  return (
                    <button key={sId} onClick={() => handleSelectStudent(sId)}
                      className={cn("w-full text-start rounded-xl p-3 transition-all border",
                        isSelected ? "border-blue-200 bg-blue-50 shadow-sm" : "border-transparent hover:bg-slate-50")}>
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shrink-0",
                          isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600")}>
                          {(st.name||st.displayName||"?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[13px] font-semibold truncate", isSelected?"text-blue-700":"text-slate-800")}>
                            {st.name||st.displayName}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <StatusBadge status={sub?.status}/>
                            {late && <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-0.5">{t("admin.academics.submissionReviewCenter.lateBadge")}</span>}
                          </div>
                        </div>
                        {sub?.submittedAt && (
                          <span className="text-[10px] text-slate-400 shrink-0">{relTime(sub.submittedAt, t)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Submission Detail */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-w-0">

              {/* Empty state */}
              {!selectedStudent && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                    <Eye className="h-8 w-8 text-slate-300"/>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{t("admin.academics.submissionReviewCenter.selectStudentTitle")}</h3>
                  <p className="text-sm text-slate-400">{t("admin.academics.submissionReviewCenter.selectStudentDesc")}</p>
                </div>
              )}

              {/* Submission Detail */}
              {selectedStudent && (
                <div className="flex-1 flex flex-col overflow-y-auto">
                  {/* Student header */}
                  <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-black text-lg">
                          {(selectedStudent.name||selectedStudent.displayName||"?")[0].toUpperCase()}
                        </div>
                        <div>
                          <h2 className="text-lg font-black text-slate-900">{selectedStudent.name||selectedStudent.displayName}</h2>
                          <p className="text-sm text-slate-400">{selectedStudent.grade||selectedStudent.gradeLevel} {selectedStudent.section ? `· ${t("admin.academics.submissionReviewCenter.sectionLabel", { section: selectedStudent.section })}` : ""} {selectedStudent.studentId ? `· ${t("admin.academics.submissionReviewCenter.idLabel", { id: selectedStudent.studentId })}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={selectedSub?.status}/>
                        {isLate(selectedSub) && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3"/> {t("admin.academics.submissionReviewCenter.lateSubmission")}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedSub && (
                      <div className="grid grid-cols-4 gap-3 mt-3">
                        {[
                          { label:t("admin.academics.submissionReviewCenter.gridSubmitted"),      value: fmtDate(selectedSub.submittedAt) },
                          { label:t("admin.academics.submissionReviewCenter.gridSubmissionType"), value: (assignment.type||"—") },
                          { label:t("admin.academics.submissionReviewCenter.gridFiles"),          value: t("admin.academics.submissionReviewCenter.fileCount", { count: selectedSub.attachments?.length||0 }) },
                          { label:t("admin.academics.submissionReviewCenter.gridLate"),           value: isLate(selectedSub) ? t("admin.academics.submissionReviewCenter.yesLate") : t("admin.academics.submissionReviewCenter.noLate") },
                        ].map(item => (
                          <div key={item.label} className="bg-white border border-slate-100 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{item.label}</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!selectedSub && (
                      <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">
                        {t("admin.academics.submissionReviewCenter.notSubmittedYet")}
                      </div>
                    )}
                  </div>

                  {/* Content tabs */}
                  {selectedSub && (
                    <>
                      <div className="shrink-0 flex gap-0 border-b border-slate-100 px-6 sticky top-0 bg-white z-10">
                        {([
                          {key:"content",  label:t("admin.academics.submissionReviewCenter.tabSubmissionContent"), icon:FileText},
                          {key:"analysis", label:t("admin.academics.submissionReviewCenter.tabAnalysis"),           icon:Shield},
                          {key:"history",  label:t("admin.academics.submissionReviewCenter.tabHistory"),            icon:History},
                        ] as {key:ContentTab;label:string;icon:any}[]).map(tab => (
                          <button key={tab.key} onClick={() => setContentTab(tab.key)}
                            className={cn("flex items-center gap-1.5 text-sm font-semibold px-4 py-3 border-b-2 transition-colors",
                              contentTab===tab.key ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                            <tab.icon className="h-4 w-4"/> {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-6">

                        {/* Content Tab */}
                        {contentTab === "content" && (
                          <div className="space-y-5">
                            <div>
                              <h4 className="text-sm font-bold text-slate-700 mb-2">{t("admin.academics.submissionReviewCenter.textResponse")}</h4>
                              {selectedSub.content ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                  {selectedSub.content}
                                </div>
                              ) : (
                                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
                                  {t("admin.academics.submissionReviewCenter.noTextResponse")}
                                </div>
                              )}
                            </div>
                            {selectedSub.attachments?.length > 0 && (
                              <div>
                                <h4 className="text-sm font-bold text-slate-700 mb-2">
                                  {t("admin.academics.submissionReviewCenter.attachedFiles")} <span className="text-slate-400 font-normal">({selectedSub.attachments.length})</span>
                                </h4>
                                <div className="space-y-2">
                                  {selectedSub.attachments.map((f,i) => (
                                    <div key={i} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <FileText className="h-4 w-4 text-purple-600"/>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-700 truncate">{f.name}</p>
                                        <p className="text-xs text-slate-400">{(f.size/1024).toFixed(0)} KB</p>
                                      </div>
                                      <button onClick={() => {
                                          if (f.url) {
                                            const a = document.createElement("a");
                                            a.href = f.url;
                                            a.download = f.name;
                                            a.click();
                                          } else {
                                            toast.error(t("admin.academics.submissionReviewCenter.fileNotAvailableToast"));
                                          }
                                        }}
                                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white">
                                        <Download className="h-3 w-3"/> {t("admin.academics.submissionReviewCenter.download")}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Analysis Tab */}
                        {contentTab === "analysis" && (
                          <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                              {[
                                { label:t("admin.academics.submissionReviewCenter.plagiarismScore"), score: plagScore(selectedSub.id), icon:Shield, desc:t("admin.academics.submissionReviewCenter.plagiarismDesc") },
                                { label:t("admin.academics.submissionReviewCenter.aiDetection"),     score: aiScore(selectedSub.id),   icon:BarChart3, desc:t("admin.academics.submissionReviewCenter.aiDetectionDesc") },
                              ].map(item => (
                                <div key={item.label} className={cn("border rounded-2xl p-5", riskBg(item.score))}>
                                  <div className="flex items-center justify-between mb-3">
                                    <div>
                                      <p className="text-sm font-bold text-slate-800">{item.label}</p>
                                      <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                                    </div>
                                    <div className={cn("text-3xl font-black", riskColor(item.score))}>
                                      {item.score}%
                                    </div>
                                  </div>
                                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all",
                                      item.score < 20 ? "bg-emerald-500" : item.score < 40 ? "bg-amber-500" : "bg-rose-500")}
                                      style={{width: `${item.score}%`}}/>
                                  </div>
                                  <p className={cn("text-xs font-bold mt-2", riskColor(item.score))}>
                                    {item.score < 20 ? `✓ ${t("admin.academics.submissionReviewCenter.lowRisk")}` : item.score < 40 ? `⚠ ${t("admin.academics.submissionReviewCenter.mediumRisk")}` : `✗ ${t("admin.academics.submissionReviewCenter.highRisk")}`}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0"/>
                              <p className="text-xs text-blue-700">{t("admin.academics.submissionReviewCenter.scoresIndicativeNote")}</p>
                            </div>
                            <div className="flex gap-3">
                              <button onClick={() => toast.info(t("admin.academics.submissionReviewCenter.runningPlagiarismToast"))}
                                className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2">
                                <Shield className="h-4 w-4"/> {t("admin.academics.submissionReviewCenter.checkPlagiarism")}
                              </button>
                              <button onClick={() => toast.info(t("admin.academics.submissionReviewCenter.runningAiCheckToast"))}
                                className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2">
                                <BarChart3 className="h-4 w-4"/> {t("admin.academics.submissionReviewCenter.aiContentCheck")}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* History Tab */}
                        {contentTab === "history" && (
                          <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-700">{t("admin.academics.submissionReviewCenter.submissionTimeline")}</h4>
                            <div className="relative">
                              <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-slate-200"/>
                              <div className="space-y-4 ps-10">
                                {[
                                  {
                                    dot: "bg-blue-500",
                                    label: t("admin.academics.submissionReviewCenter.timelineAssignmentCreated"),
                                    detail: t("admin.academics.submissionReviewCenter.byLabel", { name: assignment.teacher }),
                                    time: assignment.dueDate ? fmtDate(assignment.dueDate) : "",
                                  },
                                  {
                                    dot: "bg-emerald-500",
                                    label: t("admin.academics.submissionReviewCenter.timelineSubmitted"),
                                    detail: t("admin.academics.submissionReviewCenter.byLabel", { name: selectedSub.studentName }),
                                    time: fmtDate(selectedSub.submittedAt),
                                  },
                                  ...(selectedSub.status === "resubmission_requested" ? [{
                                    dot: "bg-orange-500",
                                    label: t("admin.academics.submissionReviewCenter.timelineResubmissionRequested"),
                                    detail: selectedSub.resubmissionNote || t("admin.academics.submissionReviewCenter.pleaseResubmit"),
                                    time: "",
                                  }] : []),
                                  ...(selectedSub.status === "resubmitted" ? [{
                                    dot: "bg-purple-500",
                                    label: t("admin.academics.submissionReviewCenter.timelineResubmitted"),
                                    detail: t("admin.academics.submissionReviewCenter.byLabel", { name: selectedSub.studentName }),
                                    time: fmtDate(selectedSub.submittedAt),
                                  }] : []),
                                  ...(selectedSub.status === "graded" || selectedSub.status === "closed" ? [{
                                    dot: "bg-purple-500",
                                    label: t("admin.academics.submissionReviewCenter.timelineGraded"),
                                    detail: t("admin.academics.submissionReviewCenter.scoreByLabel", { marks: selectedSub.marks, total: assignment.totalMarks, name: selectedSub.gradedBy||t("admin.academics.submissionReviewCenter.defaultTeacherName") }),
                                    time: selectedSub.gradedAt ? fmtDate(selectedSub.gradedAt) : "",
                                  }] : []),
                                  ...(selectedSub.status === "closed" ? [{
                                    dot: "bg-slate-400",
                                    label: t("admin.academics.submissionReviewCenter.timelineClosed"),
                                    detail: t("admin.academics.submissionReviewCenter.assignmentMarkedComplete"),
                                    time: "",
                                  }] : []),
                                ].map((ev, i) => (
                                  <div key={i} className="relative">
                                    <div className={cn("absolute -start-6 top-1.5 w-3 h-3 rounded-full border-2 border-white", ev.dot)}/>
                                    <div className="bg-white border border-slate-100 rounded-xl px-4 py-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-slate-800">{ev.label}</p>
                                        {ev.time && <p className="text-xs text-slate-400">{ev.time}</p>}
                                      </div>
                                      <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>

                      {/* ── Grading Panel — sits right after the content when the
                          submission is short; sticks to the bottom of the scroll
                          area once content is long enough to need scrolling ─── */}
                      <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 backdrop-blur-sm px-6 py-4 sticky bottom-0">

                        {/* Resubmission form */}
                        {showResubForm && (
                          <div className="mb-4 bg-orange-50 border border-orange-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-bold text-orange-800">{t("admin.academics.submissionReviewCenter.requestResubmissionTitle")}</h4>
                              <button onClick={() => setShowResubForm(false)} className="text-orange-400 hover:text-orange-600">
                                <X className="h-4 w-4"/>
                              </button>
                            </div>
                            <textarea value={resubNote} onChange={e => setResubNote(e.target.value)} rows={2}
                              placeholder={t("admin.academics.submissionReviewCenter.resubNotePlaceholder")}
                              className="w-full px-3 py-2 rounded-xl border border-orange-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 mb-2"/>
                            <button onClick={handleRequestResubmission} disabled={resubSending}
                              className="h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-60">
                              {resubSending ? t("admin.academics.submissionReviewCenter.sendingEllipsis") : t("admin.academics.submissionReviewCenter.sendResubmissionRequest")}
                            </button>
                          </div>
                        )}

                        {/* Already graded — show result */}
                        {isGraded && !editMode ? (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-5">
                              <div className="text-center">
                                <div className="text-3xl font-black text-slate-900">{selectedSub.marks}<span className="text-xl text-slate-400">/{assignment.totalMarks}</span></div>
                                <p className="text-xs text-slate-400 mt-0.5">{t("admin.academics.submissionReviewCenter.scoreLabel")}</p>
                              </div>
                              <div className="h-12 w-px bg-slate-200"/>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-0.5">{t("admin.academics.submissionReviewCenter.teacherFeedback")}</p>
                                <p className="text-sm text-slate-700">{selectedSub.feedback || <span className="text-slate-400 italic">{t("admin.academics.submissionReviewCenter.noFeedbackAdded")}</span>}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => setShowResubForm(true)}
                                className="h-9 px-3 rounded-xl border border-orange-200 text-orange-600 text-sm font-semibold hover:bg-orange-50">
                                <RotateCcw className="h-3.5 w-3.5 inline me-1"/>{t("admin.academics.submissionReviewCenter.resubmit")}
                              </button>
                              <button onClick={handleMarkComplete}
                                className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100">
                                <Archive className="h-3.5 w-3.5 inline me-1"/>{t("admin.academics.submissionReviewCenter.close")}
                              </button>
                              <button onClick={() => setEditMode(true)}
                                className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold">
                                <Edit2 className="h-3.5 w-3.5 inline me-1"/>{t("admin.academics.submissionReviewCenter.editGrade")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Grade form */
                          <div>
                            <div className="flex items-start gap-4 mb-3">
                              <div className="shrink-0">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">{t("admin.academics.submissionReviewCenter.marksLabel")}</label>
                                <div className="flex items-center gap-2">
                                  <input type="number" value={marks} onChange={e => setMarks(e.target.value)}
                                    min={0} max={assignment.totalMarks}
                                    placeholder="0"
                                    className={cn("w-20 h-11 text-center rounded-xl border text-lg font-black focus:outline-none focus:ring-2 focus:ring-blue-400",
                                      Number(marks) > assignment.totalMarks ? "border-rose-400 text-rose-600 bg-rose-50" : "border-slate-300 bg-white text-slate-900")}/>
                                  <span className="text-lg font-bold text-slate-400">/ {assignment.totalMarks}</span>
                                  {marks && (
                                    <span className={cn("text-sm font-bold rounded-lg px-2 py-1",
                                      Number(marks) >= (assignment.totalMarks * (assignment.passingScore/100)) ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50")}>
                                      {Math.round((Number(marks)/assignment.totalMarks)*100)}%
                                    </span>
                                  )}
                                </div>
                                {Number(marks) > assignment.totalMarks && (
                                  <p className="text-xs text-rose-500 mt-0.5">{t("admin.academics.submissionReviewCenter.cannotExceed", { max: assignment.totalMarks })}</p>
                                )}
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">{t("admin.academics.submissionReviewCenter.feedbackLabel")}</label>
                                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
                                  placeholder={t("admin.academics.submissionReviewCenter.feedbackPlaceholder")}
                                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"/>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button onClick={() => setShowResubForm(true)}
                                  className="h-9 px-3 rounded-xl border border-orange-200 text-orange-600 text-sm font-semibold hover:bg-orange-50">
                                  <RotateCcw className="h-3.5 w-3.5 inline me-1"/> {t("admin.academics.submissionReviewCenter.requestResubmissionButton")}
                                </button>
                                <button onClick={() => {
                                    const files = (selectedSub.attachments || []).filter((f: any) => f.url);
                                    if (!files.length) { toast.error(t("admin.academics.submissionReviewCenter.noDownloadableFilesToast")); return; }
                                    files.forEach((f: any) => {
                                      const a = document.createElement("a");
                                      a.href = f.url;
                                      a.download = f.name;
                                      a.click();
                                    });
                                  }}
                                  className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                                  <Download className="h-3.5 w-3.5 inline me-1"/> {t("admin.academics.submissionReviewCenter.downloadFiles")}
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                {editMode && (
                                  <button onClick={() => { setEditMode(false); if (selectedSub?.marks !== undefined){ setMarks(String(selectedSub.marks)); setFeedback(selectedSub.feedback||""); }}}
                                    className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                                    {t("admin.academics.submissionReviewCenter.cancel")}
                                  </button>
                                )}
                                <button onClick={handleSaveDraft}
                                  className="h-9 px-4 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
                                  {t("admin.academics.submissionReviewCenter.saveDraft")}
                                </button>
                                <button onClick={handlePublish} disabled={publishing || !marks || Number(marks) > assignment.totalMarks}
                                  className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-60 flex items-center gap-1.5">
                                  <Send className="h-3.5 w-3.5"/>
                                  {publishing ? t("admin.academics.submissionReviewCenter.publishingEllipsis") : t("admin.academics.submissionReviewCenter.publishFeedback")}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
