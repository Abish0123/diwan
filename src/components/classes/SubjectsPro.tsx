import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, MoreVertical, Search, SlidersHorizontal, Pencil, Trash2,
  BookOpen, Calculator, FlaskConical, Globe2, Monitor, Languages,
  Palette, Music, Dumbbell, BookText, Users, CalendarClock, PieChart,
  ChevronLeft, ChevronRight, BookMarked, Sparkles, UserCheck,
  LayoutGrid, List, FileText, Upload, FolderOpen, X, GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const C = { primary: "#7C3AED", success: "#22C55E", warning: "#F59E0B", error: "#EF4444" };

// Famous/common subjects for quick selection in Add Subject dialog
const FAMOUS_SUBJECTS = ["Mathematics", "Science", "English", "Social Studies", "History", "Geography", "Computer Science", "Physical Education", "Art", "Music", "Arabic", "Urdu", "Islamic Studies", "Chemistry", "Biology", "Physics"];

interface Meta { code: string; icon: typeof BookOpen; hex: string; light: string; periods: number; coverage: number; }

const SUBJECT_META: Record<string, Meta> = {
  english:        { code: "ENG101",  icon: BookText,     hex: "#7C3AED", light: "#F1ECFF", periods: 6, coverage: 75 },
  mathematics:    { code: "MATH101", icon: Calculator,   hex: "#2563EB", light: "#DBEAFE", periods: 6, coverage: 68 },
  maths:          { code: "MATH101", icon: Calculator,   hex: "#2563EB", light: "#DBEAFE", periods: 6, coverage: 68 },
  science:        { code: "SCI101",  icon: FlaskConical, hex: "#22C55E", light: "#DCFCE7", periods: 5, coverage: 72 },
  urdu:           { code: "URD101",  icon: Languages,    hex: "#EF4444", light: "#FEE2E2", periods: 4, coverage: 65 },
  islamiyat:      { code: "ISL101",  icon: BookMarked,   hex: "#0EA5E9", light: "#E0F2FE", periods: 2, coverage: 60 },
  activity:       { code: "ACT101",  icon: Sparkles,     hex: "#A855F7", light: "#F3E8FF", periods: 2, coverage: 80 },
  "art & craft":  { code: "ART101",  icon: Palette,      hex: "#EC4899", light: "#FCE7F3", periods: 2, coverage: 70 },
  art:            { code: "ART101",  icon: Palette,      hex: "#EC4899", light: "#FCE7F3", periods: 2, coverage: 70 },
  "physical education": { code: "PE101", icon: Dumbbell, hex: "#0EA5E9", light: "#E0F2FE", periods: 2, coverage: 55 },
  "social studies": { code: "SST101", icon: Globe2,     hex: "#F59E0B", light: "#FEF3C7", periods: 4, coverage: 79 },
  "computer science": { code: "CS101", icon: Monitor,   hex: "#8B5CF6", light: "#EDE9FE", periods: 4, coverage: 81 },
  hindi:          { code: "HIN101",  icon: Languages,    hex: "#EF4444", light: "#FEE2E2", periods: 4, coverage: 73 },
  music:          { code: "MUS101",  icon: Music,        hex: "#14B8A6", light: "#CCFBF1", periods: 2, coverage: 86 },
};

const FALLBACK_HEX = ["#7C3AED", "#2563EB", "#22C55E", "#F59E0B", "#A855F7", "#EF4444", "#EC4899", "#14B8A6"];
function rng(seed: number) { const x = Math.sin(seed * 99991 + 7) * 10000; return x - Math.floor(x); }
function metaFor(name: string, idx: number): Meta {
  const key = name.trim().toLowerCase();
  if (SUBJECT_META[key]) return SUBJECT_META[key];
  const hex = FALLBACK_HEX[idx % FALLBACK_HEX.length];
  return { code: name.slice(0, 3).toUpperCase() + "10" + (idx + 1), icon: BookOpen, hex, light: hex + "1A", periods: 3 + Math.round(rng(idx + 1) * 3), coverage: Math.round(55 + rng(idx + 5) * 35) };
}
function coverageColor(v: number) { return v >= 70 ? C.success : v >= 60 ? C.warning : C.error; }
const initials = (n: string) => n.replace(/^(Miss\.|Mr\.|Mrs\.)\s*/, "").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

