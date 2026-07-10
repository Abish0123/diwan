import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Brain, Users, BookOpen, Eye, MoreVertical,
  Share2, Filter, ChevronDown, ChevronLeft, ArrowRight, Check,
  Library, FolderOpen, GraduationCap, Trash2, LayoutTemplate,
  Search, Image as ImageIcon, X, HelpCircle, Lock, Globe, Sparkles, Clock,
  Lightbulb, Keyboard, Flame, Zap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Switch } from "@/components/ui/switch";
import { useFlashCards } from "@/hooks/useFlashCards";
import { useAuth } from "@/hooks/useAuth";
import type { FlashCardSet, FlashCardStudyOptions } from "@/types/flashcard";

const DEFAULT_STUDY_OPTIONS: FlashCardStudyOptions = {
  shuffle: true, spacedRepetition: true, showHints: true, typeAnswer: false, gamified: true,
};

// ─── Static reference data (colors/labels only — never used as content) ──────
const SUBJECT_COLORS: Record<string, string> = {
  Science: "bg-emerald-50 text-emerald-700", Mathematics: "bg-blue-50 text-blue-700",
  English: "bg-amber-50 text-amber-700", Islamiyat: "bg-teal-50 text-teal-700",
  "Social Studies": "bg-orange-50 text-orange-700", Chemistry: "bg-purple-50 text-purple-700",
  Physics: "bg-indigo-50 text-indigo-700", Urdu: "bg-rose-50 text-rose-700",
  Biology: "bg-green-50 text-green-700", History: "bg-yellow-50 text-yellow-700", French: "bg-pink-50 text-pink-700",
};
const PIE_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#94A3B8", "#14B8A6", "#F43F5E"];

const FC_TABS = [
  { id: "my", label: "My Flashcards", icon: BookOpen },
  { id: "assigned", label: "Assigned Sets", icon: Share2 },
  { id: "library", label: "Library View", icon: Library },
  { id: "subject", label: "By Subject", icon: FolderOpen },
  { id: "class", label: "By Class", icon: GraduationCap },
];

