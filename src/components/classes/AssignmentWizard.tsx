import { useState, useRef } from "react";
import { useGrades } from '@/contexts/CurriculumContext';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronRight, ChevronLeft, CheckCircle2, Users, Upload, Settings,
  Eye, Send, FileText, Sparkles, Clock, BookOpen, GraduationCap,
  Calendar, Award, Target, Link2, X, AlertCircle, Check,
  Paperclip, Youtube, FolderOpen, Zap, Shield, RefreshCw,
  Bell, BookMarked, BarChart3, Mail, Smartphone, Globe,
  ClipboardCheck, CheckSquare, Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
const SUBJECTS  = ["Mathematics","Science","English","Urdu","Social Studies","Islamic Studies","Computer","Art","Physical Education","Library","Quran"];
const SECTIONS  = ["A","B","C"];
const ASG_TYPES = ["Homework","Project","Worksheet","Lab Activity","Presentation","Research Work","Online Quiz"];
const DURATIONS = ["15 mins","30 mins","45 mins","1 hour","1.5 hours","2 hours","3+ hours"];

interface WizardForm {
  // Step 1
  title: string; subject: string; grade: string; section: string;
  type: string; dueDate: string; dueTime: string; marks: string; duration: string;
  // Step 2
  audience: "class" | "section" | "groups" | "individual";
  // Step 3
  instructions: string; resources: File[]; links: string[];
  // Step 4
  submissionType: string; allowLate: boolean; resubmit: boolean;
  plagiarism: boolean; rubric: boolean; peerReview: boolean;
  visibility: "now" | "schedule"; scheduleDate: string; scheduleTime: string;
}

const blank = (grade = "Grade 5", section = "A"): WizardForm => ({
  title: "", subject: "Mathematics", grade, section,
  type: "Homework", dueDate: "", dueTime: "03:00 PM", marks: "20", duration: "1 hour",
  audience: "class", instructions: "", resources: [], links: [""],
  submissionType: "File Upload", allowLate: false, resubmit: false,
  plagiarism: false, rubric: false, peerReview: false,
  visibility: "now", scheduleDate: "", scheduleTime: "08:00 AM",
});

interface Props {
  open: boolean;
  defaultGrade?: string;
  defaultSection?: string;
  onClose: () => void;
  onPublish: (form: WizardForm, status: "Published" | "Draft" | "Scheduled") => void;
}

// ─── Step meta ───────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Details",    icon: BookOpen },
  { n: 2, label: "Recipients", icon: Users },
  { n: 3, label: "Resources",  icon: Upload },
  { n: 4, label: "Settings",   icon: Settings },
  { n: 5, label: "Review",     icon: Eye },
  { n: 6, label: "Publish",    icon: Send },
];

// ─── TYPE_ICON ───────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, string> = {
  Homework: "📝", Project: "🏗️", Worksheet: "📋",
  "Lab Activity": "🔬", Presentation: "📊", "Research Work": "🔍", "Online Quiz": "💡",
};

