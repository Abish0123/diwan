import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FolderOpen, Folder, FileText, Film, Link2, FileSpreadsheet,
  ChevronRight, Search, Download, BookOpen, Calculator, FlaskConical,
  Globe2, Monitor, Languages, BookText, Layers, GraduationCap,
  ExternalLink, Upload, Presentation, Library,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RawMaterial {
  id: string; title: string; subject: string; type: string; link?: string;
  grade: string; section: string; chapter?: string; lesson?: string;
  teacher?: string; createdAt?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function typeMeta(type: string) {
  switch (String(type)) {
    case "PDF":          return { icon: FileText,        bg: "bg-rose-100",   text: "text-rose-600",   badge: "bg-rose-50 text-rose-600" };
    case "Document":     return { icon: FileSpreadsheet, bg: "bg-blue-100",   text: "text-purple-600",   badge: "bg-blue-50 text-purple-600" };
    case "Presentation": return { icon: Presentation,   bg: "bg-orange-100", text: "text-orange-600", badge: "bg-orange-50 text-orange-600" };
    case "Video":        return { icon: Film,            bg: "bg-purple-100", text: "text-purple-600", badge: "bg-purple-50 text-purple-600" };
    case "Link":         return { icon: Link2,           bg: "bg-teal-100",   text: "text-teal-600",   badge: "bg-teal-50 text-teal-600" };
    default:             return { icon: FileText,        bg: "bg-slate-100",  text: "text-slate-600",  badge: "bg-slate-50 text-slate-600" };
  }
}

// ── Subject visual identity (mirrors /academics/subjects) ─────────────────────
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
const HEX_FALLBACK = ["#7C3AED","#2563EB","#16A34A","#F59E0B","#EC4899","#14B8A6","#EF4444","#0EA5E9"];
function subjMeta(name: string, idx = 0) {
  const key = name.trim().toLowerCase();
  if (SUBJ_META[key]) return SUBJ_META[key];
  const hex = HEX_FALLBACK[idx % HEX_FALLBACK.length];
  return { icon: BookOpen, hex, light: hex + "20" };
}

const normalizeGrade = (g: any) => String(g ?? "").replace(/grade\s*/i, "").trim().toLowerCase();

type Screen =
  | { view: "subjects" }
  | { view: "chapters"; subject: string; subjectIdx: number }
  | { view: "materials"; subject: string; subjectIdx: number; chapter: string };

export default function StudentStudyMaterials() {
  const { user } = useAuth();

  // Student's own profile (grade + section)
  const [studentProfile, setStudentProfile] = useState<any>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await smartDb.getAll("Student");
        const found = (all || []).find((s: any) =>
          (user.email && s.email === user.email) ||
          (user.displayName && s.name === user.displayName)
        ) ?? null;
        if (!cancelled) setStudentProfile(found);
      } catch { if (!cancelled) setStudentProfile(null); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Grade-wide curriculum subjects from class record
  const [allClasses, setAllClasses] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/data/classes").then(r => r.json()).then(d => setAllClasses(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Per-section subject assignments (most precise source)
  const [assignments, setAssignments] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments").then(r => r.json()).then(d => setAssignments(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // All materials from DB — filtered to this student's grade+section
  const [allMaterials, setAllMaterials] = useState<RawMaterial[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await smartDb.getAll("StudyMaterial");
        const mine = (all || []).filter((m: any) => {
          if (!studentProfile?.grade) return true;
          const gradeMatch = normalizeGrade(m.grade) === normalizeGrade(studentProfile.grade);
          const secMatch = !m.section || m.section.trim().toUpperCase() === (studentProfile.section ?? "").trim().toUpperCase();
          return gradeMatch && secMatch;
        });
        if (!cancelled) setAllMaterials(mine);
      } catch { if (!cancelled) setAllMaterials([]); }
    })();
  }, [studentProfile]);

  // Valid subjects = class curriculum ∪ section-specific assignments (NO fake data)
  const classSubjects = useMemo(() => {
    if (!studentProfile?.grade) return [];
    const normG = normalizeGrade(studentProfile.grade);
    const normS = (studentProfile.section ?? "").trim().toUpperCase();
    const cls = allClasses.find(c =>
      normalizeGrade(c.grade) === normG &&
      (c.section || "A").trim().toUpperCase() === (normS || "A")
    ) || allClasses.find(c => normalizeGrade(c.grade) === normG);
    const curriculum = ((cls?.subjects as string[]) || []).filter(Boolean);
    const assigned = assignments
      .filter(a => normalizeGrade(a.grade) === normG && (a.section ?? "").trim().toUpperCase() === normS)
      .map((a: any) => a.subject).filter(Boolean);
    return [...new Set([...curriculum, ...assigned])];
  }, [allClasses, assignments, studentProfile]);

  const materials = allMaterials || [];

  // Screen
  const [screen, setScreen] = useState<Screen>({ view: "subjects" });
  const [q, setQ] = useState("");

  function materialsForSubject(subject: string) {
    return materials.filter(m => m.subject === subject);
  }
  function chaptersForSubject(subject: string) {
    return [...new Set(materialsForSubject(subject).map(m => m.chapter || "General"))].filter(Boolean);
  }
  function materialsForChapter(subject: string, chapter: string) {
    return materialsForSubject(subject).filter(m => (m.chapter || "General") === chapter);
  }

  const matCountFor = (subject: string) => materialsForSubject(subject).length;

  // KPIs from real data only
  const kpiTotal = materials.length;
  const kpiPdf = materials.filter(m => m.type === "PDF").length;
  const kpiVideo = materials.filter(m => m.type === "Video").length;
  const kpiSubjects = classSubjects.length;

  // ── SUBJECTS VIEW ─────────────────────────────────────────────────────────────
  const SubjectsView = () => {
    const visible = classSubjects.filter(s => !q || s.toLowerCase().includes(q.toLowerCase()));

    return (
      <div className="flex gap-5 p-5 min-h-full">
        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Library className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Study Materials</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Browse your subject folders and access study resources shared by your teachers.
              </p>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Resources", value: kpiTotal, icon: Library,  hex: "#7C3AED", light: "#F1ECFF" },
              { label: "PDF Notes",       value: kpiPdf,   icon: FileText, hex: "#2563EB", light: "#DBEAFE" },
              { label: "Videos",          value: kpiVideo, icon: Film,     hex: "#16A34A", light: "#DCFCE7" },
              { label: "My Subjects",     value: kpiSubjects, icon: GraduationCap, hex: "#F59E0B", light: "#FEF3C7" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: k.light }}>
                  <k.icon className="h-5 w-5" style={{ color: k.hex }} />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 leading-none">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search subjects…"
              className="w-full pl-9 pr-3 h-10 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </div>

          {/* Subject folder grid */}
          {allMaterials === null ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <p className="text-sm text-slate-400">Loading…</p>
            </div>
          ) : classSubjects.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl py-16 text-center flex-1">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-50 flex items-center justify-center">
                <FolderOpen className="h-7 w-7 text-slate-300" />
              </div>
              <p className="font-bold text-slate-700 text-sm">No subjects assigned yet</p>
              <p className="text-xs text-slate-400 mt-1">Your teacher hasn't set up subjects for your class yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((subject, i) => {
                const meta = subjMeta(subject, i);
                const Icon = meta.icon;
                const cnt = matCountFor(subject);
                const chCount = chaptersForSubject(subject).length;
                return (
                  <button key={subject}
                    onClick={() => setScreen({ view: "chapters", subject, subjectIdx: i })}
                    className="text-left bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: meta.light }}>
                        <Icon className="h-6 w-6" style={{ color: meta.hex }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 truncate group-hover:text-violet-700">{subject}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {cnt} material{cnt !== 1 ? "s" : ""} · {chCount} chapter{chCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500 flex-shrink-0" />
                    </div>
                    {/* Chapter preview pills */}
                    {chCount > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {chaptersForSubject(subject).slice(0, 3).map(ch => (
                          <span key={ch} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium truncate max-w-[120px]">{ch}</span>
                        ))}
                        {chCount > 3 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">+{chCount - 3} more</span>}
                      </div>
                    )}
                  </button>
                );
              })}
              {visible.length === 0 && (
                <p className="col-span-full text-center text-slate-400 py-10 text-sm">No subjects match your search.</p>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-4">
          {/* Subjects list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">My Subjects</h3>
              <button onClick={() => setQ("")} className="text-xs text-purple-600 font-medium hover:underline">View All</button>
            </div>
            <div className="flex flex-col gap-0.5">
              {classSubjects.length === 0 && (
                <p className="text-xs text-slate-400 py-2">No subjects assigned to your class yet.</p>
              )}
              {classSubjects.map((s, i) => {
                const meta = subjMeta(s, i);
                const Icon = meta.icon;
                const cnt = matCountFor(s);
                return (
                  <button key={s}
                    onClick={() => setScreen({ view: "chapters", subject: s, subjectIdx: i })}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors text-left">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.light }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: meta.hex }} />
                    </span>
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{s}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{cnt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Request material */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Request Material</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Can't find what you need? Ask your teacher to upload it.
            </p>
            <button onClick={() => toast.info("Material request sent to your teacher!")}
              className="w-full flex items-center justify-center gap-1.5 h-9 text-xs font-semibold text-purple-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
              <Upload className="h-3.5 w-3.5" /> Request Material
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── CHAPTERS VIEW ─────────────────────────────────────────────────────────────
  const ChaptersView = () => {
    if (screen.view !== "chapters") return null;
    const { subject, subjectIdx } = screen;
    const meta = subjMeta(subject, subjectIdx);
    const Icon = meta.icon;
    const chapters = chaptersForSubject(subject);
    const mats = materialsForSubject(subject);

    return (
      <div className="p-5 flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: meta.light }}>
              <Icon className="h-6 w-6" style={{ color: meta.hex }} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{subject}</h1>
              <p className="text-xs text-slate-500">{mats.length} material{mats.length !== 1 ? "s" : ""} · {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {chapters.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl py-14 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-50 flex items-center justify-center">
              <BookText className="h-7 w-7 text-slate-300" />
            </div>
            <p className="font-bold text-slate-700 text-sm">No materials yet</p>
            <p className="text-xs text-slate-400 mt-1">Your teacher hasn't uploaded anything for {subject} yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {chapters.map(ch => {
              const chMats = materialsForChapter(subject, ch);
              const types = [...new Set(chMats.map(m => m.type))];
              return (
                <button key={ch}
                  onClick={() => setScreen({ view: "materials", subject, subjectIdx, chapter: ch })}
                  className="text-left bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Folder className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 text-sm truncate group-hover:text-violet-700">{ch}</p>
                      <p className="text-[11px] text-slate-400">{chMats.length} material{chMats.length !== 1 ? "s" : ""}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500 flex-shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {types.slice(0, 4).map(t => {
                      const tm = typeMeta(t);
                      return <span key={t} className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", tm.badge)}>{t}</span>;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── MATERIALS VIEW ────────────────────────────────────────────────────────────
  const MaterialsView = () => {
    if (screen.view !== "materials") return null;
    const { subject, subjectIdx, chapter } = screen;
    const meta = subjMeta(subject, subjectIdx);
    const Icon = meta.icon;
    const mats = materialsForChapter(subject, chapter);
    const [mq, setMq] = useState("");
    const filtered = mats.filter(m => !mq || m.title.toLowerCase().includes(mq.toLowerCase()));

    // Group by lesson
    const lessonMap: Record<string, RawMaterial[]> = {};
    for (const m of filtered) {
      const l = m.lesson || "";
      if (!lessonMap[l]) lessonMap[l] = [];
      lessonMap[l].push(m);
    }

    return (
      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: meta.light }}>
              <Icon className="h-5 w-5" style={{ color: meta.hex }} />
            </span>
            <div>
              <h1 className="text-base font-bold text-slate-900">{chapter}</h1>
              <p className="text-[11px] text-slate-500">{subject} · {mats.length} material{mats.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={mq} onChange={e => setMq(e.target.value)} placeholder="Search materials…"
              className="pl-8 pr-3 h-9 w-52 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </div>
        </div>

        {/* Materials list */}
        {filtered.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl py-12 text-center">
            <p className="text-sm text-slate-400">No materials found{mq ? " for your search" : ""}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(lessonMap).map(([lesson, lMats]) => (
              <div key={lesson || "no-lesson"}>
                {lesson && (
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">{lesson}</span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                )}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  {lMats.map((m, idx) => {
                    const tm = typeMeta(m.type);
                    const isLink = m.link?.startsWith("http");
                    return (
                      <div key={m.id} className={cn(
                        "flex items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors group",
                        idx < lMats.length - 1 && "border-b border-slate-50"
                      )}>
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", tm.bg)}>
                          <tm.icon className={cn("h-5 w-5", tm.text)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm truncate">{m.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                            {m.teacher && <><span>{m.teacher}</span><span>·</span></>}
                            {fmtDate(m.createdAt || "")}
                          </p>
                        </div>
                        <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0", tm.badge)}>{m.type}</span>
                        <div className="flex items-center gap-1.5">
                          {isLink && (
                            <a href={m.link} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-teal-600 hover:bg-teal-50 hover:border-teal-200 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </a>
                          )}
                          <button onClick={() => toast.success(`Downloading "${m.title}"…`)}
                            className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-purple-600 hover:bg-violet-50 hover:border-violet-200 transition-colors">
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="bg-slate-50 min-h-full flex flex-col">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 px-5 py-3 bg-white border-b border-slate-100">
          <button onClick={() => setScreen({ view: "subjects" })}
            className={cn("hover:text-purple-600 font-medium transition-colors", screen.view === "subjects" && "text-purple-600 font-semibold")}>
            Study Materials
          </button>
          {screen.view !== "subjects" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => screen.view === "materials" && setScreen({ view: "chapters", subject: (screen as any).subject, subjectIdx: (screen as any).subjectIdx })}
                className={cn(
                  "transition-colors",
                  screen.view === "chapters" ? "text-purple-600 font-semibold" : "hover:text-purple-600 text-slate-500"
                )}>
                {(screen as any).subject}
              </button>
            </>
          )}
          {screen.view === "materials" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-purple-600 font-semibold">{(screen as any).chapter}</span>
            </>
          )}
        </div>

        <div className="flex-1">
          {screen.view === "subjects" ? <SubjectsView /> : screen.view === "chapters" ? <ChaptersView /> : <MaterialsView />}
        </div>
      </div>
    </DashboardLayout>
  );
}
