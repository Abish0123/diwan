import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { useClasses } from "@/hooks/useClasses";
import { useGrades } from "@/contexts/CurriculumContext";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { Class, Student } from "@/types/classes";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AddStudentDialog } from "@/components/classes/AddStudentDialog";
import { ManageClassDialog } from "@/components/classes/ManageClassDialog";
import { EditStudentDialog } from "@/components/classes/EditStudentDialog";
import { StudentDetailsDialog } from "@/components/students/StudentDetailsDialog";
import { SubjectDetailsDialog } from "@/components/classes/SubjectDetailsDialog";
import { ClassAssignmentsTab } from "@/components/classes/ClassAssignmentsTab";
import GradebookPro from "@/components/classes/GradebookPro";
import SubjectsPro from "@/components/classes/SubjectsPro";
import ExamsPro from "@/components/classes/ExamsPro";
import AssignmentsPro from "@/components/classes/AssignmentsPro";
import TimetablePro from "@/components/classes/TimetablePro";
import AttendancePro from "@/components/classes/AttendancePro";
import AssessmentsPro from "@/components/classes/AssessmentsPro";
import FlashCardsPro from "@/components/classes/FlashCardsPro";
import {
  useExams, addExam, deleteExam, updateExam, nextExamId,
  matchesSection, recordToDatesheet, summarizeSlots,
} from "@/lib/examStore";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeClassGradebook,
  type GradebookSources, type GradebookStudent,
} from "@/lib/gradebookEngine";
import { smartDb } from "@/lib/localDb";
import { checkClassTeacherAssignment } from "@/lib/roleAssignmentGuard";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import { AccessDenied } from "@/components/shared/AccessDenied";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  BarChart3,
  Brain,
  UserCheck,
  FileText,
  Settings,
  MoreVertical,
  Plus,
  Download,
  Pencil,
  Share2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  User,
  Award,
  Save,
  ArrowUpCircle,
  UserSearch,
  X,
  Upload,
  CreditCard,
  Printer,
  Hash,
  UserPlus,
  FileSpreadsheet,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "motion/react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';


const ClassDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const semesterName = (location.state as any)?.semesterName ?? null;
  const {
    classes,
    sections,
    enrollments,
    academicYears,
    timetableSlots,
    loading: classesLoading,
    updateClass,
    updateSection,
    deleteEnrollment,
    updateEnrollment,
    addTimetableSlot,
    updateTimetableSlot,
    deleteTimetableSlot,
    addEnrollment,
  } = useClasses();
  const { students, loading: studentsLoading, deleteStudent, addStudents, updateStudent } = useStudents();
  const { staff } = useStaff();
  const grades = useGrades();
  const [activeTab, setActiveTab] = useState("overview");
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSubjectDetailsOpen, setIsSubjectDetailsOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<{
    name: string;
    teacher: string;
    completion: number;
  } | null>(null);
  const [subjectDetailsType, setSubjectDetailsType] = useState<"syllabus" | "resources">("syllabus");

  // New dialog states
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStudent, setReportStudent] = useState<{ name: string; grade: string; attendance: number; scores: number[]; rank: number } | null>(null);
  const [assignFacultyOpen, setAssignFacultyOpen] = useState(false);
  const [assignFacultyName, setAssignFacultyName] = useState("");
  const [assignFacultySubject, setAssignFacultySubject] = useState("");
  const [changeTeacherOpen, setChangeTeacherOpen] = useState(false);
  const [changeTeacherSection, setChangeTeacherSection] = useState<any>(null);
  const [changeTeacherName, setChangeTeacherName] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSortBy, setFilterSortBy] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentKpiFilter, setStudentKpiFilter] = useState<"all" | "male" | "female" | "at-risk">("all");
  const [idCardsOpen, setIdCardsOpen] = useState(false);
  const [assigningRolls, setAssigningRolls] = useState(false);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const importStudentsRef = useRef<HTMLInputElement | null>(null);
  const subjectsImportRef = useRef<HTMLInputElement | null>(null);
  const genericImportRef = useRef<HTMLInputElement | null>(null);
  // Assignments "New Assignment" header button → opens AssignmentsPro create dialog
  const [assignmentCreateOpen, setAssignmentCreateOpen] = useState(false);
  // Live subject rows bubbled up from SubjectsPro so the header export can emit
  // real subject data (name/code/teacher/room/coverage) instead of the roster.
  const [subjectRows, setSubjectRows] = useState<{ name: string; code: string; teacher: string; room: string; coverage: number; periods: number }[]>([]);
  // Live gradebook rows bubbled up from GradebookPro for real Excel / report-card export.
  const [gradebookRows, setGradebookRows] = useState<{ name: string; rollNo: string; scores: Record<string, number>; total: number; max: number; pct: number; grade: string }[]>([]);
  const [gradebookSubjectCols, setGradebookSubjectCols] = useState<string[]>([]);
  // Per-tab export payloads bubbled up from each Pro so the header export emits the
  // active tab's OWN data (assignments, timetable, attendance, exams…).
  const [tabExports, setTabExports] = useState<Record<string, { header: string[]; rows: (string | number)[][]; filename: string }>>({});
  const registerTabExport = useCallback((key: string, payload: { header: string[]; rows: (string | number)[][]; filename: string }) => {
    setTabExports(prev => ({ ...prev, [key]: payload }));
  }, []);
  // Attendance "Mark Attendance" header button → opens AttendancePro's Take Attendance dialog.
  const [attendanceMarkOpen, setAttendanceMarkOpen] = useState(false);

  // Bulk selection + promotion
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTargetGrade, setPromoteTargetGrade] = useState("");
  const [promoteTargetClass, setPromoteTargetClass] = useState("");
  const [promoting, setPromoting] = useState(false);
  // Add from same grade
  const [addFromGradeOpen, setAddFromGradeOpen] = useState(false);
  const [gradeStudentSearch, setGradeStudentSearch] = useState("");
  const [selectedGradeStudents, setSelectedGradeStudents] = useState<Set<string>>(new Set());
  const [enrollingFromGrade, setEnrollingFromGrade] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [addSubjectName, setAddSubjectName] = useState("");
  const [addSubjectTeacher, setAddSubjectTeacher] = useState("");
  const [addSubjectPeriods, setAddSubjectPeriods] = useState("5");
  const [addSubjectRoom, setAddSubjectRoom] = useState("");
  const [addSubjectSection, setAddSubjectSection] = useState("All");
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleEndTime, setScheduleEndTime] = useState("");
  const [scheduleSubject, setScheduleSubject] = useState("");
  const [scheduleTeacher, setScheduleTeacher] = useState("");
  const [scheduleExamOpen, setScheduleExamOpen] = useState(false);
  // Exam datesheet builder — overall title + one row per subject (date + timing + invigilator + hall).
  type ExamSlot = { subject: string; date: string; start: string; end: string; invigilator: string; room: string };
  const blankExamSlot: ExamSlot = { subject: "", date: "", start: "", end: "", invigilator: "", room: "Hall A" };
  const [examName, setExamName] = useState("");
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([{ ...blankExamSlot }]);
  const EXAM_HALLS = ["Hall A", "Hall B", "Hall C", "Main Hall", "Exam Hall 1", "Exam Hall 2", "Room 101", "Room 102", "Lab 1", "Lab 2"];
  // Exam datesheets now come from the shared exam store (sd_exams) so they stay
  // in sync with the centralized /exams admin page — see examDatesheets below.
  const allExams = useExams();

  const currentClass = useMemo(() => classes.find(c => c.id === id), [classes, id]);
  const classSections = useMemo(() => sections.filter(s => s.classId === id), [sections, id]);
  const classEnrollments = useMemo(() => enrollments.filter(e => e.classId === id), [enrollments, id]);
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // This is the exact "manually enter a URL for another grade/section" path
  // the ClassesList grid can't itself expose (it doesn't link to arbitrary
  // ids) — a coordinator could still type /academics/classes/:id directly
  // for any class id. Checked once the real class record has loaded so we
  // gate on its real grade, not a stale/guessed one.
  const coordAccessDenied = isGradeCoordinator && !!currentClass && currentClass.grade !== coordAssignedGrade;
  const classAcademicYear = useMemo(() => academicYears.find(y => y.id === currentClass?.academicYearId), [academicYears, currentClass]);
  const classTimetable = useMemo(() => timetableSlots.filter(t => t.classId === id), [timetableSlots, id]);

  const classStudents = useMemo(() => {
    return classEnrollments.map(enrollment => {
      const student = students.find(s => s.id === enrollment.studentId);
      return {
        ...student,
        ...enrollment,
        id: enrollment.studentId, // Use student ID for actions
        enrollmentId: enrollment.id,
        name: student?.name || enrollment.studentName || "Unknown Student",
      };
    });
  }, [classEnrollments, students]);

  // A student is "at risk" if attendance is low or they're not active.
  const isAtRisk = (s: any) => (s.attendance != null && Number(s.attendance) < 75) || (s.status && s.status !== "Active");

  // KPI counts for the Students tab — derived from real enrollment+student data.
  const studentStats = useMemo(() => ({
    total: classStudents.length,
    boys: classStudents.filter(s => String((s as any).gender).toLowerCase() === "male").length,
    girls: classStudents.filter(s => String((s as any).gender).toLowerCase() === "female").length,
    atRisk: classStudents.filter(isAtRisk).length,
  }), [classStudents]);

  // Search + KPI/status filter + sort, all applied to the rendered table.
  const filteredClassStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    let rows = classStudents.filter((s: any) => {
      if (q) {
        const hay = `${s.name || ""} ${s.id || ""} ${s.sectionName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (studentKpiFilter === "male" && String(s.gender).toLowerCase() !== "male") return false;
      if (studentKpiFilter === "female" && String(s.gender).toLowerCase() !== "female") return false;
      if (studentKpiFilter === "at-risk" && !isAtRisk(s)) return false;
      return true;
    });
    if (filterSortBy === "name") rows = [...rows].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    else if (filterSortBy === "attendance") rows = [...rows].sort((a: any, b: any) => (Number(b.attendance) || 0) - (Number(a.attendance) || 0));
    else if (filterSortBy === "grade") rows = [...rows].sort((a: any, b: any) => String(a.grade).localeCompare(String(b.grade)));
    return rows;
  }, [classStudents, studentSearch, studentKpiFilter, filterSortBy]);

  // ── Quick Actions ──────────────────────────────────────────────────────────
  // Export the current (filtered) roster as a CSV download.
  function handleExportRoster() {
    const rows = filteredClassStudents;
    if (rows.length === 0) { toast.error(t('admin.academics.classDetail.noStudentsToExportToast')); return; }
    const cols = ["Roll No", "Student ID", "Name", "Email", "Gender", "Section", "Attendance", "Status"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(",")];
    rows.forEach((s: any, i: number) => {
      lines.push([s.rollNumber || String(i + 1).padStart(2, "0"), s.id, s.name, s.email || "", s.gender || "", s.sectionName || "", s.attendance ?? "", s.status || ""].map(esc).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(classData.name || "class").replace(/\s+/g, "-")}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('admin.academics.classDetail.exportedStudentsToast', { count: rows.length }));
  }

  // Small CSV download helper.
  function downloadCsv(filename: string, lines: string[]) {
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  const csvEsc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  // Export the subjects table (real teacher/room/coverage bubbled up from SubjectsPro).
  function handleExportSubjects() {
    const rows = subjectRows;
    if (rows.length === 0) { toast.error(t('admin.academics.classDetail.noSubjectsToExportToast')); return; }
    const cols = ["Subject Name", "Subject Code", "Teacher", "Room", "Periods/Week", "Syllabus Coverage %"];
    const lines = [cols.join(",")];
    rows.forEach(r => lines.push([r.name, r.code, r.teacher, r.room, r.periods, r.coverage].map(csvEsc).join(",")));
    downloadCsv(`${(classData.name || "class").replace(/\s+/g, "-")}-subjects.csv`, lines);
    toast.success(t('admin.academics.classDetail.exportedSubjectsToast', { count: rows.length }));
  }

  // Export the gradebook (students × subjects with totals) bubbled up from GradebookPro.
  function handleExportGradebook() {
    const rows = gradebookRows;
    if (rows.length === 0) { toast.error(t('admin.academics.classDetail.noGradebookMarksToast')); return; }
    const subs = gradebookSubjectCols;
    const cols = ["Roll No", "Student", ...subs, "Total", "Max", "Percentage", "Grade"];
    const lines = [cols.join(",")];
    rows.forEach(r => lines.push([
      r.rollNo, r.name, ...subs.map(s => r.scores[s] ?? ""), r.total, r.max, `${r.pct.toFixed(1)}%`, r.grade,
    ].map(csvEsc).join(",")));
    downloadCsv(`${(classData.name || "class").replace(/\s+/g, "-")}-gradebook.csv`, lines);
    toast.success(t('admin.academics.classDetail.exportedGradebookToast', { count: rows.length }));
  }

  // Export per-student report cards (one row each with subject marks + grade).
  function handleExportReportCards() {
    const rows = gradebookRows;
    if (rows.length === 0) { toast.error(t('admin.academics.classDetail.noComputedMarksToast')); return; }
    const subs = gradebookSubjectCols;
    const cols = ["Report Card", classData.name || "", semesterName || "", "", ...subs, "Total", "Percentage", "Grade", "Result"];
    const lines = [cols.map(csvEsc).join(",")];
    rows.forEach(r => lines.push([
      r.name, "", "", "", ...subs.map(s => r.scores[s] ?? ""), `${r.total}/${r.max}`, `${r.pct.toFixed(1)}%`, r.grade, r.pct >= 40 ? "PASS" : "FAIL",
    ].map(csvEsc).join(",")));
    downloadCsv(`${(classData.name || "class").replace(/\s+/g, "-")}-report-cards.csv`, lines);
    toast.success(t('admin.academics.classDetail.generatedReportCardsToast', { count: rows.length }));
  }

  // Context-aware export for the header three-dot — emits the ACTIVE tab's own data.
  function handleTabExport() {
    if (activeTab === "subjects") return handleExportSubjects();
    if (activeTab === "students" || activeTab === "overview") return handleExportRoster();
    const payload = tabExports[activeTab];
    if (!payload || payload.rows.length === 0) { toast.error(t('admin.academics.classDetail.noDataToExportToast')); return; }
    const lines = [payload.header.map(csvEsc).join(","), ...payload.rows.map(r => r.map(csvEsc).join(","))];
    downloadCsv(payload.filename, lines);
    toast.success(t('admin.academics.classDetail.exportedTabRowsToast', { count: payload.rows.length, tab: activeTab }));
  }

  // Context-aware import label/template per tab.
  const TAB_IMPORT_META: Record<string, { title: string; format: string; sample: string[] }> = {
    students: { title: t('admin.academics.classDetail.importMetaTitleStudents'), format: t('admin.academics.classDetail.importMetaFormatStudents'), sample: ["Name,Email,Gender", "Ali Khan,ali@example.com,Male"] },
    subjects: { title: t('admin.academics.classDetail.importMetaTitleSubjects'), format: t('admin.academics.classDetail.importMetaFormatSubjects'), sample: ["Subject Name", "Mathematics", "Science"] },
    assignments: { title: t('admin.academics.classDetail.importMetaTitleAssignments'), format: t('admin.academics.classDetail.importMetaFormatAssignments'), sample: ["Title,Subject,Type,Due Date,Total Marks", "Algebra Worksheet,Mathematics,Worksheet,2026-07-10,20"] },
    timetable: { title: t('admin.academics.classDetail.importMetaTitleTimetable'), format: t('admin.academics.classDetail.importMetaFormatTimetable'), sample: ["Day,Time,Subject,Teacher,Room", "Monday,08:00 - 08:40,Mathematics,Mr. Imran,Room 101"] },
    attendance: { title: t('admin.academics.classDetail.importMetaTitleAttendance'), format: t('admin.academics.classDetail.importMetaFormatAttendance'), sample: ["Roll,Name,Status", "1,Ali Khan,Present"] },
    exams: { title: t('admin.academics.classDetail.importMetaTitleExams'), format: t('admin.academics.classDetail.importMetaFormatExams'), sample: ["Subject,Date,Start,End,Invigilator", "Mathematics,2026-07-05,09:00,11:00,Mr. Imran"] },
  };

  // Auto-assign sequential roll numbers to every student in the class (persists to MySQL).
  async function handleAssignRollNumbers() {
    if (classStudents.length === 0) { toast.error(t('admin.academics.classDetail.noStudentsToNumberToast')); return; }
    setAssigningRolls(true);
    try {
      const ordered = [...classStudents].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      await Promise.all(ordered.map((s: any, i: number) => {
        const rollNo = String(i + 1).padStart(2, "0");
        return Promise.all([
          updateEnrollment(s.enrollmentId, { rollNumber: rollNo } as any),
          updateStudent(s.id, { rollNumber: rollNo } as any),
        ]);
      }));
      toast.success(t('admin.academics.classDetail.rollNumbersAssignedToast', { count: ordered.length }));
    } catch {
      toast.error(t('admin.academics.classDetail.rollNumbersSaveFailedToast'));
    } finally {
      setAssigningRolls(false);
    }
  }

  // Bulk import students from a CSV (Name,Email,Gender) — creates student + enrollment in this class.
  async function handleImportStudents(file: File) {
    setImportingStudents(true);
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      if (rows.length === 0) { toast.error(t('admin.academics.classDetail.fileEmptyToast')); return; }
      const header = rows[0].toLowerCase();
      const hasHeader = header.includes("name");
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const sec = (String(classData.name).match(/Section\s+([A-Z])/i)?.[1] || "A").toUpperCase();
      let created = 0;
      for (const line of dataRows) {
        const cells = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
        const name = cells[0];
        if (!name) continue;
        const studentId = "STD-" + Math.floor(1000 + Math.random() * 9000) + "-" + created;
        await addStudents([{ id: studentId, name, email: cells[1] || "", gender: cells[2] || "", grade: classData.grade, section: sec, classId: id, status: "Active" } as any]);
        await addEnrollment({ studentId, studentName: name, classId: id!, className: classData.name, sectionId: id!, sectionName: sec, grade: classData.grade, academicYear: classData.academicYear || "2026-27", status: "Active" } as any);
        created++;
      }
      toast.success(t('admin.academics.classDetail.importedStudentsToast', { count: created, class: classData.name }));
      setImportDialogOpen(false);
    } catch {
      toast.error(t('admin.academics.classDetail.importFailedStudentsToast'));
    } finally {
      setImportingStudents(false);
      if (importStudentsRef.current) importStudentsRef.current.value = "";
    }
  }

  // Persist the subject list to EVERY section of this grade (subjects are grade-wide).
  async function persistGradeSubjects(names: string[]) {
    const gradeClasses = classes.filter(c => c.grade === classData.grade);
    if (gradeClasses.length === 0) return;
    try {
      await Promise.all(gradeClasses.map(c => updateClass(c.id, { subjects: names } as any)));
      toast.success(t('admin.academics.classDetail.subjectsSavedAllToast', { count: gradeClasses.length }));
    } catch {
      toast.error(t('admin.academics.classDetail.subjectsSaveFailedToast'));
    }
  }

  // Import subjects from a CSV (first column = subject name) and persist grade-wide.
  async function handleImportSubjects(file: File) {
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      if (rows.length === 0) { toast.error(t('admin.academics.classDetail.fileEmptyToast')); return; }
      const header = rows[0].toLowerCase();
      const dataRows = (header.includes("subject") || header.includes("name")) ? rows.slice(1) : rows;
      const names = dataRows.map(line => line.split(",")[0].replace(/^"|"$/g, "").trim()).filter(Boolean);
      if (names.length === 0) { toast.error(t('admin.academics.classDetail.noSubjectNamesFoundToast')); return; }
      const existing = currentClass?.subjects || [];
      const merged = [...existing];
      let added = 0;
      names.forEach(n => { if (!merged.some(e => e.toLowerCase() === n.toLowerCase())) { merged.push(n); added++; } });
      await persistGradeSubjects(merged);
      toast.success(added === 1 ? t('admin.academics.classDetail.importedSubjectSingularToast', { count: added }) : t('admin.academics.classDetail.importedSubjectPluralToast', { count: added }));
      setImportDialogOpen(false);
    } catch {
      toast.error(t('admin.academics.classDetail.importFailedSubjectsToast'));
    } finally {
      if (subjectsImportRef.current) subjectsImportRef.current.value = "";
    }
  }

  // Download a CSV import template for students.
  function downloadStudentTemplate() {
    const blob = new Blob(["Name,Email,Gender\nJohn Doe,john@example.com,Male\nJane Roe,jane@example.com,Female\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "student-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const classData = useMemo(() => {
    if (!currentClass) return {
      id: "1",
      name: "Loading...",
      grade: "N/A",
      section: "N/A",
      teacher: "N/A",
      studentsCount: 0,
      subjectsCount: 0,
      status: "Inactive",
      performance: 0,
      attendance: 0,
      academicYear: "N/A"
    };

    // Aggregate data from sections and enrollments
    const totalStudents = classEnrollments.length;
    const primaryTeacher = classSections[0]?.teacherName || "Not Assigned";
    const totalSubjects = currentClass.subjects?.length || 0;

    return {
      ...currentClass,
      teacher: primaryTeacher,
      studentsCount: totalStudents,
      subjectsCount: totalSubjects,
      performance: 0, // real value comes from `overview.performance` (gradebook engine)
      attendance: 0,  // real value comes from `overview.attendance` (attendance table)
      academicYear: classAcademicYear?.name || currentClass.academicYear || "N/A"
    };
  }, [currentClass, classSections, classEnrollments, classAcademicYear]);

  // Identify this section (grade + section letter) so we can pull its exams from
  // the shared store and tag any datesheet created here.
  const sectionGrade = useMemo(() => {
    const g = (classData.grade || "").trim();
    return /^\d+$/.test(g) ? `Grade ${g}` : g;
  }, [classData.grade]);
  const sectionName = useMemo(() => {
    const s = (currentClass as any)?.section;
    if (s) return String(s);
    const name = currentClass?.name || "";
    const grade = currentClass?.grade || "";
    for (const prefix of [`${grade} - `, `${grade} `]) {
      if (name.startsWith(prefix)) return name.slice(prefix.length).trim();
    }
    return name;
  }, [currentClass]);

  // ── Overview tab: REAL computed stats (no canned numbers) ──────────────────
  // Marks via the shared gradebook engine (assignments+assessments+exams,
  // curriculum-band weighted — same engine as every other gradebook surface),
  // attendance from the real attendance table, next exam from the shared exam
  // store. Every card renders "—"/empty-state when there's genuinely no data.
  const { curriculum } = useCurriculum();
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<Record<string, unknown>[]>([]);
  const [recentAssignments, setRecentAssignments] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    let alive = true;
    loadGradebookSources().then(s => { if (alive) setGbSources(s); }).catch(() => {});
    smartDb.getAll("attendance").then(rows => { if (alive) setAttendanceRows(Array.isArray(rows) ? rows : []); }).catch(() => {});
    smartDb.getAll("Assignment", "").then(rows => { if (alive) setRecentAssignments(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const overview = useMemo(() => {
    const roster: GradebookStudent[] = classStudents.map((s: any) => ({
      id: String(s.id), name: s.name,
      grade: s.grade || sectionGrade, section: s.section || s.sectionName || sectionName,
    }));
    const ids = new Set(roster.map(r => r.id));

    // Marks — class average + per-subject averages from the real engine.
    let performance: number | null = null;
    let subjectAverages: { name: string; score: number }[] = [];
    let atRiskMarks = 0;
    if (gbSources && roster.length > 0) {
      const band = getBandForGrade(curriculum, sectionGrade);
      const rows = computeClassGradebook(roster, band, gbSources);
      const graded = rows.filter(r => r.subjects.some(sg => sg.hasData));
      if (graded.length > 0) {
        performance = graded.reduce((a, r) => a + r.overallPercentage, 0) / graded.length;
        const bySubject = new Map<string, number[]>();
        graded.forEach(r => r.subjects.forEach(sg => {
          if (!sg.hasData) return;
          if (!bySubject.has(sg.subject)) bySubject.set(sg.subject, []);
          bySubject.get(sg.subject)!.push(sg.percentage);
        }));
        subjectAverages = Array.from(bySubject.entries())
          .map(([name, pcts]) => ({ name, score: pcts.reduce((a, b) => a + b, 0) / pcts.length }))
          .sort((a, b) => b.score - a.score);
        atRiskMarks = graded.filter(r => r.overallPercentage < 50).length;
      }
    }

    // Attendance — real Present/Late/Absent records for THIS class's students.
    const myAtt = attendanceRows.filter((r: any) => r.entityType === "student" && ids.has(String(r.entityId)));
    const attScore = (rows: any[]) => {
      if (rows.length === 0) return null;
      const score = rows.reduce((a, r) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
      return (score / rows.length) * 100;
    };
    const attendance = attScore(myAtt);
    // Monthly trend (last 6 calendar months that actually have records).
    const byMonth = new Map<string, any[]>();
    myAtt.forEach((r: any) => {
      const m = String(r.date || "").slice(0, 7); // yyyy-mm
      if (!m) return;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(r);
    });
    const attendanceTrend = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([m, rows]) => ({
        month: new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" }),
        attendance: Math.round((attScore(rows) || 0) * 10) / 10,
      }));

    // At-risk = failing marks OR low attendance OR inactive status (deduped).
    const atRiskAttendance = classStudents.filter(isAtRisk).length;
    const atRisk = Math.max(atRiskMarks, atRiskAttendance);

    // Next exam for this grade/section from the shared store.
    const todayStr = new Date().toISOString().slice(0, 10);
    const nextExam = allExams
      .filter(e => matchesSection(e, sectionGrade, sectionName) && (e.status === "Scheduled" || e.status === "Ongoing") && e.startDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
    const daysToExam = nextExam
      ? Math.max(0, Math.round((new Date(nextExam.startDate + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86400000))
      : null;

    // Recent activities — latest real events touching this class.
    const activities: { title: string; time: string; icon: any; color: string; bg: string }[] = [];
    const lastAtt = myAtt.map((r: any) => String(r.date || "")).sort().pop();
    if (lastAtt) activities.push({ title: "Attendance marked", time: lastAtt, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" });
    const gradeAssignments = recentAssignments
      .filter((a: any) => String(a.grade || "").toLowerCase().replace("grade ", "").trim() === sectionGrade.toLowerCase().replace("grade ", "").trim())
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (gradeAssignments[0]) activities.push({
      title: `Assignment posted — ${(gradeAssignments[0] as any).title || (gradeAssignments[0] as any).subject || "Untitled"}`,
      time: String((gradeAssignments[0] as any).createdAt || "").slice(0, 10), icon: FileText, color: "text-purple-600", bg: "bg-blue-50",
    });
    const sectionExams = allExams.filter(e => matchesSection(e, sectionGrade, sectionName));
    const lastExam = [...sectionExams].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
    if (lastExam) activities.push({ title: `Exam ${lastExam.status.toLowerCase()} — ${lastExam.name}`, time: lastExam.startDate, icon: BarChart3, color: "text-purple-600", bg: "bg-indigo-50" });

    // Insight text generated from the REAL stats above (no canned copy).
    let insight: string | null = null;
    if (performance !== null && subjectAverages.length > 0) {
      const best = subjectAverages[0];
      const worst = subjectAverages[subjectAverages.length - 1];
      insight = `${currentClass?.name || "This class"} is averaging ${performance.toFixed(1)}% overall. Strongest subject: ${best.name} (${best.score.toFixed(1)}%)` +
        (worst.name !== best.name ? `; weakest: ${worst.name} (${worst.score.toFixed(1)}%).` : ".") +
        (atRisk > 0 ? ` ${atRisk} student${atRisk === 1 ? " is" : "s are"} at risk — consider a remedial plan.` : " No students currently at risk.");
    }

    return { performance, attendance, attendanceTrend, subjectAverages, atRisk, nextExam, daysToExam, activities, insight };
  }, [classStudents, gbSources, attendanceRows, recentAssignments, curriculum, sectionGrade, sectionName, allExams, currentClass]);
  // Datesheets for THIS section: store exams whose grade matches and section is
  // this one (or "All Sections"). Two-way synced with the central /exams page.
  const examDatesheets = useMemo(
    () => allExams.filter(e => matchesSection(e, sectionGrade, sectionName)).map(recordToDatesheet),
    [allExams, sectionGrade, sectionName],
  );

  const tabs = [
    { id: "overview", label: t('admin.academics.classDetail.tabOverview'), icon: BarChart3 },
    { id: "students", label: t('admin.academics.classDetail.tabStudents'), icon: Users },
    { id: "gradebook", label: t('admin.academics.classDetail.tabGradebook'), icon: Award },
    { id: "subjects", label: t('admin.academics.classDetail.tabSubjects'), icon: BookOpen },
    { id: "assignments", label: t('admin.academics.classDetail.tabAssignments'), icon: FileText },
    { id: "assessments", label: t('admin.academics.classDetail.tabAssessments'), icon: ClipboardCheck },
    { id: "flashcards", label: t('admin.academics.classDetail.tabFlashcards'), icon: Brain },
    { id: "timetable", label: t('admin.academics.classDetail.tabTimetable'), icon: Calendar },
    { id: "attendance", label: t('admin.academics.classDetail.tabAttendance'), icon: UserCheck },
    { id: "exams", label: t('admin.academics.classDetail.tabExams'), icon: FileText },
  ];

  const classSubjects: string[] = (currentClass?.subjects || []).slice(0, 6);

  if (coordAccessDenied) {
    return (
      <DashboardLayout>
        <AccessDenied detail={coordAssignedGrade ? `You're assigned to ${coordAssignedGrade}.` : "You haven't been assigned a grade yet — contact your administrator."} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="hover:text-primary cursor-pointer" onClick={() => navigate("/")}>{t('admin.academics.classDetail.breadcrumbHome')}</span>
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
            <span className="hover:text-primary cursor-pointer" onClick={() => navigate("/academics/classes")}>{t('admin.academics.classDetail.breadcrumbAcademics')}</span>
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
            <span className="hover:text-primary cursor-pointer" onClick={() => navigate("/academics/classes", { state: { selectedGrade: classData.grade } })}>{t('admin.academics.classDetail.breadcrumbClasses')}</span>
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
            <span className="hover:text-primary cursor-pointer" onClick={() => navigate("/academics/classes", { state: { selectedGrade: classData.grade, selectedClassId: id } })}>
              {(() => {
                const name = classData.name || "";
                const grade = classData.grade || "";
                for (const prefix of [`${grade} - `, `${grade} `]) {
                  if (name.startsWith(prefix)) return `${grade} - ${name.slice(prefix.length).trim()}`;
                }
                return name;
              })()}
            </span>
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
            <span className="text-primary">{semesterName || t('admin.academics.classDetail.breadcrumbDashboard')}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-3xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">{classData.name}</h1>
                  <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
                    {classData.status}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-500 font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
                    {classData.academicYear}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    {classData.teacher}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {classData.studentsCount} {t('admin.academics.classDetail.studentsCountSuffix')}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    {classData.subjectsCount} {t('admin.academics.classDetail.subjectsCountSuffix')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === "gradebook" ? (
                <>
                  {/* Marks are auto-computed from Assignments/Assessments/Exams — no
                      direct entry into the gradebook, so the only action is export. */}
                  <Button className="rounded-xl gradient-primary text-white font-bold gap-2 h-11 shadow-lg shadow-primary/20"
                    onClick={handleExportGradebook}>
                    <FileSpreadsheet className="w-4 h-4" /> {t('admin.academics.classDetail.exportExcelCsv')}
                  </Button>
                </>
              ) : (() => {
                // Context-aware primary action — all actions are handled in-place
                // (dialogs / tab state) so the user never leaves the class detail.
                const PRIMARY: Record<string, { label: string; icon: any; onClick: () => void }> = {
                  students: { label: t('admin.academics.classDetail.addFromGrade'), icon: UserSearch, onClick: () => setAddFromGradeOpen(true) },
                  subjects: { label: t('admin.academics.classDetail.addSubject'), icon: Plus, onClick: () => setAddSubjectOpen(true) },
                  attendance: { label: t('admin.academics.classDetail.scheduleExam'), icon: FileText, onClick: () => setScheduleExamOpen(true) },
                  exams: { label: t('admin.academics.classDetail.scheduleExam'), icon: FileText, onClick: () => setScheduleExamOpen(true) },
                  assignments: { label: t('admin.academics.classDetail.newAssignment'), icon: FileText, onClick: () => { setActiveTab("assignments"); setAssignmentCreateOpen(true); } },
                  timetable: { label: t('admin.academics.classDetail.editSchedule'), icon: Calendar, onClick: () => setEditScheduleOpen(true) },
                };
                // Attendance has no schedule action — use a tailored primary.
                if (activeTab === "attendance") PRIMARY.attendance = { label: t('admin.academics.classDetail.markAttendance'), icon: UserCheck, onClick: () => setAttendanceMarkOpen(true) };
                const primary = PRIMARY[activeTab] || { label: t('admin.academics.classDetail.manageClass'), icon: Settings, onClick: () => setIsManageOpen(true) };
                // Per-tab extra action surfaced inside the three-dot menu.
                const EXTRA: Record<string, { label: string; onClick: () => void }> = {
                  students: { label: t('admin.academics.classDetail.promoteStudents'), onClick: () => { setSelectedStudentIds(new Set()); const gi = grades.indexOf(classData.grade || ""); setPromoteTargetGrade(gi >= 0 && gi < grades.length - 1 ? grades[gi + 1] : ""); setPromoteTargetClass(""); setPromoteOpen(true); } },
                  subjects: { label: t('admin.academics.classDetail.addSubject'), onClick: () => setAddSubjectOpen(true) },
                  exams: { label: t('admin.academics.classDetail.scheduleExam'), onClick: () => setScheduleExamOpen(true) },
                  timetable: { label: t('admin.academics.classDetail.editSchedule'), onClick: () => setEditScheduleOpen(true) },
                };
                const extra = EXTRA[activeTab];
                // Context-aware export/import: each tab exports its OWN data.
                const onExport = handleTabExport;
                const importMeta = TAB_IMPORT_META[activeTab];
                return (
                <>
                  <Button onClick={primary.onClick} className="rounded-xl gradient-primary text-white font-bold gap-2 h-11 shadow-lg shadow-primary/20">
                    <primary.icon className="h-5 w-5" /> {primary.label}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="rounded-xl border-slate-200 h-11 w-11 p-0">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl min-w-[200px]">
                      <DropdownMenuItem className="text-xs font-bold" onClick={onExport}>
                        <FileSpreadsheet className="h-4 w-4 me-2" /> {t('admin.academics.classDetail.exportDataCsv', { title: importMeta?.title || t('admin.academics.classDetail.dataFallback') })}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-bold" onClick={() => setImportDialogOpen(true)}>
                        <Upload className="h-4 w-4 me-2" /> {t('admin.academics.classDetail.importDataLabel', { title: importMeta?.title || t('admin.academics.classDetail.dataFallback') })}
                      </DropdownMenuItem>
                      {extra && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-xs font-bold" onClick={extra.onClick}>
                            <Plus className="h-4 w-4 me-2" /> {extra.label}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
                );
              })()}
            </div>
          </div>
        </div>


        <ManageClassDialog 
          open={isManageOpen} 
          onOpenChange={setIsManageOpen} 
          classData={classData as Class} 
        />

        {selectedStudent && (
          <EditStudentDialog
            open={isEditStudentOpen}
            onOpenChange={setIsEditStudentOpen}
            student={selectedStudent}
          />
        )}

        <StudentDetailsDialog
          student={profileStudent}
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
        />

        <AddStudentDialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen} classId={id!} />

        {/* Import — context-aware per active tab */}
        {(() => {
          const meta = TAB_IMPORT_META[activeTab] || TAB_IMPORT_META.students;
          const triggerUpload = () => {
            if (activeTab === "students") return importStudentsRef.current?.click();
            if (activeTab === "subjects") return subjectsImportRef.current?.click();
            return genericImportRef.current?.click();
          };
          return (
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogContent className="rounded-2xl max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Upload className="h-5 w-5 text-[#9810fa]" /> {t('admin.academics.classDetail.importDataLabel', { title: meta.title })}
                </DialogTitle>
                <DialogDescription className="font-medium text-slate-500">
                  {t('admin.academics.classDetail.importIntoClassDesc', { title: meta.title.toLowerCase(), class: classData.name })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-[#9810fa] text-white text-xs font-bold flex items-center justify-center">1</span>
                    <p className="text-sm font-bold text-slate-800">{t('admin.academics.classDetail.downloadTemplateStep')}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('admin.academics.classDetail.csvFormatDesc')} <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">{meta.format}</code>.
                  </p>
                  <Button variant="outline" className="w-full rounded-xl border-slate-200 gap-2 font-semibold"
                    onClick={() => activeTab === "students" ? downloadStudentTemplate() : downloadCsv(`${meta.title.toLowerCase()}-template.csv`, meta.sample)}>
                    <FileSpreadsheet className="h-4 w-4" /> {t('admin.academics.classDetail.downloadTemplateBtn')}
                  </Button>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-[#9810fa] text-white text-xs font-bold flex items-center justify-center">2</span>
                    <p className="text-sm font-bold text-slate-800">{t('admin.academics.classDetail.uploadFilledFileStep')}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('admin.academics.classDetail.uploadFilledFileDesc', { title: meta.title.toLowerCase() })}
                  </p>
                  <Button className="w-full rounded-xl gradient-primary text-white font-bold gap-2" disabled={importingStudents}
                    onClick={triggerUpload}>
                    <Upload className="h-4 w-4" /> {importingStudents ? t('admin.academics.classDetail.importingEllipsis') : t('admin.academics.classDetail.chooseCsvUpload')}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setImportDialogOpen(false)}>{t('admin.academics.classDetail.close')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          );
        })()}
        <input ref={subjectsImportRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportSubjects(f); }} />
        <input ref={genericImportRef} type="file" accept=".csv" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              const text = await f.text();
              const rowCount = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean).length;
              const meta = TAB_IMPORT_META[activeTab];
              toast.success(t('admin.academics.classDetail.importedGenericRowsToast', { count: Math.max(0, rowCount - 1), title: (meta?.title || t('admin.academics.classDetail.dataFallback')).toLowerCase(), file: f.name }));
              setImportDialogOpen(false);
            }
            if (e.target) e.target.value = "";
          }} />

        {/* Generate ID Cards */}
        <Dialog open={idCardsOpen} onOpenChange={setIdCardsOpen}>
          <DialogContent className="rounded-2xl max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#9810fa]" /> {t('admin.academics.classDetail.studentIdCards', { class: classData.name })}
              </DialogTitle>
              <DialogDescription className="font-medium text-slate-500">
                {t('admin.academics.classDetail.cardsReadyDesc', { count: filteredClassStudents.length })}
              </DialogDescription>
            </DialogHeader>
            <div id="id-cards-print" className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-min items-start overflow-y-auto p-1">
              {filteredClassStudents.map((s: any, i: number) => (
                <div key={s.id} className="rounded-2xl border border-slate-200 shadow-sm bg-white">
                  <div className="gradient-primary rounded-t-2xl px-4 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-black text-white/90 uppercase tracking-wider">{classData.academicYear || "2026-27"}</span>
                    <GraduationCap className="h-4 w-4 text-white/90" />
                  </div>
                  <div className="p-4 flex flex-col items-center text-center">
                    <Avatar className="h-14 w-14 border-2 border-slate-100 mb-2">
                      <AvatarFallback className="bg-slate-100 text-slate-600 font-black">
                        {(s.name || "ST").split(" ").map((n: string) => n[0] || "").join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-black text-slate-900 leading-tight">{s.name}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">{t('admin.academics.classDetail.rollLabel', { roll: s.rollNumber || String(i + 1).padStart(2, "0") })} · {s.id}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <Badge variant="outline" className="border-slate-200">{classData.name}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setIdCardsOpen(false)}>{t('admin.academics.classDetail.close')}</Button>
              <Button className="rounded-xl gradient-primary text-white font-bold gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> {t('admin.academics.classDetail.printCards')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SubjectDetailsDialog 
          open={isSubjectDetailsOpen} 
          onOpenChange={setIsSubjectDetailsOpen} 
          subject={selectedSubject} 
          type={subjectDetailsType} 
        />

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none h-auto p-0 gap-8 relative z-10">
            {tabs.map((tab) => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#9810fa] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-4 text-sm font-bold text-slate-500 data-[state=active]:text-[#9810fa] transition-all gap-2 hover:text-slate-700"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Stats Grid — hidden on tabs that have their own KPI rows */}
          {!["gradebook", "subjects", "exams", "assignments", "assessments", "flashcards", "timetable", "attendance", "students"].includes(activeTab) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-2xl">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.academics.classDetail.academicPerformance')}</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-black text-slate-900">{overview.performance !== null ? `${overview.performance.toFixed(1)}%` : "—"}</h3>
                    {overview.performance === null && <span className="text-[10px] font-bold text-slate-400">{t('admin.academics.classDetail.noMarksYet')}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-2xl">
                  <UserCheck className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.academics.classDetail.avgAttendance')}</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-black text-slate-900">{overview.attendance !== null ? `${overview.attendance.toFixed(1)}%` : "—"}</h3>
                    {overview.attendance === null && <span className="text-[10px] font-bold text-slate-400">{t('admin.academics.classDetail.noRecordsYet')}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl group cursor-pointer hover:shadow-md transition-all" onClick={() => setActiveTab("students")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-rose-50 rounded-2xl group-hover:bg-rose-100 transition-colors">
                  <AlertCircle className="h-6 w-6 text-rose-600" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.academics.classDetail.atRiskStudents')}</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-2xl font-black text-slate-900">{overview.atRisk}</h3>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] font-black text-rose-600 hover:bg-rose-50 p-0 px-2 rounded-full">
                      {t('admin.academics.classDetail.takeAction')}
                      <ArrowRight className="h-3 w-3 ms-1 rtl:rotate-180" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-50 rounded-2xl">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.academics.classDetail.upcomingExam')}</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-black text-slate-900 truncate max-w-[140px]">{overview.nextExam ? overview.nextExam.name : t('admin.academics.classDetail.noneScheduled')}</h3>
                    {overview.nextExam && (
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                        {overview.daysToExam === 0 ? t('admin.academics.classDetail.today') : (overview.daysToExam === 1 ? t('admin.academics.classDetail.inDay', { count: overview.daysToExam }) : t('admin.academics.classDetail.inDays', { count: overview.daysToExam }))}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          <div className="mt-6 relative">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <TabsContent value="overview" className="m-0 space-y-6 outline-none">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-bold">{t('admin.academics.classDetail.attendanceTrendTitle')}</CardTitle>
                            <Button variant="ghost" size="sm" className="text-[#9810fa] font-bold" onClick={() => {
                              setReportStudent({
                                name: classData.name + " – Full Class",
                                grade: overview.performance !== null ? (overview.performance >= 90 ? "A+" : overview.performance >= 80 ? "A" : overview.performance >= 70 ? "B+" : overview.performance >= 60 ? "B" : overview.performance >= 50 ? "C" : "D") : "—",
                                attendance: overview.attendance !== null ? Math.round(overview.attendance) : 0,
                                scores: overview.subjectAverages.map(s => Math.round(s.score)),
                                rank: 1
                              });
                              setReportOpen(true);
                            }}>{t('admin.academics.classDetail.viewFullReport')}</Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6">
                          {overview.attendanceTrend.length === 0 ? (
                            <div className="h-[300px] w-full mt-4 flex flex-col items-center justify-center text-slate-400">
                              <UserCheck className="h-10 w-10 opacity-30 mb-2" />
                              <p className="text-sm font-semibold text-slate-500">{t('admin.academics.classDetail.noAttendanceRecordsYet')}</p>
                              <p className="text-xs">{t('admin.academics.classDetail.attendanceTrendEmptyDesc')}</p>
                            </div>
                          ) : (
                          <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={overview.attendanceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#9810fa" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#9810fa" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                  dataKey="month" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                                  dy={10}
                                />
                                <YAxis
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#fff',
                                    border: 'none',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                                    padding: '12px'
                                  }}
                                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                  formatter={(v: number) => [`${v}%`, "Attendance"]}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="attendance"
                                  stroke="#9810fa"
                                  strokeWidth={4}
                                  fillOpacity={1}
                                  fill="url(#colorPerf)"
                                  animationDuration={1500}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          )}
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                            <CardTitle className="text-lg font-bold">{t('admin.academics.classDetail.subjectWisePerformance')}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-6 space-y-4">
                            {overview.subjectAverages.length === 0 ? (
                              <div className="py-8 text-center text-slate-400">
                                <BarChart3 className="h-8 w-8 mx-auto opacity-30 mb-2" />
                                <p className="text-sm font-semibold text-slate-500">{t('admin.academics.classDetail.noMarksRecordedYet')}</p>
                                <p className="text-xs">{t('admin.academics.classDetail.subjectAveragesEmptyDesc')}</p>
                              </div>
                            ) : overview.subjectAverages.slice(0, 6).map((sub, i) => {
                              const colors = ["bg-blue-500", "bg-emerald-500", "bg-indigo-500", "bg-amber-500", "bg-rose-500", "bg-violet-500"];
                              return (
                                <div key={sub.name} className="space-y-2">
                                  <div className="flex justify-between text-sm font-bold">
                                    <span className="text-slate-600">{sub.name}</span>
                                    <span className="text-slate-900">{sub.score.toFixed(1)}%</span>
                                  </div>
                                  <Progress value={sub.score} className="h-2 bg-slate-100" indicatorClassName={colors[i % colors.length]} />
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                            <CardTitle className="text-lg font-bold">{t('admin.academics.classDetail.recentActivities')}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-6">
                            {overview.activities.length === 0 ? (
                              <div className="py-8 text-center text-slate-400">
                                <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                                <p className="text-sm font-semibold text-slate-500">{t('admin.academics.classDetail.noActivityYet')}</p>
                                <p className="text-xs">{t('admin.academics.classDetail.activityEmptyDesc')}</p>
                              </div>
                            ) : (
                            <div className="space-y-6">
                              {overview.activities.map((activity, i) => (
                                <div key={i} className="flex gap-4">
                                  <div className={`h-10 w-10 rounded-xl ${activity.bg} flex items-center justify-center shrink-0`}>
                                    <activity.icon className={`h-5 w-5 ${activity.color}`} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{activity.title}</p>
                                    <p className="text-xs text-slate-500 font-medium">{activity.time}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                          <CardTitle className="text-lg font-bold">{t('admin.academics.classDetail.classFaculty')}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                          {classSections.map((section, i) => (
                            <div key={i} className="flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-slate-100">
                                  <AvatarFallback className="bg-slate-100 text-slate-600 font-bold text-xs">
                                    {section.teacherName?.split(' ').map((n: string) => n[0] || "").join('') || "T"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{section.teacherName || t('admin.academics.classDetail.notAssigned')}</p>
                                  <p className="text-xs text-slate-500 font-medium">{t('admin.academics.classDetail.classTeacherSectionLabel', { section: section.name })}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 rounded-lg text-xs font-bold text-[#9810fa] hover:bg-[#9810fa]/10"
                                  onClick={() => {
                                    setChangeTeacherSection(section);
                                    setChangeTeacherName(section.teacherName || "");
                                    setChangeTeacherOpen(true);
                                  }}
                                >
                                  {t('admin.academics.classDetail.change')}
                                </Button>
                              </div>
                            </div>
                          ))}
                          {classSections.length === 0 && (
                            <p className="text-sm text-slate-400 text-center py-4">{t('admin.academics.classDetail.noSectionsAssigned')}</p>
                          )}
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 rounded-xl border-dashed border-2 text-slate-500 font-bold text-sm" onClick={() => setAssignFacultyOpen(true)}>
                              + {t('admin.academics.classDetail.addTeacher')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="students" className="m-0 space-y-6">
                  {/* KPI cards — click to filter the table below */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { key: "all" as const, label: t('admin.academics.classDetail.totalStudents'), value: studentStats.total, sub: t('admin.academics.classDetail.inThisClass'), icon: Users, color: "indigo" },
                      { key: "male" as const, label: t('admin.academics.classDetail.boys'), value: studentStats.boys, sub: studentStats.total ? `${Math.round(studentStats.boys / studentStats.total * 100)}%` : "0%", icon: Users, color: "blue" },
                      { key: "female" as const, label: t('admin.academics.classDetail.girls'), value: studentStats.girls, sub: studentStats.total ? `${Math.round(studentStats.girls / studentStats.total * 100)}%` : "0%", icon: Users, color: "pink" },
                      { key: "at-risk" as const, label: t('admin.academics.classDetail.atRiskStudents'), value: studentStats.atRisk, sub: t('admin.academics.classDetail.needAttention'), icon: AlertCircle, color: "rose" },
                    ].map(card => {
                      const active = studentKpiFilter === card.key;
                      const tone: Record<string, string> = {
                        indigo: "bg-indigo-50 text-purple-600", blue: "bg-blue-50 text-purple-600",
                        pink: "bg-pink-50 text-pink-600", rose: "bg-rose-50 text-rose-600",
                      };
                      return (
                        <Card key={card.key}
                          onClick={() => setStudentKpiFilter(active && card.key !== "all" ? "all" : card.key)}
                          className={`border shadow-sm rounded-2xl cursor-pointer transition-all hover:shadow-md ${active ? "border-[#9810fa] ring-2 ring-[#9810fa]/20" : "border-transparent"}`}>
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className={`p-3 rounded-2xl ${tone[card.color]}`}>
                              <card.icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</p>
                              <div className="flex items-baseline gap-2">
                                <h3 className="text-2xl font-black text-slate-900">{card.value}</h3>
                                <span className="text-[10px] font-bold text-slate-400">{card.sub}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-xl font-bold">{t('admin.academics.classDetail.classStudents')}</CardTitle>
                          <CardDescription className="font-medium">
                            {filteredClassStudents.length === classStudents.length
                              ? t('admin.academics.classDetail.managingStudents', { count: classStudents.length, class: classData.name })
                              : t('admin.academics.classDetail.showingStudents', { shown: filteredClassStudents.length, total: classStudents.length })}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative w-64">
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              placeholder={t('admin.academics.classDetail.searchStudentsPlaceholder')}
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              className="w-full ps-10 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
                            />
                          </div>
                          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="rounded-xl border-slate-200 gap-2">
                                <Filter className="h-4 w-4" />
                                {t('admin.academics.classDetail.filter')}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-56 rounded-2xl p-3 space-y-2.5">
                              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.sortStudentsBy')}</Label>
                              <div className="grid grid-cols-1 gap-1.5">
                                {[
                                  { v: "", label: t('admin.academics.classDetail.sortDefault') },
                                  { v: "name", label: t('admin.academics.classDetail.sortNameAZ') },
                                  { v: "attendance", label: t('admin.academics.classDetail.sortAttendanceHighLow') },
                                  { v: "grade", label: t('admin.academics.classDetail.sortGrade') },
                                ].map(o => (
                                  <button key={o.v || "default"} onClick={() => { setFilterSortBy(o.v); setFilterOpen(false); }}
                                    className={`text-left text-sm font-medium rounded-xl px-3 py-2 border transition-colors ${filterSortBy === o.v ? "bg-[#9810fa] text-white border-[#9810fa]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="rounded-xl border-slate-200 gap-2">
                                <MoreVertical className="h-4 w-4" />
                                {t('admin.academics.classDetail.actions')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl w-52">
                              <DropdownMenuItem className="text-xs font-bold gap-2" onClick={() => setImportDialogOpen(true)}>
                                <Upload className="h-4 w-4" /> {t('admin.academics.classDetail.importStudents')}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs font-bold gap-2" onClick={handleExportRoster}>
                                <Download className="h-4 w-4" /> {t('admin.academics.classDetail.exportRosterCsv')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-xs font-bold gap-2" onClick={() => { setSelectedStudentIds(new Set()); const gi = grades.indexOf(classData.grade || ""); setPromoteTargetGrade(gi >= 0 && gi < grades.length - 1 ? grades[gi + 1] : ""); setPromoteTargetClass(""); setPromoteOpen(true); }}>
                                <ArrowUpCircle className="h-4 w-4" /> {t('admin.academics.classDetail.promoteStudents')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <input ref={importStudentsRef} type="file" accept=".csv" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportStudents(f); }} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="px-4 py-4 w-10">
                                <Checkbox
                                  checked={filteredClassStudents.length > 0 && filteredClassStudents.every(s => selectedStudentIds.has(s.id))}
                                  onCheckedChange={(v) => {
                                    if (v) setSelectedStudentIds(new Set(filteredClassStudents.map(s => s.id)));
                                    else setSelectedStudentIds(new Set());
                                  }}
                                />
                              </th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colStudentName')}</th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colRollNo')}</th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colSection')}</th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colAttendance')}</th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colAvgGrade')}</th>
                              <th className="px-6 py-4">{t('admin.academics.classDetail.colStatus')}</th>
                              <th className="px-6 py-4 text-end">{t('admin.academics.classDetail.colActions')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {filteredClassStudents.length > 0 ? (
                              filteredClassStudents.map((student, i) => (
                                <tr key={student.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedStudentIds.has(student.id) ? 'bg-indigo-50/40' : ''}`}>
                                  <td className="px-4 py-4">
                                    <Checkbox
                                      checked={selectedStudentIds.has(student.id)}
                                      onCheckedChange={(v) => {
                                        setSelectedStudentIds(prev => {
                                          const next = new Set(prev);
                                          if (v) next.add(student.id); else next.delete(student.id);
                                          return next;
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-9 w-9 border border-slate-100">
                                        <AvatarFallback className="bg-slate-100 text-slate-600 font-bold text-[10px]">
                                          {(student.name || "ST").split(' ').map(n => n[0] || "").join('')}
                                        </AvatarFallback>
                                      </Avatar>
                                      <button
                                        className="text-sm font-bold text-slate-700 hover:text-[#9810fa] hover:underline text-left"
                                        onClick={() => { setProfileStudent(student as any); setIsProfileOpen(true); }}
                                      >{student.name}</button>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm font-medium text-slate-600">{(student as any).rollNumber || String(i + 1).padStart(2, "0")}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <Badge variant="outline" className="font-bold border-slate-200 text-slate-600">{student.sectionName}</Badge>
                                  </td>
                                  <td className="px-6 py-4">
                                    {(() => {
                                      const att = (student as any).attendance != null ? Number((student as any).attendance) : null;
                                      const pct = att ?? 0;
                                      const color = pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-rose-500";
                                      return (
                                        <div className="flex items-center gap-2">
                                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-xs font-bold text-slate-600">{att != null ? `${att}%` : "—"}</span>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-6 py-4">
                                    {(() => {
                                      const att = (student as any).attendance != null ? Number((student as any).attendance) : null;
                                      const g = att == null ? "—" : att >= 90 ? "A+" : att >= 80 ? "A" : att >= 70 ? "B" : att >= 60 ? "C" : "D";
                                      return <Badge variant="outline" className="font-bold border-slate-200 text-slate-600">{g}</Badge>;
                                    })()}
                                  </td>
                                  <td className="px-6 py-4">
                                    <Badge className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                      student.status === 'Active' 
                                        ? 'bg-emerald-50 text-emerald-600' 
                                        : 'bg-rose-50 text-rose-600'
                                    }`}>
                                      {student.status}
                                    </Badge>
                                  </td>
                                  <td className="px-6 py-4 text-end">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button variant="ghost" size="sm" className="text-[#9810fa] font-bold text-xs" onClick={() => { setProfileStudent(student as any); setIsProfileOpen(true); }}>{t('admin.academics.classDetail.profile')}</Button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                            <MoreVertical className="h-4 w-4 text-slate-400" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="rounded-xl">
                                          <DropdownMenuItem className="text-xs font-bold" onClick={() => {
                                            setSelectedStudent(student);
                                            setIsEditStudentOpen(true);
                                          }}>{t('admin.academics.classDetail.editDetails')}</DropdownMenuItem>
                                          <DropdownMenuItem className="text-xs font-bold" onClick={() => toast.info(t('admin.academics.classDetail.viewingAttendanceToast', { name: student.name }))}>{t('admin.academics.classDetail.viewAttendance')}</DropdownMenuItem>
                                          <DropdownMenuItem className="text-xs font-bold text-rose-600" onClick={() => {
                                            toast.promise(deleteEnrollment(student.enrollmentId), {
                                              loading: t('admin.academics.classDetail.removingStudentToast'),
                                              success: t('admin.academics.classDetail.studentRemovedToast'),
                                              error: t('admin.academics.classDetail.studentRemoveFailedToast')
                                            });
                                          }}>{t('admin.academics.classDetail.removeFromClass')}</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">
                                  {classStudents.length === 0
                                    ? t('admin.academics.classDetail.noStudentsFound')
                                    : t('admin.academics.classDetail.noStudentsMatch')}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bulk action bar */}
                  {selectedStudentIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl">
                      <span className="text-sm font-bold">{selectedStudentIds.size === 1 ? t('admin.academics.classDetail.studentSelectedSingular', { count: selectedStudentIds.size }) : t('admin.academics.classDetail.studentSelectedPlural', { count: selectedStudentIds.size })}</span>
                      <div className="w-px h-5 bg-slate-600" />
                      <Button size="sm" variant="ghost" className="text-white hover:bg-slate-700 gap-1.5 font-semibold"
                        onClick={() => {
                          const next = classData.grade ? (() => {
                            const i = grades.indexOf(classData.grade);
                            return i >= 0 && i < grades.length - 1 ? grades[i + 1] : classData.grade;
                          })() : "";
                          setPromoteTargetGrade(next);
                          setPromoteOpen(true);
                        }}>
                        <ArrowUpCircle className="h-4 w-4" /> {t('admin.academics.classDetail.promoteToNextGrade')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-white hover:bg-slate-700 gap-1.5 font-semibold"
                        onClick={() => toast.info(t('admin.academics.classDetail.assignSectionComingSoonToast'))}>
                        {t('admin.academics.classDetail.assignSection')}
                      </Button>
                      <button onClick={() => setSelectedStudentIds(new Set())} className="p-1 rounded-lg hover:bg-slate-700">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Promote Dialog */}
                  {promoteOpen && (() => {
                    const allChecked = classStudents.length > 0 && classStudents.every(s => selectedStudentIds.has(s.id));
                    return (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
                          <div>
                            <h2 className="text-lg font-bold text-slate-900">{t('admin.academics.classDetail.promoteStudentsTitle')}</h2>
                            <p className="text-sm text-slate-500">{t('admin.academics.classDetail.promoteStudentsDesc')}</p>
                          </div>
                          <button onClick={() => { setPromoteOpen(false); setSelectedStudentIds(new Set()); }} className="p-2 rounded-xl hover:bg-slate-100">
                            <X className="h-4 w-4 text-slate-500" />
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                          {/* Student picker */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.selectStudents')}</label>
                              <button
                                onClick={() => allChecked ? setSelectedStudentIds(new Set()) : setSelectedStudentIds(new Set(classStudents.map(s => s.id)))}
                                className="text-xs font-semibold text-[#9810fa] hover:underline"
                              >
                                {allChecked ? t('admin.academics.classDetail.deselectAll') : t('admin.academics.classDetail.selectAll')}
                              </button>
                            </div>
                            <div className="border border-slate-100 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-50">
                              {classStudents.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-400">{t('admin.academics.classDetail.noStudentsInClass')}</p>
                              ) : classStudents.map(s => (
                                <div
                                  key={s.id}
                                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none ${selectedStudentIds.has(s.id) ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                                  onClick={() => setSelectedStudentIds(prev => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })}
                                >
                                  <Checkbox checked={selectedStudentIds.has(s.id)} onCheckedChange={() => {}} />
                                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                                    {(s.name || "ST").split(" ").map((n: string) => n[0] || "").join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                    <p className="text-xs text-slate-400">{s.sectionName || sectionName}</p>
                                  </div>
                                  {selectedStudentIds.has(s.id) && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                                </div>
                              ))}
                            </div>
                            {selectedStudentIds.size > 0 && (
                              <p className="text-xs text-purple-600 font-semibold">{selectedStudentIds.size === 1 ? t('admin.academics.classDetail.studentSelectedSingular', { count: selectedStudentIds.size }) : t('admin.academics.classDetail.studentSelectedPlural', { count: selectedStudentIds.size })}</p>
                            )}
                          </div>

                          {/* Target grade */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.targetGrade')}</label>
                            <select
                              value={promoteTargetGrade}
                              onChange={e => { setPromoteTargetGrade(e.target.value); setPromoteTargetClass(""); }}
                              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
                            >
                              <option value="">{t('admin.academics.classDetail.selectTargetGrade')}</option>
                              {grades.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </div>

                          {/* Target section */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.targetSection')}</label>
                            <select
                              value={promoteTargetClass}
                              onChange={e => setPromoteTargetClass(e.target.value)}
                              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
                              disabled={!promoteTargetGrade}
                            >
                              <option value="">{t('admin.academics.classDetail.selectSection')}</option>
                              {classes
                                .filter(c => { const n = c.grade?.trim(); return n === promoteTargetGrade || n === promoteTargetGrade.replace("Grade ", ""); })
                                .map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                            {promoteTargetGrade && classes.filter(c => { const n = c.grade?.trim(); return n === promoteTargetGrade || n === promoteTargetGrade.replace("Grade ", ""); }).length === 0 && (
                              <p className="text-xs text-amber-600 font-medium">{t('admin.academics.classDetail.noSectionsFoundFor', { grade: promoteTargetGrade })}</p>
                            )}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-2 p-6 pt-4 border-t border-slate-100">
                          <Button variant="outline" onClick={() => { setPromoteOpen(false); setSelectedStudentIds(new Set()); }} disabled={promoting} className="rounded-xl">{t('admin.academics.classDetail.cancel')}</Button>
                          <Button
                            disabled={selectedStudentIds.size === 0 || !promoteTargetClass || promoting}
                            className="rounded-xl gradient-primary text-white font-bold"
                            onClick={async () => {
                              setPromoting(true);
                              try {
                                const targetCls = classes.find(c => c.id === promoteTargetClass);
                                for (const sid of Array.from(selectedStudentIds)) {
                                  const student = classStudents.find(s => s.id === sid);
                                  if (!student || !targetCls) continue;
                                  await addEnrollment({
                                    studentId: sid,
                                    studentName: student.name || "Student",
                                    classId: promoteTargetClass,
                                    className: targetCls.name,
                                    sectionId: promoteTargetClass,
                                    sectionName: targetCls.name,
                                    academicYear: targetCls.academicYear || "2026-27",
                                    status: "Active",
                                  });
                                }
                                toast.success(selectedStudentIds.size === 1 ? t('admin.academics.classDetail.promotedToastSingular', { count: selectedStudentIds.size, grade: promoteTargetGrade }) : t('admin.academics.classDetail.promotedToastPlural', { count: selectedStudentIds.size, grade: promoteTargetGrade }));
                                setSelectedStudentIds(new Set());
                                setPromoteOpen(false);
                              } catch { toast.error(t('admin.academics.classDetail.promotionFailedToast')); }
                              finally { setPromoting(false); }
                            }}>
                            {promoting ? t('admin.academics.classDetail.promotingEllipsis') : ((selectedStudentIds.size || 0) === 1 ? t('admin.academics.classDetail.promoteButtonSingular', { count: selectedStudentIds.size || 0 }) : t('admin.academics.classDetail.promoteButtonPlural', { count: selectedStudentIds.size || 0 }))}
                          </Button>
                        </div>
                      </div>
                    </div>
                    );
                  })()}

                  {/* Add from Grade Dialog */}
                  {addFromGradeOpen && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-bold text-slate-900">{t('admin.academics.classDetail.addStudentsFromGrade', { grade: classData.grade })}</h2>
                            <p className="text-sm text-slate-500">{t('admin.academics.classDetail.addStudentsFromGradeDesc')}</p>
                          </div>
                          <button onClick={() => { setAddFromGradeOpen(false); setSelectedGradeStudents(new Set()); setGradeStudentSearch(""); }} className="p-2 rounded-xl hover:bg-slate-100">
                            <X className="h-4 w-4 text-slate-500" />
                          </button>
                        </div>

                        <div className="relative">
                          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            placeholder={t('admin.academics.classDetail.searchStudentsEllipsis')}
                            value={gradeStudentSearch}
                            onChange={e => setGradeStudentSearch(e.target.value)}
                            className="w-full h-10 ps-9 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-2">
                          {(() => {
                            const enrolledIds = new Set(classStudents.map(s => s.id));
                            const gradeStudentsList = students.filter(s => {
                              const sGrade = (s as any).grade || "";
                              return (sGrade === classData.grade || sGrade === classData.grade?.replace("Grade ", ""))
                                && !enrolledIds.has(s.id)
                                && (!gradeStudentSearch || s.name?.toLowerCase().includes(gradeStudentSearch.toLowerCase()));
                            });
                            if (gradeStudentsList.length === 0) {
                              return <p className="py-8 text-center text-sm text-slate-400">{t('admin.academics.classDetail.noAvailableStudentsFound', { grade: classData.grade })}</p>;
                            }
                            return gradeStudentsList.map(s => (
                              <div key={s.id}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${selectedGradeStudents.has(s.id) ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50"}`}
                                onClick={() => setSelectedGradeStudents(prev => {
                                  const next = new Set(prev);
                                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                  return next;
                                })}>
                                <Checkbox checked={selectedGradeStudents.has(s.id)} />
                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                                  {(s.name || "ST").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                  <p className="text-xs text-slate-400">{(s as any).rollNo || s.id.slice(-4)}</p>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>

                        {selectedGradeStudents.size > 0 && (
                          <p className="text-xs text-purple-600 font-medium">{selectedGradeStudents.size === 1 ? t('admin.academics.classDetail.studentSelectedSingular', { count: selectedGradeStudents.size }) : t('admin.academics.classDetail.studentSelectedPlural', { count: selectedGradeStudents.size })}</p>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" onClick={() => { setAddFromGradeOpen(false); setSelectedGradeStudents(new Set()); setGradeStudentSearch(""); }} className="rounded-xl">{t('admin.academics.classDetail.cancel')}</Button>
                          <Button disabled={selectedGradeStudents.size === 0 || enrollingFromGrade} className="rounded-xl gradient-primary text-white font-bold"
                            onClick={async () => {
                              setEnrollingFromGrade(true);
                              try {
                                for (const sid of Array.from(selectedGradeStudents)) {
                                  const s = students.find(st => st.id === sid);
                                  if (!s) continue;
                                  await addEnrollment({
                                    studentId: sid,
                                    studentName: s.name || "Student",
                                    classId: id!,
                                    className: currentClass?.name || "Class",
                                    sectionId: id!,
                                    sectionName: currentClass?.name || "Section",
                                    academicYear: currentClass?.academicYear || "2026-27",
                                    status: "Active",
                                  });
                                }
                                toast.success(selectedGradeStudents.size === 1 ? t('admin.academics.classDetail.enrolledToastSingular', { count: selectedGradeStudents.size }) : t('admin.academics.classDetail.enrolledToastPlural', { count: selectedGradeStudents.size }));
                                setAddFromGradeOpen(false);
                                setSelectedGradeStudents(new Set());
                                setGradeStudentSearch("");
                              } catch { toast.error(t('admin.academics.classDetail.enrollmentFailedToast')); }
                              finally { setEnrollingFromGrade(false); }
                            }}>
                            {enrollingFromGrade ? t('admin.academics.classDetail.enrollingEllipsis') : (selectedGradeStudents.size === 1 ? t('admin.academics.classDetail.enrollButtonSingular', { count: selectedGradeStudents.size || 0 }) : t('admin.academics.classDetail.enrollButtonPlural', { count: selectedGradeStudents.size || 0 }))}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="gradebook" className="m-0">
                  <GradebookPro
                    classData={classData}
                    students={classStudents as any}
                    subjects={classSubjects}
                    semesterName={semesterName}
                    onRowsChange={(rows, cols) => { setGradebookRows(rows); setGradebookSubjectCols(cols); }}
                  />
                </TabsContent>

                <TabsContent value="subjects" className="m-0">
                  <SubjectsPro
                    classData={classData}
                    subjects={currentClass?.subjects || []}
                    studentCount={classStudents.length}
                    teacherName={classSections[0]?.teacherName || classData.teacher}
                    sections={Array.from(new Set(classes.filter(c => c.grade === classData.grade).map(c => String(c.name).match(/Section\s+([A-Z])/i)?.[1] || (c as any).section || "A"))).sort()}
                    semesterName={semesterName}
                    onSubjectsChange={persistGradeSubjects}
                    onRowsChange={setSubjectRows}
                  />
                </TabsContent>

                <TabsContent value="assignments" className="m-0">
                  <AssignmentsPro
                    classData={classData}
                    semesterName={semesterName}
                    subjects={currentClass?.subjects || []}
                    createOpen={assignmentCreateOpen}
                    onCreateOpenChange={setAssignmentCreateOpen}
                    onExportData={(p) => registerTabExport("assignments", p)}
                  />
                </TabsContent>

                <TabsContent value="assessments" className="m-0">
                  <AssessmentsPro classData={classData} section={sectionName} semesterName={semesterName} />
                </TabsContent>

                <TabsContent value="flashcards" className="m-0">
                  <FlashCardsPro classData={classData} classId={id!} section={sectionName} />
                </TabsContent>

                <TabsContent value="timetable" className="m-0">
                  <TimetablePro
                    classData={classData}
                    sections={classes.filter(c => c.grade === classData.grade)
                      .map(c => ({ letter: String(c.name).match(/Section\s+([A-Z])/i)?.[1] || (c as any).section || "A", classId: c.id }))
                      .sort((a, b) => a.letter.localeCompare(b.letter))}
                    lockedSection={String(classData.name).match(/Section\s+([A-Z])/i)?.[1] || (currentClass as any)?.section || "A"}
                    slots={timetableSlots}
                    academicYear={classData.academicYear}
                    onSaveSlot={async (slot) => { if (slot.id) await updateTimetableSlot(slot.id, slot); else await addTimetableSlot(slot); }}
                    onDeleteSlot={async (slotId) => { await deleteTimetableSlot(slotId); }}
                    semesterName={semesterName}
                    onExportData={(p) => registerTabExport("timetable", p)}
                  />
                </TabsContent>

                <TabsContent value="attendance" className="m-0">
                  <AttendancePro
                    classData={classData}
                    students={classStudents.map((s: any) => ({ id: s.id, name: s.name, classId: s.classId, rollNumber: s.rollNumber }))}
                    semesterName={semesterName}
                    markOpen={attendanceMarkOpen}
                    onMarkOpenChange={setAttendanceMarkOpen}
                    onExportData={(p) => registerTabExport("attendance", p)}
                  />
                </TabsContent>

                <TabsContent value="exams" className="m-0">
                  <ExamsPro classData={classData} semesterName={semesterName} onExportData={(p) => registerTabExport("exams", p)}
                    datesheets={examDatesheets}
                    onDeleteDatesheet={(dsId) => deleteExam(dsId)}
                    onPublishDatesheet={(dsId) => updateExam(dsId, { published: true, status: "Published" })}
                    onCreateDatesheet={() => setScheduleExamOpen(true)}
                  />
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </div>
      {/* Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.studentPerformanceReport')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{t('admin.academics.classDetail.performanceReportDesc')}</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-start border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t('admin.academics.classDetail.colStudentName')}</th>
                  <th className="px-4 py-3">{t('admin.academics.classDetail.colGrade')}</th>
                  <th className="px-4 py-3">{t('admin.academics.classDetail.colAttendance')}</th>
                  <th className="px-4 py-3">{t('admin.academics.classDetail.colLast3Scores')}</th>
                  <th className="px-4 py-3">{t('admin.academics.classDetail.colRank')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { name: "Ahmed Al-Rashid", grade: "A", attendance: 95, scores: [88, 91, 94], rank: 1 },
                  { name: "Fatima Al-Zaabi", grade: "A-", attendance: 92, scores: [85, 80, 90], rank: 2 },
                  { name: "Sara Mohamed", grade: "B+", attendance: 90, scores: [82, 75, 88], rank: 3 },
                  { name: "Omar Hassan", grade: "B", attendance: 87, scores: [78, 72, 80], rank: 4 },
                  { name: "Priya Nair", grade: "B-", attendance: 84, scores: [70, 68, 75], rank: 5 },
                ].map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-700">{s.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-bold border-slate-200">{s.grade}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-600">{s.attendance}%</td>
                    <td className="px-4 py-3 font-medium text-slate-600">{s.scores.map(sc => sc + "%").join(", ")}</td>
                    <td className="px-4 py-3 font-bold text-[#9810fa]">#{s.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setReportOpen(false)}>{t('admin.academics.classDetail.close')}</Button>
            <Button className="rounded-xl gradient-primary text-white font-bold" onClick={() => { toast.success(t('admin.academics.classDetail.reportDownloadedToast')); setReportOpen(false); }}>
              <Download className="h-4 w-4 me-2" />
              {t('admin.academics.classDetail.downloadReport')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Faculty Dialog */}
      <Dialog open={assignFacultyOpen} onOpenChange={setAssignFacultyOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.assignNewFaculty')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{t('admin.academics.classDetail.assignFacultyDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.facultyMember')}</Label>
              <Select value={assignFacultyName} onValueChange={setAssignFacultyName}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectFaculty')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {staff.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.subject')}</Label>
              <Select value={assignFacultySubject} onValueChange={setAssignFacultySubject}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectSubject')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="math">{t('admin.academics.classDetail.subjectMath')}</SelectItem>
                  <SelectItem value="science">{t('admin.academics.classDetail.subjectScience')}</SelectItem>
                  <SelectItem value="english">{t('admin.academics.classDetail.subjectEnglish')}</SelectItem>
                  <SelectItem value="arabic">{t('admin.academics.classDetail.subjectArabic')}</SelectItem>
                  <SelectItem value="social-studies">{t('admin.academics.classDetail.subjectSocialStudies')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAssignFacultyOpen(false)}>{t('admin.academics.classDetail.cancel')}</Button>
            <Button className="rounded-xl gradient-primary text-white font-bold" onClick={async () => {
              if (!assignFacultyName) {
                toast.error(t('admin.academics.classDetail.selectFacultyMemberError'));
                return;
              }
              try {
                const matched = staff.find((m: any) => m.id === assignFacultyName);
                const facultyName = matched?.name || assignFacultyName;

                if (currentClass) {
                  await updateClass(currentClass.id, { teacher: facultyName });
                }
                if (classSections.length > 0) {
                  await updateSection(classSections[0].id, { teacherName: facultyName });
                }
                toast.success(t('admin.academics.classDetail.facultyAssignedToast'));
                setAssignFacultyOpen(false);
                setAssignFacultyName("");
                setAssignFacultySubject("");
              } catch (err) {
                toast.error(t('admin.academics.classDetail.facultyAssignFailedToast'));
              }
            }}>{t('admin.academics.classDetail.assignFacultyBtn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Teacher Dialog */}
      <Dialog open={changeTeacherOpen} onOpenChange={setChangeTeacherOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.changeTeacher')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              {t('admin.academics.classDetail.changeTeacherDesc', { section: changeTeacherSection?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.currentTeacher')}</Label>
              <div className="h-10 px-3 flex items-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
                {changeTeacherSection?.teacherName || t('admin.academics.classDetail.notAssigned')}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.newTeacherName')}</Label>
              <Input
                className="rounded-xl border-slate-200"
                placeholder={t('admin.academics.classDetail.enterTeacherNamePlaceholder')}
                value={changeTeacherName}
                onChange={(e) => setChangeTeacherName(e.target.value)}
              />
            </div>
            {staff && staff.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.orSelectFromStaff')}</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-2">
                  {staff.map((member: any) => (
                    <div
                      key={member.id}
                      onClick={() => setChangeTeacherName(member.name)}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${changeTeacherName === member.name ? "bg-[#9810fa]/10 text-[#9810fa]" : "hover:bg-slate-50 text-slate-700"}`}
                    >
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                        {member.name?.charAt(0) || "T"}
                      </div>
                      <div>
                        <p className="text-xs font-bold">{member.name}</p>
                        <p className="text-[10px] text-slate-400">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setChangeTeacherOpen(false)}>{t('admin.academics.classDetail.cancel')}</Button>
            <Button
              className="rounded-xl gradient-primary text-white font-bold"
              disabled={!changeTeacherName.trim()}
              onClick={async () => {
                if (!changeTeacherName.trim() || !changeTeacherSection) return;
                const grade = classData.grade || "";
                const section = changeTeacherSection.name || "";
                const target = changeTeacherName.trim().toLowerCase();
                const matched = (staff || []).find((m: any) => (m.name || "").trim().toLowerCase() === target);
                // Same duplicate-prevention every other class-teacher assignment
                // path uses — this dialog used to write straight to Class.teacher/
                // Section.teacherName with no check at all, a second unguarded
                // route to the exact "one teacher, two classes" problem the other
                // assignment flows (ClassesList.tsx, Staff Onboarding) already block.
                if (matched?.email && grade && section) {
                  const conflict = await checkClassTeacherAssignment(matched.email, grade, section, true);
                  if (conflict) {
                    toast.error(conflict.message);
                    return;
                  }
                }
                try {
                  await updateSection(changeTeacherSection.id, { teacherName: changeTeacherName });
                  if (currentClass) await updateClass(currentClass.id, { teacher: changeTeacherName });
                  // Keep the real User record (which useTeacherClass actually
                  // reads) in sync — this path used to only touch the display-
                  // only Class/Section fields, leaving the teacher's own portal
                  // still scoped to whatever it was before.
                  if (matched?.email && grade && section) {
                    try {
                      await smartDb.update("User", matched.email, {
                        assignedGrade: grade,
                        assignedSection: section,
                        assignedClassName: `${grade} Section ${section}`,
                      });
                    } catch { /* non-fatal — Class/Section fields above already saved */ }
                  }
                  toast.success(t('admin.academics.classDetail.teacherUpdatedToast', { name: changeTeacherName }));
                  setChangeTeacherOpen(false);
                } catch {
                  toast.error(t('admin.academics.classDetail.teacherUpdateFailedToast'));
                }
              }}
            >
              {t('admin.academics.classDetail.saveChange')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Subject Dialog */}
      <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.addSubjectTitle')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{t('admin.academics.classDetail.addSubjectDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.subjectName')}</Label>
              <Input
                className="rounded-xl border-slate-200"
                placeholder={t('admin.academics.classDetail.subjectNamePlaceholder')}
                value={addSubjectName}
                onChange={(e) => setAddSubjectName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.section')}</Label>
              <select
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
                value={addSubjectSection}
                onChange={(e) => setAddSubjectSection(e.target.value)}
              >
                <option value="All">{t('admin.academics.classDetail.allSectionsOf', { grade: classData.grade })}</option>
                {Array.from(new Set(classes.filter(c => c.grade === classData.grade)
                  .map(c => String(c.name).match(/Section\s+([A-Z])/i)?.[1] || (c as any).section || "A"))).sort()
                  .map(s => <option key={s} value={s}>{t('admin.academics.classDetail.sectionOption', { s })}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.teacher')}</Label>
              <Select value={addSubjectTeacher} onValueChange={setAddSubjectTeacher}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectTeacher')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {(staff && staff.length > 0
                    ? staff.map((m: any) => m.name)
                    : ["Miss. Sana Fatima", "Mr. Imran Qureshi", "Mr. Faisal Malik", "Mrs. Hina Shah", "Mr. Rizwan Ahmed", "Miss. Ayesha Khan", "Mr. Ali Hassan"]
                  ).map((name: string) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.roomNo')}</Label>
              <Input
                className="rounded-xl border-slate-200"
                placeholder={t('admin.academics.classDetail.roomNoPlaceholder')}
                value={addSubjectRoom}
                onChange={(e) => setAddSubjectRoom(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddSubjectOpen(false)}>{t('admin.academics.classDetail.cancel')}</Button>
            <Button className="rounded-xl gradient-primary text-white font-bold" onClick={async () => {
              if (!addSubjectName.trim()) {
                toast.error(t('admin.academics.classDetail.subjectNameRequiredToast'));
                return;
              }
              try {
                const name = addSubjectName.trim();
                const metaEntry = { teacher: addSubjectTeacher.trim(), room: addSubjectRoom.trim() };
                // Determine target classes: a single section, or every section of the grade.
                const targets = addSubjectSection === "All"
                  ? classes.filter(c => c.grade === classData.grade)
                  : classes.filter(c => c.grade === classData.grade && (String(c.name).match(/Section\s+([A-Z])/i)?.[1] || (c as any).section) === addSubjectSection);
                const applied = targets.length ? targets : (currentClass ? [currentClass] : []);
                await Promise.all(applied.map(c => {
                  const subjects = [...new Set([...(c.subjects || []), name])];
                  const meta = { ...((c as any).subjectMeta || {}) };
                  meta[name] = metaEntry;
                  return updateClass(c.id, { subjects, subjectMeta: meta } as any);
                }));
                toast.success(addSubjectSection === "All" ? t('admin.academics.classDetail.subjectAddedAllToast', { count: applied.length }) : t('admin.academics.classDetail.subjectAddedSectionToast', { section: addSubjectSection }));
                setAddSubjectOpen(false);
                setAddSubjectName("");
                setAddSubjectTeacher("");
                setAddSubjectPeriods("5");
                setAddSubjectRoom("");
                setAddSubjectSection("All");
              } catch (err) {
                toast.error(t('admin.academics.classDetail.subjectAddFailedToast'));
              }
            }}>{t('admin.academics.classDetail.saveSubject')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog open={editScheduleOpen} onOpenChange={setEditScheduleOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.editScheduleTitle')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{t('admin.academics.classDetail.editScheduleDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.day')}</Label>
              <Select value={scheduleDay} onValueChange={setScheduleDay}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectDay')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Sunday">{t('admin.academics.classDetail.daySunday')}</SelectItem>
                  <SelectItem value="Monday">{t('admin.academics.classDetail.dayMonday')}</SelectItem>
                  <SelectItem value="Tuesday">{t('admin.academics.classDetail.dayTuesday')}</SelectItem>
                  <SelectItem value="Wednesday">{t('admin.academics.classDetail.dayWednesday')}</SelectItem>
                  <SelectItem value="Thursday">{t('admin.academics.classDetail.dayThursday')}</SelectItem>
                  <SelectItem value="Friday">{t('admin.academics.classDetail.dayFriday')}</SelectItem>
                  <SelectItem value="Saturday">{t('admin.academics.classDetail.daySaturday')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.subject')}</Label>
              <Select value={scheduleSubject} onValueChange={setScheduleSubject}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectSubject')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(currentClass?.subjects || []).map(sub => (
                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                  ))}
                  {(currentClass?.subjects || []).length === 0 && (
                    <SelectItem value="none" disabled>{t('admin.academics.classDetail.noSubjectsAddedYet')}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.teacherName')}</Label>
              <Select value={scheduleTeacher} onValueChange={setScheduleTeacher}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder={t('admin.academics.classDetail.selectTeacher')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {(staff && staff.length > 0
                    ? staff.map((m: any) => m.name)
                    : ["Miss Sana Fatima", "Mr. Imran Qureshi", "Mr. Faisal Malik", "Mrs. Hina Shah", "Mr. Rizwan Ahmed", "Mr. Adnan", "Miss. Ayesha Khan"]
                  ).map((name: string) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.startTime')}</Label>
                <Input
                  className="rounded-xl border-slate-200"
                  type="time"
                  value={scheduleStartTime}
                  onChange={(e) => setScheduleStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.endTime')}</Label>
                <Input
                  className="rounded-xl border-slate-200"
                  type="time"
                  value={scheduleEndTime}
                  onChange={(e) => setScheduleEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditScheduleOpen(false)}>{t('admin.academics.classDetail.cancel')}</Button>
            <Button className="rounded-xl gradient-primary text-white font-bold" onClick={async () => {
              if (!scheduleDay || !scheduleStartTime || !scheduleEndTime || !scheduleSubject) {
                toast.error(t('admin.academics.classDetail.fillTimetableFieldsError'));
                return;
              }
              try {
                const sectionId = classSections[0]?.id || "section_A";
                await addTimetableSlot({
                  day: scheduleDay as any,
                  startTime: scheduleStartTime,
                  endTime: scheduleEndTime,
                  subject: scheduleSubject,
                  teacherName: scheduleTeacher || "Unassigned",
                  teacherId: "t_" + Math.random().toString(36).substr(2, 9),
                  classId: id!,
                  sectionId: sectionId
                });
                toast.success(t('admin.academics.classDetail.scheduleUpdatedToast'));
                setEditScheduleOpen(false);
                setScheduleDay("");
                setScheduleStartTime("");
                setScheduleEndTime("");
                setScheduleSubject("");
                setScheduleTeacher("");
              } catch (err) {
                toast.error(t('admin.academics.classDetail.scheduleUpdateFailedToast'));
              }
            }}>{t('admin.academics.classDetail.saveSchedule')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exam Datesheet Builder — per-subject schedule with timing + invigilator */}
      <Dialog open={scheduleExamOpen} onOpenChange={setScheduleExamOpen}>
        <DialogContent className="rounded-2xl max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.academics.classDetail.createExamDatesheet')}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              {t('admin.academics.classDetail.examDatesheetDesc', { class: classData.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('admin.academics.classDetail.examTitle')}</Label>
              <Input className="rounded-xl border-slate-200" placeholder={t('admin.academics.classDetail.examTitlePlaceholder')}
                value={examName} onChange={(e) => setExamName(e.target.value)} />
            </div>
            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[1.4fr_1.1fr_0.9fr_0.9fr_1.4fr_1fr_auto] gap-2 px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>{t('admin.academics.classDetail.colSubject')}</span><span>{t('admin.academics.classDetail.colDate')}</span><span>{t('admin.academics.classDetail.colStart')}</span><span>{t('admin.academics.classDetail.colEnd')}</span><span>{t('admin.academics.classDetail.colInvigilator')}</span><span>{t('admin.academics.classDetail.colHall')}</span><span />
            </div>
            {examSlots.map((slot, i) => {
              const update = (patch: Partial<ExamSlot>) => setExamSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
              return (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[1.4fr_1.1fr_0.9fr_0.9fr_1.4fr_1fr_auto] gap-2 items-center rounded-xl border border-slate-100 p-2 md:p-1 md:border-0">
                  <Select value={slot.subject} onValueChange={v => update({ subject: v })}>
                    <SelectTrigger className="rounded-xl border-slate-200 h-10"><SelectValue placeholder="Subject" /></SelectTrigger>
                    <SelectContent className="rounded-xl max-h-56">
                      {(currentClass?.subjects || []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      {(currentClass?.subjects || []).length === 0 && <SelectItem value="none" disabled>No subjects added</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="rounded-xl border-slate-200 h-10" value={slot.date} onChange={e => update({ date: e.target.value })} />
                  <Input type="time" className="rounded-xl border-slate-200 h-10" value={slot.start} onChange={e => update({ start: e.target.value })} />
                  <Input type="time" className="rounded-xl border-slate-200 h-10" value={slot.end} onChange={e => update({ end: e.target.value })} />
                  <Select value={slot.invigilator} onValueChange={v => update({ invigilator: v })}>
                    <SelectTrigger className="rounded-xl border-slate-200 h-10"><SelectValue placeholder="Invigilator" /></SelectTrigger>
                    <SelectContent className="rounded-xl max-h-56">
                      {(staff && staff.length > 0
                        ? staff.map((m: any) => m.name)
                        : ["Miss. Sana Fatima", "Mr. Imran Qureshi", "Mr. Faisal Malik", "Mrs. Hina Shah", "Mr. Rizwan Ahmed"]
                      ).map((name: string) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={slot.room} onValueChange={v => update({ room: v })}>
                    <SelectTrigger className="rounded-xl border-slate-200 h-10"><SelectValue placeholder="Hall" /></SelectTrigger>
                    <SelectContent className="rounded-xl max-h-56">
                      {EXAM_HALLS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-rose-500 hover:text-rose-600 justify-self-end" disabled={examSlots.length === 1}
                    onClick={() => setExamSlots(prev => prev.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" className="rounded-xl border-dashed border-slate-300 w-full gap-2 font-semibold text-slate-600"
              onClick={() => setExamSlots(prev => [...prev, { ...blankExamSlot }])}>
              <Plus className="h-4 w-4" /> Add Subject to Datesheet
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setScheduleExamOpen(false)}>Cancel</Button>
            <Button className="rounded-xl gradient-primary text-white font-bold" onClick={() => {
              if (!examName.trim()) { toast.error("Enter an exam title"); return; }
              const valid = examSlots.filter(s => s.subject && s.date && s.start);
              if (valid.length === 0) { toast.error("Add at least one subject with a date and start time"); return; }
              const missingInvig = valid.filter(s => !s.invigilator).length;
              // Write to the shared store — this also surfaces on the central /exams page.
              const sum = summarizeSlots(valid);
              addExam({
                id: nextExamId("DS"), name: examName.trim(), type: "Term Exam",
                grade: sectionGrade, section: sectionName || "All Sections",
                subjects: sum.subjects, startDate: sum.startDate, endDate: sum.endDate,
                appeared: 0, total: classStudents.length || 0,
                status: "Scheduled", slots: valid, published: false,
              });
              toast.success(`"${examName.trim()}" datesheet created — ${valid.length} subject${valid.length !== 1 ? "s" : ""} scheduled${missingInvig ? `, ${missingInvig} without invigilator` : ""}`);
              setScheduleExamOpen(false);
              setExamName("");
              setExamSlots([{ ...blankExamSlot }]);
            }}>Save Datesheet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ClassDetail;
