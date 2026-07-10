import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects, SubjectAssignment } from "@/hooks/useMySubjects";
import { useGrades } from '@/contexts/CurriculumContext';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts, AttemptRow } from "@/lib/assessmentAttempts";
import { notifyClassPublish, publishDueScheduledAssessments } from "@/lib/classPublishNotify";
import {
  Plus, Search, Filter, Eye, BarChart3, MoreVertical,
  ChevronLeft, ChevronRight, Calendar, Clock,
  Check, X, AlertCircle, GripVertical, Copy, Trash2,
  ChevronDown, Upload, Download, ArrowLeft, ArrowRight,
  FileText, ClipboardCheck, Lightbulb, Edit2, Users,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type AssessmentType = "Quiz" | "Worksheet" | "Project" | "Lab Assessment" | "Test" | "Oral Assessment" | "Practical" | "Assignment";
type QType = "MCQ" | "True/False" | "Short Answer" | "Long Answer" | "Fill in the Blank" | "Match the Following" | "Essay" | "Diagram Based";
type AStatus = "Active" | "Upcoming" | "Completed" | "Draft";

interface Option { id: string; text: string }
interface MatchPair { left: string; right: string }
interface Question {
  id: string; type: QType; text: string; marks: number;
  options?: Option[]; correctAnswer?: string;
  matchPairs?: MatchPair[];
}

interface Assessment {
  id: string; title: string; chapter: string; type: AssessmentType;
  grade: string; section: string; subject: string; date: string;
  duration: number; totalMarks: number; passingMarks: number;
  description: string; questions: Question[];
  submissions: number; totalStudents: number; status: AStatus;
  createdAt: string;
  /** The teacher who created this assessment — the list view's "only show my
   * own assessments" filter rejects any row with no teacher, so this must
   * always be set on create or a teacher can never see what they just
   * published. */
  teacher?: string;
  /** Set when "Schedule for later" is used — the assessment stays "Upcoming"
   * until this time passes, at which point it auto-publishes (see
   * publishDueScheduledAssessments in classPublishNotify.ts). */
  scheduledAt?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "Quiz":            "bg-violet-100 text-violet-700",
  "Worksheet":       "bg-orange-100 text-orange-700",
  "Project":         "bg-green-100 text-green-700",
  "Lab Assessment":  "bg-teal-100 text-teal-700",
  "Test":            "bg-blue-100 text-blue-700",
  "Oral Assessment": "bg-pink-100 text-pink-700",
  "Practical":       "bg-amber-100 text-amber-700",
  "Assignment":      "bg-indigo-100 text-indigo-700",
};

const STATUS_COLORS: Record<string, string> = {
  Active:    "bg-emerald-100 text-emerald-700",
  Upcoming:  "bg-blue-100 text-blue-700",
  Completed: "bg-slate-100 text-slate-600",
  Draft:     "bg-amber-100 text-amber-700",
};

const TYPE_DOT: Record<string, string> = {
  "Quiz":            "bg-violet-500",
  "Worksheet":       "bg-orange-400",
  "Project":         "bg-emerald-500",
  "Lab Assessment":  "bg-teal-500",
  "Test":            "bg-blue-500",
  "Oral Assessment": "bg-pink-500",
};

const SUBJECTS = ["Mathematics","English Language","Arabic","Science","Physics","Chemistry","Biology","Social Studies","Islamic Studies","Computer Science","Physical Education","Art","Music","History","Geography"];
const SECTIONS = ["A","B","C","D","E"];
const CHAPTERS = ["Chapter 1","Chapter 2","Chapter 3","Chapter 4","Chapter 5","Chapter 6","Chapter 7","Chapter 8","Chapter 9","Chapter 10"];
const A_TYPES: AssessmentType[] = ["Quiz","Worksheet","Project","Lab Assessment","Test","Oral Assessment","Practical","Assignment"];
const Q_TYPES: QType[] = ["MCQ","True/False","Short Answer","Long Answer","Fill in the Blank","Match the Following","Essay","Diagram Based"];

function uid() { return `A${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`; }
function qid() { return `Q${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

function daysLeft(date: string): { text: string; urgent: boolean } {
  if (!date) return { text: "—", urgent: false };
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: "Completed", urgent: false };
  if (diff === 0) return { text: "Today", urgent: true };
  return { text: `${diff} days left`, urgent: diff <= 3 };
}

function formatDueDate(date: string): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatSubmittedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  let offset = 0;
  const r = 44, circ = 2 * Math.PI * r;
  const slices = data.map(d => {
    const pct = total > 0 ? d.value / total : 0;
    const dash = pct * circ;
    const s = { ...d, dash, offset };
    offset += dash;
    return s;
  });
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
      {slices.map((s, i) => (
        <circle key={i} cx="50" cy="50" r={r} fill="none"
          stroke={s.color} strokeWidth="12"
          strokeDasharray={`${s.dash} ${circ - s.dash}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
      ))}
      <text x="50" y="46" textAnchor="middle" className="text-slate-900" fontSize="14" fontWeight="800" fill="currentColor">{total}</text>
      <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#94a3b8">Total</text>
    </svg>
  );
}

