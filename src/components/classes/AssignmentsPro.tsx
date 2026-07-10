import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles, MoreVertical, Search, SlidersHorizontal, Eye,
  FileText, ClipboardList, PlayCircle, CheckSquare, ClipboardCheck,
  Target, ChevronLeft, ChevronRight, Trash2, Copy, BarChart3,
  CalendarClock, X, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell as PieCell, BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const C = { primary: "#7C3AED", secondary: "#A855F7", success: "#22C55E", warning: "#F59E0B", error: "#EF4444", blue: "#3B82F6" };

type AStatus = "Active" | "Completed" | "Upcoming" | "Overdue";

interface Assignment {
  id: string;
  name: string; type: string; subject: string; subjectColor: string;
  teacher: string; teacherHex: string; due: string; rel: string; relUrgent?: boolean;
  submitted: number; total: number; status: AStatus; avg: number;
  description?: string;
  dueTime?: string; totalMarks?: number; createdAt?: string; instructions?: string;
}

// Type-specific guidance shown in the Create dialog so the admin can give the
// student everything they need to complete the work.
const TYPE_FLOW: Record<string, { label: string; placeholder: string; hint: string }> = {
  Quiz: { label: "Quiz instructions", placeholder: "e.g. 10 MCQs · Chapter 3 · no calculator · 15 min", hint: "Mention number of questions, topics covered and any rules." },
  Project: { label: "Project brief", placeholder: "e.g. Build a working model of the solar system · group of 3 · submit with a 1-page report", hint: "Describe deliverables, group size and submission format." },
  Essay: { label: "Essay prompt", placeholder: "e.g. Write 300 words on 'My Role Model' · intro, body, conclusion", hint: "Give the topic, word count and structure expected." },
  Worksheet: { label: "Worksheet details", placeholder: "e.g. Complete Q1–Q20 on page 45 · show all working", hint: "Specify the pages/questions and how to show work." },
  Reading: { label: "Reading task", placeholder: "e.g. Read pages 12–18 and recite the poem 'Hamara Watan'", hint: "Mention the pages/chapters and what to prepare." },
  Activity: { label: "Activity instructions", placeholder: "e.g. Draw an A4 poster on 'Save Water' using crayons", hint: "Explain the activity, materials and what to bring." },
  Homework: { label: "Homework instructions", placeholder: "e.g. Revise today's lesson and complete exercise 4", hint: "Give clear, step-by-step instructions for the student." },
};

const SEED_ASSIGNMENTS: Assignment[] = [
  { id: "a1", name: "English - My Family Essay", type: "Essay", subject: "English", subjectColor: "bg-violet-50 text-purple-600 border-violet-200", teacher: "Miss. Sana Fatima", teacherHex: "#7C3AED", due: "01 Jun 2024", rel: "Tomorrow", relUrgent: true, submitted: 20, total: 24, status: "Active", avg: 85, description: "Write a 200-word essay about your family members and their roles." },
  { id: "a2", name: "Maths - Fractions Worksheet", type: "Worksheet", subject: "Mathematics", subjectColor: "bg-blue-50 text-purple-600 border-blue-200", teacher: "Mr. Imran Qureshi", teacherHex: "#2563EB", due: "03 Jun 2024", rel: "In 3 days", submitted: 18, total: 24, status: "Active", avg: 78, description: "Complete exercises 1–20 on fractions, decimals, and percentages." },
  { id: "a3", name: "Science - Plant Life Cycle Project", type: "Project", subject: "Science", subjectColor: "bg-emerald-50 text-emerald-600 border-emerald-200", teacher: "Mr. Faisal Malik", teacherHex: "#22C55E", due: "07 Jun 2024", rel: "In 7 days", submitted: 15, total: 24, status: "Active", avg: 82, description: "Create a poster illustrating the stages of a plant's life cycle with labels." },
  { id: "a4", name: "Urdu - Poetry Reading", type: "Reading", subject: "Urdu", subjectColor: "bg-rose-50 text-rose-600 border-rose-200", teacher: "Mrs. Hina Shah", teacherHex: "#EF4444", due: "10 Jun 2024", rel: "In 10 days", submitted: 22, total: 24, status: "Active", avg: 88, description: "Read and recite the poem 'Hamara Watan' with correct pronunciation." },
  { id: "a5", name: "Islamiyat - Short Questions", type: "Quiz", subject: "Islamiyat", subjectColor: "bg-sky-50 text-sky-600 border-sky-200", teacher: "Mr. Rizwan Ahmed", teacherHex: "#0EA5E9", due: "15 Jun 2024", rel: "In 15 days", submitted: 24, total: 24, status: "Completed", avg: 90, description: "Answer 10 short questions on Pillars of Islam from Chapter 3." },
  { id: "a6", name: "Activity - Save Environment Poster", type: "Activity", subject: "Activity", subjectColor: "bg-amber-50 text-amber-600 border-amber-200", teacher: "Miss. Ayesha Khan", teacherHex: "#A855F7", due: "20 Jun 2024", rel: "In 20 days", submitted: 12, total: 24, status: "Active", avg: 72, description: "Design a colourful A4 poster about saving the environment." },
];

