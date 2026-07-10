import { useState, useMemo, useEffect, useRef } from "react";
import { BiometricAttendance } from "@/components/attendance/BiometricAttendance";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Search, Calendar as CalendarIcon, CheckCircle2, XCircle, Clock,
  Users, UserCheck, Download, Sparkles, MoreVertical, Phone, Mail, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { useHRSettings } from "@/contexts/HRSettingsContext";
import { Student, Staff as StaffType } from "@/types";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import { StudentDetailsDialog } from "@/components/students/StudentDetailsDialog";
import { canonGrade } from "@/lib/studentGradeSection";
import { notifyParentsOfStudents } from "@/lib/classPublishNotify";

const STATUS_PILLS = [
  { value: "all",     label: "All",     bg: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
  { value: "Present", label: "Present", bg: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200" },
  { value: "Late",    label: "Late",    bg: "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200" },
  { value: "Absent",  label: "Absent",  bg: "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200" },
];

const Attendance = () => {
  const [activeTab, setActiveTab] = useState("students");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [biometricOpen, setBiometricOpen] = useState(false);

  // Filter state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [studentClass, setStudentClass] = useState("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffStatus, setStaffStatus] = useState("all");

  // Profile dialogs
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStaffProfile, setSelectedStaffProfile] = useState<StaffType | null>(null);

  // Pagination (student roster table only)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const { user } = useAuth();
  const { students: allDbStudents } = useStudents();
  const { staff: dbStaff } = useStaff();
  const hrSettings = useHRSettings();
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // Scoped once, here, so every downstream filter/search/export on this page
  // (which all key off `dbStudents`) automatically stays inside a Grade
  // Coordinator's assigned grade with no per-filter changes needed.
  const dbStudents = useMemo(
    () => isGradeCoordinator ? allDbStudents.filter(s => canonGrade((s as any).grade) === canonGrade(coordAssignedGrade)) : allDbStudents,
    [allDbStudents, isGradeCoordinator, coordAssignedGrade]
  );

  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const attCacheRef = useRef<any[]>([]);

  // Single attendance load — shared between both tabs
  useEffect(() => {
    if (dbStudents.length === 0 && dbStaff.length === 0) return;
    let cancelled = false;
    (async () => {
      const records = await smartDb.getAll("attendance");
      if (cancelled) return;
      attCacheRef.current = records;
      applyAttendance(records, date, dbStudents, dbStaff, setStudents, setStaff);
    })();
    return () => { cancelled = true; };
  }, [dbStudents, dbStaff]);

  // When date changes, re-apply from cached records (no DB re-fetch)
  useEffect(() => {
    if (attCacheRef.current.length > 0 || dbStudents.length > 0) {
      applyAttendance(attCacheRef.current, date, dbStudents, dbStaff, setStudents, setStaff);
    }
  }, [date]);

  const handleMarkAllPresent = () => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (activeTab === "students") {
      setStudents((p) => p.map((s) => ({ ...s, status: "Present", time: s.time === "-" ? now : s.time })));
      toast.success("All students marked as present");
    } else {
      setStaff((p) => p.map((s) => ({ ...s, status: "Present", time: s.time === "-" ? now : s.time })));
      toast.success("All staff marked as present");
    }
  };

  const updateStatus = (id: string, newStatus: string) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const patch = (s: any) =>
      s.id === id
        ? { ...s, status: newStatus, time: newStatus === "Absent" ? "-" : s.time === "-" ? now : s.time }
        : s;
    if (activeTab === "students") setStudents((p) => p.map(patch));
    else setStaff((p) => p.map(patch));
    toast.success(`Status updated to ${newStatus}`);
  };

  const handleSubmitAttendance = async () => {
    const isStudents = activeTab === "students";
    const rows = isStudents ? students : staff;
    const entityType = isStudents ? "student" : "staff";
    const prefix = isStudents ? "ATT-STU" : "ATT-STF";
    const createdAt = new Date().toISOString();
    try {
      await Promise.all(
        rows.map((r) => {
          const rec = { id: `${prefix}-${r.id}-${date}`, entityId: r.id, entityType, name: r.name, class: isStudents ? r.class : r.role || "", status: r.status, date, time: r.time, uid: user?.uid, createdAt };
          return smartDb.create("attendance", rec, rec.id);
        }),
      );
      window.dispatchEvent(new Event("attendance-updated"));

      // Real parent alert for anyone marked Absent/Late here — this bulk
      // admin roster used to write attendance with no notification at all,
      // unlike the per-class teacher flow (TeacherAttendance.tsx), which
      // already does this via the same notifyParentsOfStudents helper.
      if (isStudents) {
        const flagged = rows.filter((r) => r.status === "Absent" || r.status === "Late");
        if (flagged.length) {
          notifyParentsOfStudents(
            flagged.map((r) => ({
              id: r.id, name: r.name,
              message: `${r.name} was marked ${r.status} on ${new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}.`,
            })),
            {
              entity: "Attendance", type: "attendance_marked",
              title: "Attendance Update",
              sourceId: `${prefix}-${date}`, grade: "", section: "",
              redirectUrl: "/parent/attendance",
            }
          ).catch(() => {});
        }
      }

      toast.success(`${isStudents ? "Student" : "Staff"} attendance for ${date} submitted!`);
    } catch {
      toast.error("Failed to submit attendance");
    }
  };

  const escapeCsvCell = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExport = () => {
    const isStudents = activeTab === "students";
    const data = isStudents ? filteredStudents : filteredStaff;
    const headers = isStudents ? ["ID", "Name", "Class", "Status", "Time"] : ["ID", "Name", "Role", "Status", "Time"];
    
    const rows = data.map((i) => {
      const rowData = isStudents 
        ? [i.id, i.name, i.class, i.status, i.time] 
        : [i.id, i.name, i.role, i.status, i.time];
      return rowData.map(escapeCsvCell).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = `attendance_${activeTab}_${date}.csv`;
    link.click();
    toast.success("Exported!");
  };

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class).filter(Boolean))).sort(), [students]);

  const filteredStudents = useMemo(() => students.filter((s) => {
    const q = studentSearch.toLowerCase();
    return (!q || s.name?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q)) &&
      (studentStatus === "all" || s.status === studentStatus) &&
      (studentClass === "all" || s.class === studentClass);
  }), [students, studentSearch, studentStatus, studentClass]);

  // Reset to page 1 whenever any student filter changes
  useEffect(() => { setCurrentPage(1); }, [studentSearch, studentStatus, studentClass]);

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const filteredStaff = useMemo(() => staff.filter((s) => {
    const q = staffSearch.toLowerCase();
    return (!q || s.name?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q)) &&
      (staffStatus === "all" || s.status === staffStatus);
  }), [staff, staffSearch, staffStatus]);

  const sstats = useMemo(() => ({
    total: students.length,
    present: students.filter((s) => s.status === "Present").length,
    late: students.filter((s) => s.status === "Late").length,
    absent: students.filter((s) => s.status === "Absent").length,
  }), [students]);

  const fstats = useMemo(() => ({
    total: staff.length,
    present: staff.filter((s) => s.status === "Present").length,
    late: staff.filter((s) => s.status === "Late").length,
    absent: staff.filter((s) => s.status === "Absent").length,
  }), [staff]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      Present: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      Late:    "bg-amber-50 text-amber-700 border border-amber-200",
      Absent:  "bg-red-50 text-red-700 border border-red-200",
    };
    return (
      <span className={cn("inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full", map[status] || "bg-slate-100 text-slate-600")}>
        {status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance Management</h1>
              <p className="text-sm text-slate-400">Track and manage daily attendance for students and staff.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-10 h-10 rounded-xl border-border bg-card w-44 text-xs font-bold" />
            </div>
            <Button variant="outline" className="rounded-xl h-10 gap-2 text-xs font-bold" onClick={() => setBiometricOpen(true)}>
              <Sparkles className="h-4 w-4 text-primary" /> Biometric
            </Button>
            <Button variant="outline" className="rounded-xl h-10 gap-2 text-xs font-bold" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        <BiometricAttendance open={biometricOpen} onClose={() => setBiometricOpen(false)} />

        {/* HR Settings attendance policy strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 rounded-xl border bg-sky-50 border-sky-100 text-sm">
          <span className="font-semibold text-sky-800">Attendance Config (from HR Settings):</span>
          <span className="text-sky-700">Shift: <b>{hrSettings.shiftStart} – {hrSettings.shiftEnd}</b></span>
          <span className="text-sky-400">·</span>
          <span className="text-sky-700">Grace: <b>{hrSettings.gracePeriod} min</b></span>
          <span className="text-sky-400">·</span>
          <span className="text-sky-700">Half-day: <b>&lt; {hrSettings.halfDayHrs} hrs</b></span>
          <span className="text-sky-400">·</span>
          <span className="text-sky-700">Auto-absent after: <b>{hrSettings.autoAbsent}</b></span>
          <span className="text-sky-400">·</span>
          <span className="text-sky-700">
            Capture modes: <b>{[
              hrSettings.biometric && 'Biometric',
              hrSettings.geoFenced && `Geo-fenced (${hrSettings.geoRadius}m)`,
              hrSettings.qrCode && 'QR Code',
              hrSettings.manualWeb && 'Manual Web',
            ].filter(Boolean).join(', ') || 'None'}</b>
          </span>
        </div>

        <Tabs defaultValue="students" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap mb-4">
            <TabsTrigger value="students" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <UserCheck className="h-4 w-4" /> Student Attendance
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Users className="h-4 w-4" /> Staff Attendance
            </TabsTrigger>
          </TabsList>

          {/* ══ STUDENTS ══ */}
          <TabsContent value="students" className="space-y-4 outline-none">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", value: sstats.total, color: "bg-blue-50 text-purple-600", icon: Users },
                { label: "Present", value: sstats.present, color: "bg-emerald-50 text-emerald-600", icon: CheckCircle2 },
                { label: "Late", value: sstats.late, color: "bg-amber-50 text-amber-600", icon: Clock },
                { label: "Absent", value: sstats.absent, color: "bg-red-50 text-red-600", icon: XCircle },
              ].map((s) => (
                <div key={s.label} className="premium-card p-4 flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.color.split(" ")[0])}>
                    <s.icon className={cn("h-5 w-5", s.color.split(" ")[1])} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-black">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="premium-card overflow-hidden">
              {/* ── One-click filter bar ── */}
              <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-2 w-full">
                  {/* Search */}
                  <div className="relative min-w-[180px] flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="pl-9 h-9 rounded-xl text-xs border-slate-200 bg-white" placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                  </div>

                  {/* Status pills — ONE CLICK */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                    {STATUS_PILLS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setStudentStatus(p.value)}
                        className={cn(
                          "px-3 py-1 rounded-lg text-[11px] font-bold transition-all",
                          studentStatus === p.value
                            ? p.value === "all" ? "bg-slate-800 text-white shadow-sm" : p.bg.replace("hover:", "") + " ring-2 ring-offset-1 ring-current shadow-sm"
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                      >
                        {p.label}
                        {p.value !== "all" && (
                          <span className="ml-1 text-[9px] opacity-70">
                            {p.value === "Present" ? sstats.present : p.value === "Late" ? sstats.late : sstats.absent}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Class select — always visible */}
                  <Select value={studentClass} onValueChange={setStudentClass}>
                    <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-xs font-bold w-36">
                      <SelectValue placeholder="All Grades" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-64">
                      <SelectItem value="all" className="text-xs font-medium">All Grades</SelectItem>
                      {classes.map((c) => <SelectItem key={c} value={c} className="text-xs font-medium">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(studentStatus !== "all" || studentClass !== "all" || studentSearch) && (
                    <button
                      onClick={() => { setStudentStatus("all"); setStudentClass("all"); setStudentSearch(""); }}
                      className="text-[10px] font-bold text-primary underline whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                  <Button variant="outline" size="sm" className="h-9 rounded-xl text-[10px] font-bold" onClick={handleMarkAllPresent}>
                    Mark All Present
                  </Button>
                </div>
              </div>

              {/* Result count */}
              <div className="px-4 py-2 border-b border-border/30 flex items-center gap-2 bg-white">
                <span className="text-[11px] font-bold text-foreground">{filteredStudents.length}</span>
                <span className="text-[11px] text-muted-foreground">of {students.length} students</span>
                {studentStatus !== "all" && <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{studentStatus}</span>}
                {studentClass !== "all" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{studentClass}</span>}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Class</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Check-in</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-xs text-muted-foreground font-medium">
                          No students match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedStudents.map((student) => (
                        <TableRow
                          key={student.id}
                          className="group hover:bg-secondary/30 transition-colors border-b border-border/40 last:border-0 cursor-pointer"
                          onClick={() => setSelectedStudent(dbStudents.find((s) => s.id === student.id) || null)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}`} />
                                <AvatarFallback className="bg-primary/5 text-[10px] font-bold text-primary">
                                  {(student.name || "").split(" ").map((n: string) => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-[12px] font-bold text-foreground group-hover:text-primary transition-colors">{student.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{student.id}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] font-bold">{student.class}</TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground">{student.time}</TableCell>
                          <TableCell>{getStatusBadge(student.status)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => updateStatus(student.id, "Present")} className="text-xs text-emerald-600 font-medium">Mark Present</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(student.id, "Late")} className="text-xs text-amber-600 font-medium">Mark Late</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(student.id, "Absent")} className="text-xs text-red-600 font-medium">Mark Absent</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
                  <p className="text-xs text-slate-500 font-medium">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const page = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                      return (
                        <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0 text-xs rounded-lg" onClick={() => setCurrentPage(page)}>
                          {page}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}

              <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-end">
                <Button className="gradient-primary text-white font-bold h-10 px-7 shadow-lg shadow-primary/20 rounded-xl text-xs" onClick={handleSubmitAttendance}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Submit Student Attendance
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ══ STAFF ══ */}
          <TabsContent value="staff" className="space-y-4 outline-none">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", value: fstats.total, color: "bg-purple-50 text-purple-600", icon: Users },
                { label: "On Duty", value: fstats.present, color: "bg-emerald-50 text-emerald-600", icon: CheckCircle2 },
                { label: "Late", value: fstats.late, color: "bg-amber-50 text-amber-600", icon: Clock },
                { label: "On Leave", value: fstats.absent, color: "bg-red-50 text-red-600", icon: XCircle },
              ].map((s) => (
                <div key={s.label} className="premium-card p-4 flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.color.split(" ")[0])}>
                    <s.icon className={cn("h-5 w-5", s.color.split(" ")[1])} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-black">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="premium-card overflow-hidden">
              {/* ── One-click filter bar ── */}
              <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <div className="relative min-w-[180px] flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="pl-9 h-9 rounded-xl text-xs border-slate-200 bg-white" placeholder="Search staff…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} />
                  </div>

                  {/* Status pills */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                    {STATUS_PILLS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setStaffStatus(p.value)}
                        className={cn(
                          "px-3 py-1 rounded-lg text-[11px] font-bold transition-all",
                          staffStatus === p.value
                            ? p.value === "all" ? "bg-slate-800 text-white shadow-sm" : p.bg.replace("hover:", "") + " ring-2 ring-offset-1 ring-current shadow-sm"
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                      >
                        {p.label}
                        {p.value !== "all" && (
                          <span className="ml-1 text-[9px] opacity-70">
                            {p.value === "Present" ? fstats.present : p.value === "Late" ? fstats.late : fstats.absent}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(staffStatus !== "all" || staffSearch) && (
                    <button onClick={() => { setStaffStatus("all"); setStaffSearch(""); }} className="text-[10px] font-bold text-primary underline">
                      Clear
                    </button>
                  )}
                  <Button variant="outline" size="sm" className="h-9 rounded-xl text-[10px] font-bold" onClick={handleMarkAllPresent}>
                    Mark All Present
                  </Button>
                </div>
              </div>

              <div className="px-4 py-2 border-b border-border/30 flex items-center gap-2 bg-white">
                <span className="text-[11px] font-bold text-foreground">{filteredStaff.length}</span>
                <span className="text-[11px] text-muted-foreground">of {staff.length} staff members</span>
                {staffStatus !== "all" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{staffStatus}</span>}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Staff Member</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Check-in</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaff.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-xs text-muted-foreground">No staff match the current filters.</TableCell>
                      </TableRow>
                    ) : (
                      filteredStaff.map((member) => (
                        <TableRow
                          key={member.id}
                          className="group hover:bg-secondary/30 transition-colors border-b border-border/40 last:border-0 cursor-pointer"
                          onClick={() => setSelectedStaffProfile(dbStaff.find((s) => s.id === member.id) || null)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} />
                                <AvatarFallback className="bg-primary/5 text-[10px] font-bold text-primary">{getInitials(member.name)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-[12px] font-bold text-foreground group-hover:text-primary transition-colors">{member.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{member.id}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] font-bold">{member.role}</TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground">{member.time}</TableCell>
                          <TableCell>{getStatusBadge(member.status)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => updateStatus(member.id, "Present")} className="text-xs text-emerald-600 font-medium">Mark Present</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(member.id, "Late")} className="text-xs text-amber-600 font-medium">Mark Late</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(member.id, "Absent")} className="text-xs text-red-600 font-medium">Mark Absent</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-end">
                <Button className="gradient-primary text-white font-bold h-10 px-7 shadow-lg shadow-primary/20 rounded-xl text-xs" onClick={handleSubmitAttendance}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Submit Staff Attendance
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Student profile */}
      <StudentDetailsDialog student={selectedStudent} open={!!selectedStudent} onOpenChange={(o) => { if (!o) setSelectedStudent(null); }} />

      {/* Staff profile */}
      <Dialog open={!!selectedStaffProfile} onOpenChange={(o) => { if (!o) setSelectedStaffProfile(null); }}>
        <DialogContent className="max-w-md rounded-3xl overflow-hidden p-0 border-none shadow-2xl">
          {selectedStaffProfile && (
            <div>
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black">Staff Profile</DialogTitle>
                  <DialogDescription>Attendance record for {selectedStaffProfile.name}</DialogDescription>
                </DialogHeader>
              </div>
              <div className="p-5 pt-2 space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/50">
                  <Avatar className="h-16 w-16 border-4 border-white shadow-lg">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedStaffProfile.name}`} />
                    <AvatarFallback className="text-base font-black text-primary bg-primary/10">{getInitials(selectedStaffProfile.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black truncate">{selectedStaffProfile.name}</h3>
                    <p className="text-xs font-bold text-primary uppercase tracking-widest">{selectedStaffProfile.role}</p>
                    {selectedStaffProfile.department && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><Briefcase className="h-3 w-3" />{selectedStaffProfile.department}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selectedStaffProfile.email && (
                    <div className="p-3 rounded-xl bg-card border border-border/50">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-1"><Mail className="h-3 w-3" />Email</p>
                      <p className="text-[11px] font-bold truncate">{selectedStaffProfile.email}</p>
                    </div>
                  )}
                  {selectedStaffProfile.phone && (
                    <div className="p-3 rounded-xl bg-card border border-border/50">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-1"><Phone className="h-3 w-3" />Phone</p>
                      <p className="text-[11px] font-bold">{selectedStaffProfile.phone}</p>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-card border border-border/50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Today's Status</p>
                    {getStatusBadge(staff.find((s) => s.id === selectedStaffProfile.id)?.status || "—")}
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border/50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Check-in Time</p>
                    <p className="text-[11px] font-bold font-mono">{staff.find((s) => s.id === selectedStaffProfile.id)?.time || "—"}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 h-9 rounded-xl gradient-primary text-white text-xs font-bold" onClick={() => { updateStatus(selectedStaffProfile.id, "Present"); setSelectedStaffProfile(null); }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Present
                  </Button>
                  <Button variant="outline" className="flex-1 h-9 rounded-xl border-amber-200 text-amber-700 text-xs font-bold hover:bg-amber-50" onClick={() => { updateStatus(selectedStaffProfile.id, "Late"); setSelectedStaffProfile(null); }}>
                    <Clock className="h-3.5 w-3.5 mr-1" /> Late
                  </Button>
                  <Button variant="outline" className="flex-1 h-9 rounded-xl border-red-200 text-red-700 text-xs font-bold hover:bg-red-50" onClick={() => { updateStatus(selectedStaffProfile.id, "Absent"); setSelectedStaffProfile(null); }}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Absent
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

// Pure helper — called once when attendance records arrive, not a hook
function applyAttendance(
  records: any[],
  date: string,
  dbStudents: Student[],
  dbStaff: StaffType[],
  setStudents: (v: any[]) => void,
  setStaff: (v: any[]) => void,
) {
  const stuMap = new Map<string, any>();
  const stfMap = new Map<string, any>();
  records.forEach((r: any) => {
    if (r.date !== date) return;
    if (r.entityType === "student") stuMap.set(r.entityId, r);
    if (r.entityType === "staff") stfMap.set(r.entityId, r);
  });

  setStudents(
    dbStudents.map((s) => {
      const r = stuMap.get(s.id);
      return { id: s.id, name: s.name, class: s.classId || "Unassigned", status: r?.status ?? "Present", time: r?.time ?? "08:00 AM" };
    }),
  );
  setStaff(
    dbStaff.map((s) => {
      const r = stfMap.get(s.id);
      return { id: s.id, name: s.name, role: s.role || s.department || "Staff", status: r?.status ?? "Present", time: r?.time ?? "07:30 AM" };
    }),
  );
}

export default Attendance;