// ─── Step Bar ────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Basic Information", sub: "Assessment details" },
  { n: 2, label: "Questions",         sub: "Add questions" },
  { n: 3, label: "Settings",          sub: "Set options" },
  { n: 4, label: "Review & Publish",  sub: "Review and publish" },
];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done = s.n < step, active = s.n === step;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 transition-all",
                done ? "bg-[#7C3AED] text-white" :
                active ? "bg-[#7C3AED] text-white ring-4 ring-[#7C3AED]/20" :
                "bg-slate-100 text-slate-400"
              )}>
                {done ? <Check className="h-4 w-4" /> : s.n}
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className={cn("text-[12px] font-bold leading-tight whitespace-nowrap",
                  active ? "text-[#7C3AED]" : done ? "text-slate-700" : "text-slate-400")}>
                  {s.label}
                </p>
                <p className="text-[10px] text-slate-400 whitespace-nowrap">{s.sub}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("w-8 h-0.5 mx-3 shrink-0", done ? "bg-[#7C3AED]" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Question Editor ─────────────────────────────────────────────────────────

function QEditor({ q, onSave, onClose }: {
  q: Partial<Question>; onSave: (q: Question) => void; onClose: () => void;
}) {
  const [data, setData] = useState<Partial<Question>>({
    type: "MCQ", text: "", marks: 1,
    options: [{ id: qid(), text: "" }, { id: qid(), text: "" }, { id: qid(), text: "" }, { id: qid(), text: "" }],
    ...q,
  });
  function set<K extends keyof Question>(k: K, v: Question[K]) { setData(d => ({ ...d, [k]: v })); }
  function changeType(t: QType) {
    const defaults: Partial<Question> = { type: t, text: data.text || "", marks: data.marks || 1, correctAnswer: undefined };
    if (t === "MCQ") defaults.options = [{ id: qid(), text: "" }, { id: qid(), text: "" }, { id: qid(), text: "" }, { id: qid(), text: "" }];
    if (t === "Match the Following") defaults.matchPairs = [{ left: "", right: "" }, { left: "", right: "" }];
    setData(defaults);
  }
  function save() {
    if (!data.text?.trim()) { toast.error("Enter question text"); return; }
    onSave({ id: data.id || qid(), type: data.type || "MCQ", text: data.text!, marks: data.marks || 1, options: data.options, correctAnswer: data.correctAnswer, matchPairs: data.matchPairs });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-black text-slate-900">{data.id ? "Edit Question" : "Add Question"}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Question Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Q_TYPES.map(t => (
                <button key={t} onClick={() => changeType(t)}
                  className={cn("px-3 py-2 rounded-xl border text-[11px] font-semibold text-left transition-all",
                    data.type === t ? "border-[#7C3AED] bg-violet-50 text-[#7C3AED]" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Text */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Question *</label>
            <textarea value={data.text || ""} onChange={e => set("text", e.target.value)}
              placeholder="Enter question text…" rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 resize-none" />
          </div>
          {/* MCQ Options */}
          {data.type === "MCQ" && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Options (click circle = correct answer)</label>
              {(data.options || []).map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <button onClick={() => set("correctAnswer", opt.id)}
                    className={cn("w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                      data.correctAnswer === opt.id ? "border-emerald-500 bg-emerald-500" : "border-slate-300")}>
                    {data.correctAnswer === opt.id && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <span className="text-[11px] font-bold text-slate-400 w-5 shrink-0">{String.fromCharCode(65+i)})</span>
                  <input value={opt.text} onChange={e => set("options", (data.options||[]).map(o => o.id===opt.id?{...o,text:e.target.value}:o))}
                    placeholder={`Option ${String.fromCharCode(65+i)}`}
                    className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]" />
                </div>
              ))}
            </div>
          )}
          {/* True/False */}
          {data.type === "True/False" && (
            <div className="flex gap-3">
              {["True","False"].map(v => (
                <button key={v} onClick={() => set("correctAnswer", v)}
                  className={cn("flex-1 h-10 rounded-xl border-2 text-sm font-bold transition-all",
                    data.correctAnswer===v ? (v==="True"?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-rose-500 bg-rose-50 text-rose-700") : "border-slate-200 text-slate-500 hover:border-slate-300")}>
                  {v==="True"?"✓ True":"✗ False"}
                </button>
              ))}
            </div>
          )}
          {/* Match */}
          {data.type === "Match the Following" && (
            <div className="space-y-2">
              {(data.matchPairs||[]).map((p,i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input value={p.left} onChange={e=>{const mp=[...(data.matchPairs||[])];mp[i]={...mp[i],left:e.target.value};set("matchPairs",mp);}}
                    placeholder={`Column A ${i+1}`} className="h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
                  <input value={p.right} onChange={e=>{const mp=[...(data.matchPairs||[])];mp[i]={...mp[i],right:e.target.value};set("matchPairs",mp);}}
                    placeholder={`Column B ${i+1}`} className="h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
                </div>
              ))}
              <button onClick={()=>set("matchPairs",[...(data.matchPairs||[]),{left:"",right:""}])}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]"><Plus className="h-3 w-3"/>Add Pair</button>
            </div>
          )}
          {/* Marks */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Marks</label>
            <input type="number" min={1} value={data.marks||1} onChange={e=>set("marks",Number(e.target.value))}
              className="w-24 h-9 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} className="h-9 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">Save Question</button>
        </div>
      </div>
    </div>
  );
}

// ─── Assessment Summary Sidebar ───────────────────────────────────────────────

function SummaryPanel({ data, questions }: { data: Partial<Assessment>; questions: Question[] }) {
  const total = questions.reduce((a,q)=>a+q.marks,0);
  const rows = [
    { label: "Type",          value: data.type || "—" },
    { label: "Class / Grade", value: data.grade || "—" },
    { label: "Section",       value: data.section ? `Section ${data.section}` : "—" },
    { label: "Subject",       value: data.subject || "—" },
    { label: "Chapter / Topic", value: data.chapter || "—" },
    { label: "Date",          value: data.date || "—" },
    { label: "Duration",      value: data.duration ? `${data.duration} Minutes` : "—" },
    { label: "Total Marks",   value: data.totalMarks ? String(data.totalMarks) : (total > 0 ? String(total) : "—") },
    { label: "Passing Marks", value: data.passingMarks ? String(data.passingMarks) : "—" },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <ClipboardCheck className="h-5 w-5 text-[#7C3AED]" />
          </div>
          <p className="font-black text-slate-900">Assessment Summary</p>
        </div>
        <div className="space-y-2.5">
          {rows.map(r => (
            <div key={r.label} className="flex justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-medium shrink-0">{r.label}</span>
              <span className="text-[11px] font-semibold text-slate-700 text-right">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-[12px] font-bold text-blue-800">About Assessment</p>
        </div>
        <p className="text-[11px] text-blue-700">Assessments help you evaluate student performance through tests, quizzes, exams, and other evaluations.</p>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-[12px] font-bold text-amber-800">Tips</p>
        </div>
        <ul className="space-y-1.5">
          {["Add clear and easy to understand questions.", "Set appropriate time and marks.", "Review before publishing."].map(t => (
            <li key={t} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <Check className="h-3 w-3 text-amber-500 mt-0.5 shrink-0"/>{t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Question Summary Sidebar ─────────────────────────────────────────────────

function QuestionSummaryPanel({ questions }: { questions: Question[] }) {
  const byType = Q_TYPES.map(t => ({ type: t, count: questions.filter(q=>q.type===t).length, marks: questions.filter(q=>q.type===t).reduce((a,q)=>a+q.marks,0) })).filter(x=>x.count>0);
  const totalQ = questions.length;
  const totalM = questions.reduce((a,q)=>a+q.marks,0);
  const COLORS = ["#7C3AED","#3B82F6","#10B981","#F59E0B","#06B6D4","#EC4899","#EF4444","#8B5CF6"];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="font-black text-slate-900 mb-3">Question Summary</p>
        <div className="w-36 h-36 mx-auto mb-3 relative">
          <DonutChart
            data={byType.map((x,i)=>({ label: x.type, value: x.marks, color: COLORS[i%COLORS.length] }))}
            total={totalM}
          />
        </div>
        <div className="space-y-1.5">
          {byType.map((x,i) => (
            <div key={x.type} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i%COLORS.length] }} />
              <span className="text-[11px] text-slate-600 flex-1 truncate">{x.type}</span>
              <span className="text-[11px] font-bold text-slate-700">{x.marks}({x.count})</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="font-black text-slate-900 mb-3">Question Breakdown</p>
        <div className="space-y-1.5 mb-3">
          {byType.map((x,i) => (
            <div key={x.type} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: COLORS[i%COLORS.length] }} />
                <span className="text-[11px] text-slate-600">{x.type}</span>
              </div>
              <span className="text-[11px] font-bold text-slate-900">{x.count}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <div className="flex justify-between"><span className="text-[11px] font-bold text-slate-600">Total Questions</span><span className="text-[11px] font-black text-slate-900">{totalQ}</span></div>
          <div className="flex justify-between"><span className="text-[11px] font-bold text-slate-600">Total Marks</span><span className="text-[11px] font-black text-[#7C3AED]">{totalM}</span></div>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2"><Lightbulb className="h-4 w-4 text-amber-500"/><p className="text-[12px] font-bold text-amber-800">Tips</p></div>
        <ul className="space-y-1.5">
          {["Use a mix of different question types.","Keep questions clear and concise.","Review the total marks and time."].map(t=>(
            <li key={t} className="flex items-start gap-1.5 text-[11px] text-amber-700"><Check className="h-3 w-3 text-amber-500 mt-0.5 shrink-0"/>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ data, onChange, tc, mySubjects }: { data: Partial<Assessment>; onChange: (d: Partial<Assessment>) => void; tc: any; mySubjects: SubjectAssignment[] }) {
  function set<K extends keyof Assessment>(k: K, v: Assessment[K]) { onChange({ ...data, [k]: v }); }
  const charCount = (data.description || "").length;

  // Rich text editor for Description — the toolbar buttons (Bold, Italic,
  // Underline, etc.) were purely decorative with no onClick handlers, and a
  // plain <textarea> can't render formatting anyway. Mirrors the working
  // contentEditable + execCommand editor already used in CreateAssignment.tsx.
  const descRef = useRef<HTMLDivElement>(null);
  const descInitialized = useRef(false);
  useEffect(() => {
    if (descInitialized.current) return;
    if (descRef.current && data.description) {
      descRef.current.innerHTML = data.description;
    }
    descInitialized.current = true;
  }, [data.description]);
  function execDescFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    descRef.current?.focus();
    set("description", descRef.current?.innerHTML || "");
  }
  const descEmpty = !(data.description || "").replace(/<[^>]+>/g, "").trim();

  // Strict Subject → Teacher → Grade → Section mapping: a teacher may only create
  // assessments for grade/subject/section combos they are explicitly assigned to
  // via Subject Allocation (subject_assignments). Mirrors MarksEntry.tsx / TeacherExams.tsx.
  const assignedGrades = useMemo(() => [...new Set(mySubjects.map(a => a.grade))], [mySubjects]);
  const assignedSubjectsForGrade = useMemo(
    () => [...new Set(mySubjects.filter(a => !data.grade || a.grade === data.grade).map(a => a.subject))],
    [mySubjects, data.grade]
  );
  const assignedSectionsForGradeSubject = useMemo(
    () => [...new Set(mySubjects
      .filter(a => (!data.grade || a.grade === data.grade) && (!data.subject || a.subject === data.subject))
      .map(a => a.section))],
    [mySubjects, data.grade, data.subject]
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-5">
        <div>
          <h2 className="text-lg font-black text-slate-900 mb-0.5">Assessment Information</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Title */}
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Assessment Title *</label>
              <input value={data.title||""} onChange={e=>set("title",e.target.value)}
                maxLength={200} placeholder="e.g. Chapter 5 – Plants and Their Functions Test"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
              <p className="text-[10px] text-slate-400 mt-1 text-right">{(data.title||"").length}/200</p>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Chapter / Topic *</label>
              <select value={data.chapter||""} onChange={e=>set("chapter",e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
                <option value="">Select chapter…</option>
                {CHAPTERS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Assessment Type *</label>
            <select value={data.type||""} onChange={e=>set("type",e.target.value as AssessmentType)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">Select type…</option>
              {A_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Class / Grade *</label>
            <select value={data.grade||""} onChange={e=>onChange({ ...data, grade: e.target.value, subject: "", section: "" })}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">Select grade…</option>
              {assignedGrades.map(g=><option key={g}>{g}</option>)}
            </select>
            {assignedGrades.length === 0 && (
              <p className="text-[10px] text-rose-500 mt-1">No subject assigned to you yet — contact admin.</p>
            )}
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Due Date *</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none"/>
              <input type="date" value={data.date||""} onChange={e=>set("date",e.target.value)}
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Subject *</label>
            <select value={data.subject||""} onChange={e=>onChange({ ...data, subject: e.target.value, section: "" })}
              disabled={!data.grade}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">Select subject…</option>
              {assignedSubjectsForGrade.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Section *</label>
            <select value={data.section||""} onChange={e=>set("section",e.target.value)}
              disabled={!data.subject}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">Select section…</option>
              {assignedSectionsForGradeSubject.map(s=><option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Passing Marks</label>
            <input type="number" min={0} value={data.passingMarks||""} onChange={e=>set("passingMarks",Number(e.target.value))}
              placeholder="Minimum marks to pass"
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Total Marks *</label>
            <input type="number" min={1} value={data.totalMarks||""} onChange={e=>set("totalMarks",Number(e.target.value))}
              placeholder="Maximum marks for this assessment"
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Duration *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none"/>
                <input type="number" min={5} value={data.duration||""} onChange={e=>set("duration",Number(e.target.value))}
                  placeholder="45" className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
              </div>
              <div className="flex items-center h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 shrink-0">Minutes</div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Time allowed for students</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Description (Optional)</label>
          <div className="rounded-xl border border-slate-200 overflow-hidden focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-violet-100 transition-all">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
              {([
                {icon:"N",  label:"Normal",    cmd:"removeFormat"},
                {icon:"B",  label:"Bold",      cmd:"bold"},
                {icon:"I",  label:"Italic",    cmd:"italic"},
                {icon:"U",  label:"Underline", cmd:"underline"},
                {icon:"≡",  label:"Bullet",    cmd:"insertUnorderedList"},
                {icon:"1.", label:"Numbered",  cmd:"insertOrderedList"},
                {icon:"🔗", label:"Link",      cmd:"createLink"},
                {icon:"🖼", label:"Image",     cmd:"insertImage"},
              ] as const).map(b=>(
                <button key={b.icon} type="button" title={b.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (b.cmd === "createLink") {
                      const url = prompt("Enter URL:");
                      if (url) execDescFormat(b.cmd, url);
                    } else if (b.cmd === "insertImage") {
                      const url = prompt("Enter image URL:");
                      if (url) execDescFormat(b.cmd, url);
                    } else {
                      execDescFormat(b.cmd);
                    }
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-500 hover:bg-white hover:text-[#7C3AED] transition-colors">
                  {b.icon}
                </button>
              ))}
            </div>
            <div className="relative">
              {descEmpty && (
                <div className="absolute top-3 left-4 text-slate-300 text-sm pointer-events-none select-none">
                  This assessment evaluates students' understanding of plant parts, photosynthesis, and the importance of plants in our environment.
                </div>
              )}
              <div
                ref={descRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => set("description", descRef.current?.innerHTML || "")}
                className="min-h-[100px] px-4 py-3 text-sm text-slate-800 outline-none prose prose-sm max-w-none"
              />
            </div>
            <div className="flex justify-end px-3 py-1 border-t border-slate-100 bg-slate-50">
              <span className="text-[10px] text-slate-400">{charCount}/500</span>
            </div>
          </div>
        </div>
      </div>
      <div className="w-72 shrink-0">
        <SummaryPanel data={data} questions={[]} />
      </div>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({ questions, onChange }: { questions: Question[]; onChange: (qs: Question[]) => void }) {
  const [modal, setModal] = useState<Partial<Question> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function saveQ(q: Question) {
    const exists = questions.find(x=>x.id===q.id);
    onChange(exists ? questions.map(x=>x.id===q.id?q:x) : [...questions, q]);
    setModal(null);
  }
  function deleteQ(id: string) { onChange(questions.filter(q=>q.id!==id)); }
  function duplicateQ(q: Question) { onChange([...questions, { ...q, id: qid() }]); }

  // Template matches exactly what handleImportCSV below expects — Column A/B/
  // C/D are optional (leave blank for non-MCQ types), Correct Answer accepts
  // A/B/C/D for MCQ or True/False for that type.
  function downloadTemplate() {
    const rows = [
      ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer (A/B/C/D)", "Marks"],
      ["What is the capital of Oman?", "Dubai", "Muscat", "Riyadh", "Doha", "B", "1"],
      ["The sun rises in the east.", "True", "False", "", "", "True", "1"],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "assessment_questions_template.xlsx");
    toast.success("Template downloaded");
  }

  // Real CSV/XLSX import — previously the "Import CSV" button had no handler
  // at all and silently did nothing.
  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { toast.error("File has no question rows"); return; }
        const header = (rows[0] as string[]).map(h => String(h).toLowerCase().trim());
        const qCol = header.findIndex(h => h.includes("question"));
        const aCol = header.findIndex(h => h.includes("option a"));
        const bCol = header.findIndex(h => h.includes("option b"));
        const cCol = header.findIndex(h => h.includes("option c"));
        const dCol = header.findIndex(h => h.includes("option d"));
        const ansCol = header.findIndex(h => h.includes("correct"));
        const marksCol = header.findIndex(h => h.includes("mark"));
        if (qCol === -1) { toast.error("Could not find a Question column — use the template"); return; }

        const imported: Question[] = [];
        for (const row of rows.slice(1)) {
          const text = String(row[qCol] ?? "").trim();
          if (!text) continue;
          const opts = [aCol, bCol, cCol, dCol]
            .map(ci => (ci >= 0 ? String(row[ci] ?? "").trim() : ""))
            .filter(Boolean);
          const rawAnswer = String(row[ansCol] ?? "").trim();
          const marks = marksCol >= 0 ? Number(row[marksCol]) || 1 : 1;

          if (opts.length === 2 && opts.every(o => /^(true|false)$/i.test(o))) {
            // True/False row
            imported.push({ id: qid(), type: "True/False", text, marks, correctAnswer: /^true$/i.test(rawAnswer) ? "True" : "False" });
          } else if (opts.length >= 2) {
            const options: Option[] = opts.map(t => ({ id: qid(), text: t }));
            const answerLetter = rawAnswer.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, ...
            const correct = options[answerLetter]?.id;
            imported.push({ id: qid(), type: "MCQ", text, marks, options, correctAnswer: correct });
          } else {
            // No options given — treat as a short answer question
            imported.push({ id: qid(), type: "Short Answer", text, marks });
          }
        }
        if (imported.length === 0) { toast.error("No valid questions found in file"); return; }
        onChange([...questions, ...imported]);
        toast.success(`Imported ${imported.length} question${imported.length !== 1 ? "s" : ""}`);
      } catch {
        toast.error("Failed to parse file — make sure it's a valid .xlsx or .csv using the template");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  const Q_TYPE_COLORS: Record<string,string> = {
    "MCQ":"bg-violet-100 text-violet-700","True/False":"bg-blue-100 text-blue-700",
    "Short Answer":"bg-emerald-100 text-emerald-700","Long Answer":"bg-teal-100 text-teal-700",
    "Fill in the Blank":"bg-orange-100 text-orange-700","Match the Following":"bg-pink-100 text-pink-700",
    "Essay":"bg-amber-100 text-amber-700","Diagram Based":"bg-indigo-100 text-indigo-700",
  };

  return (
    <>
      {modal && <QEditor q={modal} onSave={saveQ} onClose={()=>setModal(null)} />}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Questions ({questions.length})</h2>
              <p className="text-sm text-slate-400">Add questions to your assessment.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setModal({})}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[12px] font-bold shadow-[0_4px_14px_rgba(124,58,237,0.3)]">
                <Plus className="h-3.5 w-3.5"/> Add Question
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportCSV}/>
              <button onClick={()=>fileInputRef.current?.click()}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5"/> Import CSV
              </button>
              <button onClick={downloadTemplate}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50">
                <FileText className="h-3.5 w-3.5"/> Download Template
              </button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
                <FileText className="h-7 w-7 text-[#7C3AED]"/>
              </div>
              <p className="font-bold text-slate-900 mb-1">No questions yet</p>
              <p className="text-sm text-slate-400 mb-4">Click "Add Question" to start building your assessment</p>
              <button onClick={()=>setModal({})}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">
                <Plus className="h-4 w-4"/> Add Question
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map((q,i) => (
                <div key={q.id} className="flex items-start gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 hover:shadow-sm transition-shadow">
                  <GripVertical className="h-4 w-4 text-slate-300 mt-1 cursor-grab shrink-0"/>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[12px] font-black text-slate-600 shrink-0 mt-0.5">{i+1}</div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0 mt-1", Q_TYPE_COLORS[q.type]||"bg-slate-100 text-slate-600")}>{q.type}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{q.text}</p>
                    {q.type==="MCQ" && q.options && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {q.options.map((o,j)=>`${String.fromCharCode(65+j)}) ${o.text||"—"}`).join("  ")}
                      </p>
                    )}
                  </div>
                  <span className="text-[12px] font-bold text-slate-600 shrink-0 mt-1">{q.marks} Mark{q.marks!==1?"s":""}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={()=>setModal(q)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                      <Edit2 className="h-3.5 w-3.5 text-slate-400"/>
                    </button>
                    <button onClick={()=>duplicateQ(q)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                      <Copy className="h-3.5 w-3.5 text-slate-400"/>
                    </button>
                    <button onClick={()=>deleteQ(q.id)} className="w-7 h-7 rounded-lg hover:bg-rose-100 flex items-center justify-center">
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500"/>
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={()=>setModal({})}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-[#7C3AED] hover:text-[#7C3AED] hover:bg-violet-50 text-sm font-semibold transition-colors mt-2">
                <Plus className="h-4 w-4"/> Add Another Question
              </button>
            </div>
          )}
        </div>
        <div className="w-72 shrink-0">
          <QuestionSummaryPanel questions={questions}/>
        </div>
      </div>
    </>
  );
}

// ─── Step 3 – Settings (simple) ───────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={()=>onChange(!on)} className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0", on?"bg-[#7C3AED]":"bg-slate-200")}>
      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", on&&"translate-x-5")}/>
    </button>
  );
}

interface Settings3 { shuffle: boolean; showTimer: boolean; negativeMarking: boolean; submissionMode: "offline"|"online"; resultRelease: "immediate"|"manual" }
const DEF_SETTINGS: Settings3 = { shuffle: false, showTimer: true, negativeMarking: false, submissionMode: "offline", resultRelease: "manual" };

function Step3({ settings, onChange, data, scheduleEnabled, setScheduleEnabled, scheduledAt, setScheduledAt }: {
  settings: Settings3; onChange: (s: Settings3) => void; data: Partial<Assessment>;
  scheduleEnabled: boolean; setScheduleEnabled: (v: boolean) => void;
  scheduledAt: string; setScheduledAt: (v: string) => void;
}) {
  function set<K extends keyof Settings3>(k: K, v: Settings3[K]) { onChange({ ...settings, [k]: v }); }
  const Row = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div><p className="text-sm font-semibold text-slate-800">{label}</p>{desc&&<p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>}</div>
      {children}
    </div>
  );
  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <h2 className="text-lg font-black text-slate-900">Assessment Settings</h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">General</p>
          <Row label="Shuffle Questions" desc="Randomize question order for each student"><Toggle on={settings.shuffle} onChange={v=>set("shuffle",v)}/></Row>
          <Row label="Show Timer" desc="Display countdown timer to students"><Toggle on={settings.showTimer} onChange={v=>set("showTimer",v)}/></Row>
          <Row label="Negative Marking" desc="Deduct marks for incorrect answers"><Toggle on={settings.negativeMarking} onChange={v=>set("negativeMarking",v)}/></Row>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Submission</p>
          <Row label="Submission Mode">
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {(["offline","online"] as const).map(m=>(
                <button key={m} onClick={()=>set("submissionMode",m)}
                  className={cn("px-4 py-1.5 text-[11px] font-bold capitalize transition-colors",
                    settings.submissionMode===m?"bg-[#7C3AED] text-white":"text-slate-500 hover:bg-slate-50")}>
                  {m==="offline"?"📄 Offline":"🌐 Online"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Result Release">
            <select value={settings.resultRelease} onChange={e=>set("resultRelease",e.target.value as any)}
              className="h-8 px-3 rounded-xl border border-slate-200 text-[12px] outline-none focus:border-[#7C3AED] bg-white">
              <option value="immediate">Immediately after submission</option>
              <option value="manual">Manual release</option>
            </select>
          </Row>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Publishing</p>
          <Row label="Schedule for later" desc="Publish automatically at a future date & time instead of right now">
            <Toggle on={scheduleEnabled} onChange={setScheduleEnabled}/>
          </Row>
          {scheduleEnabled && (
            <div className="pt-3">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Scheduled Publish Date & Time</label>
              <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"/>
              <p className="text-[11px] text-[#7C3AED] mt-1">Students, parents, and the class teacher will be notified automatically once it goes live.</p>
            </div>
          )}
        </div>
      </div>
      <div className="w-72 shrink-0"><SummaryPanel data={data} questions={[]}/></div>
    </div>
  );
}

// ─── Step 4 – Review & Publish ────────────────────────────────────────────────

function Step4({ data, questions, onPublish, onDraft, scheduleEnabled, scheduledAt }: {
  data: Partial<Assessment>; questions: Question[];
  onPublish: () => void; onDraft: () => void;
  scheduleEnabled: boolean; scheduledAt: string;
}) {
  const totalM = questions.reduce((a,q)=>a+q.marks,0);
  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <h2 className="text-lg font-black text-slate-900">Review & Publish</h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Assessment Summary</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label:"Title", value: data.title||"—" },
              { label:"Type", value: data.type||"—" },
              { label:"Subject", value: data.subject||"—" },
              { label:"Grade", value: data.grade||"—" },
              { label:"Section", value: data.section?`Section ${data.section}`:"All" },
              { label:"Date", value: data.date||"—" },
              { label:"Duration", value: data.duration?`${data.duration} min`:"—" },
              { label:"Total Marks", value: data.totalMarks?String(data.totalMarks):(totalM?String(totalM):"—") },
              { label:"Passing Marks", value: data.passingMarks?String(data.passingMarks):"—" },
              { label:"Questions", value: String(questions.length) },
            ].map(r=>(
              <div key={r.label} className="flex gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-28 shrink-0">{r.label}</span>
                <span className="text-sm font-semibold text-slate-800 truncate">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Questions ({questions.length})</p>
          {questions.map((q,i)=>(
            <div key={q.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
              <span className="text-[11px] font-bold text-slate-400 w-5 shrink-0">Q{i+1}</span>
              <span className="text-sm flex-1 truncate text-slate-700">{q.text||"[no text]"}</span>
              <span className="text-[11px] font-bold text-slate-500 shrink-0">{q.marks}m</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Publish Options</p>
          {scheduleEnabled && scheduledAt && (
            <div className="mb-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5 text-xs text-[#7C3AED] font-semibold">
              Scheduled to publish {new Date(scheduledAt).toLocaleString("en-US",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onPublish}
              className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors">
              <CheckCircle className="h-6 w-6"/>
              <span className="text-sm font-bold">{scheduleEnabled ? "Schedule Assessment" : "Publish Now"}</span>
              <span className="text-[10px] opacity-70">{scheduleEnabled ? "Publishes automatically at the scheduled time" : "Students notified immediately"}</span>
            </button>
            <button onClick={onDraft}
              className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors">
              <FileText className="h-6 w-6"/>
              <span className="text-sm font-bold">Save as Draft</span>
              <span className="text-[10px] text-slate-400">Finish later</span>
            </button>
          </div>
        </div>
      </div>
      <div className="w-72 shrink-0"><SummaryPanel data={data} questions={questions}/></div>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return <Check className={className}/>;
}

// ─── Create Wizard ────────────────────────────────────────────────────────────

const BLANK: Partial<Assessment> = { title:"", chapter:"", type:undefined, grade:"", section:"", subject:"", date:"", duration:45, totalMarks:0, passingMarks:0, description:"" };

// Local (not UTC) today, in <input type="date"> format — toISOString() shifts
// to UTC first, which shows yesterday's date for any timezone ahead of UTC
// during its early morning hours.
function todayLocalDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CreateWizard({ tc, onDone, mySubjects, existing }: { tc: any; onDone: () => void; mySubjects: SubjectAssignment[]; existing?: Assessment | null }) {
  const isEditMode = !!existing;
  const [step, setStep] = useState(1);
  // Default the assessment date to today so the teacher doesn't have to set
  // it manually every time — computed at open-time (not module load) so it's
  // never a stale date from whenever the app happened to start. When editing,
  // load the real existing record instead.
  const [data, setData] = useState<Partial<Assessment>>(() => existing ? { ...existing } : { ...BLANK, date: todayLocalDateStr() });
  const [questions, setQuestions] = useState<Question[]>(() => existing?.questions ?? []);
  const [settings, setSettings] = useState<Settings3>(DEF_SETTINGS);
  const [scheduleEnabled, setScheduleEnabled] = useState(() => !!existing?.scheduledAt);
  const [scheduledAt, setScheduledAt] = useState(() => existing?.scheduledAt ?? "");

  function validate(s: number) {
    if (s===1) {
      if (!data.title?.trim()) { toast.error("Enter assessment title"); return false; }
      if (!data.type) { toast.error("Select assessment type"); return false; }
      if (!data.grade) { toast.error("Select grade"); return false; }
      if (!data.subject) { toast.error("Select subject"); return false; }
      if (!data.section) { toast.error("Select section"); return false; }
      // Strict mapping: reject any grade/subject/section combo the teacher isn't assigned to
      const allowed = mySubjects.some(a => a.grade === data.grade && a.subject === data.subject && a.section === data.section);
      if (!allowed) { toast.error("You are not assigned to teach this subject for the selected grade/section"); return false; }
      if (!data.totalMarks) { toast.error("Enter total marks"); return false; }
    }
    return true;
  }
  function next() { if (validate(step)) setStep(s=>Math.min(4,s+1)); }
  function back() { setStep(s=>Math.max(1,s-1)); }

  async function commit(status: AStatus) {
    if (status === "Active" && questions.length === 0) { toast.error("Add at least one question before publishing"); return; }
    if (status === "Active" && scheduleEnabled && !scheduledAt) { toast.error("Pick a scheduled date & time"); return; }
    // Scheduling for later publishes as "Upcoming" now and only actually goes
    // live (and notifies anyone) once the scheduled time is reached — same
    // scheduling contract as the Assignments module.
    const effectiveStatus: AStatus = (status === "Active" && scheduleEnabled) ? "Upcoming" : status;
    // A genuinely new publish (about to notify everyone) only happens when
    // this wasn't already live before — editing an already-Active assessment
    // and re-saving as Active must not re-spam every student/parent again.
    const wasAlreadyActive = existing?.status === "Active";
    try {
      const a: Assessment = {
        ...(data as Assessment),
        id: existing?.id || uid(),
        questions,
        submissions: existing?.submissions ?? 0,
        totalStudents: existing?.totalStudents ?? 0,
        status: effectiveStatus,
        scheduledAt: effectiveStatus === "Upcoming" && scheduleEnabled ? scheduledAt : undefined,
        createdAt: existing?.createdAt || new Date().toISOString(),
        // Without this, ListView's "only show my own assessments" filter
        // rejects every row with no teacher — meaning a teacher could never
        // see the assessment they just published.
        teacher: existing?.teacher || tc?.assignment?.teacherName || "",
      } as Assessment;
      if (isEditMode) await smartDb.update("assessments", a.id, a as any);
      else await smartDb.create("assessments", a, a.id);
      toast.success(
        effectiveStatus === "Upcoming"
          ? `Assessment scheduled for ${new Date(scheduledAt).toLocaleString()}`
          : status === "Active" ? (isEditMode ? "Assessment updated!" : "Assessment published! Students can now see it.") : "Saved as draft"
      );
      // Notify students, their parents, the section's real class teacher, and
      // school leadership only on a genuinely new publish — scheduled ones
      // notify once they're actually published, whenever a teacher/student/
      // parent assessments list next loads past the scheduled time (see
      // publishDueScheduledAssessments in classPublishNotify.ts).
      if (status === "Active" && !scheduleEnabled && !wasAlreadyActive) {
        notifyClassPublish({
          grade: a.grade, section: a.section,
          entity: "Assessment", type: "assessment_published",
          title: `New ${a.type || "Assessment"}: ${a.title}`,
          message: `${a.subject} ${(a.type || "assessment").toLowerCase()} has been posted${a.section ? ` for Section ${a.section}` : ""}${a.date ? ` — ${a.date}` : ""}.`,
          sourceId: a.id,
          redirectUrlStudent: "/student/assessments",
          redirectUrlParent: "/parent/assessments",
          redirectUrlTeacher: "/teacher/assessments",
        }).catch(() => {});
      }
      onDone();
    } catch (err) {
      console.error("Failed to save assessment:", err);
      toast.error("Failed to save. Please try again.");
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F8F7FF] min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-3">
          <button onClick={onDone} className="hover:text-[#7C3AED]">Home</button>
          <ChevronRight className="h-3 w-3"/>
          <button onClick={onDone} className="hover:text-[#7C3AED]">Assessments</button>
          <ChevronRight className="h-3 w-3"/>
          <span className="text-[#7C3AED] font-semibold">{isEditMode ? "Edit Assessment" : "Create Assessment"}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onDone} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-slate-600"/>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900">{isEditMode ? "Edit Assessment" : "Create Assessment"}</h1>
              <p className="text-[12px] text-slate-400">{isEditMode ? "Update this assessment's details." : "Create and assign an assessment to evaluate student learning."}</p>
            </div>
          </div>
          <button onClick={()=>commit("Draft")}
            className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Save as Draft
          </button>
        </div>
        <div className="mt-4">
          <StepBar step={step}/>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {step===1 && <Step1 data={data} onChange={setData} tc={tc} mySubjects={mySubjects}/>}
        {step===2 && <Step2 questions={questions} onChange={setQuestions}/>}
        {step===3 && <Step3 settings={settings} onChange={setSettings} data={data}
          scheduleEnabled={scheduleEnabled} setScheduleEnabled={setScheduleEnabled}
          scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}/>}
        {step===4 && <Step4 data={data} questions={questions} onPublish={()=>commit("Active")} onDraft={()=>commit("Draft")}
          scheduleEnabled={scheduleEnabled} scheduledAt={scheduledAt}/>}
      </div>

      {/* Footer — Previous Step always available (including on the Review &
          Publish step) so a teacher can go back and fix something instead of
          only being able to abandon the whole wizard via the breadcrumb. */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between sticky bottom-0">
        <button onClick={back} disabled={step===1}
          className="flex items-center gap-1.5 h-10 px-5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 transition-all">
          <ArrowLeft className="h-4 w-4"/> Previous Step
        </button>
        {step < 4 && (
          <button onClick={next}
            className="flex items-center gap-1.5 h-10 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all">
            Next Step <ArrowRight className="h-4 w-4"/>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Assessment Detail ────────────────────────────────────────────────────────

function AssessmentDetail({ assessment, onBack, tc }: { assessment: Assessment; onBack: () => void; tc: any }) {
  const [students, setStudents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<AttemptRow[]>([]);
  const [marks, setMarks] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [enteringMarks, setEnteringMarks] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [allStudents, allSubs] = await Promise.all([
          smartDb.getAll("students"),
          getAllAttempts(),
        ]);
        const enrolled = (allStudents as any[]).filter(s => {
          const g = (s.grade||s.class||s.className||"").toLowerCase();
          const sec = (s.section||s.classSection||"").toUpperCase();
          const targetGrade = assessment.grade.toLowerCase();
          const targetSection = (assessment.section||"").toUpperCase();
          const gradeMatch = g.includes(targetGrade) || targetGrade.includes(g);
          const sectionMatch = !assessment.section || sec === targetSection;
          return gradeMatch && sectionMatch;
        });
        const thisSubs = allSubs.filter(s => s.assessmentId === String(assessment.id));
        setStudents(enrolled);
        setSubmissions(thisSubs);
        const existing: Record<string,string> = {};
        thisSubs.forEach(s => { if (s.score!=null) existing[s.studentId] = String(s.score); });
        setMarks(existing);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assessment.id]);

  const rows = useMemo(() => students.map(s => {
    const sub = submissions.find(x => String(x.studentId) === String(s.id||s.uid));
    return {
      id: s.id||s.uid||"",
      name: s.name||"Unknown",
      roll: s.rollNumber||s.roll||"—",
      submitted: sub?.status === "submitted",
      submittedAt: sub?.submittedAt||null,
      marks: sub?.score??null,
      isMarked: !!sub?.isMarked,
    };
  }), [students, submissions]);

  const submitted = rows.filter(r=>r.submitted);
  const notSubmitted = rows.filter(r=>!r.submitted);

  async function saveMarks() {
    setSaving(true);
    try {
      for (const [studentId, mark] of Object.entries(marks)) {
        const m = Number(mark);
        if (isNaN(m) || mark==="") continue;
        const existing = submissions.find(s=>String(s.studentId)===String(studentId));
        // Canonical contract (gradebook engine): table "assessment_attempts",
        // fields { studentId, assessmentId, status: "submitted", score }
        const payload = { assessmentId: String(assessment.id), studentId: String(studentId), score: m, status: "submitted", isMarked: true, submittedAt: existing?.submittedAt || new Date().toISOString() };
        if (existing && !existing.legacy) {
          await smartDb.update("assessment_attempts", existing.id, payload);
        } else {
          const newId = `ATT-${Date.now()}-${studentId}`;
          await smartDb.create("assessment_attempts", { ...payload, id: newId }, newId);
        }
      }
      toast.success("Marks saved successfully");
      setEnteringMarks(false);
    } catch { toast.error("Failed to save marks"); } finally { setSaving(false); }
  }

  function exportSubmissionStatus() {
    const sheetRows = rows.map((r, i) => ({
      "#": i + 1,
      "Student Name": r.name,
      "Roll No": r.roll,
      "Status": r.submitted ? "Submitted" : "Not Submitted",
      "Submitted At": formatSubmittedAt(r.submittedAt),
      "Marks": r.marks != null ? `${r.marks} / ${assessment.totalMarks}` : "—",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 5 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Submission Status");
    XLSX.writeFile(wb, `${assessment.title.replace(/[^a-z0-9]+/gi, "_")}_submission_status.xlsx`);
    toast.success("Submission status exported");
  }

  return (
    <div className="p-6 space-y-5">
      {/* Back + header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl hover:bg-white border border-slate-200 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-slate-600"/>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900">{assessment.title}</h1>
            <p className="text-sm text-slate-400">{assessment.grade}{assessment.section?` – Section ${assessment.section}`:""} · {assessment.subject} · {assessment.type}</p>
          </div>
        </div>
        <button onClick={()=>setEnteringMarks(!enteringMarks)}
          className={cn("flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold transition-colors",
            enteringMarks ? "bg-[#7C3AED] text-white" : "border border-[#7C3AED] text-[#7C3AED] hover:bg-violet-50")}>
          <Edit2 className="h-4 w-4"/> {enteringMarks ? "Cancel" : "Enter Marks"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {label:"Total Students", value:rows.length, color:"text-slate-900", bg:"bg-slate-100", Icon:Users},
          {label:"Submitted", value:submitted.length, color:"text-emerald-700", bg:"bg-emerald-100", Icon:Check},
          {label:"Not Submitted", value:notSubmitted.length, color:"text-rose-600", bg:"bg-rose-100", Icon:X},
          {label:"Marked", value:submitted.filter(r=>r.isMarked).length, color:"text-violet-700", bg:"bg-violet-100", Icon:AlertCircle},
        ].map(c=>(
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",c.bg)}>
              <c.Icon className={cn("h-5 w-5",c.color)}/>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">{c.label}</p>
              <p className="text-2xl font-black text-slate-900">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Assessment info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Assessment Details</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            {label:"Due Date", value:formatDueDate(assessment.date)},
            {label:"Duration", value:assessment.duration?`${assessment.duration} min`:"—"},
            {label:"Total Marks", value:String(assessment.totalMarks)},
            {label:"Passing Marks", value:assessment.passingMarks?String(assessment.passingMarks):"—"},
          ].map(r=>(
            <div key={r.label}>
              <p className="text-[11px] text-slate-400 font-medium">{r.label}</p>
              <p className="text-sm font-semibold text-slate-800">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin"/>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center">
          <Users className="h-10 w-10 text-slate-300 mb-3"/>
          <p className="font-bold text-slate-700">No students found</p>
          <p className="text-sm text-slate-400 mt-1">Students enrolled in {assessment.grade}{assessment.section?` Section ${assessment.section}`:""} will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-black text-slate-900">Student Submission Status</p>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400">{rows.length} students</span>
              <button onClick={exportSubmissionStatus}
                className="h-8 px-4 rounded-xl border border-slate-200 text-slate-600 text-[12px] font-bold hover:bg-slate-50 flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5"/> Export Excel
              </button>
              {enteringMarks && (
                <button onClick={saveMarks} disabled={saving}
                  className="h-8 px-4 rounded-xl bg-[#7C3AED] text-white text-[12px] font-bold hover:bg-[#6D28D9] disabled:opacity-50">
                  {saving?"Saving…":"Save All Marks"}
                </button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["#","Student Name","Roll No","Status","Submitted At","Marks",...(enteringMarks?["Enter Marks"]:["Marked"])].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={r.id} className={cn("border-b border-slate-50 hover:bg-slate-50/50",i%2===0?"bg-white":"bg-slate-50/20")}>
                  <td className="px-4 py-3 text-[12px] text-slate-400 font-bold">{i+1}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 text-[13px]">{r.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">{r.roll}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-xl",
                      r.submitted?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-600")}>
                      {r.submitted?"Submitted":"Not Submitted"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{formatSubmittedAt(r.submittedAt)}</td>
                  <td className="px-4 py-3">
                    {r.marks!==null
                      ? <span className="font-bold text-slate-900">{r.marks} / {assessment.totalMarks}</span>
                      : <span className="text-[11px] text-slate-400">—</span>}
                  </td>
                  {enteringMarks ? (
                    <td className="px-4 py-3">
                      <input type="number" min={0} max={assessment.totalMarks}
                        value={marks[r.id]??""} onChange={e=>setMarks(m=>({...m,[r.id]:e.target.value}))}
                        placeholder="—"
                        className="w-20 h-8 px-2 rounded-lg border border-slate-200 text-sm text-center outline-none focus:border-[#7C3AED]"/>
                    </td>
                  ) : (
                    <td className="px-4 py-3">
                      <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-lg",
                        r.isMarked?"bg-violet-100 text-violet-700":"bg-slate-100 text-slate-500")}>
                        {r.isMarked?"Marked":"Pending"}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ onCreate, onEdit, onDetail, tc }: { onCreate: () => void; onEdit: (a: Assessment) => void; onDetail: (a: Assessment) => void; tc: any }) {
  const grades = useGrades();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [openMenu, setOpenMenu] = useState<string|null>(null);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [roster, setRoster] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [rawAll, allAttempts, allStudents] = await Promise.all([
          smartDb.getAll("assessments") as Promise<Assessment[]>,
          getAllAttempts(),
          smartDb.getAll("students") as Promise<any[]>,
        ]);
        const all = await publishDueScheduledAssessments(Array.isArray(rawAll) ? rawAll : []);
        const arr = Array.isArray(all) ? all : [];
        // Strict: teacher only sees assessments explicitly assigned to them by name
        const tcName = (tc?.assignment?.teacherName || "").trim().toLowerCase();
        const filtered = arr.filter(a => {
          const aTeacher = (a.teacher || "").trim().toLowerCase();
          if (!tcName) return true;
          if (!aTeacher) return false; // no teacher assigned → not this teacher's
          return aTeacher.includes(tcName) || tcName.includes(aTeacher);
        });
        setAssessments(filtered);
        // "Submissions" must reflect real attempts, not the stale a.submissions
        // field on the assessment row (frozen at creation, never incremented) —
        // count live rows from getAllAttempts() per assessment, same as the
        // per-assessment detail view already does.
        const counts: Record<string, number> = {};
        for (const a of filtered) {
          counts[a.id] = allAttempts.filter(s => s.assessmentId === String(a.id)).length;
        }
        setLiveCounts(counts);
        setRoster(Array.isArray(allStudents) ? allStudents : []);
      } catch (err) {
        console.error("Failed to load assessments:", err);
        setAssessments([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [tc?.grade, tc?.section]);

  function enrolledCount(a: Assessment) {
    const targetGrade = (a.grade || "").toLowerCase();
    const targetSection = (a.section || "").toUpperCase();
    return roster.filter(s => {
      const g = (s.grade||s.class||s.className||"").toLowerCase();
      const sec = (s.section||s.classSection||"").toUpperCase();
      const gradeMatch = g.includes(targetGrade) || targetGrade.includes(g);
      const sectionMatch = !a.section || sec === targetSection;
      return gradeMatch && sectionMatch;
    }).length;
  }

  const filtered = useMemo(()=>assessments.filter(a=>{
    const s = (a.title+a.subject+(a.chapter||"")).toLowerCase().includes(search.toLowerCase());
    const sub = !filterSubject || a.subject===filterSubject;
    const t = !filterType || a.type===filterType;
    const st = !filterStatus || a.status===filterStatus;
    return s && sub && t && st;
  }),[assessments, search, filterSubject, filterType, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length/perPage));
  const paged = filtered.slice((page-1)*perPage, page*perPage);

  const stats = {
    total: assessments.length,
    completed: assessments.filter(a=>a.status==="Completed").length,
    upcoming: assessments.filter(a=>a.status==="Upcoming").length,
    drafts: assessments.filter(a=>a.status==="Draft").length,
  };

  async function deleteA(id: string) {
    try {
      await smartDb.delete("assessments", id);
      setAssessments(prev=>prev.filter(a=>a.id!==id));
      toast.success("Assessment deleted");
    } catch {
      toast.error("Failed to delete");
    }
    setOpenMenu(null);
  }

  return (
    <div className="flex gap-5 p-6 min-h-full">
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="h-5 w-5 text-purple-600"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Assessments</h1>
              <p className="text-sm text-slate-400">Create, manage and evaluate student assessments.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BarChart3 className="h-4 w-4"/> Assessment Analytics
            </button>
            <button onClick={onCreate}
              className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold shadow-[0_4px_14px_rgba(124,58,237,0.3)]">
              <Plus className="h-4 w-4"/> Create Assessment
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label:"Total Assessments", value:stats.total, sub:"This Term", badge:"+12%", icon:ClipboardCheck, color:"text-[#7C3AED]", bg:"bg-violet-100" },
            { label:"Completed", value:stats.completed, sub:`${stats.total>0?Math.round(stats.completed/stats.total*100):0}%`, icon:Check, color:"text-emerald-600", bg:"bg-emerald-100", checkCircle:true },
            { label:"Upcoming", value:stats.upcoming, sub:`${stats.total>0?Math.round(stats.upcoming/stats.total*100):0}%`, icon:Clock, color:"text-orange-500", bg:"bg-orange-100" },
            { label:"Drafts", value:stats.drafts, sub:`${stats.total>0?Math.round(stats.drafts/stats.total*100):0}%`, icon:FileText, color:"text-slate-500", bg:"bg-slate-100" },
          ].map(card=>(
            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", card.bg)}>
                <card.icon className={cn("h-6 w-6", card.color)}/>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">{card.label}</p>
                <p className="text-2xl font-black text-slate-900">{card.value}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-slate-400">{card.sub}</span>
                  {card.badge && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{card.badge}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              placeholder="Search assessments…"
              className="w-full pl-9 pr-3 h-9 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"/>
          </div>
          {[
            { label:"All Subjects", value:filterSubject, onChange:(v:string)=>{setFilterSubject(v);setPage(1);}, opts:SUBJECTS },
            { label:"All Grades",   value:"", onChange:()=>{}, opts:grades },
            { label:"All Types",    value:filterType, onChange:(v:string)=>{setFilterType(v);setPage(1);}, opts:A_TYPES as string[] },
            { label:"All Status",   value:filterStatus, onChange:(v:string)=>{setFilterStatus(v);setPage(1);}, opts:["Active","Upcoming","Completed","Draft"] },
          ].map(f=>(
            <select key={f.label} value={f.value} onChange={e=>f.onChange(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] bg-white">
              <option value="">{f.label}</option>
              {f.opts.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Filter className="h-4 w-4"/> Filter
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Assessment Title","Type ↕","Subject ↕","Grade / Section","Total Marks","Due Date ↕","Submissions","Status","Actions"].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((a,i)=>{
                const dl = daysLeft(a.date);
                const liveSubmissions = liveCounts[a.id] ?? 0;
                const liveTotal = enrolledCount(a) || a.totalStudents;
                const submPct = liveTotal>0?Math.round(liveSubmissions/liveTotal*100):0;
                return (
                  <tr key={a.id} onClick={()=>onDetail(a)} className={cn("border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer", i%2===0?"bg-white":"bg-slate-50/20")}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-[13px]">{a.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{a.chapter}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap", TYPE_COLORS[a.type]||"bg-slate-100 text-slate-600")}>
                        {a.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[13px]">{a.subject}</td>
                    <td className="px-4 py-3 text-slate-600 text-[13px]">{a.grade}{a.section?` - ${a.section}`:""}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{a.totalMarks}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-[12px] text-slate-500">
                        <Calendar className="h-3 w-3 shrink-0"/>
                        <span>{formatDueDate(a.date)}</span>
                      </div>
                      <p className={cn("text-[11px] font-semibold mt-0.5", dl.urgent?"text-rose-600":"text-slate-400")}>{dl.text}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-slate-800">{liveSubmissions} / {liveTotal}</p>
                      <p className="text-[11px] text-slate-400">{submPct}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-xl", STATUS_COLORS[a.status]||"bg-slate-100 text-slate-600")}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 relative">
                        <button onClick={e=>{e.stopPropagation();onDetail(a);}} className="w-7 h-7 rounded-lg hover:bg-violet-100 flex items-center justify-center" title="View submissions">
                          <Eye className="h-3.5 w-3.5 text-[#7C3AED]"/>
                        </button>
                        <button onClick={e=>{e.stopPropagation();onDetail(a);}} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center" title="Analytics">
                          <BarChart3 className="h-3.5 w-3.5 text-slate-400"/>
                        </button>
                        <button onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===a.id?null:a.id);}}
                          className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                          <MoreVertical className="h-3.5 w-3.5 text-slate-400"/>
                        </button>
                        {openMenu===a.id && (
                          <div className="absolute right-0 top-8 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 w-36">
                            <button onClick={e=>{e.stopPropagation();setOpenMenu(null);onEdit(a);}}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                              <Edit2 className="h-3.5 w-3.5"/>Edit
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                              <Copy className="h-3.5 w-3.5"/>Duplicate
                            </button>
                            <button onClick={()=>deleteA(a.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50">
                              <Trash2 className="h-3.5 w-3.5"/>Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length===0&&(
                <tr><td colSpan={9} className="py-16 text-center text-slate-400">
                  {loading?"Loading…":assessments.length===0?"No assessments yet. Create one or wait for admin to assign assessments to your class.":"No assessments match your search."}
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[12px] text-slate-500">
              Showing {filtered.length===0?0:(page-1)*perPage+1} to {Math.min(page*perPage,filtered.length)} of {filtered.length} results
            </p>
            <div className="flex items-center gap-2">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white disabled:opacity-40">
                <ChevronLeft className="h-4 w-4 text-slate-500"/>
              </button>
              {Array.from({length:Math.min(4,totalPages)},(_,i)=>i+1).map(p=>(
                <button key={p} onClick={()=>setPage(p)}
                  className={cn("w-8 h-8 rounded-lg text-sm font-bold transition-colors",
                    p===page?"bg-[#7C3AED] text-white":"border border-slate-200 text-slate-600 hover:bg-white")}>
                  {p}
                </button>
              ))}
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white disabled:opacity-40">
                <ChevronRight className="h-4 w-4 text-slate-500"/>
              </button>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[12px] text-slate-500">10 / page</span>
                <ChevronDown className="h-3 w-3 text-slate-400"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TeacherAssessments() {
  const tc = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const [view, setView] = useState<"list"|"create"|"detail">("list");
  const [selected, setSelected] = useState<Assessment|null>(null);

  return (
    <DashboardLayout>
      <div className="flex flex-col min-h-screen bg-[#F8F7FF]">
        {view==="list" && (
          <ListView
            onCreate={()=>{setSelected(null);setView("create");}}
            onEdit={a=>{setSelected(a);setView("create");}}
            onDetail={a=>{setSelected(a);setView("detail");}}
            tc={tc}
          />
        )}
        {view==="create" && <CreateWizard tc={tc} onDone={()=>setView("list")} mySubjects={mySubjects} existing={selected}/>}
        {view==="detail" && selected && <AssessmentDetail assessment={selected} onBack={()=>setView("list")} tc={tc}/>}
      </div>
    </DashboardLayout>
  );
}