const MOCK_STUDENTS = [
  "Ahmed Al Rashid", "Maryam Fatima", "Hassan Ali", "Ayesha Noor",
  "Muhammad Zain", "Zara Khan", "Ali Raza", "Hina Mahmood",
  "Omar Sheikh", "Fatima Malik", "Bilal Ahmed", "Sana Qureshi",
];

const OVERVIEW = [
  { label: "Active", value: 6, hex: "#22C55E" },
  { label: "Upcoming", value: 5, hex: "#3B82F6" },
  { label: "Completed", value: 4, hex: "#7C3AED" },
  { label: "Overdue", value: 3, hex: "#EF4444" },
];

const SUBMISSION_STATUS = [
  { label: "Submitted", pct: 82, hex: "#22C55E" },
  { label: "Pending", pct: 10, hex: "#F59E0B" },
  { label: "Not Submitted", pct: 8, hex: "#EF4444" },
];

const TOP_SUBJECTS = [
  { name: "Science", score: 91, hex: "#22C55E" },
  { name: "Islamiyat", score: 88, hex: "#22C55E" },
  { name: "English", score: 85, hex: "#22C55E" },
  { name: "Mathematics", score: 78, hex: "#3B82F6" },
  { name: "Urdu", score: 74, hex: "#F59E0B" },
];

const DEADLINES = [
  { d: "01", m: "JUN", name: "English Essay", rel: "Tomorrow", hex: "#7C3AED" },
  { d: "03", m: "JUN", name: "Maths Worksheet", rel: "In 3 days", hex: "#3B82F6" },
  { d: "07", m: "JUN", name: "Science Project", rel: "In 7 days", hex: "#22C55E" },
  { d: "10", m: "JUN", name: "Urdu Reading", rel: "In 10 days", hex: "#EF4444" },
  { d: "15", m: "JUN", name: "Islamiyat Quiz", rel: "In 15 days", hex: "#0EA5E9" },
];

const AI_INSIGHTS = [
  "English assignments show improvement of 8%",
  "3 assignments have low submission rate",
  "Science projects have the highest scores",
  "5 students missed recent deadlines",
  "Consider reviewing pending submissions",
];

const initials = (n: string) => n.replace(/^(Miss\.|Mr\.|Mrs\.)\s*/, "").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

type DialogType = "view" | "submissions" | "grade" | "analytics" | "create" | "delete" | null;

interface AssignmentsProProps {
  classData: { name?: string; grade?: string; academicYear?: string; status?: string };
  semesterName?: string | null;
  subjects?: string[];
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onExportData?: (payload: { header: string[]; rows: (string | number)[][]; filename: string }) => void;
}

const SUBJECT_FALLBACK = ["English", "Mathematics", "Science", "Urdu", "Islamiyat", "Activity", "Art & Craft", "Physical Education"];
const ASSIGN_TYPES = ["Homework", "Quiz", "Project", "Essay", "Worksheet", "Reading", "Activity"];

