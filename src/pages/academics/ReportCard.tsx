import { useState, useRef, useMemo, useEffect } from "react";
import {
  FileCheck, Users, CheckCircle2, Clock, Calendar, Download, Search,
  ChevronRight, ChevronDown, Eye, Printer,
  Mail, BarChart3, TrendingUp,
  Sparkles, Star, AlertTriangle, BookOpen, Award,
  QrCode, Brain,
  MessageSquare, Activity, Zap, FileText, Trash2,
  ArrowUpRight, ArrowDownRight, CircleDot, Check,
  ChevronLeft, Send, Globe, Smartphone, X, RefreshCw, Plus
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/hooks/useClasses";
import { useCurriculum } from "@/hooks/useCurriculum";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeStudentGradebook,
  type GradebookSources,
} from "@/lib/gradebookEngine";
import {
  saveReportCards, reportCardId, getReportCard, regenerateReportCard, regenerateReportCards,
  submitReportCard, verifyReportCard, approveReportCard, publishReportCard, reopenReportCard,
  getPrincipalName,
  APPROVAL_CHAIN, ApprovalError, type ReportCardRecord, type ReportCardStatus,
  notifyReportCard, notifyManyReportCards,
} from "@/lib/reportCardStore";
import { getAllSubmissions, type GradebookSubmission } from "@/lib/gradebookApproval";
import { subjectsAssignedFor, type SubjectAssignment } from "@/lib/timetableRules";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { useAuth } from "@/hooks/useAuth";
import { useExams, matchesSection } from "@/lib/examStore";

// ── Types ────────────────────────────────────────────────────────────────────
type GradingSystem = "Percentage" | "GPA" | "CBSE 10 Point Scale" | "IB Scale" | "Letter Grades";
type Language = "English" | "Arabic" | "Hindi" | "French";
type TemplateId = "primary" | "elementary" | "cbse" | "icse" | "british" | "ib" | "american" | "qatar" | "custom" | "bluewood";

// ── Constants ────────────────────────────────────────────────────────────────
const STEPS: { id: number; label: string; sub: string; icon: typeof Users }[] = [
  { id: 1, label: "Term & Exam",      sub: "Choose term and exam",     icon: Calendar },
  { id: 2, label: "Grade",            sub: "Select grade",             icon: BookOpen },
  { id: 3, label: "Section",          sub: "Select section",           icon: CircleDot },
  { id: 4, label: "Students",         sub: "Select students",          icon: Users },
  { id: 5, label: "Template",         sub: "Template & settings",      icon: FileText },
  { id: 6, label: "Generate",         sub: "Preview & generate",       icon: Zap },
];

const EXAMS = ["Mid-Term Exam", "Final Exam", "Unit Test 1", "Unit Test 2", "Annual Exam", "Pre-Board"];

const TEMPLATES: { id: TemplateId; label: string; short: string; color: string }[] = [
  { id: "primary",    label: "Primary School Template",  short: "Primary",    color: "#6C3BFF" },
  { id: "elementary", label: "Elementary Template",       short: "Elementary", color: "#8B5CF6" },
  { id: "cbse",       label: "CBSE Template",             short: "CBSE",       color: "#10B981" },
  { id: "icse",       label: "ICSE Template",             short: "ICSE",       color: "#F59E0B" },
  { id: "british",    label: "British Curriculum",        short: "British",    color: "#3B82F6" },
  { id: "ib",         label: "IB Template",               short: "IB",         color: "#EF4444" },
  { id: "american",   label: "American Curriculum",       short: "American",   color: "#DC2626" },
  { id: "qatar",      label: "Qatar National Curriculum",  short: "Qatar",      color: "#8A1538" },
  { id: "custom",     label: "Custom Template",           short: "Custom",     color: "#64748B" },
  { id: "bluewood",   label: "Bluewood Enterprise E-Report Card", short: "Bluewood", color: "#0B2E6D" },
];

// Each template drives a genuinely different report card: colors, header layout,
// grade scale and board label all change based on the selected template.
type HeaderStyle = "bar" | "centered" | "seal" | "banner" | "columns" | "scale" | "minimal";
type Theme = {
  primary: string; accent: string; soft: string; header: HeaderStyle;
  board: string; scale: (pct: number) => string; scaleLabel: string;
  coScholastic: string[];
  /** Only used by the "seal" header style — short badge text inside the seal
   *  circle, and the registration/affiliation line beneath the board name.
   *  Was hardcoded to "CBSE" / a CBSE affiliation number regardless of which
   *  template was selected until this was added. */
  sealText?: string; regLine?: string;
};
const TEMPLATE_THEME: Record<TemplateId, Theme> = {
  primary: {
    primary: "#6C3BFF", accent: "#8B5CF6", soft: "#F5F3FF", header: "bar",
    board: "Primary School Report Card", scaleLabel: "Grade",
    scale: p => p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : "D",
    coScholastic: ["Life Skills", "Attitude", "Behaviour", "Participation"],
  },
  elementary: {
    primary: "#8B5CF6", accent: "#C084FC", soft: "#FAF5FF", header: "centered",
    board: "Elementary Progress Report", scaleLabel: "Level",
    scale: p => p >= 85 ? "Outstanding" : p >= 70 ? "Proficient" : p >= 55 ? "Developing" : "Emerging",
    coScholastic: ["Teamwork", "Creativity", "Discipline", "Curiosity"],
  },
  cbse: {
    primary: "#10B981", accent: "#34D399", soft: "#ECFDF5", header: "seal",
    board: "CBSE · Central Board of Secondary Education", scaleLabel: "CGPA Grade",
    scale: p => p >= 91 ? "A1" : p >= 81 ? "A2" : p >= 71 ? "B1" : p >= 61 ? "B2" : p >= 51 ? "C1" : "C2",
    coScholastic: ["Work Education", "Art Education", "Health & PE", "Discipline"],
    sealText: "CBSE", regLine: "Affiliation No. 2630045",
  },
  icse: {
    primary: "#F59E0B", accent: "#FBBF24", soft: "#FFFBEB", header: "banner",
    board: "ICSE · Council for the Indian School Certificate", scaleLabel: "Percentage",
    scale: p => `${p}%`,
    coScholastic: ["SUPW", "Conduct", "Punctuality", "Co-curricular"],
  },
  british: {
    primary: "#3B82F6", accent: "#60A5FA", soft: "#EFF6FF", header: "columns",
    board: "British Curriculum · Cambridge Assessment", scaleLabel: "Attainment",
    scale: p => p >= 90 ? "A*" : p >= 80 ? "A" : p >= 70 ? "B" : p >= 60 ? "C" : p >= 50 ? "D" : "E",
    coScholastic: ["House Points", "Effort", "Behaviour", "Homework"],
  },
  ib: {
    primary: "#EF4444", accent: "#F87171", soft: "#FEF2F2", header: "scale",
    board: "International Baccalaureate · MYP", scaleLabel: "IB Score",
    scale: p => String(Math.max(1, Math.min(7, Math.round(p / 14.3)))),
    coScholastic: ["Inquiry", "Communication", "Thinking", "Self-Management"],
  },
  american: {
    primary: "#DC2626", accent: "#F87171", soft: "#FEF2F2", header: "banner",
    board: "American Curriculum · US Common Core Standards", scaleLabel: "Letter Grade",
    scale: p => p >= 90 ? "A" : p >= 80 ? "B" : p >= 70 ? "C" : p >= 60 ? "D" : "F",
    coScholastic: ["Citizenship", "Work Habits", "Physical Education", "Extracurricular"],
  },
  qatar: {
    primary: "#8A1538", accent: "#B8123F", soft: "#FDF2F5", header: "seal",
    board: "State of Qatar · Ministry of Education & Higher Education", scaleLabel: "Grade",
    scale: p => p >= 90 ? "Excellent" : p >= 80 ? "Very Good" : p >= 70 ? "Good" : p >= 60 ? "Acceptable" : "Weak",
    coScholastic: ["Islamic Studies", "Arabic Language", "Qatari Heritage", "Civic Education"],
    sealText: "QATAR", regLine: "MOEHE School License No. QA-2026",
  },
  custom: {
    primary: "#64748B", accent: "#94A3B8", soft: "#F8FAFC", header: "minimal",
    board: "Custom Report Card", scaleLabel: "Grade",
    scale: p => p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : "D",
    coScholastic: ["Skill 1", "Skill 2", "Skill 3", "Skill 4"],
  },
  bluewood: {
    primary: "#0B2E6D", accent: "#D4AF37", soft: "#F4F7FC", header: "bar",
    board: "Bluewood School · E-Report Card", scaleLabel: "Grade",
    scale: p => p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : "D",
    coScholastic: ["Sports", "Discipline", "Participation", "Innovation", "Community Service"],
  },
};

const GRADING_SYSTEMS: GradingSystem[] = ["Percentage", "GPA", "CBSE 10 Point Scale", "IB Scale", "Letter Grades"];
const LANGUAGES: Language[] = ["English", "Arabic", "Hindi", "French"];

const ACADEMIC_YEARS = ["2026-27", "2025-26", "2024-25"];
const TERMS = ["Term 1", "Term 2", "Term 3", "Annual"];
const CLASSES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
const SECTIONS = ["Section A", "Section B", "Section C", "Section D"];

const INITIAL_COMPONENTS = [
  { id: "academic",      label: "Academic Performance",  desc: "Subject-wise marks and grades",    icon: BookOpen,      enabled: true },
  { id: "attendance",    label: "Attendance Summary",    desc: "Overall attendance summary",       icon: CheckCircle2,  enabled: true },
  { id: "coscholastic",  label: "Co-Scholastic Areas",   desc: "Life skills, attitude, behavior",  icon: Star,          enabled: true },
  { id: "remarks",       label: "Remarks",               desc: "Teacher and principal remarks",    icon: MessageSquare, enabled: true },
  { id: "graph",         label: "Performance Graph",     desc: "Subject performance trends",       icon: Activity,      enabled: true },
  { id: "rank",          label: "Rank & Overall Grade",  desc: "Overall rank and grade",           icon: Award,         enabled: true },
  { id: "behavior",      label: "Behavior Assessment",   desc: "Conduct and discipline record",    icon: CircleDot,     enabled: false },
  { id: "goals",         label: "Student Goals",         desc: "Term goals and achievements",      icon: TrendingUp,    enabled: false },
  { id: "ai",            label: "AI Performance Insights", desc: "AI-powered recommendations",    icon: Brain,          enabled: false },
  { id: "parent",        label: "Parent Feedback Section", desc: "Parent acknowledgment section",  icon: Users,         enabled: false },
];

const SUBJECT_NAMES = ["English", "Mathematics", "Science", "Social Studies", "Computer Science"];

// Stable per-student marks: same student always yields the same marks (seeded by name),
// but every student differs — so the preview/exports feel like real, individual records.
function hashStr(s: string) {
  const str = s || "seed";
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
// Engine-backed override: when the gradebook engine has computed real marks for a
// student (keyed by name), genSubjects returns those instead of the seeded hash, so
// the whole admin generator (preview, exports, KPIs) shows real data with no prop
// threading. Falls back to the deterministic seed only for students with no marks.
let _engineSubjectsByName: Map<string, { name: string; max: number; obtained: number }[]> | null = null;
export function setEngineSubjects(map: Map<string, { name: string; max: number; obtained: number }[]> | null) {
  _engineSubjectsByName = map;
}
function genSubjects(seed: string) {
  const real = _engineSubjectsByName?.get(seed);
  if (real && real.length) return real;
  const h = hashStr(seed);
  return SUBJECT_NAMES.map((name, i) => {
    const max = 100;
    const obtained = 62 + ((h >> (i * 3)) % 38); // 62–99
    return { name, max, obtained };
  });
}
// Real-only lookup — used by the actual generate/print/export/CSV paths, which
// must never show a fabricated mark. Returns null (not a fallback) when the
// student has no real graded data yet, so callers can render an honest
// "no marks entered" state instead.
function realSubjects(seed: string): { name: string; max: number; obtained: number }[] | null {
  const real = _engineSubjectsByName?.get(seed);
  return real && real.length ? real : null;
}
// Default sample used by the gallery/analytics widgets (decorative only —
// never reaches an actual student's printed/downloaded report card).
const SUBJECTS = genSubjects("Aarav Sharma");

// ── Sub-components ───────────────────────────────────────────────────────────

function SelectField({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: dark ? "#8B8BA8" : "#64748B",
        textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", appearance: "none", background: dark ? "#1A1A30" : "#F8FAFC",
            border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 9, padding: "9px 32px 9px 12px",
            fontSize: 13, color: dark ? "#F0EFFF" : "#0F172A", fontWeight: 500, cursor: "pointer",
            outline: "none", fontFamily: "inherit" }}
          onFocus={e => { e.target.style.borderColor = dark ? "#9B59E6" : "#6C3BFF"; e.target.style.background = dark ? "#16162A" : "#fff"; }}
          onBlur={e => { e.target.style.borderColor = dark ? "#2A2A45" : "#E2E8F0"; e.target.style.background = dark ? "#1A1A30" : "#F8FAFC"; }}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown style={{ position: "absolute", right: 10, top: "50%",
          transform: "translateY(-50%)", width: 14, height: 14, color: dark ? "#8B8BA8" : "#64748B", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  const { theme } = useTheme(); const dark = theme === "dark";
  return (
    <button
      onClick={onChange}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        borderRadius: 9, background: checked ? (dark ? "#9B59E620" : "#F5F3FF") : (dark ? "#1A1A30" : "#F8FAFC"),
        border: `1.5px solid ${checked ? (dark ? "#9B59E660" : "#6C3BFF40") : (dark ? "#2A2A45" : "#E2E8F0")}`,
        cursor: "pointer", textAlign: "left", width: "100%", transition: "all .15s", fontFamily: "inherit" }}
    >
      <div style={{ width: 32, height: 18, borderRadius: 999, background: checked ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#CBD5E1"),
        position: "relative", flexShrink: 0, transition: "background .2s" }}>
        <div style={{ position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          transform: checked ? "translateX(16px)" : "translateX(2px)", transition: "transform .2s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A" }}>{label}</span>
    </button>
  );
}