function KPI({ icon: Icon, label, value, color, bg }: { icon: typeof Users; label: string; value: string; color: string; bg: string }) {
  return (
    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bg)}><Icon className={cn("w-5 h-5", color)} /></div>
        <div className="min-w-0"><p className="text-[11px] font-semibold text-gray-500 truncate uppercase">{label}</p><p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function initials(n: string) { return n === "You" ? "ME" : (n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
const AV = ["#6C3BFF", "#10B981", "#F59E0B", "#3B82F6", "#EC4899", "#14B8A6"];

function fmtDate(d: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}

// ─── Set table (reused by My / Assigned) ──────────────────────────────────────
function SetTable({
  sets, variant, onOpen, onStudy, onGame, onEdit, onDelete,
}: {
  sets: FlashCardSet[];
  variant: "my" | "assigned";
  onOpen: (s: FlashCardSet) => void;
  onStudy: (s: FlashCardSet) => void;
  onGame: (s: FlashCardSet) => void;
  onEdit: (s: FlashCardSet) => void;
  onDelete: (s: FlashCardSet) => void;
}) {
  const cols = variant === "assigned"
    ? ["Title", "Subject", "Class", "Cards", "Assigned To", "Last Updated", "Actions"]
    : ["Title", "Subject", "Class", "Cards", "Created By", "Last Updated", "Status", "Actions"];
  return (
    <Card className="border border-gray-100 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {cols.map(h => <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {sets.length === 0 ? (
                <tr><td colSpan={cols.length} className="px-4 py-16 text-center text-gray-400"><Brain className="w-10 h-10 mx-auto mb-2 text-gray-200" /> Nothing here yet.</td></tr>
              ) : sets.map((s, i) => (
                <tr key={s.id} onClick={() => onOpen(s)} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><BookOpen className="w-4 h-4 text-violet-500" /></div>
                      <div><p className="font-semibold text-gray-900">{s.name}</p><p className="text-[11px] text-gray-400">{s.id}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-semibold rounded-md px-2 py-1", SUBJECT_COLORS[s.subject] || "bg-gray-100 text-gray-600")}>{s.subject || "—"}</span></td>
                  <td className="px-4 py-3 text-gray-600">{s.classId || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{s.cards.length}</td>
                  {variant === "my" ? (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: AV[i % AV.length] }}>{initials(s.createdBy)}</span>
                        <span className="text-gray-700">{s.createdBy}</span>
                      </div>
                    </td>
                  ) : (
                    <td className="px-4 py-3 text-gray-600">{s.assignedTo?.length ? `${s.assignedTo.length} target${s.assignedTo.length === 1 ? "" : "s"}` : "—"}</td>
                  )}
                  <td className="px-4 py-3 text-gray-600">{fmtDate(s.lastModified)}</td>
                  {variant === "my" && (
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs font-semibold border", s.assignedTo?.length ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200")}>
                        {s.assignedTo?.length ? "Assigned" : "Private"}
                      </Badge>
                    </td>
                  )}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onStudy(s)}>Study Now</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onGame(s)}><Zap className="w-3.5 h-3.5 mr-1.5 text-violet-500" /> Study Arcade</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(s)}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onDelete(s)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SetCard({ s, onStudy, onGame, onOpen }: { s: FlashCardSet; onStudy: () => void; onGame: () => void; onOpen: () => void }) {
  return (
    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={onOpen}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-violet-500" /></div>
          <span className={cn("text-xs font-semibold rounded-md px-2 py-1", SUBJECT_COLORS[s.subject] || "bg-gray-100 text-gray-600")}>{s.subject || "—"}</span>
        </div>
        <p className="font-bold text-gray-900">{s.name}</p>
        <p className="text-xs text-gray-400 mb-3">{s.classId || "—"} · by {s.createdBy}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
          <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {s.cards.length} cards</span>
          {s.assignedTo?.length ? <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {s.assignedTo.length}</span> : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={e => { e.stopPropagation(); onStudy(); }}>Study</Button>
          <Button size="sm" variant="outline" className="border-violet-200 text-violet-700 hover:bg-violet-50 gap-1" onClick={e => { e.stopPropagation(); onGame(); }}><Zap className="w-3.5 h-3.5" /> Arcade</Button>
        </div>
      </CardContent>
    </Card>
  );
}

const SUBJECT_OPTIONS = ["Science", "Mathematics", "English", "Urdu", "Islamiyat", "Social Studies", "Chemistry", "Physics", "Biology", "History", "French"];
const GRADE_OPTIONS = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

// ─── Component ───────────────────────────────────────────────────────────────
const FlashCards = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sets, assignedSets, addSet, updateSet, deleteSet } = useFlashCards();

  const [tab, setTab] = useState("my");
  const [mode, setMode] = useState<"list" | "create">("list");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("All Subjects");
  const [grade, setGrade] = useState("All Grades");
  const [deleteTarget, setDeleteTarget] = useState<FlashCardSet | null>(null);

  // create/edit wizard
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ title: "", subject: "", grade: "", section: "All Sections", language: "English", description: "", access: "private" as "private" | "students" | "public", tags: ["Key Terms", "Revision", "Exam Prep"], studyOptions: { ...DEFAULT_STUDY_OPTIONS } });
  const [cards, setCards] = useState([{ q: "", a: "" }]);

  const resetWizard = () => {
    setEditingId(null);
    setForm({ title: "", subject: "", grade: "", section: "All Sections", language: "English", description: "", access: "private", tags: [], studyOptions: { ...DEFAULT_STUDY_OPTIONS } });
    setCards([{ q: "", a: "" }]);
    setStep(1);
  };

  const openCreate = () => { resetWizard(); setMode("create"); };

  const openEdit = (s: FlashCardSet) => {
    const [g, sec] = s.classId?.includes(" - ") ? s.classId.split(" - ") : [s.classId || "", "All Sections"];
    setEditingId(s.id);
    setForm({
      title: s.name, subject: s.subject, grade: g, section: sec || "All Sections",
      language: "English", description: "", access: s.assignedTo?.length ? "students" : "private",
      tags: s.tags || [],
      studyOptions: { ...DEFAULT_STUDY_OPTIONS, ...(s.studyOptions || {}) },
    });
    setCards(s.cards.length ? s.cards.map(c => ({ q: c.question, a: c.answer })) : [{ q: "", a: "" }]);
    setStep(1);
    setMode("create");
  };

  const openPractice = (s: FlashCardSet) => navigate(`/academics/flashcards/practice/${s.id}`);
  const openGame = (s: FlashCardSet) => navigate(`/academics/flashcards/game/${s.id}`);

  const handleSave = async (publish: boolean) => {
    if (!form.title.trim()) { toast.error("Set title is required"); return; }
    const classId = form.grade ? `${form.grade} - ${form.section}` : "";
    const builtCards = cards
      .filter(c => c.q.trim() || c.a.trim())
      .map((c, i) => ({
        id: editingId && cards[i] ? `${editingId}-card-${i}` : `card-${Date.now()}-${i}`,
        type: "standard" as const,
        question: c.q,
        answer: c.a,
      }));
    if (builtCards.length === 0) { toast.error("Add at least one flashcard before saving"); return; }

    if (editingId) {
      await updateSet(editingId, {
        name: form.title, subject: form.subject, classId, tags: form.tags,
        cards: builtCards, assignedTo: form.access === "students" ? ["Assigned"] : undefined,
        studyOptions: form.studyOptions,
      });
      toast.success(publish ? "Flashcard set updated" : "Draft saved");
    } else {
      await addSet({
        name: form.title, subject: form.subject, classId, tags: form.tags,
        cards: builtCards, createdBy: user?.displayName || user?.email || "You",
        assignedTo: form.access === "students" ? ["Assigned"] : undefined,
        isAiGenerated: false,
        studyOptions: form.studyOptions,
      });
      toast.success(publish ? "Flashcard set published!" : "Draft saved");
    }
    if (publish) { setMode("list"); resetWizard(); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSet(deleteTarget.id);
    toast.success(`Deleted "${deleteTarget.name}"`);
    setDeleteTarget(null);
  };

  const filterSet = (list: FlashCardSet[]) => list.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (subject !== "All Subjects" && s.subject !== subject) return false;
    if (grade !== "All Grades" && !s.classId?.startsWith(grade)) return false;
    return true;
  });

  const bySubject = useMemo(() => {
    const groups: Record<string, FlashCardSet[]> = {};
    sets.forEach(s => { (groups[s.subject || "Uncategorized"] ||= []).push(s); });
    return groups;
  }, [sets]);
  const byClass = useMemo(() => {
    const groups: Record<string, FlashCardSet[]> = {};
    sets.forEach(s => { (groups[s.classId || "Unassigned"] ||= []).push(s); });
    return Object.entries(groups).sort();
  }, [sets]);
  const subjectDistribution = useMemo(() => {
    return Object.entries(bySubject).map(([name, list], i) => ({
      name, value: list.reduce((a, b) => a + b.cards.length, 0), color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [bySubject]);
  const totalCards = useMemo(() => sets.reduce((a, s) => a + s.cards.length, 0), [sets]);
  const recentlyViewed = useMemo(
    () => [...sets].sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || "")).slice(0, 5),
    [sets]
  );

  // ─── CREATE / EDIT WIZARD ──────────────────────────────────────────────────
  if (mode === "create") {
    const STEPS = ["Set Details", "Add Flashcards", "Set Options", "Review & Publish"];
    return (
      <DashboardLayout>
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => { setMode("list"); resetWizard(); }} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"><ChevronLeft className="w-5 h-5 text-gray-500" /></button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{editingId ? "Edit Flashcard Set" : "Create Flashcard Set"}</h1>
                <p className="text-sm text-gray-500 mt-0.5">Build an engaging flashcard set to help students learn and revise effectively.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-purple-600 font-semibold" onClick={() => handleSave(false)}>Save Draft</Button>
              <Button variant="outline" size="sm" className="border-gray-200" onClick={() => { setMode("list"); resetWizard(); }}>Cancel</Button>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                onClick={() => step < 4 ? setStep(step + 1) : handleSave(true)}>
                {step < 4 ? <>Next: {STEPS[step]} <ArrowRight className="w-3.5 h-3.5" /></> : <>{editingId ? "Save Changes" : "Publish"} <Check className="w-3.5 h-3.5" /></>}
              </Button>
            </div>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-1 flex-wrap">
            {STEPS.map((s, i) => {
              const n = i + 1; const active = n === step; const done = n < step;
              return (
                <button key={s} onClick={() => setStep(n)} className="flex items-center gap-2 px-2 py-1">
                  <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", active ? "bg-purple-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500")}>{done ? <Check className="w-3.5 h-3.5" /> : n}</span>
                  <span className={cn("text-sm font-semibold whitespace-nowrap", active ? "text-purple-600" : "text-gray-400")}>{s}</span>
                  {n < 4 && <span className="w-8 h-px bg-gray-200 mx-1" />}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {/* Form column */}
            <Card className="xl:col-span-2 border border-gray-100 shadow-sm">
              <CardContent className="p-6">
                {step === 1 && (
                  <>
                    <p className="font-bold text-gray-900">1. Set Details</p>
                    <p className="text-xs text-gray-400 mb-5">Provide basic information about your flashcard set.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-1">
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Flashcard Set Title <span className="text-red-500">*</span></label>
                        <input value={form.title} maxLength={100} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Enter a title for your flashcard set"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <p className="text-[10px] text-gray-400 text-right mt-0.5">{form.title.length}/100</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Subject <span className="text-red-500">*</span></label>
                        <Select value={form.subject} onValueChange={v => setForm(f => ({ ...f, subject: v }))}>
                          <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Subject" /></SelectTrigger>
                          <SelectContent>{SUBJECT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Class / Grade <span className="text-red-500">*</span></label>
                        <Select value={form.grade} onValueChange={v => setForm(f => ({ ...f, grade: v }))}>
                          <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Class / Grade" /></SelectTrigger>
                          <SelectContent>{GRADE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Section</label>
                        <Select value={form.section} onValueChange={v => setForm(f => ({ ...f, section: v }))}>
                          <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                          <SelectContent>{["All Sections", "A", "B", "C"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Language</label>
                        <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                          <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                          <SelectContent>{["English", "Arabic", "Urdu", "French"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Description</label>
                        <textarea value={form.description} maxLength={300} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what this flashcard set is about..." rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                        <p className="text-[10px] text-gray-400 text-right mt-0.5">{form.description.length}/300</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Cover Image</label>
                        <button onClick={() => toast.info("Image upload isn't available yet")} className="w-full border-2 border-dashed border-gray-200 rounded-lg p-5 flex flex-col items-center gap-1 hover:border-violet-300 hover:bg-violet-50/30 transition-colors">
                          <ImageIcon className="w-7 h-7 text-violet-400" />
                          <span className="text-xs font-medium text-gray-600">Drag &amp; drop an image here</span>
                          <span className="text-[10px] text-gray-400">or click to browse · 1024x576px (JPG, PNG)</span>
                        </button>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Tags (Optional)</label>
                        <input placeholder="Add tags and press Enter"
                          onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { setForm(f => ({ ...f, tags: [...f.tags, e.currentTarget.value.trim()] })); e.currentTarget.value = ""; } }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.tags.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs font-medium bg-violet-50 text-violet-700 rounded-md px-2 py-1">
                              {t} <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))}><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <label className="text-xs font-semibold text-gray-600 mt-5 mb-2 block">Who can access this set?</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: "private", icon: Lock, title: "Only Me", desc: "Private set" },
                        { id: "students", icon: Users, title: "My Students", desc: "Marked as assigned" },
                        { id: "public", icon: Globe, title: "Public (School Library)", desc: "Visible in Library View" },
                      ].map(o => (
                        <button key={o.id} onClick={() => setForm(f => ({ ...f, access: o.id as typeof form.access }))}
                          className={cn("flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all", form.access === o.id ? "border-violet-500 bg-violet-50/40" : "border-gray-100 hover:border-gray-200")}>
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", form.access === o.id ? "bg-violet-100" : "bg-gray-100")}><o.icon className={cn("w-4 h-4", form.access === o.id ? "text-purple-600" : "text-gray-500")} /></div>
                          <div><p className="text-sm font-semibold text-gray-900">{o.title}</p><p className="text-[11px] text-gray-400">{o.desc}</p></div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-gray-900">2. Add Flashcards</p>
                      <Button size="sm" variant="outline" className="border-gray-200 gap-1.5" onClick={() => setCards(c => [...c, { q: "", a: "" }])}><Plus className="w-3.5 h-3.5" /> Add Card</Button>
                    </div>
                    <p className="text-xs text-gray-400 mb-5">Add question &amp; answer pairs. You have {cards.length} card{cards.length !== 1 ? "s" : ""}.</p>
                    <div className="space-y-4">
                      {cards.map((c, i) => (
                        <div key={i} className="rounded-xl border border-gray-100 p-4">
                          <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-purple-600">Card {i + 1}</span>
                            {cards.length > 1 && <button onClick={() => setCards(cs => cs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div><label className="text-[11px] font-semibold text-gray-500 mb-1 block">Front (Question)</label>
                              <textarea value={c.q} onChange={e => setCards(cs => cs.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} rows={2} placeholder="Enter the question..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" /></div>
                            <div><label className="text-[11px] font-semibold text-gray-500 mb-1 block">Back (Answer)</label>
                              <textarea value={c.a} onChange={e => setCards(cs => cs.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} rows={2} placeholder="Enter the answer..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="font-bold text-gray-900">3. Study &amp; Memory Options</p>
                    <p className="text-xs text-gray-400 mb-5">These power the live practice screen — memory-science techniques that help students actually <span className="font-semibold text-purple-600">remember</span>, not just skim. Students can still toggle them during a session.</p>
                    <div className="space-y-3">
                      {([
                        { key: "shuffle", icon: Sparkles, t: "Shuffle cards", d: "Randomize order each session so students learn the fact, not the position.", tone: "text-purple-600 bg-blue-50" },
                        { key: "spacedRepetition", icon: Brain, t: "Spaced repetition (Leitner)", d: "Cards you miss come back again within the session until they stick. The #1 proven memory technique.", tone: "text-purple-600 bg-violet-50" },
                        { key: "showHints", icon: Lightbulb, t: "Progressive hints", d: "Stuck? Reveal the answer gradually (length → first letters → first word) so recall stays active.", tone: "text-amber-600 bg-amber-50" },
                        { key: "typeAnswer", icon: Keyboard, t: "Type-to-recall", d: "Ask students to type the answer before flipping — active production beats passive reading for retention. Great for formulas.", tone: "text-emerald-600 bg-emerald-50" },
                        { key: "gamified", icon: Flame, t: "XP, streaks & combos", d: "Reward correct streaks with points and combos to keep students motivated and coming back.", tone: "text-rose-600 bg-rose-50" },
                      ] as const).map((o) => (
                        <label key={o.key} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-violet-200 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", o.tone)}><o.icon className="w-4 h-4" /></span>
                            <div className="min-w-0"><p className="text-sm font-semibold text-gray-800">{o.t}</p><p className="text-[11px] text-gray-400">{o.d}</p></div>
                          </div>
                          <Switch
                            checked={form.studyOptions[o.key]}
                            onCheckedChange={(v) => setForm(f => ({ ...f, studyOptions: { ...f.studyOptions, [o.key]: v } }))}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-violet-50/60">
                      <Zap className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-600">Every session also uses <span className="font-semibold">active recall</span> (self-rated confidence), a live <span className="font-semibold">timer</span>, keyboard shortcuts, and rotating <span className="font-semibold">memory-boost tips</span> — all built in.</p>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <p className="font-bold text-gray-900">4. Review &amp; Publish</p>
                    <p className="text-xs text-gray-400 mb-5">Review your flashcard set before publishing.</p>
                    <div className="space-y-3 text-sm">
                      {[
                        ["Title", form.title || "Untitled Set"], ["Subject", form.subject || "—"],
                        ["Class / Grade", `${form.grade || "—"} ${form.section}`], ["Language", form.language],
                        ["Total Cards", String(cards.filter(c => c.q.trim() || c.a.trim()).length)],
                        ["Visibility", form.access === "private" ? "Only Me" : form.access === "students" ? "My Students" : "Public"],
                        ["Tags", form.tags.join(", ") || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between py-2 border-b border-gray-50"><span className="text-gray-500">{k}</span><span className="font-semibold text-gray-900 text-right">{v}</span></div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-emerald-50/60">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-600">Everything looks good! Click <span className="font-semibold">{editingId ? "Save Changes" : "Publish"}</span> to make this set available to students.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Live Preview */}
            <div className="space-y-5">
              <Card className="border border-gray-100 shadow-sm">
                <CardContent className="p-5">
                  <p className="font-bold text-gray-900">Live Preview</p>
                  <p className="text-xs text-gray-400 mb-4">This is how your flashcard set will appear to students.</p>
                  <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-violet-50/50 to-white p-6 text-center">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center mb-4 shadow-lg shadow-violet-200">
                      <HelpCircle className="w-9 h-9 text-white" />
                    </div>
                    <p className="text-lg font-bold text-gray-900">{form.title || "Flashcard Set Title"}</p>
                    <span className="inline-block text-xs font-semibold bg-violet-100 text-violet-700 rounded-md px-2 py-0.5 my-2">{form.subject || "Subject"}</span>
                    <div className="flex items-center justify-center gap-3 text-[11px] text-gray-500 my-2">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {form.grade || "Class / Grade"}</span>
                      <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {form.section}</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {form.language}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{form.description || "This is a brief description of your flashcard set. It helps students understand what they will learn."}</p>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-3"><BookOpen className="w-3.5 h-3.5" /> {cards.filter(c => c.q.trim() || c.a.trim()).length} Cards</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-violet-100 shadow-sm bg-violet-50/40">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-500" /> Tips for a great flashcard set</p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    {["Use a clear and specific title.", "Add a helpful description for better understanding.", "Choose the right subject and class.", "Keep answers short and exam-focused."].map(t => (
                      <li key={t} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> {t}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border border-amber-100 shadow-sm bg-amber-50/50">
                <CardContent className="p-4 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div><p className="text-sm font-semibold text-gray-800">Save Draft writes immediately</p><p className="text-xs text-gray-500">Use Save Draft any time — it persists what you've entered so far without leaving the editor.</p></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── LIST MODE ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><Brain className="h-5 w-5 text-purple-600" /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Flashcards</h1><p className="text-sm text-slate-400">Create, organize and share flashcards for better learning and revision.</p></div>
          </div>
          <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Create Flashcard Set
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {FC_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors", tab === t.id ? "text-purple-600" : "text-gray-400 hover:text-gray-600")}>
              <t.icon className="w-4 h-4" /> {t.label}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-purple-600" />}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPI icon={BookOpen} label="Total Sets" value={String(sets.length)} color="text-purple-600" bg="bg-violet-50" />
          <KPI icon={Brain} label="Total Cards" value={String(totalCards)} color="text-amber-600" bg="bg-amber-50" />
          <KPI icon={Share2} label="Assigned Sets" value={String(assignedSets.length)} color="text-purple-600" bg="bg-blue-50" />
          <KPI icon={FolderOpen} label="Subjects Covered" value={String(Object.keys(bySubject).length)} color="text-emerald-600" bg="bg-emerald-50" />
        </div>

        {/* Filters (for list-style tabs) */}
        {(tab === "my" || tab === "assigned" || tab === "library") && (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input placeholder="Search flashcard sets..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 h-9 w-64 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <Select value={subject} onValueChange={setSubject}><SelectTrigger className="h-9 w-[150px] text-sm border-gray-200"><SelectValue /></SelectTrigger><SelectContent>{["All Subjects", ...SUBJECT_OPTIONS].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
            <Select value={grade} onValueChange={setGrade}><SelectTrigger className="h-9 w-[130px] text-sm border-gray-200"><SelectValue /></SelectTrigger><SelectContent>{["All Grades", ...GRADE_OPTIONS].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
          </div>
        )}

        {/* ═══ MY FLASHCARDS ═══ */}
        {tab === "my" && (
          <div className="space-y-4">
            <SetTable sets={filterSet(sets)} variant="my" onOpen={openEdit} onStudy={openPractice} onGame={openGame} onEdit={openEdit} onDelete={setDeleteTarget} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Quick Actions */}
              <Card className="border border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <p className="font-bold text-gray-900 mb-3 text-sm">Quick Actions</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Create Flashcard Set", icon: Plus, color: "text-purple-600", bg: "bg-violet-50", fn: openCreate },
                      { label: "Browse Library View", icon: Library, color: "text-amber-600", bg: "bg-amber-50", fn: () => setTab("library") },
                      { label: "View Assigned Sets", icon: Share2, color: "text-emerald-600", bg: "bg-emerald-50", fn: () => setTab("assigned") },
                      { label: "Group by Subject", icon: LayoutTemplate, color: "text-rose-600", bg: "bg-rose-50", fn: () => setTab("subject") },
                    ].map(a => (
                      <button key={a.label} onClick={a.fn} className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-gray-100 hover:border-violet-200 hover:bg-violet-50/40 transition-colors text-left">
                        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", a.bg)}><a.icon className={cn("w-3.5 h-3.5", a.color)} /></span>
                        <span className="text-sm font-semibold text-gray-900">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Flashcard Usage chart */}
              <Card className="border border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <p className="font-bold text-gray-900 mb-3 text-sm">Cards by Subject</p>
                  {subjectDistribution.length === 0 ? (
                    <p className="text-xs text-gray-400 py-8 text-center">Create a set to see the breakdown.</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="relative h-28 w-28 shrink-0">
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={subjectDistribution} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={54} paddingAngle={2}>{subjectDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><p className="text-base font-bold text-gray-900">{totalCards}</p><p className="text-[9px] text-gray-400">Total Cards</p></div>
                      </div>
                      <div className="flex-1 space-y-1">{subjectDistribution.map(d => (<div key={d.name} className="flex items-center justify-between"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: d.color }} /><span className="text-xs text-gray-600">{d.name}</span></div><span className="text-xs font-bold text-gray-900">{d.value}</span></div>))}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recently Modified */}
              <Card className="border border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <p className="font-bold text-gray-900 mb-3 text-sm">Recently Modified</p>
                  {recentlyViewed.length === 0 ? (
                    <p className="text-xs text-gray-400 py-8 text-center">No sets yet.</p>
                  ) : (
                    <div className="space-y-2.5">{recentlyViewed.map((s, i) => (<button key={s.id} onClick={() => openEdit(s)} className="w-full flex items-center gap-2.5 text-left group"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="flex-1 text-sm font-medium text-gray-700 group-hover:text-purple-600 transition-colors truncate">{s.name}</span><span className="text-[11px] text-gray-400 shrink-0">{fmtDate(s.lastModified)}</span></button>))}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ═══ ASSIGNED SETS ═══ */}
        {tab === "assigned" && <SetTable sets={filterSet(assignedSets)} variant="assigned" onOpen={openEdit} onStudy={openPractice} onGame={openGame} onEdit={openEdit} onDelete={setDeleteTarget} />}

        {/* ═══ LIBRARY VIEW ═══ */}
        {tab === "library" && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-gray-500">{filterSet(sets).length} set{filterSet(sets).length === 1 ? "" : "s"} available</p>
            </div>
            {filterSet(sets).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-center text-gray-400"><Library className="w-10 h-10 mb-2 text-gray-200" /> No flashcard sets yet — create one to see it here.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filterSet(sets).map(s => <SetCard key={s.id} s={s} onOpen={() => openEdit(s)} onStudy={() => openPractice(s)} onGame={() => openGame(s)} />)}
              </div>
            )}
          </>
        )}

        {/* ═══ BY SUBJECT ═══ */}
        {tab === "subject" && (
          <div className="space-y-5">
            {Object.keys(bySubject).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-center text-gray-400"><FolderOpen className="w-10 h-10 mb-2 text-gray-200" /> No flashcard sets yet.</div>
            ) : Object.entries(bySubject).map(([subj, list]) => (
              <Card key={subj} className="border border-gray-100 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className={cn("text-sm font-bold rounded-md px-2.5 py-1", SUBJECT_COLORS[subj] || "bg-gray-100 text-gray-600")}>{subj}</span>
                    <span className="text-xs text-gray-400">{list.length} sets · {list.reduce((a, b) => a + b.cards.length, 0)} cards</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map(s => (
                      <button key={s.id} onClick={() => openEdit(s)} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50/30 text-left transition-colors">
                        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><BookOpen className="w-4 h-4 text-violet-500" /></div>
                        <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p><p className="text-[11px] text-gray-400">{s.cards.length} cards · {s.classId || "—"}</p></div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ BY CLASS ═══ */}
        {tab === "class" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {byClass.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center h-52 text-center text-gray-400"><GraduationCap className="w-10 h-10 mb-2 text-gray-200" /> No flashcard sets yet.</div>
            ) : byClass.map(([cls, list]) => (
              <Card key={cls} className="border border-gray-100 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-4 h-4 text-indigo-500" /></div><p className="font-bold text-gray-900">{cls}</p></div>
                    <span className="text-xs font-semibold text-gray-400">{list.length} sets</span>
                  </div>
                  <div className="space-y-2">
                    {list.map(s => (
                      <button key={s.id} onClick={() => openEdit(s)} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-left">
                        <span className="text-sm text-gray-700 truncate">{s.name}</span>
                        <span className={cn("text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0 ml-2", SUBJECT_COLORS[s.subject] || "bg-gray-100 text-gray-600")}>{s.subject || "—"}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the set and its {deleteTarget?.cards.length ?? 0} cards. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default FlashCards;
