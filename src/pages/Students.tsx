import { useState, useEffect } from "react";
// Students management page
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, Filter, UserPlus, Upload, Download, MoreVertical,
  GraduationCap, Eye, Edit as EditIcon, Trash2,
  Sparkles, X, Users as UsersIcon, CheckCircle,
  AlertCircle as AlertIcon, ArrowUpCircle, MessageSquare,
  LayoutGrid, List, Brain, Phone, Calendar, Mail, 
  CreditCard, TrendingUp, TrendingDown, Activity, 
  ArrowRight, Shield, ShieldAlert, Zap,
  MoreHorizontal,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { BulkUploadDialog } from "@/components/students/BulkUploadDialog";
import { StudentDetailsDialog } from "@/components/students/StudentDetailsDialog";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { DeleteStudentDialog } from "@/components/students/DeleteStudentDialog";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/hooks/useClasses";
import { useGrades } from "@/contexts/CurriculumContext";
import { smartDb } from "@/lib/localDb";
import { studentGrade, studentSection, canonGrade, canonSection } from "@/lib/studentGradeSection";
import { Student } from "@/types";
import { cn, getInitials } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { userRepository } from "@/repositories/UserRepository";

const MotionTableRow = motion.create(TableRow);
const MotionCard = motion.create(Card);

type ViewMode = "table" | "card" | "smart";
type SmartFilter = "all" | "at-risk" | "pending-fees" | "low-attendance" | "ai-priority";

const getNextGrade = (current: string): string | null => {
  if (!current) return null;
  const prefixDashMatch = current.match(/^(Grade|Year)\s+(\d+)\s*-\s*([A-Za-z]+)$/i);
  if (prefixDashMatch) {
    return `${prefixDashMatch[1]} ${parseInt(prefixDashMatch[2]) + 1}-${prefixDashMatch[3]}`;
  }
  const prefixNoDashMatch = current.match(/^(Grade|Year)\s+(\d+)\s*([A-Za-z]+)$/i);
  if (prefixNoDashMatch) {
    return `${prefixNoDashMatch[1]} ${parseInt(prefixNoDashMatch[2]) + 1}${prefixNoDashMatch[3]}`;
  }
  const numericDashMatch = current.match(/^(\d+)\s*-\s*([A-Za-z]+)$/);
  if (numericDashMatch) {
    return `${parseInt(numericDashMatch[1]) + 1}-${numericDashMatch[2]}`;
  }
  const numericNoDashMatch = current.match(/^(\d+)([A-Za-z]+)$/);
  if (numericNoDashMatch) {
    return `${parseInt(numericNoDashMatch[1]) + 1}${numericNoDashMatch[2]}`;
  }
  const kgDashMatch = current.match(/^(KG|Kindergarten)\s*-\s*([A-Za-z]+)$/i);
  if (kgDashMatch) {
    return `Grade 1-${kgDashMatch[2]}`;
  }
  const kgNoDashMatch = current.match(/^(KG|Kindergarten)\s*([A-Za-z]+)$/i);
  if (kgNoDashMatch) {
    return `Grade 1${kgNoDashMatch[2]}`;
  }
  return null;
};

