import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Heart, Plus, Search, MoreHorizontal, Activity, AlertCircle,
  FileText, History, Loader2, Trash2, CheckCircle2, ChevronDown, ChevronsUpDown, Info,
  Droplets, Clock, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useGrades } from '@/contexts/CurriculumContext';

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

// Fields pre-filled from the admission form
const ADMISSION_HEALTH_FIELDS = [
  { icon: Droplets, label: "Blood Group", field: "bloodGroup", source: "Application Form → Student Details" },
  { icon: AlertCircle, label: "Medical Conditions", field: "medicalConditions", source: "Application Form → Health Info" },
  { icon: Shield, label: "Allergies", field: "allergies", source: "Application Form → Health Info" },
];

interface HealthRecord {
  id: string;
  studentId?: string;
  name: string;
  grade: string;
  type: string;
  condition: string;
  lastCheckup: string;
  bloodGroup: string;
  status: string;
  isVaccinated: boolean;
  image: string;
  allergies?: string;
  history: Array<{ date: string; condition: string; notes: string }>;
  /** True only for a real HealthRecord created via "Add Entry"/nurse action.
   *  False = placeholder row synthesized client-side for display only —
   *  never persisted, never fabricated as real medical data. */
  hasRecord?: boolean;
}

const EMPTY_NEW = {
  studentId: "",
  name: "",
  grade: "",
  condition: "None",
  bloodGroup: "",
  status: "Healthy",
  isVaccinated: true,
  allergies: "",
  notes: "",
};

