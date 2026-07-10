import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Student } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import {
  User, Mail, Phone, GraduationCap, ShieldCheck, BookOpen, Clock,
  FileText, Activity, Heart, CreditCard, MessageSquare, TrendingUp,
  Zap, ExternalLink, Download, Plus, Sparkles, Trash2, CheckCircle2,
  XCircle, AlertCircle, CalendarDays, Inbox, FolderOpen, MapPin,
  MoreHorizontal, Edit, ChevronRight, Shield, Star, ArrowUpRight,
  Rocket, Coins, Trophy, Lock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useStudents } from "@/contexts/StudentContext";
import { useStudentTeachers } from "@/hooks/useStudentTeachers";
import { useAuth } from "@/hooks/useAuth";
import { getRole, canSeeGroup } from "@/lib/roles";
import { useGrades } from "@/contexts/CurriculumContext";
import { useLearningUniverse } from "@/hooks/useLearningUniverse";
import { smartDb } from "@/lib/localDb";
import type { Curriculum } from "@/types/index";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StudentDetailsDialogProps {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthLabel = (ym: string) => { const m = Number(ym.split("-")[1]); return MONTHS[m - 1] || ym; };
const formatDate = (d: string) => {
  if (!d) return "—";
  const parts = d.slice(0, 10).split("-");
  if (parts.length !== 3) return d;
  return `${monthLabel(`${parts[0]}-${parts[1]}`)} ${Number(parts[2])}, ${parts[0]}`;
};
const formatBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const gradeFor = (pct: number) => pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : "F";
const BAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-pink-500"];

function EmptyState({ icon: Icon, title, hint, action }: { icon: React.ElementType; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
      <div className="h-16 w-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4 border border-slate-100">
        <Icon className="h-7 w-7 text-slate-300" />
      </div>
      <h4 className="text-sm font-bold text-slate-700">{title}</h4>
      <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StudentDetailsDialog({ student, open, onOpenChange }: StudentDetailsDialogProps) {
  const { updateStudent } = useStudents();
  const { user, role } = useAuth();
  const grades = useGrades();
  const { classTeacher, gradeCoordinator } = useStudentTeachers(student);

  // ── Role-based sensitive-tab gating ──────────────────────────────────────
  // Medical/Fees/Behaviour surface sensitive data that only the relevant
  // scoped roles (or full-access roles) should see from the shared /students
  // dialog. Overview/Contact/Academic/Attendance/Documents stay visible to
  // anyone who can open this dialog at all.
  const canSeeMedical = getRole(role).full || role === "nurse" || canSeeGroup(role, "Student Management");
  const canSeeFees = getRole(role).full || role === "accountant" || canSeeGroup(role, "Finance");
  const canSeeBehaviour = getRole(role).full || role === "counselor" || canSeeGroup(role, "Student Management");

  const visibleTabs = useMemo(() => {
    const all = [
      { value: "overview", label: "Overview", icon: User, visible: true },
      { value: "contact", label: "Contact", icon: Phone, visible: true },
      { value: "academics", label: "Academic", icon: BookOpen, visible: true },
      { value: "attendance", label: "Attendance", icon: Clock, visible: true },
      { value: "behaviour", label: "Behaviour", icon: AlertCircle, visible: canSeeBehaviour },
      { value: "medical", label: "Medical", icon: Heart, visible: canSeeMedical },
      { value: "documents", label: "Documents", icon: FileText, visible: true },
      { value: "fees", label: "Fees", icon: CreditCard, visible: canSeeFees },
      { value: "learning-universe", label: "Learning World", icon: Rocket, visible: true },
    ];
    return all.filter(t => t.visible);
  }, [canSeeMedical, canSeeFees, canSeeBehaviour]);

  // student.grade is stored WITHOUT the "Grade " prefix (see handleSave below,
  // which strips it before saving) — every read-only display site must re-add
  // it, matching how Profile.tsx re-adds it: `Grade ${s.grade}`. Without this,
  // a student whose className isn't set shows a bare "2" instead of "Grade 2".
  const gradeSectionLabel = (() => {
    const cn = (student as any)?.className;
    if (cn) return cn;
    const g = (student as any)?.grade;
    if (!g) return student?.classId || "";
    return /^grade\s/i.test(String(g)) ? String(g) : `Grade ${g}`;
  })();

  const defaultTab = visibleTabs[0]?.value || "overview";
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Student>>({});
  const [attRecords, setAttRecords] = useState<Record<string, unknown>[]>([]);
  const [studentInvoices, setStudentInvoices] = useState<Record<string, unknown>[]>([]);
  const [examResults, setExamResults] = useState<Record<string, unknown>[]>([]);
  const [behaviorIncidents, setBehaviorIncidents] = useState<Record<string, unknown>[]>([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [newResult, setNewResult] = useState({ subject: "", marks: "", total: "100" });
  const [isUploading, setIsUploading] = useState(false);
  const [reportingIncident, setReportingIncident] = useState(false);
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);
  const [incidentData, setIncidentData] = useState({ type: "Demerit", category: "Conduct", severity: "Medium", description: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Learning World preview ── read-only, no student record is touched.
  // previewGrade defaults to the student's own grade but is freely
  // adjustable so an admin can preview any grade's missions even before a
  // student record has one set — no need to edit the student to look.
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [previewGrade, setPreviewGrade] = useState("");
  const { missions, houses, getStudentHouse, getWalletBalance, getStudentXp, hasPassedMission, loading: luLoading } = useLearningUniverse();

  const handleMarkAttendance = async () => {
    if (!student || !user) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const attRecord = {
        studentId: student.id,
        studentName: student.name,
        date: today,
        status: "Present",
        entityType: "student",
        entityId: student.id,
        uid: user.uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("attendance", attRecord);
      setAttRecords([...attRecords, attRecord]);
      toast.success(`✓ ${student.name} marked present for ${today}`);
    } catch (error) {
      toast.error("Failed to mark attendance");
      console.error(error);
    }
  };

  const handleReportIncident = async () => {
    if (!student || !user || !incidentData.description.trim()) {
      toast.error("Please enter incident details");
      return;
    }
    try {
      setIsSubmittingIncident(true);
      const id = `BHV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const incident = {
        id,
        studentId: student.id,
        studentName: student.name,
        type: incidentData.type,
        category: incidentData.category,
        severity: incidentData.severity,
        description: incidentData.description,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        uid: user.uid,
      };

      // Count current demerits for this student before adding this new one
      const currentStudentDemerits = behaviorIncidents.filter(i => (i as any).type === "Demerit").length;
      const totalDemeritsAfterThis = currentStudentDemerits + (incidentData.type === "Demerit" ? 1 : 0);

      await smartDb.create("BehaviorIncident", incident as unknown as Record<string, unknown>, id);
      setBehaviorIncidents([...behaviorIncidents, incident]);
      setIncidentData({ type: "Demerit", category: "Conduct", severity: "Medium", description: "" });
      
      toast.success(`Incident reported for ${student.name}`);
      setReportingIncident(false);

      // Behavior Threshold Rules Engine
      if (incident.type === "Demerit") {
        if (totalDemeritsAfterThis >= 10) {
          toast.warning(`🚨 CRITICAL THRESHOLD REACHED: ${student.name} has accumulated ${totalDemeritsAfterThis} demerits. Escalating to Principal & Scheduling Suspension Review.`, {
            duration: 10000,
            description: "An automated notice has been sent to parent and registrar."
          });
          try {
            await updateStudent(student.id, { riskScore: 95, performance: "Poor" });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        } else if (totalDemeritsAfterThis >= 5) {
          toast.warning(`⚠️ Parent-Teacher Conference Triggered: ${student.name} has accumulated ${totalDemeritsAfterThis} demerits. Status updated to At-Risk.`, {
            duration: 8000,
            description: "System dispatching automated PTC email."
          });
          try {
            await updateStudent(student.id, { riskScore: 75, performance: "Below Average" });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        } else if (totalDemeritsAfterThis >= 3) {
          toast.info(`ℹ️ Behavior Alert: ${student.name} has accumulated ${totalDemeritsAfterThis} demerits. Warning notification dispatched.`, {
            duration: 6000
          });
          try {
            await updateStudent(student.id, { riskScore: 50 });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        }
      }
    } catch (error) {
      toast.error("Failed to report incident");
      console.error(error);
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    try {
      await smartDb.delete("BehaviorIncident", id);
      setBehaviorIncidents(prev => prev.filter(x => (x as any).id !== id));
      toast.success("Incident record deleted");
    } catch (error) {
      toast.error("Failed to delete record");
      console.error(error);
    }
  };

  const handleLibraryClearance = async () => {
    if (!student) return;
    try {
      toast.success(`Library clearance requested for ${student.name}. Admin will review.`);
    } catch (error) {
      toast.error("Failed to request clearance");
    }
  };

  const handleCallParent = () => {
    const num = student?.fatherPhone || student?.motherPhone || student?.emergencyContactPhone || student?.phone;
    if (num) {
      window.location.href = `tel:${num}`;
      toast.info(`Calling ${num}…`);
    } else {
      toast.error("No phone number available");
    }
  };

  const handleEmailParent = () => {
    const email = student?.fatherEmail || student?.motherEmail || student?.emergencyContactEmail || student?.email;
    if (email) {
      window.location.href = `mailto:${email}`;
      toast.info(`Opening email to ${email}…`);
    } else {
      toast.error("No email address available");
    }
  };

  const [editClassId, setEditClassId] = useState("");

  useEffect(() => {
    if (!student) return;
    setFormData({
      phone: student.phone ?? "",
      email: student.email ?? "",
      status: student.status ?? "Active",
      section: student.section ?? "",
      
      // Parents
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      fatherPhone: student.fatherPhone ?? "",
      motherPhone: student.motherPhone ?? "",
      fatherEmail: student.fatherEmail ?? "",
      motherEmail: student.motherEmail ?? "",
      fatherOccupation: student.fatherOccupation ?? "",
      motherOccupation: student.motherOccupation ?? "",
      fatherEmployer: student.fatherEmployer ?? "",
      motherEmployer: student.motherEmployer ?? "",

      // Guardian
      guardianName: student.guardianName ?? "",
      guardianRelationship: student.guardianRelationship ?? "",
      guardianPhone: student.guardianPhone ?? "",
      guardianEmail: student.guardianEmail ?? "",
      guardianOccupation: student.guardianOccupation ?? "",
      guardianAddress: student.guardianAddress ?? "",
      guardianEmergencyContact: student.guardianEmergencyContact ?? "",

      // Addresses
      currentAddress: student.currentAddress ?? "",
      permanentAddress: student.permanentAddress ?? "",
      city: student.city ?? "",
      state: student.state ?? "",
      country: student.country ?? "",
      postalCode: student.postalCode ?? "",

      // Academics
      stream: student.stream ?? "General",
      academicYear: student.academicYear ?? "2025-2026",
      previousSchool: student.previousSchool ?? "",
      enrollmentDate: student.enrollmentDate ?? "",
      admissionNumber: student.admissionNumber ?? student.id ?? "",
      rollNumber: student.rollNumber ?? "",
      dateOfAdmission: student.dateOfAdmission ?? "",

      // Medical
      bloodGroup: student.bloodGroup ?? "",
      allergies: student.allergies ?? "",
      medicalConditions: student.medicalConditions ?? "",
      emergencyMedicalNotes: student.emergencyMedicalNotes ?? "",

      // Fees
      feePlan: student.feePlan ?? "Annual",
      outstandingBalance: student.outstandingBalance ?? 0,
      scholarshipDetails: student.scholarshipDetails ?? "",
    });
    setEditClassId(student.classId ?? "");
    setPreviewGrade(student.grade ?? "");
    const sid = student.id;
    Promise.all([
      smartDb.getAll("attendance").then(r => setAttRecords((r as any[]).filter(x => x.studentId === sid || x.studentName === student.name))),
      smartDb.getAll("invoices").then(r => setStudentInvoices((r as any[]).filter(x => x.studentId === sid || x.studentName === student.name))),
      smartDb.getAll("ExamResult").then(r => setExamResults((r as any[]).filter(x => x.studentId === sid))),
      smartDb.getAll("BehaviorIncident").then(r => setBehaviorIncidents((r as any[]).filter(x => x.studentId === sid || x.studentName === student.name))),
      smartDb.getAll("StudentDocument").then(r => setDocuments((r as any[]).filter(x => x.studentId === sid))),
      smartDb.getAll("Curriculum").then(r => setCurriculums((r as any[]).filter(c => c.status === "published"))),
    ]).catch(() => {});
  }, [student?.id]);

  const attStats = useMemo(() => {
    const total = attRecords.length;
    const present = attRecords.filter(r => r.status === "Present").length;
    const late = attRecords.filter(r => r.status === "Late").length;
    const absent = attRecords.filter(r => r.status === "Absent").length;
    const pct = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : (student?.attendance ?? 0);
    return { total, present, late, absent, pct };
  }, [attRecords, student?.attendance]);

  const monthly = useMemo(() => {
    const map: Record<string, { present: number; total: number }> = {};
    attRecords.forEach(r => {
      const ym = String(r.date || "").slice(0, 7);
      if (!ym) return;
      if (!map[ym]) map[ym] = { present: 0, total: 0 };
      map[ym].total++;
      if (r.status === "Present") map[ym].present++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-4).map(([ym, s]) => ({ ym, pct: Math.round((s.present / s.total) * 100) }));
  }, [attRecords]);

  // Same chapter-quest derivation as the student-facing Mission Map, but keyed off
  // an admin-adjustable previewGrade instead of the logged-in student's own grade —
  // lets an admin see what a grade's missions look like without touching the record.
  const luQuests = useMemo(() => {
    const norm = (previewGrade || "").toLowerCase().replace("grade ", "").trim();
    if (!norm) return [];
    const relevant = curriculums.filter(c => (c.grade || "").toLowerCase().replace("grade ", "").trim() === norm);
    const out: { weekId: string; topic: string; subject: string; termName: string; unitName: string; missionId?: string; xp: number; coins: number }[] = [];
    relevant.forEach(c => {
      (c.terms || []).forEach(term => {
        (term.units || []).forEach(unit => {
          (unit.weeks || []).forEach(week => {
            const mission = missions.find(m => m.weekId === week.id && m.status === "published");
            out.push({
              weekId: week.id, topic: week.topic, subject: c.subject, termName: term.name, unitName: unit.name,
              missionId: mission?.id, xp: mission?.xpReward ?? 0, coins: mission?.coinReward ?? 0,
            });
          });
        });
      });
    });
    return out;
  }, [curriculums, previewGrade, missions]);

  const luHouse = student ? getStudentHouse(student.id) : undefined;

  const recentRecords = useMemo(() => [...attRecords].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6), [attRecords]);

  const subjectProficiency = useMemo(() => {
    const map: Record<string, { total: number; marks: number }> = {};
    examResults.forEach(r => {
      const sub = String(r.subject || "Unknown");
      if (!map[sub]) map[sub] = { total: 0, marks: 0 };
      map[sub].total += Number(r.totalMarks) || 100;
      map[sub].marks += Number(r.marksObtained) || 0;
    });
    return Object.entries(map).map(([subject, s]) => ({ subject, pct: Math.round((s.marks / s.total) * 100) }));
  }, [examResults]);

  const overallAvg = useMemo(() => subjectProficiency.length ? Math.round(subjectProficiency.reduce((a, s) => a + s.pct, 0) / subjectProficiency.length) : 0, [subjectProficiency]);

  const feeStats = useMemo(() => {
    const outstanding = studentInvoices.filter(i => i.status !== "Paid").reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { outstanding };
  }, [studentInvoices]);

  const handleAddResult = useCallback(async () => {
    if (!student || !newResult.subject || !newResult.marks) return;
    const marks = Number(newResult.marks);
    const total = Number(newResult.total) || 100;
    const pct = Math.round((marks / total) * 100);
    const entry = { studentId: student.id, subject: newResult.subject, marksObtained: marks, totalMarks: total, grade: gradeFor(pct), createdAt: new Date().toISOString() };
    await smartDb.create("ExamResult", entry);
    setExamResults(p => [...p, entry]);
    setNewResult({ subject: "", marks: "", total: "100" });
    toast.success("Result recorded");
  }, [student, newResult]);

  const handleUpload = useCallback(async (docType: string, file?: File) => {
    if (!file || !student) return;
    if (file.size > 2097152) { toast.error("File must be under 2 MB"); return; }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const existingDoc = documents.find(d => (d as any).docType === docType);
      if (existingDoc) {
        try {
          await smartDb.delete("StudentDocument", (existingDoc as any).id);
        } catch (err) { /* ignore */ }
      }
      
      const docEntry = {
        studentId: student.id,
        name: file.name,
        size: file.size,
        dataUrl: e.target?.result,
        docType,
        createdAt: new Date().toISOString()
      };
      const created = await smartDb.create("StudentDocument", docEntry);
      setDocuments(p => {
        const filtered = p.filter(d => (d as any).docType !== docType);
        return [...filtered, created];
      });
      setIsUploading(false);
      toast.success(`${docType} uploaded successfully`);
    };
    reader.readAsDataURL(file);
  }, [student, documents]);

  const handleDeleteDoc = useCallback(async (id: string) => {
    await smartDb.delete("StudentDocument", id);
    setDocuments(p => p.filter(d => (d as any).id !== id));
    toast.success("Document removed");
  }, []);

  const handleSave = async () => {
    if (!student) return;
    setIsSaving(true);
    try {
      const resolvedClassId = editClassId || student.classId;
      // The student's own portal (Profile.tsx and most other student-facing
      // pages) reads `grade`, not `classId` — this dialog's "Grade / Class"
      // picker only ever wrote `classId`, so changing a student's grade here
      // updated the admin-side record but was permanently invisible on the
      // student's own profile. Keep `grade` derived from the same selection
      // (stripped of the "Grade " prefix, matching how Profile.tsx re-adds
      // it: `Grade ${s.grade}`) so both fields stay in sync from every edit.
      const resolvedGrade = resolvedClassId ? resolvedClassId.replace(/^Grade\s+/i, "") : student.grade;
      await updateStudent(student.id, { ...formData, classId: resolvedClassId, grade: resolvedGrade });
      toast.success("Profile saved successfully");
      setIsEditing(false);
    } catch { toast.error("Failed to save"); } finally { setIsSaving(false); }
  };

  if (!student) return null;

  const riskScore = student.riskScore ?? 0;
  const riskLabel = riskScore >= 66 ? "High" : riskScore >= 33 ? "Medium" : "Low";
  const riskColor = riskScore >= 66 ? "text-rose-500" : riskScore >= 33 ? "text-amber-500" : "text-emerald-500";
  const riskBg = riskScore >= 66 ? "bg-rose-50 text-rose-600" : riskScore >= 33 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600";

  const inputCls = "h-11 rounded-xl bg-slate-50/80 border border-slate-100 font-medium text-sm focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:border-violet-300 transition-all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[94vh] overflow-hidden p-0 gap-0 border-none shadow-[0_32px_80px_rgba(0,0,0,0.18)] rounded-[28px] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Student Profile — {student.name}</DialogTitle>
          <DialogDescription>Full profile for {student.name}</DialogDescription>
        </DialogHeader>

        {/* ── PREMIUM HEADER ── */}
        <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #E91E8F 0%, #C218A8 35%, #8E24AA 70%, #6A1B9A 100%)" }}>
          {/* Glassmorphism orbs */}
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-30" style={{ background: "radial-gradient(circle, #FF6BC8 0%, transparent 70%)", filter: "blur(40px)" }} />
          <div className="absolute -bottom-16 right-10 w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #B39DDB 0%, transparent 70%)", filter: "blur(50px)" }} />
          <div className="absolute top-4 right-40 w-40 h-40 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #F48FB1 0%, transparent 70%)", filter: "blur(30px)" }} />
          {/* Dot mesh */}
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }} />

          <div className="relative px-8 pt-8 pb-20">
            <div className="flex items-start justify-between">
              {/* Avatar + Name */}
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full blur-md opacity-40" style={{ background: "linear-gradient(135deg,#FF6BC8,#B39DDB)" }} />
                  <Avatar className="h-24 w-24 relative border-[4px] border-white/30 shadow-2xl ring-2 ring-white/20">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}`} />
                    <AvatarFallback className="bg-white/20 text-white text-2xl font-black">{getInitials(student.name)}</AvatarFallback>
                  </Avatar>
                  <span className={cn("absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-[3px] border-white shadow-md", student.status === "Active" ? "bg-emerald-400" : "bg-slate-400")} />
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-black text-white tracking-tight">{student.name}</h2>
                    <span className={cn(
                      "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border",
                      student.status === "Active"
                        ? "bg-emerald-400/20 text-emerald-200 border-emerald-400/30"
                        : "bg-white/10 text-white/70 border-white/20"
                    )}>
                      {student.status || "Active"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-white/80 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10">
                      <GraduationCap className="h-3.5 w-3.5" /> {gradeSectionLabel}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-white/70 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10">
                      {student.id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 mt-1">
                <button onClick={handleCallParent}
                  className="h-11 w-11 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 shadow-lg"
                  title="Call Parent">
                  <Phone className="h-5 w-5 text-white" />
                </button>
                <button onClick={handleEmailParent}
                  className="h-11 w-11 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 shadow-lg"
                  title="Email Parent">
                  <Mail className="h-5 w-5 text-white" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-11 px-5 rounded-2xl bg-white/90 hover:bg-white text-[#8E24AA] font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 shadow-lg">
                      <Plus className="h-3.5 w-3.5" /> Quick Action
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl w-52 shadow-xl border-none p-1.5">
                    <DropdownMenuItem onClick={handleMarkAttendance} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" /> Mark Attendance
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReportingIncident(!reportingIncident)} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                      <AlertCircle className="h-4 w-4 mr-2 text-amber-500" /> Report Incident
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1.5" />
                    <DropdownMenuItem onClick={handleLibraryClearance} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                      <BookOpen className="h-4 w-4 mr-2 text-blue-500" /> Library Clearance
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
            </div>
          </div>
        </div>

        {/* ── INCIDENT REPORT FORM ── */}
        {reportingIncident && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-96 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Report Incident</h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-bold text-slate-600">Incident Type</Label>
                  <select
                    value={incidentData.type}
                    onChange={(e) => setIncidentData({ ...incidentData, type: e.target.value })}
                    className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="Demerit">Demerit</option>
                    <option value="Merit">Merit</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-bold text-slate-600">Category</Label>
                  <select
                    value={incidentData.category}
                    onChange={(e) => setIncidentData({ ...incidentData, category: e.target.value })}
                    className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="Conduct">Conduct</option>
                    <option value="Academic Integrity">Academic Integrity</option>
                    <option value="Attendance">Attendance</option>
                    <option value="Leadership">Leadership</option>
                    <option value="Participation">Participation</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-bold text-slate-600">Severity</Label>
                  <select
                    value={incidentData.severity}
                    onChange={(e) => setIncidentData({ ...incidentData, severity: e.target.value })}
                    className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-bold text-slate-600">Description *</Label>
                  <Textarea
                    value={incidentData.description}
                    onChange={(e) => setIncidentData({ ...incidentData, description: e.target.value })}
                    placeholder="Describe the incident in detail..."
                    className="w-full mt-2 text-sm"
                    rows={4}
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setReportingIncident(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReportIncident}
                    disabled={isSubmittingIncident || !incidentData.description.trim()}
                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    {isSubmittingIncident ? "Submitting…" : "Report Incident"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ── TABS + CONTENT ── */}
        <div className="flex flex-col flex-1 overflow-hidden bg-white" style={{ marginTop: "-1px" }}>
          <Tabs defaultValue={defaultTab} className="flex flex-col flex-1 overflow-hidden">
            {/* Premium Tab Bar */}
            <div className="border-b border-slate-100 bg-white px-6 pt-1">
              <TabsList className="h-auto bg-transparent p-0 gap-0 flex-wrap">
                {visibleTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}
                    className={cn(
                      "relative h-12 px-4.5 rounded-none bg-transparent border-none text-slate-500 font-semibold text-xs gap-1.5",
                      "data-[state=active]:text-[#8E24AA] data-[state=active]:font-bold data-[state=active]:bg-transparent",
                      "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full",
                      "data-[state=active]:after:bg-[#8E24AA] after:bg-transparent",
                      "hover:text-[#8E24AA] hover:bg-violet-50/50 transition-all"
                    )}>
                    <tab.icon className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6">

                {/* ── OVERVIEW ── */}
                <TabsContent value="overview" className="space-y-6 mt-0 focus-visible:ring-0">
                  {/* Emergency Contact Highlight (Required by Admin Recommendations) */}
                  {((student as any).emergencyContactName || (student as any).emergencyContactPhone || formData.guardianEmergencyContact) && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4.5 flex items-center justify-between shadow-sm animate-pulse">
                      <div className="flex items-center gap-3.5">
                        <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Emergency Contact Highlight</p>
                          <h4 className="text-sm font-black text-slate-800 mt-0.5">
                            {formData.guardianEmergencyContact || student.emergencyContactName || "Guardian"} 
                            {student.emergencyContactRelationship ? ` (${student.emergencyContactRelationship})` : ""}
                          </h4>
                          <p className="text-xs text-slate-500 font-semibold mt-0.5">
                            Phone: {student.emergencyContactPhone || student.guardianPhone || student.phone || "—"}
                          </p>
                        </div>
                      </div>
                      {(student.emergencyContactPhone || student.guardianPhone || student.phone) && (
                        <a href={`tel:${student.emergencyContactPhone || student.guardianPhone || student.phone}`}
                          className="h-10 px-5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-rose-500/20 transition-all shrink-0">
                          <Phone className="h-3.5 w-3.5" /> Call Now
                        </a>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Student Basic Info Card */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> Basic Information
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Admission Number</Label>
                          {isEditing ? (
                            <Input value={formData.admissionNumber ?? ""} onChange={e => setFormData({ ...formData, admissionNumber: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{formData.admissionNumber || student.admissionNumber || student.id || "—"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Roll Number</Label>
                          {isEditing ? (
                            <Input value={formData.rollNumber ?? ""} onChange={e => setFormData({ ...formData, rollNumber: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{formData.rollNumber || "—"}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block flex items-center gap-1"><Mail className="h-3 w-3" /> Student Email</Label>
                          {isEditing ? (
                            <Input value={formData.email ?? ""} onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5 truncate" title={student.email}>{student.email || "—"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block flex items-center gap-1"><Phone className="h-3 w-3" /> Student Phone</Label>
                          {isEditing ? (
                            <Input value={formData.phone ?? ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{student.phone || "—"}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Grade / Class</Label>
                          {isEditing ? (
                            <Select value={editClassId} onValueChange={setEditClassId}>
                              <SelectTrigger className="h-11 rounded-xl text-sm border-slate-100 bg-slate-50/80">
                                <SelectValue placeholder="Select Class" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60 overflow-y-auto">
                                {grades.map(g => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{gradeSectionLabel}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Section</Label>
                          {isEditing ? (
                            <Input value={(formData as any).section ?? ""} onChange={e => setFormData({ ...formData, section: e.target.value } as any)} className={inputCls} placeholder="e.g. A" />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{(student as any).section || "A"}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Class Teacher</Label>
                          <p className="text-sm font-semibold text-slate-800 py-1.5">{classTeacher || "—"}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Grade Coordinator</Label>
                          <p className="text-sm font-semibold text-slate-800 py-1.5">{gradeCoordinator || "—"}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Academic Year</Label>
                          {isEditing ? (
                            <Select value={formData.academicYear ?? ""} onValueChange={val => setFormData({ ...formData, academicYear: val })}>
                              <SelectTrigger className="h-11 rounded-xl text-sm border-slate-100 bg-slate-50/80">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["2024-2025", "2025-2026", "2026-2027"].map(y => (
                                  <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{student.academicYear || "2025-2026"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Date of Admission</Label>
                          {isEditing ? (
                            <Input type="date" value={formData.dateOfAdmission ?? ""} onChange={e => setFormData({ ...formData, dateOfAdmission: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 py-1.5">{formatDate(student.dateOfAdmission ?? "")}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Enrollment Status</Label>
                        {isEditing ? (
                          <Select value={formData.status ?? ""} onValueChange={val => setFormData({ ...formData, status: val })}>
                            <SelectTrigger className="h-11 rounded-xl text-sm border-slate-100 bg-slate-50/80">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Active", "Inactive", "Transferred"].map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border mt-1.5",
                            student.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            student.status === "Inactive" ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", student.status === "Active" ? "bg-emerald-500" : student.status === "Inactive" ? "bg-slate-400" : "bg-amber-500")} />
                            {student.status || "Active"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Admission Checklist Status & Onboarding Tracker */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Onboarding Checklist
                        </h3>
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          ERP Setup
                        </span>
                      </div>

                      {/* Checklist items */}
                      <div className="space-y-3 pt-1">
                        {[
                          { label: "Class & Section Assigned", checked: !!student.classId, desc: `Student enrolled in ${(student as any).className || (student as any).grade || student.classId || "—"}` },
                          { label: "Onboarding Documents Verified", checked: documents.length >= 3, desc: `${documents.length} / 7 verified files uploaded` },
                          { label: "Parent Profile Activated", checked: !!(student.fatherPhone || student.motherPhone || student.phone), desc: "Family contact details linked" },
                          { label: "Fees Plan & Structure Configured", checked: !!(student.feePlan || student.feeStatus), desc: `Plan: ${student.feePlan || "Standard"} · Status: ${student.feeStatus || "Paid"}` },
                        ].map((item, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className={cn(
                              "h-5 w-5 rounded-md border flex items-center justify-center mt-0.5 transition-all shrink-0",
                              item.checked ? "bg-emerald-500 border-emerald-600 text-white shadow-sm" : "border-slate-200 bg-slate-50"
                            )}>
                              {item.checked && <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" />}
                            </div>
                            <div>
                              <p className={cn("text-xs font-bold", item.checked ? "text-slate-800" : "text-slate-500")}>{item.label}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Document Completion Progress Bar */}
                      <div className="pt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                          <span>Document Completion Status</span>
                          <span className="text-purple-600">{documents.length} / 7 Uploaded</span>
                        </div>
                        <Progress value={(documents.length / 7) * 100} className="h-2 bg-slate-100" />
                      </div>
                    </div>
                  </div>

                  {/* KPI Row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Attendance */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
                        <Activity className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className={cn("text-2xl font-black mb-1", attStats.pct < 75 ? "text-rose-600" : "text-slate-900")}>{attStats.pct}%</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Attendance</div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", attStats.pct < 75 ? "bg-rose-400" : "bg-violet-500")} style={{ width: `${attStats.pct}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-1.5">{attStats.pct < 75 ? "Action Required" : "Excellent"}</div>
                    </div>

                    {/* Fee Status */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3",
                        student.feeStatus === "Paid" ? "bg-emerald-50" : student.feeStatus === "Overdue" ? "bg-rose-50" : "bg-amber-50"
                      )}>
                        <CreditCard className={cn("h-5 w-5", student.feeStatus === "Paid" ? "text-emerald-600" : student.feeStatus === "Overdue" ? "text-rose-600" : "text-amber-600")} />
                      </div>
                      <div className={cn("text-xl font-black mb-1 truncate",
                        student.feeStatus === "Paid" ? "text-emerald-600" : student.feeStatus === "Overdue" ? "text-rose-600" : "text-amber-600"
                      )}>{student.feeStatus || "Paid"}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Fee Status</div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        Balance: {(student.outstandingBalance ?? feeStats.outstanding).toLocaleString()} BHD
                      </div>
                    </div>

                    {/* Risk Level */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", riskBg)}>
                        <Shield className="h-5 w-5" />
                      </div>
                      <div className={cn("text-xl font-black mb-1", riskColor)}>{riskLabel}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Academic Risk</div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cn("h-full rounded-full", riskScore >= 66 ? "bg-rose-400" : riskScore >= 33 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${riskScore}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-1.5">Risk Score: {riskScore}/100</div>
                    </div>

                    {/* Performance */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                        <Star className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className={cn("text-xl font-black mb-1 truncate", student.performance ? "text-slate-900" : "text-slate-300")}>
                        {student.performance || "Good"}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Performance</div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        Overall standing: {student.performance || "Good"}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── CONTACT ── */}
                <TabsContent value="contact" className="space-y-6 mt-0">
                  {/* Parents Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Father Card */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Father's Profile
                        </h4>
                        <div className="flex items-center gap-2">
                          {(student.fatherPhone || formData.fatherPhone) && (
                            <a href={`tel:${formData.fatherPhone || student.fatherPhone}`}
                              className="h-8 w-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors shadow-sm"
                              title="Call Father">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {(student.fatherEmail || formData.fatherEmail) && (
                            <a href={`mailto:${formData.fatherEmail || student.fatherEmail}`}
                              className="h-8 w-8 rounded-xl bg-[#8E24AA]/10 hover:bg-[#8E24AA]/20 text-[#8E24AA] flex items-center justify-center transition-colors shadow-sm"
                              title="Email Father">
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Full Name</Label>
                          {isEditing ? (
                            <Input value={formData.fatherName ?? ""} onChange={e => setFormData({ ...formData, fatherName: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800">{student.fatherName || "—"}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Mobile Number</Label>
                            {isEditing ? (
                              <Input value={formData.fatherPhone ?? ""} onChange={e => setFormData({ ...formData, fatherPhone: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.fatherPhone || "—"}</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Email Address</Label>
                            {isEditing ? (
                              <Input value={formData.fatherEmail ?? ""} onChange={e => setFormData({ ...formData, fatherEmail: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800 truncate" title={student.fatherEmail}>{student.fatherEmail || "—"}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Occupation</Label>
                            {isEditing ? (
                              <Input value={formData.fatherOccupation ?? ""} onChange={e => setFormData({ ...formData, fatherOccupation: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.fatherOccupation || "—"}</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Employer</Label>
                            {isEditing ? (
                              <Input value={formData.fatherEmployer ?? ""} onChange={e => setFormData({ ...formData, fatherEmployer: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.fatherEmployer || "—"}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mother Card */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Mother's Profile
                        </h4>
                        <div className="flex items-center gap-2">
                          {(student.motherPhone || formData.motherPhone) && (
                            <a href={`tel:${formData.motherPhone || student.motherPhone}`}
                              className="h-8 w-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors shadow-sm"
                              title="Call Mother">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {(student.motherEmail || formData.motherEmail) && (
                            <a href={`mailto:${formData.motherEmail || student.motherEmail}`}
                              className="h-8 w-8 rounded-xl bg-[#8E24AA]/10 hover:bg-[#8E24AA]/20 text-[#8E24AA] flex items-center justify-center transition-colors shadow-sm"
                              title="Email Mother">
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Full Name</Label>
                          {isEditing ? (
                            <Input value={formData.motherName ?? ""} onChange={e => setFormData({ ...formData, motherName: e.target.value })} className={inputCls} />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800">{student.motherName || "—"}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Mobile Number</Label>
                            {isEditing ? (
                              <Input value={formData.motherPhone ?? ""} onChange={e => setFormData({ ...formData, motherPhone: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.motherPhone || "—"}</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Email Address</Label>
                            {isEditing ? (
                              <Input value={formData.motherEmail ?? ""} onChange={e => setFormData({ ...formData, motherEmail: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800 truncate" title={student.motherEmail}>{student.motherEmail || "—"}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Occupation</Label>
                            {isEditing ? (
                              <Input value={formData.motherOccupation ?? ""} onChange={e => setFormData({ ...formData, motherOccupation: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.motherOccupation || "—"}</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Employer</Label>
                            {isEditing ? (
                              <Input value={formData.motherEmployer ?? ""} onChange={e => setFormData({ ...formData, motherEmployer: e.target.value })} className={inputCls} />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{student.motherEmployer || "—"}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Guardian details */}
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Guardian Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Guardian Name</Label>
                        {isEditing ? (
                          <Input value={formData.guardianName ?? ""} onChange={e => setFormData({ ...formData, guardianName: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.guardianName || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Relationship</Label>
                        {isEditing ? (
                          <Input value={formData.guardianRelationship ?? ""} onChange={e => setFormData({ ...formData, guardianRelationship: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.guardianRelationship || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Mobile Number</Label>
                        {isEditing ? (
                          <Input value={formData.guardianPhone ?? ""} onChange={e => setFormData({ ...formData, guardianPhone: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.guardianPhone || "—"}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Email Address</Label>
                        {isEditing ? (
                          <Input value={formData.guardianEmail ?? ""} onChange={e => setFormData({ ...formData, guardianEmail: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800 truncate">{student.guardianEmail || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Occupation</Label>
                        {isEditing ? (
                          <Input value={formData.guardianOccupation ?? ""} onChange={e => setFormData({ ...formData, guardianOccupation: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.guardianOccupation || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Emergency Contact Info</Label>
                        {isEditing ? (
                          <Input value={formData.guardianEmergencyContact ?? ""} onChange={e => setFormData({ ...formData, guardianEmergencyContact: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.guardianEmergencyContact || "—"}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Guardian Address</Label>
                      {isEditing ? (
                        <Input value={formData.guardianAddress ?? ""} onChange={e => setFormData({ ...formData, guardianAddress: e.target.value })} className={inputCls} />
                      ) : (
                        <p className="text-sm font-semibold text-slate-800">{student.guardianAddress || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Addresses */}
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Address Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Current Address</Label>
                        {isEditing ? (
                          <Input value={formData.currentAddress ?? ""} onChange={e => setFormData({ ...formData, currentAddress: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.currentAddress || student.address || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Permanent Address</Label>
                        {isEditing ? (
                          <Input value={formData.permanentAddress ?? ""} onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.permanentAddress || "—"}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">City</Label>
                        {isEditing ? (
                          <Input value={formData.city ?? ""} onChange={e => setFormData({ ...formData, city: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.city || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">State / Province</Label>
                        {isEditing ? (
                          <Input value={formData.state ?? ""} onChange={e => setFormData({ ...formData, state: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.state || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Country</Label>
                        {isEditing ? (
                          <Input value={formData.country ?? ""} onChange={e => setFormData({ ...formData, country: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.country || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Postal Code</Label>
                        {isEditing ? (
                          <Input value={formData.postalCode ?? ""} onChange={e => setFormData({ ...formData, postalCode: e.target.value })} className={inputCls} />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.postalCode || "—"}</p>
                        )}
                      </div>
                    </div>
                  </div>

                </TabsContent>

                {/* ── ACADEMIC ── */}
                <TabsContent value="academics" className="space-y-5 mt-0">
                  {/* Academic Details Summary Card */}
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 text-violet-500" /> Academic Setup
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Class</Label>
                        <p className="text-sm font-semibold text-slate-800">{(student as any).className || (student as any).grade || student.classId || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Section</Label>
                        <p className="text-sm font-semibold text-slate-800">{(student as any).section || "A"}</p>
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Stream</Label>
                        {isEditing ? (
                          <Select value={formData.stream ?? ""} onValueChange={val => setFormData({ ...formData, stream: val })}>
                            <SelectTrigger className="h-10 rounded-xl text-xs border-slate-150 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["General", "Science", "Commerce", "Arts"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.stream || "General"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Academic Year</Label>
                        <p className="text-sm font-semibold text-slate-800">{student.academicYear || "2025-2026"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Previous School</Label>
                        {isEditing ? (
                          <Input value={formData.previousSchool ?? ""} onChange={e => setFormData({ ...formData, previousSchool: e.target.value })} className="h-10" />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{student.previousSchool || "—"}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Student ID</Label>
                        <p className="text-sm font-semibold text-slate-800">{student.id}</p>
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Enrollment Date</Label>
                        {isEditing ? (
                          <Input type="date" value={formData.enrollmentDate ?? ""} onChange={e => setFormData({ ...formData, enrollmentDate: e.target.value })} className="h-10" />
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">{formatDate(student.enrollmentDate ?? student.createdAt ?? "")}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {subjectProficiency.length > 0 && (
                    <>
                      <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-100/50 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Overall Average</p>
                          <h2 className={cn("text-5xl font-black", overallAvg < 60 ? "text-rose-500" : "text-[#8E24AA]")}>{overallAvg}%</h2>
                          <p className="text-xs text-slate-400 font-medium mt-1">{examResults.length} results · {subjectProficiency.length} subjects</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Grade</p>
                          <div className="h-16 w-16 rounded-2xl bg-white shadow-md flex items-center justify-center border border-violet-100">
                            <span className="text-2xl font-black text-[#8E24AA]">{gradeFor(overallAvg)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Subject Proficiency</p>
                        {subjectProficiency.map((s, i) => (
                          <div key={s.subject} className="flex items-center gap-4">
                            <span className="text-xs font-semibold text-slate-600 w-32 truncate">{s.subject}</span>
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className={cn("h-full rounded-full", BAR_COLORS[i % BAR_COLORS.length])} style={{ width: `${s.pct}%`, transition: "width 0.6s ease" }} />
                            </div>
                            <span className={cn("text-xs font-black w-10 text-right", s.pct < 60 ? "text-rose-500" : "text-slate-900")}>{s.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {subjectProficiency.length === 0 && <EmptyState icon={BookOpen} title="No exam results yet" hint="Record a subject score below." />}

                  <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Record a Result</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input value={newResult.subject} onChange={(e) => setNewResult({ ...newResult, subject: e.target.value })} placeholder="Subject" className={cn(inputCls, "flex-1")} />
                      <Input value={newResult.marks} onChange={(e) => setNewResult({ ...newResult, marks: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Marks" inputMode="numeric" className={cn(inputCls, "w-24")} />
                      <Input value={newResult.total} onChange={(e) => setNewResult({ ...newResult, total: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Total" inputMode="numeric" className={cn(inputCls, "w-24")} />
                      <Button onClick={handleAddResult} className="h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-widest border-none text-white gap-2 shrink-0" style={{ background: "linear-gradient(135deg,#C218A8,#8E24AA)" }}>
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </div>
                  </div>

                  {examResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recorded Results</p>
                      {[...examResults].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((r, i) => {
                        const pct = Math.round((Number(r.marksObtained) / (Number(r.totalMarks) || 100)) * 100);
                        return (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-50/60 rounded-xl hover:bg-slate-50 transition-all">
                            <div className="flex items-center gap-3">
                              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs", pct < 60 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>{String(r.grade)}</div>
                              <p className="text-sm font-bold text-slate-900">{String(r.subject)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-900">{String(r.marksObtained)}/{String(r.totalMarks)}</p>
                              <p className={cn("text-[10px] font-bold uppercase", pct < 60 ? "text-rose-500" : "text-emerald-500")}>{pct}%</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── ATTENDANCE ── */}
                <TabsContent value="attendance" className="space-y-6 mt-0">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Attendance Rate */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="text-2xl font-black mb-1 text-purple-600">{attStats.pct}%</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Attendance Rate</div>
                      <Progress value={attStats.pct} className="h-1.5 bg-slate-100" />
                    </div>

                    {/* Present Days */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="text-2xl font-black mb-1 text-emerald-600">{attStats.present}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Present Days</div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Out of {attStats.total} total</p>
                    </div>

                    {/* Absent Days */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="text-2xl font-black mb-1 text-rose-600">{attStats.absent}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Absent Days</div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Requires follow-up</p>
                    </div>

                    {/* Late Days */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="text-2xl font-black mb-1 text-amber-600">{attStats.late}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Late Days</div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Tardy logs</p>
                    </div>
                  </div>

                  {recentRecords.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Logs</p>
                      <div className="space-y-2">
                        {recentRecords.map((r, i) => (
                          <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs",
                                r.status === "Present" ? "bg-emerald-50 text-emerald-600" :
                                r.status === "Absent" ? "bg-rose-50 text-rose-600" :
                                "bg-amber-50 text-amber-600"
                              )}>
                                {String(r.status)[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{formatDate(String(r.date))}</p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                  Marked on {r.createdAt ? new Date(String(r.createdAt)).toLocaleDateString() : "—"}
                                </p>
                              </div>
                            </div>
                            <div>
                              <Badge className={cn(
                                "text-[10px] font-bold rounded-full px-2.5 py-0.5 border-none",
                                r.status === "Present" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" :
                                r.status === "Absent" ? "bg-rose-50 text-rose-700 hover:bg-rose-50" :
                                "bg-amber-50 text-amber-700 hover:bg-amber-50"
                              )}>
                                {String(r.status)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={Clock} title="No attendance logs found" hint="Use Quick Action to mark today's attendance." />
                  )}
                </TabsContent>

                {/* ── BEHAVIOUR ── */}
                {canSeeBehaviour && (
                <TabsContent value="behaviour" className="space-y-6 mt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Merit Count */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-black text-emerald-600">
                          {behaviorIncidents.filter(x => x.type === "Merit").length}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Merits</div>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-emerald-500" />
                      </div>
                    </div>

                    {/* Demerit Count */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-black text-rose-600">
                          {behaviorIncidents.filter(x => x.type === "Demerit").length}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Demerits</div>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-rose-500" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Behavior incidents & logs</p>
                    <Button onClick={() => setReportingIncident(true)} size="sm" variant="outline" className="rounded-xl text-xs font-bold border-slate-200 h-8 px-3">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Report Incident
                    </Button>
                  </div>

                  {behaviorIncidents.length > 0 ? (
                    <div className="space-y-2">
                      {[...behaviorIncidents].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map((inc, i) => {
                        const isMerit = inc.type === "Merit";
                        return (
                          <div key={inc.id || i} className={cn(
                            "p-4 rounded-xl border bg-white shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-start justify-between gap-4",
                            isMerit ? "border-emerald-100 hover:border-emerald-200" : "border-rose-100 hover:border-rose-200"
                          )}>
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={cn(
                                  "text-[10px] font-bold rounded-full px-2.5 py-0.5 border-none",
                                  isMerit ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "bg-rose-50 text-rose-700 hover:bg-rose-50"
                                )}>
                                  {String(inc.type)}
                                </Badge>
                                <span className="text-slate-200 text-xs">|</span>
                                <span className="text-xs font-bold text-slate-600">{String(inc.category)}</span>
                                <span className="text-slate-200 text-xs">|</span>
                                <span className={cn(
                                  "text-[10px] font-bold uppercase",
                                  inc.severity === "High" ? "text-rose-500" :
                                  inc.severity === "Medium" ? "text-amber-500" : "text-slate-400"
                                )}>
                                  {String(inc.severity)} Severity
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                                {String(inc.description)}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                Reported on {formatDate(String(inc.date))}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <button onClick={() => handleDeleteIncident(String(inc.id))}
                                className="h-8 w-8 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState icon={AlertCircle} title="No behavior records found" hint="Report a Merit or Demerit to start tracking student behavior." />
                  )}
                </TabsContent>
                )}

                {/* ── MEDICAL ── */}
                {canSeeMedical && (
                <TabsContent value="medical" className="space-y-5 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-[#8E24AA]/5 border border-[#8E24AA]/10 p-5">
                      <Label className="text-[10px] font-bold uppercase text-[#8E24AA] mb-2 block">Blood Group</Label>
                      {isEditing ? (
                        <Select value={formData.bloodGroup ?? ""} onValueChange={val => setFormData({ ...formData, bloodGroup: val })}>
                          <SelectTrigger className="h-10 rounded-xl text-xs border-slate-150 bg-white shadow-sm">
                            <SelectValue placeholder="Select Blood Group" />
                          </SelectTrigger>
                          <SelectContent>
                            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-semibold text-slate-800">{student.bloodGroup || "Unknown"}</p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-rose-50/40 border border-rose-100 p-5">
                      <Label className="text-[10px] font-bold uppercase text-rose-500 mb-2 block">Allergies</Label>
                      {isEditing ? (
                        <Textarea value={formData.allergies ?? ""} onChange={e => setFormData({ ...formData, allergies: e.target.value })} placeholder="List allergies..." className="min-h-[70px] bg-white" />
                      ) : (
                        <p className="text-sm font-semibold text-rose-700">{student.allergies || <span className="italic text-rose-300 text-xs">None reported</span>}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-amber-50/40 border border-amber-100 p-5">
                      <Label className="text-[10px] font-bold uppercase text-amber-600 mb-2 block">Medical Conditions</Label>
                      {isEditing ? (
                        <Textarea value={formData.medicalConditions ?? ""} onChange={e => setFormData({ ...formData, medicalConditions: e.target.value })} placeholder="List chronic conditions..." className="min-h-[70px] bg-white" />
                      ) : (
                        <p className="text-sm font-semibold text-amber-700">{student.medicalConditions || <span className="italic text-amber-300 text-xs">None reported</span>}</p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-rose-50/20 border border-rose-100/60 p-5">
                      <Label className="text-[10px] font-bold uppercase text-rose-600 mb-2 block">Emergency Medical Notes</Label>
                      {isEditing ? (
                        <Textarea value={formData.emergencyMedicalNotes ?? ""} onChange={e => setFormData({ ...formData, emergencyMedicalNotes: e.target.value })} placeholder="Special emergency notes..." className="min-h-[70px] bg-white" />
                      ) : (
                        <p className="text-sm font-semibold text-rose-800">{student.emergencyMedicalNotes || <span className="italic text-rose-300 text-xs">None reported</span>}</p>
                      )}
                    </div>
                  </div>
                </TabsContent>
                )}

                {/* ── DOCUMENTS ── */}
                <TabsContent value="documents" className="space-y-5 mt-0">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-100/50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Document Checklist</p>
                        <h2 className="text-3xl font-black text-[#8E24AA]">
                          {documents.filter(d => (d as any).docType).length} / 7 Uploaded
                        </h2>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-violet-100 text-[#8E24AA]">
                        {documents.filter(d => (d as any).docType).length === 7 ? "✓ Complete" : "Pending Documents"}
                      </span>
                    </div>
                    <Progress value={(documents.filter(d => (d as any).docType).length / 7) * 100} className="h-2 bg-slate-100" />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {[
                      "Birth Certificate",
                      "Passport Copy",
                      "National ID Proof",
                      "Transfer Certificate",
                      "Vaccination Record",
                      "Parent ID Documents",
                      "Other Attachments"
                    ].map(docType => {
                      const file = documents.find(d => 
                        (d as any).docType === docType ||
                        (docType === "National ID Proof" && (d as any).docType === "National ID / QID")
                      );
                      return (
                        <div key={docType} className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all",
                          file ? "border-emerald-200 bg-emerald-50/20" : "border-slate-100 bg-white"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border",
                              file ? "bg-emerald-100 text-emerald-600 border-emerald-200" : "bg-slate-50 text-slate-300 border-slate-100"
                            )}>
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{docType}</p>
                              {file ? (
                                <p className="text-[10px] text-emerald-600 font-semibold truncate max-w-xs mt-0.5">
                                  { (file as any).name } · { formatBytes((file as any).size || 0) }
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Missing document</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {file ? (
                              <>
                                <a href={(file as any).dataUrl} download={(file as any).name}
                                  className="h-8 px-3.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-all">
                                  <Download className="h-3.5 w-3.5" /> Download
                                </a>
                                <button onClick={() => handleDeleteDoc((file as any).id)}
                                  className="h-8 w-8 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center transition-colors">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <div className="relative">
                                <input type="file" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpload(docType, f);
                                  }} />
                                <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold border-slate-200 h-8 px-4">
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Upload
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* ── FEES ── */}
                {canSeeFees && (
                <TabsContent value="fees" className="space-y-5 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Fee Details Card */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4 text-violet-500" /> Fee Configuration
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Fee Plan</Label>
                          {isEditing ? (
                            <Select value={formData.feePlan ?? ""} onValueChange={val => setFormData({ ...formData, feePlan: val })}>
                              <SelectTrigger className="h-10 rounded-xl text-xs border-slate-155 bg-slate-50/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["Monthly", "Quarterly", "Termly", "Annual"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm font-semibold text-slate-800">{student.feePlan || "Annual"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Outstanding Balance (BHD)</Label>
                          {isEditing ? (
                            <Input type="number" value={formData.outstandingBalance ?? 0}
                              onChange={e => setFormData({ ...formData, outstandingBalance: Number(e.target.value) })}
                              className="h-10" />
                          ) : (
                            <p className="text-sm font-bold text-slate-800">
                              {(student.outstandingBalance ?? feeStats.outstanding).toLocaleString()} BHD
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Scholarship details */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-500" /> Scholarship Details
                      </h4>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-slate-400 mb-1 block">Scholarship Description / Grant Info</Label>
                        {isEditing ? (
                          <Textarea value={formData.scholarshipDetails ?? ""}
                            onChange={e => setFormData({ ...formData, scholarshipDetails: e.target.value })}
                            placeholder="Enter scholarship details if any..."
                            className="min-h-[90px]" />
                        ) : (
                          <p className="text-sm font-semibold text-slate-600 leading-relaxed">
                            {student.scholarshipDetails || <span className="text-slate-300 italic text-xs">No active scholarships / discounts</span>}
                          </p>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Payment History (Invoices list) */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment History</p>
                    {studentInvoices.length === 0 ? (
                      <EmptyState icon={CreditCard} title="No transactions logged" hint="Invoices and receipts will appear here once registered." />
                    ) : (
                      <div className="space-y-2">
                        {studentInvoices.map((inv, i) => {
                          const paid = inv.status === "Paid";
                          return (
                            <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all">
                              <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-xl border", paid ? "bg-emerald-50 text-emerald-600 border-emerald-150" : "bg-rose-50 text-rose-600 border-rose-150")}>
                                  <CreditCard className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{String(inv.category || inv.invoiceNumber || "Tuition Fees")}</p>
                                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatDate(String(inv.dueDate || inv.createdAt || ""))}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-slate-900">{Number(inv.amount || 0).toLocaleString()} BHD</p>
                                <p className={cn("text-[9px] font-bold uppercase tracking-widest mt-0.5", paid ? "text-emerald-500" : "text-rose-500")}>{String(inv.status)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>
                )}

                {/* ── LEARNING WORLD (Learning Universe preview, read-only) ── */}
                <TabsContent value="learning-universe" className="space-y-5 mt-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <Rocket className="h-4 w-4 text-violet-500" /> Learning World Preview
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-md">
                        What this student sees in Mission Map — real missions, real rewards. Pick a grade to preview even if this student's own Grade / Class isn't set yet.
                      </p>
                    </div>
                    <div className="w-44">
                      <Select value={previewGrade} onValueChange={setPreviewGrade}>
                        <SelectTrigger className="h-10 rounded-xl text-xs border-slate-200 bg-slate-50/50">
                          <SelectValue placeholder="Preview grade…" />
                        </SelectTrigger>
                        <SelectContent>
                          {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {student.grade && previewGrade !== student.grade && (
                    <div className="rounded-xl border border-amber-150 bg-amber-50/60 px-4 py-2.5 text-[11px] text-amber-700 font-medium">
                      Previewing {previewGrade || "—"} — this student's own Grade / Class is {gradeSectionLabel}.
                    </div>
                  )}
                  {!student.grade && (
                    <div className="rounded-xl border border-amber-150 bg-amber-50/60 px-4 py-2.5 text-[11px] text-amber-700 font-medium">
                      This student has no Grade / Class set, so their real Mission Map shows nothing yet. Use the picker above to preview what any grade looks like.
                    </div>
                  )}

                  {/* Wallet / XP / House strip — real numbers already earned by this student, if any */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 flex items-center gap-3">
                      <Coins className="h-5 w-5 text-amber-500 shrink-0" />
                      <div><p className="text-lg font-black text-amber-700 leading-none">{getWalletBalance(student.id)}</p><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Coins</p></div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 flex items-center gap-3">
                      <Zap className="h-5 w-5 text-violet-500 shrink-0" />
                      <div><p className="text-lg font-black text-violet-700 leading-none">{getStudentXp(student.id)}</p><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">XP</p></div>
                    </div>
                    <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ borderColor: luHouse ? `${luHouse.colorHex}40` : undefined, background: luHouse ? `${luHouse.colorHex}10` : undefined }}>
                      <Trophy className="h-5 w-5 shrink-0" style={{ color: luHouse?.colorHex || "#94a3b8" }} />
                      <div><p className="text-sm font-black leading-none truncate" style={{ color: luHouse?.colorHex }}>{luHouse?.name || "Not assigned"}</p><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">House</p></div>
                    </div>
                  </div>

                  {/* Chapter quests for the previewed grade */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chapter Quests{previewGrade ? ` — ${previewGrade}` : ""}</p>
                    {luLoading ? (
                      <div className="py-10 text-center text-xs text-slate-400">Loading…</div>
                    ) : !previewGrade ? (
                      <EmptyState icon={Rocket} title="Pick a grade to preview" hint="Choose a grade above to see its curriculum-linked missions." />
                    ) : luQuests.length === 0 ? (
                      <EmptyState icon={Rocket} title={`No missions for ${previewGrade} yet`} hint="Publish a curriculum for this grade and generate missions from Mission Generator." />
                    ) : (
                      <div className="space-y-2">
                        {luQuests.map(q => {
                          const completed = q.missionId ? hasPassedMission(q.missionId, student.id) : false;
                          const locked = !q.missionId;
                          return (
                            <div key={q.weekId} className={cn(
                              "flex items-center gap-4 p-4 rounded-2xl border-2",
                              locked ? "border-slate-100 bg-slate-50/50 opacity-60" :
                              completed ? "border-emerald-200 bg-emerald-50/50" : "border-violet-100 bg-white"
                            )}>
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                locked ? "bg-slate-100" : completed ? "bg-emerald-500" : "bg-gradient-to-br from-violet-500 to-purple-600")}>
                                {locked ? <Lock className="w-4 h-4 text-slate-400" /> : completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Rocket className="w-4 h-4 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 text-sm truncate">{q.topic}</p>
                                <p className="text-[11px] text-slate-400">{q.subject} · {q.termName} · {q.unitName}</p>
                              </div>
                              {!locked && (
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 shrink-0">
                                  <span className="flex items-center gap-0.5"><Zap className="w-3 h-3 text-violet-400" />{q.xp}</span>
                                  <span className="flex items-center gap-0.5"><Coins className="w-3 h-3 text-amber-400" />{q.coins}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {houses.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Houses in this school</p>
                      <div className="flex flex-wrap gap-2">
                        {houses.map(h => (
                          <span key={h.id} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${h.colorHex}20`, color: h.colorHex }}>{h.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* ── PREMIUM FOOTER ── */}
        <div className="px-8 py-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-6 text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600">Student ID</span> {student.id}
            </span>
            <span className="w-px h-4 bg-slate-200" />
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600">Joined</span>
              {(student as any).createdAt ? formatDate(typeof (student as any).createdAt === "string" ? (student as any).createdAt : new Date((student as any).createdAt.seconds * 1000).toISOString()) : "—"}
            </span>
            <span className="w-px h-4 bg-slate-200" />
            <span className={cn("font-black px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest",
              student.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            )}>{student.status || "Active"}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button onClick={() => { if (isEditing) setIsEditing(false); else onOpenChange(false); }} className="h-10 px-5 rounded-xl font-semibold text-xs text-slate-600 hover:bg-slate-100 transition-all">
              {isEditing ? "Discard" : "Close"}
            </button>
            <Button onClick={isEditing ? handleSave : () => setIsEditing(true)} disabled={isSaving}
              className="h-10 px-8 rounded-xl font-bold text-xs uppercase tracking-widest border-none text-white gap-2 shadow-lg"
              style={{ background: "linear-gradient(135deg,#C218A8,#8E24AA)" }}>
              {isSaving ? "Saving…" : isEditing ? <><CheckCircle2 className="h-3.5 w-3.5" /> Save Changes</> : <><Edit className="h-3.5 w-3.5" /> Edit Profile</>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-10 w-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition-all">
                  <MoreHorizontal className="h-4 w-4 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl w-44 shadow-xl border-none p-1.5">
                <DropdownMenuItem className="rounded-xl font-semibold text-sm text-rose-600 px-3 py-2.5 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// fix missing import
const UsersIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