const Students = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const { students, addStudents, updateStudent, deleteStudent, loading } = useStudents();
  useClasses(); // keep context alive for class data
  const curriculumGrades = useGrades(); // strict grade list for the active curriculum (e.g. Qatar: Pre-KG…Grade 12)
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkPromoteOpen, setIsBulkPromoteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Grade/section resolution (with classId fallback) and canonicalization
  // now live in src/lib/studentGradeSection.ts — shared with every other
  // page that rosters students by grade+section (Teacher Marks Entry,
  // useTeacherClass) so a format quirk in one record can't silently drop
  // that student from only SOME of those pages while this one still counts
  // them correctly.
  const getSection = studentSection;
  const getGrade = studentGrade;

  // Auto-switch to card view on mobile
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) setViewMode("card");
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const studentId = searchParams.get("id");
    if (studentId && students.length > 0) {
      const student = students.find(s => s.id === studentId);
      if (student) {
        setSelectedStudent(student);
        setIsDetailsOpen(true);
      } else if (studentId === "STU001") {
        addStudents([{
          id: "STU001",
          name: "John Doe",
          classId: "Grade 10-A",
          status: "Active",
          email: "john.doe@example.com"
        }]);
        toast.success("Added sample student STU001 for demonstration.");
      }
    }
  }, [searchParams, students, addStudents]);

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student);
    setIsDetailsOpen(true);
    setSearchParams({ id: student.id });
  };

  const handleCloseDetails = (open: boolean) => {
    setIsDetailsOpen(open);
    if (!open) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("id");
      setSearchParams(newParams);
    }
  };

  const filteredStudents = students.filter(student => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = (
      (student.name?.toLowerCase() || "").includes(search) ||
      (student.id?.toLowerCase() || "").includes(search) ||
      (student.email?.toLowerCase() || "").includes(search) ||
      (student.classId?.toLowerCase() || "").includes(search)
    );

    const matchesStatus = statusFilter === "all" || student.status === statusFilter;
    const matchesGrade = gradeFilter === "all" || canonGrade(getGrade(student)) === canonGrade(gradeFilter);
    const matchesSection = sectionFilter === "all" || canonSection(getSection(student)) === canonSection(sectionFilter);
    const matchesClass = matchesGrade && matchesSection;

    // Smart Filters
    let matchesSmart = true;
    if (smartFilter === "at-risk") matchesSmart = (student.riskScore || 0) >= 75 || (student.attendance != null && student.attendance < 75);
    if (smartFilter === "pending-fees") matchesSmart = student.feeStatus === "Pending" || student.feeStatus === "Overdue" || !student.feeStatus;
    if (smartFilter === "low-attendance") matchesSmart = (student.attendance || 100) < 75;
    if (smartFilter === "ai-priority") matchesSmart = (student.riskScore || 0) > 40 || (student.attendance || 100) < 80;

    return matchesSearch && matchesStatus && matchesClass && matchesSmart;
  });

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, gradeFilter, sectionFilter, smartFilter]);

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.id));
    }
  };

  const toggleSelectStudent = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedStudents.length} students? Their login credentials will also be removed.`)) {
      try {
        // Fetch all users once, then cascade-delete credentials for each removed student
        const allUsers: any[] = await userRepository.getAll().catch(() => []);

        await Promise.all(selectedStudents.map(async id => {
          const stu = students.find(s => s.id === id);
          await deleteStudent(id);
          if (stu?.email) {
            const studentEmail = stu.email.toLowerCase();
            const parentEmail = `parent.${studentEmail}`;
            const toDelete = allUsers.filter(u => {
              const ue = (u.email || u.data?.email || "").toLowerCase();
              return ue === studentEmail || ue === parentEmail;
            });
            await Promise.all(
              toDelete.map(u => userRepository.delete(u.id).catch(() => {}))
            );
          }
        }));
        toast.success(`Deleted ${selectedStudents.length} students`);
        setSelectedStudents([]);
      } catch (error) {
        toast.error("Failed to delete some students");
      }
    }
  };

  const handleBulkPromote = async () => {
    const studentsToPromote = students.filter(s => selectedStudents.includes(s.id));
    let promotedCount = 0;
    
    try {
      await Promise.all(studentsToPromote.map(student => {
        const nextGrade = getNextGrade(student.classId);
        if (nextGrade) {
          promotedCount++;
          return updateStudent(student.id, { classId: nextGrade });
        }
        return Promise.resolve();
      }));
      
      if (promotedCount > 0) {
        toast.success(`Promoted ${promotedCount} students`);
        setSelectedStudents([]);
      } else {
        toast.error("No students could be automatically promoted (unrecognized grade format)");
      }
    } catch (error) {
      toast.error("Failed to promote some students");
    }
  };

  // Grade options come strictly from the active curriculum (single source of
  // truth) — in curriculum order, with canonical "Grade N" labels — so the
  // dropdown never shows the raw, inconsistent stored values ("1" vs "Grade 1").
  const availableGrades = curriculumGrades;

  // Sections shown are scoped to the selected grade (via canonGrade) so the two
  // filters compose correctly instead of listing every section school-wide.
  const availableSections = Array.from(new Set(
    students
      .filter(s => gradeFilter === "all" || canonGrade(getGrade(s)) === canonGrade(gradeFilter))
      .map(s => canonSection(getSection(s)))
      .filter(s => s && s !== "—")
  )).sort();

  // Today's real attendance rows (entityType "student") — powers "Active Today".
  const [presentToday, setPresentToday] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = (await smartDb.getAll("attendance")) as { entityType?: string; date?: string; status?: string }[];
        if (!active) return;
        const today = new Date().toISOString().slice(0, 10);
        const todays = rows.filter(r => r.entityType === "student" && String(r.date) === today);
        // No rows marked yet today → null, rendered as "—".
        setPresentToday(todays.length === 0 ? null : todays.filter(r => r.status === "Present" || r.status === "Late").length);
      } catch { /* keep previous value */ }
    };
    load();
    window.addEventListener("attendance-updated", load);
    return () => { active = false; window.removeEventListener("attendance-updated", load); };
  }, []);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const stats = {
    total: students.length,
    activeToday: presentToday,
    new: students.filter(s => {
      const raw = (s as { admissionDate?: string }).admissionDate || (typeof s.createdAt === 'string' ? s.createdAt : "");
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d.getTime()) && d > thirtyDaysAgo;
    }).length,
    atRisk: students.filter(s => (s.riskScore || 0) >= 75 || (s.attendance != null && s.attendance < 75)).length,
  };

  // Real insight: which grade has the most students under 75% attendance.
  const lowAttendanceStudents = students.filter(s => s.attendance != null && s.attendance < 75);
  const worstGrade = (() => {
    if (lowAttendanceStudents.length === 0) return null;
    const byGrade = new Map<string, number>();
    lowAttendanceStudents.forEach(s => {
      const g = getGrade(s) || "Unassigned";
      byGrade.set(g, (byGrade.get(g) || 0) + 1);
    });
    return [...byGrade.entries()].sort((a, b) => b[1] - a[1])[0];
  })();

  const handleAddStudent = () => {
    setIsAddStudentOpen(true);
  };

  const handleBulkUploadSuccess = (newStudents: Omit<Student, "id" | "uid" | "createdAt">[]) => {
    addStudents(newStudents);
  };

  const handleCleanupCredentials = async () => {
    if (!confirm("This will remove duplicate student records (same name) and their login credentials. Only one record per unique student name will be kept. This cannot be undone — continue?")) return;
    try {
      const res = await fetch("/api/admin/cleanup-student-credentials", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const { studentsDeleted = 0, usersDeleted = 0 } = data;
        if (studentsDeleted === 0 && usersDeleted === 0) {
          toast.success("No duplicates found — directory is already clean.");
        } else {
          toast.success(`Cleaned up ${studentsDeleted} duplicate student${studentsDeleted !== 1 ? "s" : ""} and ${usersDeleted} credential${usersDeleted !== 1 ? "s" : ""}`, {
            description: "Page will refresh to show updated directory.",
            duration: 5000,
          });
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        toast.error("Cleanup failed: " + (data.error || "Unknown error"));
      }
    } catch {
      toast.error("Failed to reach server");
    }
  };

  const handleDeleteStudent = (student: Student) => {
    setSelectedStudent(student);
    setIsDeleteOpen(true);
  };

  const handlePromoteStudent = async (student: Student) => {
    const nextGrade = getNextGrade(student.classId);
    
    if (nextGrade) {
      try {
        await updateStudent(student.id, { classId: nextGrade });
        toast.success(`${student.name} promoted to ${nextGrade}`);
      } catch (error) {
        toast.error(`Failed to promote ${student.name}`);
      }
    } else {
      toast.info(`Manual promotion required for ${student.name}'s current grade format.`);
    }
  };

  const handleContactStudent = (student: Student) => {
    window.location.href = `mailto:${student.email}?subject=Message from School Administration`;
    toast.success(`Opening email client for ${student.name}`);
  };

  const handleExportCSV = () => {
    if (filteredStudents.length === 0) {
      toast.error("No data to export");
      return;
    }

    const csv = Papa.unparse(filteredStudents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `students_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Exported ${filteredStudents.length} student records.`);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        <motion.div 
          variants={itemVariants}
          className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                Student Directory
                <Badge variant="outline" className="h-6 rounded-lg text-[10px] font-black border-slate-200 text-slate-400 uppercase tracking-widest">
                  Central Database
                </Badge>
              </h1>
              <p className="text-sm text-slate-400">Manage, monitor and automate student records with AI insights.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <button
              onClick={handleCleanupCredentials}
              title="Remove login credentials for students no longer in the directory"
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-50"
            >
              <ShieldAlert className="h-4 w-4" /> Clean Up Credentials
            </button>
            <button
              onClick={() => setIsBulkUploadOpen(true)}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-slate-500" /> Import
            </button>
            <button
              onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
              className={cn("h-10 w-10 rounded-lg border flex items-center justify-center transition-colors",
                isAiPanelOpen ? "bg-purple-50 border-purple-200 text-purple-600" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50")}
            >
              <Brain className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* High Impact KPI Cards */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {[
            { id: "all", label: "Total Students", value: stats.total.toLocaleString(), sub: "In directory", icon: UsersIcon, bg: "bg-blue-50", ic: "text-blue-500" },
            {
              id: "all", label: "Active Today",
              value: stats.activeToday === null ? "—" : stats.activeToday.toLocaleString(),
              sub: stats.activeToday === null ? "No attendance marked yet" : `of ${stats.total} marked present today`,
              icon: CheckCircle, bg: "bg-emerald-50", ic: "text-emerald-500",
            },
            { id: "new", label: "New Admissions", value: stats.new.toLocaleString(), sub: "Last 30 days", icon: GraduationCap, bg: "bg-amber-50", ic: "text-amber-500" },
            { id: "at-risk", label: "At Risk (AI)", value: stats.atRisk.toLocaleString(), sub: "Risk ≥ 75 or attendance < 75%", icon: ShieldAlert, bg: "bg-rose-50", ic: "text-rose-500" },
          ].map((kpi, i) => (
            <button
              key={i}
              className="text-left bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              onClick={() => {
                if (kpi.id === "at-risk") setSmartFilter("at-risk");
                else if (kpi.id === "new") {
                   setSearchTerm("");
                   setSmartFilter("all");
                   toast.info("Showing new admissions from last 30 days");
                } else {
                   setSmartFilter("all");
                   setStatusFilter("all");
                   setGradeFilter("all");
                   setSectionFilter("all");
                   setSearchTerm("");
                }
              }}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", kpi.bg)}>
                  <kpi.icon className={cn("h-5 w-5", kpi.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{kpi.sub}</p>
            </button>
          ))}
        </motion.div>

        {/* Insight Banner — computed from real attendance data */}
        {lowAttendanceStudents.length > 0 && (
          <motion.div
            variants={itemVariants}
            className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-700">AI Insight</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lowAttendanceStudents.length} student{lowAttendanceStudents.length === 1 ? " has" : "s have"} attendance below 75%
                  {worstGrade ? `, most in ${worstGrade[0]} (${worstGrade[1]})` : ""}. Would you like to view the list?
                </p>
              </div>
            </div>
            <button
              className="h-8 px-3 rounded-lg text-xs font-semibold text-purple-600 hover:bg-purple-100 flex-shrink-0"
              onClick={() => {
                setSmartFilter("at-risk");
                setGradeFilter("all");
                setSectionFilter("all");
                setSearchTerm("");
                setStatusFilter("all");
                toast.success("Showing at-risk students");
              }}
            >
              View List
            </button>
          </motion.div>
        )}

        {/* Search & Intelligence Toolbar */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 h-9 rounded-lg border-slate-200 bg-white text-sm"
                placeholder="Search by student name, ID, parent contact…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full lg:w-36 rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                  <SelectItem value="Alumni">Alumni</SelectItem>
                </SelectContent>
              </Select>

              <Select value={gradeFilter} onValueChange={v => { setGradeFilter(v); setSectionFilter("all"); setCurrentPage(1); }}>
                <SelectTrigger className="h-9 w-full lg:w-36 rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700">
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-[320px] overflow-y-auto">
                  <SelectItem value="all">All Grades</SelectItem>
                  {availableGrades.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sectionFilter} onValueChange={v => { setSectionFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="h-9 w-full lg:w-32 rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-700">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-[320px] overflow-y-auto">
                  <SelectItem value="all">All Sections</SelectItem>
                  {availableSections.map(s => (
                    <SelectItem key={s} value={s}>Section {s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full lg:w-auto">
              <button
                onClick={() => setViewMode("table")}
                className={cn("h-8 flex-1 lg:flex-none rounded-md gap-1.5 px-3 text-xs font-semibold flex items-center justify-center transition-colors",
                  viewMode === "table" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}
              >
                <List className="h-3.5 w-3.5" /> Table
              </button>
              <button
                onClick={() => setViewMode("card")}
                className={cn("h-8 flex-1 lg:flex-none rounded-md gap-1.5 px-3 text-xs font-semibold flex items-center justify-center transition-colors",
                  viewMode === "card" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
            </div>
          </div>

          {/* Smart Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Filter className="h-3.5 w-3.5 text-slate-400 mr-1" />
            {[
              { id: "all", label: "All Students", icon: UsersIcon },
              { id: "at-risk", label: "At Risk Students", icon: ShieldAlert, color: "text-rose-700 bg-rose-100" },
              { id: "pending-fees", label: "Pending Fees", icon: CreditCard, color: "text-amber-700 bg-amber-100" },
              { id: "low-attendance", label: "Low Attendance", icon: Activity, color: "text-orange-700 bg-orange-100" },
              { id: "ai-priority", label: "AI Priority", icon: Zap, color: "text-purple-700 bg-purple-100" },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSmartFilter(chip.id as SmartFilter)}
                className={cn(
                  "h-8 rounded-lg px-3 text-xs font-semibold border transition-colors gap-1.5 flex items-center",
                  smartFilter === chip.id
                    ? (chip.color ? `${chip.color} border-transparent` : "bg-purple-600 text-white border-purple-600")
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                )}
              >
                <chip.icon className="h-3.5 w-3.5" />
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area with AI Sidebar */}
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {/* View Mode Content */}
            {viewMode === "table" ? (
              <motion.div
                key="table-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden"
              >
                <Table>
                  <TableHeader className="bg-slate-50/70">
                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                      <TableHead className="w-[40px] px-4">
                        <Checkbox
                          checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Student & ID</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Class</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Attendance</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Fees</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Performance</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {filteredStudents.length > 0 ? (
                        paginatedStudents.map((student, index) => (
                          <MotionTableRow
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.02 }}
                            key={student.id}
                            className={cn(
                              "group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer",
                              selectedStudents.includes(student.id) && "bg-primary/5 hover:bg-primary/10"
                            )}
                            onClick={() => handleViewDetails(student)}
                          >
                            <TableCell className="px-6" onClick={(e) => e.stopPropagation()}>
                              <Checkbox 
                                checked={selectedStudents.includes(student.id)}
                                onCheckedChange={() => toggleSelectStudent(student.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border shadow-sm group-hover:scale-110 transition-transform">
                                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}`} alt={student.name} />
                                  <AvatarFallback className="bg-slate-100 text-[10px] font-bold">
                                    {getInitials(student.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-[13px] font-black text-slate-900 leading-tight group-hover:text-primary transition-colors">{student.name}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-tighter">ID: {student.id}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-[12px] font-bold text-slate-700">
                                  {(() => {
                                    const g = student.grade || "";
                                    const num = g.match(/(\d+)/)?.[1] || student.classId?.match(/grade\s*(\d+)/i)?.[1];
                                    if (num) return `Grade-${num}`;
                                    if (g) return g.replace(/^Grade\s+/, "Grade-");
                                    return student.classId?.split("-")[0] || "—";
                                  })()}
                                </span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                  Section: {student.section || getSection(student)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1.5 w-24">
                                {student.attendance != null && student.attendance > 0 ? (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className={cn(
                                        "text-[10px] font-black uppercase tracking-tighter",
                                        student.attendance < 75 ? "text-rose-500" : student.attendance < 85 ? "text-amber-500" : "text-green-500"
                                      )}>
                                        {student.attendance}%
                                      </span>
                                      {student.attendance < 75 && <ShieldAlert className="h-2.5 w-2.5 text-rose-500" />}
                                    </div>
                                    <Progress
                                      value={student.attendance}
                                      className="h-1.5"
                                      indicatorClassName={cn(
                                        student.attendance < 75 ? "bg-rose-500" : student.attendance < 85 ? "bg-amber-500" : "bg-green-500"
                                      )}
                                    />
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground font-medium">No data</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn(
                                "border-none text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg",
                                student.feeStatus === "Paid" ? "bg-green-50 text-green-600" : 
                                student.feeStatus === "Pending" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                              )}>
                                {student.feeStatus || "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  student.performance === "Excellent" ? "bg-green-500" : 
                                  student.performance === "Good" ? "bg-blue-500" : 
                                  student.performance === "Average" ? "bg-amber-500" : "bg-rose-500"
                                )} />
                                <span className="text-[11px] font-bold text-slate-600">{student.performance || "Average"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary" onClick={() => handleContactStudent(student)}>
                                  <Phone className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary" onClick={() => handleViewDetails(student)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary">
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl w-48">
                                    <DropdownMenuItem onClick={() => handleViewDetails(student)}>
                                      <EditIcon className="h-4 w-4 mr-2" /> Edit Profile
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handlePromoteStudent(student)}>
                                      <Zap className="h-4 w-4 mr-2" /> Promote
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-rose-600" onClick={() => handleDeleteStudent(student)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </MotionTableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-64 text-center">
                            <div className="flex flex-col items-center justify-center p-8">
                              <Search className="h-12 w-12 text-slate-200 mb-4" />
                              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">No students found</h3>
                              <p className="text-xs text-slate-500 mt-2 font-medium">Try broadening your search or filters.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </motion.div>
            ) : viewMode === "card" ? (
              <motion.div 
                key="card-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
              >
                {paginatedStudents.map((student, i) => (
                  <MotionCard
                    key={student.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="group border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer rounded-2xl overflow-hidden bg-white"
                    onClick={() => handleViewDetails(student)}
                  >
                    {/* Gradient header */}
                    <div className="h-24 bg-gradient-to-br from-purple-600 via-primary to-fuchsia-500 relative overflow-hidden">
                      <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)", backgroundSize: "18px 18px" }} />
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/10 to-transparent" />
                      {/* class pill & action dropdown top-right */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-white bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md uppercase tracking-widest">
                          <GraduationCap className="h-2.5 w-2.5" />
                          {student.classId}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md bg-white/15 backdrop-blur-sm hover:bg-white/25 border border-white/10 text-white p-0">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl w-48">
                            <DropdownMenuItem onClick={() => handleViewDetails(student)}>
                              <EditIcon className="h-4 w-4 mr-2" /> Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePromoteStudent(student)}>
                              <Zap className="h-4 w-4 mr-2" /> Promote
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-rose-600" onClick={() => handleDeleteStudent(student)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <CardContent className="p-5 pt-0 -mt-9">
                      {/* Avatar row */}
                      <div className="flex items-end justify-between mb-3">
                        <div className="relative">
                          <Avatar className="h-16 w-16 border-[3px] border-white shadow-lg">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}`} />
                            <AvatarFallback className="bg-slate-100 font-bold text-slate-600">{getInitials(student.name)}</AvatarFallback>
                          </Avatar>
                          {/* status dot */}
                          <span className={cn(
                            "absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow",
                            student.status === "Active" ? "bg-green-400" : "bg-slate-400"
                          )} />
                        </div>
                        <div className="flex flex-col items-end gap-1 pb-1">
                          <Badge className={cn(
                            "rounded-lg text-[8px] font-black uppercase tracking-widest border-none",
                            student.feeStatus === "Paid" ? "bg-green-50 text-green-600" :
                            student.feeStatus === "Overdue" ? "bg-rose-50 text-rose-600" :
                            student.feeStatus === "Pending" ? "bg-amber-50 text-amber-600" :
                            "bg-slate-50 text-slate-400"
                          )}>
                            <CreditCard className="h-2.5 w-2.5 mr-1 inline" />
                            {student.feeStatus || "No fee"}
                          </Badge>
                        </div>
                      </div>

                      {/* Name + ID */}
                      <div className="mb-3 flex justify-between items-start">
                        <div className="min-w-0 flex-1 mr-2">
                          <h4 className="text-[15px] font-black text-slate-900 group-hover:text-primary transition-colors leading-tight truncate">{student.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{student.id}</p>
                        </div>
                        <Badge variant="outline" className="rounded-lg text-[9px] font-black uppercase border-slate-200 text-slate-500 bg-slate-50/50 shrink-0">
                          Sec: {student.section || getSection(student)}
                        </Badge>
                      </div>

                      {student.email && (
                        <div className="flex items-center gap-1.5 mb-4 -mt-2 text-slate-500 min-w-0">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="text-[11px] font-medium truncate" title={student.email}>{student.email}</span>
                        </div>
                      )}

                      {/* Stats row */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Attendance</p>
                          {student.attendance != null && student.attendance > 0 ? (
                            <>
                              <p className={cn("text-base font-black leading-none", student.attendance < 75 ? "text-rose-500" : student.attendance < 85 ? "text-amber-500" : "text-green-500")}>
                                {student.attendance}%
                              </p>
                              <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                                <div className={cn("h-full rounded-full", student.attendance < 75 ? "bg-rose-500" : student.attendance < 85 ? "bg-amber-500" : "bg-green-500")}
                                  style={{ width: `${student.attendance}%` }} />
                              </div>
                            </>
                          ) : (
                            <p className="text-base font-black text-slate-300 leading-none">—</p>
                          )}
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Performance</p>
                          <p className={cn("text-base font-black leading-none",
                            student.performance === "Excellent" ? "text-green-600" :
                            student.performance === "Good" ? "text-purple-600" :
                            student.performance === "Average" ? "text-amber-600" :
                            "text-slate-400"
                          )}>
                            {student.performance || "—"}
                          </p>
                          <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                            <div className={cn("h-full rounded-full",
                              student.performance === "Excellent" ? "bg-green-500 w-full" :
                              student.performance === "Good" ? "bg-blue-500 w-3/4" :
                              student.performance === "Average" ? "bg-amber-500 w-1/2" :
                              "bg-slate-300 w-1/4"
                            )} />
                          </div>
                        </div>
                      </div>

                      {/* CTA */}
                      <Button className="w-full h-10 rounded-xl gradient-primary text-white border-none font-bold text-xs gap-2 shadow-sm shadow-primary/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Profile
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </MotionCard>
                ))}
              </motion.div>
            ) : (
              <div className="p-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Brain className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900">AI Smart View</h3>
                <p className="text-slate-500 mt-2">Personalized grouping of students based on behavioral and academic trends.</p>
                <Button className="mt-6 gradient-primary rounded-xl font-bold">Launch AI Analysis</Button>
              </div>
            )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border border-slate-100 rounded-xl shadow-sm">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
              </p>
              <div className="flex items-center gap-1">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                  className="h-7 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const page = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                  return (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={cn("h-7 w-7 rounded-lg text-xs font-semibold transition-colors",
                        page === currentPage ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                      {page}
                    </button>
                  );
                })}
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                  className="h-7 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
          </div>

          {/* AI Insights Sidebar */}
          {isAiPanelOpen && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:block w-80 space-y-6 sticky top-24"
            >
              <Card className="border-none shadow-sm shadow-purple-100 gradient-primary text-white overflow-hidden rounded-3xl">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-white/20 rounded-xl">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm uppercase tracking-widest leading-none">AI Priority Hub</h4>
                      <p className="text-[10px] text-white/70 mt-1 font-bold">Predictive insights active</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { label: "High Risk Students", value: stats.atRisk, icon: ShieldAlert, color: "bg-rose-400/30" },
                      { label: "Low Attendance", value: students.filter(s => (s.attendance || 100) < 75).length, icon: Activity, color: "bg-amber-400/30" },
                      { label: "Fee Defaulters", value: students.filter(s => s.feeStatus === "Overdue").length, icon: CreditCard, color: "bg-blue-400/30" },
                    ].map((insight, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 bg-white/10 rounded-2xl border border-white/10">
                        <div className={cn("p-2 rounded-xl", insight.color)}>
                          <insight.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">{insight.label}</p>
                          <p className="text-lg font-black">{insight.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3 ml-1">Daily Automations</p>
                    <Button 
                      onClick={() => {
                        toast.success("Dispatching AI fee reminders to 12 parents...");
                        setTimeout(() => toast.success("Automated reminders sent successfully!"), 1500);
                      }}
                      className="w-full bg-white text-primary border-none hover:bg-white/90 font-black rounded-xl text-[10px] uppercase tracking-widest h-10 shadow-lg shadow-purple-900/20 gap-2"
                    >
                      <Zap className="h-3 w-3" />
                      Send Fee Reminders
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        toast.info("Analyzing parent schedules for meetings...");
                        setTimeout(() => toast.success("Draft invites ready in communication center."), 1500);
                      }}
                      className="w-full border-none hover:bg-white/10 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest h-10"
                    >
                      Schedule Parent Meetings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Mini Charts / Stats */}
              <Card className="border-none shadow-sm rounded-3xl p-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  Health Score
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-600">Attendance Rate</span>
                      <span className="text-[11px] font-black text-primary">84%</span>
                    </div>
                    <Progress value={84} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-600">Fee Collection</span>
                      <span className="text-[11px] font-black text-green-500">92%</span>
                    </div>
                    <Progress value={92} className="h-1.5" indicatorClassName="bg-green-500" />
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Floating Bulk Actions Bar */}
      <AnimatePresence>
        {selectedStudents.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-12 right-12 z-50 flex justify-center"
          >
            <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-8 text-white min-w-[600px] justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black">
                  {selectedStudents.length}
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest leading-none">Students Selected</p>
                  <p className="text-[10px] text-white/50 mt-1 font-bold">Apply actions to the current selection</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  onClick={() => setSelectedStudents([])}
                  className="h-10 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 text-white/70"
                >
                  Clear
                </Button>
                <div className="w-px h-6 bg-white/10 mx-2" />
                <Button 
                  onClick={() => setIsBulkPromoteOpen(true)}
                  className="h-10 px-6 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest border-none gap-2 hover:bg-primary/90"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Bulk Promote
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 bg-rose-500/20 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Bulk Delete
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleExportCSV}
                  className="h-10 w-10 rounded-xl hover:bg-white/10 text-white/70"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddStudentDialog
        open={isAddStudentOpen}
        onOpenChange={setIsAddStudentOpen}
      />
      <BulkUploadDialog 
        open={isBulkUploadOpen} 
        onOpenChange={setIsBulkUploadOpen}
        onUploadSuccess={handleBulkUploadSuccess}
      />
      {selectedStudent && (
        <StudentDetailsDialog
          open={isDetailsOpen}
          onOpenChange={handleCloseDetails}
          student={selectedStudent}
        />
      )}
      <DeleteStudentDialog
        student={selectedStudent}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title="Delete Students"
        description={`Are you sure you want to delete ${selectedStudents.length} students? This action cannot be undone.`}
        onConfirm={handleBulkDelete}
        confirmText="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={isBulkPromoteOpen}
        onOpenChange={setIsBulkPromoteOpen}
        title="Promote Students"
        description={`Are you sure you want to promote ${selectedStudents.length} selected students to the next grade?`}
        onConfirm={handleBulkPromote}
        confirmText="Promote"
      />
    </DashboardLayout>
  );
};

export default Students;
