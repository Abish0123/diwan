import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGrades } from '@/contexts/CurriculumContext';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { getAllAttempts } from "@/lib/assessmentAttempts";
import {
  Plus, Search, Filter, Eye, BarChart3, MoreVertical,
  ChevronLeft, ChevronRight, Calendar, Clock, Check, X,
  GripVertical, Copy, Trash2, ChevronDown, Upload,
  ArrowLeft, ArrowRight, FileText, ClipboardCheck, Lightbulb,
  Edit2, Star, Download, Users,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type AssessmentType = "Quiz" | "Worksheet" | "Project" | "Lab Assessment" | "Test" | "Oral Assessment" | "Practical" | "Assignment";
type QType = "MCQ" | "True/False" | "Short Answer" | "Long Answer" | "Fill in the Blank" | "Match the Following" | "Essay" | "Diagram Based";
type AStatus = "Active" | "Upcoming" | "Completed" | "Draft";

interface Option { id: string; text: string }
interface MatchPair { left: string; right: string }
interface Question {
  id: string; type: QType; text: string; marks: number;
  options?: Option[]; correctAnswer?: string; matchPairs?: MatchPair[];
  diagramDescription?: string;
  isImportant?: boolean;
}
interface Assessment {
  id: string; title: string; chapter: string; type: AssessmentType;
  grade: string; section: string; subject: string; date: string;
  duration: number; totalMarks: number; passingMarks: number;
  description: string; questions: Question[];
  submissions: number; totalStudents: number; status: AStatus;
  teacher: string; createdAt: string;
  resultVisibility?: "immediate" | "manual"; // "immediate" = auto-show on submit; "manual" = admin releases
  resultsReleased?: boolean;
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
const Q_TYPE_COLORS: Record<string, string> = {
  "MCQ":                "bg-violet-100 text-violet-700",
  "True/False":         "bg-blue-100 text-blue-700",
  "Short Answer":       "bg-emerald-100 text-emerald-700",
  "Long Answer":        "bg-teal-100 text-teal-700",
  "Fill in the Blank":  "bg-orange-100 text-orange-700",
  "Match the Following":"bg-pink-100 text-pink-700",
  "Essay":              "bg-amber-100 text-amber-700",
  "Diagram Based":      "bg-indigo-100 text-indigo-700",
};

const SUBJECTS = ["Mathematics","English Language","Arabic","Science","Physics","Chemistry","Biology","Social Studies","Islamic Studies","Computer Science","Physical Education","Art","Music","History","Geography"];
const SECTIONS = ["A","B","C","D","E"];
const CHAPTERS = Array.from({length:10},(_,i)=>`Chapter ${i+1}`);
const A_TYPES: AssessmentType[] = ["Quiz","Worksheet","Project","Lab Assessment","Test","Oral Assessment","Practical","Assignment"];
const Q_TYPES: QType[] = ["MCQ","True/False","Short Answer","Long Answer","Fill in the Blank","Match the Following","Essay","Diagram Based"];

// Lookup maps: keep the underlying English identifiers for logic/DB storage,
// translate only the rendered label.
const SUBJECT_LABEL_KEYS: Record<string,string> = {
  "Mathematics":"admin.academics.assessments.subjectMathematics",
  "English Language":"admin.academics.assessments.subjectEnglishLanguage",
  "Arabic":"admin.academics.assessments.subjectArabic",
  "Science":"admin.academics.assessments.subjectScience",
  "Physics":"admin.academics.assessments.subjectPhysics",
  "Chemistry":"admin.academics.assessments.subjectChemistry",
  "Biology":"admin.academics.assessments.subjectBiology",
  "Social Studies":"admin.academics.assessments.subjectSocialStudies",
  "Islamic Studies":"admin.academics.assessments.subjectIslamicStudies",
  "Computer Science":"admin.academics.assessments.subjectComputerScience",
  "Physical Education":"admin.academics.assessments.subjectPhysicalEducation",
  "Art":"admin.academics.assessments.subjectArt",
  "Music":"admin.academics.assessments.subjectMusic",
  "History":"admin.academics.assessments.subjectHistory",
  "Geography":"admin.academics.assessments.subjectGeography",
};
const A_TYPE_LABEL_KEYS: Record<string,string> = {
  "Quiz":"admin.academics.assessments.typeQuiz",
  "Worksheet":"admin.academics.assessments.typeWorksheet",
  "Project":"admin.academics.assessments.typeProject",
  "Lab Assessment":"admin.academics.assessments.typeLabAssessment",
  "Test":"admin.academics.assessments.typeTest",
  "Oral Assessment":"admin.academics.assessments.typeOralAssessment",
  "Practical":"admin.academics.assessments.typePractical",
  "Assignment":"admin.academics.assessments.typeAssignment",
};
const Q_TYPE_LABEL_KEYS: Record<string,string> = {
  "MCQ":"admin.academics.assessments.qTypeMcq",
  "True/False":"admin.academics.assessments.qTypeTrueFalse",
  "Short Answer":"admin.academics.assessments.qTypeShortAnswer",
  "Long Answer":"admin.academics.assessments.qTypeLongAnswer",
  "Fill in the Blank":"admin.academics.assessments.qTypeFillBlank",
  "Match the Following":"admin.academics.assessments.qTypeMatchFollowing",
  "Essay":"admin.academics.assessments.qTypeEssay",
  "Diagram Based":"admin.academics.assessments.qTypeDiagramBased",
};
const STATUS_LABEL_KEYS: Record<string,string> = {
  Active:"admin.academics.assessments.statusActive",
  Upcoming:"admin.academics.assessments.statusUpcoming",
  Completed:"admin.academics.assessments.statusCompleted",
  Draft:"admin.academics.assessments.statusDraft",
};
// Teachers loaded from real staff table — no hardcoded list
const CHART_COLORS = ["#7C3AED","#F97316","#10B981","#06B6D4","#3B82F6","#EC4899","#EF4444","#F59E0B"];

function uid() { return `A${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`; }
function qid() { return `Q${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

function daysLeft(date: string, t: (k:string,o?:any)=>string): { text: string; urgent: boolean } {
  if (!date) return { text: "—", urgent: false };
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: t("admin.academics.assessments.pastDue"), urgent: false };
  if (diff === 0) return { text: t("admin.academics.assessments.dueToday"), urgent: true };
  return { text: t("admin.academics.assessments.daysLeft", { count: diff }), urgent: diff <= 3 };
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const { t } = useTranslation();
  let offset = 0;
  const r = 44, circ = 2 * Math.PI * r;
  const slices = data.map(d => {
    const dash = total > 0 ? (d.value / total) * circ : 0;
    const s = { ...d, dash, offset };
    offset += dash;
    return s;
  });
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12"/>
      {slices.map((s, i) => (
        <circle key={i} cx="50" cy="50" r={r} fill="none"
          stroke={s.color} strokeWidth="12"
          strokeDasharray={`${s.dash} ${circ - s.dash}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 50 50)" strokeLinecap="round"/>
      ))}
      <text x="50" y="47" textAnchor="middle" fontSize="14" fontWeight="800" fill="#0f172a">{total}</text>
      <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#94a3b8">{t("admin.academics.assessments.total")}</text>
    </svg>
  );
}

// ─── Step Bar ────────────────────────────────────────────────────────────────

const STEPS = [
  { n:1, labelKey:"admin.academics.assessments.stepBasicInfo", subKey:"admin.academics.assessments.stepBasicInfoSub" },
  { n:2, labelKey:"admin.academics.assessments.stepQuestions", subKey:"admin.academics.assessments.stepQuestionsSub" },
  { n:3, labelKey:"admin.academics.assessments.stepSettings",  subKey:"admin.academics.assessments.stepSettingsSub" },
  { n:4, labelKey:"admin.academics.assessments.stepReviewPublish", subKey:"admin.academics.assessments.stepReviewPublishSub" },
];