interface Row { name: string; code: string; icon: typeof BookOpen; hex: string; light: string; periods: number; coverage: number; teacher: string; room: string; }
const DEFAULT_ROOMS = ["Room 101", "Room 102", "Room 103", "Lab 1", "Lab 2", "Activity Room", "Library", "Room 104"];

interface SubjectsProProps {
  classData: { name?: string; grade?: string; academicYear?: string; status?: string; teacher?: string };
  subjects: string[];
  studentCount: number;
  teacherName?: string;
  semesterName?: string | null;
  onSubjectsChange?: (names: string[]) => void | Promise<void>;
  sections?: string[];
  selectedSection?: string;
  // Per-section teacher assignments fetched from subject_assignments table.
  // Each entry: { subject, teacherName }. Used to show the real teacher per subject for the selected section.
  sectionAssignments?: { subject: string; teacherName: string }[];
  onRowsChange?: (rows: { name: string; code: string; teacher: string; room: string; coverage: number; periods: number }[]) => void;
  onTeacherAssign?: (subject: string, teacherName: string) => void | Promise<void>;
}

// Shared teacher picker — type to filter, click chip to select.
// Chips show "Name (CoreSubject)" so admin knows each teacher's specialty.
function TeacherPicker({ staff, value, onChange }: {
  staff: { name: string; subject: string }[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = staff.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.subject.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Type name or subject to search…"
        className="h-10"
      />
      <div className="flex flex-wrap gap-1.5 mt-2 max-h-36 overflow-y-auto pr-1">
        {filtered.map(s => (
          <button
            key={s.name}
            type="button"
            onClick={() => { onChange(s.name); setSearch(""); }}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
              value === s.name
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"
            )}
          >
            {s.name}{s.subject ? ` (${s.subject})` : ""}
          </button>
        ))}
        {filtered.length === 0 && <span className="text-xs text-slate-400">No teachers found</span>}
      </div>
      {value && (
        <p className="text-[11px] text-purple-600 font-semibold mt-1.5">
          Selected: {value}{staff.find(s => s.name === value)?.subject ? ` — ${staff.find(s => s.name === value)!.subject}` : ""}
        </p>
      )}
    </div>
  );
}

