import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  ChevronRight, ChevronLeft, Users, Target, GitBranch, Star,
  CalendarClock, Sparkles, Bell, ClipboardCheck, Check, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Staff } from "@/types";
import {
  AppraisalCycleConfig, CycleType, RatingScaleType,
  STAFF_CATEGORIES, StaffCategory, DEFAULT_KPI_TEMPLATE,
  staffCategoriesFor,
} from "./appraisalCycleTypes";
import { resolveSelectedStaff } from "./createAppraisalCycle";

const STEPS = [
  { id: 1, label: "Basic Info", icon: ClipboardCheck },
  { id: 2, label: "Employees", icon: Users },
  { id: 3, label: "KPIs", icon: Target },
  { id: 4, label: "Workflow", icon: GitBranch },
  { id: 5, label: "Rating", icon: Star },
  { id: 6, label: "Deadlines", icon: CalendarClock },
  { id: 7, label: "AI", icon: Sparkles },
  { id: 8, label: "Notify", icon: Bell },
  { id: 9, label: "Review", icon: Check },
];

const RATING_5PT = ["Poor", "Needs Improvement", "Good", "Very Good", "Outstanding"];
const RATING_LETTER = ["A", "B", "C", "D"];

function defaultConfig(academicYear: string): AppraisalCycleConfig {
  return {
    name: "",
    academicYear,
    cycleType: "Annual",
    startDate: "",
    endDate: "",
    description: "",
    scope: "all",
    categories: [...STAFF_CATEGORIES],
    campuses: [],
    departments: [],
    kpis: DEFAULT_KPI_TEMPLATE.map((k) => ({ ...k })),
    workflow: {
      chain: ["Teacher", "HOD", "Principal", "HR"],
      selfReview: true,
      peerReview: false,
      review360: false,
      parentFeedback: false,
      studentFeedback: false,
    },
    ratingScale: { type: "5-point", labels: RATING_5PT },
    deadlines: {
      selfReview: "", managerReview: "", principalApproval: "", hrFinalize: "",
      reminders: { d7: true, d3: true, d1: true, dueDate: true },
    },
    ai: { insights: true, summary: true, kpiSuggestions: true, biasDetection: false, performancePrediction: false },
    notifications: { email: true, whatsapp: false, push: true, sms: false, inApp: true },
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff[];
  branches: { id: string; name: string }[];
  academicYear: string;
  kpiTemplates: Record<string, { title: string; weight: number }[]>;
  onSaveTemplate: (name: string, kpis: { title: string; weight: number }[]) => void;
  submitting: boolean;
  onSubmit: (config: AppraisalCycleConfig) => void;
  onSaveDraft: (config: AppraisalCycleConfig) => void;
}

export function AppraisalCycleWizard({
  open, onOpenChange, staff, branches, academicYear, kpiTemplates, onSaveTemplate, submitting, onSubmit, onSaveDraft,
}: Props) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<AppraisalCycleConfig>(() => defaultConfig(academicYear));
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const set = <K extends keyof AppraisalCycleConfig>(key: K, value: AppraisalCycleConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => s.department).filter(Boolean))).sort(),
    [staff]
  );

  const selectedStaff = useMemo(() => resolveSelectedStaff(config, staff), [config, staff]);

  const kpiTotal = config.kpis.reduce((sum, k) => sum + (Number(k.weight) || 0), 0);

  const canProceed = (() => {
    switch (step) {
      case 1: return !!(config.name.trim() && config.academicYear && config.cycleType && config.startDate && config.endDate);
      case 2: return selectedStaff.length > 0;
      case 3: return config.kpis.length > 0 && kpiTotal === 100;
      default: return true;
    }
  })();

  function reset() {
    setStep(1);
    setConfig(defaultConfig(academicYear));
    setShowImport(false);
    setImportText("");
  }

  function handleClose() {
    onOpenChange(false);
    reset();
  }

  function next() { if (canProceed) setStep((s) => Math.min(9, s + 1)); }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  function normalizeWeights() {
    const total = kpiTotal || 1;
    setConfig((c) => ({
      ...c,
      kpis: c.kpis.map((k) => ({ ...k, weight: Math.round((k.weight / total) * 100) })),
    }));
  }

  function handleImportKpis() {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const kpis = parsed
        .map((p: any) => ({ title: String(p.title || "").trim(), weight: Number(p.weight) || 0 }))
        .filter((k) => k.title);
      if (kpis.length === 0) throw new Error("No valid KPI rows found");
      set("kpis", kpis);
      setShowImport(false);
      setImportText("");
    } catch (e) {
      alert(`Couldn't import KPIs: ${(e as Error).message}. Expected format: [{"title":"Teaching Quality","weight":30}, ...]`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-bold">Create Appraisal Cycle</DialogTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 9 — {STEPS[step - 1].label}</p>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-6 pt-4">
          <Progress value={(step / 9) * 100} className="h-1.5" />
          <div className="flex justify-between mt-2">
            {STEPS.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-1" style={{ width: `${100 / 9}%` }}>
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
                  s.id === step ? "bg-purple-600 text-white" : s.id < step ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                )}>
                  {s.id < step ? <Check className="h-3 w-3" /> : s.id}
                </div>
                <span className={cn("text-[9px] text-center leading-tight hidden sm:block", s.id === step ? "text-purple-700 font-semibold" : "text-slate-400")}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-6 min-h-[380px]">
            {/* Deliberately not AnimatePresence mode="wait" here — with a
                single always-mounted <motion.div key={step}> wrapping every
                step's JSX, mode="wait" occasionally never resolved the
                outgoing step's exit animation (a real, reproduced bug: the
                header's step counter advanced correctly but the body stayed
                stuck on the previous step's content indefinitely). A plain
                keyed motion.div with only enter animation swaps content
                immediately and still gets a subtle fade/slide-in per step. */}
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label>Cycle Name *</Label>
                    <Input value={config.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 2026 Annual Performance Review" className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Academic Year *</Label>
                      <Input value={config.academicYear} onChange={(e) => set("academicYear", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>Cycle Type *</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {(["Annual", "Semester", "Quarterly", "Custom"] as CycleType[]).map((t) => (
                          <button key={t} type="button" onClick={() => set("cycleType", t)}
                            className={cn("text-xs font-semibold rounded-lg border px-3 py-2 transition",
                              config.cycleType === t ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date *</Label>
                      <Input type="date" value={config.startDate} onChange={(e) => set("startDate", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>End Date *</Label>
                      <Input type="date" value={config.endDate} onChange={(e) => set("endDate", e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={config.description} onChange={(e) => set("description", e.target.value)} rows={3} className="mt-1" placeholder="Optional notes about this cycle's purpose or scope…" />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-700">Who should be evaluated?</p>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-200 bg-purple-50 cursor-pointer">
                    <Checkbox checked={config.scope === "all"} onCheckedChange={(v) => set("scope", v ? "all" : "filtered")} />
                    <span className="text-sm font-semibold text-purple-800">All Staff ({staff.filter(s => s.status !== "Inactive").length} active)</span>
                  </label>

                  {config.scope === "filtered" && (
                    <div className="space-y-4 pl-1">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category</p>
                        <div className="grid grid-cols-2 gap-2">
                          {STAFF_CATEGORIES.map((cat) => {
                            const count = staff.filter((s) => s.status !== "Inactive" && staffCategoriesFor(s).includes(cat)).length;
                            return (
                              <label key={cat} className="flex items-center gap-2 text-sm">
                                <Checkbox checked={config.categories.includes(cat)} onCheckedChange={(v) =>
                                  set("categories", v ? [...config.categories, cat] : config.categories.filter((c) => c !== cat))} />
                                {cat} <span className="text-xs text-slate-400">({count})</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Campus</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(branches.length ? branches : [{ id: "main", name: "Main Campus" }]).map((b) => (
                            <label key={b.id} className="flex items-center gap-2 text-sm">
                              <Checkbox checked={config.campuses.length === 0 || config.campuses.includes(b.id)} onCheckedChange={(v) => {
                                const all = branches.length ? branches.map(x => x.id) : ["main"];
                                const current = config.campuses.length === 0 ? all : config.campuses;
                                set("campuses", v ? [...new Set([...current, b.id])] : current.filter((c) => c !== b.id));
                              }} />
                              {b.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Department</p>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {departments.map((d) => (
                            <label key={d} className="flex items-center gap-2 text-sm">
                              <Checkbox checked={config.departments.length === 0 || config.departments.includes(d)} onCheckedChange={(v) => {
                                const current = config.departments.length === 0 ? departments : config.departments;
                                set("departments", v ? [...new Set([...current, d])] : current.filter((c) => c !== d));
                              }} />
                              {d}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Total Selected</span>
                    <span className="text-lg font-extrabold">{selectedStaff.length} Employees</span>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Choose how staff will be evaluated.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => set("kpis", DEFAULT_KPI_TEMPLATE.map(k => ({ ...k })))}>Load Template</Button>
                      <Button size="sm" variant="outline" onClick={() => { const n = prompt("Template name?"); if (n) { onSaveTemplate(n, config.kpis); } }}>Save Template</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}>Import KPI</Button>
                    </div>
                  </div>

                  {showImport && (
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50">
                      <p className="text-xs text-slate-500">Paste a JSON array: <code>{`[{"title":"Teaching Quality","weight":30}]`}</code></p>
                      <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} className="text-xs font-mono" />
                      <Button size="sm" onClick={handleImportKpis}>Apply Import</Button>
                    </div>
                  )}

                  {Object.keys(kpiTemplates).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(kpiTemplates).map(([name, kpis]) => (
                        <button key={name} onClick={() => set("kpis", kpis.map(k => ({ ...k })))}
                          className="text-xs px-2.5 py-1 rounded-full border border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-600">
                          {name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-4">
                    {config.kpis.map((k, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Input value={k.title} onChange={(e) => {
                          const kpis = [...config.kpis]; kpis[i] = { ...k, title: e.target.value }; set("kpis", kpis);
                        }} className="w-44 flex-shrink-0 text-sm" />
                        <Slider value={[k.weight]} min={0} max={100} step={1} onValueChange={([v]) => {
                          const kpis = [...config.kpis]; kpis[i] = { ...k, weight: v }; set("kpis", kpis);
                        }} className="flex-1" />
                        <span className="w-12 text-right text-sm font-bold text-slate-700">{k.weight}%</span>
                        <button onClick={() => set("kpis", config.kpis.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => set("kpis", [...config.kpis, { title: "New KPI", weight: 0 }])}
                    className="text-xs font-semibold text-purple-600 hover:underline flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add KPI Category
                  </button>

                  <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 font-bold",
                    kpiTotal === 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                    <span>Total</span>
                    <div className="flex items-center gap-3">
                      <span>{kpiTotal}%</span>
                      {kpiTotal !== 100 && <Button size="sm" variant="outline" onClick={normalizeWeights}>Normalize to 100%</Button>}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-3">Who reviews whom?</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {config.workflow.chain.map((role, i) => (
                        <div key={role} className="flex items-center gap-2">
                          <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">{role}</span>
                          {i < config.workflow.chain.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                        </div>
                      ))}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">Completed</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {([
                      ["selfReview", "Enable Self Review"],
                      ["peerReview", "Enable Peer Review"],
                      ["review360", "Enable 360°"],
                      ["parentFeedback", "Enable Parent Feedback"],
                      ["studentFeedback", "Enable Student Feedback"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        <Switch checked={config.workflow[key]} onCheckedChange={(v) => set("workflow", { ...config.workflow, [key]: v })} />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      ["5-point", "1–5 Scale"],
                      ["10-point", "1–10 Scale"],
                      ["letter", "Letter Grade"],
                    ] as [RatingScaleType, string][]).map(([type, label]) => (
                      <button key={type} onClick={() => set("ratingScale", {
                        type,
                        labels: type === "5-point" ? RATING_5PT : type === "letter" ? RATING_LETTER : undefined,
                      })}
                        className={cn("rounded-xl border p-4 text-center transition",
                          config.ratingScale.type === type ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300")}>
                        <p className="font-bold text-sm text-slate-800">{label}</p>
                      </button>
                    ))}
                  </div>
                  {config.ratingScale.type === "5-point" && (
                    <div className="grid grid-cols-5 gap-2">
                      {RATING_5PT.map((l, i) => (
                        <div key={l} className="text-center p-2 rounded-lg bg-slate-50 border">
                          <p className="font-extrabold text-purple-600">{i + 1}</p>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{l}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {config.ratingScale.type === "letter" && (
                    <div className="grid grid-cols-4 gap-2">
                      {RATING_LETTER.map((l) => (
                        <div key={l} className="text-center p-3 rounded-lg bg-slate-50 border font-extrabold text-purple-600">{l}</div>
                      ))}
                    </div>
                  )}
                  {config.ratingScale.type === "10-point" && (
                    <p className="text-xs text-slate-500">Reviewers will score each KPI from 1 (lowest) to 10 (highest).</p>
                  )}
                </div>
              )}

              {step === 6 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Self Review Due</Label>
                      <Input type="date" value={config.deadlines.selfReview} onChange={(e) => set("deadlines", { ...config.deadlines, selfReview: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>Manager Review Due</Label>
                      <Input type="date" value={config.deadlines.managerReview} onChange={(e) => set("deadlines", { ...config.deadlines, managerReview: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>Principal Approval Due</Label>
                      <Input type="date" value={config.deadlines.principalApproval} onChange={(e) => set("deadlines", { ...config.deadlines, principalApproval: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>HR Finalize Due</Label>
                      <Input type="date" value={config.deadlines.hrFinalize} onChange={(e) => set("deadlines", { ...config.deadlines, hrFinalize: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Automatic Reminders</p>
                    <div className="flex flex-wrap gap-3">
                      {([["d7", "7 days before"], ["d3", "3 days before"], ["d1", "1 day before"], ["dueDate", "On due date"]] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={config.deadlines.reminders[key]} onCheckedChange={(v) =>
                            set("deadlines", { ...config.deadlines, reminders: { ...config.deadlines.reminders, [key]: !!v } })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-xs text-indigo-700">
                    Enterprise feature — these toggles configure which AI-assisted tools are available once reviewers start scoring. Turning one on doesn't fabricate results up front; it unlocks that assistance during the review itself.
                  </div>
                  {([
                    ["insights", "AI Insights", "Surfaces patterns across scorecards as they're submitted."],
                    ["summary", "AI Summary", "Drafts a first-pass written summary a reviewer can edit."],
                    ["kpiSuggestions", "AI KPI Suggestions", "Suggests KPI weight adjustments based on role/department."],
                    ["biasDetection", "Bias Detection", "Flags rating patterns that may indicate reviewer bias."],
                    ["performancePrediction", "Performance Prediction", "Projects likely trajectory from historical scores."],
                  ] as const).map(([key, label, desc]) => (
                    <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                      <Switch checked={config.ai[key]} onCheckedChange={(v) => set("ai", { ...config.ai, [key]: v })} />
                    </label>
                  ))}
                </div>
              )}

              {step === 8 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Notify enrolled staff via</p>
                  {([
                    ["inApp", "In-App Notification", true],
                    ["email", "Email", true],
                    ["push", "Push Notification", true],
                    ["whatsapp", "WhatsApp", false],
                    ["sms", "SMS", false],
                  ] as const).map(([key, label, wired]) => (
                    <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        {!wired && <span className="ml-2 text-[10px] text-amber-600 font-semibold uppercase">Requires setup</span>}
                      </div>
                      <Switch checked={config.notifications[key]} onCheckedChange={(v) => set("notifications", { ...config.notifications, [key]: v })} />
                    </label>
                  ))}
                  <p className="text-xs text-slate-400 pt-1">WhatsApp/SMS need real provider credentials configured under Settings → Integrations before they'll actually send — your preference is saved either way.</p>
                </div>
              )}

              {step === 9 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-700">Review &amp; Create</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Cycle", config.name || "—"],
                      ["Academic Year", config.academicYear],
                      ["Employees", `${selectedStaff.length}`],
                      ["KPIs", `${config.kpis.length}`],
                      ["Deadline (HR Finalize)", config.deadlines.hrFinalize || "—"],
                      ["AI", Object.values(config.ai).some(Boolean) ? "Enabled" : "Disabled"],
                      ["Notifications", Object.entries(config.notifications).filter(([, v]) => v).map(([k]) => k).join(", ") || "None"],
                      ["Rating Scale", config.ratingScale.type],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </motion.div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between bg-slate-50 rounded-b-lg">
          <Button variant="outline" onClick={step === 1 ? handleClose : back}>
            {step === 1 ? "Cancel" : <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {step === 9 && (
              <Button variant="outline" onClick={() => onSaveDraft(config)} disabled={submitting}>Save Draft</Button>
            )}
            {step < 9 ? (
              <Button onClick={next} disabled={!canProceed} className="gap-1">Next <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={() => onSubmit(config)} disabled={submitting} className="gap-1 bg-purple-600 hover:bg-purple-700">
                {submitting ? "Creating…" : "Create Cycle"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