// Type-specific structured fields so the admin customises each assignment properly.
type TypeField = { key: string; label: string; kind: "number" | "text" | "datetime-local" | "date" | "select"; placeholder?: string; options?: string[] };
const TYPE_FIELDS: Record<string, TypeField[]> = {
  Quiz: [
    { key: "numQuestions", label: "No. of Questions", kind: "number", placeholder: "10" },
    { key: "timeLimit", label: "Time Limit (min)", kind: "number", placeholder: "15" },
    { key: "marksPerQ", label: "Marks / Question", kind: "number", placeholder: "1" },
    { key: "startAt", label: "Quiz Starts (live)", kind: "datetime-local" },
    { key: "negative", label: "Negative Marking", kind: "select", options: ["No", "Yes"] },
    { key: "shuffle", label: "Shuffle Questions", kind: "select", options: ["Yes", "No"] },
  ],
  Project: [
    { key: "groupSize", label: "Group Size", kind: "number", placeholder: "1" },
    { key: "format", label: "Submission Format", kind: "text", placeholder: "PDF report + model" },
    { key: "milestone", label: "Checkpoint Date", kind: "date" },
  ],
  Essay: [
    { key: "wordCount", label: "Word Count", kind: "number", placeholder: "300" },
    { key: "topic", label: "Essay Topic", kind: "text", placeholder: "My Role Model" },
  ],
  Worksheet: [
    { key: "pages", label: "Pages / Questions", kind: "text", placeholder: "Q1–Q20, page 45" },
    { key: "showWork", label: "Show Working", kind: "select", options: ["Yes", "No"] },
  ],
  Reading: [
    { key: "pages", label: "Pages / Chapter", kind: "text", placeholder: "Pages 12–18" },
    { key: "recite", label: "Recitation Required", kind: "select", options: ["No", "Yes"] },
  ],
  Activity: [
    { key: "materials", label: "Materials Needed", kind: "text", placeholder: "A4 sheet, crayons" },
    { key: "groupSize", label: "Individual / Group", kind: "select", options: ["Individual", "Group"] },
  ],
  Homework: [],
};
type QuizQ = { q: string; options: string[]; answer: number };
const blankQuizQ = (): QuizQ => ({ q: "", options: ["", "", "", ""], answer: 0 });