export default function SubjectsPro({ subjects, onSubjectsChange, sections, selectedSection, sectionAssignments, onRowsChange, onTeacherAssign }: SubjectsProProps) {
  const sectionList = sections && sections.length ? sections : ["A"];
  const [rows, setRows] = useState<Row[]>([]);
  const [staffList, setStaffList] = useState<{ name: string; subject: string }[]>([]);

  // Fetch real staff from DB — store name + core subject for display
  useEffect(() => {
    fetch("/api/data/staff")
      .then(r => r.json())
      .then(data => {
        const staff = (Array.isArray(data) ? data : [])
          .map((s: any) => ({ name: (s.name || s.displayName || "").trim(), subject: (s.subject || s.department || "").trim() }))
          .filter(s => s.name);
        setStaffList(staff.length > 0 ? staff : []);
      })
      .catch(() => setStaffList([]));
  }, []);

  useEffect(() => {
    // Build a lookup: subject name → assigned teacher for the selected section.
    // No fallback/cycled name — an unallocated subject must show as Unassigned,
    // never a plausible-looking teacher nobody actually assigned.
    const assignedTeacher = new Map<string, string>();
    (sectionAssignments || []).forEach(a => assignedTeacher.set(a.subject, a.teacherName));

    setRows((subjects || []).map((name, i) => {
      const m = metaFor(name, i);
      const teacher = assignedTeacher.get(name) || "";
      return { name, ...m, teacher, room: DEFAULT_ROOMS[i % DEFAULT_ROOMS.length] };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.join("|"), staffList.map(s => s.name).join("|"), JSON.stringify(sectionAssignments)]);

  const [search, setSearch] = useState("");
  const [filterCoverage, setFilterCoverage] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  // ── Two separate stores per subject ───────────────────────────────────────
  // 1) Syllabus  = the single complete syllabus document for the subject.
  // 2) Study Materials = chapters → lessons → files (organised by chapter & lesson).
  type Lesson = { id: string; title: string; files: string[] };
  type Chapter = { id: string; title: string; lessons: Lesson[] };
  const [syllabusFiles, setSyllabusFiles] = useState<Record<string, string>>({});
  const [materials, setMaterials] = useState<Record<string, Chapter[]>>({});
  const [syllabusSubject, setSyllabusSubject] = useState<string | null>(null);   // Upload Syllabus dialog
  const [materialsSubject, setMaterialsSubject] = useState<string | null>(null); // Study Materials dialog
  const [newChapter, setNewChapter] = useState("");
  const [lessonInput, setLessonInput] = useState<Record<string, string>>({});    // per-chapter new-lesson title

  // One file input that routes by mode: "syllabus" or a chapter/lesson target.
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadModeRef = useRef<"syllabus" | "lesson">("syllabus");
  const uploadTargetRef = useRef<{ chapterId: string; lessonId: string } | null>(null);

  const subjectChapters = (name: string) => materials[name] || [];
  const materialCount = (name: string) => subjectChapters(name).reduce((a, c) => a + c.lessons.reduce((b, l) => b + l.files.length, 0), 0);
  const lessonCount = (name: string) => subjectChapters(name).reduce((a, c) => a + c.lessons.length, 0);

  function addChapter(subject: string) {
    const title = newChapter.trim(); if (!title) { toast.error("Enter a chapter title"); return; }
    setMaterials(prev => ({ ...prev, [subject]: [...(prev[subject] || []), { id: `ch-${Date.now()}`, title, lessons: [] }] }));
    setNewChapter("");
  }
  function removeChapter(subject: string, id: string) {
    setMaterials(prev => ({ ...prev, [subject]: (prev[subject] || []).filter(c => c.id !== id) }));
  }
  function addLesson(subject: string, chapterId: string) {
    const title = (lessonInput[chapterId] || "").trim(); if (!title) return;
    setMaterials(prev => ({ ...prev, [subject]: (prev[subject] || []).map(c => c.id === chapterId ? { ...c, lessons: [...c.lessons, { id: `ls-${Date.now()}`, title, files: [] }] } : c) }));
    setLessonInput(s => ({ ...s, [chapterId]: "" }));
  }
  function removeLesson(subject: string, chapterId: string, lessonId: string) {
    setMaterials(prev => ({ ...prev, [subject]: (prev[subject] || []).map(c => c.id === chapterId ? { ...c, lessons: c.lessons.filter(l => l.id !== lessonId) } : c) }));
  }
  function addFile(subject: string, chapterId: string, lessonId: string, fileName: string) {
    setMaterials(prev => ({ ...prev, [subject]: (prev[subject] || []).map(c => c.id === chapterId ? { ...c, lessons: c.lessons.map(l => l.id === lessonId ? { ...l, files: [...l.files, fileName] } : l) } : c) }));
    toast.success(`"${fileName}" uploaded`);
  }
  function removeFile(subject: string, chapterId: string, lessonId: string, idx: number) {
    setMaterials(prev => ({ ...prev, [subject]: (prev[subject] || []).map(c => c.id === chapterId ? { ...c, lessons: c.lessons.map(l => l.id === lessonId ? { ...l, files: l.files.filter((_, i) => i !== idx) } : l) } : c) }));
  }

  function openUpload(mode: "syllabus" | "lesson", target?: { chapterId: string; lessonId: string }) {
    uploadModeRef.current = mode;
    uploadTargetRef.current = target || null;
    uploadRef.current?.click();
  }
  function onFilePicked(fileName: string) {
    if (uploadModeRef.current === "syllabus" && syllabusSubject) {
      setSyllabusFiles(prev => ({ ...prev, [syllabusSubject]: fileName }));
      toast.success(`Syllabus "${fileName}" uploaded for ${syllabusSubject}`);
    } else if (uploadModeRef.current === "lesson" && materialsSubject && uploadTargetRef.current) {
      addFile(materialsSubject, uploadTargetRef.current.chapterId, uploadTargetRef.current.lessonId, fileName);
    }
  }

  // Bubble the full subject rows up to the page header so its export emits real data.
  useEffect(() => {
    onRowsChange?.(rows.map(r => ({ name: r.name, code: r.code, teacher: r.teacher, room: r.room, coverage: r.coverage, periods: r.periods })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // dialogs
  const [addOpen, setAddOpen] = useState(false);
  // No default teacher — must be explicitly chosen; an unassigned subject
  // stays Unassigned rather than silently picking the first staff member.
  const [addForm, setAddForm] = useState({ name: "", teacher: "", periods: 4, room: "Room 101" });
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ name: "", teacher: "", periods: 0, coverage: 0, room: "" });
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [assignTeacher, setAssignTeacher] = useState("");

  const visible = useMemo(() => rows.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase());
    const matchesCov = filterCoverage === "All"
      || (filterCoverage === "On Track" && r.coverage >= 70)
      || (filterCoverage === "Needs Attention" && r.coverage >= 60 && r.coverage < 70)
      || (filterCoverage === "Behind" && r.coverage < 60);
    return matchesSearch && matchesCov;
  }), [rows, search, filterCoverage]);

  const totalPeriods = rows.reduce((a, r) => a + r.periods, 0);
  const avgCoverage = rows.length ? Math.round(rows.reduce((a, r) => a + r.coverage, 0) / rows.length) : 0;
  const teachers = new Set(rows.map(r => r.teacher).filter(Boolean)).size;
  const unassignedCount = rows.filter(r => !r.teacher).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Persists the subject-name list to the database (cPanel MySQL via updateClass).
  function commit(next: Row[]) {
    setRows(next);
    void onSubjectsChange?.(next.map(r => r.name));
  }
  // A teacher value is only valid if it matches a real staff member from the DB.
  // The picker chips already enforce this, but validate again on save so a
  // stale/free-typed name can never reach subject_assignments (a name that
  // doesn't resolve to a real account breaks marks-entry RBAC downstream).
  function isRealStaff(name: string) {
    const n = name.trim().toLowerCase();
    return staffList.some(s => s.name.trim().toLowerCase() === n);
  }
  function handleAdd() {
    const name = addForm.name.trim();
    if (!name) { toast.error("Subject name is required"); return; }
    if (rows.some(r => r.name.toLowerCase() === name.toLowerCase())) { toast.error("Subject already exists"); return; }
    if (addForm.teacher && !isRealStaff(addForm.teacher)) { toast.error(`"${addForm.teacher}" is not in the staff list — pick a teacher from the suggestions`); return; }
    const m = metaFor(name, rows.length);
    commit([...rows, { name, ...m, periods: addForm.periods, teacher: addForm.teacher, room: addForm.room.trim() || "Room 101" }]);
    // Persist the Subject → Teacher mapping too — without this the picked
    // teacher was purely cosmetic and never actually granted access.
    if (addForm.teacher) void onTeacherAssign?.(name, addForm.teacher);
    toast.success(
      addForm.teacher
        ? `${name} added — ${addForm.teacher} assigned`
        : `${name} added — assign a teacher before scheduling it`
    );
    setAddOpen(false);
    setAddForm({ name: "", teacher: "", periods: 4, room: "Room 101" });
  }
  function openEdit(r: Row) { setEditTarget(r); setEditForm({ name: r.name, teacher: r.teacher, periods: r.periods, coverage: r.coverage, room: r.room || "" }); }
  function handleEdit() {
    if (!editTarget) return;
    const name = editForm.name.trim();
    if (!name) { toast.error("Subject name is required"); return; }
    const teacherChanged = editForm.teacher !== editTarget.teacher;
    if (teacherChanged && editForm.teacher && !isRealStaff(editForm.teacher)) { toast.error(`"${editForm.teacher}" is not in the staff list — pick a teacher from the suggestions`); return; }
    commit(rows.map(r => r.name === editTarget.name ? { ...r, name, teacher: editForm.teacher, periods: Number(editForm.periods) || r.periods, coverage: Math.max(0, Math.min(100, Number(editForm.coverage))), room: editForm.room.trim() || r.room } : r));
    // Same mapping persistence as Add — editing the teacher here must also
    // update subject_assignments, not just the local row.
    if (teacherChanged && editForm.teacher) void onTeacherAssign?.(name, editForm.teacher);
    toast.success(`${name} updated`);
    setEditTarget(null);
  }
  function handleAssign() {
    if (!assignTarget) return;
    if (!assignTeacher) { toast.error("Select a teacher from the staff list first"); return; }
    if (!isRealStaff(assignTeacher)) { toast.error(`"${assignTeacher}" is not in the staff list — pick a teacher from the suggestions`); return; }
    setRows(prev => prev.map(r => r.name === assignTarget.name ? { ...r, teacher: assignTeacher } : r));
    void onTeacherAssign?.(assignTarget.name, assignTeacher);
    toast.success(`${assignTeacher} assigned to ${assignTarget.name} — access granted`);
    setAssignTarget(null);
  }
  function handleRemove(r: Row) {
    commit(rows.filter(x => x.name !== r.name));
    toast.success(`${r.name} removed`);
  }

  const filtersActive = filterCoverage !== "All";

  const kpis = [
    { label: "Total Subjects", value: rows.length, sub: "In this section", icon: BookOpen, hex: "#7C3AED", light: "#F1ECFF" },
    {
      label: "Subject Teachers", value: teachers,
      sub: unassignedCount > 0 ? `${unassignedCount} subject${unassignedCount !== 1 ? "s" : ""} unassigned` : "All assigned",
      icon: UserCheck, hex: unassignedCount > 0 ? "#F59E0B" : "#22C55E", light: unassignedCount > 0 ? "#FEF3C7" : "#DCFCE7",
    },
    { label: "Total Periods / Week", value: totalPeriods, sub: "All subjects", icon: CalendarClock, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Subjects Completion", value: `${avgCoverage}%`, sub: "Syllabus Coverage", icon: PieChart, hex: "#2563EB", light: "#DBEAFE" },
  ];

  function addDialog() {
    return (
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Subject</DialogTitle><DialogDescription>Add a subject to this section's curriculum.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-500">Subject Name</Label>
              <Input
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Type subject name or pick below…"
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                className="h-10"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {FAMOUS_SUBJECTS.filter(s => !s || s.toLowerCase().includes(addForm.name.toLowerCase()) || addForm.name === "").map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAddForm(f => ({ ...f, name: s }))}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      addForm.name === s
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500">Teacher</Label>
              <TeacherPicker staff={staffList} value={addForm.teacher} onChange={v => setAddForm(f => ({ ...f, teacher: v }))} />
            </div>
            <div><Label className="text-xs font-semibold text-slate-500">Room No</Label><Input value={addForm.room} onChange={e => setAddForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 101 / Lab-2" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button className="text-white" style={{ background: C.primary }} onClick={handleAdd}>Add Subject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}>
                <k.icon style={{ color: k.hex, width: 24, height: 24 }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500 truncate">{k.label}</p>
                <p className="text-3xl font-black text-slate-900 leading-tight">{k.value}</p>
                <p className="text-xs text-slate-400">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Subjects Table ──────────────────────────────────────────────── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-bold text-lg text-slate-900">Subjects <span className="text-slate-400 font-semibold">({rows.length})</span></p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Applies to all sections: {sectionList.map(s => `Section ${s}`).join(" · ")}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search subjects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl border-slate-200 h-10 w-[240px]" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn("rounded-xl border-slate-200 gap-2 font-semibold text-slate-600 h-10", filtersActive && "border-violet-300 text-purple-600 bg-violet-50")}>
                  <SlidersHorizontal className="w-4 h-4" /> Filter{filtersActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">Syllabus coverage</p>
                {["All", "On Track", "Needs Attention", "Behind"].map(o => (
                  <DropdownMenuItem key={o} onClick={() => setFilterCoverage(o)} className={cn(filterCoverage === o && "bg-violet-50 text-violet-700 font-semibold")}>{o}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Grid / List view toggle — Grid is default */}
            <div className="flex items-center rounded-xl border border-slate-200 p-0.5 h-10">
              <button title="Grid view" onClick={() => setViewMode("grid")}
                className={cn("p-1.5 rounded-lg", viewMode === "grid" ? "text-white" : "text-slate-400")} style={viewMode === "grid" ? { background: C.primary } : undefined}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button title="List view" onClick={() => setViewMode("list")}
                className={cn("p-1.5 rounded-lg", viewMode === "list" ? "text-white" : "text-slate-400")} style={viewMode === "list" ? { background: C.primary } : undefined}>
                <List className="w-4 h-4" />
              </button>
            </div>
            <Button className="h-10 rounded-xl text-white font-semibold gap-2" style={{ background: C.primary }} onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> Add Subject
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-base font-bold text-slate-700">No Subjects Added Yet</p>
            <p className="text-sm text-slate-400 mt-1">Click <strong>Add Subject</strong> to build the curriculum for this grade.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(s => (
              <div key={s.name} className="rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.light }}><s.icon style={{ color: s.hex, width: 22, height: 22 }} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {s.code} ·{" "}
                      {s.teacher
                        ? s.teacher
                        : <span className="text-amber-600 font-semibold">Unassigned</span>}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openEdit(s)}><BookOpen className="w-4 h-4 mr-2" /> Open / Edit Subject</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setAssignTarget(s); setAssignTeacher(s.teacher); }}><Users className="w-4 h-4 mr-2" /> Assign Teacher</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setSyllabusSubject(s.name)}><FileText className="w-4 h-4 mr-2" /> Upload Syllabus</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMaterialsSubject(s.name)}><FolderOpen className="w-4 h-4 mr-2" /> Upload Study Materials</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => handleRemove(s)}><Trash2 className="w-4 h-4 mr-2" /> Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.coverage}%`, background: coverageColor(s.coverage) }} /></div>
                  <span className="text-xs font-semibold text-slate-600">{s.coverage}%</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                  <span className="flex items-center gap-1"><BookText className="w-3.5 h-3.5" /> {syllabusFiles[s.name] ? "Syllabus ✓" : "No syllabus"}</span>
                  <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" /> {subjectChapters(s.name).length} ch · {materialCount(s.name)} files</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-xl border-slate-200 gap-1.5 font-semibold text-slate-600 h-9 text-xs" onClick={() => setSyllabusSubject(s.name)}>
                    <FileText className="w-3.5 h-3.5" /> Syllabus
                  </Button>
                  <Button variant="outline" className="rounded-xl border-slate-200 gap-1.5 font-semibold text-slate-600 h-9 text-xs" onClick={() => setMaterialsSubject(s.name)}>
                    <FolderOpen className="w-3.5 h-3.5" /> Materials
                  </Button>
                </div>
              </div>
            ))}
            {visible.length === 0 && <p className="col-span-full text-center text-slate-400 py-10">No subjects match your search / filter.</p>}
          </div>
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-y border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="text-left px-6 py-4 min-w-[200px]">Subject Name</th>
                <th className="text-left px-4 py-4">Subject Code</th>
                <th className="text-left px-4 py-4 min-w-[170px]">Teacher</th>
                <th className="text-center px-4 py-4">Room No</th>
                <th className="text-center px-4 py-4">Status</th>
                <th className="text-left px-4 py-4 min-w-[180px]">Syllabus Coverage</th>
                <th className="text-center px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">No subjects match your search / filter.</td></tr>
              ) : visible.map(s => (
                <tr key={s.name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.light }}><s.icon style={{ color: s.hex, width: 20, height: 20 }} /></span>
                      <span className="font-semibold text-slate-800">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500 font-medium">{s.code}</td>
                  <td className="px-4 py-4">
                    {s.teacher ? (
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-8 h-8"><AvatarFallback className="text-[10px] font-bold text-white" style={{ background: s.hex }}>{initials(s.teacher)}</AvatarFallback></Avatar>
                        <span className="text-sm font-medium text-slate-700">{s.teacher}</span>
                      </div>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold rounded-md px-2.5 py-0.5">Unassigned</Badge>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center"><Badge variant="outline" className="text-xs font-semibold rounded-md border-slate-200 text-slate-600">{s.room || "—"}</Badge></td>
                  <td className="px-4 py-4 text-center"><Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-semibold rounded-md px-2.5 py-0.5">Active</Badge></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.coverage}%`, background: coverageColor(s.coverage) }} /></div>
                      <span className="text-sm font-semibold text-slate-600 w-10 text-right">{s.coverage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-violet-200" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => openEdit(s)}><BookOpen className="w-4 h-4 mr-2" /> Open / Edit Subject</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setAssignTarget(s); setAssignTeacher(s.teacher); }}><Users className="w-4 h-4 mr-2" /> Assign Teacher</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSyllabusSubject(s.name)}><FileText className="w-4 h-4 mr-2" /> Upload Syllabus</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMaterialsSubject(s.name)}><FolderOpen className="w-4 h-4 mr-2" /> Upload Study Materials</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => handleRemove(s)}><Trash2 className="w-4 h-4 mr-2" /> Remove</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <span className="text-sm text-slate-400 font-medium">Showing 1 to {visible.length} of {rows.length} subjects</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400" disabled><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="icon" className="h-8 w-8 rounded-lg text-white" style={{ background: C.primary }}>1</Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400" disabled><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        </>
        )}
      </Card>

      {addDialog()}

      {/* ── Upload Syllabus — single complete syllabus document per subject ── */}
      <Dialog open={!!syllabusSubject} onOpenChange={o => { if (!o) setSyllabusSubject(null); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" /> {syllabusSubject} — Upload Syllabus</DialogTitle>
            <DialogDescription>Upload the complete subject syllabus document for students.</DialogDescription>
          </DialogHeader>
          {syllabusSubject && (
            <div className="space-y-3">
              {syllabusFiles[syllabusSubject] ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-emerald-600" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{syllabusFiles[syllabusSubject]}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold">Syllabus uploaded</p>
                  </div>
                  <button className="text-slate-400 hover:text-rose-500" onClick={() => setSyllabusFiles(prev => { const n = { ...prev }; delete n[syllabusSubject]; return n; })}><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button onClick={() => openUpload("syllabus")}
                  className="w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-colors py-10 flex flex-col items-center gap-2">
                  <Upload className="w-7 h-7 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">Click to upload syllabus</p>
                  <p className="text-[11px] text-slate-400">PDF, DOC, DOCX</p>
                </button>
              )}
              {syllabusFiles[syllabusSubject] && (
                <Button variant="outline" className="w-full rounded-xl border-dashed border-slate-300 gap-1.5 text-xs font-semibold text-slate-600" onClick={() => openUpload("syllabus")}>
                  <Upload className="w-3.5 h-3.5" /> Replace File
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyllabusSubject(null)} className="rounded-xl">Close</Button>
            <Button className="rounded-xl text-white font-bold" style={{ background: C.primary }} disabled={!syllabusSubject || !syllabusFiles[syllabusSubject!]}
              onClick={() => { toast.success(`Syllabus published to students for ${syllabusSubject}`); setSyllabusSubject(null); }}>Publish to Students</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upload Study Materials — organised by chapters → lessons ── */}
      <Dialog open={!!materialsSubject} onOpenChange={o => { if (!o) { setMaterialsSubject(null); setNewChapter(""); } }}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderOpen className="w-5 h-5 text-purple-600" /> {materialsSubject} — Study Materials</DialogTitle>
            <DialogDescription>Organise materials by chapter, then by lesson. Upload PDFs / materials under each lesson for students.</DialogDescription>
          </DialogHeader>
          {materialsSubject && (
            <div className="space-y-4">
              {/* Add chapter */}
              <div className="flex items-center gap-2">
                <Input placeholder="New chapter title (e.g. Chapter 1 — Numbers)" value={newChapter}
                  onChange={e => setNewChapter(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addChapter(materialsSubject); }}
                  className="rounded-xl" />
                <Button className="rounded-xl text-white font-bold gap-1.5 shrink-0" style={{ background: C.primary }} onClick={() => addChapter(materialsSubject)}><Plus className="w-4 h-4" /> Add Chapter</Button>
              </div>

              {subjectChapters(materialsSubject).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                  <GraduationCap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-500">No chapters yet</p>
                  <p className="text-xs text-slate-400">Add a chapter, then add lessons and upload materials under each lesson.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subjectChapters(materialsSubject).map(ch => (
                    <div key={ch.id} className="rounded-xl border border-slate-100 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold text-slate-800 flex items-center gap-2"><BookMarked className="w-4 h-4 text-violet-500" /> {ch.title} <span className="text-[11px] font-medium text-slate-400">· {ch.lessons.length} lesson{ch.lessons.length !== 1 ? "s" : ""}</span></p>
                        <button className="text-rose-400 hover:text-rose-600" onClick={() => removeChapter(materialsSubject, ch.id)}><Trash2 className="w-4 h-4" /></button>
                      </div>

                      {/* Lessons */}
                      <div className="space-y-2 mb-3">
                        {ch.lessons.map(ls => (
                          <div key={ls.id} className="rounded-lg bg-slate-50/70 border border-slate-100 p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-violet-400" /> {ls.title}</p>
                              <button className="text-slate-400 hover:text-rose-500" onClick={() => removeLesson(materialsSubject, ch.id, ls.id)}><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="space-y-1.5 mb-2">
                              {ls.files.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5">
                                  <FileText className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                  <span className="text-xs font-medium text-slate-700 flex-1 truncate">{f}</span>
                                  <button className="text-slate-400 hover:text-rose-500" onClick={() => removeFile(materialsSubject, ch.id, ls.id, i)}><X className="w-3 h-3" /></button>
                                </div>
                              ))}
                              {ls.files.length === 0 && <span className="text-[11px] text-slate-400">No materials uploaded</span>}
                            </div>
                            <Button variant="outline" size="sm" className="rounded-lg border-dashed border-slate-300 gap-1.5 text-[11px] font-semibold text-slate-600 h-7"
                              onClick={() => openUpload("lesson", { chapterId: ch.id, lessonId: ls.id })}>
                              <Upload className="w-3 h-3" /> Upload Material
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Add lesson */}
                      <div className="flex items-center gap-2">
                        <Input placeholder="Add a lesson (e.g. Lesson 1 — Counting)" value={lessonInput[ch.id] || ""}
                          onChange={e => setLessonInput(s => ({ ...s, [ch.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") addLesson(materialsSubject, ch.id); }}
                          className="rounded-lg h-9 text-sm" />
                        <Button size="sm" variant="outline" className="rounded-lg h-9 shrink-0 gap-1" onClick={() => addLesson(materialsSubject, ch.id)}><Plus className="w-3.5 h-3.5" /> Lesson</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialsSubject(null)} className="rounded-xl">Close</Button>
            <Button className="rounded-xl text-white font-bold" style={{ background: C.primary }} onClick={() => { toast.success(`Study materials published to students for ${materialsSubject}`); setMaterialsSubject(null); }}>Save &amp; Publish to Students</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <input ref={uploadRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.png" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f.name); if (e.target) e.target.value = ""; }} />

      {/* Edit subject dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Subject</DialogTitle><DialogDescription>Update subject details, teacher and syllabus coverage.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs font-semibold text-slate-500">Subject Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label className="text-xs font-semibold text-slate-500">Teacher</Label>
              <TeacherPicker staff={staffList} value={editForm.teacher} onChange={v => setEditForm(f => ({ ...f, teacher: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-semibold text-slate-500">Room No</Label><Input value={editForm.room} onChange={e => setEditForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 101 / Lab-2" /></div>
              <div><Label className="text-xs font-semibold text-slate-500">Coverage %</Label><Input type="number" min={0} max={100} value={editForm.coverage} onChange={e => setEditForm(f => ({ ...f, coverage: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button><Button className="text-white" style={{ background: C.primary }} onClick={handleEdit}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign teacher dialog */}
      <Dialog open={!!assignTarget} onOpenChange={o => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Teacher</DialogTitle>
            <DialogDescription>
              Assign a teacher for <strong>{assignTarget?.name}</strong>
              {selectedSection ? <> — <strong>Section {selectedSection}</strong> only. Other sections keep their own teacher.</> : "."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs font-semibold text-slate-500">Teacher</Label>
            <TeacherPicker staff={staffList} value={assignTeacher} onChange={setAssignTeacher} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button><Button className="text-white" style={{ background: C.primary }} onClick={handleAssign}>Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// hmr