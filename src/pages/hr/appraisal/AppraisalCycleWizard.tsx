import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { resolveSelectedStaff, CreationProgress } from "./createAppraisalCycle";

const STEPS = [
  { id: 1, label: "Basic Info", key: "basicInfo", icon: ClipboardCheck },
  { id: 2, label: "Employees", key: "employees", icon: Users },
  { id: 3, label: "KPIs", key: "kpis", icon: Target },
  { id: 4, label: "Workflow", key: "workflow", icon: GitBranch },
  { id: 5, label: "Rating", key: "rating", icon: Star },
  { id: 6, label: "Deadlines", key: "deadlines", icon: CalendarClock },
  { id: 7, label: "AI", key: "ai", icon: Sparkles },
  { id: 8, label: "Notify", key: "notify", icon: Bell },
  { id: 9, label: "Review", key: "review", icon: Check },
];

const STEP_LABEL_KEYS: Record<string, string> = {
  basicInfo: "admin.hr.appraisal.cycleWizard.stepBasicInfo",
  employees: "admin.hr.appraisal.cycleWizard.stepEmployees",
  kpis: "admin.hr.appraisal.cycleWizard.stepKpis",
  workflow: "admin.hr.appraisal.cycleWizard.stepWorkflow",
  rating: "admin.hr.appraisal.cycleWizard.stepRating",
  deadlines: "admin.hr.appraisal.cycleWizard.stepDeadlines",
  ai: "admin.hr.appraisal.cycleWizard.stepAi",
  notify: "admin.hr.appraisal.cycleWizard.stepNotify",
  review: "admin.hr.appraisal.cycleWizard.stepReview",
};

const RATING_5PT = ["Poor", "Needs Improvement", "Good", "Very Good", "Outstanding"];
const RATING_LETTER = ["A", "B", "C", "D"];

const RATING_5PT_LABEL_KEYS: Record<string, string> = {
  "Poor": "admin.hr.appraisal.cycleWizard.ratingPoor",
  "Needs Improvement": "admin.hr.appraisal.cycleWizard.ratingNeedsImprovement",
  "Good": "admin.hr.appraisal.cycleWizard.ratingGood",
  "Very Good": "admin.hr.appraisal.cycleWizard.ratingVeryGood",
  "Outstanding": "admin.hr.appraisal.cycleWizard.ratingOutstanding",
};

const CYCLE_TYPE_LABEL_KEYS: Record<string, string> = {
  Annual: "admin.hr.appraisal.cycleWizard.cycleTypeAnnual",
  Semester: "admin.hr.appraisal.cycleWizard.cycleTypeSemester",
  Quarterly: "admin.hr.appraisal.cycleWizard.cycleTypeQuarterly",
  Custom: "admin.hr.appraisal.cycleWizard.cycleTypeCustom",
};

const WORKFLOW_ROLE_LABEL_KEYS: Record<string, string> = {
  Teacher: "admin.hr.appraisal.cycleWizard.roleTeacher",
  HOD: "admin.hr.appraisal.cycleWizard.roleHod",
  Principal: "admin.hr.appraisal.cycleWizard.rolePrincipal",
  HR: "admin.hr.appraisal.cycleWizard.roleHr",
};

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
  progress?: CreationProgress | null;
  onSubmit: (config: AppraisalCycleConfig) => void;
  onSaveDraft: (config: AppraisalCycleConfig) => void;
}

const PROGRESS_PHASE_LABEL_KEYS: Record<CreationProgress["phase"], string> = {
  scorecards: "admin.hr.appraisal.cycleWizard.progressScorecards",
  notifications: "admin.hr.appraisal.cycleWizard.progressNotifications",
  emails: "admin.hr.appraisal.cycleWizard.progressEmails",
};

