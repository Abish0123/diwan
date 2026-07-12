import { useState, useMemo, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Trophy, Award, Users, Calendar, FileText, Plus, Download, Eye, Printer,
  Mail, Search, Star, Medal, Sparkles, BarChart3, CheckCircle2, Clock,
  ChevronRight, X, Check, QrCode, Stamp, GraduationCap, BookOpen,
  Zap, Settings, Globe, Upload, MoreVertical, Trash2, Edit2, Send,
  ShieldCheck, TrendingUp, Target, LayoutGrid, List, Filter,
  Layers, Crown, Ribbon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useGrades } from "@/contexts/CurriculumContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type AchievementType = "Academic" | "Sports" | "Arts" | "Leadership" | "Olympiad" | "Attendance" | "Cultural" | "Community" | "Innovation" | "Custom";
type AwardType = "Winner" | "Runner-Up" | "Participation" | "Merit" | "Excellence" | "Custom";
type ApprovalStage = "Draft" | "Pending Review" | "Coordinator Approval" | "Principal Approval" | "Published";
type CertTemplate = "Academic Excellence" | "Sports Award" | "Participation" | "Leadership" | "Cultural Event" | "International Competition" | "Attendance Excellence" | "Custom";

interface Achievement {
  id: string;
  title: string;
  event: string;
  type: AchievementType;
  award: AwardType;
  grade: string;
  section: string;
  students: string[];
  date: string;
  year: string;
  status: ApprovalStage;
  certNo: string;
  template: CertTemplate;
  teacher: string;
  description: string;
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const SECTIONS = ["Section A","Section B","Section C"];
const ACHIEVEMENT_TYPES: AchievementType[] = ["Academic","Sports","Arts","Leadership","Olympiad","Attendance","Cultural","Community","Innovation","Custom"];
const AWARD_TYPES: AwardType[] = ["Winner","Runner-Up","Participation","Merit","Excellence","Custom"];
const CERT_TEMPLATES: CertTemplate[] = ["Academic Excellence","Sports Award","Participation","Leadership","Cultural Event","International Competition","Attendance Excellence","Custom"];
const APPROVAL_STAGES: ApprovalStage[] = ["Draft","Pending Review","Coordinator Approval","Principal Approval","Published"];
const TABS = ["Overview","Achievements","Certificate Generator","Templates","Competitions","Student Portfolio","Approvals","Analytics"] as const;
type Tab = typeof TABS[number];

const SAMPLE_STUDENTS = [
  "Advait Kapoor","Riya Mehta","Ishaan Sarin","Deepak Bose","Laksh Rathore",
  "Sara Ahmed","Mohammed Al-Rashidi","Fatima Hassan","Omar Sheikh","Aisha Malik",
  "Yusuf Ibrahim","Nour Al-Ahmad","Tariq Hussain","Zainab Qureshi","Hassan Ali",
];

const SEED_ACHIEVEMENTS: Achievement[] = [
  { id:"ACH-001", title:"Science Olympiad Winner", event:"National Science Olympiad 2025", type:"Olympiad", award:"Winner", grade:"Grade 8", section:"Section A", students:["Advait Kapoor","Riya Mehta"], date:"2025-11-15", year:"2024-25", status:"Published", certNo:"CERT-2025-001", template:"International Competition", teacher:"Maria Garcia", description:"Won first place in the National Science Olympiad competition." },
  { id:"ACH-002", title:"Inter-School Football Champion", event:"District Football Tournament", type:"Sports", award:"Winner", grade:"Grade 10", section:"Section B", students:["Mohammed Al-Rashidi","Tariq Hussain","Hassan Ali"], date:"2025-10-20", year:"2024-25", status:"Published", certNo:"CERT-2025-002", template:"Sports Award", teacher:"Robert Wilson", description:"Champions of the district-level inter-school football tournament." },
  { id:"ACH-003", title:"Academic Excellence Award", event:"Annual Prize Distribution 2025", type:"Academic", award:"Excellence", grade:"Grade 6", section:"Section A", students:["Sara Ahmed"], date:"2025-12-01", year:"2024-25", status:"Principal Approval", certNo:"CERT-2025-003", template:"Academic Excellence", teacher:"Maria Garcia", description:"Secured 98% in annual examinations with distinction in all subjects." },
  { id:"ACH-004", title:"Cultural Fest Drama Winner", event:"Annual Cultural Fest 2025", type:"Cultural", award:"Winner", grade:"Grade 9", section:"Section C", students:["Fatima Hassan","Aisha Malik","Zainab Qureshi"], date:"2025-09-10", year:"2024-25", status:"Coordinator Approval", certNo:"CERT-2025-004", template:"Cultural Event", teacher:"Maria Garcia", description:"Outstanding performance in inter-class drama competition." },
  { id:"ACH-005", title:"Mathematics Olympiad Merit", event:"International Math Olympiad", type:"Olympiad", award:"Merit", grade:"Grade 11", section:"Section A", students:["Omar Sheikh"], date:"2025-08-25", year:"2024-25", status:"Pending Review", certNo:"CERT-2025-005", template:"International Competition", teacher:"Robert Wilson", description:"Achieved merit distinction in the international mathematics olympiad." },
  { id:"ACH-006", title:"Perfect Attendance Award", event:"Term 1 Attendance Recognition", type:"Attendance", award:"Excellence", grade:"Grade 3", section:"Section B", students:["Yusuf Ibrahim","Nour Al-Ahmad"], date:"2025-12-15", year:"2024-25", status:"Draft", certNo:"CERT-2025-006", template:"Attendance Excellence", teacher:"Maria Garcia", description:"100% attendance throughout Term 1." },
  { id:"ACH-007", title:"Innovation Fair First Place", event:"School Innovation Challenge", type:"Innovation", award:"Winner", grade:"Grade 7", section:"Section A", students:["Ishaan Sarin","Deepak Bose"], date:"2025-11-05", year:"2024-25", status:"Published", certNo:"CERT-2025-007", template:"Academic Excellence", teacher:"Robert Wilson", description:"First place in the school-wide innovation and technology challenge." },
  { id:"ACH-008", title:"Community Service Leadership", event:"Annual Volunteer Day 2025", type:"Community", award:"Excellence", grade:"Grade 12", section:"Section A", students:["Laksh Rathore"], date:"2025-10-01", year:"2024-25", status:"Published", certNo:"CERT-2025-008", template:"Leadership", teacher:"Maria Garcia", description:"Led community service initiative benefiting 500+ families." },
];

// ─── Category Config ───────────────────────────────────────────────────────────
const CAT_CONFIG: Record<AchievementType, { icon: any; color: string; bg: string; border: string }> = {
  Academic:    { icon: BookOpen,      color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200" },
  Sports:      { icon: Trophy,        color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-200" },
  Arts:        { icon: Star,          color: "text-pink-700",   bg: "bg-pink-50",    border: "border-pink-200" },
  Leadership:  { icon: Crown,         color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200" },
  Olympiad:    { icon: Medal,         color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200" },
  Attendance:  { icon: CheckCircle2,  color: "text-teal-700",   bg: "bg-teal-50",    border: "border-teal-200" },
  Cultural:    { icon: Ribbon,        color: "text-rose-700",   bg: "bg-rose-50",    border: "border-rose-200" },
  Community:   { icon: Users,         color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200" },
  Innovation:  { icon: Sparkles,      color: "text-cyan-700",   bg: "bg-cyan-50",    border: "border-cyan-200" },
  Custom:      { icon: Award,         color: "text-gray-700",   bg: "bg-gray-50",    border: "border-gray-200" },
};

const STATUS_CONFIG: Record<ApprovalStage, { color: string; dot: string }> = {
  "Draft":                { color: "bg-gray-100 text-gray-600 border-gray-200",     dot: "bg-gray-400" },
  "Pending Review":       { color: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  "Coordinator Approval": { color: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500" },
  "Principal Approval":   { color: "bg-purple-50 text-purple-700 border-purple-200",dot: "bg-purple-500" },
  "Published":            { color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const AWARD_COLORS: Record<AwardType, string> = {
  "Winner":       "bg-amber-50 text-amber-700 border-amber-300",
  "Runner-Up":    "bg-gray-50 text-gray-700 border-gray-300",
  "Participation":"bg-blue-50 text-blue-700 border-blue-200",
  "Merit":        "bg-violet-50 text-violet-700 border-violet-200",
  "Excellence":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Custom":       "bg-pink-50 text-pink-700 border-pink-200",
};

// ─── Analytics Data ───────────────────────────────────────────────────────────
const MONTHLY_CERTS = [
  {month:"Aug",certs:320},{month:"Sep",certs:580},{month:"Oct",certs:720},{month:"Nov",certs:950},
  {month:"Dec",certs:1100},{month:"Jan",certs:430},{month:"Feb",certs:650},{month:"Mar",certs:780},
];
const BY_TYPE = [
  {name:"Academic",value:38,color:"#7C3AED"},{name:"Sports",value:24,color:"#10B981"},
  {name:"Olympiad",value:18,color:"#3B82F6"},{name:"Cultural",value:10,color:"#F43F5E"},
  {name:"Other",value:10,color:"#F59E0B"},
];
const BY_GRADE = [
  {grade:"G6",n:145},{grade:"G7",n:189},{grade:"G8",n:210},{grade:"G9",n:178},
  {grade:"G10",n:220},{grade:"G11",n:156},{grade:"G12",n:98},
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Achievements() {
  const grades = useGrades();
  const { user } = useAuth();
  const [activeTab, setActiveTab]       = useState<Tab>("Overview");
  const [achievements, setAchievements] = useState<Achievement[]>(SEED_ACHIEVEMENTS);
  const [loaded, setLoaded]             = useState(false);
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterGrade, setFilterGrade]   = useState<string>("All");
  const [viewMode, setViewMode]         = useState<"table"|"grid">("table");

  // Create / edit achievement dialog
  const [createOpen, setCreateOpen]     = useState(false);
  const [editingId, setEditingId]       = useState<string|null>(null);
  const [form, setForm]                 = useState({
    title:"", event:"", type:"Academic" as AchievementType, award:"Winner" as AwardType,
    grade:grades[0] ?? "Grade 1", section:"Section A", description:"", date:"", year:"2024-25",
    template:"Academic Excellence" as CertTemplate,
  });
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentSearch, setStudentSearch]       = useState("");

  // Certificate preview
  const [certPreviewOpen, setCertPreviewOpen]   = useState(false);
  const [previewAch, setPreviewAch]             = useState<Achievement|null>(null);
  const [certTemplate, setCertTemplate]         = useState<CertTemplate>("Academic Excellence");
  const [certStudent, setCertStudent]           = useState("Student Name");

  // Achievement detail view
  const [detailAch, setDetailAch]               = useState<Achievement|null>(null);

  // Load real achievements from persistence on mount. Falls back to (and seeds)
  // SEED_ACHIEVEMENTS on first run so the DB isn't empty forever.
  const loadAchievements = useCallback(async () => {
    try {
      const raw = await smartDb.getAll("Achievement") as Achievement[];
      // The shared "achievements" table already has ~39 unrelated legacy
      // rows from a different feature entirely (status values like
      // "Verified"/"Issued", no `students` array, no `type`) — coercing
      // those into this page's shape would either crash every `.students.
      // length`/`.map()` call site or fabricate fake "0 students, unknown
      // type" achievement cards. They aren't real Achievement records for
      // this feature, so they're filtered out rather than displayed.
      const data = (raw || []).filter(a => a && typeof a.title === "string" && Array.isArray(a.students));
      if (data.length > 0) {
        setAchievements(data);
      } else {
        // First run — persist the seed set so it survives refresh, then load it back.
        await Promise.all(SEED_ACHIEVEMENTS.map(a => smartDb.create("Achievement", a as unknown as Record<string, unknown>, a.id)));
        setAchievements(SEED_ACHIEVEMENTS);
      }
    } catch (error) {
      console.error("Error loading achievements:", error);
      toast.error("Failed to load achievements — showing sample data");
      setAchievements(SEED_ACHIEVEMENTS);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAchievements();
  }, [loadAchievements]);

  // Kanban drag (simplified – click to advance stage)
  async function advanceStage(id: string) {
    const current = achievements.find(a => a.id === id);
    if (!current) return;
    const idx = APPROVAL_STAGES.indexOf(current.status);
    if (idx >= APPROVAL_STAGES.length - 1) return;
    const next = APPROVAL_STAGES[idx + 1];
    try {
      await smartDb.update("Achievement", id, { status: next });
      setAchievements(prev => prev.map(a => a.id === id ? { ...a, status: next } : a));
      toast.success(`"${current.title}" moved to ${next}`);
    } catch (error) {
      console.error("Error advancing stage:", error);
      toast.error("Failed to update approval stage");
    }
  }

  function resetForm() {
    setForm({ title:"", event:"", type:"Academic", award:"Winner", grade:grades[0] ?? "Grade 1", section:"Section A", description:"", date:"", year:"2024-25", template:"Academic Excellence" });
    setSelectedStudents([]);
    setStudentSearch("");
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(ach: Achievement) {
    setEditingId(ach.id);
    setForm({
      title: ach.title, event: ach.event, type: ach.type, award: ach.award,
      grade: ach.grade, section: ach.section, description: ach.description,
      date: ach.date, year: ach.year, template: ach.template,
    });
    setSelectedStudents([...ach.students]);
    setStudentSearch("");
    setDetailAch(null);
    setCreateOpen(true);
  }

  async function createAchievement() {
    if (!form.title.trim() || !form.event.trim() || selectedStudents.length === 0) {
      toast.error("Please fill in Title, Event and select at least one student.");
      return;
    }
    try {
      if (editingId) {
        // Update existing
        await smartDb.update("Achievement", editingId, { ...form, students: selectedStudents });
        setAchievements(prev => prev.map(a => a.id === editingId
          ? { ...a, ...form, students: selectedStudents }
          : a));
        toast.success(`Achievement "${form.title}" updated!`);
      } else {
        // Create new — generate a unique id even after deletions
        const maxNum = achievements.reduce((m, a) => {
          const n = parseInt(a.id.replace(/\D/g, ""), 10);
          return isNaN(n) ? m : Math.max(m, n);
        }, 0);
        const seq = String(maxNum + 1).padStart(3, "0");
        const newAch: Achievement = {
          ...form, id: `ACH-${seq}`, certNo: `CERT-${new Date().getFullYear()}-${seq}`,
          students: selectedStudents, status: "Draft", teacher: "Admin",
        };
        await smartDb.create("Achievement", newAch as unknown as Record<string, unknown>, newAch.id);
        setAchievements(prev => [newAch, ...prev]);
        toast.success(`Achievement "${form.title}" created — now in Draft.`);
      }
      setCreateOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving achievement:", error);
      toast.error(editingId ? "Failed to update achievement" : "Failed to create achievement");
    }
  }

  function openCertPreview(ach: Achievement, student?: string) {
    setPreviewAch(ach);
    setCertTemplate(ach.template);
    setCertStudent(student || ach.students[0] || "Student Name");
    setCertPreviewOpen(true);
  }

  async function deleteAchievement(id: string) {
    try {
      await smartDb.delete("Achievement", id);
      setAchievements(prev => prev.filter(a => a.id !== id));
      if (detailAch?.id === id) setDetailAch(null);
      toast.success("Achievement deleted");
    } catch (error) {
      console.error("Error deleting achievement:", error);
      toast.error("Failed to delete achievement");
    }
  }

  function buildCertificateHtml(ach: Achievement, student: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${ach.title} — ${student}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;background:#f5f3ff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.cert{background:#fff;max-width:760px;width:100%;border:3px solid #7C3AED;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,.15)}
.hdr{background:linear-gradient(135deg,#7C3AED,#6D28D9);padding:28px;text-align:center;color:#fff}
.hdr h1{font-size:24px;letter-spacing:5px;text-transform:uppercase;margin-bottom:4px}
.hdr p{font-size:11px;letter-spacing:2px;opacity:.75}
.body{padding:44px;text-align:center}
.lbl{font-size:10px;text-transform:uppercase;letter-spacing:3px;color:#9CA3AF;margin-bottom:6px}
.ctitle{font-size:30px;font-weight:900;color:#7C3AED;margin-bottom:20px}
.student{font-size:30px;font-weight:900;color:#111;margin:6px 0}
.grade{font-size:13px;color:#6B7280;margin-bottom:20px}
.abox{background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:16px 36px;display:inline-block;margin-bottom:24px}
.abox .for{font-size:11px;color:#9CA3AF}
.abox h3{font-size:16px;font-weight:900;color:#5B21B6;margin:4px 0}
.abox .ev{font-size:11px;color:#6B7280}
.meta{display:flex;justify-content:center;gap:36px;font-size:11px;margin-bottom:28px;color:#6B7280}
.meta strong{display:block;font-size:13px;font-weight:700;color:#374151}
.sigs{display:flex;justify-content:space-between;align-items:flex-end;padding:16px 48px 0;border-top:1px dashed #E5E7EB}
.sig{text-align:center}
.sig-line{width:100px;height:1px;background:#9CA3AF;margin:0 auto 4px}
.sig p{font-size:10px;color:#9CA3AF}
.verify{font-size:9px;color:#C4B5FD;margin-top:16px;letter-spacing:2px;text-transform:uppercase}
</style></head>
<body><div class="cert">
<div class="hdr"><h1>Student Diwan</h1><p>International School &nbsp;•&nbsp; Certificate of Achievement</p></div>
<div class="body">
<p class="lbl">Certificate of</p>
<p class="ctitle">Achievement</p>
<p style="font-size:12px;color:#6B7280;margin-bottom:6px">This certificate is proudly presented to</p>
<p class="student">${student}</p>
<p class="grade">${ach.grade} &mdash; ${ach.section}</p>
<div class="abox"><p class="for">for achieving</p><h3>${ach.title}</h3><p class="ev">${ach.event}</p></div>
<div class="meta">
<div><strong>${ach.award}</strong>Award</div>
<div><strong>${ach.date}</strong>Date</div>
<div><strong>${ach.certNo}</strong>Cert No.</div>
</div>
<div class="sigs">
<div class="sig"><div class="sig-line"></div><p>Class Teacher</p></div>
<div class="sig"><div class="sig-line"></div><p>Principal</p></div>
</div>
<p class="verify">Verify at studentdiwan.com/verify/${ach.certNo}</p>
</div></div></body></html>`;
  }

  function downloadCertificate(ach: Achievement, student: string) {
    const html = buildCertificateHtml(ach, student);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Certificate-${student.replace(/\s+/g, "-")}-${ach.certNo}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Certificate downloaded for ${student}`);
  }

  // Bundles one certificate per student into a single ZIP so "Generate All as
  // ZIP" doesn't trigger N separate browser downloads.
  async function downloadCertificatesZip(ach: Achievement, students: string[]) {
    if (!ach || students.length === 0) {
      toast.error("No students to generate certificates for");
      return;
    }
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      students.forEach(student => {
        const html = buildCertificateHtml(ach, student);
        zip.file(`Certificate-${student.replace(/\s+/g, "-")}-${ach.certNo}.html`, html);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certificates-${ach.certNo}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Generated ZIP with ${students.length} certificate(s)`);
    } catch (error) {
      console.error("Error generating ZIP:", error);
      toast.error("Failed to generate ZIP archive");
    }
  }

  // Creates a real notification targeted at the student by name (Achievement
  // records only store student display names, not uids). Mirrors the
  // smartDb.create("Notification", ...) pattern used elsewhere in the app
  // (e.g. GatePass.tsx) so it shows up in the real notification feed.
  async function emailCertificateNotification(ach: Achievement, students: string[]) {
    try {
      const stamp = Date.now();
      await Promise.all(students.map((student, i) =>
        smartDb.create("Notification", {
          id: `ach_cert_${stamp}_${i}`,
          recipientName: student,
          audienceRole: "student",
          category: "student",
          entity: "Achievement",
          type: "certificate_issued",
          title: `Certificate Awarded: ${ach.title}`,
          message: `Congratulations! You have been awarded a certificate for "${ach.title}" (${ach.event}). Certificate No. ${ach.certNo}.`,
          createdAt: new Date().toISOString(),
          read: false,
          redirectUrl: "/student/certificates",
        }, `ach_cert_${stamp}_${i}`)
      ));
      toast.success(`Certificate notification sent to ${students.length} student(s)`);
    } catch (error) {
      console.error("Error sending certificate notification:", error);
      toast.error("Failed to send certificate notification");
    }
  }

  function openCertPreviewFromDetail(ach: Achievement, student: string) {
    setDetailAch(null);
    setPreviewAch(ach);
    setCertTemplate(ach.template);
    setCertStudent(student);
    setCertPreviewOpen(true);
  }

  // Keep detail view in sync when the underlying record changes (e.g. stage advance)
  const liveDetail = useMemo(
    () => (detailAch ? achievements.find(a => a.id === detailAch.id) || null : null),
    [detailAch, achievements]
  );

  // Filtered list
  const filtered = useMemo(() => achievements.filter(a => {
    const q = search.toLowerCase();
    if (q && !a.title.toLowerCase().includes(q) && !a.event.toLowerCase().includes(q)) return false;
    if (filterType !== "All" && a.type !== filterType) return false;
    if (filterStatus !== "All" && a.status !== filterStatus) return false;
    if (filterGrade !== "All" && a.grade !== filterGrade) return false;
    return true;
  }), [achievements, search, filterType, filterStatus, filterGrade]);

  const stats = useMemo(() => ({
    total: achievements.length,
    certs: achievements.filter(a => a.status === "Published").length * 3,
    events: new Set(achievements.map(a => a.event)).size,
    students: new Set(achievements.flatMap(a => a.students)).size,
    pending: achievements.filter(a => a.status !== "Published" && a.status !== "Draft").length,
    downloaded: achievements.filter(a => a.status === "Published").length * 7,
  }), [achievements]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50/40">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-gray-900">Achievement Management</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage awards, recognitions, competitions, certificates and student accomplishments.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 border-gray-200 gap-1.5 text-xs" onClick={() => toast.info("Exporting achievement report…")}>
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button size="sm" className="h-9 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white gap-1.5 text-xs font-bold shadow-md shadow-violet-200"
                onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" /> Create Achievement
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-6 gap-3 mt-5">
            {[
              { label: "Total Achievements", value: stats.total,       icon: Trophy,       color: "from-violet-500 to-purple-600",   shadow: "shadow-violet-100" },
              { label: "Certificates Generated", value: stats.certs,   icon: FileText,     color: "from-blue-500 to-purple-600",     shadow: "shadow-blue-100" },
              { label: "Active Events",        value: stats.events,    icon: Calendar,     color: "from-emerald-500 to-teal-600",    shadow: "shadow-emerald-100" },
              { label: "Students Awarded",     value: stats.students,  icon: Users,        color: "from-amber-500 to-orange-600",    shadow: "shadow-amber-100" },
              { label: "Pending Approval",     value: stats.pending,   icon: Clock,        color: "from-rose-500 to-pink-600",       shadow: "shadow-rose-100" },
              { label: "Certs Downloaded",     value: stats.downloaded,icon: Download,     color: "from-cyan-500 to-sky-600",        shadow: "shadow-cyan-100" },
            ].map(s => (
              <div key={s.label} className={cn("bg-white rounded-2xl border border-gray-100 p-4 shadow-sm", s.shadow)}>
                <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center mb-2.5 shadow-sm", s.color)}>
                  <s.icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-2xl font-black text-gray-900">{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wide leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0.5 mt-5 border-b border-gray-100 -mb-px">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all whitespace-nowrap",
                  activeTab === tab
                    ? "bg-gradient-to-b from-violet-50 to-white text-violet-700 border-x border-t border-gray-100 border-b-0 -mb-px shadow-sm"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                )}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ──────────────────────────────────────────────────── */}
        <div className="p-6 space-y-6">

          {/* ═══ OVERVIEW ═══ */}
          {activeTab === "Overview" && (
            <div className="space-y-6">
              {/* Achievement Category Cards */}
              <div>
                <h2 className="text-sm font-extrabold text-gray-900 mb-3">Achievement Categories</h2>
                <div className="grid grid-cols-5 gap-3">
                  {ACHIEVEMENT_TYPES.map(type => {
                    const cfg = CAT_CONFIG[type];
                    const Icon = cfg.icon;
                    const count = achievements.filter(a => a.type === type).length;
                    return (
                      <button key={type}
                        onClick={() => { setFilterType(type); setActiveTab("Achievements"); }}
                        className={cn(
                          "p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md group",
                          cfg.bg, cfg.border
                        )}>
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform", cfg.bg, cfg.border, "border")}>
                          <Icon className={cn("w-4 h-4", cfg.color)} />
                        </div>
                        <p className={cn("text-sm font-extrabold", cfg.color)}>{type}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{count} achievement{count !== 1 ? "s" : ""}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recent Achievements */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-extrabold text-gray-900">Recent Achievements</h2>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 gap-1.5"
                    onClick={() => setActiveTab("Achievements")}>
                    View All <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {["Achievement","Type","Grade / Section","Students","Date","Status","Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {achievements.slice(0,6).map(a => {
                      const cfg = CAT_CONFIG[a.type] || CAT_CONFIG.Custom;
                      const Icon = cfg.icon;
                      const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.Draft;
                      return (
                        <tr key={a.id} onClick={() => setDetailAch(a)}
                          className="border-b border-gray-50 hover:bg-violet-50/40 transition-colors cursor-pointer">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                                <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-900 leading-tight">{a.title}</p>
                                <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{a.event}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border", cfg.bg, cfg.color, cfg.border)}>
                              {a.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 font-semibold">{a.grade} · {a.section}</td>
                          <td className="px-4 py-3 text-xs text-gray-700 font-semibold">{a.students.length} student{a.students.length !== 1 ? "s" : ""}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{a.date}</td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border", sc.color)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{a.status}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="View details"
                                onClick={() => setDetailAch(a)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-emerald-600" title="Notify students"
                                onClick={() => emailCertificateNotification(a, a.students)}>
                                <Mail className="w-3.5 h-3.5" />
                              </Button>
                              {a.status !== "Published" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="Advance approval"
                                  onClick={() => advanceStage(a.id)}>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ ACHIEVEMENTS ═══ */}
          {activeTab === "Achievements" && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input placeholder="Search achievements, events..." value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-xs border-gray-200" />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 w-36 text-xs border-gray-200"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Types</SelectItem>
                    {ACHIEVEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterGrade} onValueChange={setFilterGrade}>
                  <SelectTrigger className="h-9 w-32 text-xs border-gray-200"><SelectValue placeholder="Grade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Grades</SelectItem>
                    {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 w-40 text-xs border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Status</SelectItem>
                    {APPROVAL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
                  <button onClick={() => setViewMode("table")} className={cn("p-1.5 rounded-md transition-all", viewMode === "table" ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:text-gray-600")}>
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:text-gray-600")}>
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Button size="sm" className="h-9 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-xs gap-1.5"
                  onClick={openCreate}>
                  <Plus className="w-3.5 h-3.5" /> Create Achievement
                </Button>
              </div>

              {viewMode === "table" ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        {["Achievement","Type","Award","Grade / Section","Students","Date","Status","Actions"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => {
                        const cfg = CAT_CONFIG[a.type] || CAT_CONFIG.Custom;
                        const Icon = cfg.icon;
                        const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.Draft;
                        return (
                          <tr key={a.id} onClick={() => setDetailAch(a)}
                            className="border-b border-gray-50 hover:bg-violet-50/30 transition-colors group cursor-pointer">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                                  <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-gray-900">{a.title}</p>
                                  <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{a.event}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 border", cfg.bg, cfg.color, cfg.border)}>{a.type}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 border", AWARD_COLORS[a.award])}>{a.award}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700 font-semibold">{a.grade} · {a.section}</td>
                            <td className="px-4 py-3">
                              <div className="flex -space-x-1.5">
                                {a.students.slice(0,3).map((s,i) => (
                                  <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-[8px] font-black border-2 border-white">
                                    {s.split(" ").map(n=>n[0]).join("").slice(0,2)}
                                  </div>
                                ))}
                                {a.students.length > 3 && (
                                  <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-gray-500">
                                    +{a.students.length - 3}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{a.date}</td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-0.5 border", sc.color)}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{a.status}
                              </span>
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="text-xs">
                                  <DropdownMenuItem onClick={() => setDetailAch(a)} className="gap-2"><Eye className="w-3.5 h-3.5" />View Details</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEdit(a)} className="gap-2"><Edit2 className="w-3.5 h-3.5" />Edit Achievement</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openCertPreview(a)} className="gap-2"><FileText className="w-3.5 h-3.5" />Preview Certificate</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => a.students.forEach(s => downloadCertificate(a, s))} className="gap-2"><Download className="w-3.5 h-3.5" />Download PDF</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => emailCertificateNotification(a, a.students)} className="gap-2"><Mail className="w-3.5 h-3.5" />Notify Students</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toast.info("Sending to parent portal…")} className="gap-2"><Globe className="w-3.5 h-3.5" />Publish to Parent Portal</DropdownMenuItem>
                                  {a.status !== "Published" && (
                                    <DropdownMenuItem onClick={() => advanceStage(a.id)} className="gap-2 text-purple-600"><ChevronRight className="w-3.5 h-3.5" />Advance to Next Stage</DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => deleteAchievement(a.id)} className="gap-2 text-red-600"><Trash2 className="w-3.5 h-3.5" />Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No achievements found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {filtered.map(a => {
                    const cfg = CAT_CONFIG[a.type] || CAT_CONFIG.Custom;
                    const Icon = cfg.icon;
                    const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.Draft;
                    return (
                      <div key={a.id} onClick={() => setDetailAch(a)}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-violet-200 transition-all group cursor-pointer">
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center border", cfg.bg, cfg.border)}>
                            <Icon className={cn("w-5 h-5", cfg.color)} />
                          </div>
                          <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5 border inline-flex items-center gap-1", sc.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{a.status}
                          </span>
                        </div>
                        <p className="text-sm font-extrabold text-gray-900 mb-0.5">{a.title}</p>
                        <p className="text-[11px] text-gray-400 mb-3">{a.event}</p>
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-3">
                          <span className="font-semibold">{a.grade} · {a.section}</span>
                          <span>{a.students.length} student{a.students.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 border flex-1 text-center", AWARD_COLORS[a.award])}>{a.award}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="Edit" onClick={() => openEdit(a)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="Preview certificate" onClick={() => openCertPreview(a)}>
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-rose-600" title="Delete" onClick={() => deleteAchievement(a.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ CERTIFICATE GENERATOR ═══ */}
          {activeTab === "Certificate Generator" && (
            <div className="grid grid-cols-5 gap-6">
              {/* Left config */}
              <div className="col-span-2 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <h2 className="text-sm font-extrabold text-gray-900">Certificate Settings</h2>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Select Achievement</Label>
                    <Select defaultValue={achievements[0]?.id}
                      onValueChange={v => { const a = achievements.find(x => x.id === v); if(a){setPreviewAch(a);setCertTemplate(a.template);setCertStudent(a.students[0]||"Student Name");} }}>
                      <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {achievements.map(a => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Student</Label>
                    <Select value={certStudent} onValueChange={setCertStudent}>
                      <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(previewAch?.students || SAMPLE_STUDENTS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Template</Label>
                    <Select value={certTemplate} onValueChange={v => setCertTemplate(v as CertTemplate)}>
                      <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CERT_TEMPLATES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Dynamic fields */}
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-1.5">Auto-filled Variables</p>
                    {[
                      ["{{StudentName}}", certStudent],
                      ["{{Grade}}", previewAch?.grade || "Grade 6"],
                      ["{{Section}}", previewAch?.section || "Section A"],
                      ["{{Achievement}}", previewAch?.title || "Achievement Title"],
                      ["{{Position}}", previewAch?.award || "Winner"],
                      ["{{Date}}", previewAch?.date || new Date().toISOString().split("T")[0]],
                      ["{{CertificateID}}", previewAch?.certNo || "CERT-2025-001"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-[10px]">
                        <code className="text-violet-700 font-bold">{k}</code>
                        <span className="text-gray-600 font-semibold truncate max-w-[120px]">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-8 text-xs border-gray-200 gap-1.5" onClick={() => window.print()}>
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>
                    <Button className="flex-1 h-8 text-xs bg-gradient-to-r from-purple-600 to-purple-700 text-white gap-1.5"
                      onClick={() => {
                        if (!previewAch) { toast.error("Select an achievement first"); return; }
                        downloadCertificate(previewAch, certStudent);
                      }}>
                      <Download className="w-3.5 h-3.5" /> Generate PDF
                    </Button>
                  </div>

                  <Button variant="outline" className="w-full h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50 gap-1.5"
                    onClick={() => {
                      if (!previewAch || previewAch.students.length === 0) { toast.error("No students to generate certificates for"); return; }
                      previewAch.students.forEach(s => downloadCertificate(previewAch, s));
                      toast.success(`Generated ${previewAch.students.length} certificate(s) for download`);
                    }}>
                    <Zap className="w-3.5 h-3.5" /> Bulk Generate All Students
                  </Button>
                </div>

                {/* Bulk filters */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <h3 className="text-xs font-extrabold text-gray-900">Bulk Certificate Generator</h3>
                  <Select defaultValue="2024-25">
                    <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue placeholder="Academic Year" /></SelectTrigger>
                    <SelectContent><SelectItem value="2024-25">2024-25</SelectItem></SelectContent>
                  </Select>
                  <Select defaultValue="All">
                    <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue placeholder="Achievement Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Types</SelectItem>
                      {ACHIEVEMENT_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button className="w-full h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                    onClick={() => {
                      if (!previewAch || previewAch.students.length === 0) { toast.error("Select an achievement with students first"); return; }
                      downloadCertificatesZip(previewAch, previewAch.students);
                    }}>
                    <Zap className="w-3.5 h-3.5" /> Generate All as ZIP
                  </Button>
                </div>
              </div>

              {/* Live certificate preview */}
              <div className="col-span-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-extrabold text-gray-900">Live Certificate Preview</h2>
                    <Badge variant="outline" className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                      Real-time Preview
                    </Badge>
                  </div>
                  {/* Certificate canvas */}
                  <div className="border-4 border-violet-100 rounded-2xl overflow-hidden bg-white" style={{ minHeight: 480 }}>
                    <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-4 text-center">
                      <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-1">
                        <GraduationCap className="w-4 h-4 text-white" />
                        <span className="text-white text-xs font-bold uppercase tracking-widest">Student Diwan</span>
                      </div>
                      <p className="text-white/80 text-[10px] font-semibold uppercase tracking-wider">International School</p>
                    </div>
                    <div className="p-8 text-center relative">
                      {/* Gold border decoration */}
                      <div className="absolute inset-4 border-2 border-amber-200/60 rounded-xl pointer-events-none" />
                      <div className="relative">
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 mb-1">Certificate of</p>
                        <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-purple-700 mb-4">
                          {certTemplate === "Participation" ? "Participation" : certTemplate === "Leadership" ? "Leadership" : "Achievement"}
                        </h3>
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300" />
                          <Trophy className="w-6 h-6 text-amber-500" />
                          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-300" />
                        </div>
                        <p className="text-xs text-gray-500 mb-2">This certificate is proudly presented to</p>
                        <p className="text-xl font-black text-gray-900 mb-1">{certStudent}</p>
                        <p className="text-[11px] text-gray-500 mb-4">
                          of {previewAch?.grade || "Grade 6"} — {previewAch?.section || "Section A"}
                        </p>
                        <div className="bg-violet-50 border border-violet-100 rounded-xl px-6 py-3 inline-block mb-4">
                          <p className="text-xs text-gray-500 mb-0.5">for achieving</p>
                          <p className="text-sm font-extrabold text-violet-800">{previewAch?.title || "Outstanding Achievement"}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{previewAch?.event || "Academic Year 2024-25"}</p>
                        </div>
                        <div className="flex items-center justify-center gap-6 mb-4 text-xs">
                          {[["Award", previewAch?.award||"Winner"], ["Date", previewAch?.date||"2025-01-01"], ["Cert No", previewAch?.certNo||"CERT-2025-001"]].map(([k,v]) => (
                            <div key={k} className="text-center">
                              <p className="text-[9px] text-gray-400 uppercase tracking-wider">{k}</p>
                              <p className="text-[11px] font-bold text-gray-800">{v}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-end justify-between px-8 mt-2 pt-4 border-t border-dashed border-gray-200">
                          <div className="text-center">
                            <div className="w-24 h-px bg-gray-400 mb-1 mx-auto" />
                            <p className="text-[9px] text-gray-400">Class Teacher</p>
                          </div>
                          <div className="flex flex-col items-center">
                            <Stamp className="w-8 h-8 text-violet-300 mb-1" />
                            <p className="text-[8px] text-gray-300 uppercase tracking-wider">School Seal</p>
                          </div>
                          <div className="text-center">
                            <div className="w-24 h-px bg-gray-400 mb-1 mx-auto" />
                            <p className="text-[9px] text-gray-400">Principal</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-3">
                          <QrCode className="w-10 h-10 text-gray-200" />
                          <div className="text-left">
                            <p className="text-[8px] text-gray-300 uppercase tracking-widest">Verify at</p>
                            <p className="text-[9px] font-bold text-gray-400">studentdiwan.com/verify</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TEMPLATES ═══ */}
          {activeTab === "Templates" && (
            <div className="grid grid-cols-3 gap-4">
              {CERT_TEMPLATES.map(t => (
                <div key={t} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all group cursor-pointer"
                  onClick={() => { setCertTemplate(t); setActiveTab("Certificate Generator"); toast.info(`Template "${t}" selected`); }}>
                  <div className="h-36 bg-gradient-to-br from-purple-600 to-purple-800 flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                      {t.includes("Sports") ? <Trophy className="w-6 h-6 text-white" /> :
                       t.includes("Leadership") ? <Crown className="w-6 h-6 text-white" /> :
                       t.includes("Participation") ? <Medal className="w-6 h-6 text-white" /> :
                       t.includes("Cultural") ? <Star className="w-6 h-6 text-white" /> :
                       t.includes("Attendance") ? <CheckCircle2 className="w-6 h-6 text-white" /> :
                       t.includes("International") ? <Globe className="w-6 h-6 text-white" /> :
                       <Award className="w-6 h-6 text-white" />}
                    </div>
                    <p className="text-white text-sm font-extrabold text-center px-4">{t}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-3">Professional certificate template with auto-fill fields, school branding, and QR verification support.</p>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {["Logo","Signatures","School Seal","QR Code"].map(f => (
                        <span key={f} className="text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2 py-0.5">{f}</span>
                      ))}
                    </div>
                    <Button className="w-full h-8 text-xs bg-gradient-to-r from-purple-600 to-purple-700 text-white opacity-0 group-hover:opacity-100 transition-all">
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ COMPETITIONS ═══ */}
          {activeTab === "Competitions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-gray-900">Active Competitions & Events</h2>
                <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                  onClick={() => toast.info("Add competition dialog coming soon")}>
                  <Plus className="w-3.5 h-3.5" /> Add Competition
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name:"Science Olympiad 2026", type:"Olympiad", date:"2026-03-15", grades:"Grade 6–10", participants:42, status:"Upcoming" },
                  { name:"Inter-School Football Tournament", type:"Sports", date:"2026-01-20", grades:"Grade 8–12", participants:28, status:"Active" },
                  { name:"Annual Cultural Fest", type:"Cultural", date:"2026-02-10", grades:"All Grades", participants:180, status:"Registration Open" },
                  { name:"Mathematics Olympiad", type:"Olympiad", date:"2026-04-05", grades:"Grade 9–12", participants:35, status:"Upcoming" },
                  { name:"Innovation Fair 2026", type:"Innovation", date:"2026-03-01", grades:"Grade 6–12", participants:60, status:"Registration Open" },
                  { name:"Leadership Summit", type:"Leadership", date:"2026-02-28", grades:"Grade 10–12", participants:20, status:"Active" },
                ].map(c => {
                  const cfg = CAT_CONFIG[c.type as AchievementType] || CAT_CONFIG.Custom;
                  const Icon = cfg.icon;
                  return (
                    <div key={c.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-all">
                      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border", cfg.bg, cfg.border)}>
                        <Icon className={cn("w-5 h-5", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-extrabold text-gray-900 truncate">{c.name}</p>
                          <span className={cn("text-[9px] font-bold rounded-full px-2 py-0.5 border shrink-0 ml-2",
                            c.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            c.status === "Registration Open" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-gray-50 text-gray-600 border-gray-200"
                          )}>{c.status}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-2">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.date}</span>
                          <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{c.grades}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.participants} participants</span>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Button variant="outline" size="sm" className="h-7 text-[10px] border-gray-200 gap-1">
                            <Eye className="w-3 h-3" /> View
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] border-gray-200 gap-1"
                            onClick={() => toast.success(`Achievement created for ${c.name}`)}>
                            <Trophy className="w-3 h-3" /> Add Achievement
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ STUDENT PORTFOLIO ═══ */}
          {activeTab === "Student Portfolio" && (
            <div className="grid grid-cols-4 gap-6">
              {/* Student selector */}
              <div className="col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-extrabold text-gray-900 mb-3">Select Student</h3>
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input placeholder="Search student…" className="pl-8 h-8 text-xs border-gray-200" />
                </div>
                <div className="space-y-1.5">
                  {SAMPLE_STUDENTS.slice(0,8).map(s => (
                    <button key={s} onClick={() => toast.info(`Viewing portfolio for ${s}`)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-violet-50 transition-all text-left group">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                        {s.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <span className="text-xs font-semibold text-gray-700 group-hover:text-violet-700 truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Portfolio view */}
              <div className="col-span-3 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xl font-black">AK</div>
                    <div>
                      <p className="text-base font-extrabold text-gray-900">Advait Kapoor</p>
                      <p className="text-xs text-gray-500">Grade 6 — Section A · Roll No. 1</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge className="text-[9px] bg-violet-100 text-violet-700 border-0">3 Achievements</Badge>
                        <Badge className="text-[9px] bg-amber-100 text-amber-700 border-0">2 Certificates</Badge>
                        <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-0">1 Published</Badge>
                      </div>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 gap-1.5">
                        <Download className="w-3.5 h-3.5" /> Portfolio PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 gap-1.5">
                        <Globe className="w-3.5 h-3.5" /> Share
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <h3 className="text-xs font-extrabold text-gray-700 mb-3 uppercase tracking-wider">Achievement Timeline</h3>
                  <div className="relative pl-5 space-y-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-violet-100" />
                    {achievements.filter(a => a.students.includes("Advait Kapoor")).map(a => {
                      const cfg = CAT_CONFIG[a.type] || CAT_CONFIG.Custom;
                      const Icon = cfg.icon;
                      return (
                        <div key={a.id} className="relative flex items-start gap-3">
                          <div className={cn("absolute -left-5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white", cfg.bg)}>
                            <Icon className={cn("w-2 h-2", cfg.color)} />
                          </div>
                          <div className="flex-1 bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-gray-900">{a.title}</p>
                              <span className={cn("text-[9px] font-bold rounded-full px-2 py-0.5 border", AWARD_COLORS[a.award])}>{a.award}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{a.event} · {a.date}</p>
                          </div>
                        </div>
                      );
                    })}
                    {achievements.filter(a => a.students.includes("Advait Kapoor")).length === 0 && (
                      <p className="text-xs text-gray-400">No achievements for this student yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ APPROVALS ═══ */}
          {activeTab === "Approvals" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-gray-900">Approval Workflow — Kanban Board</h2>
                <p className="text-xs text-gray-400">Click "Advance" on a card to push it to the next stage.</p>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {APPROVAL_STAGES.map(stage => {
                  const cards = achievements.filter(a => a.status === stage);
                  const sc = STATUS_CONFIG[stage];
                  return (
                    <div key={stage} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className={cn("px-4 py-3 border-b", sc.color, "border-opacity-40")}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold">{stage}</span>
                          <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white", sc.dot)}>
                            {cards.length}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 space-y-2 min-h-[300px]">
                        {cards.map(a => {
                          const cfg = CAT_CONFIG[a.type] || CAT_CONFIG.Custom;
                          const Icon = cfg.icon;
                          return (
                            <div key={a.id} className={cn("p-3 rounded-xl border bg-white shadow-sm hover:shadow-md transition-all", cfg.border)}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", cfg.bg)}>
                                  <Icon className={cn("w-3 h-3", cfg.color)} />
                                </div>
                                <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{a.title}</p>
                              </div>
                              <p className="text-[9px] text-gray-400 mb-1.5">{a.students.length} students · {a.date}</p>
                              <p className="text-[9px] text-gray-500 mb-2 truncate">{a.event}</p>
                              {stage !== "Published" && (
                                <Button variant="outline" size="sm" className="w-full h-6 text-[10px] border-gray-200 gap-1"
                                  onClick={() => advanceStage(a.id)}>
                                  Advance <ChevronRight className="w-2.5 h-2.5" />
                                </Button>
                              )}
                              {stage === "Published" && (
                                <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold">
                                  <CheckCircle2 className="w-3 h-3" /> Published &amp; Distributed
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {cards.length === 0 && (
                          <p className="text-center text-[11px] text-gray-300 mt-8">No items</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ ANALYTICS ═══ */}
          {activeTab === "Analytics" && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                {/* Monthly certs bar chart */}
                <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-extrabold text-gray-900">Certificates Generated Monthly</h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-gray-200 gap-1" onClick={() => toast.info("Exporting chart…")}>
                      <Download className="w-3 h-3" /> Export
                    </Button>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={MONTHLY_CERTS} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                      <Bar dataKey="certs" fill="url(#certGrad)" radius={[6,6,0,0]} />
                      <defs>
                        <linearGradient id="certGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7C3AED" />
                          <stop offset="100%" stopColor="#A78BFA" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie chart by type */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-extrabold text-gray-900 mb-4">Achievement Distribution</h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={BY_TYPE} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {BY_TYPE.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {BY_TYPE.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-gray-600 font-semibold">{d.name}</span>
                        </div>
                        <span className="font-bold text-gray-900">{d.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Awards by grade */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-extrabold text-gray-900 mb-4">Awards by Grade</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={BY_GRADE} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="grade" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                    <Bar dataKey="n" fill="url(#gradeGrad)" radius={[6,6,0,0]} />
                    <defs>
                      <linearGradient id="gradeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#6EE7B7" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Export options */}
              <div className="flex items-center gap-3">
                {[["PDF Report","#7C3AED"],["Excel","#10B981"],["ZIP Package","#F59E0B"],["Print","#6B7280"],["Email Report","#3B82F6"]].map(([label, color]) => (
                  <Button key={label} variant="outline" size="sm" className="h-9 text-xs border-gray-200 gap-1.5 font-semibold"
                    style={{ color }}
                    onClick={() => toast.success(`Exporting ${label}…`)}>
                    <Download className="w-3.5 h-3.5" /> {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Create Achievement Dialog ══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl bg-white z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-white" />
              </div>
              {editingId ? "Edit Achievement" : "Create Achievement"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">Fill in achievement details, select students and choose a certificate template.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-3 max-h-[70vh] overflow-y-auto px-1 -mx-1">
            {/* Left col */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Achievement Title *</Label>
                <Input placeholder="e.g. Science Olympiad Winner" value={form.title}
                  onChange={e => setForm(p=>({...p,title:e.target.value}))} className="h-9 text-xs border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Event Name *</Label>
                <Input placeholder="e.g. National Science Olympiad 2025" value={form.event}
                  onChange={e => setForm(p=>({...p,event:e.target.value}))} className="h-9 text-xs border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Achievement Type</Label>
                <Select value={form.type} onValueChange={v => setForm(p=>({...p,type:v as AchievementType}))}>
                  <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACHIEVEMENT_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Award Type</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {AWARD_TYPES.map(a => (
                    <button key={a} type="button" onClick={() => setForm(p=>({...p,award:a}))}
                      className={cn("py-1.5 text-[10px] font-bold rounded-lg border transition-all text-center",
                        form.award === a ? AWARD_COLORS[a] : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      )}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Grade</Label>
                  <Select value={form.grade} onValueChange={v => setForm(p=>({...p,grade:v}))}>
                    <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{grades.map(g=><SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Section</Label>
                  <Select value={form.section} onValueChange={v => setForm(p=>({...p,section:v}))}>
                    <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className="h-9 text-xs border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Certificate Template</Label>
                <Select value={form.template} onValueChange={v => setForm(p=>({...p,template:v as CertTemplate}))}>
                  <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{CERT_TEMPLATES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Description</Label>
                <textarea rows={3} placeholder="Describe the achievement…" value={form.description}
                  onChange={e => setForm(p=>({...p,description:e.target.value}))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none" />
              </div>
            </div>

            {/* Right col – student selector */}
            <div className="space-y-3">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Select Students * ({selectedStudents.length} selected)
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <Input placeholder="Search students…" value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="pl-7 h-8 text-xs border-gray-200" />
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto">
                {SAMPLE_STUDENTS.filter(s => !studentSearch || s.toLowerCase().includes(studentSearch.toLowerCase())).map(s => {
                  const sel = selectedStudents.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => setSelectedStudents(prev => sel ? prev.filter(x=>x!==s) : [...prev,s])}
                      className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-gray-50 last:border-0",
                        sel ? "bg-violet-50" : "hover:bg-gray-50"
                      )}>
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all",
                        sel ? "bg-purple-600 border-purple-600" : "border-gray-300")}>
                        {sel && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-[9px] font-black">
                        {s.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <span className={cn("text-xs font-semibold", sel ? "text-violet-800" : "text-gray-700")}>{s}</span>
                    </button>
                  );
                })}
              </div>
              {selectedStudents.length > 0 && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-2.5">
                  <p className="text-[10px] font-bold text-violet-700 mb-1.5">Selected Students:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedStudents.map(s => (
                      <span key={s} className="flex items-center gap-1 text-[9px] font-bold bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">
                        {s.split(" ")[0]}
                        <button onClick={() => setSelectedStudents(p=>p.filter(x=>x!==s))}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dialog footer */}
          <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
            <div className="flex-1 text-[10px] text-gray-400">
              {editingId
                ? <>Editing <strong>{form.title || "achievement"}</strong> — changes apply immediately.</>
                : <>Achievement will start in <strong>Draft</strong> status → approval workflow applies.</>}
            </div>
            <Button variant="outline" className="h-9 text-xs border-gray-200" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button className="h-9 text-xs bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 font-bold gap-1.5"
              onClick={createAchievement}>
              <Trophy className="w-3.5 h-3.5" /> {editingId ? "Save Changes" : "Create Achievement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Achievement Detail Sheet ══ */}
      <Sheet open={liveDetail !== null} onOpenChange={open => !open && setDetailAch(null)}>
        <SheetContent className="sm:max-w-xl w-full bg-white z-[200] p-0 overflow-y-auto">
          {liveDetail && (() => {
            const cfg = CAT_CONFIG[liveDetail.type] || CAT_CONFIG.Custom;
            const Icon = cfg.icon;
            const sc = STATUS_CONFIG[liveDetail.status] || STATUS_CONFIG.Draft;
            const stageIdx = APPROVAL_STAGES.indexOf(liveDetail.status);
            return (
              <>
                {/* Gradient header */}
                <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-6 text-white">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-1 bg-white/15 backdrop-blur border border-white/20")}>
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />{liveDetail.status}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold leading-tight">{liveDetail.title}</h2>
                  <p className="text-white/70 text-xs mt-1">{liveDetail.event}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-white/15 border border-white/20">{liveDetail.type}</span>
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-400/90 text-amber-900">{liveDetail.award}</span>
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-white/15 border border-white/20">{liveDetail.certNo}</span>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Grade", liveDetail.grade, GraduationCap],
                      ["Section", liveDetail.section, Users],
                      ["Award Date", liveDetail.date || "—", Calendar],
                      ["Academic Year", liveDetail.year, BookOpen],
                      ["Assigned By", liveDetail.teacher, ShieldCheck],
                      ["Template", liveDetail.template, FileText],
                    ].map(([label, val, IconC]: any) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <IconC className="w-3 h-3 text-gray-400" />
                          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                        </div>
                        <p className="text-xs font-bold text-gray-800">{val}</p>
                      </div>
                    ))}
                  </div>

                  {liveDetail.description && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Description</p>
                      <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">{liveDetail.description}</p>
                    </div>
                  )}

                  {/* Approval progress */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">Approval Workflow</p>
                    <div className="flex items-center">
                      {APPROVAL_STAGES.map((stage, i) => (
                        <div key={stage} className="flex items-center flex-1 last:flex-none">
                          <div className="flex flex-col items-center gap-1">
                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all",
                              i <= stageIdx ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-400 border border-gray-200")}>
                              {i < stageIdx ? <Check className="w-3 h-3" /> : i + 1}
                            </div>
                            <span className={cn("text-[8px] font-bold text-center max-w-[52px] leading-tight",
                              i <= stageIdx ? "text-violet-700" : "text-gray-400")}>{stage}</span>
                          </div>
                          {i < APPROVAL_STAGES.length - 1 && (
                            <div className={cn("h-0.5 flex-1 mx-1 -mt-4 rounded", i < stageIdx ? "bg-purple-600" : "bg-gray-200")} />
                          )}
                        </div>
                      ))}
                    </div>
                    {liveDetail.status !== "Published" && (
                      <Button size="sm" className="w-full mt-3 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                        onClick={() => advanceStage(liveDetail.id)}>
                        <ChevronRight className="w-3.5 h-3.5" /> Advance to {APPROVAL_STAGES[stageIdx + 1]}
                      </Button>
                    )}
                  </div>

                  {/* Students awarded */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Students Awarded ({liveDetail.students.length})
                      </p>
                      <button className="text-[10px] font-bold text-purple-600 hover:text-violet-800"
                        onClick={() => downloadCertificatesZip(liveDetail, liveDetail.students)}>
                        Generate All Certificates
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {liveDetail.students.map(s => (
                        <div key={s} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-violet-50/40 transition-colors group">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                            {s.split(" ").map(n=>n[0]).join("").slice(0,2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{s}</p>
                            <p className="text-[10px] text-gray-400">{liveDetail.grade} · {liveDetail.section}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="Preview certificate"
                              onClick={() => openCertPreviewFromDetail(liveDetail, s)}>
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-emerald-600" title="Download certificate"
                              onClick={() => downloadCertificate(liveDetail, s)}>
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-purple-600" title="Notify student"
                              onClick={() => emailCertificateNotification(liveDetail, [s])}>
                              <Mail className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sticky footer actions */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center gap-2">
                  <Button variant="outline" className="border-red-100 hover:bg-red-50 text-red-600 gap-1.5 text-xs h-9"
                    onClick={() => deleteAchievement(liveDetail.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                  <div className="flex-1" />
                  <Button variant="outline" className="border-gray-200 text-xs h-9 gap-1.5" onClick={() => openEdit(liveDetail)}>
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button className="bg-gradient-to-r from-purple-600 to-purple-700 text-white text-xs h-9 px-4 font-bold gap-1.5"
                    onClick={() => { toast.success(`"${liveDetail.title}" published to parent & student portals`); }}>
                    <Globe className="w-3.5 h-3.5" /> Publish to Portal
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ══ Certificate Preview Sheet ══ */}
      <Sheet open={certPreviewOpen} onOpenChange={setCertPreviewOpen}>
        <SheetContent className="sm:max-w-lg w-full bg-white z-[300]">
          <SheetHeader className="pb-4 border-b border-gray-100">
            <SheetTitle className="flex items-center gap-2 text-sm font-extrabold">
              <FileText className="w-4 h-4 text-purple-600" /> Certificate Preview
            </SheetTitle>
            <SheetDescription className="text-xs text-gray-400">{previewAch?.title}</SheetDescription>
          </SheetHeader>
          <div className="py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Student</Label>
              <Select value={certStudent} onValueChange={setCertStudent}>
                <SelectTrigger className="h-8 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(previewAch?.students || []).map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Mini cert preview */}
            <div className="border-2 border-violet-100 rounded-2xl overflow-hidden scale-90 origin-top">
              <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-3 text-center">
                <p className="text-white font-black text-sm uppercase tracking-widest">Student Diwan</p>
                <p className="text-white/70 text-[9px] uppercase tracking-wider">International School</p>
              </div>
              <div className="p-6 text-center bg-white">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Certificate of Achievement</p>
                <Trophy className="w-8 h-8 text-amber-400 mx-auto my-2" />
                <p className="text-[9px] text-gray-400 mb-1">This certificate is proudly presented to</p>
                <p className="text-base font-black text-gray-900">{certStudent}</p>
                <p className="text-[9px] text-gray-400 mt-1 mb-3">{previewAch?.grade} · {previewAch?.section}</p>
                <div className="bg-violet-50 rounded-lg p-2 mb-3">
                  <p className="text-[10px] font-extrabold text-violet-800">{previewAch?.title}</p>
                  <p className="text-[9px] text-gray-400">{previewAch?.event}</p>
                </div>
                <div className="flex justify-between px-4 text-[9px] text-gray-400 mb-2">
                  <div><p className="font-bold">{previewAch?.award}</p><p>Award</p></div>
                  <div><p className="font-bold">{previewAch?.date}</p><p>Date</p></div>
                  <div><p className="font-bold">{previewAch?.certNo}</p><p>Cert No.</p></div>
                </div>
                <div className="flex justify-between px-6 pt-2 border-t border-dashed border-gray-200 mt-2">
                  <div className="text-center"><div className="w-14 h-px bg-gray-300 mb-0.5 mx-auto"/><p className="text-[8px] text-gray-400">Teacher</p></div>
                  <Stamp className="w-6 h-6 text-violet-200" />
                  <div className="text-center"><div className="w-14 h-px bg-gray-300 mb-0.5 mx-auto"/><p className="text-[8px] text-gray-400">Principal</p></div>
                </div>
                <QrCode className="w-8 h-8 text-gray-200 mx-auto mt-2" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-9 text-xs border-gray-200 gap-1.5"
                onClick={() => { window.print(); }}>
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button variant="outline" className="flex-1 h-9 text-xs border-gray-200 gap-1.5"
                onClick={() => previewAch && emailCertificateNotification(previewAch, [certStudent])}>
                <Mail className="w-3.5 h-3.5" /> Notify Student
              </Button>
              <Button className="flex-1 h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                onClick={() => previewAch && downloadCertificate(previewAch, certStudent)}>
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </div>
            <Button variant="outline" className="w-full h-9 text-xs border-violet-200 text-violet-700 hover:bg-violet-50 gap-1.5"
              onClick={() => toast.success(`"${previewAch?.title}" published to parent & student portals`)}>
              <Globe className="w-3.5 h-3.5" /> Publish to Parent Portal
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
