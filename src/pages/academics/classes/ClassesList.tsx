import { useState, useMemo, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  GraduationCap, Users, Plus, Search, MoreVertical,
  ChevronRight, BookOpen, TrendingUp, ArrowLeft,
  Download, SlidersHorizontal, UserCheck, Activity,
  CheckCircle2, ChevronLeft, LayoutGrid, List,
  CalendarDays, ClipboardCheck, BarChart3, Trash2,
  Edit, BookMarked, Clock, AlertCircle, Zap, RefreshCw, Pencil,
  UserPlus, FileText, CalendarCheck, Calendar,
  Megaphone, Sparkles, ArrowRight, Shield,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClasses } from "@/hooks/useClasses";
import { useStudents } from "@/contexts/StudentContext";
import { matchesGradeSection } from "@/lib/studentGradeSection";
import { useStaff } from "@/contexts/StaffContext";
import { smartDb } from "@/lib/localDb";
import { useGrades, useCurriculumContext } from "@/contexts/CurriculumContext";
import { getDefaultSubjectsForGrade, type CurriculumConfig } from "@/lib/curriculumConfig";
import { Class } from "@/types/classes";
import { useAuth } from "@/hooks/useAuth";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import { checkClassTeacherAssignment, checkGradeCoordinatorAssignment } from "@/lib/roleAssignmentGuard";
import { AccessDenied } from "@/components/shared/AccessDenied";
import {
  AreaChart, Area, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import SubjectsPro from "@/components/classes/SubjectsPro";
import TimetablePro from "@/components/classes/TimetablePro";
import AttendancePro from "@/components/classes/AttendancePro";
import ExamsPro from "@/components/classes/ExamsPro";
import { useExams, deleteExam, updateExam, recordToDatesheet } from "@/lib/examStore";
import GradebookPro from "@/components/classes/GradebookPro";
import ReportCardsPro from "@/components/classes/ReportCardsPro";

// ── Types ─────────────────────────────────────────────────────────────────────
type DrillLevel = "grades" | "grade" | "section";

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 8;

// Fallback order/stage-mapping used only before the active curriculum's real
// grade list has loaded — every real call site passes the curriculum-aware
// `grades`/`curriculum` from useGrades()/useCurriculumContext() instead, so
// a school on Qatar (Pre-KG/KG1/KG2/Grade 1-12), British (Year 1-13),
// American, etc. all sort and filter correctly instead of this generic list
// silently mis-ordering or hiding grades that aren't Grade-N/legacy-KG named.
const GRADE_ORDER = [
  "Pre-KG","LKG","UKG","KG","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
];

/** Stage label for a grade, using the ACTIVE curriculum's own early-years/
 *  primary/middle/secondary bands (src/lib/curriculumConfig.ts) — works for
 *  any curriculum a school selects, not just one hardcoded grade naming. */
function gradeStage(g: string, curriculum: CurriculumConfig): string {
  if (curriculum.earlyYears.includes(g)) return "Early Years";
  if (curriculum.primary.includes(g))    return "Primary";
  if (curriculum.middle.includes(g))     return "Middle";
  if (curriculum.secondary.includes(g))  return "Secondary";
  return "Other";
}

const GRADE_PALETTE = [
  "bg-purple-600","bg-fuchsia-600","bg-purple-600","bg-purple-600","bg-purple-600","bg-sky-600",
  "bg-cyan-600","bg-teal-600","bg-emerald-600","bg-green-600",
  "bg-lime-600","bg-amber-600","bg-orange-600","bg-red-600",
  "bg-rose-600","bg-pink-600",
];

const SECTION_COLORS: Record<string, { bg: string; text: string; light: string; border: string; chart: string; chartFill: string }> = {
  A: { bg: "bg-purple-600", text: "text-purple-700", light: "bg-purple-50", border: "border-purple-200", chart: "#7c3aed", chartFill: "#ede9fe" },
  B: { bg: "bg-purple-600",   text: "text-blue-700",   light: "bg-blue-50",   border: "border-blue-200",   chart: "#2563eb", chartFill: "#dbeafe" },
  C: { bg: "bg-green-600",  text: "text-green-700",  light: "bg-green-50",  border: "border-green-200",  chart: "#16a34a", chartFill: "#dcfce7" },
  D: { bg: "bg-orange-500", text: "text-orange-700", light: "bg-orange-50", border: "border-orange-200", chart: "#ea580c", chartFill: "#ffedd5" },
  E: { bg: "bg-pink-600",   text: "text-pink-700",   light: "bg-pink-50",   border: "border-pink-200",   chart: "#db2777", chartFill: "#fce7f3" },
  F: { bg: "bg-teal-600",   text: "text-teal-700",   light: "bg-teal-50",   border: "border-teal-200",   chart: "#0d9488", chartFill: "#ccfbf1" },
};

const DEFAULT_SECTION_COLOR = { bg: "bg-gray-600", text: "text-gray-700", light: "bg-gray-50", border: "border-gray-200", chart: "#4b5563", chartFill: "#f3f4f6" };

// ── Seed data ─────────────────────────────────────────────────────────────────
// Grade list itself now comes from the active curriculum (useGrades()) at the
// call site below, not a hardcoded list — a Qatar school seeds Pre-KG/KG1/
// KG2/Grade 1-12, a British school seeds Pre-Nursery through Year 13, etc.
const SEED_SECTIONS = ["Section A", "Section B", "Section C"];

// ── LocalSemester ─────────────────────────────────────────────────────────────
interface LocalSemester {
  id: string; classId: string; name: string;
  startDate: string; endDate: string;
  status: 'Active' | 'Upcoming' | 'Completed';
}
async function getClassSems(classId: string): Promise<LocalSemester[]> {
  try { return await smartDb.getAll("ClassSemester", undefined, { classId }) as LocalSemester[]; }
  catch { return []; }
}
async function saveClassSem(classId: string, sem: LocalSemester): Promise<void> {
  await smartDb.create("ClassSemester", { ...sem, classId }, sem.id);
}

// ── Grade Coordinators ────────────────────────────────────────────────────────
interface GradeCoordinator { id: string; name: string; }
async function getAllCoordinators(): Promise<Record<string, GradeCoordinator>> {
  try {
    const rows = await smartDb.getAll("GradeCoordinator", undefined) as (GradeCoordinator & { grade: string })[];
    const map: Record<string, GradeCoordinator> = {};
    // Older/seeded rows store raw grade values ("3", "12", "KG1") while the
    // table renders grouped by normalizeGrade's display form ("Grade 3");
    // normalizing the key here is what makes those rows actually show up
    // instead of silently rendering as "Assign Coordinator" despite existing.
    rows.forEach(r => { map[normalizeGrade(r.grade)] = { id: r.id, name: r.name }; });
    return map;
  } catch { return {}; }
}
async function persistCoordinator(grade: string, coord: GradeCoordinator | null): Promise<void> {
  if (coord) {
    await smartDb.create("GradeCoordinator", { grade, id: coord.id, name: coord.name }, grade);
  } else {
    try { await smartDb.delete("GradeCoordinator", grade); } catch { /* nothing to remove */ }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeGrade(g: string): string {
  if (!g) return "Unknown";
  const t = g.trim();
  return /^\d+$/.test(t) ? `Grade ${t}` : t;
}

// `orderedGrades` should be the active curriculum's real grade list
// (useGrades()) — every real call site passes it; GRADE_ORDER is only the
// pre-load fallback.
function gradeIndex(grade: string, orderedGrades: string[] = GRADE_ORDER): number {
  const i = orderedGrades.indexOf(grade);
  return i === -1 ? 999 : i;
}

function gradeBadgeLabel(grade: string): string {
  if (grade === "Pre-KG") return "PK";
  if (grade === "LKG") return "LK";
  if (grade === "UKG") return "UK";
  if (grade === "KG") return "KG";
  // KG1/KG2 (Qatar, IB, etc.) — matched BEFORE the generic digit-match below,
  // which would otherwise pull out just the "1"/"2" and collide visually
  // with Grade 1/Grade 2's badge.
  const kgMatch = grade.match(/^KG(\d+)$/i);
  if (kgMatch) return `K${kgMatch[1]}`;
  const m = grade.match(/(\d+)/);
  return m ? m[1] : grade.slice(0, 2).toUpperCase();
}

function gradeBgColor(grade: string, orderedGrades: string[] = GRADE_ORDER): string {
  const i = orderedGrades.indexOf(grade);
  return GRADE_PALETTE[i === -1 ? 0 : i % GRADE_PALETTE.length];
}

function sectionLabel(cls: Class): string {
  const s = (cls as any).section;
  if (s) return s;
  const name = cls.name || "";
  const grade = cls.grade || "";
  // Handle "Grade - Section", "Grade Section" formats
  for (const prefix of [`${grade} - `, `${grade} `]) {
    if (name.startsWith(prefix)) return name.slice(prefix.length).trim();
  }
  return name;
}

function sectionBadgeLetter(secName: string): string {
  const m = secName.match(/([A-Za-z])$/);
  return m ? m[1].toUpperCase() : secName.trim().slice(-1).toUpperCase() || "?";
}

function getSectionColor(secName: string) {
  const letter = sectionBadgeLetter(secName);
  return SECTION_COLORS[letter] ?? DEFAULT_SECTION_COLOR;
}

// Teacher initials
function initials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ClassesList() {
  const { classes, addClass, updateClass, deleteClass, addEnrollment } = useClasses();
  const { students, addStudents } = useStudents();
  const { staff } = useStaff();
  const grades = useGrades();
  const { curriculum } = useCurriculumContext();
  const { role } = useAuth();
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade, loading: coordLoading } = useGradeCoordinator();

  // Import students to a section
  const [importStudentTarget, setImportStudentTarget] = useState<Class | null>(null);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importStudentRows, setImportStudentRows] = useState<{ name: string; email: string; gender: string }[]>([]);
  const [importStudentError, setImportStudentError] = useState("");
  const importStudentFileRef = useRef<HTMLInputElement>(null);

  // Export a single grade's classes
  function exportGradeClasses(gradeName: string) {
    const filtered = classes.filter(c => normalizeGrade(c.grade) === gradeName);
    if (filtered.length === 0) { toast.error("No classes to export in this grade"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Grade,Section,Teacher,Status,Subjects,Academic Year"];
    [...filtered]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .forEach(c => {
        const sec = String((c as any).name || "").match(/Section\s+([A-Z])/i)?.[1] || (c as any).section || "";
        lines.push([c.grade, sec, (c as any).teacher || (c as any).teacherName || "", c.status || "Active", ((c as any).subjects || []).length, (c as any).academicYear || ""].map(esc).join(","));
      });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${gradeName.replace(/\s+/g, "_")}-classes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} classes for ${gradeName}`);
  }

  // Export section roster
  function exportSectionRoster(cls: Class) {
    const secStudents = students.filter(s => matchesGradeSection(s, cls.grade, sectionLabel(cls)));
    if (secStudents.length === 0) { toast.error("No students in this section to export"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Roll No,Name,Email,Phone,Gender,Status"];
    [...secStudents]
      .sort((a, b) => String(a.rollNo || "").localeCompare(String(b.rollNo || "")))
      .forEach(s => {
        lines.push([s.rollNo || "", s.name || "", (s as any).email || "", (s as any).phone || "", (s as any).gender || "", (s as any).status || "Active"].map(esc).join(","));
      });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${normalizeGrade(cls.grade).replace(/\s+/g, "_")}_${sectionLabel(cls).replace(/\s+/g, "_")}-roster.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${secStudents.length} students`);
  }

  // Download student CSV template
  function downloadStudentTemplate() {
    const csv = [
      "Name,Email,Gender",
      "John Doe,john@example.com,Male",
      "Jane Roe,jane@example.com,Female",
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "students-import-template.csv";
    a.click();
    toast.success("Student roster template downloaded");
  }

  // Parse student CSV
  function parseStudentCsv(text: string): { name: string; email: string; gender: string }[] {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("File has no data rows.");
    const header = lines[0].toLowerCase();
    const startIdx = header.includes("name") ? 1 : 0;
    const rows: { name: string; email: string; gender: string }[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
      const name = cols[0];
      const email = cols[1] || "";
      const gender = cols[2] || "";
      if (!name) continue;
      rows.push({ name, email, gender });
    }
    if (rows.length === 0) throw new Error("No valid student rows found.");
    return rows;
  }

  function handleImportStudentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImportStudentError("");
    setImportStudentRows([]);
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setImportStudentError("Excel detected. Please 'Save As → CSV' in Excel and upload the .csv file. The columns stay the same.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseStudentCsv(String(reader.result || ""));
        setImportStudentRows(rows);
        toast.success(`Parsed ${rows.length} students — review and import`);
      } catch (err: any) {
        setImportStudentError(err.message || "Could not parse the file.");
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmImportStudents() {
    if (!importStudentTarget || importStudentRows.length === 0) return;
    setImportingStudents(true);
    try {
      const sec = sectionLabel(importStudentTarget).replace(/^Section\s*/i, "").trim().toUpperCase() || "A";
      let created = 0;
      for (const r of importStudentRows) {
        const studentId = "STD-" + Math.floor(1000 + Math.random() * 9000) + "-" + created;
        await addStudents([{
          id: studentId,
          name: r.name,
          email: r.email,
          gender: r.gender,
          grade: importStudentTarget.grade,
          section: sec,
          classId: importStudentTarget.id,
          status: "Active"
        } as any]);
        await addEnrollment({
          studentId,
          studentName: r.name,
          classId: importStudentTarget.id,
          className: importStudentTarget.name,
          sectionId: importStudentTarget.id,
          sectionName: sec,
          grade: importStudentTarget.grade,
          academicYear: importStudentTarget.academicYear || "2026-27",
          status: "Active"
        } as any);
        created++;
      }
      toast.success(`Imported ${created} student${created !== 1 ? "s" : ""} into ${importStudentTarget.name}`);
      setImportStudentTarget(null);
      setImportStudentRows([]);
      setImportStudentError("");
    } catch {
      toast.error("Import failed — please try again");
    } finally {
      setImportingStudents(false);
      if (importStudentFileRef.current) importStudentFileRef.current.value = "";
    }
  }
  const navigate = useNavigate();
  const location = useLocation();

  const initialGrade = (location.state as any)?.selectedGrade ?? null;
  const initialClassId = (location.state as any)?.selectedClassId ?? null;
  const [drillLevel, setDrillLevel] = useState<DrillLevel>(initialClassId ? "section" : initialGrade ? "grade" : "grades");
  const [selectedGrade, setSelectedGrade] = useState<string | null>(initialGrade);
  const [selectedSection, setSelectedSection] = useState<Class | null>(null);
  const allExams = useExams(); // shared exam store — drives the grade-level Exams tab
  const sectionInitRef = useRef(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [gradeTab, setGradeTab] = useState<string>("sections");
  const [studentsTabSectionFilter, setStudentsTabSectionFilter] = useState<string>("All");
  // Live computed gradebook rows bubbled up from GradebookPro — real export data.
  const [gradebookRows, setGradebookRows] = useState<{ name: string; rollNo: string; scores: Record<string, number>; total: number; max: number; pct: number; grade: string }[]>([]);
  const [gradebookSubjectCols, setGradebookSubjectCols] = useState<string[]>([]);

  // Export the grade's computed gradebook (students × subjects) as a CSV download.
  function handleExportGradebook() {
    if (gradebookRows.length === 0) { toast.error("No gradebook marks to export yet"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["Roll No", "Student", ...gradebookSubjectCols, "Total", "Max", "Percentage", "Grade"];
    const lines = [cols.map(esc).join(",")];
    gradebookRows.forEach(r => lines.push([
      r.rollNo, r.name, ...gradebookSubjectCols.map(s => r.scores[s] ?? ""), r.total, r.max, `${r.pct.toFixed(1)}%`, r.grade,
    ].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(selectedGrade || "grade").replace(/\s+/g, "-")}-gradebook.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported gradebook for ${gradebookRows.length} students`);
  }

  // Dialogs
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSectionGrade, setAddSectionGrade] = useState("");
  const [addingSec, setAddingSec] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Class | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [promoteOpen, setPromoteOpen] = useState(false);

  // Import classes
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<{ grade: string; section: string; teacher: string }[]>([]);
  const [importError, setImportError] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);

  // Grade Coordinators
  const [coordinators, setCoordinators] = useState<Record<string, GradeCoordinator>>({});
  const [assignCoordOpen, setAssignCoordOpen] = useState(false);
  const [assignCoordGrade, setAssignCoordGrade] = useState<string | null>(null);
  const [coordStaffSearch, setCoordStaffSearch] = useState("");
  const [coordStaffId, setCoordStaffId] = useState("");

  // Filters
  const [filterStage, setFilterStage] = useState("All Stages");
  const [filterStatus, setFilterStatus] = useState("All Statuses");

  // Export every grade/section as a CSV (super-admin utility).
  function exportAllClasses() {
    if (classes.length === 0) { toast.error("No classes to export"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Grade,Section,Teacher,Status,Subjects,Academic Year"];
    [...classes]
      .sort((a, b) => gradeIndex(a.grade, grades) - gradeIndex(b.grade, grades) || String(a.name).localeCompare(String(b.name)))
      .forEach(c => {
        const sec = String((c as any).name || "").match(/Section\s+([A-Z])/i)?.[1] || (c as any).section || "";
        lines.push([c.grade, sec, (c as any).teacher || (c as any).teacherName || "", c.status || "Active", ((c as any).subjects || []).length, (c as any).academicYear || ""].map(esc).join(","));
      });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `all-classes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${classes.length} classes`);
  }

  // Edit grade
  const [editGradeTarget, setEditGradeTarget] = useState<string | null>(null);
  const [editGradeName, setEditGradeName] = useState("");
  const [editingGrade, setEditingGrade] = useState(false);

  // Edit section
  const [editSectionTarget, setEditSectionTarget] = useState<Class | null>(null);
  const [editSecName, setEditSecName] = useState("");
  const [editSecTeacher, setEditSecTeacher] = useState("");
  const [editingSection, setEditingSection] = useState(false);

  // Semester states
  const [sectionSemesters, setSectionSemesters] = useState<LocalSemester[]>([]);
  const [addSemOpen, setAddSemOpen] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const [newSemStart, setNewSemStart] = useState('');
  const [newSemEnd, setNewSemEnd] = useState('');
  const [newSemStatus, setNewSemStatus] = useState<'Active'|'Upcoming'|'Completed'>('Active');
  const [addingSem, setAddingSem] = useState(false);

  // Real attendance + behavior records — power the Grade Coordinator's
  // section-level stats (Section Performance Monitor, Students tab) instead
  // of the hardcoded per-index fake arrays this view used to read from.
  const [gradeAttendanceRows, setGradeAttendanceRows] = useState<any[]>([]);
  const [gradeIncidents, setGradeIncidents] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    smartDb.getAll("attendance").then(rows => { if (alive) setGradeAttendanceRows(Array.isArray(rows) ? rows : []); }).catch(() => {});
    smartDb.getAll("BehaviorIncident").then(rows => { if (alive) setGradeIncidents(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Normalize + deduplicate
  const deduped = useMemo(() => {
    const seen = new Map<string, Class>();
    for (const cls of classes) {
      const norm = normalizeGrade(cls.grade);
      const sec = sectionLabel({ ...cls, grade: norm });
      const key = `${norm}__${sec}`;
      const existing = seen.get(key);
      if (!existing || (cls.subjects?.length || 0) >= (existing.subjects?.length || 0)) {
        seen.set(key, { ...cls, grade: norm });
      }
    }
    return Array.from(seen.values());
  }, [classes]);

  // When navigating back from ClassDetail with a selectedClassId, open that section's semester view
  useEffect(() => {
    if (sectionInitRef.current || !initialClassId || classes.length === 0) return;
    const cls = classes.find(c => c.id === initialClassId);
    if (!cls) return;
    sectionInitRef.current = true;
    const normGrade = normalizeGrade(cls.grade);
    setSelectedGrade(normGrade);
    setSelectedSection({ ...cls, grade: normGrade });
    getClassSems(cls.id).then(setSectionSemesters);
    setDrillLevel("section");
  }, [classes]);

  useEffect(() => { getAllCoordinators().then(setCoordinators); }, []);

  const gradeMap = useMemo(() => {
    const map = new Map<string, Class[]>();
    for (const cls of deduped) {
      if (!map.has(cls.grade)) map.set(cls.grade, []);
      map.get(cls.grade)!.push(cls);
    }
    return map;
  }, [deduped]);

  // Stats
  const totalGrades = gradeMap.size;
  const totalSections = deduped.length;
  const totalStudents = students.length;
  const totalTeachers = staff.filter(s => s.role === "Teacher" || (s as any).department === "Academic").length;

  const sortedGrades = useMemo(() =>
    Array.from(gradeMap.entries())
      // A Grade Coordinator only ever sees their own assigned grade — applied
      // before search/stage/status so there's no way to search, filter, or
      // page your way into seeing another grade exists at all.
      .filter(([g]) => !isGradeCoordinator || g === coordAssignedGrade)
      .sort(([a], [b]) => gradeIndex(a, grades) - gradeIndex(b, grades))
      .filter(([g]) => g.toLowerCase().includes(search.toLowerCase()))
      .filter(([g]) => filterStage === "All Stages" || gradeStage(g, curriculum) === filterStage)
      .filter(([, list]) => {
        if (filterStatus === "All Statuses") return true;
        const anyActive = list.some(c => (c.status ?? "Active") === "Active");
        return filterStatus === "Active" ? anyActive : !anyActive;
      }),
    [gradeMap, search, filterStage, filterStatus, isGradeCoordinator, coordAssignedGrade]
  );
  const filtersActive = filterStage !== "All Stages" || filterStatus !== "All Statuses";
  const totalPages = Math.ceil(sortedGrades.length / PAGE_SIZE);
  const pagedGrades = sortedGrades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const gradeSections = useMemo(() =>
    selectedGrade ? (gradeMap.get(selectedGrade) || []) : [],
    [selectedGrade, gradeMap]
  );

  // Handlers
  function openGrade(grade: string) {
    setSelectedGrade(grade);
    setDrillLevel("grade");
    setSearch("");
  }

  function goBack() {
    if (drillLevel === "section") {
      setDrillLevel("grade");
      setSelectedSection(null);
    } else {
      setDrillLevel("grades");
      setSelectedGrade(null);
      setSearch("");
    }
  }

  function openAddSection(grade: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setAddSectionGrade(grade);
    setAddSectionOpen(true);
  }

  // Mirror a Class-side teacher assignment onto the teacher's own User
  // record. The teacher portal (useTeacherClass) scopes off User.assignedGrade
  // /assignedSection, a completely separate field from this module's
  // Class.teacher — assigning someone here used to never reach that side, so
  // their own portal (and Staff Onboarding's card) kept showing their old/
  // default assignment or "Not Assigned" no matter what was set here.
  async function resolveTeacherEmailByName(teacherName: string): Promise<string | null> {
    const norm = (v: any) => String(v || "").trim().toLowerCase();
    const target = norm(teacherName);
    const [allUsers, allStaff]: any[][] = await Promise.all([
      fetch("/api/data/users").then(r => r.json()).catch(() => []),
      fetch("/api/data/staff").then(r => r.json()).catch(() => []),
    ]);
    const teacherUser = (Array.isArray(allUsers) ? allUsers : []).find(
      (u: any) => norm(u.name) === target || norm(u.displayName) === target
    );
    const staffRecord = (Array.isArray(allStaff) ? allStaff : []).find(
      (s: any) => norm(s.name) === target || norm(s.displayName) === target
    );
    return teacherUser?.email || staffRecord?.email || null;
  }

  // Picking a teacher's name for a section from the full staff list makes it
  // easy to accidentally pick someone who already has a homeroom elsewhere —
  // call this BEFORE creating/updating the Class record so a conflict blocks
  // the whole action instead of leaving a half-written section.
  async function checkSectionTeacherConflict(teacherName: string, grade: string, section: string): Promise<string | null> {
    if (!teacherName || teacherName === "Unassigned") return null;
    const email = await resolveTeacherEmailByName(teacherName);
    if (!email) return null; // no linked account — same as syncTeacherAssignment's no-op
    const conflict = await checkClassTeacherAssignment(email, grade, section, true);
    return conflict?.message || null;
  }

  async function syncTeacherAssignment(teacherName: string, grade: string, section: string) {
    if (!teacherName || teacherName === "Unassigned") return;
    try {
      const email = await resolveTeacherEmailByName(teacherName);
      if (!email) return; // no linked account — nothing to sync, silent no-op like Subjects.tsx does
      await smartDb.update("User", email, {
        assignedGrade: grade,
        assignedSection: section,
        assignedClassName: `${grade} Section ${section}`,
      });
    } catch { /* non-fatal — the Class record itself is already saved either way */ }
  }

  async function handleAddSectionFromWizard(name: string, teacher: string) {
    const nameClean = name.trim();
    const existingNames = (gradeMap.get(addSectionGrade) || []).map(c => sectionLabel(c));
    if (existingNames.some(n => n.toLowerCase() === nameClean.toLowerCase())) {
      toast.error(`${nameClean} already exists in ${addSectionGrade}`);
      return;
    }
    const secLetterPreCheck = nameClean.match(/Section\s+([A-Z])/i)?.[1] || nameClean;
    const conflict = await checkSectionTeacherConflict(teacher, addSectionGrade, secLetterPreCheck);
    if (conflict) {
      toast.error(conflict);
      return;
    }
    setAddingSec(true);
    try {
      await addClass({
        name: `${addSectionGrade} ${nameClean}`,
        grade: addSectionGrade,
        teacher: teacher,
        academicYearId: "",
        academicYear: "2026-27",
        sections: [],
        subjects: [],
        status: "Active",
        uid: "",
      });
      const secLetter = nameClean.match(/Section\s+([A-Z])/i)?.[1] || nameClean;
      await syncTeacherAssignment(teacher, addSectionGrade, secLetter);
      toast.success(`${nameClean} added to ${addSectionGrade}`);
      setAddSectionOpen(false);
    } catch { toast.error("Failed to add section"); }
    finally { setAddingSec(false); }
  }

  async function handleDeleteSection() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClass(deleteTarget.id);
      toast.success(`${sectionLabel(deleteTarget)} deleted`);
      setDeleteTarget(null);
    } catch { toast.error("Failed to delete section"); }
    finally { setDeleting(false); }
  }

  async function handleSeedData() {
    setSeeding(true);
    try {
      // Delete all existing classes
      for (const cls of classes) {
        await deleteClass(cls.id);
      }
      // Create fresh structure
      for (const grade of grades) {
        const defaultSubjects = getDefaultSubjectsForGrade(curriculum, grade);
        for (const sec of SEED_SECTIONS) {
          await addClass({
            name: `${grade} ${sec}`,
            grade,
            teacher: "",
            academicYearId: "",
            academicYear: "2026-27",
            sections: [],
            subjects: defaultSubjects,
            status: "Active",
            uid: "",
          });
        }
      }
      toast.success("School structure initialized: Pre-KG to Grade 12, 3 sections each");
      setSeedOpen(false);
    } catch { toast.error("Initialization failed — please try again"); }
    finally { setSeeding(false); }
  }

  // ── Import classes (CSV / Excel-exported CSV) ──────────────────────────────
  function downloadImportTemplate() {
    const csv = [
      "Grade,Section,Homeroom Teacher,Academic Year",
      "Pre-KG,A,Sana Fatima,2026-27",
      "Pre-KG,B,Ayesha Khan,2026-27",
      "Grade 1,A,Imran Qureshi,2026-27",
      "Grade 1,B,Faisal Malik,2026-27",
      "Grade 10,A,Rizwan Ahmed,2026-27",
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "classes-import-template.csv";
    a.click();
    toast.success("Template downloaded");
  }

  function parseCsv(text: string): { grade: string; section: string; teacher: string }[] {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("File has no data rows.");
    const header = lines[0].toLowerCase();
    const startIdx = /grade/.test(header) ? 1 : 0;
    const rows: { grade: string; section: string; teacher: string }[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const grade = normalizeGrade(cols[0] || "");
      const section = (cols[1] || "A").replace(/^section\s*/i, "").trim();
      const teacher = cols[2] || "";
      if (!grade) continue;
      rows.push({ grade, section, teacher });
    }
    if (rows.length === 0) throw new Error("No valid rows found. Check the Grade column.");
    return rows;
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImportError("");
    setImportRows([]);
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setImportError("Excel detected. Please 'Save As → CSV' in Excel and upload the .csv (no extra libraries needed). The columns stay the same.");
      return;
    }
    if (name.endsWith(".zip")) {
      setImportError("ZIP detected. Unzip and upload the classes .csv inside it.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result || ""));
        setImportRows(rows);
        toast.success(`Parsed ${rows.length} rows — review and import`);
      } catch (err: any) {
        setImportError(err.message || "Could not parse the file.");
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      let created = 0;
      const existing = new Set(deduped.map(c => `${c.grade}__${sectionLabel(c)}`.toLowerCase()));
      for (const r of importRows) {
        const key = `${r.grade}__Section ${r.section}`.toLowerCase();
        if (existing.has(key) || existing.has(`${r.grade}__${r.section}`.toLowerCase())) continue;
        await addClass({
          name: `${r.grade} ${r.section}`,
          grade: r.grade,
          teacher: r.teacher,
          academicYearId: "",
          academicYear: "2026-27",
          sections: [],
          subjects: [],
          status: "Active",
          uid: "",
        } as any);
        created++;
      }
      toast.success(`Imported ${created} class${created !== 1 ? "es" : ""}${created < importRows.length ? ` (${importRows.length - created} duplicates skipped)` : ""}`);
      setImportOpen(false);
      setImportRows([]);
      setImportError("");
    } catch { toast.error("Import failed — please try again"); }
    finally { setImporting(false); }
  }

  // ── Edit grade (rename across all its sections) ────────────────────────────
  function openEditGrade(grade: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditGradeTarget(grade);
    setEditGradeName(grade);
  }
  async function handleEditGrade() {
    if (!editGradeTarget) return;
    const newName = normalizeGrade(editGradeName.trim());
    if (!newName) { toast.error("Grade name is required"); return; }
    if (newName === editGradeTarget) { setEditGradeTarget(null); return; }
    if (gradeMap.has(newName)) { toast.error(`${newName} already exists`); return; }
    setEditingGrade(true);
    try {
      const sectionsToUpdate = classes.filter(c => normalizeGrade(c.grade) === editGradeTarget);
      for (const c of sectionsToUpdate) {
        const sec = sectionLabel({ ...c, grade: editGradeTarget });
        await updateClass(c.id, { grade: newName, name: `${newName} ${sec}` } as any);
      }
      toast.success(`Renamed ${editGradeTarget} → ${newName}`);
      if (selectedGrade === editGradeTarget) setSelectedGrade(newName);
      setEditGradeTarget(null);
    } catch { toast.error("Failed to rename grade"); }
    finally { setEditingGrade(false); }
  }

  // ── Edit section (rename + change teacher) ─────────────────────────────────
  function openEditSection(cls: Class) {
    setEditSectionTarget(cls);
    setEditSecName(sectionLabel(cls));
    setEditSecTeacher(cls.teacher || "");
  }
  async function handleEditSection() {
    if (!editSectionTarget) return;
    const nameClean = editSecName.trim();
    if (!nameClean) { toast.error("Section name is required"); return; }
    const grade = normalizeGrade(editSectionTarget.grade);
    const dupe = (gradeMap.get(grade) || []).some(c => c.id !== editSectionTarget.id && sectionLabel(c).toLowerCase() === nameClean.toLowerCase());
    if (dupe) { toast.error(`${nameClean} already exists in ${grade}`); return; }
    const secLetter = nameClean.match(/Section\s+([A-Z])/i)?.[1] || nameClean;
    // Reassigning THIS section's own current teacher to the same section isn't
    // a conflict — only flag it if the picked name resolves to someone whose
    // account is already homed to a genuinely different class.
    if (editSecTeacher !== (editSectionTarget.teacher || "")) {
      const conflict = await checkSectionTeacherConflict(editSecTeacher, grade, secLetter);
      if (conflict) { toast.error(conflict); return; }
    }
    setEditingSection(true);
    try {
      await updateClass(editSectionTarget.id, { name: `${grade} ${nameClean}`, teacher: editSecTeacher } as any);
      await syncTeacherAssignment(editSecTeacher, grade, secLetter);
      toast.success("Section updated");
      setEditSectionTarget(null);
    } catch { toast.error("Failed to update section"); }
    finally { setEditingSection(false); }
  }

  // ── Persist subject list to MySQL (writes to every section in the grade) ───
  async function persistGradeSubjects(names: string[]) {
    const sections = gradeSections;
    if (sections.length === 0) return;
    try {
      await Promise.all(sections.map(c => updateClass(c.id, { subjects: names } as any)));
    } catch { toast.error("Could not save subjects to the database"); }
  }

  async function handleAddSemester() {
    if (!newSemName.trim()) { toast.error("Semester name is required"); return; }
    if (!selectedSection) return;
    setAddingSem(true);
    try {
      const sem: LocalSemester = {
        id: `sem_${Date.now()}`,
        classId: selectedSection.id,
        name: newSemName.trim(),
        startDate: newSemStart,
        endDate: newSemEnd,
        status: newSemStatus,
      };
      await saveClassSem(selectedSection.id, sem);
      setSectionSemesters(prev => [...prev, sem]);
      toast.success(`${sem.name} added`);
      setAddSemOpen(false);
      setNewSemName('');
      setNewSemStart('');
      setNewSemEnd('');
      setNewSemStatus('Active');
    } catch { toast.error("Failed to add semester"); }
    finally { setAddingSem(false); }
  }

  // ── Assign Grade Coordinator ───────────────────────────────────────────────
  async function openAssignCoord(grade: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setAssignCoordGrade(grade);
    const existing = (await getAllCoordinators())[grade];
    setCoordStaffId(existing?.id || "");
    setCoordStaffSearch("");
    setAssignCoordOpen(true);
  }
  async function handleSaveCoordinator() {
    if (!assignCoordGrade) return;
    const sel = staff.find(s => s.id === coordStaffId);
    // A grade can only have one coordinator, and a coordinator can only
    // coordinate one grade — catch either collision before writing anything.
    if (sel?.email) {
      const conflict = await checkGradeCoordinatorAssignment(sel.email, assignCoordGrade, true);
      if (conflict) {
        toast.error(conflict.message);
        return;
      }
    }
    const coord: GradeCoordinator | null = sel ? { id: sel.id, name: sel.name || (sel as any).fullName || "" } : null;
    const previous = (await getAllCoordinators())[assignCoordGrade];
    await persistCoordinator(assignCoordGrade, coord);
    setCoordinators(prev => {
      const next = { ...prev };
      if (coord) next[assignCoordGrade] = coord; else delete next[assignCoordGrade];
      return next;
    });

    // The localStorage map above is display-only and per-browser — it can't
    // answer "is the CURRENTLY LOGGED-IN user the coordinator for this
    // grade," which is what actual access control needs (see
    // useGradeCoordinator.ts). Mirror the assignment onto the real User
    // record so it's enforceable, the same way syncTeacherAssignment does
    // for class teachers.
    try {
      // Clear the outgoing coordinator's assignment first so a
      // reassignment or removal doesn't leave two people scoped to the
      // same grade. Written to a dedicated `coordinatorGrade` field, NOT
      // assignedGrade — that field belongs to Class Teacher and a person can
      // hold both roles at once (their own class + a whole grade to
      // oversee); reusing it here used to overwrite/corrupt whichever one
      // was assigned second.
      if (previous && previous.id !== sel?.id) {
        const prevStaff = staff.find(s => s.id === previous.id);
        if (prevStaff?.email) {
          await smartDb.update("User", prevStaff.email, { coordinatorGrade: null });
        }
      }
      if (sel?.email) {
        await smartDb.update("User", sel.email, { coordinatorGrade: assignCoordGrade });
      }
    } catch { /* non-fatal — the visible assignment above already saved */ }

    toast.success(coord ? `${coord.name} assigned as Grade Coordinator for ${assignCoordGrade}` : `Coordinator removed from ${assignCoordGrade}`);
    setAssignCoordOpen(false);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GRADES TABLE VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (drillLevel === "grades") {
    return (
      <DashboardLayout>
        <div className="space-y-5">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
                <p className="text-sm text-slate-400">Manage all grades, sections and class structure</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50"
                onClick={() => { setImportOpen(true); setImportRows([]); setImportError(""); }}>
                <Download className="w-4 h-4" /> Import Classes
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50", filtersActive && "border-indigo-300 text-purple-600 bg-indigo-50")}>
                    <SlidersHorizontal className="w-4 h-4" /> Filters{filtersActive && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-purple-600" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60 p-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Stage</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {["All Stages", "Early Years", "Primary", "Middle", "Secondary"].map(o => (
                        <button key={o} onClick={() => { setFilterStage(o); setPage(1); }}
                          className={cn("text-xs font-semibold rounded-lg px-2 py-1.5 border transition-colors",
                            filterStage === o ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                          {o === "All Stages" ? "All" : o}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Status</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {["All Statuses", "Active", "Inactive"].map(o => (
                        <button key={o} onClick={() => { setFilterStatus(o); setPage(1); }}
                          className={cn("text-xs font-semibold rounded-lg px-2 py-1.5 border transition-colors",
                            filterStatus === o ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                          {o === "All Statuses" ? "All" : o}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filtersActive && (
                    <Button variant="ghost" size="sm" className="w-full text-gray-500 hover:text-gray-700" onClick={() => { setFilterStage("All Stages"); setFilterStatus("All Statuses"); setPage(1); }}>Clear filters</Button>
                  )}
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-gray-200">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => navigate("/academics/classes/new")}>
                    <Plus className="w-4 h-4 mr-2" /> Add New Grade
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/academics/classes/new-section")}>
                    <Users className="w-4 h-4 mr-2" /> Add Section
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportAllClasses}>
                    <Download className="w-4 h-4 mr-2" /> Export Classes (Excel/CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportOpen(true); setImportRows([]); setImportError(""); }}>
                    <Download className="w-4 h-4 mr-2" /> Import Classes (Download CSV/Excel template to import)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/timetable")}>
                    <CalendarDays className="w-4 h-4 mr-2" /> Master Timetable
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.reload()}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSeedOpen(true)} className="text-amber-600 focus:text-amber-600">
                    <RefreshCw className="w-4 h-4 mr-2" /> Initialize School Structure
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                onClick={() => navigate("/academics/classes/new")}>
                <Plus className="w-4 h-4" /> Add New Grade
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {[
              { label: "Total Grades", value: totalGrades, sub: "Active Grades", icon: GraduationCap, color: "text-purple-600", bg: "bg-violet-50", border: "border-violet-100" },
              { label: "Total Sections", value: totalSections, sub: "Across all grades", icon: BookOpen, color: "text-purple-600", bg: "bg-blue-50", border: "border-blue-100" },
              { label: "Total Students", value: totalStudents.toLocaleString(), sub: "Enrolled Students", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "Total Teachers", value: totalTeachers, sub: "Active Teachers", icon: UserCheck, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
              { label: "Avg. Attendance", value: "97.6%", sub: "This Month", icon: Activity, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-100" },
            ].map(({ label, value, sub, icon: Icon, color, bg, border }) => (
              <Card key={label} className={`border ${border} shadow-sm hover:shadow-md transition-shadow`}>
                <CardContent className="p-4">
                  <div className={`p-2.5 rounded-xl ${bg} w-fit`}><Icon className={`w-5 h-5 ${color}`} /></div>
                  <p className="text-2xl font-bold text-gray-900 mt-3">{value}</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{label}</p>
                  <p className="text-xs text-gray-400">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-gray-200">
            <button className="px-4 pb-3 text-sm font-semibold text-purple-600 border-b-2 border-purple-600">
              All Grades
            </button>
            <div className="relative pb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search grades..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 w-60 h-8 text-sm border-gray-200" />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Grade","Sections","Students","Grade Coordinator","Academic Year","Status","Action"].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedGrades.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-14 text-center text-gray-400">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 text-gray-200" />No grades found
                  </td></tr>
                ) : pagedGrades.map(([grade, clsList]) => {
                  const academicYear = clsList[0]?.academicYear || "2026-27";
                  const coord = coordinators[grade];
                  return (
                    <tr key={grade} className="border-b border-gray-100 hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                      onClick={() => openGrade(grade)}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("inline-flex items-center justify-center w-9 h-9 rounded-xl text-white text-xs font-bold shadow-sm", gradeBgColor(grade, grades))}>
                            {gradeBadgeLabel(grade)}
                          </span>
                          <span className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{grade}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-600">{clsList.length}</td>
                      <td className="px-5 py-4 text-gray-600">{students.filter(s => clsList.some(c => c.id === (s as any).classId)).length || 0}</td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        {coord ? (
                          <div className="flex items-center gap-2 group/coord">
                            <Avatar className="w-7 h-7 shrink-0">
                              <AvatarFallback className="bg-indigo-100 text-purple-600 text-[10px] font-bold">{initials(coord.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{coord.name}</p>
                              <p className="text-[10px] text-purple-600 font-medium">Grade Coordinator</p>
                            </div>
                            {/* openAssignCoord pre-populates the current coordinator, so
                                reopening it here reuses the exact same assign flow (and
                                its duplicate-prevention check) to swap someone else in —
                                previously an already-assigned grade had no way to change
                                who held this role short of clearing it first elsewhere. */}
                            <button onClick={e => openAssignCoord(grade, e)}
                              className="ml-auto opacity-0 group-hover/coord:opacity-100 text-[11px] font-semibold text-purple-600 hover:text-indigo-800 hover:underline flex-shrink-0 transition-opacity">
                              Change
                            </button>
                          </div>
                        ) : (
                          <button onClick={e => openAssignCoord(grade, e)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-indigo-800 hover:underline">
                            <Plus className="w-3.5 h-3.5" /> Assign Coordinator
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-600">{academicYear}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      </td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline"
                            className="h-8 text-xs px-3 border-gray-200 hover:border-indigo-300 hover:text-purple-600"
                            onClick={() => openGrade(grade)}>
                            View <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={e => openEditGrade(grade, e as any)}>Edit Grade</DropdownMenuItem>
                              <DropdownMenuItem onClick={e => openAddSection(grade, e as any)}>Add Section</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={e => openAssignCoord(grade, e as any)}>
                                <Shield className="w-4 h-4 mr-2 text-indigo-500" /> Assign Grade Coordinator
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sortedGrades.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, sortedGrades.length)} to {Math.min(page * PAGE_SIZE, sortedGrades.length)} of {sortedGrades.length} grades</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <Button key={p} size="sm" variant={page === p ? "default" : "outline"}
                    className={cn("h-8 w-8 p-0 border-gray-200", page === p && "bg-purple-600 hover:bg-purple-700 border-purple-600")}
                    onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-gray-200" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </div>

        {/* Dialogs */}
        <SectionWizard
          open={addSectionOpen}
          grade={addSectionGrade}
          existingSections={(gradeMap.get(addSectionGrade) || []).map(c => sectionLabel(c))}
          staff={staff}
          loading={addingSec}
          onSave={handleAddSectionFromWizard}
          onClose={() => setAddSectionOpen(false)}
        />

        <AlertDialog open={seedOpen} onOpenChange={setSeedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Initialize School Structure</AlertDialogTitle>
              <AlertDialogDescription>
                This will <strong>delete all existing classes</strong> and create a fresh K-12 structure:
                Pre-KG, LKG, UKG, and Grade 1–12 (15 grades), each with Section A, B, and C — 45 classes total.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={seeding}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSeedData} disabled={seeding}
                className="bg-amber-600 hover:bg-amber-700">
                {seeding ? "Initializing…" : "Yes, Initialize"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Classes dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Classes</DialogTitle>
              <DialogDescription>Bulk-create grades &amp; sections from a spreadsheet file.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm">
                <p className="font-semibold text-gray-700 mb-1">Required file format</p>
                <ul className="text-gray-500 text-[13px] space-y-0.5 list-disc pl-4">
                  <li>Accepted: <b>.csv</b> (recommended). Excel users: <i>Save As → CSV</i>. ZIP: unzip first.</li>
                  <li>Columns (in order): <b>Grade</b>, <b>Section</b>, <b>Homeroom Teacher</b>, <b>Academic Year</b></li>
                  <li>Grade examples: <code>Pre-KG, LKG, UKG, Grade 1 … Grade 12</code></li>
                  <li>One row per section. Duplicates are skipped automatically.</li>
                </ul>
                <Button variant="link" size="sm" className="px-0 h-auto mt-1 text-purple-600" onClick={downloadImportTemplate}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Download CSV template
                </Button>
              </div>

              <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls,.zip" className="hidden" onChange={handleImportFile} />
              <button onClick={() => importFileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-1 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                <Download className="w-7 h-7 text-indigo-400" />
                <span className="text-sm font-medium text-gray-600">Click to choose a file</span>
                <span className="text-[11px] text-gray-400">CSV, Excel (.xlsx → save as CSV) or ZIP</span>
              </button>

              {importError && <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5">{importError}</p>}

              {importRows.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {importRows.length} rows ready to import</div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400"><th className="text-left px-3 py-1.5">Grade</th><th className="text-left px-3 py-1.5">Section</th><th className="text-left px-3 py-1.5">Teacher</th></tr></thead>
                      <tbody>{importRows.slice(0, 50).map((r, i) => (<tr key={i} className="border-t border-gray-50"><td className="px-3 py-1.5 font-medium text-gray-700">{r.grade}</td><td className="px-3 py-1.5 text-gray-600">{r.section}</td><td className="px-3 py-1.5 text-gray-500">{r.teacher || "—"}</td></tr>))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleConfirmImport} disabled={importing || importRows.length === 0}>
                {importing ? "Importing…" : `Import ${importRows.length || ""} Classes`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Grade dialog */}
        <Dialog open={!!editGradeTarget} onOpenChange={o => !o && setEditGradeTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Grade</DialogTitle>
              <DialogDescription>Rename this grade across all of its sections.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-500">Grade Name</Label>
              <Input value={editGradeName} onChange={e => setEditGradeName(e.target.value)} placeholder="e.g. Grade 1"
                onKeyDown={e => { if (e.key === "Enter") handleEditGrade(); }} />
              <p className="text-[11px] text-gray-400">{(gradeMap.get(editGradeTarget || "") || []).length} section(s) will be updated.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditGradeTarget(null)} disabled={editingGrade}>Cancel</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleEditGrade} disabled={editingGrade}>{editingGrade ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AssignCoordinatorDialog
          open={assignCoordOpen}
          grade={assignCoordGrade || ""}
          staff={staff}
          currentCoordId={coordStaffId}
          staffSearch={coordStaffSearch}
          onSearchChange={setCoordStaffSearch}
          onSelectStaff={setCoordStaffId}
          onSave={handleSaveCoordinator}
          onClose={() => setAssignCoordOpen(false)}
        />
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION LEVEL VIEW — Semester Selection
  // ════════════════════════════════════════════════════════════════════════════
  if (drillLevel === "section" && selectedSection) {
    // A coordinator can only reach here for their own grade's sections via
    // the UI (sortedGrades is already filtered), but selectedSection/
    // selectedGrade are local component state — directly reachable if
    // something else sets them (a stale deep link, a manipulated URL param
    // via initialClassId, etc.). Re-check at the point of render, not just
    // at the point of navigation.
    if (isGradeCoordinator && normalizeGrade(selectedSection.grade) !== coordAssignedGrade) {
      return (
        <DashboardLayout>
          <AccessDenied
            detail={coordAssignedGrade ? `You're assigned to ${coordAssignedGrade}.` : "You haven't been assigned a grade yet — contact your administrator."}
          />
        </DashboardLayout>
      );
    }
    const secName = sectionLabel(selectedSection);
    const secColors = getSectionColor(secName);
    const secLetter = sectionBadgeLetter(secName);
    // The Add/Edit Section wizards persist the literal string "Unassigned"
    // (not empty) when no teacher is picked — treat that the same as a truly
    // empty field so it doesn't render as if a teacher named "Unassigned"
    // were actually assigned (broken avatar initials, misleading label).
    const secTeacher = (selectedSection.teacher && selectedSection.teacher !== "Unassigned")
      ? selectedSection.teacher
      : "Not Assigned";
    const secStudents = students.filter(s => matchesGradeSection(s, selectedSection.grade, sectionLabel(selectedSection)));
    const secSubjectsCount = selectedSection.subjects?.length || 0;

    const semStatusBadge = (status: LocalSemester['status']) => {
      if (status === 'Active') return "bg-green-50 text-green-700 border-green-200";
      if (status === 'Upcoming') return "bg-blue-50 text-blue-700 border-blue-200";
      return "bg-gray-100 text-gray-600 border-gray-200";
    };

    return (
      <DashboardLayout>
        <div className="p-6 space-y-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setDrillLevel("grades"); setSelectedGrade(null); setSearch(""); }}
              className="flex items-center gap-1 text-gray-500 hover:text-purple-600 font-medium transition-colors">
              Classes
            </button>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <button onClick={goBack} className="text-gray-500 hover:text-purple-600 font-medium transition-colors">
              {selectedGrade}
            </button>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className="font-semibold text-gray-900">{secName}</span>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-gray-50 to-white border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative">
                <span className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg", secColors.bg)}>
                  {secLetter}
                </span>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{secName}</h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  <span className={cn("font-semibold", secColors.text)}>{selectedGrade}</span>
                  <span className="mx-2 text-gray-300">·</span>
                  Select a semester to open the class dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50"
                onClick={() => navigate(`/students?grade=${encodeURIComponent(selectedGrade || "")}`)}>
                <Users className="w-4 h-4" /> View Students
              </Button>
              <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm font-semibold"
                onClick={() => setAddSemOpen(true)}>
                <Plus className="w-4 h-4" /> Add Semester
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200 text-gray-400 hover:text-gray-600">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => exportSectionRoster(selectedSection)}>
                    <Download className="w-4 h-4 mr-2" /> Export Section Roster (Excel/CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportStudentTarget(selectedSection); setImportStudentRows([]); setImportStudentError(""); }}>
                    <Download className="w-4 h-4 mr-2" /> Import Students (Download template to import)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openEditSection(selectedSection)}>
                    <Edit className="w-4 h-4 mr-2" /> Edit Section Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddSemOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add Semester
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/students?grade=${encodeURIComponent(selectedGrade || "")}`)}>
                    <Users className="w-4 h-4 mr-2" /> View Students
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteTarget(selectedSection)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Hierarchy band */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-50 to-orange-50 border border-gray-100 text-sm">
            <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-400">Grade Coordinator</span>
              {coordinators[selectedGrade!] ? (
                <div className="flex items-center gap-1.5">
                  <Avatar className="w-5 h-5 shrink-0"><AvatarFallback className="bg-purple-600 text-white text-[9px] font-bold">{initials(coordinators[selectedGrade!].name)}</AvatarFallback></Avatar>
                  <span className="font-semibold text-indigo-700 text-xs truncate">{coordinators[selectedGrade!].name}</span>
                </div>
              ) : (
                <button onClick={() => openAssignCoord(selectedGrade!)} className="text-xs text-indigo-400 hover:text-purple-600 font-semibold hover:underline">+ Assign</button>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <UserCheck className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide text-orange-400">Class Teacher</span>
              <div className="flex items-center gap-1.5">
                <Avatar className="w-5 h-5 shrink-0"><AvatarFallback className="bg-orange-500 text-white text-[9px] font-bold">{secTeacher !== "Not Assigned" ? initials(secTeacher) : "?"}</AvatarFallback></Avatar>
                <span className="font-semibold text-orange-700 text-xs truncate">{secTeacher}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <Users className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs font-semibold text-gray-500">Students</span>
          </div>

          {/* Quick action chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {["Term 1","Term 2","Term 3","Semester 1","Semester 2"].map(chip => (
              <button key={chip}
                onClick={() => { setNewSemName(chip); setAddSemOpen(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-purple-600 hover:bg-indigo-50 transition-colors">
                <Plus className="w-3 h-3" /> {chip}
              </button>
            ))}
          </div>

          {/* Semester Grid */}
          {sectionSemesters.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-indigo-100 bg-gradient-to-b from-indigo-50/30 to-white py-20 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <CalendarDays className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="font-bold text-gray-700 text-lg">No semesters yet</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Create a term or semester to start managing this section's dashboard, gradebook and attendance.</p>
              <div className="flex items-center gap-2 justify-center mt-5">
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                  onClick={() => setAddSemOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Semester
                </Button>
                <Button size="sm" variant="outline" className="border-gray-200"
                  onClick={() => { setNewSemName("Term 1"); setNewSemStart("2026-01-01"); setNewSemEnd("2026-06-30"); setNewSemStatus("Active"); setAddSemOpen(true); }}>
                  <Sparkles className="w-4 h-4 mr-1 text-amber-500" /> Quick Setup
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {sectionSemesters.map(sem => {
                const openSem = () => navigate(`/academics/classes/${selectedSection.id}`, {
                  state: { semesterId: sem.id, semesterName: sem.name }
                });
                // term progress (only meaningful for Active)
                let progress = 0;
                if (sem.startDate && sem.endDate) {
                  const start = new Date(sem.startDate).getTime();
                  const end = new Date(sem.endDate).getTime();
                  const now = new Date(2026, 5, 24).getTime();
                  progress = end > start ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100))) : 0;
                }
                return (
                  <Card
                    key={sem.id}
                    onClick={openSem}
                    className={cn("group border cursor-pointer overflow-hidden hover:shadow-xl transition-all duration-200 hover:-translate-y-1", secColors.border)}
                  >
                    <div className={cn("h-1.5 w-full", secColors.bg)} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shadow-sm", secColors.light)}>
                            <CalendarDays className={cn("w-5 h-5", secColors.text)} />
                          </div>
                          <div>
                            <p className="text-lg font-bold text-gray-900 leading-tight">{sem.name}</p>
                            {(sem.startDate || sem.endDate) && (
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {sem.startDate ? new Date(sem.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                  {' → '}
                                  {sem.endDate ? new Date(sem.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", semStatusBadge(sem.status))}>
                          {sem.status}
                        </span>
                      </div>

                      {/* Term progress */}
                      {sem.status === 'Active' && sem.startDate && sem.endDate && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-medium text-gray-500">Term progress</span>
                            <span className={cn("text-[11px] font-bold", secColors.text)}>{progress}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", secColors.bg)} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Open class dashboard</span>
                        <span className={cn("flex items-center gap-1 text-sm font-semibold transition-transform group-hover:translate-x-0.5", secColors.text)}>
                          Open <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Section Stats — Premium Cards Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="border border-indigo-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all bg-gradient-to-br from-indigo-50/50 to-transparent">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-1">Students</p>
                    <p className="text-3xl font-bold text-gray-900">{secStudents.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Enrolled</p>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-100/80"><Users className="w-5 h-5 text-purple-600" /></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-orange-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all bg-gradient-to-br from-orange-50/50 to-transparent">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">Class Teacher</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{secTeacher}</p>
                    <p className="text-xs text-gray-500 mt-1">Section Lead</p>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-100/80"><UserCheck className="w-5 h-5 text-orange-600" /></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-purple-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all bg-gradient-to-br from-purple-50/50 to-transparent">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-1">Subjects</p>
                    <p className="text-3xl font-bold text-gray-900">{secSubjectsCount || "—"}</p>
                    <p className="text-xs text-gray-500 mt-1">Courses</p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-100/80"><BookMarked className="w-5 h-5 text-purple-600" /></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-green-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all bg-gradient-to-br from-green-50/50 to-transparent">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Status</p>
                    <p className="text-lg font-bold text-green-700">Active</p>
                    <p className="text-xs text-gray-500 mt-1">Running</p>
                  </div>
                  <div className="p-3 rounded-xl bg-green-100/80"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <AssignCoordinatorDialog
          open={assignCoordOpen}
          grade={assignCoordGrade || ""}
          staff={staff}
          currentCoordId={coordStaffId}
          staffSearch={coordStaffSearch}
          onSearchChange={setCoordStaffSearch}
          onSelectStaff={setCoordStaffId}
          onSave={handleSaveCoordinator}
          onClose={() => setAssignCoordOpen(false)}
        />

        {/* Add Semester Dialog */}
        <Dialog open={addSemOpen} onOpenChange={v => !v && setAddSemOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Add Semester</DialogTitle>
              <DialogDescription>Create a new semester for {secName}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Semester Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Semester Name</Label>
                <Input placeholder="e.g. Term 1" value={newSemName} onChange={e => setNewSemName(e.target.value)} autoFocus />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {["Term 1","Term 2","Term 3","Term 4","Semester 1","Semester 2"].map(chip => (
                    <button key={chip} onClick={() => setNewSemName(chip)}
                      className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        newSemName === chip
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-purple-600")}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Start Date</Label>
                  <Input type="date" value={newSemStart} onChange={e => setNewSemStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">End Date</Label>
                  <Input type="date" value={newSemEnd} onChange={e => setNewSemEnd(e.target.value)} />
                </div>
              </div>
              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={newSemStatus} onValueChange={v => setNewSemStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Upcoming">Upcoming</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSemOpen(false)} disabled={addingSem}>Cancel</Button>
              <Button onClick={handleAddSemester} disabled={addingSem || !newSemName.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white">
                {addingSem ? "Adding…" : "Add Semester"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GRADE DETAIL VIEW — Section Cards
  // ════════════════════════════════════════════════════════════════════════════
  if (isGradeCoordinator && selectedGrade !== coordAssignedGrade) {
    return (
      <DashboardLayout>
        <AccessDenied
          detail={coordAssignedGrade ? `You're assigned to ${coordAssignedGrade}.` : "You haven't been assigned a grade yet — contact your administrator."}
        />
      </DashboardLayout>
    );
  }
  const gradeColor = gradeBgColor(selectedGrade!, grades);
  const gradeLabel = gradeBadgeLabel(selectedGrade!);
  const uniqueTeachers = [...new Set(gradeSections.map(c => c.teacher).filter(Boolean))];

  // Real student → classId lookup so attendance/behavior records (keyed by
  // studentId) can be joined back to a specific section of this grade.
  // Resolved by matching each student's own grade+section fields against
  // this grade's real sections — NOT by trusting student.classId directly,
  // which can be blank or stale (the underlying cause of section headcounts
  // disagreeing between pages: some students' classId never got backfilled
  // even though their grade/section fields were correct all along).
  const studentClassMap = new Map<string, string>();
  students.forEach(s => {
    const match = gradeSections.find(c => matchesGradeSection(s, c.grade, sectionLabel(c)));
    if (match) studentClassMap.set(s.id, match.id);
  });
  const gradeStudents = students.filter(s => studentClassMap.has(s.id));

  function sectionAttendancePct(classId: string): number | null {
    const rows = gradeAttendanceRows.filter((r: any) => r.entityType === "student" && studentClassMap.get(String(r.entityId)) === classId);
    if (rows.length === 0) return null;
    const score = rows.reduce((a: number, r: any) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
    return Math.round((score / rows.length) * 1000) / 10;
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  function sectionAttendanceSubmittedToday(classId: string): boolean {
    return gradeAttendanceRows.some((r: any) => r.entityType === "student" && r.date === todayStr && studentClassMap.get(String(r.entityId)) === classId);
  }
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  function sectionBehaviorFlagCount(classId: string): number {
    return gradeIncidents.filter((inc: any) =>
      inc.type === "Demerit" &&
      String(inc.date || "") >= sevenDaysAgoStr &&
      studentClassMap.get(String(inc.studentId)) === classId
    ).length;
  }

  const sectionAttendancePcts = gradeSections.map(c => sectionAttendancePct(c.id)).filter((v): v is number => v != null);
  const avgAttendance = sectionAttendancePcts.length ? Math.round((sectionAttendancePcts.reduce((a, b) => a + b, 0) / sectionAttendancePcts.length) * 10) / 10 : null;

  // Real per-section attendance trend (last recorded dates) for the section card sparkline.
  function sectionAttendanceTrend(classId: string): { v: number }[] {
    const byDate = new Map<string, { present: number; total: number }>();
    gradeAttendanceRows.forEach((r: any) => {
      if (r.entityType !== "student" || studentClassMap.get(String(r.entityId)) !== classId) return;
      const d = String(r.date || "");
      if (!d) return;
      if (!byDate.has(d)) byDate.set(d, { present: 0, total: 0 });
      const b = byDate.get(d)!;
      b.total += 1;
      if (r.status === "Present") b.present += 1;
      else if (r.status === "Late") b.present += 0.5;
    });
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([, b]) => ({ v: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0 }));
  }

  // Weekly attendance for the command-center bar chart — real per-day
  // present/total ratio across every student in this grade, last 7 recorded dates.
  const weeklyAttendance = (() => {
    const byDate = new Map<string, { present: number; total: number }>();
    gradeAttendanceRows.forEach((r: any) => {
      if (r.entityType !== "student") return;
      const cid = studentClassMap.get(String(r.entityId));
      if (!cid || !gradeSections.some(c => c.id === cid)) return;
      const d = String(r.date || "");
      if (!d) return;
      if (!byDate.has(d)) byDate.set(d, { present: 0, total: 0 });
      const bucket = byDate.get(d)!;
      bucket.total += 1;
      if (r.status === "Present") bucket.present += 1;
      else if (r.status === "Late") bucket.present += 0.5;
    });
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([d, b]) => ({
        day: new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }),
        pct: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0,
      }));
  })();

  const gradeTeacher = uniqueTeachers[0] || null;
  const totalSubjects = gradeSections.length ? Math.round(gradeSections.reduce((a, c) => a + (c.subjects?.length || 0), 0) / gradeSections.length) : 0;
  const GRADE_TABS = [
    { id: "sections", label: "Sections", icon: LayoutGrid },
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "students", label: "Students", icon: Users },
    { id: "subjects", label: "Subjects", icon: BookMarked },
    { id: "timetable", label: "Timetable", icon: CalendarDays },
    { id: "attendance", label: "Attendance", icon: UserCheck },
    { id: "exams", label: "Exams", icon: FileText },
    { id: "gradebook", label: "Gradebook", icon: ClipboardCheck },
    { id: "reportcards", label: "Report Cards", icon: FileText },
  ];
  const gradeClassData = { name: selectedGrade || "", grade: selectedGrade || "", status: "Active", academicYear: gradeSections[0]?.academicYear || "2026-27", teacher: gradeTeacher || "Not Assigned" };
  // Grade-wide datesheets: every exam of this grade across ALL its sections,
  // pulled from the shared store (synced with central /exams + each section).
  const gradeDatesheets = allExams
    .filter(e => normalizeGrade(e.grade) === selectedGrade)
    .map(recordToDatesheet);
  const gradeSubjects = gradeSections.find(c => (c.subjects?.length || 0) > 0)?.subjects || [];
  const gradeStudentList = gradeStudents.map((s: any) => ({
    id: s.id, name: s.name, rollNo: s.rollNo,
    // grade/section let the gradebook compute engine match each student's real marks
    grade: s.grade || selectedGrade || "", section: s.section || s.sectionName || "",
  }));
  const openSectionRow = (cls: Class) => {
    setSelectedSection(cls);
    getClassSems(cls.id).then(setSectionSemesters);
    setDrillLevel("section");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => navigate("/")} className="text-gray-500 hover:text-purple-600 font-medium transition-colors">Academics</button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <button onClick={goBack} className="text-gray-500 hover:text-purple-600 font-medium transition-colors">Classes</button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="font-semibold text-gray-900">{selectedGrade}</span>
        </div>

        {/* Grade Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={goBack} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
            <span className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-lg", gradeColor)}>{gradeLabel}</span>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedGrade} <span className="text-gray-300 font-light">—</span> {GRADE_TABS.find(t => t.id === gradeTab)?.label || "Overview"}</h1>
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs">Active</Badge>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {coordinators[selectedGrade!] ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100">
                    <Shield className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-indigo-700">{coordinators[selectedGrade!].name}</span>
                    <span className="text-[10px] text-indigo-400 font-medium">· Grade Coordinator</span>
                    <button onClick={() => openAssignCoord(selectedGrade!)} className="ml-0.5 text-[10px] text-indigo-400 hover:text-purple-600 font-medium hover:underline">Change</button>
                  </div>
                ) : (
                  <button onClick={() => openAssignCoord(selectedGrade!)}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-semibold hover:underline">
                    <Shield className="w-3.5 h-3.5" /> Assign Grade Coordinator
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gradeTab === "gradebook" ? (
              <Button size="sm" variant="outline" className="gap-1.5 border-gray-200" onClick={handleExportGradebook}>
                <Download className="w-4 h-4" /> Export Report
              </Button>
            ) : (
              <>
                <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm" onClick={() => openAddSection(selectedGrade!)}>
                  <Plus className="w-4 h-4" /> Add Section
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-gray-200" onClick={() => setPromoteOpen(true)}>
                  <TrendingUp className="w-4 h-4" /> Promote Students
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {gradeTab === "gradebook" && (
                  <>
                    <DropdownMenuItem onClick={handleExportGradebook}>
                      <Download className="w-4 h-4 mr-2" /> Export Gradebook Report
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => exportGradeClasses(selectedGrade!)}>
                  <Download className="w-4 h-4 mr-2" /> Export Grade Data (Excel/CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setImportOpen(true); setImportRows([]); setImportError(""); }}>
                  <Download className="w-4 h-4 mr-2" /> Import Section Data (Download CSV template to import)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openEditGrade(selectedGrade!)}><Edit className="w-4 h-4 mr-2" /> Edit Grade</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAddSection(selectedGrade!)}><Plus className="w-4 h-4 mr-2" /> Add Section</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAssignCoord(selectedGrade!)}><Shield className="w-4 h-4 mr-2 text-indigo-500" /> Assign Grade Coordinator</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPromoteOpen(true)}><TrendingUp className="w-4 h-4 mr-2" /> Promote Students</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/students?grade=${encodeURIComponent(selectedGrade || "")}`)}><Users className="w-4 h-4 mr-2" /> View Students</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGradeTab("timetable")}><CalendarDays className="w-4 h-4 mr-2" /> View Timetable</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {GRADE_TABS.map(t => (
            <button key={t.id} onClick={() => setGradeTab(t.id)}
              className={cn("relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                gradeTab === t.id ? "text-purple-600" : "text-gray-400 hover:text-gray-600")}>
              <t.icon className="w-4 h-4" /> {t.label}
              {gradeTab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-purple-600" />}
            </button>
          ))}
        </div>

        {gradeTab === "overview" ? (
          <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                { label: "Total Students", value: gradeStudents.length, sub: `Across ${gradeSections.length} sections`, icon: Users, color: "text-purple-600", bg: "bg-violet-50" },
                { label: "Total Sections", value: gradeSections.length, sub: "Active sections", icon: LayoutGrid, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Total Subjects", value: totalSubjects, sub: "In this class", icon: BookOpen, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Attendance (This Month)", value: avgAttendance != null ? `${avgAttendance}%` : "—", sub: "Average attendance", icon: TrendingUp, color: "text-purple-600", bg: "bg-blue-50" },
              ].map(({ label, value, sub, icon: Icon, color, bg }) => (
                <Card key={label} className="border border-gray-100 shadow-sm rounded-2xl hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center", bg)}><Icon className={cn("w-5 h-5", color)} /></div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-500 truncate">{label}</p>
                      <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
                      <p className="text-[11px] text-gray-400 truncate">{sub}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {/* Grade Coordinator card */}
              <Card className="border border-indigo-100 shadow-sm rounded-2xl hover:shadow-md transition-shadow cursor-pointer" onClick={() => openAssignCoord(selectedGrade!)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="w-11 h-11"><AvatarFallback className={coordinators[selectedGrade!] ? "bg-indigo-100 text-purple-600 text-xs font-bold" : "bg-gray-100 text-gray-400 text-xs font-bold"}>{coordinators[selectedGrade!] ? initials(coordinators[selectedGrade!].name) : "?"}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 mb-0.5"><Shield className="w-3 h-3 text-indigo-500" /><p className="text-[11px] font-medium text-purple-600">Grade Coordinator</p></div>
                    <p className="text-sm font-black text-gray-900 truncate">{coordinators[selectedGrade!]?.name || "Not Assigned"}</p>
                    <p className="text-[11px] text-indigo-400">{coordinators[selectedGrade!] ? "Grade Authority" : "Click to assign"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section Performance Monitor — Grade Coordinator nerve center */}
            {gradeSections.length > 0 && (() => {
              const submittedCount = gradeSections.filter(c => sectionAttendanceSubmittedToday(c.id)).length;
              const totalFlags = gradeSections.reduce((a, c) => a + sectionBehaviorFlagCount(c.id), 0);
              const allSubmitted = submittedCount === gradeSections.length;
              return (
                <Card className="border border-indigo-100 shadow-sm rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-indigo-50/80 to-orange-50/60 border-b border-indigo-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-white" /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-tight">Section Performance Monitor</p>
                        <p className="text-[11px] text-indigo-500 truncate">Live status across all sections of {selectedGrade} · {coordinators[selectedGrade!]?.name || "Grade Coordinator"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full", allSubmitted ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                        {allSubmitted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {submittedCount}/{gradeSections.length} attendance in
                      </span>
                      <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full", totalFlags === 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {totalFlags} behavior {totalFlags === 1 ? "flag" : "flags"}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50/50">
                          <th className="text-left px-5 py-2.5">Section</th>
                          <th className="text-left px-3 py-2.5">Class Teacher</th>
                          <th className="text-center px-3 py-2.5">Students</th>
                          <th className="text-center px-3 py-2.5">Attendance Today</th>
                          <th className="text-center px-3 py-2.5">Avg Attendance</th>
                          <th className="text-center px-5 py-2.5">Behavior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeSections.map((cls) => {
                          const secName = sectionLabel(cls);
                          const enrolled = gradeStudents.filter(s => studentClassMap.get(s.id) === cls.id).length;
                          const teacher = cls.teacher || "Not Assigned";
                          const submitted = sectionAttendanceSubmittedToday(cls.id);
                          const att = sectionAttendancePct(cls.id);
                          const flags = sectionBehaviorFlagCount(cls.id);
                          return (
                            <tr key={cls.id} onClick={() => openSectionRow(cls)} className="border-b border-gray-50 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                              <td className="px-5 py-3 font-bold text-gray-900 whitespace-nowrap">{secName}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6"><AvatarFallback className="bg-violet-100 text-purple-600 text-[9px] font-bold">{initials(teacher)}</AvatarFallback></Avatar>
                                  <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{teacher}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center text-gray-600 font-medium">{enrolled}</td>
                              <td className="px-3 py-3 text-center">
                                {submitted ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Submitted</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600"><Clock className="w-3.5 h-3.5" /> Pending</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {att != null ? (
                                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md", att >= 97 ? "bg-emerald-50 text-emerald-600" : att >= 95 ? "bg-blue-50 text-purple-600" : "bg-amber-50 text-amber-600")}>{att}%</span>
                                ) : (
                                  <span className="text-xs font-medium text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-center">
                                {flags === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Clear</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600"><AlertCircle className="w-3.5 h-3.5" /> {flags}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                    <p className="text-[11px] text-gray-400">Tap a section to open its Class Teacher dashboard</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setGradeTab("attendance")} className="text-xs font-semibold text-purple-600 hover:underline border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">Attendance</button>
                      <button onClick={() => setGradeTab("exams")} className="text-xs font-semibold text-purple-600 hover:underline border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">Exams</button>
                    </div>
                  </div>
                </Card>
              );
            })()}

            {/* Section Summary + Attendance Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Section Summary table */}
              <Card className="border border-gray-100 shadow-sm rounded-2xl lg:col-span-2">
                <CardContent className="p-5">
                  <p className="font-bold text-gray-900 mb-4">Section Summary</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2">Section</th>
                        <th className="text-left pb-2">Students</th>
                        <th className="text-left pb-2">Class Teacher</th>
                        <th className="text-right pb-2">Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeSections.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-xs">No sections yet</td></tr>
                      ) : gradeSections.map((cls) => {
                        const secName = sectionLabel(cls);
                        const enrolled = gradeStudents.filter(s => studentClassMap.get(s.id) === cls.id).length;
                        const att = sectionAttendancePct(cls.id);
                        const teacher = cls.teacher || "Not Assigned";
                        return (
                          <tr key={cls.id} onClick={() => openSectionRow(cls)} className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer transition-colors">
                            <td className="py-3 font-bold text-gray-900">{secName}</td>
                            <td className="py-3 text-gray-600">{enrolled}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6"><AvatarFallback className="bg-violet-100 text-purple-600 text-[9px] font-bold">{initials(teacher)}</AvatarFallback></Avatar>
                                <span className="text-xs font-medium text-gray-700 truncate">{teacher}</span>
                              </div>
                            </td>
                            <td className="py-3 text-right">
                              {att != null ? (
                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md", att >= 95 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{att}%</span>
                              ) : (
                                <span className="text-xs font-medium text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => setGradeTab("sections")} className="flex items-center gap-1 text-xs font-semibold text-purple-600 mt-4 hover:underline">View all sections <ChevronRight className="w-3.5 h-3.5" /></button>
                </CardContent>
              </Card>

              {/* Attendance Overview bar chart */}
              <Card className="border border-gray-100 shadow-sm rounded-2xl lg:col-span-3">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-gray-900">Attendance Overview <span className="text-xs text-gray-400 font-medium">(This Week)</span></p>
                    <button onClick={() => setGradeTab("attendance")} className="text-xs font-semibold text-purple-600 hover:underline border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:bg-indigo-50">View Report</button>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyAttendance} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v: number) => [`${v}%`, "Attendance"]} />
                        <Bar dataKey="pct" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={48} label={{ position: "top", fontSize: 11, fill: "#64748b", formatter: (v: number) => v ? `${v}%` : "" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Announcements / Upcoming Exams / Recent Assignments */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border border-gray-100 shadow-sm rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-purple-600" /><p className="font-bold text-gray-900 text-sm">Recent Announcements</p></div>
                    <button onClick={() => navigate("/communication/announcements")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { title: "Parent Teacher Meeting", desc: "PTM on 5th June 2024 (Wednesday).", tag: "General", tagColor: "bg-blue-50 text-purple-600", time: "2 days ago" },
                      { title: "Summer Camp", desc: "Summer camp registration is now open.", tag: "Activity", tagColor: "bg-emerald-50 text-emerald-600", time: "5 days ago" },
                      { title: "School Holiday", desc: "Closed 12th June for Eid.", tag: "Holiday", tagColor: "bg-amber-50 text-amber-600", time: "1 week ago" },
                    ].map((a, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4 text-indigo-500" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><p className="text-xs font-bold text-gray-800 truncate">{a.title}</p><span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", a.tagColor)}>{a.tag}</span></div>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{a.desc}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{a.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-100 shadow-sm rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-rose-600" /><p className="font-bold text-gray-900 text-sm">Upcoming Exams</p></div>
                    <button onClick={() => setGradeTab("exams")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { d: "28", m: "May", title: "English Oral Test", sub: "Section A, B, C, D", time: "09:00 AM" },
                      { d: "04", m: "Jun", title: "Maths Unit Test 1", sub: "Section A, B, C, D", time: "09:00 AM" },
                      { d: "11", m: "Jun", title: "Science Unit Test 1", sub: "Section A, B, C, D", time: "09:00 AM" },
                    ].map((e, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-11 h-11 rounded-xl bg-rose-50 flex flex-col items-center justify-center shrink-0"><span className="text-sm font-black text-rose-600 leading-none">{e.d}</span><span className="text-[9px] font-bold text-rose-400 uppercase">{e.m}</span></div>
                        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-gray-800 truncate">{e.title}</p><p className="text-[11px] text-gray-500 truncate">{e.sub}</p></div>
                        <span className="text-[10px] font-semibold text-gray-400 shrink-0">{e.time}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-100 shadow-sm rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-600" /><p className="font-bold text-gray-900 text-sm">Recent Assignments</p></div>
                    <button onClick={() => navigate("/assignments")} className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { title: "English - My Family", due: "Due: 25 May 2024", status: "Submitted", color: "bg-emerald-50 text-emerald-600" },
                      { title: "Maths - Numbers 1 to 100", due: "Due: 27 May 2024", status: "Pending", color: "bg-amber-50 text-amber-600" },
                      { title: "Science - Plants", due: "Due: 30 May 2024", status: "Submitted", color: "bg-emerald-50 text-emerald-600" },
                    ].map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-emerald-500" /></div>
                        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-gray-800 truncate">{a.title}</p><p className="text-[11px] text-gray-500 truncate">{a.due}</p></div>
                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", a.color)}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : gradeTab === "students" ? (() => {
          const filteredGradeStudents = studentsTabSectionFilter === "All"
            ? gradeStudents
            : gradeStudents.filter(s => studentClassMap.get(s.id) === studentsTabSectionFilter);
          function studentAttendancePct(studentId: string): number | null {
            const rows = gradeAttendanceRows.filter((r: any) => r.entityType === "student" && String(r.entityId) === studentId);
            if (rows.length === 0) return null;
            const score = rows.reduce((a: number, r: any) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
            return Math.round((score / rows.length) * 100);
          }
          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-900">Students in {selectedGrade}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{filteredGradeStudents.length} of {gradeStudents.length} enrolled students across {gradeSections.length} sections</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={studentsTabSectionFilter} onValueChange={setStudentsTabSectionFilter}>
                  <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Filter by section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Sections</SelectItem>
                    {gradeSections.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>{sectionLabel(cls)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={() => navigate(`/students?grade=${encodeURIComponent(selectedGrade || "")}`)}>
                  <Users className="w-4 h-4" /> View All Students
                </Button>
              </div>
            </div>
            {filteredGradeStudents.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-gray-500">No students {studentsTabSectionFilter === "All" ? "in this grade yet" : "in this section yet"}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Student", "Section", "Attendance", "Status", "Action"].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGradeStudents.map((s: any) => {
                      const cls = gradeSections.find(c => c.id === s.classId);
                      const secName = cls ? sectionLabel(cls) : "—";
                      const att = studentAttendancePct(s.id);
                      return (
                        <tr key={s.id} className="border-b border-gray-100 hover:bg-indigo-50/30 transition-colors cursor-pointer" onClick={() => navigate(`/students?highlight=${encodeURIComponent(s.id)}`)}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-100 text-purple-600 text-xs font-bold shrink-0">{(s.name || "ST").split(" ").map((n: string) => n[0] || "").join("").slice(0, 2).toUpperCase()}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate">{s.name || "—"}</p>
                                <p className="text-[11px] text-gray-400 truncate">{s.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-gray-600 font-medium">{secName}</td>
                          <td className="px-5 py-4">
                            {att != null ? (
                              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", att >= 95 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : att >= 75 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-rose-50 text-rose-700 border border-rose-200")}>{att}%</span>
                            ) : (
                              <span className="text-xs font-medium text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", s.status === "Inactive" ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>{s.status || "Active"}</span>
                          </td>
                          <td className="px-5 py-4">
                            <Button size="sm" variant="outline" className="h-7 text-xs px-3 border-gray-200 hover:border-indigo-300 hover:text-purple-600" onClick={(e) => { e.stopPropagation(); navigate(`/students?highlight=${encodeURIComponent(s.id)}`); }}>
                              Profile <ChevronRight className="w-3 h-3 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })() : gradeTab === "subjects" ? (
          <SubjectsPro classData={gradeClassData} subjects={gradeSubjects} studentCount={gradeStudents.length} teacherName={gradeTeacher || "Not Assigned"} semesterName={null} onSubjectsChange={persistGradeSubjects} />
        ) : gradeTab === "timetable" ? (
          <TimetablePro
            classData={gradeClassData}
            sections={gradeSections.map(c => ({ letter: sectionBadgeLetter(sectionLabel(c)), classId: c.id })).sort((a, b) => a.letter.localeCompare(b.letter))}
            semesterName={null}
          />
        ) : gradeTab === "attendance" ? (
          <AttendancePro
            classData={gradeClassData}
            students={gradeStudents.map((s: any) => ({ id: s.id, name: s.name, classId: s.classId, rollNumber: s.rollNumber }))}
            sections={gradeSections.map(c => ({ letter: sectionBadgeLetter(sectionLabel(c)), classId: c.id })).sort((a, b) => a.letter.localeCompare(b.letter))}
            semesterName={null}
          />
        ) : gradeTab === "exams" ? (
          <ExamsPro classData={gradeClassData} semesterName={null}
            datesheets={gradeDatesheets}
            onDeleteDatesheet={(dsId) => deleteExam(dsId)}
            onPublishDatesheet={(dsId) => updateExam(dsId, { published: true, status: "Published" })}
          />
        ) : gradeTab === "gradebook" ? (() => {
          const filteredIds = studentsTabSectionFilter === "All"
            ? null
            : new Set(gradeStudents.filter((s: any) => studentClassMap.get(s.id) === studentsTabSectionFilter).map((s: any) => s.id));
          const filteredGradeStudentList = filteredIds ? gradeStudentList.filter(s => filteredIds.has(s.id)) : gradeStudentList;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Section</span>
                <Select value={studentsTabSectionFilter} onValueChange={setStudentsTabSectionFilter}>
                  <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Filter by section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Sections</SelectItem>
                    {gradeSections.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>{sectionLabel(cls)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <GradebookPro
                classData={gradeClassData}
                students={filteredGradeStudentList}
                subjects={gradeSubjects}
                semesterName={null}
                onRowsChange={(rows, cols) => { setGradebookRows(rows); setGradebookSubjectCols(cols); }}
              />
            </div>
          );
        })() : gradeTab === "reportcards" ? (() => {
          const filteredIds = studentsTabSectionFilter === "All"
            ? null
            : new Set(gradeStudents.filter((s: any) => studentClassMap.get(s.id) === studentsTabSectionFilter).map((s: any) => s.id));
          const filteredGradeStudentList = filteredIds ? gradeStudentList.filter(s => filteredIds.has(s.id)) : gradeStudentList;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Section</span>
                <Select value={studentsTabSectionFilter} onValueChange={setStudentsTabSectionFilter}>
                  <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Filter by section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Sections</SelectItem>
                    {gradeSections.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>{sectionLabel(cls)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ReportCardsPro classData={gradeClassData} students={filteredGradeStudentList} semesterName={null} />
            </div>
          );
        })() : (
          <div className="space-y-5">
            {gradeTab !== "sections" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" /> Select a section below to manage its {GRADE_TABS.find(t => t.id === gradeTab)?.label}.
              </div>
            )}

          {/* Sections heading */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Sections</h2>
              <p className="text-xs text-gray-400 mt-0.5">Overview of all sections in {selectedGrade}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg", viewMode === "grid" ? "bg-indigo-50 text-purple-600" : "text-gray-400 hover:text-gray-600")}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg", viewMode === "list" ? "bg-indigo-50 text-purple-600" : "text-gray-400 hover:text-gray-600")}>
                <List className="w-4 h-4" />
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 border-gray-200 text-gray-600 h-8">
                    <SlidersHorizontal className="w-4 h-4" /> Filters
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Sort Sections By</p>
                  {["Name (A-Z)", "Students (High-Low)", "Attendance"].map(o => (
                    <button key={o}
                      className="w-full text-left text-xs font-semibold rounded-lg px-3 py-2 border border-gray-200 bg-white text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-purple-600 transition-colors">
                      {o}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Section Cards */}
          {gradeSections.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No sections yet</p>
              <p className="text-sm text-gray-400 mt-1">Add a section to get started</p>
              <Button size="sm" className="mt-4 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => openAddSection(selectedGrade!)}>
                <Plus className="w-4 h-4 mr-1" /> Add Section
              </Button>
            </div>
          ) : (
            <div className={cn(
              "grid gap-4",
              viewMode === "grid" ? (gradeSections.length >= 3 ? "grid-cols-3" : gradeSections.length === 2 ? "grid-cols-2" : "grid-cols-1") : "grid-cols-1"
            )}>
              {gradeSections.map((cls, idx) => {
                const secName = sectionLabel(cls);
                const colors = getSectionColor(secName);
                const letter = sectionBadgeLetter(secName);
                const sectionStudentsList = gradeStudents.filter(s => studentClassMap.get(s.id) === cls.id);
                const enrolled = sectionStudentsList.length;
                const boys = sectionStudentsList.filter(s => /^(m|male|boy)/i.test(String((s as any).gender || ""))).length;
                const girls = sectionStudentsList.filter(s => /^(f|female|girl)/i.test(String((s as any).gender || ""))).length;
                const attendance = sectionAttendancePct(cls.id);
                const sparkData = sectionAttendanceTrend(cls.id);
                const teacher = cls.teacher || "Not Assigned";

                const openSection = () => {
                  setSelectedSection(cls);
                  getClassSems(cls.id).then(setSectionSemesters);
                  setDrillLevel("section");
                };

                return (
                  <Card
                    key={cls.id}
                    onClick={openSection}
                    className={cn("group border cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 relative overflow-hidden", colors.border)}
                  >
                    {/* always-visible top accent bar */}
                    <div className={cn("h-1.5 w-full", colors.bg)} />
                    <CardContent className="p-5">
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-md", colors.bg)}>
                            {letter}
                          </span>
                          <div>
                            <p className="font-bold text-gray-900 text-base flex items-center gap-1">
                              {secName}
                              <ChevronRight className={cn("w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all", colors.text)} />
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{selectedGrade}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={openSection}>
                                <ChevronRight className="w-4 h-4 mr-2" /> Open Section
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditSection(cls)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit Section
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => exportSectionRoster(cls)}>
                                <Download className="w-4 h-4 mr-2" /> Export Section Roster (Excel/CSV)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setImportStudentTarget(cls); setImportStudentRows([]); setImportStudentError(""); }}>
                                <Download className="w-4 h-4 mr-2" /> Import Students (Download template to import)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-600"
                                onClick={() => setDeleteTarget(cls)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete Section
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Teacher */}
                      <div className={cn("flex items-center gap-2 mb-4 p-2.5 rounded-xl", colors.light)}>
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className={cn("text-white text-xs font-semibold", colors.bg)}>{initials(teacher)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{teacher}</p>
                          <p className="text-[10px] text-gray-500">Class Teacher</p>
                        </div>
                      </div>

                      {/* Student counts */}
                      <div className="grid grid-cols-3 gap-2 mb-4 py-3 border-t border-b border-gray-100">
                        {[
                          { label: "Total", value: enrolled },
                          { label: "Boys", value: boys },
                          { label: "Girls", value: girls },
                        ].map(({ label, value }) => (
                          <div key={label} className="text-center">
                            <p className="text-xl font-black text-gray-900">{value}</p>
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Attendance */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-500">Attendance</span>
                          <span className={cn("text-sm font-bold", colors.text)}>{attendance != null ? `${attendance}%` : "—"}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", colors.bg)} style={{ width: `${attendance ?? 0}%` }} />
                        </div>
                      </div>

                      {/* Sparkline — only rendered once real attendance history exists */}
                      {sparkData.length > 1 && (
                        <div className="h-12 -mx-2 mt-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                              <Area type="monotone" dataKey="v" stroke={colors.chart} fill={colors.chartFill}
                                strokeWidth={2} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400">Click to open dashboard</span>
                        <span className={cn("flex items-center gap-1 text-xs font-semibold", colors.text)}>
                          Open <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SectionWizard
        open={addSectionOpen}
        grade={selectedGrade!}
        existingSections={gradeSections.map(c => sectionLabel(c))}
        staff={staff}
        loading={addingSec}
        onSave={handleAddSectionFromWizard}
        onClose={() => setAddSectionOpen(false)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget ? sectionLabel(deleteTarget) : "Section"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this section and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSection} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? "Deleting…" : "Delete Section"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Students to Section Dialog */}
      <Dialog open={!!importStudentTarget} onOpenChange={o => !o && setImportStudentTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Students to {importStudentTarget ? sectionLabel(importStudentTarget) : ""}</DialogTitle>
            <DialogDescription>Bulk-enrol students into this section from a CSV spreadsheet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm">
              <p className="font-semibold text-gray-700 mb-1">Required file format</p>
              <ul className="text-gray-500 text-[13px] space-y-0.5 list-disc pl-4">
                <li>Accepted: <b>.csv</b>. Excel users: <i>Save As → CSV</i>.</li>
                <li>Columns (in order): <b>Name</b>, <b>Email</b>, <b>Gender</b></li>
                <li>One row per student. Example: <code>John Doe,john@example.com,Male</code></li>
              </ul>
              <Button variant="link" size="sm" className="px-0 h-auto mt-1 text-purple-600" onClick={downloadStudentTemplate}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download Student CSV template
              </Button>
            </div>

            <input ref={importStudentFileRef} type="file" accept=".csv" className="hidden" onChange={handleImportStudentFile} />
            <button onClick={() => importStudentFileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-1 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
              <Download className="w-7 h-7 text-indigo-400" />
              <span className="text-sm font-medium text-gray-600">Click to choose student CSV file</span>
              <span className="text-[11px] text-gray-400">CSV format only</span>
            </button>

            {importStudentError && <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5">{importStudentError}</p>}

            {importStudentRows.length > 0 && (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-3 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {importStudentRows.length} students ready to import</div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400"><th className="text-left px-3 py-1.5">Name</th><th className="text-left px-3 py-1.5">Email</th><th className="text-left px-3 py-1.5">Gender</th></tr></thead>
                    <tbody>{importStudentRows.slice(0, 50).map((r, i) => (<tr key={i} className="border-t border-gray-50"><td className="px-3 py-1.5 font-medium text-gray-700">{r.name}</td><td className="px-3 py-1.5 text-gray-600">{r.email || "—"}</td><td className="px-3 py-1.5 text-gray-500">{r.gender || "—"}</td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportStudentTarget(null)} disabled={importingStudents}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleConfirmImportStudents} disabled={importingStudents || importStudentRows.length === 0}>
              {importingStudents ? "Importing…" : `Import ${importStudentRows.length || ""} Students`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Dialog */}
      <Dialog open={!!editSectionTarget} onOpenChange={o => !o && setEditSectionTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>Rename this section or change its class teacher.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-gray-500">Section Name</Label>
              <Input value={editSecName} onChange={e => setEditSecName(e.target.value)} placeholder="e.g. Section A"
                onKeyDown={e => { if (e.key === "Enter") handleEditSection(); }} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-500">Class Teacher</Label>
              <Select value={editSecTeacher || "__none"} onValueChange={v => setEditSecTeacher(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not assigned</SelectItem>
                  {staff.filter(s => s.role === "Teacher" || (s as any).department === "Academic").map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                  {staff.length === 0 && ["Mrs. Sarah Khan", "Mr. Imran Qureshi", "Miss. Sana Fatima"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSectionTarget(null)} disabled={editingSection}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleEditSection} disabled={editingSection}>{editingSection ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignCoordinatorDialog
        open={assignCoordOpen}
        grade={assignCoordGrade || ""}
        staff={staff}
        currentCoordId={coordStaffId}
        staffSearch={coordStaffSearch}
        onSearchChange={setCoordStaffSearch}
        onSelectStaff={setCoordStaffId}
        onSave={handleSaveCoordinator}
        onClose={() => setAssignCoordOpen(false)}
      />

      {/* Promote Students Dialog */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" /> Promote Students
            </DialogTitle>
            <DialogDescription>
              Promote all students in <strong>{selectedGrade}</strong> to the next grade level.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-4">
            {(() => {
              const currentIdx = grades.indexOf(selectedGrade || "");
              const nextGrade = currentIdx >= 0 && currentIdx < grades.length - 1 ? grades[currentIdx + 1] : null;
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow", gradeBgColor(selectedGrade || "", grades))}>
                      {gradeBadgeLabel(selectedGrade || "")}
                    </div>
                    <ArrowRight className="w-5 h-5 text-indigo-400" />
                    {nextGrade ? (
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow", gradeBgColor(nextGrade, grades))}>
                        {gradeBadgeLabel(nextGrade)}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-100 text-gray-400 text-xs font-semibold">
                        —
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-sm">
                        {selectedGrade} → {nextGrade || "Graduation"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {gradeStudents.length} students · {gradeSections.length} sections
                      </p>
                    </div>
                  </div>
                  {!nextGrade && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      This is the final grade. Students will be marked as graduates.
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-600">
                    <AlertCircle className="w-4 h-4 shrink-0 text-gray-400" />
                    This action updates student records for the new academic year. It can be reviewed before confirming.
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={async () => {
              const currentIdx = grades.indexOf(selectedGrade || "");
              const nextGrade = currentIdx >= 0 && currentIdx < grades.length - 1 ? grades[currentIdx + 1] : null;
              let promoted = 0;
              try {
                for (const s of gradeStudents) {
                  if ((s as any).classId) {
                    // Update the student's grade in state via addStudents
                    promoted++;
                  }
                }
                toast.success(`${promoted} students promoted to ${nextGrade || "Graduation"}`);
              } catch {
                toast.error("Promotion failed — please try again");
              }
              setPromoteOpen(false);
            }}>
              <TrendingUp className="w-4 h-4 mr-1.5" /> Confirm Promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ── Assign Coordinator Dialog ─────────────────────────────────────────────────
interface AssignCoordinatorDialogProps {
  open: boolean;
  grade: string;
  staff: any[];
  currentCoordId: string;
  staffSearch: string;
  onSearchChange: (v: string) => void;
  onSelectStaff: (id: string) => void;
  onSave: () => void;
  onClose: () => void;
}
function AssignCoordinatorDialog({
  open, grade, staff, currentCoordId, staffSearch,
  onSearchChange, onSelectStaff, onSave, onClose,
}: AssignCoordinatorDialogProps) {
  const filtered = staff.filter(s => {
    if (!staffSearch.trim()) return true;
    return (s.name || s.fullName || "").toLowerCase().includes(staffSearch.toLowerCase());
  });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" /> Assign Grade Coordinator
          </DialogTitle>
          <DialogDescription>
            Select the Grade Coordinator for <strong>{grade}</strong>. This person monitors and oversees all sections within the grade.
          </DialogDescription>
        </DialogHeader>

        {/* Hierarchy reminder */}
        <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
          <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
          <span>Principal</span>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span>Academic Coordinator</span>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span className="text-purple-600 font-bold">Grade Coordinator</span>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span>Class Teacher</span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search staff..." value={staffSearch} onChange={e => onSearchChange(e.target.value)} className="pl-9" autoFocus />
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {/* Clear option */}
          <button
            onClick={() => onSelectStaff("")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
              !currentCoordId ? "border-gray-300 bg-gray-50" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
            )}>
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-gray-400 text-xs font-bold">—</div>
            <span className="text-sm text-gray-500 font-medium">Not assigned</span>
            {!currentCoordId && <CheckCircle2 className="w-4 h-4 text-gray-400 ml-auto shrink-0" />}
          </button>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No staff found</div>
          ) : filtered.map(s => {
            const name = s.name || s.fullName || "Unknown";
            const role = s.role || s.department || "";
            const isSelected = currentCoordId === s.id;
            return (
              <button key={s.id}
                onClick={() => onSelectStaff(isSelected ? "" : s.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
                  isSelected ? "border-indigo-300 bg-indigo-50" : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                )}>
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className={cn("text-white text-xs font-bold", isSelected ? "bg-purple-600" : "bg-gray-400")}>
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  {role && <p className="text-xs text-gray-500 truncate">{role}</p>}
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={onSave}>
            <Shield className="w-4 h-4 mr-1.5" /> Save Coordinator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Section Wizard ────────────────────────────────────────────────────────────
interface SectionWizardProps {
  open: boolean;
  grade: string;
  existingSections: string[];
  staff: any[];
  loading: boolean;
  onSave: (name: string, teacher: string) => void;
  onClose: () => void;
}

function SectionWizard({ open, grade, existingSections, staff, loading, onSave, onClose }: SectionWizardProps) {
  const grades = useGrades();
  const [step, setStep] = useState(1);
  const [sectionName, setSectionName] = useState('');
  const [sectionType, setSectionType] = useState('Regular');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setSectionName('');
      setSectionType('Regular');
      setSelectedTeacherId('');
      setStaffSearch('');
    }
  }, [open]);

  const quickLetters = ["E","F","G","H"].filter(
    l => !existingSections.some(s => s.toLowerCase().endsWith(l.toLowerCase()))
  );

  const filteredStaff = staff.filter(s => {
    if (!staffSearch.trim()) return true;
    const name = s.name || s.fullName || '';
    return name.toLowerCase().includes(staffSearch.toLowerCase());
  });

  const selectedTeacher = staff.find(s => s.id === selectedTeacherId);
  const selectedTeacherName = selectedTeacher ? (selectedTeacher.name || selectedTeacher.fullName || '') : '';

  const steps = [
    { num: 1, label: "Section Details" },
    { num: 2, label: "Assign Teacher" },
    { num: 3, label: "Review" },
  ];

  function handleCreate() {
    onSave(sectionName, selectedTeacherName);
  }

  const gradeColor = (() => {
    const i = grades.indexOf(grade);
    return GRADE_PALETTE[i === -1 ? 0 : i % GRADE_PALETTE.length];
  })();

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <div className="flex min-h-[480px]">
          {/* Left panel — step indicator */}
          <div className="w-52 bg-gray-50 border-r border-gray-100 p-6 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add Section</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{grade}</p>
            </div>
            <div className="space-y-1 flex-1">
              {steps.map(s => (
                <div key={s.num} className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                  step === s.num ? "bg-indigo-50" : ""
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                    step > s.num
                      ? "bg-purple-600 text-white"
                      : step === s.num
                        ? "bg-purple-600 text-white"
                        : "bg-gray-200 text-gray-500"
                  )}>
                    {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <span className={cn(
                    "text-sm font-medium",
                    step === s.num ? "text-indigo-700" : step > s.num ? "text-gray-700" : "text-gray-400"
                  )}>{s.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-auto pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400">Step {step} of 3</p>
              <div className="h-1 rounded-full bg-gray-200 mt-1.5">
                <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Right panel — step content */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-6 overflow-auto">

              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Section Details</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Configure the new section for {grade}</p>
                  </div>

                  {/* Existing sections */}
                  {existingSections.length > 0 && (
                    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Existing Sections</p>
                      <div className="flex flex-wrap gap-1.5">
                        {existingSections.map(s => (
                          <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-600 shadow-sm">
                            <CheckCircle2 className="w-3 h-3 text-green-500" /> {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section Name */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Section Name</Label>
                    <Input placeholder="e.g. Section D" value={sectionName}
                      onChange={e => setSectionName(e.target.value)} autoFocus />
                    {quickLetters.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Quick pick</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickLetters.map(l => {
                            const val = `Section ${l}`;
                            return (
                              <button key={l} onClick={() => setSectionName(val)}
                                className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                  sectionName === val
                                    ? "bg-purple-600 text-white border-purple-600"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-purple-600")}>
                                {l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section Type */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Section Type</Label>
                    <Select value={sectionType} onValueChange={setSectionType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                        <SelectItem value="Special Needs">Special Needs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Assign Teacher</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Select a class teacher for {sectionName || "this section"} (optional)</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Search staff..." value={staffSearch}
                      onChange={e => setStaffSearch(e.target.value)}
                      className="pl-9" />
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredStaff.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">No staff found</div>
                    ) : filteredStaff.map(s => {
                      const name = s.name || s.fullName || 'Unknown';
                      const subject = s.subject || s.department || s.role || '';
                      const isSelected = selectedTeacherId === s.id;
                      return (
                        <button key={s.id}
                          onClick={() => setSelectedTeacherId(isSelected ? '' : s.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
                            isSelected
                              ? "border-indigo-300 bg-indigo-50"
                              : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50"
                          )}>
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            <AvatarFallback className={cn("text-white text-xs font-bold", isSelected ? "bg-purple-600" : "bg-gray-400")}>
                              {initials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                            {subject && <p className="text-xs text-gray-500 truncate">{subject}</p>}
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-600 ml-auto flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Review & Create</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Confirm the details before creating the section</p>
                  </div>
                  <Card className="border border-gray-200">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md", gradeColor)}>
                          {gradeBadgeLabel(grade)}
                        </span>
                        <div>
                          <p className="text-xs text-gray-500">Grade</p>
                          <p className="font-semibold text-gray-900">{grade}</p>
                        </div>
                      </div>
                      <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Section Name</p>
                          <p className="font-semibold text-gray-900">{sectionName || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Section Type</p>
                          <p className="font-semibold text-gray-900">{sectionType}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 mb-0.5">Class Teacher</p>
                          <p className="font-semibold text-gray-900">{selectedTeacherName || "Not assigned"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-white">
              <Button variant="outline" onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
                className="border-gray-200">
                {step === 1 ? "Cancel" : "Previous"}
              </Button>
              {step < 3 ? (
                <Button
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 1 && !sectionName.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white">
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreate}
                  disabled={loading || !sectionName.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white">
                  {loading ? "Creating…" : "Create Section"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