function StepBar({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = s.n < step, active = s.n === step;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 transition-all",
                done ? "bg-[#7C3AED] text-white" :
                active ? "bg-[#7C3AED] text-white ring-4 ring-[#7C3AED]/20" :
                "bg-slate-100 text-slate-400"
              )}>
                {done ? <Check className="h-4 w-4"/> : s.n}
              </div>
              <div className="hidden sm:block">
                <p className={cn("text-[12px] font-bold leading-tight whitespace-nowrap",
                  active?"text-[#7C3AED]":done?"text-slate-700":"text-slate-400")}>{t(s.labelKey)}</p>
                <p className="text-[10px] text-slate-400 whitespace-nowrap">{t(s.subKey)}</p>
              </div>
            </div>
            {i < STEPS.length-1 && <div className={cn("w-8 h-0.5 mx-3 shrink-0", done?"bg-[#7C3AED]":"bg-slate-200")}/>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Question Editor Modal ────────────────────────────────────────────────────

function QEditor({ q, onSave, onClose }: { q: Partial<Question>; onSave:(q:Question)=>void; onClose:()=>void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Partial<Question>>({
    type:"MCQ", text:"", marks:1, isImportant:false,
    options:[{id:qid(),text:""},{id:qid(),text:""},{id:qid(),text:""},{id:qid(),text:""}],
    ...q,
  });
  function set<K extends keyof Question>(k:K,v:Question[K]) { setData(d=>({...d,[k]:v})); }
  function changeType(t:QType) {
    const base: Partial<Question> = {type:t, text:data.text||"", marks:data.marks||1, isImportant:data.isImportant, correctAnswer:undefined};
    if (t==="MCQ") base.options=[{id:qid(),text:""},{id:qid(),text:""},{id:qid(),text:""},{id:qid(),text:""}];
    if (t==="Match the Following") base.matchPairs=[{left:"",right:""},{left:"",right:""}];
    if (t==="Diagram Based") base.diagramDescription="";
    setData(base);
  }
  function save() {
    if (!data.text?.trim()) { toast.error(t("admin.academics.assessments.enterQuestionText")); return; }
    onSave({
      id:data.id||qid(), type:data.type||"MCQ", text:data.text!, marks:data.marks||1,
      options:data.options, correctAnswer:data.correctAnswer, matchPairs:data.matchPairs,
      diagramDescription:data.diagramDescription, isImportant:data.isImportant||false,
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-black text-slate-900">{data.id?t("admin.academics.assessments.editQuestion"):t("admin.academics.assessments.addQuestion")}</h3>
          <div className="flex items-center gap-2">
            <button onClick={()=>set("isImportant",!data.isImportant)}
              className={cn("flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold border transition-all",
                data.isImportant?"border-amber-400 bg-amber-50 text-amber-600":"border-slate-200 text-slate-400 hover:border-amber-300")}>
              <Star className={cn("h-3.5 w-3.5",data.isImportant?"fill-amber-400 text-amber-400":"text-slate-300")}/>
              {t("admin.academics.assessments.important")}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4 text-slate-500"/></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.questionType")}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Q_TYPES.map(qt=>(
                <button key={qt} onClick={()=>changeType(qt)}
                  className={cn("px-3 py-2 rounded-xl border text-[11px] font-semibold text-start transition-all",
                    data.type===qt?"border-[#7C3AED] bg-violet-50 text-[#7C3AED]":"border-slate-200 text-slate-600 hover:border-slate-300")}>
                  {t(Q_TYPE_LABEL_KEYS[qt]||qt)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.questionLabel")}</label>
            <textarea value={data.text||""} onChange={e=>set("text",e.target.value)} placeholder={t("admin.academics.assessments.enterQuestionTextPlaceholder")} rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 resize-none"/>
          </div>
          {data.type==="MCQ"&&(
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">{t("admin.academics.assessments.optionsClickCorrect")}</label>
              {(data.options||[]).map((opt,i)=>(
                <div key={opt.id} className="flex items-center gap-2">
                  <button onClick={()=>set("correctAnswer",opt.id)}
                    className={cn("w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                      data.correctAnswer===opt.id?"border-emerald-500 bg-emerald-500":"border-slate-300")}>
                    {data.correctAnswer===opt.id&&<Check className="h-3 w-3 text-white"/>}
                  </button>
                  <span className="text-[11px] font-bold text-slate-400 w-5">{String.fromCharCode(65+i)})</span>
                  <input value={opt.text} onChange={e=>set("options",(data.options||[]).map(o=>o.id===opt.id?{...o,text:e.target.value}:o))}
                    placeholder={t("admin.academics.assessments.optionPlaceholder",{letter:String.fromCharCode(65+i)})}
                    className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
                </div>
              ))}
            </div>
          )}
          {data.type==="True/False"&&(
            <div className="flex gap-3">
              {["True","False"].map(v=>(
                <button key={v} onClick={()=>set("correctAnswer",v)}
                  className={cn("flex-1 h-10 rounded-xl border-2 text-sm font-bold transition-all",
                    data.correctAnswer===v?(v==="True"?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-rose-500 bg-rose-50 text-rose-700"):"border-slate-200 text-slate-500")}>
                  {v==="True"?t("admin.academics.assessments.trueOption"):t("admin.academics.assessments.falseOption")}
                </button>
              ))}
            </div>
          )}
          {data.type==="Match the Following"&&(
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">{t("admin.academics.assessments.matchPairs")}</label>
              {(data.matchPairs||[]).map((p,i)=>(
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input value={p.left} onChange={e=>{const mp=[...(data.matchPairs||[])];mp[i]={...mp[i],left:e.target.value};set("matchPairs",mp);}}
                    placeholder={t("admin.academics.assessments.columnAPlaceholder",{n:i+1})} className="h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
                  <input value={p.right} onChange={e=>{const mp=[...(data.matchPairs||[])];mp[i]={...mp[i],right:e.target.value};set("matchPairs",mp);}}
                    placeholder={t("admin.academics.assessments.columnBPlaceholder",{n:i+1})} className="h-8 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
                </div>
              ))}
              <button onClick={()=>set("matchPairs",[...(data.matchPairs||[]),{left:"",right:""}])}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]"><Plus className="h-3 w-3"/>{t("admin.academics.assessments.addPair")}</button>
            </div>
          )}
          {data.type==="Diagram Based"&&(
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <p className="text-[11px] font-bold text-indigo-800 mb-1">{t("admin.academics.assessments.diagramBasedQuestion")}</p>
                <p className="text-[11px] text-indigo-700">{t("admin.academics.assessments.diagramBasedHint")}</p>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.diagramInstructions")}</label>
                <textarea value={data.diagramDescription||""} onChange={e=>set("diagramDescription",e.target.value)}
                  placeholder={t("admin.academics.assessments.diagramInstructionsPlaceholder")}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 resize-none"/>
              </div>
            </div>
          )}
          {(data.type==="Short Answer"||data.type==="Long Answer"||data.type==="Essay")&&(
            <div className="bg-slate-50 rounded-xl p-3 text-[11px] text-slate-500">
              {t("admin.academics.assessments.textAreaAnswerHint")}
            </div>
          )}
          {data.type==="Fill in the Blank"&&(
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.correctAnswer")}</label>
              <input value={data.correctAnswer||""} onChange={e=>set("correctAnswer",e.target.value)}
                placeholder={t("admin.academics.assessments.correctAnswerPlaceholder")}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.marks")}</label>
            <input type="number" min={1} value={data.marks||1} onChange={e=>set("marks",Number(e.target.value))}
              className="w-24 h-9 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED]"/>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t("admin.academics.assessments.cancel")}</button>
          <button onClick={save} className="h-9 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">{t("admin.academics.assessments.saveQuestion")}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Sidebar ──────────────────────────────────────────────────────────

function SummaryPanel({ data, questions }: { data: Partial<Assessment>; questions: Question[] }) {
  const { t } = useTranslation();
  const totalM = questions.reduce((a,q)=>a+q.marks,0);
  const rows = [
    {label:t("admin.academics.assessments.type"),          value:data.type?t(A_TYPE_LABEL_KEYS[data.type]||data.type):"—"},
    {label:t("admin.academics.assessments.grade"),         value:data.grade||"—"},
    {label:t("admin.academics.assessments.section"),       value:data.section?t("admin.academics.assessments.sectionValue",{name:data.section}):t("admin.academics.assessments.allSections")},
    {label:t("admin.academics.assessments.subject"),       value:data.subject?t(SUBJECT_LABEL_KEYS[data.subject]||data.subject):"—"},
    {label:t("admin.academics.assessments.chapter"),       value:data.chapter||"—"},
    {label:t("admin.academics.assessments.teacher"),       value:data.teacher||"—"},
    {label:t("admin.academics.assessments.date"),          value:data.date||"—"},
    {label:t("admin.academics.assessments.duration"),      value:data.duration?t("admin.academics.assessments.durationMin",{n:data.duration}):"—"},
    {label:t("admin.academics.assessments.totalMarks"),   value:data.totalMarks?String(data.totalMarks):(totalM>0?String(totalM):"—")},
    {label:t("admin.academics.assessments.passingMarks"), value:data.passingMarks?String(data.passingMarks):"—"},
  ];
  const tips = [t("admin.academics.assessments.tipAddClearQuestions"), t("admin.academics.assessments.tipSetTime"), t("admin.academics.assessments.tipReviewBeforePublishing")];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
            <ClipboardCheck className="h-4 w-4 text-[#7C3AED]"/>
          </div>
          <p className="font-black text-slate-900 text-sm">{t("admin.academics.assessments.assessmentSummary")}</p>
        </div>
        <div className="space-y-2">
          {rows.map(r=>(
            <div key={r.label} className="flex justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-medium shrink-0">{r.label}</span>
              <span className="text-[11px] font-semibold text-slate-700 text-end">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
        <div className="flex items-center gap-1.5 mb-1.5"><Lightbulb className="h-3.5 w-3.5 text-amber-500"/><p className="text-[11px] font-bold text-amber-800">{t("admin.academics.assessments.tips")}</p></div>
        <ul className="space-y-1">
          {tips.map(tip=>(
            <li key={tip} className="flex items-start gap-1.5 text-[11px] text-amber-700"><Check className="h-3 w-3 text-amber-500 mt-0.5 shrink-0"/>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Question Summary Sidebar ─────────────────────────────────────────────────

function QSummaryPanel({ questions }: { questions: Question[] }) {
  const { t } = useTranslation();
  const byType = Q_TYPES.map(qt=>({type:qt,count:questions.filter(q=>q.type===qt).length,marks:questions.filter(q=>q.type===qt).reduce((a,q)=>a+q.marks,0)})).filter(x=>x.count>0);
  const totalQ = questions.length, totalM = questions.reduce((a,q)=>a+q.marks,0);
  const important = questions.filter(q=>q.isImportant).length;
  const tips = [t("admin.academics.assessments.tipMixQuestionTypes"), t("admin.academics.assessments.tipMarkImportant"), t("admin.academics.assessments.tipKeepClear")];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="font-black text-slate-900 mb-3 text-sm">{t("admin.academics.assessments.questionSummary")}</p>
        <div className="w-32 h-32 mx-auto mb-3">
          <DonutChart data={byType.map((x,i)=>({label:x.type,value:x.marks,color:CHART_COLORS[i%CHART_COLORS.length]}))} total={totalM}/>
        </div>
        <div className="space-y-1.5">
          {byType.map((x,i)=>(
            <div key={x.type} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:CHART_COLORS[i%CHART_COLORS.length]}}/>
              <span className="text-[11px] text-slate-600 flex-1 truncate">{t(Q_TYPE_LABEL_KEYS[x.type]||x.type)}</span>
              <span className="text-[11px] font-bold text-slate-700">{t("admin.academics.assessments.marksCount",{marks:x.marks,count:x.count})}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="font-black text-slate-900 mb-2 text-sm">{t("admin.academics.assessments.totals")}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-[11px] text-slate-500">{t("admin.academics.assessments.totalQuestions")}</span><span className="text-[11px] font-black text-slate-900">{totalQ}</span></div>
          <div className="flex justify-between"><span className="text-[11px] text-slate-500">{t("admin.academics.assessments.totalMarks")}</span><span className="text-[11px] font-black text-[#7C3AED]">{totalM}</span></div>
          {important>0&&<div className="flex justify-between"><span className="text-[11px] text-slate-500">{t("admin.academics.assessments.important")}</span><span className="text-[11px] font-black text-amber-600">{important} ★</span></div>}
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
        <div className="flex items-center gap-1.5 mb-1.5"><Lightbulb className="h-3.5 w-3.5 text-amber-500"/><p className="text-[11px] font-bold text-amber-800">{t("admin.academics.assessments.tips")}</p></div>
        <ul className="space-y-1">
          {tips.map(tip=>(
            <li key={tip} className="flex items-start gap-1.5 text-[11px] text-amber-700"><Check className="h-3 w-3 text-amber-500 mt-0.5 shrink-0"/>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ data, onChange }: { data: Partial<Assessment>; onChange:(d:Partial<Assessment>)=>void }) {
  const { t } = useTranslation();
  const grades = useGrades();
  const [teachers, setTeachers] = useState<string[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/data/staff")
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const names = [...new Set<string>(
          rows
            .filter(s => s.role === "Teacher" || s.role === "Class Teacher" || s.role === "Grade Coordinator" || (typeof s.role === "string" && s.role.startsWith("HOD")))
            .map(s => s.name)
            .filter(Boolean)
        )].sort();
        setTeachers(names);
      })
      .catch(() => {});
    fetch("/api/data/classes")
      .then(r => r.json())
      .then((rows: any[]) => { if (Array.isArray(rows)) setClasses(rows); })
      .catch(() => {});
  }, []);

  // Auto-populate teacher when grade+section is selected
  useEffect(() => {
    if (!data.grade || !classes.length) return;
    const gradeNorm = (data.grade || "").trim().toLowerCase();
    const secNorm   = (data.section || "").trim().toUpperCase();
    const match = classes.find(c => {
      const cg = (c.grade || c.name || "").trim().toLowerCase();
      const cs = (c.section || "").trim().toUpperCase();
      return cg.includes(gradeNorm) || gradeNorm.includes(cg.replace(/grade\s*/i,"").trim())
        ? (secNorm ? cs === secNorm : true) : false;
    });
    const teacher = match?.classTeacher || match?.teacher || match?.assignedTeacher || "";
    if (teacher && teacher !== data.teacher) onChange({...data, teacher});
  }, [data.grade, data.section, classes]);

  function set<K extends keyof Assessment>(k:K,v:Assessment[K]) { onChange({...data,[k]:v}); }
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-5">
        <h2 className="text-lg font-black text-slate-900">{t("admin.academics.assessments.assessmentInformation")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.assessmentTitle")}</label>
            <input value={data.title||""} onChange={e=>set("title",e.target.value)} maxLength={200}
              placeholder={t("admin.academics.assessments.assessmentTitlePlaceholder")}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
            <p className="text-[10px] text-slate-400 mt-1 text-end">{(data.title||"").length}/200</p>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.chapterTopic")}</label>
            <select value={data.chapter||""} onChange={e=>set("chapter",e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.selectChapter")}</option>
              {CHAPTERS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.assessmentType")}</label>
            <select value={data.type||""} onChange={e=>set("type",e.target.value as AssessmentType)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.selectType")}</option>
              {A_TYPES.map(at=><option key={at} value={at}>{t(A_TYPE_LABEL_KEYS[at]||at)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.classGrade")}</label>
            <select value={data.grade||""} onChange={e=>set("grade",e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.selectGrade")}</option>
              {grades.map(g=><option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.assessmentDate")}</label>
            <div className="relative">
              <Calendar className="absolute start-3 top-3 h-4 w-4 text-slate-400 pointer-events-none"/>
              <input type="date" value={data.date||""} onChange={e=>set("date",e.target.value)}
                className="w-full h-11 ps-9 pe-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.subject")}</label>
            <select value={data.subject||""} onChange={e=>set("subject",e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.selectSubject")}</option>
              {SUBJECTS.map(s=><option key={s} value={s}>{t(SUBJECT_LABEL_KEYS[s]||s)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.section")}</label>
            <select value={data.section||""} onChange={e=>set("section",e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.allSections")}</option>
              {SECTIONS.map(s=><option key={s} value={s}>{t("admin.academics.assessments.sectionValue",{name:s})}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.assignedTeacher")}</label>
            <select value={data.teacher||""} onChange={e=>set("teacher",e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 bg-white transition-all">
              <option value="">{t("admin.academics.assessments.selectTeacher")}</option>
              {teachers.length === 0
                ? <option disabled value="">{t("admin.academics.assessments.loadingTeachers")}</option>
                : teachers.map(tc=><option key={tc}>{tc}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.totalMarksRequired")}</label>
            <input type="number" min={1} value={data.totalMarks||""} onChange={e=>set("totalMarks",Number(e.target.value))}
              placeholder={t("admin.academics.assessments.maximumMarksPlaceholder")}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.passingMarks")}</label>
            <input type="number" min={0} value={data.passingMarks||""} onChange={e=>set("passingMarks",Number(e.target.value))}
              placeholder={t("admin.academics.assessments.minimumToPassPlaceholder")}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.durationRequired")}</label>
            <div className="flex gap-2 max-w-xs">
              <div className="relative flex-1">
                <Clock className="absolute start-3 top-3 h-4 w-4 text-slate-400 pointer-events-none"/>
                <input type="number" min={5} value={data.duration||""} onChange={e=>set("duration",Number(e.target.value))}
                  placeholder="45"
                  className="w-full h-11 ps-9 pe-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"/>
              </div>
              <div className="flex items-center h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 shrink-0">{t("admin.academics.assessments.minutes")}</div>
            </div>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">{t("admin.academics.assessments.descriptionOptional")}</label>
          <textarea value={data.description||""} onChange={e=>set("description",e.target.value)}
            rows={4} maxLength={500} placeholder={t("admin.academics.assessments.descriptionPlaceholder")}
            className="w-full px-4 py-3 text-sm text-slate-800 rounded-xl border border-slate-200 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 resize-none"/>
          <p className="text-[10px] text-slate-400 mt-1 text-end">{(data.description||"").length}/500</p>
        </div>
      </div>
      <div className="w-56 shrink-0"><SummaryPanel data={data} questions={[]}/></div>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function parseCSVQuestions(text: string): Question[] {
  const lines = text.trim().split("\n").slice(1); // skip header row
  const qs: Question[] = [];
  for (const line of lines) {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g,"").replace(/""/g,'"'));
    const [qtype, qtext, optA, optB, optC, optD, correct, marksStr, importantStr] = cols;
    if (!qtext?.trim()) continue;
    const type = (Q_TYPES.includes(qtype as QType) ? qtype : "Short Answer") as QType;
    const marks = parseInt(marksStr||"1",10)||1;
    const isImportant = (importantStr||"").toLowerCase().startsWith("y");
    const q: Question = { id:qid(), type, text:qtext.trim(), marks, isImportant };
    if (type==="MCQ") {
      const ids = [qid(),qid(),qid(),qid()];
      q.options = [
        {id:ids[0],text:optA||""},
        {id:ids[1],text:optB||""},
        {id:ids[2],text:optC||""},
        {id:ids[3],text:optD||""},
      ];
      const idx = ["A","B","C","D"].indexOf((correct||"A").toUpperCase().trim());
      if (idx>=0) q.correctAnswer = ids[idx];
    } else if (type==="True/False") {
      q.correctAnswer = (correct||"True").trim();
    } else if (type==="Fill in the Blank") {
      q.correctAnswer = correct||"";
    }
    qs.push(q);
  }
  return qs;
}

function Step2({ questions, onChange }: { questions: Question[]; onChange:(qs:Question[])=>void }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<Partial<Question>|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function saveQ(q: Question) {
    onChange(questions.find(x=>x.id===q.id)?questions.map(x=>x.id===q.id?q:x):[...questions,q]);
    setModal(null);
  }
  function downloadTemplate() {
    const headers = ["Question Type","Question Text","Option A","Option B","Option C","Option D","Correct Answer (A/B/C/D or True/False)","Marks","Is Important (yes/no)"];
    const sample = [
      ["MCQ","What is 2+2?","3","4","5","6","B","1","no"],
      ["True/False","The sun is a star.","","","","","True","1","yes"],
      ["Short Answer","Describe photosynthesis.","","","","","","2","no"],
      ["Fill in the Blank","Water is made up of H2O and ___.","","","","","Oxygen","1","no"],
      ["Diagram Based","Draw and label the water cycle.","","","","","","4","yes"],
      ["Essay","Explain the causes of World War II.","","","","","","5","no"],
    ];
    exportCSV("assessment_questions_template.csv", headers, sample);
    toast.success(t("admin.academics.assessments.templateDownloaded"));
  }
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseCSVQuestions(ev.target?.result as string);
        if (parsed.length===0) { toast.error(t("admin.academics.assessments.noValidQuestionsFound")); return; }
        onChange([...questions, ...parsed]);
        toast.success(t("admin.academics.assessments.importedQuestions",{count:parsed.length}));
      } catch {
        toast.error(t("admin.academics.assessments.failedToParseFile"));
      }
    };
    reader.readAsText(file);
    e.target.value="";
  }

  return (
    <>
      {modal&&<QEditor q={modal} onSave={saveQ} onClose={()=>setModal(null)}/>}
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport}/>
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">{t("admin.academics.assessments.questionsCount",{count:questions.length})}</h2>
              <p className="text-sm text-slate-400">{t("admin.academics.assessments.addQuestionsToAssessment")}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={()=>setModal({})}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[12px] font-bold shadow-[0_4px_14px_rgba(124,58,237,0.3)]">
                <Plus className="h-3.5 w-3.5"/> {t("admin.academics.assessments.addQuestion")}
              </button>
              <button onClick={()=>fileRef.current?.click()}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5"/> {t("admin.academics.assessments.importCsv")}
              </button>
              <button onClick={downloadTemplate}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50">
                <Download className="h-3.5 w-3.5"/> {t("admin.academics.assessments.template")}
              </button>
            </div>
          </div>
          {questions.length===0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
                <FileText className="h-7 w-7 text-[#7C3AED]"/>
              </div>
              <p className="font-bold text-slate-900 mb-1">{t("admin.academics.assessments.noQuestionsYet")}</p>
              <p className="text-sm text-slate-400 mb-1">{t("admin.academics.assessments.clickAddQuestionHint")}</p>
              <p className="text-[11px] text-slate-400 mb-4">{t("admin.academics.assessments.orUseImportCsvHint")}</p>
              <div className="flex items-center gap-2">
                <button onClick={()=>setModal({})} className="flex items-center gap-2 h-9 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">
                  <Plus className="h-4 w-4"/> {t("admin.academics.assessments.addQuestion")}
                </button>
                <button onClick={downloadTemplate} className="flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                  <Download className="h-4 w-4"/> {t("admin.academics.assessments.downloadTemplate")}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map((q,i)=>(
                <div key={q.id} className="flex items-start gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 hover:shadow-sm transition-shadow">
                  <GripVertical className="h-4 w-4 text-slate-300 mt-1 cursor-grab shrink-0"/>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[12px] font-black text-slate-600 shrink-0 mt-0.5">{i+1}</div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg", Q_TYPE_COLORS[q.type]||"bg-slate-100 text-slate-600")}>{t(Q_TYPE_LABEL_KEYS[q.type]||q.type)}</span>
                    {q.isImportant&&<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{q.text}</p>
                    {q.type==="MCQ"&&q.options&&(
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {q.options.map((o,j)=>`${String.fromCharCode(65+j)}) ${o.text||"—"}`).join("  ")}
                      </p>
                    )}
                    {q.type==="Diagram Based"&&q.diagramDescription&&(
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">↳ {q.diagramDescription}</p>
                    )}
                  </div>
                  <span className="text-[12px] font-bold text-slate-600 shrink-0 mt-1">{q.marks}m</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={()=>setModal(q)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><Edit2 className="h-3.5 w-3.5 text-slate-400"/></button>
                    <button onClick={()=>onChange([...questions,{...q,id:qid()}])} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><Copy className="h-3.5 w-3.5 text-slate-400"/></button>
                    <button onClick={()=>onChange(questions.filter(x=>x.id!==q.id))} className="w-7 h-7 rounded-lg hover:bg-rose-100 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500"/></button>
                  </div>
                </div>
              ))}
              <button onClick={()=>setModal({})}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-[#7C3AED] hover:text-[#7C3AED] hover:bg-violet-50 text-sm font-semibold transition-colors mt-2">
                <Plus className="h-4 w-4"/> {t("admin.academics.assessments.addAnotherQuestion")}
              </button>
            </div>
          )}
        </div>
        <div className="w-56 shrink-0"><QSummaryPanel questions={questions}/></div>
      </div>
    </>
  );
}

// ─── Step 3 – Settings ────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button onClick={()=>onChange(!on)} className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0", on?"bg-[#7C3AED]":"bg-slate-200")}>
      <span className={cn("absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", on&&"translate-x-5")}/>
    </button>
  );
}

interface S3 { shuffle:boolean; showTimer:boolean; negativeMarking:boolean; submissionMode:"offline"|"online"; resultRelease:"immediate"|"manual" }
const DEF_S3: S3 = {shuffle:false,showTimer:true,negativeMarking:false,submissionMode:"offline",resultRelease:"immediate"};

function Step3({ settings, onChange, data }: { settings:S3; onChange:(s:S3)=>void; data:Partial<Assessment> }) {
  const { t } = useTranslation();
  function set<K extends keyof S3>(k:K,v:S3[K]) { onChange({...settings,[k]:v}); }
  const Row = ({label,desc,children}:{label:string;desc?:string;children:React.ReactNode})=>(
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div><p className="text-sm font-semibold text-slate-800">{label}</p>{desc&&<p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>}</div>
      {children}
    </div>
  );
  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <h2 className="text-lg font-black text-slate-900">{t("admin.academics.assessments.assessmentSettings")}</h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("admin.academics.assessments.general")}</p>
          <Row label={t("admin.academics.assessments.shuffleQuestions")} desc={t("admin.academics.assessments.shuffleQuestionsDesc")}><Toggle on={settings.shuffle} onChange={v=>set("shuffle",v)}/></Row>
          <Row label={t("admin.academics.assessments.showTimer")} desc={t("admin.academics.assessments.showTimerDesc")}><Toggle on={settings.showTimer} onChange={v=>set("showTimer",v)}/></Row>
          <Row label={t("admin.academics.assessments.negativeMarking")} desc={t("admin.academics.assessments.negativeMarkingDesc")}><Toggle on={settings.negativeMarking} onChange={v=>set("negativeMarking",v)}/></Row>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("admin.academics.assessments.submission")}</p>
          <Row label={t("admin.academics.assessments.submissionMode")}>
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {(["offline","online"] as const).map(m=>(
                <button key={m} onClick={()=>set("submissionMode",m)}
                  className={cn("px-4 py-1.5 text-[11px] font-bold transition-colors",
                    settings.submissionMode===m?"bg-[#7C3AED] text-white":"text-slate-500 hover:bg-slate-50")}>
                  {m==="offline"?`📄 ${t("admin.academics.assessments.offline")}`:`🌐 ${t("admin.academics.assessments.online")}`}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t("admin.academics.assessments.resultRelease")}>
            <select value={settings.resultRelease} onChange={e=>set("resultRelease",e.target.value as any)}
              className="h-8 px-3 rounded-xl border border-slate-200 text-[12px] outline-none focus:border-[#7C3AED] bg-white">
              <option value="immediate">{t("admin.academics.assessments.immediatelyAfterSubmission")}</option>
              <option value="manual">{t("admin.academics.assessments.manualRelease")}</option>
            </select>
          </Row>
        </div>
      </div>
      <div className="w-56 shrink-0"><SummaryPanel data={data} questions={[]}/></div>
    </div>
  );
}

// ─── Step 4 – Review & Publish ────────────────────────────────────────────────

function Step4({ data, questions, onPublish, onDraft }: { data:Partial<Assessment>; questions:Question[]; onPublish:()=>void; onDraft:()=>void }) {
  const { t } = useTranslation();
  const totalM = questions.reduce((a,q)=>a+q.marks,0);
  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-4">
        <h2 className="text-lg font-black text-slate-900">{t("admin.academics.assessments.reviewAndPublish")}</h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">{t("admin.academics.assessments.assessmentSummary")}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {label:t("admin.academics.assessments.title"),    value:data.title||"—"},
              {label:t("admin.academics.assessments.type"),     value:data.type?t(A_TYPE_LABEL_KEYS[data.type]||data.type):"—"},
              {label:t("admin.academics.assessments.subject"),  value:data.subject?t(SUBJECT_LABEL_KEYS[data.subject]||data.subject):"—"},
              {label:t("admin.academics.assessments.grade"),    value:data.grade||"—"},
              {label:t("admin.academics.assessments.section"),  value:data.section?t("admin.academics.assessments.sectionValue",{name:data.section}):t("admin.academics.assessments.all")},
              {label:t("admin.academics.assessments.teacher"),  value:data.teacher||"—"},
              {label:t("admin.academics.assessments.date"),     value:data.date||"—"},
              {label:t("admin.academics.assessments.duration"), value:data.duration?t("admin.academics.assessments.durationMin",{n:data.duration}):"—"},
              {label:t("admin.academics.assessments.totalMarks"),   value:data.totalMarks?String(data.totalMarks):(totalM?String(totalM):"—")},
              {label:t("admin.academics.assessments.passingMarks"), value:data.passingMarks?String(data.passingMarks):"—"},
              {label:t("admin.academics.assessments.questions"),value:String(questions.length)},
            ].map(r=>(
              <div key={r.label} className="flex gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-28 shrink-0">{r.label}</span>
                <span className="text-sm font-semibold text-slate-800 truncate">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        {questions.length>0&&(
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("admin.academics.assessments.questionsCount",{count:questions.length})}</p>
            {questions.map((q,i)=>(
              <div key={q.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-[11px] font-bold text-slate-400 w-5 shrink-0">Q{i+1}</span>
                <span className="text-sm flex-1 truncate text-slate-700">{q.text||t("admin.academics.assessments.noText")}</span>
                {q.isImportant&&<Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0"/>}
                <span className="text-[11px] font-bold text-slate-500 shrink-0">{q.marks}m</span>
              </div>
            ))}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("admin.academics.assessments.publishOptions")}</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onPublish}
              className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors">
              <Check className="h-6 w-6"/>
              <span className="text-sm font-bold">{t("admin.academics.assessments.publishNow")}</span>
              <span className="text-[10px] opacity-70">{t("admin.academics.assessments.studentsNotifiedImmediately")}</span>
            </button>
            <button onClick={onDraft}
              className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors">
              <FileText className="h-6 w-6"/>
              <span className="text-sm font-bold">{t("admin.academics.assessments.saveAsDraft")}</span>
              <span className="text-[10px] text-slate-400">{t("admin.academics.assessments.finishLater")}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="w-56 shrink-0"><SummaryPanel data={data} questions={questions}/></div>
    </div>
  );
}

// ─── Create Wizard ────────────────────────────────────────────────────────────

const BLANK: Partial<Assessment> = {title:"",chapter:"",type:undefined,grade:"",section:"",subject:"",teacher:"",date:"",duration:45,totalMarks:0,passingMarks:0,description:"",resultVisibility:"immediate",resultsReleased:false};

function CreateWizard({ onDone }: { onDone:()=>void }) {
  const { t } = useTranslation();
  const [step,      setStep]     = useState(1);
  const [data,      setData]     = useState<Partial<Assessment>>(BLANK);
  const [questions, setQuestions]= useState<Question[]>([]);
  const [settings,  setSettings] = useState<S3>(DEF_S3);
  const [saving,    setSaving]   = useState(false);

  function validate(s: number) {
    if (s===1) {
      if (!data.title?.trim()) { toast.error(t("admin.academics.assessments.enterAssessmentTitle")); return false; }
      if (!data.type)          { toast.error(t("admin.academics.assessments.selectAssessmentType")); return false; }
      if (!data.subject)       { toast.error(t("admin.academics.assessments.selectSubjectError")); return false; }
      if (!data.grade)         { toast.error(t("admin.academics.assessments.selectGradeError")); return false; }
      if (!data.totalMarks)    { toast.error(t("admin.academics.assessments.enterTotalMarks")); return false; }
    }
    return true;
  }
  function next() { if (validate(step)) setStep(s=>Math.min(4,s+1)); }
  function back() { setStep(s=>Math.max(1,s-1)); }

  async function commit(status: AStatus) {
    if (saving) return;
    if (status === "Active" && questions.length === 0) { toast.error(t("admin.academics.assessments.addAtLeastOneQuestion")); return; }
    setSaving(true);
    try {
      const a: Assessment = {
        ...(data as Assessment), id:uid(), questions,
        submissions:0, totalStudents:0, status, createdAt:new Date().toISOString(),
        resultVisibility: settings.resultRelease,
        resultsReleased: settings.resultRelease === "immediate",
      };
      await smartDb.create("assessments", a, a.id);
      // Notify students when published (not draft)
      if (status === "Active") {
        const sectionLabel = data.section ? `Section ${data.section}` : "All Sections";
        const audience = `${data.grade || "All Grades"} · ${sectionLabel}`;
        fetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `ntf-assess-${a.id}`,
            type: "create",
            entity: "Assessment",
            category: "assessment",
            audienceRole: "student",
            recipientGrade: data.grade || "",
            recipientSection: data.section || "",
            title: `New assessment: ${data.title}`,
            message: `A new ${data.type} "${data.title}" has been assigned for ${data.subject} (${audience}). Due: ${data.date || "TBD"}.`,
            time: new Date().toISOString(),
            uid: "admin",
          }),
        }).catch(() => {});
      }
      toast.success(status==="Active"?t("admin.academics.assessments.publishedNotified"):t("admin.academics.assessments.savedAsDraft"));
      onDone();
    } catch (err) {
      console.error("Failed to save assessment:", err);
      toast.error(t("admin.academics.assessments.failedToSaveRetry"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F7FF]">
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-3">
          <button onClick={onDone} className="hover:text-[#7C3AED]">{t("admin.academics.assessments.pageTitle")}</button>
          <ChevronRight className="h-3 w-3 rtl:rotate-180"/>
          <span className="text-[#7C3AED] font-semibold">{t("admin.academics.assessments.createAssessment")}</span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onDone} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-slate-600 rtl:rotate-180"/>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900">{t("admin.academics.assessments.createAssessment")}</h1>
              <p className="text-[12px] text-slate-400">{t("admin.academics.assessments.createAssessmentSubtitle")}</p>
            </div>
          </div>
          <button onClick={()=>commit("Draft")} disabled={saving}
            className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving?t("admin.academics.assessments.saving"):t("admin.academics.assessments.saveAsDraft")}
          </button>
        </div>
        <StepBar step={step}/>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        {step===1&&<Step1 data={data} onChange={setData}/>}
        {step===2&&<Step2 questions={questions} onChange={setQuestions}/>}
        {step===3&&<Step3 settings={settings} onChange={setSettings} data={data}/>}
        {step===4&&<Step4 data={data} questions={questions} onPublish={()=>commit("Active")} onDraft={()=>commit("Draft")}/>}
      </div>
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between sticky bottom-0">
        <button onClick={back} disabled={step===1}
          className="flex items-center gap-1.5 h-10 px-5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 transition-all">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180"/> {t("admin.academics.assessments.previousStep")}
        </button>
        {step<4&&(
          <button onClick={next}
            className="flex items-center gap-1.5 h-10 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all">
            {t("admin.academics.assessments.nextStep")} <ArrowRight className="h-4 w-4 rtl:rotate-180"/>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Assessment Detail View ───────────────────────────────────────────────────

function AssessmentDetail({ assessment, onBack }: { assessment: Assessment; onBack:()=>void }) {
  const { t } = useTranslation();
  const [students,    setStudents]    = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [allStudents, allSubs] = await Promise.all([
          smartDb.getAll("students"),
          getAllAttempts(),
        ]);
        // Filter students matching this assessment's grade/section
        const enrolled = (allStudents as any[]).filter(s => {
          const g = (s.grade || s.class || s.className || "").toLowerCase();
          const sec = (s.section || s.classSection || "").toUpperCase();
          const targetGrade = assessment.grade.toLowerCase();
          const targetSection = (assessment.section || "").toUpperCase();
          const gradeMatch = g.includes(targetGrade) || targetGrade.includes(g);
          const sectionMatch = !assessment.section || sec === targetSection;
          return gradeMatch && sectionMatch;
        });
        const thisSubs = allSubs.filter(s => s.assessmentId === String(assessment.id));
        setStudents(enrolled);
        setSubmissions(thisSubs);
      } catch (err) {
        console.error("Failed to load submission data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assessment.id, assessment.grade, assessment.section]);

  const rows = useMemo(() => students.map(s => {
    const sub = submissions.find(x => String(x.studentId) === String(s.id||s.uid));
    return {
      id:    s.id || s.uid || "",
      name:  s.name || s.displayName || s.fullName || "Unknown Student",
      roll:  s.roll || s.rollNumber || s.admissionNo || "—",
      submitted:  sub?.status === "submitted",
      submittedAt: sub?.submittedAt || null,
      marks:  sub?.score ?? null,
      isMarked: !!sub?.isMarked,
    };
  }), [students, submissions]);

  const submitted    = rows.filter(r=>r.submitted);
  const notSubmitted = rows.filter(r=>!r.submitted);

  function handleExport() {
    const headers = [
      t("admin.academics.assessments.studentName"), t("admin.academics.assessments.rollNo"),
      t("admin.academics.assessments.status"), t("admin.academics.assessments.submittedAt"),
      t("admin.academics.assessments.marksObtained"), t("admin.academics.assessments.marked"),
    ];
    const csvRows = rows.map(r=>[
      r.name, r.roll,
      r.submitted?t("admin.academics.assessments.submitted"):t("admin.academics.assessments.notSubmitted"),
      r.submittedAt||"—",
      r.marks!==null?String(r.marks):"—",
      r.isMarked?t("admin.academics.assessments.yes"):t("admin.academics.assessments.no"),
    ]);
    exportCSV(`${assessment.title.replace(/[^a-z0-9]/gi,"_")}_results.csv`, headers, csvRows);
    toast.success(t("admin.academics.assessments.exportedToCsv"));
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl hover:bg-white border border-slate-200 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-slate-600 rtl:rotate-180"/>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900">{assessment.title}</h1>
            <p className="text-sm text-slate-400">{assessment.grade}{assessment.section?` – ${t("admin.academics.assessments.sectionValue",{name:assessment.section})}`:""} · {t(SUBJECT_LABEL_KEYS[assessment.subject]||assessment.subject)} · {t(A_TYPE_LABEL_KEYS[assessment.type]||assessment.type)}</p>
          </div>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 h-9 px-4 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-50">
          <Download className="h-4 w-4"/> {t("admin.academics.assessments.exportExcel")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {label:t("admin.academics.assessments.totalStudents"), value:rows.length||assessment.totalStudents, color:"text-slate-900",bg:"bg-slate-100",Icon:Users},
          {label:t("admin.academics.assessments.submitted"),      value:submitted.length,   color:"text-emerald-700",bg:"bg-emerald-100",Icon:Check},
          {label:t("admin.academics.assessments.notSubmitted"),  value:notSubmitted.length||Math.max(0,(rows.length||assessment.totalStudents)-submitted.length), color:"text-rose-600",bg:"bg-rose-100",Icon:X},
          {label:t("admin.academics.assessments.marked"),         value:submitted.filter(r=>r.isMarked).length, color:"text-violet-700",bg:"bg-violet-100",Icon:ClipboardCheck},
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

      {/* Assessment Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("admin.academics.assessments.assessmentDetails")}</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            {label:t("admin.academics.assessments.date"),     value:assessment.date||"—"},
            {label:t("admin.academics.assessments.duration"), value:assessment.duration?t("admin.academics.assessments.durationMin",{n:assessment.duration}):"—"},
            {label:t("admin.academics.assessments.totalMarks"),  value:String(assessment.totalMarks)},
            {label:t("admin.academics.assessments.teacher"),  value:assessment.teacher||"—"},
          ].map(r=>(
            <div key={r.label}>
              <p className="text-[11px] text-slate-400 font-medium">{r.label}</p>
              <p className="text-sm font-semibold text-slate-800">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin"/>
            <p className="text-sm text-slate-400">{t("admin.academics.assessments.loadingStudentData")}</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center">
          <Users className="h-10 w-10 text-slate-300 mb-3"/>
          <p className="font-bold text-slate-700 mb-1">{t("admin.academics.assessments.noStudentsFound")}</p>
          <p className="text-sm text-slate-400">{t("admin.academics.assessments.noStudentsFoundHint",{grade:assessment.grade,section:assessment.section?` ${t("admin.academics.assessments.sectionValue",{name:assessment.section})}`:""})}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-black text-slate-900">{t("admin.academics.assessments.studentSubmissionStatus")}</p>
            <span className="text-[11px] text-slate-400">{t("admin.academics.assessments.studentsCount",{count:rows.length})}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[
                  "#", t("admin.academics.assessments.studentName"), t("admin.academics.assessments.rollNo"),
                  t("admin.academics.assessments.status"), t("admin.academics.assessments.submittedAt"),
                  t("admin.academics.assessments.marks"), t("admin.academics.assessments.marked"),
                ].map(h=>(
                  <th key={h} className="text-start px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={r.id} className={cn("border-b border-slate-50 hover:bg-slate-50/50",i%2===0?"bg-white":"bg-slate-50/20")}>
                  <td className="px-4 py-3 text-[12px] text-slate-400 font-bold">{i+1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 text-[13px]">{r.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">{r.roll}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-xl",
                      r.submitted?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-600")}>
                      {r.submitted?t("admin.academics.assessments.submitted"):t("admin.academics.assessments.notSubmitted")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{r.submittedAt||"—"}</td>
                  <td className="px-4 py-3">
                    {r.marks!==null
                      ? <span className="font-bold text-slate-900">{r.marks} / {assessment.totalMarks}</span>
                      : <span className="text-[11px] text-slate-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-lg",
                      r.isMarked?"bg-violet-100 text-violet-700":"bg-slate-100 text-slate-500")}>
                      {r.isMarked?t("admin.academics.assessments.marked"):t("admin.academics.assessments.pending")}
                    </span>
                  </td>
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

function ListView({ onCreate, onDetail, onEdit }: { onCreate:()=>void; onDetail:(a:Assessment)=>void; onEdit:(a:Assessment)=>void }) {
  const { t } = useTranslation();
  const grades = useGrades();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterGrade,   setFilterGrade]   = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [filterStatus,  setFilterStatus]  = useState("");
  const [page,          setPage]          = useState(1);
  const [openMenu,      setOpenMenu]      = useState<string|null>(null);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [roster, setRoster] = useState<any[]>([]);
  const PER = 10;

  async function loadAssessments() {
    try {
      const [data, allAttempts, allStudents] = await Promise.all([
        smartDb.getAll("assessments") as Promise<Assessment[]>,
        getAllAttempts(),
        smartDb.getAll("students") as Promise<any[]>,
      ]);
      const arr = Array.isArray(data) ? data : [];
      setAssessments(arr);
      // "Submissions" must reflect real attempts, not the stale a.submissions
      // field on the assessment row (frozen at creation, never incremented) —
      // count live rows from getAllAttempts() per assessment, same as the
      // per-assessment detail view already does.
      const counts: Record<string, number> = {};
      for (const a of arr) {
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

  useEffect(() => { loadAssessments(); }, []);

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
    const q=(a.title+a.subject+(a.chapter||"")+(a.teacher||"")).toLowerCase().includes(search.toLowerCase());
    return q&&(!filterSubject||a.subject===filterSubject)&&(!filterGrade||a.grade===filterGrade)&&(!filterType||a.type===filterType)&&(!filterStatus||a.status===filterStatus);
  }),[assessments,search,filterSubject,filterGrade,filterType,filterStatus]);

  const totalPages = Math.max(1,Math.ceil(filtered.length/PER));
  const paged = filtered.slice((page-1)*PER,page*PER);

  const stats = {
    total:assessments.length,
    completed:assessments.filter(a=>a.status==="Completed").length,
    upcoming:assessments.filter(a=>a.status==="Upcoming").length,
    drafts:assessments.filter(a=>a.status==="Draft").length,
  };
  const typeData = Object.entries(assessments.filter(a=>a.type).reduce((acc,a)=>{acc[a.type]=(acc[a.type]||0)+1;return acc;},{} as Record<string,number>))
    .map(([label,value],i)=>({label,value,color:CHART_COLORS[i%CHART_COLORS.length]}));
  const typeTotal = typeData.reduce((a,x)=>a+x.value,0);

  async function deleteA(id:string) {
    try {
      await smartDb.delete("assessments", id);
      setAssessments(prev=>prev.filter(a=>a.id!==id));
      toast.success(t("admin.academics.assessments.assessmentDeleted"));
    } catch {
      toast.error(t("admin.academics.assessments.failedToDelete"));
    }
    setOpenMenu(null);
  }

  return (
    <div className="flex gap-5 min-h-full">
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="h-5 w-5 text-[#7C3AED]"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("admin.academics.assessments.pageTitle")}</h1>
              <p className="text-sm text-slate-400">{t("admin.academics.assessments.pageSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>loadAssessments()} className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BarChart3 className="h-4 w-4"/> {t("admin.academics.assessments.refresh")}
            </button>
            <button onClick={onCreate}
              className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold shadow-[0_4px_14px_rgba(124,58,237,0.3)]">
              <Plus className="h-4 w-4"/> {t("admin.academics.assessments.createAssessment")}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {label:t("admin.academics.assessments.total"),    value:stats.total,     Icon:ClipboardCheck,color:"text-[#7C3AED]",bg:"bg-violet-100"},
            {label:t("admin.academics.assessments.statusCompleted"),value:stats.completed, Icon:Check,        color:"text-emerald-600",bg:"bg-emerald-100"},
            {label:t("admin.academics.assessments.statusUpcoming"), value:stats.upcoming,  Icon:Clock,        color:"text-orange-500", bg:"bg-orange-100"},
            {label:t("admin.academics.assessments.drafts"),   value:stats.drafts,    Icon:FileText,     color:"text-slate-500",  bg:"bg-slate-100"},
          ].map(c=>(
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",c.bg)}>
                <c.Icon className={cn("h-6 w-6",c.color)}/>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">{c.label}</p>
                <p className="text-2xl font-black text-slate-900">{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400"/>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              placeholder={t("admin.academics.assessments.searchPlaceholder")}
              className="w-full ps-9 pe-3 h-9 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"/>
          </div>
          {[
            {ph:t("admin.academics.assessments.allSubjects"),val:filterSubject,set:(v:string)=>{setFilterSubject(v);setPage(1);},opts:SUBJECTS,labelKeys:SUBJECT_LABEL_KEYS},
            {ph:t("admin.academics.assessments.allGrades"),  val:filterGrade,  set:(v:string)=>{setFilterGrade(v);setPage(1);},  opts:grades,labelKeys:null},
            {ph:t("admin.academics.assessments.allTypes"),   val:filterType,   set:(v:string)=>{setFilterType(v);setPage(1);},   opts:A_TYPES as string[],labelKeys:A_TYPE_LABEL_KEYS},
            {ph:t("admin.academics.assessments.allStatus"),  val:filterStatus, set:(v:string)=>{setFilterStatus(v);setPage(1);}, opts:["Active","Upcoming","Completed","Draft"],labelKeys:STATUS_LABEL_KEYS},
          ].map(f=>(
            <select key={f.ph} value={f.val} onChange={e=>f.set(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#7C3AED] bg-white">
              <option value="">{f.ph}</option>
              {f.opts.map(o=><option key={o} value={o}>{f.labelKeys?t(f.labelKeys[o]||o):o}</option>)}
            </select>
          ))}
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Filter className="h-4 w-4"/> {t("admin.academics.assessments.filter")}
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin"/>
                <p className="text-sm text-slate-400">{t("admin.academics.assessments.loadingAssessments")}</p>
              </div>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {[
                      t("admin.academics.assessments.assessmentTitleCol"), t("admin.academics.assessments.type"),
                      t("admin.academics.assessments.subject"), t("admin.academics.assessments.gradeSection"),
                      t("admin.academics.assessments.teacher"), t("admin.academics.assessments.marks"),
                      t("admin.academics.assessments.dueDate"), t("admin.academics.assessments.submissions"),
                      t("admin.academics.assessments.status"), t("admin.academics.assessments.actions"),
                    ].map(h=>(
                      <th key={h} className="text-start px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a,i)=>{
                    const dl=daysLeft(a.date, t);
                    const liveSubmissions = liveCounts[a.id] ?? 0;
                    const liveTotal = enrolledCount(a) || a.totalStudents;
                    const pct=liveTotal>0?Math.round(liveSubmissions/liveTotal*100):0;
                    return (
                      <tr key={a.id} onClick={()=>onDetail(a)}
                        className={cn("border-b border-slate-50 hover:bg-violet-50/30 cursor-pointer transition-colors",i%2===0?"bg-white":"bg-slate-50/20")}>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="font-semibold text-slate-800 text-[13px] truncate">{a.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.chapter||""}</p>
                        </td>
                        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap",TYPE_COLORS[a.type]||"bg-slate-100 text-slate-600")}>{t(A_TYPE_LABEL_KEYS[a.type]||a.type)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-[13px] whitespace-nowrap">{t(SUBJECT_LABEL_KEYS[a.subject]||a.subject)}</td>
                        <td className="px-4 py-3 text-slate-600 text-[13px] whitespace-nowrap">{a.grade}{a.section?` – ${a.section}`:""}</td>
                        <td className="px-4 py-3 text-slate-600 text-[12px] whitespace-nowrap">{a.teacher||"—"}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{a.totalMarks}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-[12px] text-slate-500"><Calendar className="h-3 w-3 shrink-0"/>{a.date||"—"}</div>
                          <p className={cn("text-[11px] font-semibold mt-0.5",dl.urgent?"text-rose-600":"text-slate-400")}>{dl.text}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-semibold text-slate-800">{liveSubmissions} / {liveTotal}</p>
                          {liveTotal>0&&<p className="text-[11px] text-slate-400">{pct}%</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-xl",STATUS_COLORS[a.status]||"bg-slate-100 text-slate-600")}>{t(STATUS_LABEL_KEYS[a.status]||a.status)}</span>
                        </td>
                        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-1 relative">
                            <button onClick={()=>onDetail(a)} className="w-7 h-7 rounded-lg hover:bg-violet-100 flex items-center justify-center" title={t("admin.academics.assessments.viewSubmissions")}>
                              <Eye className="h-3.5 w-3.5 text-[#7C3AED]"/>
                            </button>
                            <button onClick={()=>setOpenMenu(openMenu===a.id?null:a.id)}
                              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><MoreVertical className="h-3.5 w-3.5 text-slate-400"/></button>
                            {openMenu===a.id&&(
                              <div className="absolute end-0 top-8 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 w-36">
                                <button onClick={()=>onDetail(a)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5"/>{t("admin.academics.assessments.viewDetails")}</button>
                                <button onClick={()=>{ setOpenMenu(null); onEdit(a); }} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"><Edit2 className="h-3.5 w-3.5"/>{t("admin.academics.assessments.edit")}</button>
                                {a.resultVisibility!=="immediate" && !a.resultsReleased && (
                                  <button onClick={async()=>{ setOpenMenu(null); await smartDb.update("assessments",a.id,{resultsReleased:true}); toast.success(t("admin.academics.assessments.resultsReleasedToast")); setAssessments(prev=>prev.map(x=>x.id===a.id?{...x,resultsReleased:true}:x)); }} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-50"><Check className="h-3.5 w-3.5"/>{t("admin.academics.assessments.releaseResults")}</button>
                                )}
                                {a.resultsReleased && (
                                  <span className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-slate-400"><Check className="h-3.5 w-3.5 text-emerald-500"/>{t("admin.academics.assessments.resultsReleased")}</span>
                                )}
                                <button onClick={()=>deleteA(a.id)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5"/>{t("admin.academics.assessments.delete")}</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length===0&&(
                    <tr><td colSpan={10} className="py-16 text-center text-slate-400">
                      {assessments.length===0?t("admin.academics.assessments.noAssessmentsYet"):t("admin.academics.assessments.noAssessmentsMatch")}
                    </td></tr>
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[12px] text-slate-500">
                  {t("admin.academics.assessments.showingRange",{from:filtered.length===0?0:(page-1)*PER+1,to:Math.min(page*PER,filtered.length),total:filtered.length})}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4 text-slate-500 rtl:rotate-180"/>
                  </button>
                  {Array.from({length:Math.min(5,totalPages)},(_,i)=>i+1).map(p=>(
                    <button key={p} onClick={()=>setPage(p)}
                      className={cn("w-8 h-8 rounded-lg text-sm font-bold transition-colors",
                        p===page?"bg-[#7C3AED] text-white":"border border-slate-200 text-slate-600 hover:bg-white")}>
                      {p}
                    </button>
                  ))}
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white disabled:opacity-40">
                    <ChevronRight className="h-4 w-4 text-slate-500 rtl:rotate-180"/>
                  </button>
                  <span className="text-[12px] text-slate-400 ms-1">{t("admin.academics.assessments.perPage")}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Panel – compact */}
      <div className="w-52 shrink-0 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="font-black text-slate-900 mb-3 text-sm">{t("admin.academics.assessments.assessmentTypes")}</p>
          {typeTotal>0?(
            <>
              <div className="w-32 h-32 mx-auto mb-3">
                <DonutChart data={typeData} total={typeTotal}/>
              </div>
              <div className="space-y-1.5">
                {typeData.map(td=>(
                  <div key={td.label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{background:td.color}}/>
                    <span className="text-[11px] text-slate-600 flex-1 truncate">{t(A_TYPE_LABEL_KEYS[td.label]||td.label)}</span>
                    <span className="text-[11px] font-bold text-slate-700">{td.value}</span>
                  </div>
                ))}
              </div>
            </>
          ):(
            <p className="text-[11px] text-slate-400 text-center py-4">{t("admin.academics.assessments.noDataYet")}</p>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2"><Lightbulb className="h-4 w-4 text-amber-500"/><p className="font-bold text-amber-800 text-sm">{t("admin.academics.assessments.tip")}</p></div>
          <p className="text-[11px] text-amber-700">{t("admin.academics.assessments.clickRowHint")}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Wizard ─────────────────────────────────────────────────────────────

function EditWizard({ assessment, onDone }: { assessment: Assessment; onDone: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<Assessment>>({ ...assessment });
  const [questions, setQuestions] = useState<Question[]>(assessment.questions || []);
  const [settings, setSettings] = useState<S3>(DEF_S3);
  const [saving, setSaving] = useState(false);

  function validate(s: number) {
    if (s===1) {
      if (!data.title?.trim()) { toast.error(t("admin.academics.assessments.enterAssessmentTitle")); return false; }
      if (!data.type) { toast.error(t("admin.academics.assessments.selectAssessmentType")); return false; }
      if (!data.subject) { toast.error(t("admin.academics.assessments.selectSubjectError")); return false; }
      if (!data.grade) { toast.error(t("admin.academics.assessments.selectGradeError")); return false; }
      if (!data.totalMarks) { toast.error(t("admin.academics.assessments.enterTotalMarks")); return false; }
    }
    return true;
  }
  function next() { if (validate(step)) setStep(s=>Math.min(4,s+1)); }
  function back() { setStep(s=>Math.max(1,s-1)); }

  async function commit(status: AStatus) {
    if (saving) return;
    if (status === "Active" && questions.length === 0) { toast.error(t("admin.academics.assessments.addAtLeastOneQuestion")); return; }
    setSaving(true);
    try {
      const updated: Assessment = { ...(data as Assessment), questions, status };
      await smartDb.update("assessments", assessment.id, updated);
      toast.success(t("admin.academics.assessments.assessmentUpdated"));
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("admin.academics.assessments.failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F7FF]">
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-3">
          <button onClick={onDone} className="hover:text-[#7C3AED]">{t("admin.academics.assessments.pageTitle")}</button>
          <ChevronRight className="h-3 w-3 rtl:rotate-180"/>
          <span className="text-[#7C3AED] font-semibold">{t("admin.academics.assessments.editAssessment")}</span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onDone} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-slate-600 rtl:rotate-180"/>
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900">{t("admin.academics.assessments.editAssessment")}</h1>
              <p className="text-[12px] text-slate-400">{t("admin.academics.assessments.updateAssessmentDetails")}</p>
            </div>
          </div>
          <button onClick={()=>commit(data.status as AStatus || "Draft")} disabled={saving}
            className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving?t("admin.academics.assessments.saving"):t("admin.academics.assessments.saveDraft")}
          </button>
        </div>
        <StepBar step={step}/>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        {step===1&&<Step1 data={data} onChange={setData}/>}
        {step===2&&<Step2 questions={questions} onChange={setQuestions}/>}
        {step===3&&<Step3 settings={settings} onChange={setSettings} data={data}/>}
        {step===4&&<Step4 data={data} questions={questions} onPublish={()=>commit("Active")} onDraft={()=>commit("Draft")}/>}
      </div>
      {step<4&&(
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between sticky bottom-0">
          <button onClick={back} disabled={step===1}
            className="flex items-center gap-1.5 h-10 px-5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-40">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180"/> {t("admin.academics.assessments.previousStep")}
          </button>
          <button onClick={next}
            className="flex items-center gap-1.5 h-10 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">
            {t("admin.academics.assessments.nextStep")} <ArrowRight className="h-4 w-4 rtl:rotate-180"/>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Assessments() {
  const [view, setView] = useState<"list"|"create"|"edit"|"detail">("list");
  const [selected, setSelected] = useState<Assessment|null>(null);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F7FF]">
        {view==="list" && (
          <ListView
            onCreate={()=>setView("create")}
            onDetail={a=>{setSelected(a);setView("detail");}}
            onEdit={a=>{setSelected(a);setView("edit");}}
          />
        )}
        {view==="create" && <CreateWizard onDone={()=>setView("list")}/>}
        {view==="edit" && selected && <EditWizard assessment={selected} onDone={()=>setView("list")}/>}
        {view==="detail" && selected && <AssessmentDetail assessment={selected} onBack={()=>setView("list")}/>}
      </div>
    </DashboardLayout>
  );
}