export default function AssignmentsPro(props: AssignmentsProProps) {
  const subjectOptions = props.subjects && props.subjects.length ? props.subjects : SUBJECT_FALLBACK;
  const [search, setSearch] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>(SEED_ASSIGNMENTS);
  const [selectedA, setSelectedA] = useState<Assignment | null>(null);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [grades, setGrades] = useState<Record<string, Record<string, string>>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Filter state (status + type)
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterType, setFilterType] = useState<string>("All");

  // Create form state
  const [createForm, setCreateForm] = useState({ name: "", type: "Homework", subject: "", due: "", dueTime: "", totalMarks: "100", description: "", instructions: "" });
  const [createMeta, setCreateMeta] = useState<Record<string, string>>({});
  const [quizQuestions, setQuizQuestions] = useState<QuizQ[]>([blankQuizQ()]);
  const [creating, setCreating] = useState(false);

  // Let the page header's "New Assignment" button drive the create dialog.
  useEffect(() => {
    if (props.createOpen && dialogType !== "create") setDialogType("create");
    if (!props.createOpen && dialogType === "create") setDialogType(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.createOpen]);

  // Bubble assignment data up for the header's context-aware export.
  useEffect(() => {
    props.onExportData?.({
      header: ["Assignment", "Subject", "Type", "Teacher", "Due Date", "Total Marks", "Submitted", "Total", "Status", "Avg Score"],
      rows: assignments.map(a => [a.name, a.subject, a.type, a.teacher, a.due, a.totalMarks ?? 100, a.submitted, a.total, a.status, a.avg]),
      filename: `${(props.classData?.name || "class").replace(/\s+/g, "-")}-assignments.csv`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  const filtersActive = filterStatus !== "All" || filterType !== "All";
  const visible = assignments.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) || a.subject.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "All" || a.status === filterStatus;
    const matchesType = filterType === "All" || a.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  function openDialog(type: DialogType, a: Assignment) {
    setSelectedA(a);
    setDialogType(type);
    setDeleteConfirm(false);
  }
  function closeDialog() {
    if (dialogType === "create") props.onCreateOpenChange?.(false);
    setDialogType(null);
    setSelectedA(null);
    setDeleteConfirm(false);
  }

  function handleDuplicate(a: Assignment) {
    const copy: Assignment = { ...a, id: `copy-${Date.now()}`, name: `${a.name} (Copy)`, status: "Upcoming", submitted: 0 };
    setAssignments(prev => [...prev, copy]);
    toast.success(`"${a.name}" duplicated`);
  }

  function handleDelete() {
    if (!selectedA) return;
    setAssignments(prev => prev.filter(a => a.id !== selectedA.id));
    toast.success(`"${selectedA.name}" deleted`);
    closeDialog();
  }

  function handleCreateSubmit() {
    if (!createForm.name || !createForm.subject || !createForm.due) {
      toast.error("Please fill in all required fields (title, subject, due date)");
      return;
    }
    setCreating(true);
    setTimeout(() => {
      const dueLabel = (() => {
        try {
          const d = new Date(createForm.due + "T00:00:00");
          return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        } catch { return createForm.due; }
      })();
      // Created date/time stamped automatically at creation.
      const now = new Date();
      const createdAt = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      // Fold the type-specific settings (and any quiz questions) into the instructions
      // so they show up in the assignment's View dialog.
      const metaLines = (TYPE_FIELDS[createForm.type] || [])
        .filter(f => createMeta[f.key])
        .map(f => `${f.label}: ${createMeta[f.key]}`);
      const validQs = createForm.type === "Quiz" ? quizQuestions.filter(q => q.q.trim()) : [];
      const quizLines = validQs.map((q, i) => `Q${i + 1}. ${q.q}  [Ans: ${q.options[q.answer] || "—"}]`);
      const fullInstructions = [createForm.instructions, ...metaLines, ...(quizLines.length ? ["", "Questions:", ...quizLines] : [])]
        .filter(Boolean).join("\n");
      const newA: Assignment = {
        id: `new-${now.getTime()}`,
        name: createForm.name,
        type: createForm.type,
        subject: createForm.subject,
        subjectColor: "bg-slate-50 text-slate-600 border-slate-200",
        teacher: "Me",
        teacherHex: C.primary,
        due: dueLabel,
        rel: createForm.dueTime ? `Due ${createForm.dueTime}` : "Upcoming",
        submitted: 0,
        total: 24,
        status: "Upcoming",
        avg: 0,
        description: createForm.description,
        dueTime: createForm.dueTime,
        totalMarks: Number(createForm.totalMarks) || 100,
        createdAt,
        instructions: fullInstructions,
      };
      setAssignments(prev => [newA, ...prev]);
      const quizNote = createForm.type === "Quiz" ? ` · ${quizQuestions.filter(q => q.q.trim()).length} questions` : "";
      toast.success(`${createForm.type} "${createForm.name}" created · ${createForm.totalMarks || 100} marks · due ${dueLabel}${quizNote}`);
      setCreateForm({ name: "", type: "Homework", subject: "", due: "", dueTime: "", totalMarks: "100", description: "", instructions: "" });
      setCreateMeta({});
      setQuizQuestions([blankQuizQ()]);
      setCreating(false);
      closeDialog();
    }, 500);
  }

  // Per-student grades for the selected assignment
  const assignmentGrades = selectedA ? (grades[selectedA.id] || {}) : {};

  function saveGrades() {
    if (!selectedA) return;
    setGrades(prev => ({ ...prev, [selectedA.id]: assignmentGrades }));
    toast.success(`Grades saved for "${selectedA.name}"`);
    closeDialog();
  }

  // Analytics data for selected assignment
  const analyticsData = MOCK_STUDENTS.slice(0, 8).map(name => ({
    name: name.split(" ")[0],
    score: Math.floor(60 + Math.random() * 40),
  }));

  const kpis = [
    { label: "Total Assignments", value: assignments.length, sub: "All Time", icon: ClipboardList, hex: "#7C3AED", light: "#F1ECFF" },
    { label: "Active Assignments", value: assignments.filter(a => a.status === "Active").length, sub: "Currently running", icon: PlayCircle, hex: "#22C55E", light: "#DCFCE7" },
    { label: "Submitted", value: "82%", sub: "Average submission", icon: CheckSquare, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Pending Review", value: 23, sub: "Needs grading", icon: ClipboardCheck, hex: "#3B82F6", light: "#DBEAFE" },
    { label: "Average Score", value: "85%", sub: "All assignments", icon: Target, hex: "#EC4899", light: "#FCE7F3" },
  ];

  return (
    <div className="space-y-5">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all">
            <CardContent className="p-5 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}>
                <k.icon style={{ color: k.hex, width: 22, height: 22 }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 truncate">{k.label}</p>
                <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{k.value}</p>
                <p className="text-[11px] text-slate-400 truncate">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* Assignments table */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="font-bold text-lg text-slate-900">Assignments <span className="text-slate-400 font-semibold">({assignments.length})</span></p>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search assignments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl border-slate-200 h-10 w-[200px]" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn("rounded-xl border-slate-200 gap-2 font-semibold text-slate-600 h-10", filtersActive && "border-violet-300 text-purple-600 bg-violet-50")}>
                    <SlidersHorizontal className="w-4 h-4" /> Filter{filtersActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">Status</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={filterStatus} onValueChange={setFilterStatus}>
                    {["All", "Active", "Upcoming", "Completed", "Overdue"].map(s => (
                      <DropdownMenuRadioItem key={s} value={s} className="text-sm">{s}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">Type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={filterType} onValueChange={setFilterType}>
                    {["All", ...ASSIGN_TYPES].map(t => (
                      <DropdownMenuRadioItem key={t} value={t} className="text-sm">{t}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {filtersActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs font-bold text-purple-600 justify-center" onClick={() => { setFilterStatus("All"); setFilterType("All"); }}>Clear filters</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-y border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="text-left px-5 py-3.5 min-w-[190px]">Assignment</th>
                  <th className="text-left px-3 py-3.5">Subject</th>
                  <th className="text-left px-3 py-3.5 min-w-[150px]">Teacher</th>
                  <th className="text-left px-3 py-3.5">Due Date</th>
                  <th className="text-left px-3 py-3.5 min-w-[140px]">Submissions</th>
                  <th className="text-center px-3 py-3.5">Status</th>
                  <th className="text-center px-3 py-3.5">Avg Score</th>
                  <th className="text-center px-3 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">No assignments found.</td></tr>
                ) : visible.map((a) => {
                  const pct = Math.round((a.submitted / a.total) * 100);
                  return (
                    <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${a.teacherHex}14` }}><FileText className="w-4 h-4" style={{ color: a.teacherHex }} /></span>
                          <div>
                            <p className="font-bold text-slate-800 leading-tight">{a.name}</p>
                            <p className="text-[11px] text-slate-400">{a.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5"><Badge variant="outline" className={cn("text-[10px] font-bold border rounded-md", a.subjectColor)}>{a.subject}</Badge></td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7"><AvatarFallback className="text-[9px] font-bold text-white" style={{ background: a.teacherHex }}>{initials(a.teacher)}</AvatarFallback></Avatar>
                          <span className="text-xs font-medium text-slate-700">{a.teacher}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-medium text-slate-700">{a.due}</p>
                        <p className={cn("text-[11px] font-semibold", a.relUrgent ? "text-rose-500" : "text-slate-400")}>{a.rel}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-slate-600">{a.submitted}/{a.total}</span><span className="text-[11px] font-bold text-slate-500">{pct}%</span></div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? C.success : pct >= 60 ? C.warning : C.error }} /></div>
                      </td>
                      <td className="px-3 py-3.5 text-center"><Badge className={cn("text-[10px] font-bold rounded-md", a.status === "Completed" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : a.status === "Overdue" ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-violet-50 text-purple-600 border border-violet-100")}>{a.status}</Badge></td>
                      <td className="px-3 py-3.5 text-center"><span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: a.avg >= 80 ? C.success : C.warning, background: a.avg >= 80 ? "#DCFCE7" : "#FEF3C7" }}>{a.avg > 0 ? `${a.avg}%` : "—"}</span></td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-violet-200" title="View details" onClick={() => openDialog("view", a)}><Eye className="w-3.5 h-3.5" /></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-xl">
                              <DropdownMenuItem className="font-medium" onClick={() => openDialog("submissions", a)}><ClipboardCheck className="w-4 h-4 mr-2" /> View Submissions</DropdownMenuItem>
                              <DropdownMenuItem className="font-medium" onClick={() => openDialog("grade", a)}><CheckSquare className="w-4 h-4 mr-2" /> Enter Grades</DropdownMenuItem>
                              <DropdownMenuItem className="font-medium" onClick={() => openDialog("analytics", a)}><BarChart3 className="w-4 h-4 mr-2" /> Analytics</DropdownMenuItem>
                              <DropdownMenuItem className="font-medium" onClick={() => handleDuplicate(a)}><Copy className="w-4 h-4 mr-2" /> Duplicate</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-600 font-medium" onClick={() => openDialog("delete", a)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <span className="text-sm text-slate-400 font-medium">Showing {visible.length} of {assignments.length} assignments</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400" disabled><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="icon" className="h-8 w-8 rounded-lg text-white" style={{ background: C.primary }}>1</Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Right analytics sidebar */}
        <div className="space-y-4">
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Assignment Overview</p>
              <div className="flex items-center gap-4">
                <div className="relative w-28 h-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={OVERVIEW} dataKey="value" innerRadius={36} outerRadius={54} paddingAngle={2} stroke="none">{OVERVIEW.map((d, i) => <PieCell key={i} fill={d.hex} />)}</Pie></PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-black text-slate-900 leading-none">{assignments.length}</span><span className="text-[9px] text-slate-400 font-semibold mt-0.5">Total</span></div>
                </div>
                <div className="flex-1 space-y-2">
                  {OVERVIEW.map(o => (
                    <div key={o.label} className="flex items-center gap-2 text-xs"><span className="font-black text-slate-700 w-3">{o.value}</span><span className="w-2 h-2 rounded-full" style={{ background: o.hex }} /><span className="text-slate-500">{o.label}</span></div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Submission Status</p>
              <div className="space-y-2.5">
                {SUBMISSION_STATUS.map(s => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-slate-600">{s.label}</span><span className="text-xs font-bold text-slate-700">{s.pct}%</span></div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.hex }} /></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Top Performing Subjects</p>
              <div className="space-y-2.5">
                {TOP_SUBJECTS.map(s => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">{s.name}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: s.hex, background: `${s.hex}18` }}>{s.score}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-2xl overflow-hidden" style={{ background: "#F5F1FF" }}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4" style={{ color: C.primary }} /><p className="font-bold" style={{ color: C.primary }}>AI Insights</p></div>
              <ul className="space-y-2 text-xs text-slate-600">
                {AI_INSIGHTS.map((t, i) => (<li key={i} className="flex items-start gap-1.5"><span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: C.primary }} /><span>{t}</span></li>))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4" style={{ color: C.primary }} /><p className="font-bold text-lg text-slate-900">Upcoming Deadlines</p></div>
            <button className="text-xs font-semibold flex items-center gap-1" style={{ color: C.primary }} onClick={() => toast.info("Open calendar")}>View Calendar <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {DEADLINES.map(d => (
              <div key={d.name} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:shadow-sm transition-all">
                <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0" style={{ background: `${d.hex}14` }}>
                  <span className="text-sm font-black leading-none" style={{ color: d.hex }}>{d.d}</span>
                  <span className="text-[9px] font-bold uppercase" style={{ color: d.hex }}>{d.m}</span>
                </div>
                <div className="min-w-0"><p className="text-xs font-bold text-slate-800 truncate">{d.name}</p><p className="text-[10px] text-slate-400">{d.rel}</p></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Dialogs ── */}

      {/* View Assignment */}
      <Dialog open={dialogType === "view"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{selectedA?.name}</DialogTitle>
            <DialogDescription>{selectedA?.type} · {selectedA?.subject} · Due {selectedA?.due}</DialogDescription>
          </DialogHeader>
          {selectedA && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-600 leading-relaxed">{selectedA.description || "No description provided."}</div>
              {selectedA.instructions && (
                <div className="p-4 rounded-xl border border-violet-100 bg-violet-50/60">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.primary }}>Instructions for students</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{selectedA.instructions}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Teacher", value: selectedA.teacher },
                  { label: "Status", value: selectedA.status },
                  { label: "Due", value: selectedA.dueTime ? `${selectedA.due} · ${selectedA.dueTime}` : selectedA.due },
                  { label: "Total Marks", value: selectedA.totalMarks ? String(selectedA.totalMarks) : "100" },
                  { label: "Submissions", value: `${selectedA.submitted} / ${selectedA.total}` },
                  { label: "Average Score", value: selectedA.avg > 0 ? `${selectedA.avg}%` : "—" },
                  ...(selectedA.createdAt ? [{ label: "Created", value: selectedA.createdAt }] : []),
                ].map(r => (
                  <div key={r.label} className="p-3 border border-slate-100 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{r.label}</p>
                    <p className="text-sm font-bold text-slate-800">{r.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Close</Button>
            <Button className="rounded-xl text-white" style={{ background: C.primary }} onClick={() => { closeDialog(); selectedA && openDialog("submissions", selectedA); }}>View Submissions</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions — clear Submitted vs Not Submitted split with reminders */}
      <Dialog open={dialogType === "submissions"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-xl rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Submissions</DialogTitle>
            <DialogDescription>{selectedA?.name}</DialogDescription>
          </DialogHeader>
          {(() => {
            const submittedCount = selectedA?.submitted || 0;
            const submitted = MOCK_STUDENTS.slice(0, submittedCount);
            const notSubmitted = MOCK_STUDENTS.slice(submittedCount, selectedA?.total ? Math.max(submittedCount, Math.min(MOCK_STUDENTS.length, submittedCount + (selectedA.total - submittedCount))) : MOCK_STUDENTS.length);
            return (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{submitted.length}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70">Submitted</p>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-center">
                  <p className="text-2xl font-black text-rose-600">{notSubmitted.length}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600/70">Not Submitted</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3 text-center">
                  <p className="text-2xl font-black text-slate-700">{Math.round((submitted.length / Math.max(1, submitted.length + notSubmitted.length)) * 100)}%</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completion</p>
                </div>
              </div>

              {/* Submitted list */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Submitted ({submitted.length})</p>
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 max-h-44 overflow-y-auto">
                  {submitted.length === 0 ? <p className="text-xs text-slate-400 p-3 text-center">No submissions yet.</p> : submitted.map((name, i) => (
                    <div key={name} className="flex items-center gap-2 px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[9px] font-bold text-emerald-700">{name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
                      <span className="text-sm font-medium text-slate-700 flex-1">{name}</span>
                      <span className="text-[10px] text-slate-400">{28 + i} May 2024</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Done</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Not submitted list + reminders */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Not Submitted ({notSubmitted.length})</p>
                  {notSubmitted.length > 0 && (
                    <Button size="sm" className="rounded-lg h-7 text-[11px] gap-1.5 text-white font-bold" style={{ background: C.primary }}
                      onClick={() => toast.success(`Reminder sent to ${notSubmitted.length} student${notSubmitted.length !== 1 ? "s" : ""} & their parents`)}>
                      <CalendarClock className="w-3.5 h-3.5" /> Remind All
                    </Button>
                  )}
                </div>
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 max-h-44 overflow-y-auto">
                  {notSubmitted.length === 0 ? <p className="text-xs text-slate-400 p-3 text-center">Everyone has submitted 🎉</p> : notSubmitted.map(name => (
                    <div key={name} className="flex items-center gap-2 px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-[9px] font-bold text-rose-700">{name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
                      <span className="text-sm font-medium text-slate-700 flex-1">{name}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600"><AlertCircle className="w-3 h-3" /> Pending</span>
                      <button onClick={() => toast.success(`Alert sent to ${name} & parent`)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">Send Alert</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Close</Button>
            <Button className="rounded-xl text-white" style={{ background: C.primary }} onClick={() => { const a = selectedA; closeDialog(); a && openDialog("grade", a); }}>Enter Grades</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grade entry */}
      <Dialog open={dialogType === "grade"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Enter Grades</DialogTitle>
            <DialogDescription>{selectedA?.name}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[380px] overflow-y-auto space-y-2">
            {MOCK_STUDENTS.slice(0, selectedA?.total || 12).map((name, i) => (
              <div key={name} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-700 shrink-0">{name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
                <span className="flex-1 text-sm font-medium text-slate-700">{name}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={0} max={100}
                    placeholder="0-100"
                    className="w-20 h-8 rounded-lg text-xs text-center"
                    value={assignmentGrades[name] || ""}
                    onChange={e => {
                      if (!selectedA) return;
                      setGrades(prev => ({
                        ...prev,
                        [selectedA.id]: { ...(prev[selectedA.id] || {}), [name]: e.target.value }
                      }));
                    }}
                  />
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Cancel</Button>
            <Button className="rounded-xl text-white font-bold" style={{ background: C.primary }} onClick={saveGrades}>Save Grades</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics */}
      <Dialog open={dialogType === "analytics"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Analytics</DialogTitle>
            <DialogDescription>{selectedA?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Avg Score", value: selectedA ? `${selectedA.avg}%` : "—", color: C.primary },
                { label: "Submitted", value: selectedA ? `${selectedA.submitted}/${selectedA.total}` : "—", color: C.success },
                { label: "Completion", value: selectedA ? `${Math.round((selectedA.submitted / selectedA.total) * 100)}%` : "—", color: C.warning },
              ].map(s => (
                <div key={s.label} className="p-3 rounded-xl border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                  <p className="text-xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Score Distribution (Top 8 Students)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }} formatter={(v: number) => [`${v}%`, "Score"]} />
                    <Bar dataKey="score" fill={C.primary} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Assignment */}
      <Dialog open={dialogType === "create"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create Assignment</DialogTitle>
            <DialogDescription>Add a new assignment for {props.classData?.name || "this class"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Title *</Label>
              <Input placeholder="e.g. English - My Family Essay" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="mt-1.5 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subject *</Label>
                <Select value={createForm.subject} onValueChange={v => setCreateForm(f => ({ ...f, subject: v }))}>
                  <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent className="rounded-xl max-h-56">
                    {subjectOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type</Label>
                <Select value={createForm.type} onValueChange={v => setCreateForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl max-h-56">
                    {ASSIGN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Date *</Label>
                <Input type="date" value={createForm.due} onChange={e => setCreateForm(f => ({ ...f, due: e.target.value }))} className="mt-1.5 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Time</Label>
                <Input type="time" value={createForm.dueTime} onChange={e => setCreateForm(f => ({ ...f, dueTime: e.target.value }))} className="mt-1.5 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Marks</Label>
                <Input type="number" min={1} max={1000} value={createForm.totalMarks} onChange={e => setCreateForm(f => ({ ...f, totalMarks: e.target.value }))} className="mt-1.5 rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</Label>
              <textarea
                placeholder="Short summary of the assignment..."
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
              />
            </div>
            {/* Type-aware guidance so the admin shares everything the student needs */}
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <Label className="text-xs font-bold uppercase tracking-wider" style={{ color: C.primary }}>{(TYPE_FLOW[createForm.type] || TYPE_FLOW.Homework).label}</Label>
              <textarea
                placeholder={(TYPE_FLOW[createForm.type] || TYPE_FLOW.Homework).placeholder}
                value={createForm.instructions}
                onChange={e => setCreateForm(f => ({ ...f, instructions: e.target.value }))}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#9810fa]/20"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1"><Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.primary }} />{(TYPE_FLOW[createForm.type] || TYPE_FLOW.Homework).hint}</p>
            </div>

            {/* Type-specific structured settings — the admin customises by type */}
            {(TYPE_FIELDS[createForm.type] || []).length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{createForm.type} Settings</p>
                <div className="grid grid-cols-2 gap-3">
                  {(TYPE_FIELDS[createForm.type] || []).map(f => (
                    <div key={f.key}>
                      <Label className="text-[11px] font-semibold text-slate-500">{f.label}</Label>
                      {f.kind === "select" ? (
                        <Select value={createMeta[f.key] || f.options![0]} onValueChange={v => setCreateMeta(m => ({ ...m, [f.key]: v }))}>
                          <SelectTrigger className="mt-1 rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">{f.options!.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input type={f.kind} placeholder={f.placeholder} value={createMeta[f.key] || ""}
                          onChange={e => setCreateMeta(m => ({ ...m, [f.key]: e.target.value }))} className="mt-1 rounded-xl h-9 text-sm" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Real quiz builder — only for Quiz type */}
            {createForm.type === "Quiz" && (
              <div className="rounded-xl border border-violet-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.primary }}>Quiz Questions ({quizQuestions.length})</p>
                  <button className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.primary }}
                    onClick={() => setQuizQuestions(qs => [...qs, blankQuizQ()])}>+ Add Question</button>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {quizQuestions.map((q, qi) => (
                    <div key={qi} className="rounded-lg border border-slate-100 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 w-5">Q{qi + 1}</span>
                        <Input placeholder="Question text" value={q.q}
                          onChange={e => setQuizQuestions(qs => qs.map((x, i) => i === qi ? { ...x, q: e.target.value } : x))}
                          className="rounded-lg h-9 text-sm flex-1" />
                        {quizQuestions.length > 1 && (
                          <button className="text-rose-400 hover:text-rose-600" onClick={() => setQuizQuestions(qs => qs.filter((_, i) => i !== qi))}><X className="w-4 h-4" /></button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-7">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-1.5">
                            <button title="Mark correct" onClick={() => setQuizQuestions(qs => qs.map((x, i) => i === qi ? { ...x, answer: oi } : x))}
                              className={cn("w-4 h-4 rounded-full border shrink-0", q.answer === oi ? "bg-emerald-500 border-emerald-500" : "border-slate-300")} />
                            <Input placeholder={`Option ${oi + 1}`} value={opt}
                              onChange={e => setQuizQuestions(qs => qs.map((x, i) => i === qi ? { ...x, options: x.options.map((o, j) => j === oi ? e.target.value : o) } : x))}
                              className="rounded-lg h-8 text-xs" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Tap the circle to mark the correct option. This builds a real, gradable quiz students take live.</p>
              </div>
            )}

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Created date &amp; time are stamped automatically when you create the assignment.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Cancel</Button>
            <Button className="rounded-xl text-white font-bold" style={{ background: C.primary }} onClick={handleCreateSubmit} disabled={creating}>
              {creating ? "Creating…" : "Create Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={dialogType === "delete"} onOpenChange={o => !o && closeDialog()}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-2">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <DialogTitle className="text-center text-xl font-bold">Delete Assignment?</DialogTitle>
            <DialogDescription className="text-center">
              This will permanently delete <span className="font-bold text-slate-800">"{selectedA?.name}"</span>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={closeDialog} className="flex-1 rounded-xl">Cancel</Button>
            <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