function ComponentCard({ id, label, desc, icon: Icon, enabled, onClick }: {
  id: string; label: string; desc: string; icon: typeof BookOpen; enabled: boolean; onClick: () => void;
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: enabled ? (dark ? "#9B59E620" : "#F5F3FF") : (dark ? "#1A1A30" : "#F8FAFC"),
        border: `1.5px solid ${enabled ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0")}`,
        borderRadius: 10, cursor: "pointer", transition: "all .15s", textAlign: "left", fontFamily: "inherit",
        width: "100%" }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: enabled ? (dark ? "#9B59E630" : "#6C3BFF15") : (dark ? "#2A2A45" : "#F1F5F9"),
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon style={{ width: 15, height: 15, color: enabled ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#8B8BA8" : "#94A3B8") }} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A" }}>{label}</p>
        <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#64748B", marginTop: 1 }}>{desc}</p>
      </div>
      <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        background: enabled ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0"),
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {enabled && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
      </div>
    </button>
  );
}

function ReportPreview({ studentName = "Aarav Sharma", cls = "Grade 1", section = "A",
  template = "primary" as TemplateId, term = "Term 1", year = "2026-27",
  rollNo = 1, admNo = "ADM-2026-001", attendance = 92.6,
  realOnly = true, remark, teacherName, principalName }: {
  studentName?: string; cls?: string; section?: string; template?: TemplateId; term?: string; year?: string;
  rollNo?: number | string; admNo?: string; attendance?: number;
  realOnly?: boolean; remark?: string; teacherName?: string; principalName?: string;
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  const th = TEMPLATE_THEME[template];
  const realSubs = realOnly ? realSubjects(studentName) : null;
  if (realOnly && !realSubs) {
    return (
      <div style={{ background: dark ? "#16162A" : "#fff", border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12,
        padding: 32, fontFamily: "inherit", textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A" }}>No marks entered yet</p>
        <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", marginTop: 6 }}>
          {studentName} has no graded marks recorded for {term} · {year}. A report card cannot be
          previewed until subject teachers submit marks.
        </p>
      </div>
    );
  }
  const subjects = realSubs || [];
  const total = subjects.reduce((s, x) => s + x.max, 0) || 100;
  const obtained = subjects.reduce((s, x) => s + x.obtained, 0);
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;
  const initials = (studentName || "?").split(" ").map(n => n[0]).join("").slice(0, 2);
  const remarkText = remark?.trim() || "No remarks entered yet.";
  const teacherSigName = teacherName?.trim() || "—";
  const principalSigName = principalName?.trim() || "—";

  if (template === "bluewood") {
    const scale = th.scale;
    return (
      <div style={{
        background: dark ? "#111124" : "#fff",
        color: dark ? "#E2E8F0" : "#0F172A",
        border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`,
        borderRadius: 16,
        padding: "24px",
        fontFamily: "'Inter', sans-serif",
        boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
        maxWidth: "800px",
        margin: "0 auto"
      }}>
        {/* Header Block */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderBottom: `2.5px solid #0B2E6D`, paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/bluewood-logo.svg" alt="B W" style={{ width: 56, height: 56, objectFit: "contain" }} onError={(e) => { e.currentTarget.src = "/bluewood-school.png" }} />
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0B2E6D", margin: 0, letterSpacing: "-0.5px" }}>BLUEWOOD SCHOOL</h2>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#D4AF37", margin: "2px 0 0", letterSpacing: "0.15em" }}>INSPIRE · LEARN · ACHIEVE</p>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0B2E6D", margin: 0, letterSpacing: "-0.5px" }}>E-REPORT CARD</h1>
            <p style={{ fontSize: 11, color: "#64748B", margin: "2px 0 0", fontWeight: 600 }}>Academic Year {year}</p>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, background: "#0B2E6D", color: "#fff", padding: "3px 10px", borderRadius: 4 }}>{term}</span>
              <span style={{ fontSize: 9, fontWeight: 800, background: "#10B98115", color: "#10B981", border: "1px solid #10B98130", padding: "2px 10px", borderRadius: 999 }}>PUBLISHED ✓</span>
            </div>
          </div>
          <div style={{ fontSize: 9.5, border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: "8px 12px", background: dark ? "#1A1A30" : "#F8FAFC", minWidth: 160 }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${dark ? "#2A2A45" : "#EEF2F7"}`, paddingBottom: 4 }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>Report Card No:</span>
              <span style={{ fontWeight: 700 }}>BW/RC/{year.replace("-","")}/{String(rollNo).padStart(4, "0")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${dark ? "#2A2A45" : "#EEF2F7"}`, padding: "4px 0" }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>Date of Issue:</span>
              <span style={{ fontWeight: 700 }}>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${dark ? "#2A2A45" : "#EEF2F7"}`, padding: "4px 0" }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>Grade & Section:</span>
              <span style={{ fontWeight: 700 }}>{cls} - {section}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>Academic Year:</span>
              <span style={{ fontWeight: 700 }}>{year}</span>
            </div>
          </div>
        </div>

        {/* Student Info Card & Message */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, marginBottom: 14 }}>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 14, display: "flex", gap: 14, background: dark ? "#16162A" : "#F8FAFC" }}>
            <div style={{ width: 80, height: 96, borderRadius: 8, background: dark ? "#2A2A45" : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${dark ? "#3D3D5C" : "#CBD5E1"}` }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: "#0B2E6D" }}>{initials}</span>
                <p style={{ fontSize: 9, color: "#64748B", margin: "2px 0 0", fontWeight: 700 }}>STUDENT</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", flex: 1, fontSize: 10 }}>
              <div style={{ gridColumn: "span 2", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0B2E6D", margin: 0 }}>{studentName}</h3>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block", fontSize: 8, fontWeight: 700 }}>ADMISSION NO</span>
                <p style={{ fontWeight: 700, margin: 0 }}>{admNo}</p>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block", fontSize: 8, fontWeight: 700 }}>ROLL NUMBER</span>
                <p style={{ fontWeight: 700, margin: 0 }}>{rollNo}</p>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block", fontSize: 8, fontWeight: 700 }}>HOUSE</span>
                <p style={{ fontWeight: 700, margin: 0, color: "#0B2E6D" }}>Blue House</p>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block", fontSize: 8, fontWeight: 700 }}>NATIONALITY</span>
                <p style={{ fontWeight: 700, margin: 0 }}>Indian</p>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ color: "#64748B", display: "block", fontSize: 8, fontWeight: 700 }}>CLASS TEACHER</span>
                <p style={{ fontWeight: 700, margin: 0 }}>{teacherSigName}</p>
              </div>
            </div>
          </div>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", background: dark ? "#16162A" : "#F8FAFC" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 6px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              MESSAGE FROM SCHOOL
            </p>
            <p style={{ fontSize: 10, color: dark ? "#CBD5E1" : "#475569", margin: 0, flex: 1, fontStyle: "italic", lineHeight: 1.4 }}>
              "{studentName} has shown consistent academic performance and a positive attitude towards learning. He is an active participant in class activities."
            </p>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#D4AF37", textAlign: "right", margin: "4px 0 0" }}>— The School Administration</p>
          </div>
        </div>

        {/* Academic Performance & Performance Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 14, marginBottom: 14 }}>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#0B2E6D", padding: "8px 12px", color: "#fff" }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>ACADEMIC PERFORMANCE</span>
            </div>
            <div style={{ flex: 1, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
                <thead>
                  <tr style={{ background: dark ? "#1F1F35" : "#F4F7FC", borderBottom: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}` }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: "#0B2E6D" }}>SUBJECT CODE</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: "#0B2E6D" }}>SUBJECT</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#0B2E6D" }}>MAX</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#0B2E6D" }}>OBTAINED</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#0B2E6D" }}>PCT (%)</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#0B2E6D" }}>GRADE</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#0B2E6D" }}>GP</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s, idx) => {
                    const sp = Math.round((s.obtained / s.max) * 100);
                    const gradeVal = scale(sp);
                    const gp = (sp >= 90 ? 4.0 : sp >= 80 ? 3.8 : sp >= 70 ? 3.5 : sp >= 60 ? 3.0 : 2.5).toFixed(1);
                    return (
                      <tr key={idx} style={{ borderBottom: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, background: idx % 2 === 0 ? "transparent" : (dark ? "#17172F" : "#FAFBFE") }}>
                        <td style={{ padding: "8px 8px", fontWeight: 700 }}>{s.name.slice(0, 3).toUpperCase()}{100 + idx}</td>
                        <td style={{ padding: "8px 8px", fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: "8px 8px", textAlign: "center" }}>{s.max}</td>
                        <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700 }}>{s.obtained}</td>
                        <td style={{ padding: "8px 8px", textAlign: "center" }}>{sp}.0%</td>
                        <td style={{ padding: "8px 8px", textAlign: "center" }}>
                          <span style={{ background: "#0B2E6D10", color: "#0B2E6D", fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>{gradeVal}</span>
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700 }}>{gp}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#0B2E6D", color: "#fff", fontWeight: 700 }}>
                    <td colSpan={2} style={{ padding: "8px 8px", textTransform: "uppercase" }}>TOTAL</td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>{total}</td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>{obtained}</td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>{pct}.0%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>{scale(pct)}</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", color: "#D4AF37" }}>
                      {(subjects.reduce((a, x) => {
                        const sp = Math.round((x.obtained / x.max) * 100);
                        return a + (sp >= 90 ? 4.0 : sp >= 80 ? 3.8 : sp >= 70 ? 3.5 : sp >= 60 ? 3.0 : 2.5);
                      }, 0) / (subjects.length || 1)).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance Summary Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#0B2E6D", padding: "8px 12px", color: "#fff", borderRadius: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>PERFORMANCE SUMMARY</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
              <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dark ? "#16162A" : "#fff", textAlign: "center" }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <span style={{ fontSize: 7, color: "#64748B", fontWeight: 700, marginTop: 4 }}>TOTAL MARKS</span>
                <p style={{ fontSize: 11, fontWeight: 800, margin: "2px 0 0" }}>{obtained} / {total}</p>
              </div>
              <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dark ? "#16162A" : "#fff", textAlign: "center" }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <span style={{ fontSize: 7, color: "#64748B", fontWeight: 700, marginTop: 4 }}>PERCENTAGE</span>
                <p style={{ fontSize: 11, fontWeight: 800, margin: "2px 0 0" }}>{pct}%</p>
              </div>
              <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dark ? "#16162A" : "#fff", textAlign: "center" }}>
                <span style={{ fontSize: 18 }}>⭐</span>
                <span style={{ fontSize: 7, color: "#64748B", fontWeight: 700, marginTop: 4 }}>OVERALL GRADE</span>
                <p style={{ fontSize: 11, fontWeight: 800, margin: "2px 0 0", color: "#0B2E6D" }}>{scale(pct)}</p>
              </div>
              <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dark ? "#16162A" : "#fff", textAlign: "center" }}>
                <span style={{ fontSize: 18 }}>🏅</span>
                <span style={{ fontSize: 7, color: "#64748B", fontWeight: 700, marginTop: 4 }}>CLASS RANK</span>
                <p style={{ fontSize: 11, fontWeight: 800, margin: "2px 0 0" }}>3 / 32</p>
              </div>
              <div style={{ gridColumn: "span 2", border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, background: dark ? "#16162A" : "#fff" }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 7, color: "#64748B", fontWeight: 700 }}>ATTENDANCE</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{attendance}%</span>
                    <span style={{ fontSize: 8, color: "#64748B" }}>(Working Days: 200)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Learning Outcomes, Attendance & Grade Distribution */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              LEARNING OUTCOMES
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 9.5 }}>
              {[
                { name: "Communication", stars: 5 },
                { name: "Critical Thinking", stars: 5 },
                { name: "Creativity", stars: 4 },
                { name: "Leadership", stars: 5 },
                { name: "Teamwork", stars: 5 },
                { name: "Responsibility", stars: 5 }
              ].map(item => (
                <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ color: "#D4AF37", fontSize: 10.5 }}>
                    {"★".repeat(item.stars)}{"☆".repeat(5 - item.stars)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              ATTENDANCE SUMMARY
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 9.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Working Days</span>
                <span style={{ fontWeight: 700 }}>200 Days</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Present Days</span>
                  <span style={{ fontWeight: 700 }}>188 Days</span>
                </div>
                <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2 }}>
                  <div style={{ width: "94%", height: "100%", background: "#10B981", borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Absent Days</span>
                  <span style={{ fontWeight: 700 }}>12 Days</span>
                </div>
                <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2 }}>
                  <div style={{ width: "6%", height: "100%", background: "#EF4444", borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Late Arrivals</span>
                  <span style={{ fontWeight: 700 }}>5 Days</span>
                </div>
                <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2 }}>
                  <div style={{ width: "2.5%", height: "100%", background: "#F59E0B", borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              GRADE DISTRIBUTION
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", height: "100%", maxHeight: 90 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: "10px solid #0B2E6D", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#0B2E6D", lineHeight: 1 }}>{subjects.length}</span>
                  <p style={{ fontSize: 5.5, color: "#64748B", margin: 0, fontWeight: 700 }}>Subj</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 8, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#0B2E6D" }} />
                  <span>A+ ({subjects.filter(x => Math.round((x.obtained/x.max)*100) >= 90).length} Subj)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#D4AF37" }} />
                  <span>A ({subjects.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 80 && p < 90; }).length} Subj)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3B82F6" }} />
                  <span>B+ ({subjects.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 70 && p < 80; }).length} Subj)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981" }} />
                  <span>B ({subjects.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 60 && p < 70; }).length} Subj)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444" }} />
                  <span>C & Below ({subjects.filter(x => Math.round((x.obtained/x.max)*100) < 60).length} Subj)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Co-Scholastic, Remarks & Exam Details */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              CO-SCHOLASTIC PERFORMANCE
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 9.5 }}>
              {[
                { name: "Sports", stars: 5 },
                { name: "Discipline", stars: 5 },
                { name: "Participation", stars: 5 },
                { name: "Innovation", stars: 5 },
                { name: "Community Service", stars: 4 }
              ].map(item => (
                <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ color: "#D4AF37", fontSize: 10.5 }}>
                    {"★".repeat(item.stars)}{"☆".repeat(5 - item.stars)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff", display: "flex", flexDirection: "column", position: "relative" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 8px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              TEACHER REMARKS
            </p>
            <span style={{ fontSize: 32, fontWeight: 900, color: "#0B2E6D15", position: "absolute", top: 22, left: 10, lineHeight: 1 }}>“</span>
            <div style={{ flex: 1, paddingLeft: 18, fontStyle: "italic", fontSize: 10, color: dark ? "#CBD5E1" : "#475569", lineHeight: 1.4 }}>
              {remarkText}
            </div>
          </div>

          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12, padding: 12, background: dark ? "#16162A" : "#fff" }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: "#0B2E6D", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, paddingBottom: 4 }}>
              EXAM DETAILS
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 9.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Exam Type</span>
                <span style={{ fontWeight: 700 }}>Final Term</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Conducted From</span>
                <span style={{ fontWeight: 700 }}>10 Mar 2025</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Conducted To</span>
                <span style={{ fontWeight: 700 }}>20 Mar 2025</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Result Declared</span>
                <span style={{ fontWeight: 700 }}>30 May 2025</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer, Signatures & QR verify */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr 1.2fr 1.2fr", gap: 10, borderTop: `2px solid #0B2E6D`, paddingTop: 14, alignItems: "center" }}>
          <div style={{ textAlign: "center", fontSize: 9 }}>
            <p style={{ fontStyle: "italic", fontFamily: "'Brush Script MT', cursive", fontSize: 15, margin: "0 0 2px", color: "#0B2E6D" }}>{teacherSigName.replace(/Ms\.\s*|Mr\.\s*/i, "") || "Priya Nair"}</p>
            <div style={{ height: 1, background: dark ? "#2A2A45" : "#E2E8F0", margin: "2px auto", width: "80%" }} />
            <strong style={{ display: "block" }}>{teacherSigName}</strong>
            <span style={{ color: "#64748B", fontSize: 8 }}>Class Teacher</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 9 }}>
            <p style={{ fontStyle: "italic", fontFamily: "'Brush Script MT', cursive", fontSize: 15, margin: "0 0 2px", color: "#0B2E6D" }}>Anjali Verma</p>
            <div style={{ height: 1, background: dark ? "#2A2A45" : "#E2E8F0", margin: "2px auto", width: "80%" }} />
            <strong style={{ display: "block" }}>Ms. Anjali Verma</strong>
            <span style={{ color: "#64748B", fontSize: 8 }}>Academic Coordinator</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: `2px solid #0B2E6D`, padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: `1px dashed #0B2E6D`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                <span style={{ fontSize: 5, fontWeight: 900, color: "#0B2E6D", lineHeight: 1 }}>BLUEWOOD</span>
                <span style={{ fontSize: 3.5, fontWeight: 700, color: "#0B2E6D" }}>ESTD. 2005</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 9 }}>
            <p style={{ fontStyle: "italic", fontFamily: "'Brush Script MT', cursive", fontSize: 15, margin: "0 0 2px", color: "#0B2E6D" }}>{principalSigName.replace(/Ms\.\s*|Mr\.\s*/i, "") || "Rohan Mehta"}</p>
            <div style={{ height: 1, background: dark ? "#2A2A45" : "#E2E8F0", margin: "2px auto", width: "80%" }} />
            <strong style={{ display: "block" }}>{principalSigName}</strong>
            <span style={{ color: "#64748B", fontSize: 8 }}>Principal</span>
          </div>
          <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 8, padding: 6, background: dark ? "#16162A" : "#fff", display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 34, height: 34, background: "#0F172A", padding: 2, borderRadius: 4, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{ background: i % 2 === 0 ? "#fff" : "transparent" }} />
              ))}
            </div>
            <div style={{ fontSize: 6.5, flex: 1 }}>
              <strong style={{ display: "block", color: "#0B2E6D" }}>SCAN TO VERIFY</strong>
              <span style={{ color: "#64748B" }}>studentdiwan.com/verify/BW-RC-{year.replace("-","")}-{rollNo}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Header variants — each template gets a distinct masthead ──
  const grad = `linear-gradient(135deg,${th.primary},${th.accent})`;
  let header: React.ReactNode;
  if (th.header === "bar") {
    header = (
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10,
        borderBottom: `2px solid ${th.primary}`, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: grad,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>SD</div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Student Diwan Global School</p>
          <p style={{ fontSize: 9, color: dark ? "#8B8BA8" : "#64748B" }}>{year} | {term} · {th.board}</p>
        </div>
        <div style={{ background: th.primary + "15", color: th.primary, fontSize: 11, fontWeight: 800,
          borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{th.scale(pct)}</div>
      </div>
    );
  } else if (th.header === "centered") {
    header = (
      <div style={{ textAlign: "center", paddingBottom: 10, marginBottom: 10, borderBottom: `1px dashed ${th.accent}` }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: grad, margin: "0 auto 6px",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>SD</div>
        <p style={{ fontSize: 12, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Student Diwan Global School</p>
        <p style={{ fontSize: 9, color: th.primary, fontWeight: 700, letterSpacing: ".04em" }}>★ {th.board} ★</p>
        <p style={{ fontSize: 8, color: dark ? "#8B8BA8" : "#64748B", marginTop: 2 }}>{year} | {term}</p>
      </div>
    );
  } else if (th.header === "seal") {
    header = (
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, marginBottom: 10,
        background: th.soft, borderRadius: 10, padding: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", border: `2px solid ${th.primary}`, flexShrink: 0,
          background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: th.primary, fontSize: 8, fontWeight: 800, textAlign: "center", lineHeight: 1.1 }}>{th.sealText || "SD"}</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Student Diwan Global School</p>
          <p style={{ fontSize: 8.5, color: th.primary, fontWeight: 700 }}>{th.board}</p>
          <p style={{ fontSize: 8, color: "#475569" }}>{th.regLine ? `${th.regLine} · ` : ""}{year} | {term}</p>
        </div>
      </div>
    );
  } else if (th.header === "banner") {
    header = (
      <div style={{ marginBottom: 10 }}>
        <div style={{ background: grad, borderRadius: "8px 8px 0 0", padding: "8px 12px", color: "#fff" }}>
          <p style={{ fontSize: 12, fontWeight: 800 }}>Student Diwan Global School</p>
          <p style={{ fontSize: 8, opacity: .9 }}>{th.board}</p>
        </div>
        <div style={{ background: th.soft, borderRadius: "0 0 8px 8px", padding: "4px 12px",
          display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 8, color: "#92400E", fontWeight: 600 }}>{year} | {term}</span>
          <span style={{ fontSize: 8, color: "#92400E", fontWeight: 700 }}>Result: PASS</span>
        </div>
      </div>
    );
  } else if (th.header === "columns") {
    header = (
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, marginBottom: 10,
        borderBottom: `3px double ${th.primary}` }}>
        <div style={{ width: 34, height: 34, borderRadius: 4, background: grad, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 800 }}>SD</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Student Diwan Global School</p>
          <p style={{ fontSize: 8.5, color: th.primary, fontWeight: 700 }}>{th.board}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 8, color: dark ? "#8B8BA8" : "#64748B" }}>{year}</p>
          <p style={{ fontSize: 9, fontWeight: 800, color: th.primary }}>{term}</p>
        </div>
      </div>
    );
  } else if (th.header === "scale") {
    header = (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: grad, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 800 }}>IB</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Student Diwan Global School</p>
            <p style={{ fontSize: 8.5, color: th.primary, fontWeight: 700 }}>{th.board} · {year} {term}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <span style={{ fontSize: 7, color: dark ? "#8B8BA8" : "#94A3B8" }}>1</span>
          {[1,2,3,4,5,6,7].map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 1, background: th.primary, opacity: .15 + n * .12 }} />
          ))}
          <span style={{ fontSize: 7, color: dark ? "#8B8BA8" : "#94A3B8" }}>7</span>
        </div>
      </div>
    );
  } else { // minimal
    header = (
      <div style={{ paddingBottom: 8, marginBottom: 10, borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`,
        display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Student Diwan Global School</p>
        <p style={{ fontSize: 8, color: dark ? "#8B8BA8" : "#64748B" }}>{th.board} · {year} {term}</p>
      </div>
    );
  }

  return (
    <div style={{ background: dark ? "#16162A" : "#fff", border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 12,
      padding: 16, fontSize: 10, fontFamily: "inherit" }}>
      {header}
      {/* Student */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
        padding: 10, background: th.soft, borderRadius: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: grad,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{studentName}</p>
          <p style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{cls} – Section {section} | Roll No. {rollNo}</p>
          <p style={{ fontSize: 9, color: "#475569" }}>Admission No. {admNo}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: th.primary,
            background: th.primary + "15", borderRadius: 6, padding: "2px 8px" }}>{pct}%</p>
          <p style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>Attendance: {attendance}%</p>
        </div>
      </div>
      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <thead>
          <tr style={{ background: th.primary + "12" }}>
            {["Subject", "Max Marks", "Obtained", th.scaleLabel].map(h => (
              <th key={h} style={{ padding: "5px 6px", fontSize: 9, fontWeight: 800,
                color: th.primary, textTransform: "uppercase", letterSpacing: ".04em",
                borderBottom: `1px solid ${th.primary}40`, textAlign: h === "Subject" ? "left" : "center" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map(s => {
            const sp = Math.round((s.obtained / s.max) * 100);
            return (
              <tr key={s.name} style={{ borderBottom: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}` }}>
                <td style={{ padding: "5px 6px", color: dark ? "#8B8BA8" : "#64748B" }}>{s.name}</td>
                <td style={{ padding: "5px 6px", textAlign: "center", color: dark ? "#8B8BA8" : "#64748B" }}>{s.max}</td>
                <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A" }}>{s.obtained}</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: th.primary,
                    background: th.primary + "15", borderRadius: 4, padding: "1px 6px" }}>{th.scale(sp)}</span>
                </td>
              </tr>
            );
          })}
          <tr style={{ background: th.primary + "10", borderTop: `2px solid ${th.primary}` }}>
            <td style={{ padding: "6px", fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A" }}>Total</td>
            <td style={{ padding: "6px", textAlign: "center", fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A" }}>{total}</td>
            <td style={{ padding: "6px", textAlign: "center", fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A" }}>{obtained}</td>
            <td style={{ padding: "6px", textAlign: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: th.primary,
                background: th.primary + "20", borderRadius: 4, padding: "1px 6px" }}>{th.scale(pct)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      {/* Co-Scholastic */}
      <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em",
        color: th.primary, margin: "8px 0 4px" }}>Co-Scholastic Areas</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
        {th.coScholastic.map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "3px 6px", background: th.soft, borderRadius: 4 }}>
            <span style={{ fontSize: 9, color: "#475569" }}>{k}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: th.primary,
              background: th.primary + "15", borderRadius: 4, padding: "1px 5px" }}>A</span>
          </div>
        ))}
      </div>
      {/* Remarks */}
      <div style={{ padding: 8, background: th.soft, borderRadius: 8,
        border: `1px solid ${th.primary}30`, marginBottom: 10 }}>
        <p style={{ fontSize: 9, color: "#0F172A", lineHeight: 1.5 }}>
          {remarkText}
        </p>
      </div>
      {/* Signatures */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 8, borderTop: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}` }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 80, borderBottom: `1px dashed ${dark ? "#3D3D5C" : "#CBD5E1"}`, margin: "0 auto 4px" }} />
          <p style={{ fontSize: 8, color: dark ? "#8B8BA8" : "#64748B" }}>Teacher Signature</p>
          <p style={{ fontSize: 9, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A" }}>{teacherSigName}</p>
        </div>
        <div style={{ width: 40, height: 40, border: `1px dashed ${th.primary}60`, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <QrCode style={{ width: 20, height: 20, color: th.primary + "80" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 80, borderBottom: `1px dashed ${dark ? "#3D3D5C" : "#CBD5E1"}`, margin: "0 auto 4px" }} />
          <p style={{ fontSize: 8, color: dark ? "#8B8BA8" : "#64748B" }}>Principal Signature</p>
          <p style={{ fontSize: 9, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A" }}>{principalSigName}</p>
        </div>
      </div>
    </div>
  );
}


function ActionBtn({ label, icon: Icon, primary, onClick }: {
  label: string; icon: typeof Zap; primary?: boolean; onClick?: () => void;
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  const accent = dark ? "#9B59E6" : "#6C3BFF";
  const border = dark ? "#2A2A45" : "#E2E8F0";
  const surface = dark ? "#1A1A30" : "#F8FAFC";
  const text = dark ? "#F0EFFF" : "#0F172A";
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600,
        cursor: "pointer", border: primary ? "none" : `1.5px solid ${border}`,
        background: primary ? accent : surface, color: primary ? "#fff" : text,
        fontFamily: "inherit", transition: "all .15s" }}
      onMouseEnter={e => {
        if (!primary) { (e.currentTarget as HTMLButtonElement).style.borderColor = accent;
          (e.currentTarget as HTMLButtonElement).style.color = accent; }
        else (e.currentTarget as HTMLButtonElement).style.background = dark ? "#8347C9" : "#5B31D9";
      }}
      onMouseLeave={e => {
        if (!primary) { (e.currentTarget as HTMLButtonElement).style.borderColor = border;
          (e.currentTarget as HTMLButtonElement).style.color = text; }
        else (e.currentTarget as HTMLButtonElement).style.background = accent;
      }}
    >
      <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ── Generate Modal ───────────────────────────────────────────────────────────
function GenerateModal({ onClose, cls, section, term, template, year, students, assignedSubjects, marksCompleteness, onGenerated }: {
  onClose: () => void; cls: string; section: string; term: string;
  template: TemplateId; year: string; students: (RCStudent & { id: string })[];
  assignedSubjects: string[]; marksCompleteness: Map<string, string[]>;
  onGenerated?: () => number;
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);
  const [ackIncomplete, setAckIncomplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const th = TEMPLATE_THEME[template];
  const ctx: RCCtx = { template, cls, section, term, year };

  const incompleteList = students.filter(s => marksCompleteness.has(s.id));
  const completeStudents = students.filter(s => !marksCompleteness.has(s.id));
  const hasGate = assignedSubjects.length > 0;
  const canStart = !hasGate || (completeStudents.length > 0 && (incompleteList.length === 0 || ackIncomplete));

  const start = () => {
    if (!canStart) return;
    setProgress(0); setDone(false);
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(intervalRef.current!); setDone(true);
          setPublishedCount(onGenerated ? onGenerated() : students.length);
          return 100;
        }
        return p + 4;
      });
    }, 80);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: dark ? "#16162A" : "#fff", borderRadius: 20, padding: 32, width: 460,
        boxShadow: "0 24px 64px rgba(15,23,42,.2)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16,
          background: "none", border: "none", cursor: "pointer", color: dark ? "#8B8BA8" : "#64748B" }}>
          <X style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: th.primary + "15",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <Zap style={{ width: 24, height: 24, color: th.primary }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Generate Report Cards</h2>
          <p style={{ fontSize: 13, color: dark ? "#8B8BA8" : "#64748B", marginTop: 4 }}>{cls} — {section} | {term} · {th.board}</p>
        </div>
        {!progress && !done && (
          <>
            {hasGate && incompleteList.length > 0 && (
              <div style={{ background: dark ? "#3A2E0F" : "#FFFBEB", border: `1px solid ${dark ? "#5C4A1F" : "#FDE68A"}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: dark ? "#FCD34D" : "#92400E", marginBottom: 6 }}>
                  {incompleteList.length} of {students.length} student(s) have incomplete marks
                </p>
                <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 11, color: dark ? "#FCD34D" : "#92400E", lineHeight: 1.6 }}>
                  {incompleteList.slice(0, 6).map(s => (
                    <div key={s.id}>{s.name}: missing {marksCompleteness.get(s.id)?.join(", ")}</div>
                  ))}
                  {incompleteList.length > 6 && <div>...and {incompleteList.length - 6} more</div>}
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 10, fontSize: 12, color: dark ? "#FCD34D" : "#92400E", cursor: "pointer" }}>
                  <input type="checkbox" checked={ackIncomplete} onChange={e => setAckIncomplete(e.target.checked)}
                    style={{ marginTop: 2 }} />
                  <span>Generate anyway for just the {completeStudents.length} student{completeStudents.length === 1 ? "" : "s"} with complete marks; skip the rest</span>
                </label>
              </div>
            )}
            <button onClick={start} disabled={!canStart}
              style={{ width: "100%", padding: "12px", background: th.primary, color: "#fff",
                border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
                cursor: canStart ? "pointer" : "not-allowed", opacity: canStart ? 1 : 0.5,
                fontFamily: "inherit" }}>
              {hasGate && completeStudents.length === 0
                ? "No students have complete marks yet"
                : `Start Generation · ${hasGate && !ackIncomplete && incompleteList.length ? completeStudents.length : students.length} Student${(hasGate && !ackIncomplete && incompleteList.length ? completeStudents.length : students.length) === 1 ? "" : "s"}`}
            </button>
          </>
        )}
        {progress > 0 && !done && (
          <div>
            <div style={{ background: dark ? "#2A2A45" : "#F1F5F9", borderRadius: 999, height: 8, marginBottom: 8 }}>
              <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${th.primary},${th.accent})`,
                width: `${progress}%`, transition: "width .1s" }} />
            </div>
            <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", textAlign: "center" }}>
              Generating... {progress}%
            </p>
          </div>
        )}
        {done && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: publishedCount ? "#10B98120" : (dark ? "#3A1A1A" : "#FEF2F2"),
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              {publishedCount ? <Check style={{ width: 24, height: 24, color: dark ? "#4ADE80" : "#10B981" }} />
                : <X style={{ width: 24, height: 24, color: dark ? "#F87171" : "#EF4444" }} />}
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: publishedCount ? (dark ? "#4ADE80" : "#10B981") : (dark ? "#F87171" : "#EF4444") }}>
              {publishedCount ? `${publishedCount} Report Card${publishedCount === 1 ? "" : "s"} Generated!` : "No report cards generated"}
            </p>
            <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", marginTop: 4 }}>
              {publishedCount ? "Ready for download & distribution" : "Marks were incomplete for every selected student"}
            </p>
            {publishedCount > 0 && (
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => {
                    const done = completeStudents;
                    triggerDownload(buildBulkHTML(done, ctx), `report-cards-${cls.replace(/ /g,"-")}-${term.replace(/ /g,"-")}.html`, "text/html");
                    toast.success(`${done.length} report cards downloaded!`);
                    onClose();
                  }}
                  style={{ flex: 1, padding: "10px", background: th.primary, color: "#fff",
                    border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Download All
                </button>
                <button onClick={onClose}
                  style={{ flex: 1, padding: "10px", background: dark ? "#1A1A30" : "#F8FAFC", color: dark ? "#F0EFFF" : "#0F172A",
                    border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Close
                </button>
              </div>
            )}
            {publishedCount === 0 && (
              <button onClick={onClose}
                style={{ width: "100%", marginTop: 16, padding: "10px", background: dark ? "#1A1A30" : "#F8FAFC", color: dark ? "#F0EFFF" : "#0F172A",
                  border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full Preview Modal ───────────────────────────────────────────────────────
function FullPreviewModal({ onClose, cls, section, term, template, year, students }: {
  onClose: () => void; cls: string; section: string; term: string;
  template: TemplateId; year: string; students: RCStudent[];
}) {
  const { theme } = useTheme(); const dark = theme === "dark";
  const list = students.length ? students : [{ name: "Aarav Sharma", roll: 1, adm: "ADM-2026-001", attendance: 92.6 }];
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
  const student = list[currentStudentIdx] || list[0];
  const ctx: RCCtx = { template, cls, section, term, year };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: dark ? "#16162A" : "#fff", borderRadius: 20, width: "90%", maxWidth: 800, height: "90%",
        display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(15,23,42,.2)", position: "relative" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, display: "flex",
          alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A" }}>Report Card Live Preview</h2>
            <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B" }}>Previewing student report cards before final generation</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: dark ? "#1A1A30" : "#F1F5F9", borderRadius: 8, padding: "4px 8px" }}>
              <button disabled={currentStudentIdx === 0} onClick={() => setCurrentStudentIdx(i => Math.max(0, i - 1))}
                style={{ background: "none", border: "none", cursor: currentStudentIdx === 0 ? "not-allowed" : "pointer", opacity: currentStudentIdx === 0 ? 0.4 : 1 }}>
                <ChevronLeft style={{ width: 16, height: 16, color: dark ? "#F0EFFF" : "#0F172A" }} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A", minWidth: 60, textAlign: "center" }}>
                {currentStudentIdx + 1} / {list.length}
              </span>
              <button disabled={currentStudentIdx === list.length - 1} onClick={() => setCurrentStudentIdx(i => Math.min(list.length - 1, i + 1))}
                style={{ background: "none", border: "none", cursor: currentStudentIdx === list.length - 1 ? "not-allowed" : "pointer", opacity: currentStudentIdx === list.length - 1 ? 0.4 : 1 }}>
                <ChevronRight style={{ width: 16, height: 16, color: dark ? "#F0EFFF" : "#0F172A" }} />
              </button>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: dark ? "#8B8BA8" : "#64748B" }}>
              <X style={{ width: 20, height: 20 }} />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, background: dark ? "#0E0E16" : "#F8FAFC" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <ReportPreview studentName={student.name} cls={cls} section={section.replace("Section ", "")}
              template={template} term={term} year={year} rollNo={student.roll} admNo={student.adm}
              attendance={student.attendance ?? 92.6} realOnly
              remark={student.id ? getReportCard(student.id, year, term)?.classTeacherRemark : undefined}
              teacherName={student.id ? getReportCard(student.id, year, term)?.teacherName : undefined}
              principalName={student.id ? getReportCard(student.id, year, term)?.principalName : undefined} />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, display: "flex",
          justifyContent: "flex-end", gap: 10 }}>
          <button onClick={() => {
              triggerDownload(buildReportCardHTML(student, { ...ctx, section: section.replace("Section ","") }), `report-card-${student.name.replace(/ /g,"-")}.html`, "text/html");
              toast.success(`Downloaded report card for ${student.name}`);
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              background: dark ? "#1A1A30" : "#F8FAFC", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 9,
              fontSize: 13, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A", cursor: "pointer", fontFamily: "inherit" }}>
            <Download style={{ width: 14, height: 14 }} /> Download PDF
          </button>
          <button onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              background: dark ? "#1A1A30" : "#F8FAFC", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 9,
              fontSize: 13, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A", cursor: "pointer", fontFamily: "inherit" }}>
            <Printer style={{ width: 14, height: 14 }} /> Print Report Card
          </button>
          <button onClick={onClose}
            style={{ padding: "8px 20px", background: dark ? "#9B59E6" : "#6C3BFF", color: "#fff",
              border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Close Preview
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Download Helpers ─────────────────────────────────────────────────────────
function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

type RCStudent = { id?: string; name: string; roll: number | string; adm: string; attendance?: number };
type RCCtx = { template: TemplateId; cls: string; section: string; term: string; year: string };

function rcCss(th: Theme) {
  return `body{font-family:Arial,sans-serif;max-width:780px;margin:0 auto;padding:32px;color:#0F172A}
.page-break{page-break-after:always;margin-bottom:48px}
.hdr{background:linear-gradient(135deg,${th.primary},${th.accent});color:#fff;padding:18px 24px;border-radius:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
.hdr h2{margin:0;font-size:18px}.hdr p{margin:4px 0 0;opacity:.85;font-size:12px}
.badge{background:rgba(255,255,255,.22);padding:5px 12px;border-radius:6px;font-size:18px;font-weight:800}
.info{background:${th.soft};border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:${th.primary};color:#fff;padding:7px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px}
tr:nth-child(even) td{background:#FAFAFA}
.total td{font-weight:700;background:${th.primary}14;border-top:2px solid ${th.primary}}
.grade{display:inline-block;background:${th.primary}18;color:${th.primary};padding:2px 7px;border-radius:4px;font-weight:700;font-size:12px}
.remark{background:${th.soft};border:1px solid ${th.primary}30;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#0F172A}
.cos{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px}
.cos div{display:flex;justify-content:space-between;background:${th.soft};border-radius:6px;padding:6px 10px;font-size:12px}
.cos b{color:${th.primary}}
.footer-sigs{display:flex;justify-content:space-between;border-top:1px solid #E2E8F0;padding-top:16px;margin-top:8px}
.sig{text-align:center}.sig-line{border-bottom:1px dashed #CBD5E1;width:100px;margin:0 auto 6px}
.sig p{margin:2px 0;font-size:11px;color:#64748B}.sig strong{font-size:12px;color:#0F172A}`;
}

function buildCardBody(stu: RCStudent, ctx: RCCtx) {
  const th = TEMPLATE_THEME[ctx.template];
  const subs = realSubjects(stu.name);
  const rec = stu.id ? getReportCard(stu.id, ctx.year, ctx.term) : null;
  if (!subs) {
    return `<div class="page-break">
<div class="hdr"><div><h2>Student Diwan Global School</h2><p>${ctx.year} | ${ctx.term} · ${th.board}</p></div></div>
<div class="info">
  <div><strong style="font-size:16px">${stu.name}</strong><p style="margin:4px 0 0;color:#64748B;font-size:12px">${ctx.cls} – Section ${ctx.section} | Roll No. ${stu.roll} · Adm: ${stu.adm}</p></div>
</div>
<div class="remark">No marks have been entered yet for this student. A report card cannot be generated until subject teachers submit marks for ${ctx.term} · ${ctx.year}.</div>
</div>`;
  }
  const total = subs.reduce((s, x) => s + x.max, 0);
  const obtained = subs.reduce((s, x) => s + x.obtained, 0);
  const pct = Math.round((obtained / total) * 100);
  const att = stu.attendance ?? 92.6;
  const remark = rec?.classTeacherRemark?.trim() || "No remarks entered yet.";
  const teacherSigName = rec?.teacherName?.trim() || "—";
  const principalSigName = rec?.principalName?.trim() || "—";

  if (ctx.template === "bluewood") {
    const scale = th.scale;
    const initials = (stu.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2);
    const avgGp = (subs.reduce((a, x) => {
      const sp = Math.round((x.obtained / x.max) * 100);
      return a + (sp >= 90 ? 4.0 : sp >= 80 ? 3.8 : sp >= 70 ? 3.5 : sp >= 60 ? 3.0 : 2.5);
    }, 0) / (subs.length || 1)).toFixed(2);

    return `
<div class="page-break" style="width: 790px; min-height: 1080px; padding: 24px; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0F172A; background: #fff; box-sizing: border-box; margin: 0 auto;">
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .page-break { page-break-after: always; box-shadow: none !important; border: none !important; padding: 0 !important; width: 100% !important; min-height: auto !important; }
    }
  </style>
  
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0B2E6D; padding-bottom: 16px; margin-bottom: 16px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <img src="/bluewood-logo.svg" alt="B W" style="width: 56px; height: 56px; object-fit: contain;" onerror="this.src='/bluewood-school.png'" />
      <div>
        <h2 style="font-size: 20px; font-weight: 900; color: #0B2E6D; margin: 0; letter-spacing: -0.5px;">BLUEWOOD SCHOOL</h2>
        <p style="font-size: 10px; font-weight: 700; color: #D4AF37; margin: 2px 0 0; letter-spacing: 0.15em;">INSPIRE · LEARN · ACHIEVE</p>
      </div>
    </div>
    <div style="text-align: center;">
      <h1 style="font-size: 20px; font-weight: 900; color: #0B2E6D; margin: 0; letter-spacing: -0.5px;">E-REPORT CARD</h1>
      <p style="font-size: 11px; color: #64748B; margin: 2px 0 0; font-weight: 600;">Academic Year ${ctx.year}</p>
      <div style="display: flex; gap: 6px; justify-content: center; margin-top: 8px;">
        <span style="font-size: 9px; font-weight: 800; background: #0B2E6D; color: #fff; padding: 3px 10px; border-radius: 4px;">${ctx.term}</span>
        <span style="font-size: 9px; font-weight: 800; background: #10B98115; color: #10B981; border: 1px solid #10B98130; padding: 2px 10px; border-radius: 999px;">PUBLISHED ✓</span>
      </div>
    </div>
    <div style="font-size: 9.5px; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 12px; background: #F8FAFC; min-width: 160px; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #EEF2F7; padding-bottom: 4px;">
        <span style="color: #64748B; font-weight: 600;">Report Card No:</span>
        <span style="font-weight: 700;">BW/RC/${ctx.year.replace("-","")}/${String(stu.roll).padStart(4, "0")}</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #EEF2F7; padding: 4px 0;">
        <span style="color: #64748B; font-weight: 600;">Date of Issue:</span>
        <span style="font-weight: 700;">${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #EEF2F7; padding: 4px 0;">
        <span style="color: #64748B; font-weight: 600;">Grade & Section:</span>
        <span style="font-weight: 700;">${ctx.cls} - ${ctx.section}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-top: 4px;">
        <span style="color: #64748B; font-weight: 600;">Academic Year:</span>
        <span style="font-weight: 700;">${ctx.year}</span>
      </div>
    </div>
  </div>

  <!-- Student Info Card & Message -->
  <div style="display: grid; grid-template-columns: 1fr 280px; gap: 14px; margin-bottom: 14px;">
    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; display: flex; gap: 14px; background: #F8FAFC;">
      <div style="width: 80px; height: 96px; border-radius: 8px; background: #E2E8F0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid #CBD5E1;">
        <div style="text-align: center;">
          <span style="font-size: 24px; font-weight: 900; color: #0B2E6D;">${initials}</span>
          <p style="font-size: 9px; color: #64748B; margin: 2px 0 0; font-weight: 700;">STUDENT</p>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; flex: 1; font-size: 10px;">
        <div style="grid-column: span 2; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
          <h3 style="font-size: 14px; font-weight: 800; color: #0B2E6D; margin: 0;">${stu.name}</h3>
        </div>
        <div>
          <span style="color: #64748B; display: block; font-size: 8px; font-weight: 700;">ADMISSION NO</span>
          <p style="font-weight: 700; margin: 0;">${stu.adm}</p>
        </div>
        <div>
          <span style="color: #64748B; display: block; font-size: 8px; font-weight: 700;">ROLL NUMBER</span>
          <p style="font-weight: 700; margin: 0;">${stu.roll}</p>
        </div>
        <div>
          <span style="color: #64748B; display: block; font-size: 8px; font-weight: 700;">HOUSE</span>
          <p style="font-weight: 700; margin: 0; color: #0B2E6D;">Blue House</p>
        </div>
        <div>
          <span style="color: #64748B; display: block; font-size: 8px; font-weight: 700;">NATIONALITY</span>
          <p style="font-weight: 700; margin: 0;">Indian</p>
        </div>
        <div style="grid-column: span 2;">
          <span style="color: #64748B; display: block; font-size: 8px; font-weight: 700;">CLASS TEACHER</span>
          <p style="font-weight: 700; margin: 0;">${teacherSigName}</p>
        </div>
      </div>
    </div>
    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; background: #F8FAFC;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 6px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        MESSAGE FROM SCHOOL
      </p>
      <p style="font-size: 10px; color: #475569; margin: 0; flex: 1; font-style: italic; line-height: 1.4;">
        "${stu.name} has shown consistent academic performance and a positive attitude towards learning. He is an active participant in class activities."
      </p>
      <p style="font-size: 9px; font-weight: 700; color: #D4AF37; text-align: right; margin: 4px 0 0;">— The School Administration</p>
    </div>
  </div>

  <!-- Academic Performance & Performance Summary -->
  <div style="display: grid; grid-template-columns: 1fr 240px; gap: 14px; margin-bottom: 14px;">
    <div style="border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
      <div style="background: #0B2E6D; padding: 8px 12px; color: #fff;">
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;">ACADEMIC PERFORMANCE</span>
      </div>
      <div style="flex: 1; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
          <thead>
            <tr style="background: #F4F7FC; border-bottom: 1.5px solid #E2E8F0;">
              <th style="padding: 6px 8px; text-align: left; font-weight: 700; color: #0B2E6D;">SUBJECT CODE</th>
              <th style="padding: 6px 8px; text-align: left; font-weight: 700; color: #0B2E6D;">SUBJECT</th>
              <th style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0B2E6D;">MAX</th>
              <th style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0B2E6D;">OBTAINED</th>
              <th style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0B2E6D;">PCT (%)</th>
              <th style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0B2E6D;">GRADE</th>
              <th style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0B2E6D;">GP</th>
            </tr>
          </thead>
          <tbody>
            ${subs.map((s, idx) => {
              const sp = Math.round((s.obtained / s.max) * 100);
              const gradeVal = scale(sp);
              const gp = (sp >= 90 ? 4.0 : sp >= 80 ? 3.8 : sp >= 70 ? 3.5 : sp >= 60 ? 3.0 : 2.5).toFixed(1);
              return `
                <tr style="border-bottom: 1px solid #F1F5F9; background: ${idx % 2 === 0 ? "transparent" : "#FAFBFE"};">
                  <td style="padding: 8px 8px; font-weight: 700;">${s.name.slice(0, 3).toUpperCase()}${100 + idx}</td>
                  <td style="padding: 8px 8px; font-weight: 600;">${s.name}</td>
                  <td style="padding: 8px 8px; text-align: center;">${s.max}</td>
                  <td style="padding: 8px 8px; text-align: center; font-weight: 700;">${s.obtained}</td>
                  <td style="padding: 8px 8px; text-align: center;">${sp}.0%</td>
                  <td style="padding: 8px 8px; text-align: center;">
                    <span style="background: #0B2E6D10; color: #0B2E6D; font-weight: 800; padding: 2px 6px; border-radius: 4px;">${gradeVal}</span>
                  </td>
                  <td style="padding: 8px 8px; text-align: center; font-weight: 700;">${gp}</td>
                </tr>
              `;
            }).join("")}
            <tr style="background: #0B2E6D; color: #fff; font-weight: 700;">
              <td colspan="2" style="padding: 8px 8px; text-transform: uppercase;">TOTAL</td>
              <td style="padding: 8px 8px; text-align: center;">${total}</td>
              <td style="padding: 8px 8px; text-align: center;">${obtained}</td>
              <td style="padding: 8px 8px; text-align: center;">${pct}.0%</td>
              <td style="padding: 8px 8px; text-align: center;">${scale(pct)}</td>
              <td style="padding: 8px 8px; text-align: center; color: #D4AF37;">${avgGp}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Performance Summary Cards -->
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="background: #0B2E6D; padding: 8px 12px; color: #fff; border-radius: 8px;">
        <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;">PERFORMANCE SUMMARY</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1;">
        <div style="border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; text-align: center;">
          <span style="font-size: 18px;">🏆</span>
          <span style="font-size: 7px; color: #64748B; font-weight: 700; margin-top: 4px;">TOTAL MARKS</span>
          <p style="font-size: 11px; font-weight: 800; margin: 2px 0 0;">${obtained} / ${total}</p>
        </div>
        <div style="border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; text-align: center;">
          <span style="font-size: 18px;">📊</span>
          <span style="font-size: 7px; color: #64748B; font-weight: 700; margin-top: 4px;">PERCENTAGE</span>
          <p style="font-size: 11px; font-weight: 800; margin: 2px 0 0;">${pct}%</p>
        </div>
        <div style="border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; text-align: center;">
          <span style="font-size: 18px;">⭐</span>
          <span style="font-size: 7px; color: #64748B; font-weight: 700; margin-top: 4px;">OVERALL GRADE</span>
          <p style="font-size: 12px; font-weight: 800; margin: 2px 0 0; color: #0B2E6D;">${scale(pct)}</p>
        </div>
        <div style="border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; text-align: center;">
          <span style="font-size: 18px;">🏅</span>
          <span style="font-size: 7px; color: #64748B; font-weight: 700; margin-top: 4px;">CLASS RANK</span>
          <p style="font-size: 11px; font-weight: 800; margin: 2px 0 0;">3 / 32</p>
        </div>
        <div style="grid-column: span 2; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; gap: 10px; background: #fff;">
          <span style="font-size: 20px;">📅</span>
          <div style="flex: 1;">
            <span style="font-size: 7px; color: #64748B; font-weight: 700;">ATTENDANCE</span>
            <div style="display: flex; align-items: baseline; gap: 4px;">
              <span style="font-size: 12px; font-weight: 800;">${att}%</span>
              <span style="font-size: 8px; color: #64748B;">(Working Days: 200)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Learning Outcomes, Attendance & Grade Distribution -->
  <div style="display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 14px; margin-bottom: 14px;">
    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        LEARNING OUTCOMES
      </p>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 9.5px;">
        ${[
          { name: "Communication", stars: 5 },
          { name: "Critical Thinking", stars: 5 },
          { name: "Creativity", stars: 4 },
          { name: "Leadership", stars: 5 },
          { name: "Teamwork", stars: 5 },
          { name: "Responsibility", stars: 5 }
        ].map(item => `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600;">${item.name}</span>
            <span style="color: #D4AF37; font-size: 10.5px;">
              ${"★".repeat(item.stars)}${"☆".repeat(5 - item.stars)}
            </span>
          </div>
        `).join("")}
      </div>
    </div>

    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        ATTENDANCE SUMMARY
      </p>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 9.5px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Working Days</span>
          <span style="font-weight: 700;">200 Days</span>
        </div>
        <div style="display: flex; justify-content: space-between; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Present Days</span>
            <span style="font-weight: 700;">188 Days</span>
          </div>
          <div style="height: 4px; background: #E2E8F0; border-radius: 2px;">
            <div style="width: 94%; height: 100%; background: #10B981; border-radius: 2px;"></div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Absent Days</span>
            <span style="font-weight: 700;">12 Days</span>
          </div>
          <div style="height: 4px; background: #E2E8F0; border-radius: 2px;">
            <div style="width: 6%; height: 100%; background: #EF4444; border-radius: 2px;"></div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Late Arrivals</span>
            <span style="font-weight: 700;">5 Days</span>
          </div>
          <div style="height: 4px; background: #E2E8F0; border-radius: 2px;">
            <div style="width: 2.5%; height: 100%; background: #F59E0B; border-radius: 2px;"></div>
          </div>
        </div>
      </div>
    </div>

    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        GRADE DISTRIBUTION
      </p>
      <div style="display: flex; gap: 10px; align-items: center; height: 100%; max-height: 90px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; border: 10px solid #0B2E6D; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <div style="text-align: center;">
            <span style="font-size: 10px; font-weight: 800; color: #0B2E6D; line-height: 1;">${subs.length}</span>
            <p style="font-size: 5.5px; color: #64748B; margin: 0; font-weight: 700;">Subj</p>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; font-size: 8px; flex: 1;">
          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #0B2E6D;"></span>
            <span>A+ (${subs.filter(x => Math.round((x.obtained/x.max)*100) >= 90).length} Subj)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #D4AF37;"></span>
            <span>A (${subs.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 80 && p < 90; }).length} Subj)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #3B82F6;"></span>
            <span>B+ (${subs.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 70 && p < 80; }).length} Subj)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #10B981;"></span>
            <span>B (${subs.filter(x => { const p = Math.round((x.obtained/x.max)*100); return p >= 60 && p < 70; }).length} Subj)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #EF4444;"></span>
            <span>C & Below (${subs.filter(x => Math.round((x.obtained/x.max)*100) < 60).length} Subj)</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Co-Scholastic, Remarks & Exam Details -->
  <div style="display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 14px; margin-bottom: 14px;">
    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        CO-SCHOLASTIC PERFORMANCE
      </p>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 9.5px;">
        ${[
          { name: "Sports", stars: 5 },
          { name: "Discipline", stars: 5 },
          { name: "Participation", stars: 5 },
          { name: "Innovation", stars: 5 },
          { name: "Community Service", stars: 4 }
        ].map(item => `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600;">${item.name}</span>
            <span style="color: #D4AF37; font-size: 10.5px;">
              ${"★".repeat(item.stars)}${"☆".repeat(5 - item.stars)}
            </span>
          </div>
        `).join("")}
      </div>
    </div>

    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff; display: flex; flex-direction: column; position: relative;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        TEACHER REMARKS
      </p>
      <span style="font-size: 32px; font-weight: 900; color: rgba(11,46,109,0.08); position: absolute; top: 22px; left: 10px; line-height: 1;">“</span>
      <div style="flex: 1; padding-left: 18px; font-style: italic; font-size: 10px; color: #475569; line-height: 1.4;">
        ${remark}
      </div>
    </div>

    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; background: #fff;">
      <p style="font-size: 9px; font-weight: 800; color: #0B2E6D; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px;">
        EXAM DETAILS
      </p>
      <div style="display: flex; flex-direction: column; gap: 7px; font-size: 9.5px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748B;">Exam Type</span>
          <span style="font-weight: 700;">Final Term</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748B;">Conducted From</span>
          <span style="font-weight: 700;">10 Mar 2025</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748B;">Conducted To</span>
          <span style="font-weight: 700;">20 Mar 2025</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748B;">Result Declared</span>
          <span style="font-weight: 700;">30 May 2025</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer, Signatures & QR verify -->
  <div style="display: grid; grid-template-columns: 1.2fr 1.2fr 1fr 1.2fr 1.2fr; gap: 10px; border-top: 2px solid #0B2E6D; padding-top: 14px; align-items: center;">
    <div style="text-align: center; font-size: 9px;">
      <p style="font-style: italic; font-family: 'Brush Script MT', cursive; font-size: 15px; margin: 0 0 2px; color: #0B2E6D;">${teacherSigName.replace(/Ms\.\s*|Mr\.\s*/i, "") || "Priya Nair"}</p>
      <div style="height: 1px; background: #E2E8F0; margin: 2px auto; width: 80%;"></div>
      <strong style="display: block;">${teacherSigName}</strong>
      <span style="color: #64748B; font-size: 8px;">Class Teacher</span>
    </div>
    <div style="text-align: center; font-size: 9px;">
      <p style="font-style: italic; font-family: 'Brush Script MT', cursive; font-size: 15px; margin: 0 0 2px; color: #0B2E6D;">Anjali Verma</p>
      <div style="height: 1px; background: #E2E8F0; margin: 2px auto; width: 80%;"></div>
      <strong style="display: block;">Ms. Anjali Verma</strong>
      <span style="color: #64748B; font-size: 8px;">Academic Coordinator</span>
    </div>
    <div style="display: flex; justify-content: center;">
      <div style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid #0B2E6D; padding: 2px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
        <div style="width: 100%; height: 100%; border-radius: 50%; border: 1px dashed #0B2E6D; display: flex; align-items: center; justify-content: center; flex-direction: column;">
          <span style="font-size: 5px; font-weight: 900; color: #0B2E6D; line-height: 1;">BLUEWOOD</span>
          <span style="font-size: 3.5px; font-weight: 700; color: #0B2E6D;">ESTD. 2005</span>
        </div>
      </div>
    </div>
    <div style="text-align: center; font-size: 9px;">
      <p style="font-style: italic; font-family: 'Brush Script MT', cursive; font-size: 15px; margin: 0 0 2px; color: #0B2E6D;">${principalSigName.replace(/Ms\.\s*|Mr\.\s*/i, "") || "Rohan Mehta"}</p>
      <div style="height: 1px; background: #E2E8F0; margin: 2px auto; width: 80%;"></div>
      <strong style="display: block;">${principalSigName}</strong>
      <span style="color: #64748B; font-size: 8px;">Principal</span>
    </div>
    <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px; background: #fff; display: flex; gap: 6px; align-items: center; box-sizing: border-box;">
      <div style="width: 34px; height: 34px; background: #0F172A; padding: 2px; border-radius: 4px; flex-shrink: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; box-sizing: border-box;">
        <div style="background: #fff;"></div><div style="background: transparent;"></div><div style="background: #fff;"></div>
        <div style="background: transparent;"></div><div style="background: #fff;"></div><div style="background: transparent;"></div>
        <div style="background: #fff;"></div><div style="background: transparent;"></div><div style="background: #fff;"></div>
      </div>
      <div style="font-size: 6.5px; flex: 1;">
        <strong style="display: block; color: #0B2E6D;">SCAN TO VERIFY</strong>
        <span style="color: #64748B;">studentdiwan.com/verify/BW-RC-${ctx.year.replace("-","")}-${stu.roll}</span>
      </div>
    </div>
  </div>
</div>
    `;
  }
  return `<div class="page-break">
<div class="hdr"><div><h2>Student Diwan Global School</h2><p>${ctx.year} | ${ctx.term} · ${th.board}</p></div><div class="badge">${th.scale(pct)}</div></div>
<div class="info">
  <div><strong style="font-size:16px">${stu.name}</strong><p style="margin:4px 0 0;color:#64748B;font-size:12px">${ctx.cls} – Section ${ctx.section} | Roll No. ${stu.roll} · Adm: ${stu.adm}</p></div>
  <div style="text-align:right"><div style="font-size:22px;font-weight:800;color:${th.primary}">${pct}%</div><div style="font-size:11px;color:#64748B;margin-top:4px">Attendance: ${att}%</div></div>
</div>
<table><thead><tr><th>Subject</th><th>Max Marks</th><th>Obtained</th><th>${th.scaleLabel}</th></tr></thead>
<tbody>${subs.map(s => { const sp = Math.round((s.obtained / s.max) * 100); return `<tr><td>${s.name}</td><td>${s.max}</td><td>${s.obtained}</td><td><span class="grade">${th.scale(sp)}</span></td></tr>`; }).join("")}
<tr class="total"><td>Total</td><td>${total}</td><td>${obtained}</td><td><span class="grade">${th.scale(pct)}</span></td></tr></tbody></table>
<div class="cos">${th.coScholastic.map(c => `<div><span>${c}</span><b>A</b></div>`).join("")}</div>
<div class="remark"><strong>Teacher Remarks:</strong> ${remark}</div>
<div class="footer-sigs"><div class="sig"><div class="sig-line"></div><p>Teacher Signature</p><strong>${teacherSigName}</strong></div>
<div class="sig"><div class="sig-line"></div><p>Principal Signature</p><strong>${principalSigName}</strong></div></div></div>`;
}

function buildReportCardHTML(stu: RCStudent, ctx: RCCtx) {
  const th = TEMPLATE_THEME[ctx.template];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report Card – ${stu.name}</title><style>${rcCss(th)}</style></head><body>${buildCardBody(stu, ctx)}</body></html>`;
}

function buildBulkHTML(students: RCStudent[], ctx: RCCtx) {
  const th = TEMPLATE_THEME[ctx.template];
  const bodies = students.map(s => buildCardBody(s, ctx)).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report Cards – ${ctx.cls} ${ctx.term}</title><style>${rcCss(th)}</style></head><body>${bodies}</body></html>`;
}

function buildCSV(students: RCStudent[], ctx: RCCtx) {
  const th = TEMPLATE_THEME[ctx.template];
  const hdr = ["Student Name", "Roll No", "Admission No", ...SUBJECT_NAMES, "Total Max", "Total Obtained", "Percentage", "Overall Grade", "Class", "Section", "Term"];
  const rows = students.map(s => {
    const subs = realSubjects(s.name);
    if (!subs) {
      return [s.name, s.roll, s.adm, ...SUBJECT_NAMES.map(() => "—"), "—", "—", "No marks entered", "—", ctx.cls, ctx.section, ctx.term];
    }
    const total = subs.reduce((a, x) => a + x.max, 0);
    const obtained = subs.reduce((a, x) => a + x.obtained, 0);
    const pct = Math.round((obtained / total) * 100);
    // subs is engine data keyed by subject name — align to SUBJECT_NAMES order, "—" for any subject the student has no mark in.
    const bySubject = new Map(subs.map(x => [x.name, x.obtained]));
    const marksInOrder = SUBJECT_NAMES.map(name => bySubject.has(name) ? String(bySubject.get(name)) : "—");
    return [s.name, s.roll, s.adm, ...marksInOrder, total, obtained, `${pct}%`, th.scale(pct), ctx.cls, ctx.section, ctx.term];
  });
  return [hdr, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
}

// ── Mini Template Previews ───────────────────────────────────────────────────
function renderMiniTemplate(id: TemplateId, color: string) {
  const L = (w: string, h = 2.5, bg = "#E2E8F0") => (
    <div style={{ height: h, borderRadius: 2, background: bg, width: w, marginBottom: 3, flexShrink: 0 }} />
  );
  switch (id) {
    case "primary": return (
      <div style={{ padding: "6px 6px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          {L("calc(100% - 13px)", 3, "#D1D5DB")}
        </div>
        <div style={{ background: "#F5F3FF", borderRadius: 3, padding: "3px 4px", marginBottom: 4,
          display: "flex", gap: 3, alignItems: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>{L("80%", 2, "#C4B5FD")}{L("55%", 1.5, "#DDD6FE")}</div>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: "#10B981", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 5, fontWeight: 800, color: "#fff" }}>A+</span>
          </div>
        </div>
        {[0,1,2].map(i => (
          <div key={i} style={{ display: "flex", gap: 2, marginBottom: 2, padding: "1.5px 0", borderBottom: "1px solid #F1F5F9" }}>
            {L("42%", 2, "#E2E8F0")}{L("15%", 2, "#CBD5E1")}{L("18%", 2, "#CBD5E1")}
            <div style={{ width: 12, height: 6, borderRadius: 2, background: color + "30", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 4.5, fontWeight: 800, color }}>A+</span>
            </div>
          </div>
        ))}
      </div>
    );
    case "elementary": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          {L("58%", 3, "#DDD6FE")}
          <span style={{ fontSize: 9, color: color, lineHeight: 1 }}>★</span>
          <span style={{ fontSize: 6, color: color, opacity: 0.6, lineHeight: 1 }}>★</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 5 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${color}`,
            background: color + "12", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 6, fontWeight: 800, color }}>A+</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 5 }}>
          {["Eng","Math","Sci","SS"].map(s => (
            <div key={s} style={{ background: color + "22", borderRadius: 20, padding: "1px 4px",
              fontSize: 4.5, fontWeight: 700, color }}>{s}</div>
          ))}
        </div>
        {[80, 92, 68].map((v, i) => (
          <div key={i} style={{ background: "#E2E8F0", borderRadius: 2, height: 3, marginBottom: 3, overflow: "hidden" }}>
            <div style={{ width: `${v}%`, height: "100%", background: color, opacity: 0.65, borderRadius: 2 }} />
          </div>
        ))}
      </div>
    );
    case "cbse": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ display: "flex", gap: 3, alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${color}`, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 4, fontWeight: 800, color }}>CB</span>
          </div>
          <div style={{ flex: 1 }}>{L("100%", 2.5, "#A7F3D0")}{L("65%", 1.5, "#D1FAE5")}</div>
        </div>
        <div style={{ background: "#ECFDF5", borderRadius: 3, padding: "2px 4px", marginBottom: 4 }}>
          <span style={{ fontSize: 4, fontWeight: 700, color: "#065F46" }}>CENTRAL BOARD OF SECONDARY EDUCATION</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5, marginBottom: 4 }}>
          {["A1","A1","B1","B2","A2","C1"].map((g, i) => (
            <div key={i} style={{ background: i < 3 ? color + "22" : "#F1F5F9", borderRadius: 2,
              textAlign: "center", fontSize: 5, fontWeight: 700, color: i < 3 ? color : "#94A3B8", padding: "1px 0" }}>{g}</div>
          ))}
        </div>
        {[0,1,2].map(i => (
          <div key={i} style={{ display: "flex", gap: 2, padding: "1.5px 0", borderBottom: "1px solid #D1FAE5" }}>
            {L("52%", 2, "#E2E8F0")}{L("15%", 2, "#A7F3D0")}{L("12%", 2, color + "50")}
          </div>
        ))}
      </div>
    );
    case "icse": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ background: "#FFFBEB", borderRadius: 3, padding: "2px 4px", marginBottom: 3 }}>
          <span style={{ fontSize: 3.8, fontWeight: 700, color: "#92400E" }}>COUNCIL FOR INDIAN SCHOOL CERTIFICATE EXAMS</span>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          <div style={{ flex: 1, background: "#F8FAFC", borderRadius: 3, padding: "3px 4px" }}>
            {L("100%", 2, "#E2E8F0")}{L("75%", 2, "#E2E8F0")}{L("55%", 2, "#E2E8F0")}{L("80%", 2, "#E2E8F0")}
          </div>
          <div style={{ flex: 1, background: "#F8FAFC", borderRadius: 3, padding: "3px 4px" }}>
            {[85, 92, 78, 88].map((v, i) => (
              <div key={i} style={{ background: "#E2E8F0", borderRadius: 2, height: 2.5, marginBottom: 3, overflow: "hidden" }}>
                <div style={{ width: `${v}%`, height: "100%", background: color, opacity: 0.75, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[["85.6%", color], ["Rank 3", "#EF4444"], ["PASS", "#10B981"]].map(([v, c]) => (
            <div key={v} style={{ flex: 1, background: (c as string) + "15", borderRadius: 3, padding: "2px 0",
              textAlign: "center", fontSize: 5.5, fontWeight: 700, color: c as string }}>{v}</div>
          ))}
        </div>
      </div>
    );
    case "british": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 3 }}>
          {L("28%", 2, "#E2E8F0")}
          {["Aut","Spr","Sum"].map(t => (
            <div key={t} style={{ background: color + "20", borderRadius: 2, padding: "1px 3px",
              fontSize: 4.5, fontWeight: 700, color }}>{t}</div>
          ))}
        </div>
        {["English","Maths","Science","History","Art"].map((sub, i) => (
          <div key={sub} style={{ display: "flex", gap: 2, padding: "2px 0", borderBottom: "1px solid #DBEAFE", alignItems: "center" }}>
            {L("28%", 2, "#DBEAFE")}
            {(["A","B+","A","A-","B","A","B+","A","A","A+"].slice(i, i+3) as string[]).map((g, gi) => (
              <div key={gi} style={{ width: "14%", textAlign: "center", fontSize: 5,
                fontWeight: 700, color: gi === 2 ? color : "#64748B" }}>{g}</div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
          <div style={{ flex: 1, background: color + "15", borderRadius: 3, padding: "2px",
            textAlign: "center", fontSize: 6.5, fontWeight: 800, color }}>A</div>
          <div style={{ flex: 2, background: "#F0FDF4", borderRadius: 3, padding: "2px",
            textAlign: "center", fontSize: 4.5, fontWeight: 700, color: "#10B981" }}>Distinction</div>
        </div>
      </div>
    );
    case "ib": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ display: "flex", gap: 1, alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 4.5, color: "#94A3B8", flexShrink: 0 }}>1</span>
          {[1,2,3,4,5,6,7].map(n => (
            <div key={n} style={{ flex: 1, height: 6, borderRadius: 1.5,
              background: n <= 6 ? color : "#E2E8F0", opacity: 0.18 + n * 0.12 }} />
          ))}
          <span style={{ fontSize: 4.5, color: "#94A3B8", flexShrink: 0 }}>7</span>
        </div>
        {[["Lang A","6"],["Lang B","5"],["Science","7"],["Math","6"],["History","6"],["Arts","7"]].map(([s, score], i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 3, padding: "1.5px 0",
            borderBottom: `1px solid ${color}22` }}>
            {L("55%", 2, i % 2 === 0 ? color + "18" : "#F9FAFB")}
            <div style={{ width: 14, height: 8, background: color + "22", borderRadius: 2, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 5.5, fontWeight: 800, color }}>{score}</div>
          </div>
        ))}
        <div style={{ marginTop: 3, background: color + "12", borderRadius: 3, padding: "2px 4px",
          display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 4.5, color: "#64748B" }}>Total Points</span>
          <span style={{ fontSize: 6, fontWeight: 800, color }}>37/45</span>
        </div>
      </div>
    );
    case "custom": return (
      <div style={{ padding: "4px 6px 2px" }}>
        <div style={{ border: "1.5px dashed #CBD5E1", borderRadius: 4, height: 14, marginBottom: 3,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 5, color: "#94A3B8", fontWeight: 600 }}>✎ Header</span>
        </div>
        <div style={{ display: "flex", gap: 2.5, marginBottom: 3 }}>
          {["Subject Block","Stats Block"].map(t => (
            <div key={t} style={{ flex: 1, border: "1.5px dashed #CBD5E1", borderRadius: 3,
              height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 4, color: "#94A3B8" }}>+ {t}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, marginBottom: 3, alignItems: "center" }}>
          <span style={{ fontSize: 4, color: "#94A3B8", flexShrink: 0 }}>Colors</span>
          {["#6C3BFF","#10B981","#F59E0B","#EF4444","#64748B"].map(c => (
            <div key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c,
              boxShadow: c === "#64748B" ? "0 0 0 1.5px #0F172A" : "none" }} />
          ))}
        </div>
        <div style={{ border: "1.5px dashed #CBD5E1", borderRadius: 3, height: 10,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 4, color: "#94A3B8" }}>+ Footer</span>
        </div>
      </div>
    );
    case "bluewood": return (
      <div style={{ padding: "4px 6px 2px", background: "#F4F7FC" }}>
        <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, background: "#0B2E6D", borderRadius: 2 }} />
          <div style={{ flex: 1 }}>{L("80%", 2, "#0B2E6D")}{L("40%", 1.5, "#D4AF37")}</div>
        </div>
        <div style={{ height: 1.5, background: "#0B2E6D", marginBottom: 4 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <div style={{ background: "#fff", borderRadius: 2, padding: 2 }}>
            {L("60%", 1.5, "#CBD5E1")}{L("40%", 1, "#CBD5E1")}
          </div>
          <div style={{ background: "#fff", borderRadius: 2, padding: 2 }}>
            {L("80%", 1.5, "#CBD5E1")}{L("30%", 1, "#CBD5E1")}
          </div>
        </div>
      </div>
    );
    default: return null;
  }
}

// Lightweight staleness check: recompute the student's gradebook right now and
// compare against the numbers baked into the saved report card. If they differ,
// marks were entered/corrected after the card was generated. This is cheap
// (reuses gbSources already loaded for the page) and avoids needing a separate
// updatedAt-tracking pass over exam_marks.
function isCardStale(
  card: ReportCardRecord, roster: (RCStudent & { id: string })[], cls: string, section: string,
  curriculum: Parameters<typeof getBandForGrade>[0], src: GradebookSources
): boolean {
  const r = roster.find(x => String(x.id) === String(card.studentId));
  if (!r) return false;
  const band = getBandForGrade(curriculum, cls);
  const gb = computeStudentGradebook(
    { id: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim() }, band, src
  );
  const freshPct = Math.round(gb.overallPercentage);
  return gb.subjects.some(s => s.hasData) && freshPct !== card.overallPct;
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ReportCard() {
  const { theme } = useTheme(); const dark = theme === "dark";
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, role } = useAuth();
  const actor = { uid: user?.uid || "unknown", name: user?.displayName || user?.email || "Unknown", role: role || "admin" };

  // The school's real Principal — used for the report card's principal
  // signature line instead of the fabricated placeholder names it used to
  // fall back to.
  const [principalName, setPrincipalName] = useState("");
  useEffect(() => { getPrincipalName().then(setPrincipalName); }, []);

  // Config state
  const [step, setStep]               = useState(1);
  const [academicYear, setAcademicYear] = useState("2026-27");
  const [term, setTerm]               = useState("Term 1");
  const [exam, setExam]               = useState("Final Exam");
  const [cls, setCls]                 = useState("Grade 1");
  const [section, setSection]         = useState("Section A");
  const [studentSearch, setStudentSearch] = useState("");
  const [template, setTemplate]       = useState<TemplateId>("primary");
  const [grading, setGrading]         = useState<GradingSystem>("CBSE 10 Point Scale");
  const [lang, setLang]               = useState<Language>("English");
  const [components, setComponents]   = useState(INITIAL_COMPONENTS);
  const [showGenerate, setShowGenerate] = useState(false);
  const [deliveryPeriod, setDeliveryPeriod] = useState("This Term");
  const [showFullPreview, setShowFullPreview] = useState(false);

  // Live KPI metrics derived from the actual roster.
  const [generatedCount, setGeneratedCount] = useState(0);
  // Bumped after any regenerate so `existingCards` below re-reads the store.
  const [generatedCountTick, setGeneratedCountTick] = useState(0);

  // ── Real-time data from the live app (students + classes) ──
  const { students: allStudents } = useStudents();
  const { classes } = useClasses();
  const { curriculum } = useCurriculum();
  const [gbSources, setGbSources] = useState<GradebookSources | null>(null);
  useEffect(() => { loadGradebookSources().then(setGbSources).catch(() => setGbSources(null)); }, []);

  const { assignment: teacherClass } = useTeacherClass();
  const [submissions, setSubmissions] = useState<GradebookSubmission[]>([]);
  useEffect(() => {
    getAllSubmissions().then(setSubmissions).catch(() => {});
  }, [generatedCountTick]);

  // Real subject allocations — used to know which subjects a class/section
  // actually has assigned teachers for, so we can tell a genuinely completed
  // set of marks apart from one that's still missing a subject's marks.
  const [allSubjectAssignments, setAllSubjectAssignments] = useState<SubjectAssignment[]>([]);
  useEffect(() => {
    smartDb.getAll("subject_assignments", "")
      .then((rows: any[]) => setAllSubjectAssignments((rows || []) as SubjectAssignment[]))
      .catch(() => {});
  }, []);

  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();

  const classOptions = useMemo(() => {
    if (isGradeCoordinator) return coordAssignedGrade ? [coordAssignedGrade] : [];
    const fromClasses = classes.map(c => c.grade || c.name).filter(Boolean) as string[];
    const fromStudents = allStudents.map(s => s.grade).filter(Boolean) as string[];
    const uniq = Array.from(new Set([...fromClasses, ...fromStudents]));
    return uniq.length ? uniq.sort() : CLASSES;
  }, [classes, allStudents, isGradeCoordinator, coordAssignedGrade]);

  // Keep the selected grade locked to the coordinator's own assignment even
  // if `cls` was initialized before the assignment loaded.
  useEffect(() => {
    if (isGradeCoordinator && coordAssignedGrade && cls !== coordAssignedGrade) {
      setCls(coordAssignedGrade);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGradeCoordinator, coordAssignedGrade]);

  const sectionOptions = useMemo(() => {
    const secs = Array.from(new Set(
      allStudents.filter(s => !cls || canonGrade(s.grade) === canonGrade(cls))
        .map(s => s.section).filter(Boolean) as string[]
    ));
    const labelled = secs.map(s => s.startsWith("Section") ? s : `Section ${s}`);
    return labelled.length ? labelled.sort() : SECTIONS;
  }, [allStudents, cls]);

  // Roster: real students enrolled in the selected class + section, mapped to report-card rows.
  const roster = useMemo<(RCStudent & { id: string })[]>(() => {
    const wantSec = section.replace("Section ", "").trim();
    const filtered = allStudents.filter(s => {
      const g = s.grade || "";
      const gradeMatch = !cls || g === cls || g === cls.replace("Grade ", "");
      const secMatch = !wantSec || (s.section || "").replace("Section ", "") === wantSec;
      return gradeMatch && secMatch;
    });
    return filtered.map((s, i) => ({
      id: s.id,
      name: s.name || `Student ${i + 1}`,
      roll: s.rollNumber || String(i + 1),
      adm: s.admissionNumber || `ADM-${academicYear.split("-")[0]}-${String(i + 1).padStart(3, "0")}`,
      attendance: typeof s.attendance === "number" ? Math.round(s.attendance * 10) / 10 : 92.6,
    }));
  }, [allStudents, cls, section, academicYear]);

  // Feed real engine marks (assignments + assessments + exams) into genSubjects,
  // keyed by student name, so the whole generator renders real data — no fabrication.
  useEffect(() => {
    if (!gbSources) return;
    const band = getBandForGrade(curriculum, cls);
    const map = new Map<string, { name: string; max: number; obtained: number }[]>();
    roster.forEach(r => {
      const gb = computeStudentGradebook(
        { id: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim() }, band, gbSources
      );
      const subs = gb.subjects.filter(s => s.hasData).map(s => ({ name: s.subject, max: 100, obtained: Math.round(s.percentage) }));
      if (subs.length) map.set(r.name, subs);
    });
    setEngineSubjects(map);
    return () => setEngineSubjects(null);
  }, [gbSources, roster, cls, section, curriculum]);

  // Default selection = everyone in the current roster (until the user manually edits it).
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [touchedSelection, setTouchedSelection] = useState(false);
  useEffect(() => {
    if (!touchedSelection) setSelectedStudents(roster.map(r => r.id));
  }, [roster, touchedSelection]);

  const selectedRoster = useMemo(
    () => roster.filter(r => selectedStudents.includes(r.id)),
    [roster, selectedStudents]
  );
  const rcCtx: RCCtx = { template, cls, section, term, year: academicYear };
  const firstStudent = roster[0] || { name: "Aarav Sharma", roll: 1, adm: "ADM-2026-001", attendance: 92.6 };

  // Which subjects actually have a teacher assigned for this class/section —
  // the real completeness bar. "Every assigned subject teacher has entered
  // marks" is the whole precondition the school wants before a report card
  // is allowed to print, not just "at least one subject has data."
  const assignedSubjects = useMemo(
    () => subjectsAssignedFor(allSubjectAssignments, cls, section.replace("Section ", "").trim()),
    [allSubjectAssignments, cls, section]
  );

  const isGradebookApproved = useMemo(() => {
    if (assignedSubjects.length === 0) return false;
    const secClean = section.replace("Section ", "").trim();
    const relevant = submissions.filter(s =>
      canonGrade(s.grade) === canonGrade(cls) &&
      canonSection(s.section) === canonSection(secClean) &&
      s.term === term
    );
    const approvedSubjects = new Set(
      relevant.filter(s => s.status === "Approved by Principal").map(s => s.subject)
    );
    return assignedSubjects.every(subj => approvedSubjects.has(subj));
  }, [submissions, cls, section, term, assignedSubjects]);

  const hasAccessToActions = useMemo(() => {
    const isAdmin = role === "admin" || role === "super_admin" || role === "school_owner";
    const isGC = isGradeCoordinator && (!coordAssignedGrade || canonGrade(coordAssignedGrade) === canonGrade(cls));
    const isCT = (role === "class_teacher" || role === "teacher" || role === "staff") &&
      teacherClass &&
      canonGrade(teacherClass.grade) === canonGrade(cls) &&
      canonSection(teacherClass.section) === canonSection(section.replace("Section ", "").trim());
    return isAdmin || isGC || isCT;
  }, [role, isGradeCoordinator, coordAssignedGrade, cls, teacherClass, section]);

  function downloadCard(c: ReportCardRecord) {
    const student = roster.find(x => String(x.id) === String(c.studentId));
    if (!student) {
      toast.error("Student info not found in roster");
      return;
    }
    const filename = `report-card-${c.name.replace(/ /g,"-")}.html`;
    const ctx = { template, cls, section, term, year: academicYear };
    const html = buildReportCardHTML(student, { ...ctx, section: section.replace("Section ","") });
    triggerDownload(html, filename, "text/html");
    toast.success(`Downloaded report card for ${c.name}`);
  }

  function downloadAllExisting() {
    const ctx = { template, cls, section, term, year: academicYear };
    const cleanSection = section.replace("Section ", "");
    const validStudents = roster.filter(r => existingCards.some(c => String(c.studentId) === String(r.id)));
    if (!validStudents.length) {
      toast.error("No report cards to download");
      return;
    }
    const html = buildBulkHTML(validStudents, { ...ctx, section: cleanSection });
    triggerDownload(html, `report-cards-${cls.replace(/ /g,"-")}-${term.replace(/ /g,"-")}.html`, "text/html");
    toast.success(`Downloaded ${validStudents.length} report cards!`);
  }

  const [notifyingBusy, setNotifyingBusy] = useState<string | null>(null);

  async function notifyCard(c: ReportCardRecord) {
    setNotifyingBusy(c.id);
    try {
      await notifyReportCard(c.id);
      toast.success(`Notification sent to ${c.name}'s parent & student portal`);
    } catch (e) {
      toast.error("Failed to send notification");
    } finally {
      setNotifyingBusy(null);
    }
  }

  async function notifyAllExisting() {
    const ids = existingCards.map(c => c.id);
    if (!ids.length) {
      toast.error("No report cards to notify");
      return;
    }
    setNotifyingBusy("all");
    try {
      await notifyManyReportCards(ids);
      toast.success(`Notifications sent for ${ids.length} report cards`);
    } catch (e) {
      toast.error("Failed to send bulk notifications");
    } finally {
      setNotifyingBusy(null);
    }
  }

  // Per selected student: which of their assigned subjects are still missing
  // marks. Empty array = fully marked, safe to generate/print.
  const marksCompleteness = useMemo(() => {
    if (!gbSources || assignedSubjects.length === 0) return new Map<string, string[]>();
    const band = getBandForGrade(curriculum, cls);
    const map = new Map<string, string[]>();
    selectedRoster.forEach(r => {
      const gb = computeStudentGradebook(
        { id: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim() }, band, gbSources
      );
      const marked = new Set(gb.subjects.filter(s => s.hasData).map(s => s.subject));
      const missing = assignedSubjects.filter(subj => !marked.has(subj));
      if (missing.length) map.set(String(r.id), missing);
    });
    return map;
  }, [gbSources, assignedSubjects, selectedRoster, curriculum, cls, section]);

  const incompleteCount = marksCompleteness.size;
  const allMarksComplete = assignedSubjects.length > 0 && incompleteCount === 0;

  // Real class-wide analytics for the currently selected roster — computed
  // straight from the same gradebook engine every report card itself is
  // generated from. Replaces the old GRADE_DIST/TOP_PERFORMERS/AI_INSIGHTS
  // constants, which were fabricated sample arrays never actually connected
  // to a real class (dead code — nothing rendered them). "AI Insights" here
  // are real computed observations (class average, weakest/strongest
  // subject, students below passing), not an LLM call — labeled honestly
  // as "Performance Insights" rather than claiming AI involvement.
  const classAnalytics = useMemo(() => {
    if (!gbSources) return null;
    const band = getBandForGrade(curriculum, cls);
    const perStudent = selectedRoster.map(r => {
      const gb = computeStudentGradebook(
        { id: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim() }, band, gbSources
      );
      const subs = gb.subjects.filter(s => s.hasData);
      if (!subs.length) return null;
      return { id: String(r.id), name: r.name, roll: r.roll, pct: gb.overallPercentage, subs };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    if (!perStudent.length) return { hasData: false as const, gradedCount: 0, totalSelected: selectedRoster.length };

    const bands = [
      { label: "A+", min: 90, color: "#10B981" },
      { label: "A",  min: 80, color: "#6C3BFF" },
      { label: "B+", min: 70, color: "#8B5CF6" },
      { label: "B",  min: 60, color: "#F59E0B" },
      { label: "C",  min: 50, color: "#FB923C" },
      { label: "D",  min: 40, color: "#EF4444" },
      { label: "F",  min: 0,  color: "#DC2626" },
    ];
    const gradeDist = bands.map(b => ({
      ...b,
      value: perStudent.filter(s => s.pct >= b.min && s.pct < (bands[bands.indexOf(b) - 1]?.min ?? 101)).length,
    }));

    const topPerformers = [...perStudent].sort((a, b) => b.pct - a.pct).slice(0, 3)
      .map((s, i) => ({ name: s.name, roll: s.roll, pct: Math.round(s.pct * 10) / 10, rank: i + 1 }));

    // Subject-level averages across the class, to find the strongest/weakest.
    const subjectTotals = new Map<string, { sum: number; count: number }>();
    perStudent.forEach(s => s.subs.forEach(x => {
      const cur = subjectTotals.get(x.subject) || { sum: 0, count: 0 };
      subjectTotals.set(x.subject, { sum: cur.sum + x.percentage, count: cur.count + 1 });
    }));
    const subjectAverages = Array.from(subjectTotals.entries())
      .map(([subject, v]) => ({ subject, avg: v.sum / v.count }))
      .sort((a, b) => b.avg - a.avg);

    const classAverage = perStudent.reduce((s, x) => s + x.pct, 0) / perStudent.length;
    const belowPassing = perStudent.filter(s => s.pct < 40).length;

    const insights: { icon: typeof TrendingUp; color: string; text: string }[] = [];
    insights.push({
      icon: BarChart3, color: "#6C3BFF",
      text: `Class average is ${classAverage.toFixed(1)}% across ${perStudent.length} graded student${perStudent.length === 1 ? "" : "s"}.`,
    });
    if (subjectAverages.length > 1) {
      const best = subjectAverages[0], worst = subjectAverages[subjectAverages.length - 1];
      insights.push({ icon: TrendingUp, color: "#10B981", text: `Strongest subject: ${best.subject} (avg ${best.avg.toFixed(1)}%).` });
      insights.push({ icon: AlertTriangle, color: "#F59E0B", text: `Weakest subject: ${worst.subject} (avg ${worst.avg.toFixed(1)}%) — may need review.` });
    }
    if (belowPassing > 0) {
      insights.push({ icon: AlertTriangle, color: "#EF4444", text: `${belowPassing} student${belowPassing === 1 ? "" : "s"} scored below 40% overall and may need intervention.` });
    }

    return { hasData: true as const, gradeDist, topPerformers, insights, classAverage, gradedCount: perStudent.length, totalSelected: selectedRoster.length };
  }, [gbSources, selectedRoster, curriculum, cls, section]);

  // Real exam-level finalization signal: exams for this class/section whose
  // marks are entered (Completed) but not yet Published in Exam Results.
  // Report cards are still generated from the live gradebook regardless (an
  // exam name here isn't reliably mappable to a report-card term), but this
  // surfaces honestly that the underlying exam result hasn't been finalized —
  // the "review, moderate, finalize" step the school actually runs through.
  const allExams = useExams();
  const unpublishedExams = useMemo(
    () => allExams.filter(e => e.status === "Completed" && matchesSection(e, cls, section.replace("Section ", "").trim())),
    [allExams, cls, section]
  );

  // Build a fresh computed report-card record for one roster student, straight
  // from the live gradebook engine. Shared by both the original generate/publish
  // flow and the Regenerate actions below, so the marks-computation logic never
  // gets duplicated.
  function buildRecordFor(r: RCStudent & { id: string }, src: GradebookSources, band: ReturnType<typeof getBandForGrade>, requiredSubjects: string[] = []): ReportCardRecord | null {
    const gb = computeStudentGradebook(
      { id: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim() }, band, src
    );
    const subs = gb.subjects.filter(s => s.hasData);
    if (!subs.length) return null;
    // If we know which subjects actually have a teacher assigned for this class/section,
    // a report card is only "ready" once every one of them has real marks — a report card
    // missing an assigned subject's marks is not a complete exam result.
    if (requiredSubjects.length) {
      const marked = new Set(subs.map(s => s.subject));
      if (requiredSubjects.some(subj => !marked.has(subj))) return null;
    }
    return {
      id: reportCardId(String(r.id), academicYear, term),
      studentId: String(r.id), name: r.name, grade: cls, section: section.replace("Section ", "").trim(),
      term, year: academicYear,
      subjects: subs.map(s => ({ subject: s.subject, obtained: Math.round(s.obtainedWeighted * 10) / 10, max: s.presentWeight, pct: Math.round(s.percentage), letter: s.letter })),
      overallPct: Math.round(gb.overallPercentage), overallGrade: gb.overallLetter,
      attendancePct: typeof r.attendance === "number" ? Math.round(r.attendance) : null,
      classTeacherRemark: "", principalRemark: "",
      // Generation only ever produces a draft now — it must go through
      // Submit → Verify (Class Teacher) → Approve (Coordinator/Principal) →
      // Publish (Principal/Admin) before students/parents can see it. See the
      // approval-actions panel below the existing-cards list.
      status: "draft" as const, approvalStage: 0,
      publishedToStudents: false, publishedToParents: false,
      teacherName: actor.name, principalName, generatedAt: "",
    };
  }

  // Persist a draft report-card record per selected student (engine marks
  // only). This used to publish straight to the student/parent portals —
  // generation now only produces a draft; use the approval-actions panel
  // below to Submit → Verify → Approve → Publish it.
  function publishReportCards(): number {
    if (!gbSources) return 0;
    const band = getBandForGrade(curriculum, cls);
    const records = selectedRoster.map(r => buildRecordFor(r, gbSources, band, assignedSubjects)).filter(Boolean) as ReportCardRecord[];
    const skipped = selectedRoster.length - records.length;
    if (records.length) {
      saveReportCards(records);
      setGeneratedCountTick(t => t + 1);
      toast.success(`${records.length} report card${records.length === 1 ? "" : "s"} generated as draft${skipped ? ` (${skipped} skipped — marks incomplete)` : ""}. Submit for review to move it forward.`);
    } else {
      toast.error("No report cards generated — marks are incomplete for the selected students");
    }
    return records.length;
  }



  // Existing report cards for the current class/section/term/year — used to
  // drive the Regenerate list. Re-reads whenever gbSources/roster changes so
  // freshly regenerated cards show up immediately.
  const existingCards = useMemo(() => {
    const secClean = section.replace("Section ", "").trim();
    return roster
      .map(r => getReportCard(String(r.id), academicYear, term))
      .filter((rec): rec is ReportCardRecord => !!rec && canonGrade(rec.grade) === canonGrade(cls) && canonSection(rec.section) === canonSection(secClean));
  }, [roster, academicYear, term, cls, section, generatedCountTick]);

  // Regenerate a single student's report card from current gradebook data,
  // preserving status/approval/publish flags/remarks. LOCKED once a record has
  // left draft — the whole point of the approval chain is that a Verified/
  // Approved/Published card's marks can't be silently swapped out from under
  // the people who already signed off on it. Reopen it first (approval panel).
  function regenerateOne(studentId: string) {
    if (!gbSources) { toast.error("Gradebook data not ready yet"); return; }
    const existing = getReportCard(studentId, academicYear, term);
    if (existing && existing.status !== "draft") {
      toast.error(`This report card is "${existing.status}" — reopen it first (in the list below) before regenerating its marks.`);
      return;
    }
    const r = roster.find(x => String(x.id) === String(studentId));
    if (!r) return;
    const band = getBandForGrade(curriculum, cls);
    const fresh = buildRecordFor(r, gbSources, band, assignedSubjects);
    if (!fresh) { toast.error("No graded marks found to regenerate from — marks may be incomplete"); return; }
    regenerateReportCard(fresh);
    setGeneratedCountTick(t => t + 1);
    toast.success(`Report card regenerated for ${r.name}`);
  }

  // Regenerate every existing report card for the current class/section/term/year.
  // Locked records (anything past draft) are skipped, not silently overwritten.
  function regenerateClass() {
    if (!gbSources) { toast.error("Gradebook data not ready yet"); return; }
    if (!existingCards.length) { toast.error("No report cards to regenerate for this selection"); return; }
    const draftCards = existingCards.filter(c => c.status === "draft");
    const lockedCount = existingCards.length - draftCards.length;
    if (!draftCards.length) {
      toast.error(`All ${existingCards.length} report cards for ${cls} · ${section} are past draft — reopen them first to regenerate.`);
      return;
    }
    const band = getBandForGrade(curriculum, cls);
    const freshList = draftCards
      .map(c => roster.find(r => String(r.id) === String(c.studentId)))
      .filter((r): r is RCStudent & { id: string } => !!r)
      .map(r => buildRecordFor(r, gbSources, band, assignedSubjects))
      .filter(Boolean) as ReportCardRecord[];
    if (!freshList.length) { toast.error("No graded marks found to regenerate from"); return; }
    regenerateReportCards(freshList);
    setGeneratedCountTick(t => t + 1);
    toast.success(`${freshList.length} report cards regenerated for ${cls} · ${section}${lockedCount ? ` (${lockedCount} skipped — not in draft)` : ""}`);
  }

  // One handler for every approval-chain button (Submit/Verify/Approve/
  // Publish/Reopen) — the store enforces who's allowed to do what and throws
  // ApprovalError with a human-readable reason on a bad transition, which we
  // just surface as a toast rather than re-deriving the rule client-side too.
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  async function runApprovalAction(
    id: string, name: string,
    fn: (id: string, actor: { uid: string; name: string; role: string }) => Promise<ReportCardRecord>,
    successVerb: string
  ) {
    setApprovalBusy(id);
    try {
      await fn(id, actor);
      setGeneratedCountTick(t => t + 1);
      toast.success(`${name}'s report card ${successVerb}`);
    } catch (e) {
      toast.error(e instanceof ApprovalError ? e.message : "Action failed");
    } finally {
      setApprovalBusy(null);
    }
  }

  const STATUS_META: Record<ReportCardStatus, { label: string; color: string; bg: string }> = {
    draft:     { label: "Draft",     color: dark ? "#8B8BA8" : "#64748B", bg: dark ? "#8B8BA820" : "#F1F5F9" },
    submitted: { label: "Submitted", color: dark ? "#60A5FA" : "#2563EB", bg: dark ? "#60A5FA20" : "#EFF6FF" },
    verified:  { label: "Verified",  color: dark ? "#C084FC" : "#7C3AED", bg: dark ? "#C084FC20" : "#F5F3FF" },
    approved:  { label: "Approved",  color: dark ? "#FBBF24" : "#B45309", bg: dark ? "#FBBF2420" : "#FFFBEB" },
    published: { label: "Published", color: dark ? "#4ADE80" : "#059669", bg: dark ? "#4ADE8020" : "#ECFDF5" },
  };

  // What the CURRENT user's role may do to a record in its CURRENT status —
  // mirrors reportCardStore.ts's ACTION_ROLES, kept here only for which
  // button(s) to render; the store is still the actual source of truth and
  // will reject anything this check gets wrong.
  function availableActions(status: ReportCardStatus): { action: "submit"|"verify"|"approve"|"publish"|"reopen"; label: string }[] {
    const r = actor.role;
    const isTeacher = r === "class_teacher" || r === "subject_teacher";
    const isCoordinatorOrPrincipal = ["grade_coordinator", "academic_coordinator", "principal", "vice_principal"].includes(r);
    const isAdminTier = r === "admin" || r === "super_admin" || r === "school_owner";
    const out: { action: "submit"|"verify"|"approve"|"publish"|"reopen"; label: string }[] = [];
    if (status === "draft" && (isTeacher || isAdminTier)) out.push({ action: "submit", label: "Submit for Review" });
    if (status === "submitted" && (isTeacher || isAdminTier)) out.push({ action: "verify", label: "Verify" });
    if (status === "verified" && (isCoordinatorOrPrincipal || isAdminTier)) out.push({ action: "approve", label: "Approve" });
    if (status === "approved" && (r === "principal" || isAdminTier)) out.push({ action: "publish", label: "Publish" });
    if (status !== "draft" && (isCoordinatorOrPrincipal || isAdminTier)) out.push({ action: "reopen", label: "Reopen" });
    return out;
  }

  const APPROVAL_FN: Record<"submit"|"verify"|"approve"|"publish"|"reopen", (id: string, actor: { uid: string; name: string; role: string }) => Promise<ReportCardRecord>> = {
    submit: submitReportCard, verify: (id, a) => verifyReportCard(id, a), approve: (id, a) => approveReportCard(id, a),
    publish: (id, a) => publishReportCard(id, a), reopen: reopenReportCard,
  };
  const APPROVAL_VERB: Record<"submit"|"verify"|"approve"|"publish"|"reopen", string> = {
    submit: "submitted for review", verify: "verified", approve: "approved",
    publish: "published to the student & parent portals", reopen: "reopened for editing",
  };

  const avgAttendance = roster.length
    ? Math.round((roster.reduce((a, r) => a + (r.attendance || 0), 0) / roster.length) * 10) / 10 : 0;
  const classAvg = useMemo(() => {
    if (!roster.length) return 0;
    const pcts = roster.map(r => {
      const subs = realSubjects(r.name);
      if (!subs) return null;
      const t = subs.reduce((a, x) => a + x.max, 0), o = subs.reduce((a, x) => a + x.obtained, 0);
      return Math.round((o / t) * 100);
    }).filter((p): p is number => p !== null);
    if (!pcts.length) return 0;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }, [roster]);
  const pending = Math.max(0, roster.length - generatedCount);

  const [toggles, setToggles] = useState({
    attendance: true, teacherRemarks: true, principalRemarks: true,
    coScholastic: true, aiInsights: false, branding: true,
  });

  // ── Subjects & Marks configuration (editable) ──
  const [subjectRows, setSubjectRows] = useState([
    { name: "English",        max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Mathematics",    max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Science",        max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Urdu",           max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Islamiyat",      max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Social Studies", max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Computer",       max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
    { name: "Art & Craft",    max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" },
  ]);
  const addSubjectRow = () =>
    setSubjectRows(rs => [...rs, { name: `Subject ${rs.length + 1}`, max: 100, pass: 40, weightage: 1.0, type: "Letter Grade" }]);
  const removeSubjectRow = (i: number) =>
    setSubjectRows(rs => rs.filter((_, idx) => idx !== i));

  // ── Grading scale ──
  const gradingRows = [
    { range: "90 - 100",  grade: "A+", remark: "Outstanding",       color: "#10B981" },
    { range: "80 - 89",   grade: "A",  remark: "Excellent",         color: "#22C55E" },
    { range: "70 - 79",   grade: "B",  remark: "Good",              color: "#3B82F6" },
    { range: "60 - 69",   grade: "C",  remark: "Satisfactory",      color: "#8B5CF6" },
    { range: "50 - 59",   grade: "D",  remark: "Average",           color: "#F59E0B" },
    { range: "40 - 49",   grade: "E",  remark: "Needs Improvement", color: "#FB923C" },
    { range: "Below 40",  grade: "F",  remark: "Unsatisfactory",    color: "#EF4444" },
  ];

  // ── Co-curricular activities (toggle + grade) ──
  const [coCurricular, setCoCurricular] = useState([
    { name: "Participation in Activities", grade: "A",  checked: true },
    { name: "Artistic Skills",             grade: "A+", checked: true },
    { name: "Sports",                      grade: "B",  checked: true },
    { name: "Music",                       grade: "A",  checked: true },
    { name: "Leadership",                  grade: "A",  checked: true },
    { name: "Social Skills",               grade: "A",  checked: true },
  ]);
  const toggleCoCurricular = (i: number) =>
    setCoCurricular(cs => cs.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c));

  // ── Behavior & skills (grades) ──
  const behaviorSkills = [
    { name: "Courtesy",           grade: "A", icon: Star },
    { name: "Punctuality",        grade: "A", icon: Clock },
    { name: "Honesty",            grade: "A", icon: CheckCircle2 },
    { name: "Responsibility",     grade: "A", icon: Award },
    { name: "Class Participation", grade: "A", icon: Users },
    { name: "Neatness",           grade: "A", icon: Sparkles },
  ];

  // ── Report-card settings (screenshot's right-side toggles) ──
  const [rcSettings, setRcSettings] = useState({
    includeAttendance: true, includeCoCurricular: true, includeBehavior: true,
    includeRemarks: true, showPercentage: true, showGPA: true,
  });
  const toggleSetting = (k: keyof typeof rcSettings) =>
    setRcSettings(s => ({ ...s, [k]: !s[k] }));

  // ── Signature settings (screenshot's Signature Settings panel) ──
  const [signatures, setSignatures] = useState({ classTeacher: true, principal: true, parent: true, stamp: true });
  const toggleSignature = (k: keyof typeof signatures) => setSignatures(s => ({ ...s, [k]: !s[k] }));

  const toggleComp = (id: string) =>
    setComponents(cs => cs.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  const toggleOpt = (k: keyof typeof toggles) =>
    setToggles(t => ({ ...t, [k]: !t[k] }));

  const goNext = () => { setStep(s => Math.min(STEPS.length, s + 1)); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const goBack = () => { setStep(s => Math.max(1, s - 1)); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const goStep = (n: number) => { setStep(n); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{ background: dark ? "#16162A" : "#fff", border: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 14,
      boxShadow: "0 1px 3px rgba(15,23,42,.04)", ...extra }}>{children}</div>
  );

  const sectionTitle = (t: string) => (
    <p style={{ fontSize: 12, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", textTransform: "uppercase",
      letterSpacing: ".07em", marginBottom: 12 }}>{t}</p>
  );

  const divider = () => <div style={{ height: 1, background: dark ? "#2A2A45" : "#F1F5F9", margin: "18px 0" }} />;

  // ── Wizard derived state & helpers ──
  const TOTAL = STEPS.length;
  const studentCount = selectedStudents.length;
  const templateMeta = TEMPLATES.find(t => t.id === template) || TEMPLATES[0];

  const filteredRoster = roster.filter(r => {
    const q = studentSearch.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || String(r.roll).toLowerCase().includes(q) || (r.adm || "").toLowerCase().includes(q);
  });

  const countFor = (grade: string, sec?: string) => allStudents.filter(s => {
    const g = s.grade || "";
    const gradeMatch = g === grade || g === grade.replace("Grade ", "");
    const secMatch = !sec || (s.section || "").replace("Section ", "") === sec.replace("Section ", "");
    return gradeMatch && secMatch;
  }).length;

  const canNext =
    step === 1 ? Boolean(term && exam) :
    step === 2 ? Boolean(cls) :
    step === 3 ? Boolean(section) :
    step === 4 ? studentCount > 0 :
    step === 5 ? Boolean(template) : true;

  const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: dark ? "#8B8BA8" : "#64748B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 };
  const pillBtn = (primary: boolean): React.CSSProperties => ({ padding: "9px 14px", borderRadius: 9, border: `1.5px solid ${primary ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0")}`, background: primary ? (dark ? "#9B59E620" : "#6C3BFF10") : (dark ? "#16162A" : "#fff"), color: primary ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#8B8BA8" : "#64748B"), fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

  const stepHead = (title: string, sub: string, Icon: typeof Users) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: dark ? "#9B59E620" : "#6C3BFF15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon style={{ width: 19, height: 19, color: dark ? "#9B59E6" : "#6C3BFF" }} />
      </div>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: dark ? "#8B8BA8" : "#64748B", margin: "3px 0 0" }}>{sub}</p>
      </div>
    </div>
  );

  const Chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick}
      style={{ padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0")}`,
        background: active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#16162A" : "#fff"), color: active ? "#fff" : (dark ? "#8B8BA8" : "#475569"),
        fontSize: 13, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
      {label}
    </button>
  );

  const OptionCard = (o: { key: string; title: string; sub?: string; active: boolean; onClick: () => void; icon: typeof Users }) => (
    <button key={o.key} onClick={o.onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", textAlign: "left",
        background: o.active ? (dark ? "#9B59E620" : "#F5F3FF") : (dark ? "#16162A" : "#fff"), border: `2px solid ${o.active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E8EDF5")}`,
        borderRadius: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
        boxShadow: o.active ? "0 4px 14px rgba(108,59,255,.12)" : "none", width: "100%" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: o.active ? (dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)") : (dark ? "#2A2A45" : "#F1F5F9"),
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <o.icon style={{ width: 18, height: 18, color: o.active ? "#fff" : (dark ? "#8B8BA8" : "#94A3B8") }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{o.title}</p>
        {o.sub && <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", margin: "2px 0 0" }}>{o.sub}</p>}
      </div>
      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${o.active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#3D3D5C" : "#CBD5E1")}`, background: o.active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#16162A" : "#fff"),
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {o.active && <Check style={{ width: 12, height: 12, color: "#fff" }} />}
      </div>
    </button>
  );

  const summaryRow = (label: string, value: string, jumpStep: number) => (
    <button onClick={() => goStep(jumpStep)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%",
        padding: "10px 0", background: "none", border: "none", borderBottom: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#94A3B8", fontWeight: 600 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: value ? (dark ? "#F0EFFF" : "#0F172A") : (dark ? "#3D3D5C" : "#CBD5E1") }}>
        {value || "—"} <ChevronRight style={{ width: 12, height: 12, color: dark ? "#3D3D5C" : "#CBD5E1" }} />
      </span>
    </button>
  );

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: dark ? "#0E0E16" : "#F1F5F9", fontFamily: "'Inter', sans-serif" }}>
      {showGenerate && (
        <GenerateModal onClose={() => setShowGenerate(false)} cls={cls} section={section} term={term}
          template={template} year={academicYear} students={selectedRoster}
          assignedSubjects={assignedSubjects} marksCompleteness={marksCompleteness}
          onGenerated={() => { const n = publishReportCards(); setGeneratedCount(c => c + n); return n; }} />
      )}
      {showFullPreview && (
        <FullPreviewModal onClose={() => setShowFullPreview(false)} cls={cls} section={section} term={term}
          template={template} year={academicYear} students={selectedRoster} />
      )}

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 24px 120px" }}>
        {/* Header */}
        <div className="flex items-center gap-3" style={{ marginBottom: 22 }}>
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FileCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Report Card Generator</h1>
            <p className="text-sm text-slate-400">Centralized — generate report cards for any grade &amp; section in a few guided steps.</p>
          </div>
        </div>

        {/* Stepper */}
        {card(
          <div style={{ display: "flex", alignItems: "center", padding: "18px 22px", minWidth: 720 }}>
            {STEPS.map((s, i) => {
              const done = step > s.id, active = step === s.id, on = done || active;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0, minWidth: 0 }}>
                  <button onClick={() => { if (s.id <= step) goStep(s.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none",
                      cursor: s.id <= step ? "pointer" : "default", fontFamily: "inherit", padding: 0, flexShrink: 0, opacity: s.id <= step ? 1 : .55 }}>
                    <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: on ? (dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)") : (dark ? "#2A2A45" : "#EEF2F7"),
                      color: on ? "#fff" : (dark ? "#8B8BA8" : "#94A3B8"), display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: active ? (dark ? "0 0 0 4px #9B59E633" : "0 0 0 4px #6C3BFF22") : "none", transition: "all .15s", fontWeight: 800, fontSize: 14 }}>
                      {done ? <Check style={{ width: 17, height: 17 }} /> : <s.icon style={{ width: 17, height: 17 }} />}
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: on ? (dark ? "#F0EFFF" : "#0F172A") : (dark ? "#8B8BA8" : "#94A3B8"), whiteSpace: "nowrap", margin: 0 }}>{s.label}</p>
                      <p style={{ fontSize: 11, color: active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#8B8BA8" : "#94A3B8"), fontWeight: 600, margin: 0 }}>{s.sub}</p>
                    </div>
                  </button>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2.5, minWidth: 20, background: done ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0"), margin: "0 14px", borderRadius: 2 }} />}
                </div>
              );
            })}
          </div>,
          { marginBottom: 20, overflowX: "auto" }
        )}

        {/* Body: step panel + summary sidebar */}
        <div style={{ display: "grid", gridTemplateColumns: step === TOTAL ? "1fr" : "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }}>
          <div>
            {/* STEP 1 — TERM & EXAM */}
            {step === 1 && card(
              <div style={{ padding: 26 }}>
                {stepHead("Academic Term & Exam", "Select the academic year, term and the exam this report card covers.", Calendar)}
                <p style={fieldLabel}>Academic Year</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
                  {ACADEMIC_YEARS.map(y => Chip(y, academicYear === y, () => setAcademicYear(y)))}
                </div>
                <p style={fieldLabel}>Term</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
                  {TERMS.map(t => OptionCard({ key: t, title: t, sub: "Reporting period", active: term === t, onClick: () => setTerm(t), icon: Calendar }))}
                </div>
                <p style={fieldLabel}>Exam</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {EXAMS.map(e => OptionCard({ key: e, title: e, sub: "Assessment", active: exam === e, onClick: () => setExam(e), icon: FileText }))}
                </div>
              </div>
            )}

            {/* STEP 2 — GRADE */}
            {step === 2 && card(
              <div style={{ padding: 26 }}>
                {stepHead("Select Grade", "Choose the grade you want to generate report cards for.", BookOpen)}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
                  {classOptions.map(g => {
                    const active = cls === g; const cnt = countFor(g);
                    return (
                      <button key={g} onClick={() => setCls(g)}
                        style={{ padding: "18px 16px", borderRadius: 14, border: `2px solid ${active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E8EDF5")}`,
                          background: active ? (dark ? "#9B59E620" : "#F5F3FF") : (dark ? "#16162A" : "#fff"), cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                          boxShadow: active ? "0 4px 14px rgba(108,59,255,.12)" : "none", transition: "all .15s" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, marginBottom: 12,
                          background: active ? (dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)") : (dark ? "#2A2A45" : "#F1F5F9"),
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <BookOpen style={{ width: 18, height: 18, color: active ? "#fff" : (dark ? "#8B8BA8" : "#94A3B8") }} />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{g}</p>
                        <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", margin: "2px 0 0" }}>{cnt} students</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3 — SECTION */}
            {step === 3 && card(
              <div style={{ padding: 26 }}>
                {stepHead(`Select Section — ${cls}`, "Choose a section to generate report cards for.", CircleDot)}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
                  {sectionOptions.map(sec => {
                    const active = section === sec; const cnt = countFor(cls, sec);
                    return (
                      <button key={sec} onClick={() => { setSection(sec); setTouchedSelection(false); }}
                        style={{ padding: "18px 16px", borderRadius: 14, border: `2px solid ${active ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E8EDF5")}`,
                          background: active ? (dark ? "#9B59E620" : "#F5F3FF") : (dark ? "#16162A" : "#fff"), cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                          boxShadow: active ? "0 4px 14px rgba(108,59,255,.12)" : "none", transition: "all .15s" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, marginBottom: 12,
                          background: active ? (dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)") : (dark ? "#2A2A45" : "#F1F5F9"),
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Users style={{ width: 18, height: 18, color: active ? "#fff" : (dark ? "#8B8BA8" : "#94A3B8") }} />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{sec}</p>
                        <p style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#64748B", margin: "2px 0 0" }}>{cnt} students</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4 — STUDENTS */}
            {step === 4 && card(
              <div style={{ padding: 26 }}>
                {stepHead("Select Students", `Pick the students from ${cls} · ${section} to include.`, Users)}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search by name, roll or admission no…"
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit", background: dark ? "#1A1A30" : "#F8FAFC", color: dark ? "#F0EFFF" : "#0F172A" }} />
                    <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: dark ? "#8B8BA8" : "#94A3B8", pointerEvents: "none" }} />
                  </div>
                  <button onClick={() => { setTouchedSelection(true); setSelectedStudents(roster.map(r => r.id)); }} style={pillBtn(true)}>Select All</button>
                  <button onClick={() => { setTouchedSelection(true); setSelectedStudents([]); }} style={pillBtn(false)}>Clear</button>
                </div>
                <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, borderRadius: 12, maxHeight: 420, overflowY: "auto" }}>
                  {filteredRoster.length === 0 && <p style={{ padding: 30, textAlign: "center", fontSize: 13, color: dark ? "#8B8BA8" : "#94A3B8" }}>No students match your search.</p>}
                  {filteredRoster.map((r, i) => {
                    const checked = selectedStudents.includes(r.id);
                    return (
                      <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                        borderBottom: i < filteredRoster.length - 1 ? `1px solid ${dark ? "#2A2A45" : "#F8FAFC"}` : "none",
                        background: checked ? (dark ? "#9B59E610" : "#6C3BFF06") : (dark ? "#16162A" : "#fff"), cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} style={{ width: 16, height: 16, accentColor: dark ? "#9B59E6" : "#6C3BFF", cursor: "pointer", flexShrink: 0 }}
                          onChange={() => { setTouchedSelection(true); setSelectedStudents(prev => checked ? prev.filter(x => x !== r.id) : [...prev, r.id]); }} />
                        <span style={{ width: 32, height: 32, borderRadius: "50%", background: dark ? "#2A2A45" : "#EEF2F7", color: dark ? "#9B59E6" : "#6C3BFF", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {r.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{r.name}</p>
                          <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#94A3B8", margin: 0 }}>Roll {r.roll} · {r.adm}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dark ? "#4ADE80" : "#10B981", background: "#10B98115", borderRadius: 5, padding: "2px 9px" }}>Eligible</span>
                      </label>
                    );
                  })}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: dark ? "#9B59E6" : "#6C3BFF", marginTop: 14 }}>{studentCount} of {roster.length} students selected</p>
              </div>
            )}

            {/* STEP 5 — TEMPLATE & SETTINGS */}
            {step === 5 && card(
              <div style={{ padding: 26 }}>
                {stepHead("Template & Settings", "Choose a report card design and what it should include.", FileText)}
                <p style={fieldLabel}>Report Card Template</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, marginBottom: 22 }}>
                  {TEMPLATES.map(t => {
                    const active = template === t.id;
                    return (
                      <button key={t.id} onClick={() => setTemplate(t.id)}
                        style={{ border: `2px solid ${active ? t.color : (dark ? "#2A2A45" : "#E8EDF5")}`, borderRadius: 12, overflow: "hidden", background: dark ? "#16162A" : "#fff", cursor: "pointer", fontFamily: "inherit", padding: 0,
                          boxShadow: active ? `0 4px 12px ${t.color}22` : "none", transition: "all .15s" }}>
                        <div style={{ borderTop: `4px solid ${t.color}` }}>{renderMiniTemplate(t.id, t.color)}</div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: active ? t.color : (dark ? "#F0EFFF" : "#0F172A"), textAlign: "center", padding: "6px 4px 8px", borderTop: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, margin: 0 }}>{t.short}</p>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
                  <SelectField label="Grading System" options={GRADING_SYSTEMS} value={grading} onChange={v => setGrading(v as GradingSystem)} />
                  <SelectField label="Language" options={LANGUAGES} value={lang} onChange={v => setLang(v as Language)} />
                </div>
                <p style={fieldLabel}>Include in Report Card</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <ToggleRow label="Attendance Summary" checked={toggles.attendance} onChange={() => toggleOpt("attendance")} />
                  <ToggleRow label="Co-Scholastic Areas" checked={toggles.coScholastic} onChange={() => toggleOpt("coScholastic")} />
                  <ToggleRow label="Teacher Remarks" checked={toggles.teacherRemarks} onChange={() => toggleOpt("teacherRemarks")} />
                  <ToggleRow label="Principal Remarks" checked={toggles.principalRemarks} onChange={() => toggleOpt("principalRemarks")} />
                  <ToggleRow label="AI Insights" checked={toggles.aiInsights} onChange={() => toggleOpt("aiInsights")} />
                  <ToggleRow label="School Branding" checked={toggles.branding} onChange={() => toggleOpt("branding")} />
                </div>
              </div>
            )}

            {/* STEP 6 — GENERATE & PREVIEW */}
            {step === TOTAL && (
              <>
              {classAnalytics?.hasData && (
                <div style={{ marginBottom: 18 }}>
                  {card(
                    <div style={{ padding: 22 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>
                          Class Analytics — {cls} · {section}
                        </p>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: dark ? "#8B8BA8" : "#94A3B8" }}>
                          {classAnalytics.gradedCount} of {classAnalytics.totalSelected} selected students have marks
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#94A3B8", margin: "0 0 16px" }}>
                        Computed live from the real gradebook — not sample data.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1.2fr", gap: 16 }}>
                        {/* Grade distribution */}
                        <div>
                          <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: dark ? "#8B8BA8" : "#64748B", margin: "0 0 10px" }}>Grade Distribution</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {classAnalytics.gradeDist.filter(g => g.value > 0).map(g => (
                              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 9, height: 9, borderRadius: "50%", background: g.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 11.5, color: dark ? "#8B8BA8" : "#64748B", width: 24 }}>{g.label}</span>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: dark ? "#2A2A45" : "#F1F5F9", overflow: "hidden" }}>
                                  <div style={{ width: `${(g.value / classAnalytics.gradedCount) * 100}%`, height: "100%", background: g.color, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A", width: 18, textAlign: "right" }}>{g.value}</span>
                              </div>
                            ))}
                            {classAnalytics.gradeDist.every(g => g.value === 0) && (
                              <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#94A3B8" }}>No graded students yet.</p>
                            )}
                          </div>
                        </div>
                        {/* Top performers */}
                        <div>
                          <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: dark ? "#8B8BA8" : "#64748B", margin: "0 0 10px" }}>Top Performers</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {classAnalytics.topPerformers.map(p => (
                              <div key={p.rank} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                  background: p.rank === 1 ? "#FBBF2420" : dark ? "#2A2A45" : "#F1F5F9", color: p.rank === 1 ? "#B45309" : dark ? "#8B8BA8" : "#64748B",
                                  fontSize: 10, fontWeight: 800 }}>{p.rank}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "#10B981", flexShrink: 0 }}>{p.pct}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Performance insights — real computed observations, not an LLM call */}
                        <div>
                          <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: dark ? "#8B8BA8" : "#64748B", margin: "0 0 10px" }}>Performance Insights</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {classAnalytics.insights.map((ins, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                                <ins.icon style={{ width: 13, height: 13, color: ins.color, flexShrink: 0, marginTop: 1.5 }} />
                                <span style={{ fontSize: 11, color: dark ? "#CBD5E1" : "#475569", lineHeight: 1.4 }}>{ins.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 18, alignItems: "start" }}>
                {card(
                  <div style={{ padding: 26 }}>
                    {stepHead("Review & Generate", "Confirm the details below, then generate the report cards.", Zap)}
                    <div style={{ background: dark ? "#1A1A30" : "#F8FAFC", border: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, borderRadius: 12, padding: "6px 16px", marginBottom: 18 }}>
                      {[
                        ["Academic Year", academicYear], ["Term", term], ["Exam", exam],
                        ["Grade", cls], ["Section", section], ["Students", `${studentCount} selected`],
                        ["Template", templateMeta.label], ["Grading", grading], ["Language", lang],
                      ].map(([k, v], idx, arr) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${dark ? "#2A2A45" : "#EEF2F7"}` : "none" }}>
                          <span style={{ fontSize: 12, color: dark ? "#8B8BA8" : "#94A3B8", fontWeight: 600 }}>{k}</span>
                          <span style={{ fontSize: 13, color: dark ? "#F0EFFF" : "#0F172A", fontWeight: 700 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {generatedCount > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, background: dark ? "#0F2A1A" : "#F0FDF4", border: `1px solid ${dark ? "#1E5A3A" : "#BBF7D0"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
                        <CheckCircle2 style={{ width: 18, height: 18, color: dark ? "#4ADE80" : "#10B981" }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: dark ? "#4ADE80" : "#047857", margin: 0 }}>{generatedCount} report cards generated · {pending} pending</p>
                      </div>
                    )}
                    {unpublishedExams.length > 0 && (
                      <div style={{ background: dark ? "#3A2E0F" : "#FFFBEB", border: `1px solid ${dark ? "#5C4A1F" : "#FDE68A"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: dark ? "#FCD34D" : "#92400E", margin: 0 }}>
                          {unpublishedExams.length} exam{unpublishedExams.length === 1 ? "" : "s"} for {cls} · {section} {unpublishedExams.length === 1 ? "has" : "have"} marks entered but {unpublishedExams.length === 1 ? "isn't" : "aren't"} finalized yet
                        </p>
                        <p style={{ fontSize: 11.5, color: dark ? "#FCD34D" : "#92400E", margin: "4px 0 0", opacity: 0.85 }}>
                          {unpublishedExams.map(e => e.name).join(", ")} — publish results in Exam Results before treating this report card as final.
                        </p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setShowFullPreview(true)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, flex: 1, padding: "12px", background: dark ? "#16162A" : "#fff", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 11, fontSize: 13, fontWeight: 700, color: dark ? "#8B8BA8" : "#475569", cursor: "pointer", fontFamily: "inherit" }}>
                        <Eye style={{ width: 15, height: 15 }} /> Full Preview
                      </button>
                      <button onClick={() => { if (studentCount === 0) { toast.error("Select at least one student"); return; } setShowGenerate(true); }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: 2, padding: "12px", background: dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)", border: "none", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(108,59,255,.35)" }}>
                        <FileCheck style={{ width: 15, height: 15 }} /> Generate Report Cards ({studentCount})
                      </button>
                    </div>
                  </div>
                )}
                {existingCards.length > 0 && card(
                  <div style={{ padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>
                        Existing Report Cards — {cls} · {section}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isGradebookApproved && hasAccessToActions && (
                          <>
                            <button onClick={downloadAllExisting}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: dark ? "#10B98120" : "#ECFDF5", border: `1.5px solid ${dark ? "#10B98160" : "#10B98140"}`, borderRadius: 9, fontSize: 12, fontWeight: 700, color: dark ? "#34D399" : "#059669", cursor: "pointer", fontFamily: "inherit" }}>
                              <Download style={{ width: 13, height: 13 }} /> Download All
                            </button>
                            <button onClick={notifyAllExisting} disabled={notifyingBusy === "all"}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: dark ? "#3B82F620" : "#EFF6FF", border: `1.5px solid ${dark ? "#3B82F660" : "#3B82F640"}`, borderRadius: 9, fontSize: 12, fontWeight: 700, color: dark ? "#60A5FA" : "#2563EB", cursor: notifyingBusy === "all" ? "wait" : "pointer", fontFamily: "inherit" }}>
                              <Send style={{ width: 13, height: 13 }} /> {notifyingBusy === "all" ? "Notifying..." : "Notify All"}
                            </button>
                          </>
                        )}
                        <button onClick={regenerateClass}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: dark ? "#9B59E620" : "#F5F3FF", border: `1.5px solid ${dark ? "#9B59E660" : "#6C3BFF40"}`, borderRadius: 9, fontSize: 12, fontWeight: 700, color: dark ? "#9B59E6" : "#6C3BFF", cursor: "pointer", fontFamily: "inherit" }}>
                          <RefreshCw style={{ width: 13, height: 13 }} /> Regenerate Class
                        </button>
                      </div>
                    </div>
                    {!isGradebookApproved && (
                      <div style={{ background: dark ? "#3A1A1A" : "#FEF2F2", border: `1px solid ${dark ? "#5C1F1F" : "#FCA5A5"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <AlertTriangle style={{ width: 16, height: 16, color: dark ? "#F87171" : "#DC2626", flexShrink: 0 }} />
                        <p style={{ fontSize: 12, fontWeight: 700, color: dark ? "#F87171" : "#C53030", margin: 0 }}>
                          Gradebook is awaiting Principal's final approval. Report card downloading and parent/student notifications are disabled.
                        </p>
                      </div>
                    )}
                    {isGradebookApproved && !hasAccessToActions && (
                      <div style={{ background: dark ? "#3A2E0F" : "#FFFBEB", border: `1px solid ${dark ? "#5C4A1F" : "#FDE68A"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <AlertTriangle style={{ width: 16, height: 16, color: dark ? "#FCD34D" : "#B45309", flexShrink: 0 }} />
                        <p style={{ fontSize: 12, fontWeight: 700, color: dark ? "#FCD34D" : "#92400E", margin: 0 }}>
                          Your role does not permit downloading or notifying for this section. Actions are restricted to Admin, Grade Coordinator, and Class Teacher.
                        </p>
                      </div>
                    )}
                    <p style={{ fontSize: 11.5, color: dark ? "#8B8BA8" : "#94A3B8", margin: "0 0 12px" }}>
                      Already generated for {term} · {academicYear}. Regenerating re-pulls the latest gradebook marks — status, approval stage and remarks are kept.
                    </p>
                    <div style={{ border: `1px solid ${dark ? "#2A2A45" : "#F1F5F9"}`, borderRadius: 10, overflow: "hidden" }}>
                      {existingCards.map((c, i) => {
                        const stale = gbSources ? isCardStale(c, roster, cls, section, curriculum, gbSources) : false;
                        const meta = STATUS_META[c.status];
                        const actions = availableActions(c.status);
                        const busy = approvalBusy === c.id;
                        return (
                          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px",
                            borderBottom: i < existingCards.length - 1 ? `1px solid ${dark ? "#2A2A45" : "#F8FAFC"}` : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12.5, fontWeight: 700, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>{c.name}</p>
                                <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#94A3B8", margin: "1px 0 0" }}>
                                  {c.overallPct}% · {c.overallGrade}
                                  {stale && <span style={{ color: dark ? "#FCD34D" : "#B45309", fontWeight: 700 }}> · may be outdated — marks updated since generation</span>}
                                </p>
                              </div>
                              <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em",
                                padding: "3px 9px", borderRadius: 999, color: meta.color, background: meta.bg, flexShrink: 0 }}>
                                {meta.label} · {APPROVAL_CHAIN.indexOf(c.status) + 1}/{APPROVAL_CHAIN.length}
                              </span>
                              <button onClick={() => regenerateOne(c.studentId)} disabled={c.status !== "draft"}
                                title={c.status !== "draft" ? "Reopen this record first to regenerate its marks" : "Regenerate"}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",
                                  background: dark ? "#16162A" : "#fff", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 8,
                                  fontSize: 11.5, fontWeight: 700, color: c.status !== "draft" ? (dark ? "#45455A" : "#CBD5E1") : (dark ? "#8B8BA8" : "#475569"),
                                  cursor: c.status !== "draft" ? "not-allowed" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                                <RefreshCw style={{ width: 12, height: 12 }} /> Regenerate
                              </button>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                              {actions.map(a => (
                                <button key={a.action} disabled={busy}
                                  onClick={() => runApprovalAction(c.id, c.name, APPROVAL_FN[a.action], APPROVAL_VERB[a.action])}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7,
                                    fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: busy ? "wait" : "pointer",
                                    opacity: busy ? 0.6 : 1,
                                    background: a.action === "reopen" ? (dark ? "#F8717120" : "#FEF2F2") : (dark ? "#9B59E620" : "#F5F3FF"),
                                    color: a.action === "reopen" ? (dark ? "#F87171" : "#DC2626") : (dark ? "#9B59E6" : "#6C3BFF"),
                                    border: `1.5px solid ${a.action === "reopen" ? (dark ? "#F8717150" : "#FCA5A550") : (dark ? "#9B59E650" : "#6C3BFF40")}` }}>
                                  {a.label}
                                </button>
                              ))}
                              {isGradebookApproved && hasAccessToActions && (
                                <>
                                  <button onClick={() => downloadCard(c)}
                                    title="Download HTML/PDF Report Card"
                                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 7,
                                      fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                                      background: dark ? "#10B98120" : "#ECFDF5", color: dark ? "#34D399" : "#059669",
                                      border: `1.5px solid ${dark ? "#10B98150" : "#10B98140"}` }}>
                                    <Download style={{ width: 12, height: 12 }} /> Download
                                  </button>
                                  <button onClick={() => notifyCard(c)} disabled={notifyingBusy === c.id}
                                    title="Send portal & email notification to student & parent"
                                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 7,
                                      fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: notifyingBusy === c.id ? "wait" : "pointer",
                                      background: dark ? "#3B82F620" : "#EFF6FF", color: dark ? "#60A5FA" : "#2563EB",
                                      border: `1.5px solid ${dark ? "#3B82F650" : "#3B82F640"}` }}>
                                    <Send style={{ width: 12, height: 12 }} /> {notifyingBusy === c.id ? "Notifying..." : "Notify"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {card(
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: 0 }}>Live Preview</p>
                      <span style={{ fontSize: 11, fontWeight: 700, color: templateMeta.color, background: templateMeta.color + "15", borderRadius: 6, padding: "2px 9px" }}>{templateMeta.short}</span>
                    </div>
                    <ReportPreview studentName={(selectedRoster[0] || firstStudent).name} cls={cls} section={section.replace("Section ", "")}
                      template={template} term={term} year={academicYear}
                      rollNo={Number((selectedRoster[0] || firstStudent).roll) || 1} admNo={(selectedRoster[0] || firstStudent).adm}
                      attendance={(selectedRoster[0] || firstStudent).attendance} realOnly
                      remark={(selectedRoster[0]?.id) ? getReportCard(selectedRoster[0].id, academicYear, term)?.classTeacherRemark : undefined}
                      teacherName={(selectedRoster[0]?.id) ? getReportCard(selectedRoster[0].id, academicYear, term)?.teacherName : undefined}
                      principalName={(selectedRoster[0]?.id) ? getReportCard(selectedRoster[0].id, academicYear, term)?.principalName : principalName} />
                  </div>
                )}
              </div>
              </>
            )}
          </div>

          {/* SUMMARY SIDEBAR (steps 1-5) */}
          {step !== TOTAL && (
            <div style={{ position: "sticky", top: 18 }}>
              {card(
                <div style={{ padding: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: dark ? "#F0EFFF" : "#0F172A", margin: "0 0 4px" }}>Your Selection</p>
                  <p style={{ fontSize: 11, color: dark ? "#8B8BA8" : "#94A3B8", margin: "0 0 8px" }}>Tap any row to edit.</p>
                  {summaryRow("Term", term, 1)}
                  {summaryRow("Exam", exam, 1)}
                  {summaryRow("Grade", cls, 2)}
                  {summaryRow("Section", section, 3)}
                  {summaryRow("Students", studentCount ? `${studentCount} selected` : "", 4)}
                  {summaryRow("Template", templateMeta.short, 5)}
                  <div style={{ marginTop: 16, padding: 14, background: dark ? "linear-gradient(135deg,#2A1F45,#241A3D)" : "linear-gradient(135deg,#F5F3FF,#EDE9FE)", borderRadius: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: dark ? "#C4A6F0" : "#7C3AED", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: ".05em" }}>Ready to generate</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: dark ? "#F0EFFF" : "#4C1D95", margin: 0 }}>{studentCount} <span style={{ fontSize: 13, fontWeight: 600 }}>report cards</span></p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* STICKY FOOTER NAV */}
      <div style={{ position: "sticky", bottom: 0, background: dark ? "rgba(22,22,42,.92)" : "rgba(255,255,255,.92)", backdropFilter: "blur(8px)", borderTop: `1px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button onClick={step === 1 ? () => window.history.back() : goBack}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 20px", background: dark ? "#16162A" : "#fff", border: `1.5px solid ${dark ? "#2A2A45" : "#E2E8F0"}`, borderRadius: 11, fontSize: 13, fontWeight: 700, color: dark ? "#8B8BA8" : "#475569", cursor: "pointer", fontFamily: "inherit" }}>
          <ChevronLeft style={{ width: 16, height: 16 }} /> {step === 1 ? "Exit" : "Back"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEPS.map(s => (
            <div key={s.id} style={{ width: step === s.id ? 22 : 7, height: 7, borderRadius: 999, background: step >= s.id ? (dark ? "#9B59E6" : "#6C3BFF") : (dark ? "#2A2A45" : "#E2E8F0"), transition: "all .2s" }} />
          ))}
        </div>
        {step < TOTAL ? (
          <button onClick={goNext} disabled={!canNext}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 24px", background: canNext ? (dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)") : (dark ? "#2A2A45" : "#E2E8F0"), border: "none", borderRadius: 11, fontSize: 13, fontWeight: 700, color: canNext ? "#fff" : (dark ? "#8B8BA8" : "#94A3B8"), cursor: canNext ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: canNext ? "0 4px 14px rgba(108,59,255,.3)" : "none" }}>
            Continue <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        ) : (
          <button onClick={() => { if (studentCount === 0) { toast.error("Select at least one student"); return; } setShowGenerate(true); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 24px", background: dark ? "linear-gradient(135deg,#9B59E6,#B87CE8)" : "linear-gradient(135deg,#6C3BFF,#8B5CF6)", border: "none", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(108,59,255,.3)" }}>
            <FileCheck style={{ width: 15, height: 15 }} /> Generate ({studentCount})
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        select { font-family: inherit; }
      `}</style>
    </div>
  );
}