export default function AssignmentWizard({ open, defaultGrade = "Grade 5", defaultSection = "A", onClose, onPublish }: Props) {
  const grades = useGrades();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(blank(defaultGrade, defaultSection));
  const [published, setPublished] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"Published"|"Draft"|"Scheduled">("Published");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  function reset() {
    setStep(1);
    setForm(blank(defaultGrade, defaultSection));
    setPublished(false);
  }

  function handleClose() { reset(); onClose(); }

  // Estimated student count
  const studentCount = form.audience === "individual" ? 1 : form.audience === "groups" ? 8 : 11;

  // Validation per step
  function canNext() {
    if (step === 1) return !!form.title.trim() && !!form.dueDate;
    if (step === 3) return !!form.instructions.trim();
    return true;
  }

  function next() {
    if (!canNext()) {
      if (step === 1) toast.error("Title and Due Date are required");
      if (step === 3) toast.error("Instructions are required");
      return;
    }
    setStep(s => Math.min(6, s + 1));
  }

  function prev() { setStep(s => Math.max(1, s - 1)); }

  function handlePublish(status: "Published" | "Draft" | "Scheduled") {
    setPublishStatus(status);
    setPublished(true);
    onPublish(form, status);
    const msg = status === "Draft" ? "Assignment saved as draft" : status === "Scheduled" ? "Assignment scheduled" : "Assignment published to students!";
    toast.success(msg);
  }

  // ─── Chip toggle ─────────────────────────────────────────────────────────
  function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button onClick={onClick} className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
        active ? "bg-purple-600 text-white border-purple-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-700"
      )}>{label}</button>
    );
  }

  // ─── Toggle option ────────────────────────────────────────────────────────
  function Toggle({ label, desc, value, onChange, icon: Icon }: {
    label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; icon?: typeof Shield
  }) {
    return (
      <button onClick={() => onChange(!value)} className={cn(
        "flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all w-full",
        value ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white hover:border-gray-200"
      )}>
        {Icon && <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", value ? "text-purple-600" : "text-gray-400")} />}
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-semibold", value ? "text-violet-700" : "text-gray-700")}>{label}</p>
          {desc && <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
          value ? "bg-purple-600 border-purple-600" : "border-gray-300"
        )}>
          {value && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Assignment Creation Wizard</h2>
              <p className="text-violet-200 text-xs mt-0.5">Create, schedule and distribute assignments across classes and sections.</p>
            </div>
            <button onClick={handleClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const done = step > s.n;
              const active = step === s.n;
              const Icon = s.icon;
              return (
                <div key={s.n} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex-1 justify-center",
                    done ? "bg-white/20 text-white" : active ? "bg-white text-violet-700 shadow-md" : "bg-white/10 text-violet-300"
                  )}>
                    {done
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-300 shrink-0" />
                      : <Icon className="w-3 h-3 shrink-0" />
                    }
                    <span className="truncate hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.n}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn("w-3 h-0.5 shrink-0", done ? "bg-white/40" : "bg-white/15")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">

          {/* ═══ STEP 1: DETAILS ═══ */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              <StepHeader icon={BookOpen} title="Assignment Details" sub="Define the assignment title, subject, class, and deadline." />

              <div className="grid grid-cols-2 gap-4">
                {/* Title */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Assignment Title <span className="text-red-500">*</span></Label>
                  <Input value={form.title} onChange={e => set("title", e.target.value)}
                    placeholder="e.g. Photosynthesis Process — Chapter 5"
                    className="border-gray-200 focus:border-violet-400 h-10" />
                </div>

                {/* Subject */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Subject <span className="text-red-500">*</span></Label>
                  <Select value={form.subject} onValueChange={v => set("subject", v)}>
                    <SelectTrigger className="h-9 border-gray-200 focus:border-violet-400">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Grade */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Grade <span className="text-red-500">*</span></Label>
                  <Select value={form.grade} onValueChange={v => set("grade", v)}>
                    <SelectTrigger className="h-9 border-gray-200 focus:border-violet-400">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Section */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Section</Label>
                  <div className="flex gap-2">
                    {SECTIONS.map(s => (
                      <button key={s} onClick={() => set("section", s)}
                        className={cn("flex-1 h-9 rounded-lg border-2 text-sm font-bold transition-all",
                          form.section === s ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500 hover:border-violet-300"
                        )}>Section {s}</button>
                    ))}
                  </div>
                </div>

                {/* Assignment Type */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Assignment Type</Label>
                  <Select value={form.type} onValueChange={v => set("type", v)}>
                    <SelectTrigger className="h-9 border-gray-200 focus:border-violet-400">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASG_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{TYPE_ICONS[t]} {t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Due Date */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Due Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)}
                    className="border-gray-200 focus:border-violet-400 h-9" />
                </div>

                {/* Due Time */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Due Time</Label>
                  <Select value={form.dueTime} onValueChange={v => set("dueTime", v)}>
                    <SelectTrigger className="h-9 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["08:00 AM","09:00 AM","10:00 AM","12:00 PM","01:00 PM","03:00 PM","05:00 PM","08:00 PM","11:59 PM"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Max Marks */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Maximum Marks</Label>
                  <Input type="number" min={1} value={form.marks} onChange={e => set("marks", e.target.value)}
                    className="border-gray-200 focus:border-violet-400 h-9" />
                </div>

                {/* Duration */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Estimated Duration</Label>
                  <Select value={form.duration} onValueChange={v => set("duration", v)}>
                    <SelectTrigger className="h-9 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Internal workflow */}
              <div className="rounded-xl bg-white border border-gray-100 p-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Internal Workflow</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {["Teacher enters details","System validates subject","Checks class allocation","Creates draft record"].map((s, i, arr) => (
                    <div key={s} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 font-medium bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">{s}</span>
                      {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: RECIPIENTS ═══ */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <StepHeader icon={Users} title="Target Students" sub="Choose who will receive this assignment." />

              <div className="grid grid-cols-2 gap-3">
                {([
                  { k: "class",      label: "Entire Class",      desc: "All sections of this grade", icon: GraduationCap, count: 33 },
                  { k: "section",    label: "Specific Section",  desc: `${form.grade} · Section ${form.section}`, icon: BookOpen, count: 11 },
                  { k: "groups",     label: "Student Groups",    desc: "Custom groups you've created", icon: Users, count: 8 },
                  { k: "individual", label: "Individual Students", desc: "Pick students one by one", icon: Target, count: 1 },
                ] as const).map(({ k, label, desc, icon: Icon, count }) => (
                  <button key={k} onClick={() => set("audience", k)}
                    className={cn("flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                      form.audience === k ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white hover:border-violet-200"
                    )}>
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      form.audience === k ? "bg-purple-600" : "bg-gray-100"
                    )}>
                      <Icon className={cn("w-5 h-5", form.audience === k ? "text-white" : "text-gray-400")} />
                    </div>
                    <div className="flex-1">
                      <p className={cn("text-sm font-bold", form.audience === k ? "text-violet-700" : "text-gray-800")}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                    </div>
                    {form.audience === k && (
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>

              {/* Student count badge */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-violet-700">{studentCount} <span className="text-sm font-semibold">Students</span></p>
                    <p className="text-xs text-violet-500">Will receive this assignment</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-500">{form.grade} · Section {form.section}</p>
                  <p className="text-xs text-gray-400">{form.subject}</p>
                </div>
              </div>

              {/* Mini student list preview */}
              <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600">Student Preview</p>
                  <p className="text-[11px] text-gray-400">{studentCount} selected</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {Array.from({ length: Math.min(studentCount, 4) }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                        style={{ background: ["#6C3BFF","#10B981","#F59E0B","#3B82F6"][i % 4] }}>
                        {["AS","MF","HA","ZK"][i]}
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{["Ahmad Ali","Maryam Fatima","Hassan Ali","Zainab Khan"][i]}</span>
                      <span className="ml-auto text-[10px] text-gray-400">Roll {i + 1}</span>
                    </div>
                  ))}
                  {studentCount > 4 && (
                    <div className="px-4 py-2 text-xs text-purple-600 font-semibold">+{studentCount - 4} more students…</div>
                  )}
                </div>
              </div>

              {/* Workflow */}
              <WorkflowBand steps={["Teacher selects audience","System fetches students","Student list attached"]} />
            </div>
          )}

          {/* ═══ STEP 3: RESOURCES ═══ */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              <StepHeader icon={Upload} title="Resources & Instructions" sub="Attach files, links, and write detailed instructions for students." />

              {/* Upload area */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 mb-2 block">Upload Resources</Label>
                <input ref={fileRef} type="file" multiple className="hidden"
                  onChange={e => set("resources", Array.from(e.target.files || []))} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-violet-200 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-violet-400 hover:bg-violet-50/30 transition-all group">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center transition-colors">
                    <Upload className="w-6 h-6 text-purple-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Drop files here or click to browse</p>
                  <div className="flex gap-1.5 flex-wrap justify-center">
                    {["PDF","Word","PowerPoint","Images","Videos"].map(t => (
                      <span key={t} className="text-[10px] font-semibold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-md">{t}</span>
                    ))}
                  </div>
                </button>
                {form.resources.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {form.resources.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg">
                        <Paperclip className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <span className="text-xs font-medium text-gray-700 flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => set("resources", form.resources.filter((_, j) => j !== i))}>
                          <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* External links */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 mb-2 block">External Links</Label>
                <div className="space-y-2">
                  {form.links.map((lnk, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        {lnk.includes("youtube") ? <Youtube className="w-4 h-4 text-red-500" /> :
                          lnk.includes("drive") ? <FolderOpen className="w-4 h-4 text-yellow-500" /> :
                          <Link2 className="w-4 h-4 text-blue-500" />}
                      </div>
                      <Input value={lnk} placeholder="https://drive.google.com/... or YouTube URL"
                        onChange={e => { const l = [...form.links]; l[i] = e.target.value; set("links", l); }}
                        className="border-gray-200 h-8 text-xs focus:border-violet-400 flex-1" />
                      <button onClick={() => set("links", form.links.filter((_, j) => j !== i))}>
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => set("links", [...form.links, ""])}
                    className="text-xs font-semibold text-purple-600 hover:text-violet-800 flex items-center gap-1">
                    + Add another link
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-semibold text-gray-600">Instructions <span className="text-red-500">*</span></Label>
                  <div className="flex gap-1">
                    {[
                      { label: "✨ Generate Instructions", action: () => set("instructions", `Complete all questions in ${form.subject}. Show your working clearly.\n\n1. Read the chapter summary before starting.\n2. Answer all questions in full sentences.\n3. Include diagrams where necessary.\n4. Submit before the due date.`) },
                      { label: "📋 Generate Rubric", action: () => toast.info("AI rubric generation coming soon") },
                    ].map(({ label, action }) => (
                      <button key={label} onClick={action}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold hover:bg-violet-100 border border-violet-200 transition-all">
                        <Sparkles className="w-3 h-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Formatting toolbar */}
                <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 border border-gray-200 border-b-0 rounded-t-lg">
                  {["B","I","U"].map(f => (
                    <button key={f} className="w-6 h-6 rounded text-xs font-bold text-gray-600 hover:bg-white hover:shadow-sm transition-all">{f}</button>
                  ))}
                  <div className="w-px h-4 bg-gray-300 mx-1" />
                  {["• List","1. List","🔗 Link","📷 Image"].map(t => (
                    <button key={t} className="px-1.5 h-6 rounded text-[10px] font-semibold text-gray-600 hover:bg-white hover:shadow-sm transition-all">{t}</button>
                  ))}
                </div>
                <textarea value={form.instructions} onChange={e => set("instructions", e.target.value)}
                  placeholder="Write detailed instructions for students…"
                  rows={5}
                  className="w-full border border-gray-200 rounded-b-lg px-3 py-2.5 text-xs text-gray-700 focus:outline-none focus:border-violet-400 resize-none bg-white" />
              </div>

              <WorkflowBand steps={["Resources uploaded","Files stored in cloud","Links generated","Resources attached"]} />
            </div>
          )}

          {/* ═══ STEP 4: SETTINGS ═══ */}
          {step === 4 && (
            <div className="p-6 space-y-5">
              <StepHeader icon={Settings} title="Submission Settings" sub="Configure how students submit and how you evaluate." />

              {/* Submission type */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 mb-2 block">Submission Type</Label>
                <div className="grid grid-cols-5 gap-2">
                  {["File Upload","Text Answer","Multiple Files","Link Submission","Online Editor"].map(t => (
                    <button key={t} onClick={() => set("submissionType", t)}
                      className={cn("p-2.5 rounded-xl border-2 text-center transition-all",
                        form.submissionType === t ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white hover:border-violet-200"
                      )}>
                      <div className="text-lg mb-1">
                        {t === "File Upload" ? "📎" : t === "Text Answer" ? "✏️" : t === "Multiple Files" ? "📂" : t === "Link Submission" ? "🔗" : "💻"}
                      </div>
                      <p className={cn("text-[10px] font-semibold leading-tight", form.submissionType === t ? "text-violet-700" : "text-gray-600")}>{t}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 mb-2 block">Options</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Toggle label="Allow Late Submission" desc="Students can submit after the deadline" value={form.allowLate} onChange={v => set("allowLate", v)} icon={Clock} />
                  <Toggle label="Enable Resubmission" desc="Students can resubmit updated work" value={form.resubmit} onChange={v => set("resubmit", v)} icon={RefreshCw} />
                  <Toggle label="Plagiarism Check" desc="Auto-scan submissions for similarity" value={form.plagiarism} onChange={v => set("plagiarism", v)} icon={Shield} />
                  <Toggle label="Rubric Based Evaluation" desc="Grade using a structured rubric" value={form.rubric} onChange={v => set("rubric", v)} icon={ClipboardCheck} />
                  <Toggle label="Peer Review" desc="Students review each other's work" value={form.peerReview} onChange={v => set("peerReview", v)} icon={Users} />
                </div>
              </div>

              {/* Visibility */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 mb-2 block">Visibility</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => set("visibility", "now")}
                    className={cn("flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                      form.visibility === "now" ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white hover:border-violet-200"
                    )}>
                    <Zap className={cn("w-5 h-5", form.visibility === "now" ? "text-purple-600" : "text-gray-400")} />
                    <div>
                      <p className={cn("text-sm font-bold", form.visibility === "now" ? "text-violet-700" : "text-gray-700")}>Publish Immediately</p>
                      <p className="text-[11px] text-gray-400">Students notified right away</p>
                    </div>
                    {form.visibility === "now" && <CheckCircle2 className="w-4 h-4 text-purple-600 ml-auto" />}
                  </button>
                  <button onClick={() => set("visibility", "schedule")}
                    className={cn("flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                      form.visibility === "schedule" ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white hover:border-violet-200"
                    )}>
                    <Calendar className={cn("w-5 h-5", form.visibility === "schedule" ? "text-purple-600" : "text-gray-400")} />
                    <div>
                      <p className={cn("text-sm font-bold", form.visibility === "schedule" ? "text-violet-700" : "text-gray-700")}>Schedule Later</p>
                      <p className="text-[11px] text-gray-400">Choose when to publish</p>
                    </div>
                    {form.visibility === "schedule" && <CheckCircle2 className="w-4 h-4 text-purple-600 ml-auto" />}
                  </button>
                </div>
                {form.visibility === "schedule" && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-gray-600 mb-1 block">Publish Date</Label>
                      <Input type="date" value={form.scheduleDate} onChange={e => set("scheduleDate", e.target.value)}
                        className="border-gray-200 h-9 focus:border-violet-400" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-600 mb-1 block">Publish Time</Label>
                      <Select value={form.scheduleTime} onValueChange={v => set("scheduleTime", v)}>
                        <SelectTrigger className="h-9 border-gray-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["07:00 AM","08:00 AM","09:00 AM","10:00 AM","12:00 PM","02:00 PM","04:00 PM","06:00 PM"].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <WorkflowBand steps={["Submission rules saved","Evaluation rules configured","Assignment settings finalized"]} />
            </div>
          )}

          {/* ═══ STEP 5: REVIEW ═══ */}
          {step === 5 && (
            <div className="p-6 space-y-5">
              <StepHeader icon={Eye} title="Review & Preview" sub="Confirm everything looks correct before publishing." />

              <div className="grid grid-cols-5 gap-5">
                {/* Preview card */}
                <div className="col-span-3 space-y-3">
                  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-violet-200 uppercase tracking-wider">{TYPE_ICONS[form.type]} {form.type}</span>
                          <h3 className="text-white font-bold text-base mt-1 leading-tight">{form.title || "Untitled Assignment"}</h3>
                          <p className="text-violet-200 text-xs mt-1">{form.subject} · {form.grade} · Section {form.section}</p>
                        </div>
                        <span className="text-xs font-bold bg-white/20 text-white px-2.5 py-1 rounded-full border border-white/30">Draft</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { icon: Calendar, label: "Due Date", value: form.dueDate || "Not set" },
                          { icon: Award, label: "Max Marks", value: `${form.marks} marks` },
                          { icon: Clock, label: "Duration", value: form.duration },
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className="text-center p-2.5 bg-gray-50 rounded-xl">
                            <Icon className="w-4 h-4 text-violet-500 mx-auto mb-1" />
                            <p className="text-[10px] text-gray-400 font-semibold">{label}</p>
                            <p className="text-xs font-bold text-gray-700 mt-0.5">{value}</p>
                          </div>
                        ))}
                      </div>
                      {form.instructions && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Instructions</p>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{form.instructions}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-600">{studentCount} Students</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-600">{form.resources.length} Files</span>
                        </div>
                        {form.allowLate && (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">Late OK</span>
                        )}
                        {form.plagiarism && (
                          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">Plagiarism Check</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Validation panel */}
                <div className="col-span-2 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Validation Checks</p>
                  {[
                    { label: "Assignment title",     ok: !!form.title.trim()       },
                    { label: "Due date set",          ok: !!form.dueDate            },
                    { label: "Students selected",     ok: studentCount > 0          },
                    { label: "Instructions written",  ok: !!form.instructions.trim()},
                    { label: "Subject assigned",      ok: !!form.subject            },
                    { label: "Marks defined",         ok: Number(form.marks) > 0    },
                  ].map(({ label, ok }) => (
                    <div key={label} className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border",
                      ok ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
                    )}>
                      {ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      }
                      <span className={cn("text-xs font-semibold", ok ? "text-emerald-700" : "text-red-600")}>{label}</span>
                    </div>
                  ))}

                  <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100">
                    <p className="text-xs font-bold text-violet-700 mb-1">Ready to publish?</p>
                    <p className="text-[11px] text-violet-500">
                      {!!form.title.trim() && !!form.dueDate && !!form.instructions.trim()
                        ? "✅ All required fields are complete."
                        : "⚠️ Complete missing fields before publishing."}
                    </p>
                  </div>
                </div>
              </div>

              <WorkflowBand steps={["System validates","Checks attachments","Checks recipients","Ready for publishing"]} />
            </div>
          )}

          {/* ═══ STEP 6: PUBLISH ═══ */}
          {step === 6 && !published && (
            <div className="p-6 space-y-5">
              <StepHeader icon={Send} title="Publish Assignment" sub="Choose how to release this assignment to students." />

              {/* Summary */}
              <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 p-5 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-violet-200 text-xs font-semibold">{TYPE_ICONS[form.type]} {form.type}</p>
                    <h3 className="text-xl font-bold mt-1">{form.title || "Untitled"}</h3>
                    <p className="text-violet-200 text-sm mt-0.5">{form.subject} · {form.grade} · Section {form.section}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black">{studentCount}</p>
                    <p className="text-violet-200 text-xs font-semibold">Students</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/20">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-violet-200" />
                    <span className="text-xs font-semibold text-violet-100">Due: {form.dueDate || "Not set"} {form.dueTime}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-violet-200" />
                    <span className="text-xs font-semibold text-violet-100">{form.marks} Marks</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-violet-200" />
                    <span className="text-xs font-semibold text-violet-100">{form.resources.length} Files</span>
                  </div>
                </div>
              </div>

              {/* Notification preview */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">After Publishing — Automated Actions</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Bell, label: "In-App Notification", sub: `${studentCount} students alerted`, color: "text-purple-600 bg-violet-50" },
                    { icon: Mail, label: "Email Notification",  sub: "Sent to student & parent", color: "text-purple-600 bg-blue-50" },
                    { icon: Smartphone, label: "Push Notification", sub: "Mobile app alert", color: "text-emerald-600 bg-emerald-50" },
                  ].map(({ icon: Icon, label, sub, color }) => (
                    <div key={label} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", color.split(" ")[1])}>
                        <Icon className={cn("w-3.5 h-3.5", color.split(" ")[0])} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700">{label}</p>
                        <p className="text-[10px] text-gray-400">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => handlePublish("Draft")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 transition-all group">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                    <BookMarked className="w-5 h-5 text-gray-500" />
                  </div>
                  <p className="text-sm font-bold text-gray-700">Save Draft</p>
                  <p className="text-[10px] text-gray-400 text-center">Save progress,<br/>publish later</p>
                </button>
                <button onClick={() => handlePublish("Scheduled")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-sm font-bold text-amber-700">Schedule</p>
                  <p className="text-[10px] text-amber-600 text-center">Auto-publish at<br/>chosen date & time</p>
                </button>
                <button onClick={() => handlePublish("Published")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-violet-500 bg-gradient-to-br from-purple-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 transition-all shadow-lg shadow-violet-200">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-white">Publish Now</p>
                  <p className="text-[10px] text-violet-200 text-center">Notify {studentCount} students<br/>immediately</p>
                </button>
              </div>
            </div>
          )}

          {/* ═══ PUBLISHED SUCCESS ═══ */}
          {step === 6 && published && (
            <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center space-y-5">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce-slow">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  {publishStatus === "Draft" ? "Saved as Draft!" : publishStatus === "Scheduled" ? "Assignment Scheduled!" : "Assignment Published!"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {publishStatus === "Published"
                    ? `${studentCount} students have been notified`
                    : publishStatus === "Scheduled"
                    ? `Will be published on ${form.scheduleDate || "scheduled date"} at ${form.scheduleTime}`
                    : "Your draft has been saved. You can publish it anytime."}
                </p>
              </div>

              {publishStatus === "Published" && (
                <div className="w-full max-w-sm space-y-2">
                  {[
                    { icon: CheckCircle2, label: "Assignment Created",          color: "text-emerald-600" },
                    { icon: Globe,        label: "Student Dashboard Updated",   color: "text-purple-600"    },
                    { icon: Bell,         label: "In-App Notifications Sent",   color: "text-purple-600"  },
                    { icon: Mail,         label: "Emails Dispatched",           color: "text-purple-600"  },
                    { icon: BarChart3,    label: "Analytics Updated",           color: "text-teal-600"    },
                  ].map(({ icon: Icon, label, color }, i) => (
                    <div key={label} className="flex items-center gap-2.5 px-3 py-2 bg-white border border-gray-100 rounded-xl" style={{ animationDelay: `${i * 100}ms` }}>
                      <Icon className={cn("w-4 h-4 shrink-0", color)} />
                      <span className="text-xs font-semibold text-gray-700">{label}</span>
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="border-gray-200">Close</Button>
                <Button onClick={() => { reset(); }} className="bg-purple-600 hover:bg-violet-700 text-white">
                  Create Another
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer navigation ── */}
        {!(step === 6 && published) && (
          <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prev} disabled={step === 1}
                className="border-gray-200 gap-1.5">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <span className="text-xs text-gray-400 font-semibold">Step {step} of 6</span>
            </div>
            <div className="flex items-center gap-2">
              {step < 6 && (
                <Button size="sm" onClick={next} className="bg-purple-600 hover:bg-violet-700 text-white gap-1.5 shadow-md shadow-violet-200">
                  {step === 5 ? "Proceed to Publish" : "Next"} <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StepHeader({ icon: Icon, title, sub }: { icon: typeof BookOpen; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 pb-1">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-md shadow-violet-200 shrink-0">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function WorkflowBand({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-3.5">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Internal Workflow</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {steps.map((s, i, arr) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-600 font-medium bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">{s}</span>
            {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
