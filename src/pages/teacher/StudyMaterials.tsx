import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useAuth } from "@/hooks/useAuth";
import { useGrades } from "@/contexts/CurriculumContext";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FolderOpen, Folder, FileText, ChevronRight, ChevronDown, Search, Plus, X,
  Upload, Trash2, BookOpen, Calculator, FlaskConical, Globe2, Monitor,
  Languages, BookText, Layers, GraduationCap, FolderPlus, Play, Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Material {
  id: string; title: string; subject: string; type: string; link: string;
  grade: string; section: string; chapter: string; lesson?: string;
  teacher: string; createdAt: string; uid?: string;
}
type Screen =
  | { view: "folders" }
  | { view: "subject"; grade: string; section: string; subject: string; subjectIdx: number };

// ── Category config ───────────────────────────────────────────────────────────
const CH_SUGGESTIONS = Array.from({ length: 20 }, (_, i) => `Chapter ${i + 1}`);
const LS_SUGGESTIONS = Array.from({ length: 20 }, (_, i) => `Lesson ${i + 1}`);
const CAT_META: Record<string, { emoji: string; color: string; bg: string }> = {
  "PDF Notes":            { emoji: "📄", color: "#DC2626", bg: "#FEE2E2" },
  "PPT Presentation":     { emoji: "📊", color: "#EA580C", bg: "#FFEDD5" },
  "Worksheet":            { emoji: "📋", color: "#0891B2", bg: "#CFFAFE" },
  "Video Link":           { emoji: "🎬", color: "#16A34A", bg: "#DCFCE7" },
  "Assignment File":      { emoji: "📝", color: "#7C3AED", bg: "#EDE9FE" },
  "Additional Resources": { emoji: "🔗", color: "#9333EA", bg: "#F5F3FF" },
};
function catMeta(t: string) {
  if (CAT_META[t]) return CAT_META[t];
  switch (t) {
    case "PDF":          return { emoji: "📄", color: "#DC2626", bg: "#FEE2E2" };
    case "Document":     return { emoji: "📝", color: "#0891B2", bg: "#CFFAFE" };
    case "Presentation": return { emoji: "📊", color: "#EA580C", bg: "#FFEDD5" };
    case "Video":        return { emoji: "🎬", color: "#16A34A", bg: "#DCFCE7" };
    case "Link":         return { emoji: "🔗", color: "#9333EA", bg: "#F5F3FF" };
    default:             return { emoji: "📎", color: "#6B7280", bg: "#F3F4F6" };
  }
}

// Chapter gradient palette
const CH_COLORS = [
  "linear-gradient(135deg,#7C3AED,#A855F7)",
  "linear-gradient(135deg,#0EA5E9,#6366F1)",
  "linear-gradient(135deg,#F59E0B,#EF4444)",
  "linear-gradient(135deg,#10B981,#0891B2)",
  "linear-gradient(135deg,#EC4899,#A855F7)",
];

// ── Subject icon/color ────────────────────────────────────────────────────────
const SUBJ_META: Record<string, { icon: typeof BookOpen; hex: string; light: string }> = {
  mathematics:        { icon: Calculator,   hex: "#2563EB", light: "#DBEAFE" },
  maths:              { icon: Calculator,   hex: "#2563EB", light: "#DBEAFE" },
  science:            { icon: FlaskConical, hex: "#16A34A", light: "#DCFCE7" },
  chemistry:          { icon: FlaskConical, hex: "#F59E0B", light: "#FEF3C7" },
  biology:            { icon: FlaskConical, hex: "#16A34A", light: "#DCFCE7" },
  physics:            { icon: FlaskConical, hex: "#0EA5E9", light: "#E0F2FE" },
  english:            { icon: BookText,     hex: "#7C3AED", light: "#F1ECFF" },
  "computer science": { icon: Monitor,      hex: "#8B5CF6", light: "#EDE9FE" },
  computer:           { icon: Monitor,      hex: "#8B5CF6", light: "#EDE9FE" },
  arabic:             { icon: Languages,    hex: "#EC4899", light: "#FCE7F3" },
  urdu:               { icon: Languages,    hex: "#EF4444", light: "#FEE2E2" },
  "islamic studies":  { icon: BookOpen,     hex: "#0EA5E9", light: "#E0F2FE" },
  "social studies":   { icon: Globe2,       hex: "#F59E0B", light: "#FEF3C7" },
  history:            { icon: Globe2,       hex: "#F97316", light: "#FFEDD5" },
  geography:          { icon: Globe2,       hex: "#14B8A6", light: "#CCFBF1" },
  music:              { icon: Layers,       hex: "#EC4899", light: "#FCE7F3" },
  art:                { icon: Layers,       hex: "#F97316", light: "#FFEDD5" },
};
const HEX_FB = ["#7C3AED","#2563EB","#16A34A","#F59E0B","#EC4899","#14B8A6","#EF4444","#0EA5E9"];
function subjMeta(name: string, idx = 0) {
  const k = name.trim().toLowerCase();
  if (SUBJ_META[k]) return SUBJ_META[k];
  const hex = HEX_FB[idx % HEX_FB.length];
  return { icon: BookOpen, hex, light: hex + "20" };
}

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso: string) {
  const d = new Date(iso); if (isNaN(d.getTime())) return iso || "—";
  return `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`;
}