export default function Health() {
  const { students, loading: studentsLoading } = useStudents();
  const { staff, loading: staffLoading } = useStaff();
  const grades = useGrades();

  const { user } = useAuth();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bloodGroupFilter, setBloodGroupFilter] = useState("all");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<HealthRecord | null>(null);

  // Nurse Visit logging — NurseVisit is read by ParentHealth.tsx (parent
  // portal), ParentDashboard.tsx's Family Snapshot, and student/Health.tsx,
  // but no page anywhere ever wrote to it — every "Nurse Visits" section in
  // the app was permanently empty regardless of real activity.
  const [isNurseVisitOpen, setIsNurseVisitOpen] = useState(false);
  const [nurseVisitRecord, setNurseVisitRecord] = useState<HealthRecord | null>(null);
  const [nurseVisitForm, setNurseVisitForm] = useState({ reason: "", treatment: "", notes: "" });

  // New entry form
  const [newEntry, setNewEntry] = useState({ ...EMPTY_NEW });
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);

  // Log HIPAA / GDPR Access Log
  const logAccess = async (action: string, details: string) => {
    if (!user) return;
    try {
      const logId = `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const log = {
        id: logId,
        uid: user.uid,
        timestamp: new Date().toISOString(),
        actor: user.email || "Admin User",
        action,
        details
      };
      await smartDb.create("HealthAuditLog", log, logId);
    } catch (e) {
      console.error("Audit log creation error:", e);
    }
  };

  // Load real health records from the database, then merge in an honest
  // "no record yet" placeholder (client-side only, never persisted) for any
  // student/staff who has no genuine HealthRecord. Placeholders are never
  // written via smartDb.create — a nurse must explicitly use "Add Entry" to
  // create a real record.
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }

    let isSubscribed = true;
    let realRecords: HealthRecord[] = [];

    const buildMerged = () => {
      const byStudentId = new Map<string, HealthRecord>();
      const byStaffId = new Map<string, HealthRecord>();
      realRecords.forEach((r) => {
        if (r.type === "student" && r.studentId) byStudentId.set(r.studentId, r);
        else if (r.type === "staff") byStaffId.set(r.id, r);
      });

      const placeholders: HealthRecord[] = [];

      students.forEach((s) => {
        if (!s.id || !s.name) return;
        if (byStudentId.has(s.id)) return; // real record already exists
        placeholders.push({
          id: `HLT-STU-${s.id}`,
          studentId: s.id,
          name: s.name || "Unknown",
          grade: s.classId || "",
          type: "student",
          condition: s.medicalConditions || "Not recorded",
          allergies: (s as any).allergies || "",
          lastCheckup: "",
          bloodGroup: (s as any).bloodGroup || "Not recorded",
          status: "No record yet",
          isVaccinated: false,
          image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name || "unknown"}`,
          history: [],
          hasRecord: false,
        });
      });

      staff.forEach((s) => {
        if (!s.id || !s.name) return;
        if (byStaffId.has(`HLT-STF-${s.id}`)) return; // real record already exists
        placeholders.push({
          id: `HLT-STF-${s.id}`,
          name: s.name || "Unknown",
          grade: s.role || "Staff",
          type: "staff",
          condition: "Not recorded",
          lastCheckup: "",
          bloodGroup: "Not recorded",
          status: "No record yet",
          isVaccinated: false,
          image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name || "unknown"}`,
          history: [],
          hasRecord: false,
        });
      });

      if (isSubscribed) setRecords([...realRecords, ...placeholders]);
    };

    const initDb = async () => {
      try {
        const existing = await smartDb.getAll("HealthRecord", user.uid);
        realRecords = ((existing || []) as HealthRecord[]).map((r) => ({ ...r, hasRecord: true }));
        buildMerged();
        await logAccess("Access Registry", `Clinical wellness registry loaded. Viewed ${students.length} student records.`);
      } catch (err) {
        console.error("DB init error:", err);
      }
    };

    initDb();

    const unsubscribe = smartDb.watch("HealthRecord", user.uid, (data) => {
      realRecords = ((data || []) as HealthRecord[]).map((r) => ({ ...r, hasRecord: true }));
      buildMerged();
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [user, students, staff]);

  // Load audit logs in realtime
  useEffect(() => {
    if (!user) {
      setAuditLogs([]);
      return;
    }
    const unsubscribe = smartDb.watch("HealthAuditLog", user.uid, (data) => {
      const sorted = (data || []).sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
      setAuditLogs(sorted.slice(0, 15));
    });
    return () => unsubscribe();
  }, [user]);

  // Opens "New Health Entry" pre-filled for a placeholder row's student —
  // the only real action a "No record yet" row should offer. Edit/Log
  // Checkup/Delete all assume a real HealthRecord row exists in the DB;
  // for a placeholder, PUT/DELETE on that non-existent id silently affect
  // zero rows server-side (MySQL doesn't error on a 0-row UPDATE/DELETE)
  // while still showing a false "success" toast — so those actions must
  // never be offered until a real record has actually been created.
  const openCreateFromPlaceholder = (record: HealthRecord) => {
    const student = students.find((s) => s.id === record.studentId);
    if (student) {
      handleSelectStudent(student);
    } else {
      setNewEntry({ ...EMPTY_NEW, name: record.name, grade: record.grade, allergies: record.allergies || "" });
    }
    setIsAddOpen(true);
  };

  // When a student is picked in the new-entry form, pre-fill from their profile + existing record
  const handleSelectStudent = (student: typeof students[0]) => {
    const existing = records.find((r) => r.studentId === student.id);
    // Extract section from classId if available (e.g., "Grade 10-A" -> "A")
    const section = (student.classId || "").split("-")[1] || "";
    setNewEntry({
      studentId: student.id,
      name: student.name,
      grade: student.classId || "",
      condition: existing?.condition || (student as any).medicalConditions || "None",
      bloodGroup: existing?.bloodGroup || (student as any).bloodGroup || "",
      status: existing?.status || "Healthy",
      isVaccinated: existing?.isVaccinated ?? true,
      allergies: existing?.allergies || (student as any).allergies || "",
      notes: "",
    });
    setStudentPickerOpen(false);
  };

  // Existing health records for the selected student (shown inside the dialog)
  const selectedStudentRecords = useMemo(() => {
    if (!newEntry.studentId) return [];
    return records.filter((r) => r.studentId === newEntry.studentId);
  }, [newEntry.studentId, records]);

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        if (!r || !r.id || !r.name) return false;
        const q = (searchTerm || "").toLowerCase();
        return (
          (!q || ((r.name || "").toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q) || (r.condition || "").toLowerCase().includes(q))) &&
          (statusFilter === "all" || r.status === statusFilter) &&
          (bloodGroupFilter === "all" || r.bloodGroup === bloodGroupFilter)
        );
      }),
    [records, searchTerm, statusFilter, bloodGroupFilter],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, bloodGroupFilter]);

  // Stats reflect only real, nurse-entered records — placeholder "no record
  // yet" rows must never be counted as genuine medical data.
  const stats = useMemo(() => {
    const real = records.filter((r) => r.hasRecord);
    return {
      total: real.length,
      critical: real.filter((r) => r.status === "Recovering" || (r.condition !== "None" && r.status !== "Healthy")).length,
      sickBay: real.filter((r) => r.status === "Recovering").length,
      vaccinationRate: real.length > 0 ? Math.round((real.filter((r) => r.isVaccinated).length / real.length) * 100) : 0,
    };
  }, [records]);

  const handleAddEntry = async () => {
    if (!newEntry.name || !newEntry.bloodGroup) {
      toast.error("Please select a student and choose a blood group");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const id = `HLT-${Date.now()}`;
    const entry: HealthRecord = {
      id,
      studentId: newEntry.studentId,
      name: newEntry.name,
      grade: newEntry.grade,
      type: "student",
      condition: newEntry.condition,
      allergies: newEntry.allergies,
      bloodGroup: newEntry.bloodGroup,
      status: newEntry.status,
      isVaccinated: newEntry.isVaccinated,
      lastCheckup: today,
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newEntry.name}`,
      history: [{ date: today, condition: newEntry.condition, notes: newEntry.notes || "Initial health record entry." }],
    };

    try {
      await smartDb.create("HealthRecord", { ...entry, uid: user?.uid }, id);
      await logAccess("Create Record", `Created health profile for student ${entry.name}.`);
      setNewEntry({ ...EMPTY_NEW });
      setIsAddOpen(false);
      toast.success(`Health record added for ${entry.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add health record");
    }
  };

  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    try {
      await smartDb.update("HealthRecord", editingRecord.id, {
        ...editingRecord,
        updatedAt: new Date().toISOString()
      });
      await logAccess("Update Record", `Updated wellness conditions for ${editingRecord.name}.`);
      setIsEditOpen(false);
      setEditingRecord(null);
      toast.success("Record updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update health record");
    }
  };

  const handleLogCheckup = async (id: string) => {
    const today = new Date().toISOString().split("T")[0];
    const rec = records.find(r => r.id === id);
    if (!rec) return;

    try {
      const updatedHistory = [
        { date: today, condition: rec.condition, notes: "Routine checkup logged." },
        ...(rec.history || [])
      ];
      await smartDb.update("HealthRecord", id, {
        lastCheckup: today,
        status: "Healthy",
        history: updatedHistory
      });
      await logAccess("Log Checkup", `Logged routine wellness checkup for ${rec.name}.`);
      toast.success("Checkup logged!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to log checkup");
    }
  };

  const handleLogNurseVisit = async () => {
    const rec = nurseVisitRecord;
    if (!rec || !rec.studentId) return;
    if (!nurseVisitForm.reason.trim()) { toast.error("Reason for the visit is required"); return; }
    const today = new Date().toISOString().split("T")[0];
    const id = `NV-${rec.studentId}-${Date.now()}`;
    try {
      await smartDb.create("NurseVisit", {
        studentId: rec.studentId, studentName: rec.name,
        reason: nurseVisitForm.reason.trim(), treatment: nurseVisitForm.treatment.trim() || undefined,
        notes: nurseVisitForm.notes.trim() || undefined,
        date: today, status: "Completed",
        uid: user?.uid,
      }, id);
      await logAccess("Log Nurse Visit", `Logged nurse visit for ${rec.name}: ${nurseVisitForm.reason.trim()}.`);
      toast.success("Nurse visit logged");
      setIsNurseVisitOpen(false);
      setNurseVisitForm({ reason: "", treatment: "", notes: "" });
      setNurseVisitRecord(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to log nurse visit");
    }
  };

  // Triggers a real medical emergency alert: updates the health record's
  // status/history AND creates a real Notification (the same authoring path
  // used elsewhere in the app — smartDb.create("Notification", ...) with
  // audienceRole for role-wide targeting and recipientUid for the specific
  // parent, exactly as feeReminderEngine.ts / GatePass.tsx do) so admin,
  // relevant staff, and the student's parent actually see it in their
  // notification bell — not just a local toast to the acting nurse.
  const handleEmergencyAlert = async (record: HealthRecord) => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const updatedHistory = [
        { date: today, condition: "EMERGENCY", notes: "Emergency alert triggered." },
        ...(record.history || [])
      ];

      if (record.hasRecord) {
        await smartDb.update("HealthRecord", record.id, {
          status: "Recovering",
          history: updatedHistory
        });
      } else {
        // No real record existed yet — create one now so the emergency is
        // captured as genuine data instead of silently failing an update.
        await smartDb.create("HealthRecord", {
          ...record,
          status: "Recovering",
          history: updatedHistory,
          uid: user?.uid,
        }, record.id);
      }

      await logAccess("Emergency Alert", `Triggered EMERGENCY status alert for ${record.name}.`);

      // Broadcast a real notification to admin/staff so it appears in their
      // notification bell (not just a toast to the acting nurse).
      const stamp = Date.now();
      const notifTargets: Array<{ id: string; recipientUid?: string; audienceRole?: string }> = [
        { id: `health_emg_${stamp}_admin`, audienceRole: "admin" },
      ];

      // If this is a student with parent contact info, also target the
      // parent(s) directly by email, same pattern as GatePass.tsx's notifyParents.
      if (record.type === "student" && record.studentId) {
        const student = students.find((s) => s.id === record.studentId) as any;
        const parentEmails: string[] = student
          ? [student.fatherEmail, student.motherEmail, student.guardianEmail].filter(Boolean)
          : [];
        parentEmails.forEach((email, i) => {
          notifTargets.push({ id: `health_emg_${stamp}_parent_${i}`, recipientUid: email });
        });
      }

      await Promise.allSettled(
        notifTargets.map((t) =>
          smartDb.create("Notification", {
            id: t.id,
            uid: user?.uid,
            recipientUid: t.recipientUid,
            audienceRole: t.recipientUid ? undefined : t.audienceRole,
            category: record.type === "student" ? "student" : "staff",
            entity: "HealthRecord",
            type: "medical_emergency",
            priority: "critical",
            title: `Medical Emergency: ${record.name}`,
            message: `An emergency alert has been triggered for ${record.name}${record.grade ? ` (${record.grade})` : ""}. Please respond immediately.`,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
            redirectUrl: t.recipientUid ? "/parent/health" : "/students/health",
          }, t.id)
        )
      );

      toast.error(`Emergency alert sent for ${record.name}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send emergency alert");
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      Healthy: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      Recovering: "bg-amber-50 text-amber-700 border border-amber-200",
      Stable: "bg-blue-50 text-blue-700 border border-blue-200",
    };
    return <span className={cn("inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full", map[status] || "bg-slate-100 text-slate-600")}>{status}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Heart className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Health & Wellness Registry</h1>
              <p className="text-sm text-slate-400">Monitor and manage medical history for students and staff.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(studentsLoading || staffLoading) && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Syncing…</span>
              </div>
            )}
            <Button className="bg-[#9810fa] hover:bg-[#8710dc] text-white" onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Health Entry
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Records", value: stats.total, sub: "Active profiles", color: "text-foreground", sub_color: "text-muted-foreground" },
            { label: "Critical Cases", value: stats.critical, sub: "Need attention", color: "text-rose-600", sub_color: "text-rose-400" },
            { label: "Sick Bay Today", value: stats.sickBay, sub: "Currently recovering", color: "text-amber-600", sub_color: "text-amber-400" },
            { label: "Vaccination Rate", value: `${stats.vaccinationRate}%`, sub: "Fully vaccinated", color: "text-emerald-600", sub_color: "text-emerald-400" },
          ].map((s) => (
            <Card key={s.label} className="premium-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-black", s.color)}>{s.value}</div>
                <p className={cn("text-[10px] font-bold mt-1", s.sub_color)}>{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── NEW ENTRY DIALOG ── */}
        <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) setNewEntry({ ...EMPTY_NEW }); }}>
          <DialogContent className="sm:max-w-[560px] rounded-3xl p-0 border-none shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <DialogTitle className="text-xl font-black">New Health Entry</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Select a student — their admission data is pre-filled automatically.</DialogDescription>
            </DialogHeader>

            <div className="px-7 py-5 space-y-5">
              {/* Admission data info banner */}
              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] font-bold text-blue-700">Data collected from Admission Form</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ADMISSION_HEALTH_FIELDS.map((f) => (
                    <div key={f.field} className="bg-white rounded-xl p-2.5 border border-blue-100">
                      <f.icon className="h-3.5 w-3.5 text-blue-400 mb-1" />
                      <p className="text-[10px] font-black text-blue-800">{f.label}</p>
                      <p className="text-[9px] text-blue-500 leading-tight mt-0.5">{f.source}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Student picker — searchable combobox */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Student *</Label>
                <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={studentPickerOpen}
                      className="w-full h-11 justify-between rounded-xl border-slate-200 text-sm font-medium">
                      {newEntry.name ? (
                        <span className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${newEntry.name}`} />
                            <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                              {(newEntry.name || "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          {newEntry.name}
                          {newEntry.grade && <span className="text-[10px] text-muted-foreground">— {newEntry.grade}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search and select student…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[480px] p-0 rounded-2xl shadow-2xl border-none" align="start">
                    <Command className="rounded-2xl">
                      <CommandInput placeholder="Type a name to search…" className="h-11 text-sm" />
                      <CommandList className="max-h-64">
                        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No student found.</CommandEmpty>
                        <CommandGroup heading={`${students.length} students`}>
                          {students.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => handleSelectStudent(s)}
                              className="flex items-center gap-3 py-2 px-3 cursor-pointer"
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                  {(s.name || "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate">{s.name}</p>
                                <p className="text-[10px] text-muted-foreground">{s.classId || "—"} · {s.id}</p>
                              </div>
                              {records.find((r) => r.studentId === s.id) && (
                                <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Has record</Badge>
                              )}
                              {newEntry.studentId === s.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Previous health records — shown once student is selected */}
              {selectedStudentRecords.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-amber-600" />
                    <p className="text-[11px] font-black text-amber-800">Previous Health Records for {newEntry.name}</p>
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {selectedStudentRecords.map((rec) => (
                      <div key={rec.id} className="bg-white rounded-xl p-3 border border-amber-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-slate-800">{rec.condition === "None" ? "No active condition" : rec.condition}</span>
                          {getStatusBadge(rec.status)}
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                          <span>Last checkup: <strong>{rec.lastCheckup}</strong></span>
                          <span>Blood: <strong>{rec.bloodGroup}</strong></span>
                          {rec.isVaccinated && <span className="text-emerald-600 font-bold">✓ Vaccinated</span>}
                        </div>
                        {rec.history.slice(0, 2).map((h, i) => (
                          <div key={i} className="mt-2 pl-3 border-l-2 border-amber-200">
                            <p className="text-[10px] font-bold text-amber-700">{h.date} — {h.condition}</p>
                            <p className="text-[10px] text-muted-foreground">{h.notes}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form fields (pre-filled from admission) */}
              {newEntry.name && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Grade (auto-filled, locked) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grade</Label>
                      <Select value={newEntry.grade} onValueChange={(v) => setNewEntry({ ...newEntry, grade: v })}>
                        <SelectTrigger className="h-10 rounded-xl border-slate-200">
                          <SelectValue placeholder="Select grade" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl max-h-64">
                          {grades.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Blood group (pre-filled from admission if available) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Blood Group *
                        {(students.find(s => s.id === newEntry.studentId) as any)?.bloodGroup && (
                          <span className="ml-1 text-[9px] font-bold text-blue-500 normal-case">(from admission)</span>
                        )}
                      </Label>
                      <Select value={newEntry.bloodGroup} onValueChange={(v) => setNewEntry({ ...newEntry, bloodGroup: v })}>
                        <SelectTrigger className="h-10 rounded-xl border-slate-200">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Medical condition (pre-filled from admission) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Medical Condition
                        {(students.find(s => s.id === newEntry.studentId) as any)?.medicalConditions && (
                          <span className="ml-1 text-[9px] font-bold text-blue-500 normal-case">(from admission)</span>
                        )}
                      </Label>
                      <Input
                        value={newEntry.condition}
                        onChange={(e) => setNewEntry({ ...newEntry, condition: e.target.value })}
                        placeholder="e.g. Asthma, None"
                        className="h-10 rounded-xl border-slate-200 text-sm"
                      />
                    </div>

                    {/* Allergies (pre-filled from admission) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Allergies
                        {(students.find(s => s.id === newEntry.studentId) as any)?.allergies && (
                          <span className="ml-1 text-[9px] font-bold text-blue-500 normal-case">(from admission)</span>
                        )}
                      </Label>
                      <Input
                        value={newEntry.allergies}
                        onChange={(e) => setNewEntry({ ...newEntry, allergies: e.target.value })}
                        placeholder="e.g. Peanuts, None"
                        className="h-10 rounded-xl border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Status</Label>
                      <Select value={newEntry.status} onValueChange={(v) => setNewEntry({ ...newEntry, status: v })}>
                        <SelectTrigger className="h-10 rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          <SelectItem value="Healthy">Healthy</SelectItem>
                          <SelectItem value="Stable">Stable</SelectItem>
                          <SelectItem value="Recovering">Recovering</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Visit Notes</Label>
                      <Input
                        value={newEntry.notes}
                        onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                        placeholder="e.g. Complained of headache"
                        className="h-10 rounded-xl border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEntry.isVaccinated}
                      onChange={(e) => setNewEntry({ ...newEntry, isVaccinated: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-xs font-bold text-slate-600">Student is fully vaccinated</span>
                  </label>
                </div>
              )}
            </div>

            <DialogFooter className="px-7 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
              <Button variant="outline" className="rounded-xl" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddEntry} className="gradient-primary rounded-xl px-6">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Add Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── EDIT DIALOG ── */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[460px] rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
            <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
              <DialogTitle className="text-xl font-black">Edit Health Record</DialogTitle>
              <DialogDescription>Update medical information for {editingRecord?.name}.</DialogDescription>
            </DialogHeader>
            {editingRecord && (
              <div className="px-7 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grade</Label>
                    <Select value={editingRecord.grade} onValueChange={(v) => setEditingRecord({ ...editingRecord, grade: v })}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl max-h-64">
                        {grades.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Blood Group</Label>
                    <Select value={editingRecord.bloodGroup} onValueChange={(v) => setEditingRecord({ ...editingRecord, bloodGroup: v })}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Medical Condition</Label>
                  <Input value={editingRecord.condition} onChange={(e) => setEditingRecord({ ...editingRecord, condition: e.target.value })} className="h-10 rounded-xl border-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Status</Label>
                  <Select value={editingRecord.status} onValueChange={(v) => setEditingRecord({ ...editingRecord, status: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="Healthy">Healthy</SelectItem>
                      <SelectItem value="Stable">Stable</SelectItem>
                      <SelectItem value="Recovering">Recovering</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={editingRecord.isVaccinated}
                    onChange={(e) => setEditingRecord({ ...editingRecord, isVaccinated: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300" />
                  <span className="text-xs font-bold text-slate-600">Student is fully vaccinated</span>
                </label>
              </div>
            )}
            <DialogFooter className="px-7 py-4 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateRecord} className="gradient-primary rounded-xl">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── HISTORY DIALOG ── */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
            <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
              <DialogTitle className="text-xl font-black">Medical History</DialogTitle>
              <DialogDescription>{historyRecord?.name} — chronological health log</DialogDescription>
            </DialogHeader>
            <div className="px-7 py-5 max-h-[420px] overflow-y-auto">
              {historyRecord?.history?.length ? (
                <div className="space-y-4">
                  {historyRecord.history.map((item, i) => (
                    <div key={i} className="relative pl-6 border-l-2 border-primary/20 pb-4 last:pb-0">
                      <div className="absolute left-[-9px] top-0 h-4 w-4 rounded-full bg-primary border-4 border-background" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-primary">{item.date}</span>
                        <Badge variant="outline" className="text-[10px]">{item.condition}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.notes}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12 text-sm">No medical history recorded yet.</p>
              )}
            </div>
            <DialogFooter className="px-7 py-4 border-t border-slate-100">
              <Button onClick={() => setIsHistoryOpen(false)} className="rounded-xl">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isNurseVisitOpen} onOpenChange={(o) => { setIsNurseVisitOpen(o); if (!o) setNurseVisitRecord(null); }}>
          <DialogContent className="sm:max-w-[460px] rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
            <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
              <DialogTitle className="text-xl font-black">Log Nurse Visit</DialogTitle>
              <DialogDescription>{nurseVisitRecord?.name} — visible in the parent portal's Health Records</DialogDescription>
            </DialogHeader>
            <div className="px-7 py-5 space-y-4">
              <div className="space-y-2">
                <Label>Reason for Visit *</Label>
                <Input value={nurseVisitForm.reason} onChange={e => setNurseVisitForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Headache, minor fall, fever check" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Treatment Given</Label>
                <Input value={nurseVisitForm.treatment} onChange={e => setNurseVisitForm(f => ({ ...f, treatment: e.target.value }))}
                  placeholder="e.g. Rest in sick bay, paracetamol" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={nurseVisitForm.notes} onChange={e => setNurseVisitForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes…" className="rounded-xl resize-none" rows={3} />
              </div>
            </div>
            <DialogFooter className="px-7 py-4 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setIsNurseVisitOpen(false)}>Cancel</Button>
              <Button onClick={handleLogNurseVisit} className="gradient-primary rounded-xl px-6">Log Visit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── REGISTRY TABLE ── */}
        <Card className="premium-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <div className="flex flex-col gap-4">
              {/* Search and Title */}
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg font-bold">Medical Registry</CardTitle>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by name or condition…" className="pl-9 h-9 bg-background text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>

              {/* One-click Status Filter Pills */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status Filter</p>
                <div className="flex flex-wrap gap-2">
                  {["all", "Healthy", "Recovering", "Stable"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === s
                          ? "bg-primary text-white shadow-lg shadow-primary/20"
                          : "bg-slate-100 text-slate-600 border border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                      }`}
                    >
                      {s === "all" ? "All Statuses" : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* One-click Blood Group Filter Pills */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Blood Group Filter</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setBloodGroupFilter("all")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      bloodGroupFilter === "all"
                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                        : "bg-slate-100 text-slate-600 border border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                    }`}
                  >
                    All Groups
                  </button>
                  {BLOOD_GROUPS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setBloodGroupFilter(g)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        bloodGroupFilter === g
                          ? "bg-primary text-white shadow-lg shadow-primary/20"
                          : "bg-slate-100 text-slate-600 border border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results Count */}
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                📋 Showing {filteredRecords.length} of {records.length} records
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50 bg-muted/30">
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Member</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Grade / Role</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Condition</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Blood Group</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Last Checkup</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">No records match your filters.</TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.map((record) => (
                    <TableRow key={record.id} className="border-border/40 group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-primary/10">
                            <AvatarImage src={record.image} />
                            <AvatarFallback className="text-[10px] font-bold">{(record.name || "").split(" ").map(n => n[0]).join("")}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-[12px] font-bold group-hover:text-primary transition-colors">{record.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{record.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                          record.type === "student" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700",
                        )}>{record.type}</span>
                      </TableCell>
                      <TableCell className="text-[11px] font-bold">{record.grade || "—"}</TableCell>
                      <TableCell>
                        {!record.hasRecord ? (
                          <span className="text-[11px] text-muted-foreground italic">Not recorded</span>
                        ) : record.condition === "None" ? (
                          <span className="text-[11px] text-muted-foreground italic">No condition</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">{record.condition}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] font-black">
                        {!record.hasRecord ? <span className="text-muted-foreground italic font-normal">Not recorded</span> : record.bloodGroup}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {record.lastCheckup || "—"}
                      </TableCell>
                      <TableCell>
                        {record.hasRecord ? getStatusBadge(record.status) : (
                          <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">No record yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            {record.hasRecord ? (
                              <>
                                <DropdownMenuItem onClick={() => { setHistoryRecord(record); setIsHistoryOpen(true); }}>
                                  <FileText className="mr-2 h-4 w-4" /> Medical History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setEditingRecord({ ...record }); setIsEditOpen(true); }}>
                                  <Activity className="mr-2 h-4 w-4" /> Edit Record
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleLogCheckup(record.id)}>
                                  <History className="mr-2 h-4 w-4" /> Log Checkup
                                </DropdownMenuItem>
                                {record.type === "student" && record.studentId && (
                                  <DropdownMenuItem onClick={() => { setNurseVisitRecord(record); setNurseVisitForm({ reason: "", treatment: "", notes: "" }); setIsNurseVisitOpen(true); }}>
                                    <Clock className="mr-2 h-4 w-4" /> Log Nurse Visit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-rose-600" onClick={() => handleEmergencyAlert(record)}>
                                  <AlertCircle className="mr-2 h-4 w-4" /> Emergency Alert
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={async () => {
                                  try {
                                    await smartDb.delete("HealthRecord", record.id);
                                    await logAccess("Delete Record", `Permanently removed health card for ${record.name}.`);
                                    toast.success("Record deleted");
                                  } catch (err) {
                                    console.error(err);
                                    toast.error("Failed to delete record");
                                  }
                                }}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete Record
                                </DropdownMenuItem>
                              </>
                            ) : (
                              // No real HealthRecord exists yet — Edit/Log Checkup/
                              // Delete would PUT/DELETE a non-existent id, which
                              // silently no-ops server-side while still showing a
                              // false "success" toast. Only offer actions that
                              // genuinely create/touch a real record.
                              <>
                                <DropdownMenuItem onClick={() => openCreateFromPlaceholder(record)}>
                                  <Plus className="mr-2 h-4 w-4" /> Create Health Record
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-rose-600" onClick={() => handleEmergencyAlert(record)}>
                                  <AlertCircle className="mr-2 h-4 w-4" /> Emergency Alert
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 font-medium">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length} records
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
          </CardContent>
        </Card>

        {/* HIPAA / GDPR Access & Privacy Audit Log Panel */}
        <Card className="premium-card mt-6">
          <CardHeader className="pb-2 border-b border-slate-100/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                HIPAA & GDPR Clinical Privacy Audit Log
              </CardTitle>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Real-time access trails tracking clinical profile searches, medical logs, and emergency updates.</p>
            </div>
            <Badge className="bg-violet-100 text-violet-700 border-none rounded-full text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5">Protected Access</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                    <th className="text-left px-5 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Authorized User</th>
                    <th className="text-left px-5 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                    <th className="text-left px-5 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Activity Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                        No recent privacy access audits recorded.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-50/60 hover:bg-slate-50/30 transition-all">
                        <td className="px-5 py-2.5 text-slate-500 font-mono text-[10px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-5 py-2.5 font-bold text-slate-700">
                          {log.actor}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                            log.action.includes("Emergency") ? "bg-rose-100 text-rose-700" :
                            log.action.includes("Delete") ? "bg-red-100 text-red-700" :
                            log.action.includes("Create") || log.action.includes("Update") ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-slate-600 font-medium">
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