export function AppraisalCycleWizard({
  open, onOpenChange, staff, branches, academicYear, kpiTemplates, onSaveTemplate, submitting, progress, onSubmit, onSaveDraft,
}: Props) {
  const { t } = useTranslation();
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
      if (!Array.isArray(parsed)) throw new Error(t('admin.hr.appraisal.cycleWizard.errorExpectedJsonArray'));
      const kpis = parsed
        .map((p: any) => ({ title: String(p.title || "").trim(), weight: Number(p.weight) || 0 }))
        .filter((k) => k.title);
      if (kpis.length === 0) throw new Error(t('admin.hr.appraisal.cycleWizard.errorNoValidKpiRows'));
      set("kpis", kpis);
      setShowImport(false);
      setImportText("");
    } catch (e) {
      alert(t('admin.hr.appraisal.cycleWizard.importErrorAlert', { message: (e as Error).message }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) handleClose(); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-bold">{t('admin.hr.appraisal.cycleWizard.dialogTitle')}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('admin.hr.appraisal.cycleWizard.stepOfLabel', { step, total: 9, label: t(STEP_LABEL_KEYS[STEPS[step - 1].key]) })}</p>
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
                <span className={cn("text-[9px] text-center leading-tight hidden sm:block", s.id === step ? "text-purple-700 font-semibold" : "text-slate-400")}>{t(STEP_LABEL_KEYS[s.key])}</span>
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
                    <Label>{t('admin.hr.appraisal.cycleWizard.cycleNameLabel')}</Label>
                    <Input value={config.name} onChange={(e) => set("name", e.target.value)} placeholder={t('admin.hr.appraisal.cycleWizard.cycleNamePlaceholder')} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.academicYearLabel')}</Label>
                      <Input value={config.academicYear} onChange={(e) => set("academicYear", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.cycleTypeLabel')}</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {(["Annual", "Semester", "Quarterly", "Custom"] as CycleType[]).map((ct) => (
                          <button key={ct} type="button" onClick={() => set("cycleType", ct)}
                            className={cn("text-xs font-semibold rounded-lg border px-3 py-2 transition",
                              config.cycleType === ct ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                            {t(CYCLE_TYPE_LABEL_KEYS[ct])}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.startDateLabel')}</Label>
                      <Input type="date" value={config.startDate} onChange={(e) => set("startDate", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.endDateLabel')}</Label>
                      <Input type="date" value={config.endDate} onChange={(e) => set("endDate", e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>{t('admin.hr.appraisal.cycleWizard.descriptionLabel')}</Label>
                    <Textarea value={config.description} onChange={(e) => set("description", e.target.value)} rows={3} className="mt-1" placeholder={t('admin.hr.appraisal.cycleWizard.descriptionPlaceholder')} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-700">{t('admin.hr.appraisal.cycleWizard.whoEvaluatedLabel')}</p>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-200 bg-purple-50 cursor-pointer">
                    <Checkbox checked={config.scope === "all"} onCheckedChange={(v) => set("scope", v ? "all" : "filtered")} />
                    <span className="text-sm font-semibold text-purple-800">{t('admin.hr.appraisal.cycleWizard.allStaffActive', { count: staff.filter(s => s.status !== "Inactive").length })}</span>
                  </label>

                  {config.scope === "filtered" && (
                    <div className="space-y-4 ps-1">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t('admin.hr.appraisal.cycleWizard.categoryLabel')}</p>
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
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t('admin.hr.appraisal.cycleWizard.campusLabel')}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(branches.length ? branches : [{ id: "main", name: t('admin.hr.appraisal.cycleWizard.mainCampusFallback') }]).map((b) => (
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
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t('admin.hr.appraisal.cycleWizard.departmentLabel')}</p>
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
                    <span className="text-sm font-medium">{t('admin.hr.appraisal.cycleWizard.totalSelectedLabel')}</span>
                    <span className="text-lg font-extrabold">{t('admin.hr.appraisal.cycleWizard.employeesCount', { count: selectedStaff.length })}</span>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">{t('admin.hr.appraisal.cycleWizard.chooseHowStaffEvaluated')}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => set("kpis", DEFAULT_KPI_TEMPLATE.map(k => ({ ...k })))}>{t('admin.hr.appraisal.cycleWizard.loadTemplateButton')}</Button>
                      <Button size="sm" variant="outline" onClick={() => { const n = prompt(t('admin.hr.appraisal.cycleWizard.templateNamePrompt')); if (n) { onSaveTemplate(n, config.kpis); } }}>{t('admin.hr.appraisal.cycleWizard.saveTemplateButton')}</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}>{t('admin.hr.appraisal.cycleWizard.importKpiButton')}</Button>
                    </div>
                  </div>

                  {showImport && (
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50">
                      <p className="text-xs text-slate-500">{t('admin.hr.appraisal.cycleWizard.pasteJsonArrayLabel')} <code>{`[{"title":"Teaching Quality","weight":30}]`}</code></p>
                      <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} className="text-xs font-mono" />
                      <Button size="sm" onClick={handleImportKpis}>{t('admin.hr.appraisal.cycleWizard.applyImportButton')}</Button>
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
                        <span className="w-12 text-end text-sm font-bold text-slate-700">{k.weight}%</span>
                        <button onClick={() => set("kpis", config.kpis.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => set("kpis", [...config.kpis, { title: t('admin.hr.appraisal.cycleWizard.newKpiDefaultTitle'), weight: 0 }])}
                    className="text-xs font-semibold text-purple-600 hover:underline flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> {t('admin.hr.appraisal.cycleWizard.addKpiCategoryButton')}
                  </button>

                  <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 font-bold",
                    kpiTotal === 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                    <span>{t('admin.hr.appraisal.cycleWizard.totalLabel')}</span>
                    <div className="flex items-center gap-3">
                      <span>{kpiTotal}%</span>
                      {kpiTotal !== 100 && <Button size="sm" variant="outline" onClick={normalizeWeights}>{t('admin.hr.appraisal.cycleWizard.normalizeTo100Button')}</Button>}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-3">{t('admin.hr.appraisal.cycleWizard.whoReviewsWhom')}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {config.workflow.chain.map((role, i) => (
                        <div key={role} className="flex items-center gap-2">
                          <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">{t(WORKFLOW_ROLE_LABEL_KEYS[role] || role)}</span>
                          {i < config.workflow.chain.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 rtl:rotate-180" />}
                        </div>
                      ))}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 rtl:rotate-180" />
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">{t('admin.hr.appraisal.cycleWizard.completedLabel')}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {([
                      ["selfReview", t('admin.hr.appraisal.cycleWizard.enableSelfReview')],
                      ["peerReview", t('admin.hr.appraisal.cycleWizard.enablePeerReview')],
                      ["review360", t('admin.hr.appraisal.cycleWizard.enable360')],
                      ["parentFeedback", t('admin.hr.appraisal.cycleWizard.enableParentFeedback')],
                      ["studentFeedback", t('admin.hr.appraisal.cycleWizard.enableStudentFeedback')],
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
                      ["5-point", t('admin.hr.appraisal.cycleWizard.scale5Point')],
                      ["10-point", t('admin.hr.appraisal.cycleWizard.scale10Point')],
                      ["letter", t('admin.hr.appraisal.cycleWizard.scaleLetterGrade')],
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
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{t(RATING_5PT_LABEL_KEYS[l] || l)}</p>
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
                    <p className="text-xs text-slate-500">{t('admin.hr.appraisal.cycleWizard.tenPointScaleDescription')}</p>
                  )}
                </div>
              )}

              {step === 6 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.selfReviewDueLabel')}</Label>
                      <Input type="date" value={config.deadlines.selfReview} onChange={(e) => set("deadlines", { ...config.deadlines, selfReview: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.managerReviewDueLabel')}</Label>
                      <Input type="date" value={config.deadlines.managerReview} onChange={(e) => set("deadlines", { ...config.deadlines, managerReview: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.principalApprovalDueLabel')}</Label>
                      <Input type="date" value={config.deadlines.principalApproval} onChange={(e) => set("deadlines", { ...config.deadlines, principalApproval: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>{t('admin.hr.appraisal.cycleWizard.hrFinalizeDueLabel')}</Label>
                      <Input type="date" value={config.deadlines.hrFinalize} onChange={(e) => set("deadlines", { ...config.deadlines, hrFinalize: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t('admin.hr.appraisal.cycleWizard.automaticRemindersLabel')}</p>
                    <div className="flex flex-wrap gap-3">
                      {([["d7", t('admin.hr.appraisal.cycleWizard.reminder7DaysBefore')], ["d3", t('admin.hr.appraisal.cycleWizard.reminder3DaysBefore')], ["d1", t('admin.hr.appraisal.cycleWizard.reminder1DayBefore')], ["dueDate", t('admin.hr.appraisal.cycleWizard.reminderOnDueDate')]] as const).map(([key, label]) => (
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
                    {t('admin.hr.appraisal.cycleWizard.aiFeatureIntro')}
                  </div>
                  {([
                    ["insights", t('admin.hr.appraisal.cycleWizard.aiInsightsLabel'), t('admin.hr.appraisal.cycleWizard.aiInsightsDesc')],
                    ["summary", t('admin.hr.appraisal.cycleWizard.aiSummaryLabel'), t('admin.hr.appraisal.cycleWizard.aiSummaryDesc')],
                    ["kpiSuggestions", t('admin.hr.appraisal.cycleWizard.aiKpiSuggestionsLabel'), t('admin.hr.appraisal.cycleWizard.aiKpiSuggestionsDesc')],
                    ["biasDetection", t('admin.hr.appraisal.cycleWizard.biasDetectionLabel'), t('admin.hr.appraisal.cycleWizard.biasDetectionDesc')],
                    ["performancePrediction", t('admin.hr.appraisal.cycleWizard.performancePredictionLabel'), t('admin.hr.appraisal.cycleWizard.performancePredictionDesc')],
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
                  <p className="text-sm font-semibold text-slate-700 mb-1">{t('admin.hr.appraisal.cycleWizard.notifyEnrolledStaffVia')}</p>
                  {([
                    ["inApp", t('admin.hr.appraisal.cycleWizard.notifyInApp'), true],
                    ["email", t('admin.hr.appraisal.cycleWizard.notifyEmail'), true],
                    ["push", t('admin.hr.appraisal.cycleWizard.notifyPush'), true],
                    ["whatsapp", t('admin.hr.appraisal.cycleWizard.notifyWhatsapp'), false],
                    ["sms", t('admin.hr.appraisal.cycleWizard.notifySms'), false],
                  ] as const).map(([key, label, wired]) => (
                    <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        {!wired && <span className="ms-2 text-[10px] text-amber-600 font-semibold uppercase">{t('admin.hr.appraisal.cycleWizard.requiresSetupBadge')}</span>}
                      </div>
                      <Switch checked={config.notifications[key]} onCheckedChange={(v) => set("notifications", { ...config.notifications, [key]: v })} />
                    </label>
                  ))}
                  <p className="text-xs text-slate-400 pt-1">{t('admin.hr.appraisal.cycleWizard.whatsappSmsSetupNote')}</p>
                </div>
              )}

              {step === 9 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-700">{t('admin.hr.appraisal.cycleWizard.reviewAndCreateHeading')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      [t('admin.hr.appraisal.cycleWizard.summaryCycle'), config.name || "—"],
                      [t('admin.hr.appraisal.cycleWizard.summaryAcademicYear'), config.academicYear],
                      [t('admin.hr.appraisal.cycleWizard.summaryEmployees'), `${selectedStaff.length}`],
                      [t('admin.hr.appraisal.cycleWizard.summaryKpis'), `${config.kpis.length}`],
                      [t('admin.hr.appraisal.cycleWizard.summaryDeadlineHrFinalize'), config.deadlines.hrFinalize || "—"],
                      [t('admin.hr.appraisal.cycleWizard.summaryAi'), Object.values(config.ai).some(Boolean) ? t('admin.hr.appraisal.cycleWizard.enabledValue') : t('admin.hr.appraisal.cycleWizard.disabledValue')],
                      [t('admin.hr.appraisal.cycleWizard.summaryNotifications'), Object.entries(config.notifications).filter(([, v]) => v).map(([k]) => k).join(", ") || t('admin.hr.appraisal.cycleWizard.noneValue')],
                      [t('admin.hr.appraisal.cycleWizard.summaryRatingScale'), config.ratingScale.type],
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

        {submitting && (
          <div className="px-6 py-3 border-t bg-purple-50 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-800">
                {progress ? t(PROGRESS_PHASE_LABEL_KEYS[progress.phase]) : t('admin.hr.appraisal.cycleWizard.startingLabel')}
                {progress ? t('admin.hr.appraisal.cycleWizard.progressDoneOfTotal', { done: progress.done, total: progress.total }) : ""}
              </span>
              <span className="text-purple-500 font-medium">{t('admin.hr.appraisal.cycleWizard.dontCloseWindowLabel')}</span>
            </div>
            <Progress value={progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 5} className="h-1.5" />
            <p className="text-[10px] text-purple-400">
              {t('admin.hr.appraisal.cycleWizard.rateLimitedNote')}
            </p>
          </div>
        )}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-slate-50 rounded-b-lg">
          <Button variant="outline" onClick={step === 1 ? handleClose : back} disabled={submitting}>
            {step === 1 ? t('admin.hr.appraisal.cycleWizard.cancelButton') : <><ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" /> {t('admin.hr.appraisal.cycleWizard.backButton')}</>}
          </Button>
          <div className="flex gap-2">
            {step === 9 && (
              <Button variant="outline" onClick={() => onSaveDraft(config)} disabled={submitting}>{t('admin.hr.appraisal.cycleWizard.saveDraftButton')}</Button>
            )}
            {step < 9 ? (
              <Button onClick={next} disabled={!canProceed} className="gap-1">{t('admin.hr.appraisal.cycleWizard.nextButton')} <ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
            ) : (
              <Button onClick={() => onSubmit(config)} disabled={submitting} className="gap-1 bg-purple-600 hover:bg-purple-700">
                {submitting ? t('admin.hr.appraisal.cycleWizard.creatingLabel') : t('admin.hr.appraisal.cycleWizard.createCycleButton')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