function normGrade(g: string) { return String(g ?? "").replace(/grade\s*/i,"").trim().toLowerCase(); }

// ─────────────────────────────────────────────────────────────────────────────
export default function StudyMaterials() {
  const { user } = useAuth();
  const { assignments: mySubjects } = useMySubjects();
  const grades = useGrades();
  const teacherName = (user as any)?.displayName || (user as any)?.name || "Teacher";

  function gradeRank(g: string) { const i = grades.indexOf(g); return i < 0 ? 999 : i; }

  // DB materials
  const [items, setItems] = useState<Material[]>([]);
  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("StudyMaterial", user.uid, (data: any[]) => {
      setItems((data || []).sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime()));
    });
    return () => unsub();
  }, [user]);

  // Navigation
  const [screen, setScreen] = useState<Screen>({ view: "folders" });
  const [sidebarQ, setSidebarQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // In-memory chapter/lesson state
  const [draftChapters, setDraftChapters] = useState<Record<string, string[]>>({});
  const [draftLessons, setDraftLessons]   = useState<Record<string, string[]>>({});
  const [closedCh, setClosedCh] = useState<Set<string>>(new Set());
  const [closedLs, setClosedLs] = useState<Set<string>>(new Set());

  // Modals
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [lessonModal, setLessonModal]  = useState<{ open: boolean; chapter: string }>({ open: false, chapter: "" });
  const [modalInput, setModalInput]    = useState("");

  // Upload form
  const [upCh, setUpCh]         = useState("");
  const [upLs, setUpLs]         = useState("");
  const [upType, setUpType]     = useState("PDF Notes");
  const [upTitle, setUpTitle]   = useState("");
  const [upLink, setUpLink]     = useState("");
  const [upFile, setUpFile]     = useState<File | null>(null);
  const [upPct, setUpPct]       = useState(0);
  const [uploading, setUploading] = useState(false);

  const [studentCount, setStudentCount] = useState(0);
  const dropRef     = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOver    = useRef(false);

  // Student count for selected grade+section
  useEffect(() => {
    if (screen.view !== "subject") return;
    const { grade, section } = screen;
    fetch("/api/data/students")
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const tg = normGrade(grade), ts = section.trim().toUpperCase();
        setStudentCount(rows.filter(s => {
          const sg = normGrade(s.grade || s.currentGrade || "");
          const ss = (s.section || s.currentSection || "").trim().toUpperCase();
          return sg === tg && ss === ts;
        }).length);
      }).catch(() => {});
  }, [screen.view === "subject" ? screen.grade + screen.section : ""]);

  // Reset collapse when switching subject
  const screenKey = screen.view === "subject"
    ? `${screen.grade}::${screen.section}::${screen.subject}` : "";
  useEffect(() => { setClosedCh(new Set()); setClosedLs(new Set()); }, [screenKey]);

  // ── Tree ─────────────────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    const map: Record<string, Record<string, { subject: string; idx: number }[]>> = {};
    let i = 0;
    for (const a of mySubjects) {
      if (!map[a.grade]) map[a.grade] = {};
      if (!map[a.grade][a.section]) map[a.grade][a.section] = [];
      if (!map[a.grade][a.section].some(x => x.subject === a.subject))
        map[a.grade][a.section].push({ subject: a.subject, idx: i++ });
    }
    return map;
  }, [mySubjects]);

  const sortedGrades = useMemo(
    () => Object.keys(tree).sort((a,b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b)),
    [tree, grades]
  );

  // ── Data helpers ─────────────────────────────────────────────────────────────
  function matsFor(grade: string, section: string, subject: string) {
    return items.filter(m =>
      m.subject === subject && canonGrade(m.grade) === canonGrade(grade) &&
      canonSection(m.section) === canonSection(section)
    );
  }
  function chaptersFor(grade: string, section: string, subject: string) {
    const key = `${grade}__${section}__${subject}`;
    const fromMats = matsFor(grade, section, subject).map(m => m.chapter || "General");
    return [...new Set([...(draftChapters[key]||[]), ...fromMats])].filter(Boolean);
  }
  function lessonsFor(grade: string, section: string, subject: string, ch: string) {
    const key = `${grade}__${section}__${subject}__${ch}`;
    const fromMats = matsFor(grade, section, subject)
      .filter(m => (m.chapter||"General") === ch).map(m => m.lesson||"").filter(Boolean);
    return [...new Set([...(draftLessons[key]||[]), ...fromMats])];
  }
  function matsLesson(grade: string, section: string, subject: string, ch: string, ls: string) {
    return matsFor(grade, section, subject)
      .filter(m => (m.chapter||"General") === ch && (m.lesson||"") === ls);
  }
  function matsNoLesson(grade: string, section: string, subject: string, ch: string) {
    return matsFor(grade, section, subject)
      .filter(m => (m.chapter||"General") === ch && !m.lesson);
  }
  function matCount(grade: string, section: string, subject?: string) {
    return items.filter(m =>
      canonGrade(m.grade) === canonGrade(grade) && canonSection(m.section) === canonSection(section) &&
      (subject ? m.subject === subject : true)
    ).length;
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  function openUploadFor(ch = "", ls = "") {
    setUpCh(ch); setUpLs(ls); setUpType("PDF Notes");
    setUpTitle(""); setUpLink(""); setUpFile(null); setUpPct(0); setUploading(false);
    setUploadOpen(true);
  }

  async function submitUpload() {
    if (screen.view !== "subject") return;
    const { grade, section, subject } = screen;
    if (!upTitle.trim()) { toast.error("Title is required"); return; }
    const chapter = upCh.trim() || "General";
    setUploading(true); setUpPct(0);
    await new Promise<void>(res => {
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 22 + 7;
        if (p >= 100) { p = 100; clearInterval(iv); res(); }
        setUpPct(Math.floor(p));
      }, 90);
    });
    const stamp = new Date().toISOString();
    const mat: Material = {
      id: `MAT-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      title: upTitle.trim(), subject, type: upType,
      link: upType === "Video Link" ? upLink.trim() : (upFile?.name || upLink.trim()),
      grade, section, chapter,
      lesson: upLs.trim() || undefined,
      teacher: teacherName, createdAt: stamp,
    };
    try {
      await smartDb.create("StudyMaterial", { ...mat, uid: user!.uid }, mat.id);
      await fetch("/api/data/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `ntf-mat-${Date.now()}`, type: "create", entity: "StudyMaterial",
          category: "general", audienceRole: "student",
          recipientGrade: grade, recipientSection: section,
          title: `New ${subject} material uploaded`,
          message: `${teacherName} uploaded "${mat.title}"${upLs ? ` in ${upLs}` : ""} for ${subject} (${grade} · Section ${section}).`,
          time: stamp, uid: "teacher",
        }),
      }).catch(() => {});
      toast.success(`"${mat.title}" published — students notified`);
      setUploadOpen(false);
    } catch { toast.error("Failed to upload"); setUploading(false); }
  }

  async function removeItem(id: string, title: string) {
    try { await smartDb.delete("StudyMaterial", id); toast.success(`"${title}" removed`); }
    catch { toast.error("Failed"); }
  }

  function addLesson(chapter: string) {
    if (screen.view !== "subject") return;
    const { grade, section, subject } = screen;
    const t = modalInput.trim(); if (!t) { toast.error("Enter a lesson name"); return; }
    const key = `${grade}__${section}__${subject}__${chapter}`;
    setDraftLessons(prev => {
      const ex = prev[key] || [];
      return ex.includes(t) ? prev : { ...prev, [key]: [...ex, t] };
    });
    setModalInput(""); setLessonModal({ open: false, chapter: "" });
    toast.success(`Lesson "${t}" created`);
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  const Sidebar = (
    <aside className="w-[220px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
      <div className="px-3.5 pt-4 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-[.07em] text-slate-400 mb-2.5">My Subjects</p>
        <div className="flex items-center gap-1.5 bg-[#F4F4F8] rounded-lg px-2.5 py-1.5">
          <Search className="h-3 w-3 text-slate-400 flex-shrink-0" />
          <input value={sidebarQ} onChange={e => setSidebarQ(e.target.value)}
            placeholder="Search subjects…"
            className="flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2">
        {sortedGrades.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No subjects assigned yet.</p>
        ) : sortedGrades
          .filter(g => !sidebarQ ||
            g.toLowerCase().includes(sidebarQ.toLowerCase()) ||
            Object.values(tree[g]).flat().some(s => s.subject.toLowerCase().includes(sidebarQ.toLowerCase()))
          )
          .map(grade => {
            const sections = Object.keys(tree[grade]).sort();
            const gk = grade; const gOpen = !collapsed.has(gk);
            return (
              <div key={grade}>
                <button
                  onClick={() => setCollapsed(p => { const n = new Set(p); n.has(gk)?n.delete(gk):n.add(gk); return n; })}
                  className="w-full flex items-center gap-1.5 px-2 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700">
                  {gOpen ? <ChevronDown className="h-2.5 w-2.5 text-slate-400" /> : <ChevronRight className="h-2.5 w-2.5 text-slate-400" />}
                  <span className="w-[22px] h-[22px] rounded-md bg-violet-100 text-violet-700 font-black text-[10px] flex items-center justify-center flex-shrink-0">
                    {grade.replace(/\D/g,"").slice(0,2)||grade.slice(0,2).toUpperCase()}
                  </span>
                  <span className="truncate">{grade}</span>
                </button>

                {gOpen && sections.map(sec => {
                  const sk = `${grade}-${sec}`; const sOpen = !collapsed.has(sk);
                  const subjects = tree[grade][sec];
                  return (
                    <div key={sec} className="ml-3.5">
                      <button
                        onClick={() => setCollapsed(p => { const n = new Set(p); n.has(sk)?n.delete(sk):n.add(sk); return n; })}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600">
                        {sOpen ? <ChevronDown className="h-2.5 w-2.5 text-slate-400" /> : <ChevronRight className="h-2.5 w-2.5 text-slate-400" />}
                        <span className="w-5 h-5 rounded bg-green-100 text-green-700 font-black text-[9px] flex items-center justify-center flex-shrink-0">{sec}</span>
                        Section {sec}
                      </button>

                      {sOpen && subjects.map(({ subject, idx }) => {
                        const meta = subjMeta(subject, idx);
                        const Icon = meta.icon;
                        const active = screen.view === "subject" &&
                          screen.grade === grade && screen.section === sec && screen.subject === subject;
                        const cnt = matsFor(grade, sec, subject).length;
                        return (
                          <button key={subject}
                            onClick={() => setScreen({ view: "subject", grade, section: sec, subject, subjectIdx: idx })}
                            className={cn(
                              "w-full flex items-center gap-2 pl-[26px] pr-2 py-2 rounded-lg text-xs transition-colors",
                              active ? "bg-violet-50 text-violet-700 font-bold border-r-2 border-purple-600" : "text-slate-600 hover:bg-slate-50"
                            )}>
                            <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: meta.light }}>
                              <Icon className="h-2.5 w-2.5" style={{ color: meta.hex }} />
                            </span>
                            <span className="truncate flex-1 text-left">{subject}</span>
                            {cnt > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600 text-white font-bold flex-shrink-0">{cnt}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })
        }
      </div>
    </aside>
  );

  // ── Folder Overview ───────────────────────────────────────────────────────────
  const FolderOverview = () => (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Folders",   value: mySubjects.length },
          { label: "Materials", value: items.length },
          { label: "Chapters",  value: new Set(items.map(m => `${m.subject}::${m.chapter}`)).size },
          { label: "Subjects",  value: new Set(mySubjects.map(a => a.subject)).size },
        ].map((k, i) => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{k.label}</p>
            <p className={cn("text-3xl font-black", i === 1 ? "text-purple-600" : "text-slate-900")}>{k.value}</p>
          </div>
        ))}
      </div>

      {sortedGrades.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl py-20 text-center">
          <FolderOpen className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-slate-700">No subjects assigned yet</p>
          <p className="text-sm text-slate-400 mt-1">When admin assigns you a subject, a folder appears here automatically.</p>
        </div>
      ) : sortedGrades.map(grade => (
        <div key={grade} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-bold text-slate-700">{grade}</h2>
            <span className="h-px flex-1 bg-slate-100" />
          </div>
          {Object.keys(tree[grade]).sort().map(sec => {
            const subjects = tree[grade][sec];
            return (
              <div key={sec} className="mb-5">
                <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-slate-100 text-slate-500 font-bold text-[10px] flex items-center justify-center">{sec}</span>
                  Section {sec}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {subjects.map(({ subject, idx }) => {
                    const meta = subjMeta(subject, idx); const Icon = meta.icon;
                    const cnt = matsFor(grade, sec, subject).length;
                    const chCnt = chaptersFor(grade, sec, subject).length;
                    return (
                      <button key={subject}
                        onClick={() => setScreen({ view: "subject", grade, section: sec, subject, subjectIdx: idx })}
                        className="text-left bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: meta.light }}>
                            <Icon className="h-5 w-5" style={{ color: meta.hex }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-800 text-sm truncate group-hover:text-violet-700">{subject}</p>
                            <p className="text-[11px] text-slate-400">{grade} · Section {sec}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500" />
                        </div>
                        <div className="flex gap-3 text-[11px] text-slate-500">
                          <span>{cnt} material{cnt!==1?"s":""}</span>
                          <span>{chCnt} chapter{chCnt!==1?"s":""}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  // ── Subject View ──────────────────────────────────────────────────────────────
  const SubjectView = () => {
    if (screen.view !== "subject") return null;
    const { grade, section, subject, subjectIdx } = screen;
    const chapters = chaptersFor(grade, section, subject);
    const mats     = matsFor(grade, section, subject);
    const totalLessons = chapters.reduce((s, ch) => s + lessonsFor(grade, section, subject, ch).length, 0);

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Topbar / breadcrumb */}
        <div className="bg-white border-b border-slate-200 px-6 h-[54px] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-slate-400">
            <button onClick={() => setScreen({ view: "folders" })} className="hover:text-purple-600 font-medium transition-colors">Study Materials</button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-500">{grade} · Sec {section}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-900 font-semibold">{subject}</span>
          </div>
          <button onClick={() => openUploadFor()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl text-[13px] font-bold shadow-[0_3px_12px_rgba(124,58,237,.35)] transition-colors">
            <Upload className="h-3.5 w-3.5" /> Upload Material
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Chapters",  value: chapters.length },
              { label: "Lessons",   value: totalLessons },
              { label: "Materials", value: mats.length, purple: true },
              { label: "Students",  value: studentCount },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-slate-400 mb-1.5">{s.label}</p>
                <p className={cn("text-[26px] font-black", s.purple ? "text-[#7C3AED]" : "text-slate-900")}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Chapters */}
          <div className="flex flex-col gap-3.5">
            {chapters.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl py-14 text-center">
                <BookText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-700">No chapters yet</p>
                <p className="text-sm text-slate-400 mt-1">Create a chapter or upload a material to get started.</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button onClick={() => openUploadFor()}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-violet-200 text-xs font-semibold text-purple-600 hover:bg-violet-50">
                    <FolderPlus className="h-3.5 w-3.5" /> New Chapter
                  </button>
                  <button onClick={() => openUploadFor()}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9]">
                    <Upload className="h-3.5 w-3.5" /> Upload Material
                  </button>
                </div>
              </div>
            ) : chapters.map((ch, chIdx) => {
              const chMats  = mats.filter(m => (m.chapter||"General") === ch);
              const lessons = lessonsFor(grade, section, subject, ch);
              const chKey   = `${grade}::${section}::${subject}::${ch}`;
              const chOpen  = !closedCh.has(chKey);

              return (
                <div key={ch} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Chapter header */}
                  <div
                    className="flex items-center gap-3 px-5 py-[15px] cursor-pointer bg-[#FAFAFA] hover:bg-[#F4F4F8] transition-colors"
                    onClick={() => setClosedCh(p => { const n = new Set(p); n.has(chKey)?n.delete(chKey):n.add(chKey); return n; })}
                  >
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                      style={{ background: CH_COLORS[chIdx % CH_COLORS.length] }}>
                      <BookOpen className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-black text-slate-900">{ch}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {lessons.length} lesson{lessons.length!==1?"s":""} · {chMats.length} material{chMats.length!==1?"s":""}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setModalInput(""); setLessonModal({ open: true, chapter: ch }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-semibold transition-colors">
                      <Plus className="h-3 w-3" /> Add Lesson
                    </button>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ml-1 flex-shrink-0", chOpen && "rotate-180")} />
                  </div>

                  {/* Chapter body */}
                  {chOpen && (
                    <div className="border-t border-slate-100 p-3 flex flex-col gap-2.5">
                      {lessons.length === 0 && matsNoLesson(grade, section, subject, ch).length === 0 ? (
                        <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                          <span className="text-sm text-slate-400">No lessons yet — </span>
                          <button onClick={() => { setModalInput(""); setLessonModal({ open: true, chapter: ch }); }}
                            className="text-sm text-[#7C3AED] font-semibold hover:underline">
                            add the first lesson
                          </button>
                        </div>
                      ) : (
                        <>
                          {lessons.map(ls => {
                            const lsMats = matsLesson(grade, section, subject, ch, ls);
                            const lsKey  = `${chKey}::${ls}`;
                            const lsOpen = !closedLs.has(lsKey);
                            return (
                              <div key={ls} className="border border-slate-200 rounded-xl overflow-hidden">
                                {/* Lesson header */}
                                <div
                                  className="flex items-center gap-2.5 px-3.5 py-[11px] cursor-pointer bg-white hover:bg-[#FAFAFA] transition-colors"
                                  onClick={() => setClosedLs(p => { const n = new Set(p); n.has(lsKey)?n.delete(lsKey):n.add(lsKey); return n; })}
                                >
                                  <div className="w-7 h-7 bg-[#F4F4F8] rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13.5px] font-bold text-slate-900">{ls}</p>
                                    <p className="text-[11.5px] text-slate-400">{lsMats.length} material{lsMats.length!==1?"s":""}</p>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); openUploadFor(ch, ls); }}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-[#F4F4F8] hover:bg-violet-100 hover:text-violet-700 text-slate-500 rounded-lg text-xs font-semibold transition-colors">
                                    <Plus className="h-3 w-3" /> Add Material
                                  </button>
                                  <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ml-1 flex-shrink-0", lsOpen && "rotate-180")} />
                                </div>

                                {/* Lesson body */}
                                {lsOpen && (
                                  <div className="border-t border-[#F3F4F6] p-2 flex flex-col gap-1.5">
                                    {lsMats.length === 0 ? (
                                      <div className="py-[18px] text-center">
                                        <span className="text-[13px] text-slate-400">No materials yet — </span>
                                        <button onClick={() => openUploadFor(ch, ls)}
                                          className="text-[13px] text-[#7C3AED] font-semibold hover:underline">add one</button>
                                      </div>
                                    ) : lsMats.map(m => {
                                      const cm = catMeta(m.type);
                                      return (
                                        <div key={m.id} className="flex items-center gap-2.5 p-[9px] rounded-[9px] bg-[#FAFAFA] hover:bg-[#F4F4F8] transition-colors">
                                          <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-base"
                                            style={{ background: cm.bg }}>{cm.emoji}</div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-slate-900 truncate">{m.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="text-[11px] font-bold px-[7px] py-[2px] rounded-[5px]"
                                                style={{ color: cm.color, background: cm.bg }}>{m.type}</span>
                                              <span className="text-[11.5px] text-slate-400">{fmtDate(m.createdAt)}</span>
                                            </div>
                                          </div>
                                          {(m.type === "Video Link" || m.type === "Video") && m.link?.startsWith("http") && (
                                            <a href={m.link} target="_blank" rel="noreferrer"
                                              onClick={e => e.stopPropagation()}
                                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#DCFCE7] text-[#16A34A] rounded-lg text-xs font-semibold">
                                              <Play className="h-3 w-3" /> Open
                                            </a>
                                          )}
                                          <button onClick={() => removeItem(m.id, m.title)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Legacy materials with no lesson */}
                          {matsNoLesson(grade, section, subject, ch).map(m => {
                            const cm = catMeta(m.type);
                            return (
                              <div key={m.id} className="flex items-center gap-2.5 p-[9px] rounded-[9px] bg-[#FAFAFA] hover:bg-[#F4F4F8] border border-slate-200 transition-colors">
                                <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-base"
                                  style={{ background: cm.bg }}>{cm.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-semibold text-slate-900 truncate">{m.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] font-bold px-[7px] py-[2px] rounded-[5px]"
                                      style={{ color: cm.color, background: cm.bg }}>{m.type}</span>
                                    <span className="text-[11.5px] text-slate-400">{fmtDate(m.createdAt)}</span>
                                  </div>
                                </div>
                                <button onClick={() => removeItem(m.id, m.title)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Chapter → opens upload form so teacher fills chapter + material together */}
            <button
              onClick={() => openUploadFor()}
              className="w-full flex items-center justify-center gap-2 py-[13px] border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 hover:border-[#7C3AED] hover:text-[#7C3AED] hover:bg-[#FAFAFE] font-semibold text-[13.5px] transition-colors">
              <Plus className="h-4 w-4" /> Add Chapter
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  const activeSubj = screen.view === "subject" ? screen : null;

  return (
    <DashboardLayout>
      <div className="flex" style={{ height: "calc(100vh - 64px)" }}>
        {Sidebar}

        <div className="flex-1 flex flex-col min-h-0 bg-[#F4F4F8]">
          {screen.view === "folders" ? (
            <>
              <div className="bg-white border-b border-slate-200 px-6 h-[54px] flex items-center">
                <span className="text-sm font-semibold text-slate-900">Study Materials</span>
              </div>
              <FolderOverview />
            </>
          ) : (
            <SubjectView />
          )}
        </div>
      </div>

      {/* ── Upload Modal ────────────────────────────────────────────────────────── */}
      {uploadOpen && activeSubj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          style={{ animation: "overlayIn .2s ease" }}
          onClick={() => !uploading && setUploadOpen(false)}>
          <div className="bg-white rounded-[22px] w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-7 shadow-[0_32px_72px_rgba(0,0,0,.22)]"
            style={{ animation: "modalIn .25s ease" }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-start justify-between mb-[22px]">
              <div>
                <h2 className="text-[18px] font-black text-slate-900">Upload Material</h2>
                <p className="text-[13px] text-slate-400 mt-0.5">Students see this instantly in their portal</p>
              </div>
              <button onClick={() => !uploading && setUploadOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[9px] bg-[#F4F4F8] hover:bg-slate-200 transition-colors">
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>

            {/* Chapter + Lesson */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Chapter</label>
                <input list="m-ch-list" value={upCh}
                  onChange={e => { setUpCh(e.target.value); setUpLs(""); }}
                  placeholder="Pick or type new…"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] text-slate-900 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white" />
                <datalist id="m-ch-list">
                  {[...CH_SUGGESTIONS, ...chaptersFor(activeSubj.grade, activeSubj.section, activeSubj.subject)
                    .filter(c => !CH_SUGGESTIONS.includes(c))].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Lesson</label>
                <input list="m-ls-list" value={upLs} onChange={e => setUpLs(e.target.value)}
                  placeholder="Pick or type new…"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] text-slate-900 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white" />
                <datalist id="m-ls-list">
                  {[...LS_SUGGESTIONS, ...(upCh ? lessonsFor(activeSubj.grade, activeSubj.section, activeSubj.subject, upCh)
                    .filter(l => !LS_SUGGESTIONS.includes(l)) : [])].map(l => <option key={l} value={l} />)}
                </datalist>
              </div>
            </div>

            {/* Material Name */}
            <div className="mb-4">
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Material Name</label>
              <input value={upTitle} onChange={e => setUpTitle(e.target.value)}
                placeholder="e.g. Linear Equations Notes"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] text-slate-900 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100" />
            </div>

            {/* File area */}
            {upType === "Video Link" ? (
              <div className="mb-4">
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Video URL</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-[#7C3AED]">
                  <Link2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <input value={upLink} onChange={e => setUpLink(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 text-[13.5px] text-slate-900 outline-none bg-transparent" />
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.png,.jpg" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setUpFile(f); if (!upTitle) setUpTitle(f.name.replace(/\.[^.]+$/,"")); }
                  }} />
                <div ref={dropRef}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); if (!dragOver.current) { dragOver.current=true; dropRef.current?.classList.add("border-[#7C3AED]","bg-[#F5F3FF]"); }}}
                  onDragLeave={() => { dragOver.current=false; dropRef.current?.classList.remove("border-[#7C3AED]","bg-[#F5F3FF]"); }}
                  onDrop={e => {
                    e.preventDefault(); dragOver.current=false;
                    dropRef.current?.classList.remove("border-[#7C3AED]","bg-[#F5F3FF]");
                    const f = e.dataTransfer.files[0];
                    if (f) { setUpFile(f); if (!upTitle) setUpTitle(f.name.replace(/\.[^.]+$/,"")); }
                  }}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors">
                  {upFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-3xl">📄</span>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-900">{upFile.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{(upFile.size/1024).toFixed(0)} KB · Ready</p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-green-500 ml-2" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl mb-2">📤</div>
                      <p className="text-sm font-bold text-slate-800">Drop file here or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">PDF · DOCX · PPTX · MP4 · PNG</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Progress bar */}
            {uploading && (
              <div className="mb-4">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-slate-900">Uploading…</span>
                  <span className="text-[13px] font-bold text-[#7C3AED]">{upPct}%</span>
                </div>
                <div className="h-[7px] bg-[#EDE9FE] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-100"
                    style={{ width: `${upPct}%`, background: "linear-gradient(90deg,#7C3AED,#A855F7)" }} />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2.5">
              <button onClick={() => !uploading && setUploadOpen(false)} disabled={uploading}
                className="flex-1 h-11 rounded-xl bg-[#F4F4F8] hover:bg-slate-200 text-slate-600 font-semibold text-sm transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitUpload} disabled={uploading}
                className="flex-[2] h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70">
                {uploading ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5" /> Upload Now</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Lesson Modal ───────────────────────────────────────────────────── */}
      {lessonModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLessonModal({ open: false, chapter: "" })}>
          <div className="bg-white rounded-[22px] w-full max-w-[420px] p-7 shadow-[0_32px_72px_rgba(0,0,0,.22)]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-[22px]">
              <div>
                <h2 className="text-[17px] font-black text-slate-900">New Lesson</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adding to: <strong className="text-[#7C3AED]">{lessonModal.chapter}</strong>
                </p>
              </div>
              <button onClick={() => setLessonModal({ open: false, chapter: "" })}
                className="w-8 h-8 flex items-center justify-center rounded-[9px] bg-[#F4F4F8] hover:bg-slate-200">
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>
            <input value={modalInput} onChange={e => setModalInput(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") addLesson(lessonModal.chapter); }}
              placeholder="e.g. Lesson 2: Solving Equations"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] text-slate-900 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 mb-[18px]" />
            <div className="flex gap-2.5">
              <button onClick={() => setLessonModal({ open: false, chapter: "" })}
                className="flex-1 h-11 rounded-xl bg-[#F4F4F8] hover:bg-slate-200 text-slate-600 font-semibold text-sm">Cancel</button>
              <button onClick={() => addLesson(lessonModal.chapter)}
                className="flex-[2] h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm flex items-center justify-center gap-2">
                <Plus className="h-3.5 w-3.5" /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes overlayIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalIn { from { opacity:0; transform:scale(.96) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
    </DashboardLayout>
  );
}
