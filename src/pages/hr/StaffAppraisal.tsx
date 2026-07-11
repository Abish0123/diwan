import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, TrendingUp, Users, Award, ChevronDown, ChevronUp, ClipboardList, Plus, Download, GitBranch, Search, MessageSquare, Clock, CalendarClock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useHRSettings } from "@/contexts/HRSettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { Staff } from "@/types";
import { AppraisalCycleWizard } from "./appraisal/AppraisalCycleWizard";
import { CycleSuccessScreen } from "./appraisal/CycleSuccessScreen";
import { createAppraisalCycle, CreationResult, CreationProgress } from "./appraisal/createAppraisalCycle";
import { KpiCategoryConfig, AppraisalCycleConfig } from "./appraisal/appraisalCycleTypes";
import { AppraisalAnalyticsTab } from "./appraisal/AppraisalAnalyticsTab";
import { FeedbackTemplatesManager } from "./appraisal/FeedbackTemplatesManager";
import { FeedbackWeightingCard } from "./appraisal/FeedbackWeightingCard";
import { NotifyFeedbackButton } from "./appraisal/NotifyFeedbackButton";
import { FeedbackResultsTab } from "./appraisal/FeedbackResultsTab";
import { KpiFrameworkManager } from "./appraisal/KpiFrameworkManager";
import { SubmissionTrackingTab } from "./appraisal/SubmissionTrackingTab";

interface Scorecard {
  id: string;
  name: string;
  role: string;
  // Legacy fixed 4-category model (cycles created before the wizard existed).
  teaching?: number;
  punctuality?: number;
  feedback?: number;
  admin?: number;
  // Dynamic KPI model (cycles created via the wizard) — category title -> score.
  kpiScores?: Record<string, number>;
  kpiWeights?: Record<string, number>;
  overall: number;
  status: string;
  type?: string;
  uid?: string;
  createdAt?: string;
  cycleId?: string;
  reminderSentAt?: string;
  reviewers?: { hod?: string; principal?: string; hr?: string };
  department?: string;
  deadlines?: { selfReview?: string; managerReview?: string; principalApproval?: string; hrFinalize?: string };
}

interface Cycle {
  id: string;
  type?: string;
  title?: string;
  startedAt?: string;
  status?: string;
  employeeCount?: number;
  kpis?: KpiCategoryConfig[];
}

function scoreColor(score: number | undefined) {
  const s = Number(score) || 0;
  if (s >= 90) return "text-green-600 font-semibold";
  if (s >= 75) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

function statusBadge(status: string) {
  switch (status) {
    case "Excellent":
      return <Badge className="bg-green-100 text-green-700 border-green-200">{status}</Badge>;
    case "Good":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">{status}</Badge>;
    case "Satisfactory":
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{status}</Badge>;
    case "Needs Improvement":
      return <Badge className="bg-red-100 text-red-700 border-red-200">{status}</Badge>;
    case "Self Review Submitted":
      return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function StaffAppraisal() {
  const { user, role } = useAuth();
  const hrSettings = useHRSettings();
  const { branches } = useBranch();
  const [obsTeacher, setObsTeacher] = useState("");
  const [obsDate, setObsDate] = useState("");
  const [obsObserver, setObsObserver] = useState("");
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [editCard, setEditCard] = useState<Scorecard | null>(null);
  const [teachingStaff, setTeachingStaff] = useState<{ name: string; role: string; email?: string }[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [viewCycleOpen, setViewCycleOpen] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  // New multi-step wizard flow (replaces the old one-click "New Appraisal
  // Cycle" button that created a cycle immediately with no configuration).
  const [wizardOpen, setWizardOpen] = useState(false);
  const [submittingCycle, setSubmittingCycle] = useState(false);
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null);
  const [cycleProgress, setCycleProgress] = useState<CreationProgress | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [kpiTemplates, setKpiTemplates] = useState<Record<string, KpiCategoryConfig[]>>({});
  const [scorecardSearch, setScorecardSearch] = useState("");
  const [scorecardStatusFilter, setScorecardStatusFilter] = useState("all");
  const [scheduleObsOpen, setScheduleObsOpen] = useState(false);

  function statusForScore(score: number) {
    if (score >= 90) return "Excellent";
    if (score >= 83) return "Good";
    if (score >= 75) return "Satisfactory";
    return "Needs Improvement";
  }

  async function handleSaveScorecard() {
    if (!editCard) return;
    let overall: number;
    let patch: Partial<Scorecard>;
    if (editCard.kpiScores) {
      // Dynamic KPI model — weighted average using the framework snapshotted
      // onto this scorecard when its cycle was created, so a later change to
      // the cycle's own KPI list never silently reweights an in-progress card.
      const weights = editCard.kpiWeights || {};
      const totalWeight = Object.values(weights).reduce((s, w) => s + (Number(w) || 0), 0) || 1;
      overall = Math.round(
        Object.entries(editCard.kpiScores).reduce((sum, [k, v]) => sum + (Number(v) || 0) * (Number(weights[k]) || 0), 0) / totalWeight
      );
      patch = { kpiScores: editCard.kpiScores, overall, status: statusForScore(overall) };
    } else {
      const teaching = Number(editCard.teaching) || 0;
      const punctuality = Number(editCard.punctuality) || 0;
      const feedback = Number(editCard.feedback) || 0;
      const admin = Number(editCard.admin) || 0;
      overall = Math.round((teaching + punctuality + feedback + admin) / 4);
      patch = { teaching, punctuality, feedback, admin, overall, status: statusForScore(overall) };
    }
    const status = statusForScore(overall);
    const updated = { ...editCard, ...patch, overall, status };
    await smartDb.update("Appraisal", editCard.id, patch);
    setScorecards((prev) => prev.map((c) => (c.id === editCard.id ? updated : c)));
    setEditCard(null);
    toast.success(`Scorecard updated for ${editCard.name}`);
  }

  const teacherOptions = teachingStaff.map((s) => s.name);

  const loadAll = useCallback(async () => {
    if (!user) return;
    // School-wide, not scoped to this admin's own uid — appraisal records and
    // the staff roster are shared org data, same fix as HRDashboard.tsx.
    const [appraisalData, staffData, templates] = await Promise.all([
      smartDb.getAll("Appraisal", undefined) as Promise<Scorecard[]>,
      smartDb.getAll("Staff", undefined) as Promise<Staff[]>,
      smartDb.getAll("AppraisalKpiTemplate", undefined) as Promise<{ id: string; name: string; kpis: KpiCategoryConfig[] }[]>,
    ]);
    setScorecards(appraisalData.filter((d) => d.type !== "observation" && d.type !== "cycle"));
    setAllStaff(staffData);
    const teaching = staffData
      .filter((s) => (s.role === "Class Teacher" || s.role === "Subject Teacher") && s.status !== "Inactive")
      .map((s) => ({ name: s.name || "", role: s.role || "Teacher", email: s.email }))
      .filter((s) => s.name);
    setTeachingStaff(teaching);
    const cycles = appraisalData.filter((d) => d.type === "cycle") as unknown as Cycle[];
    const latest = [...cycles].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
    setCycle(latest || null);
    setKpiTemplates(Object.fromEntries(templates.map((t) => [t.name, t.kpis])));
  }, [user]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const cycleScorecards = cycle ? scorecards.filter((s) => s.cycleId === cycle.id) : scorecards;
  const completedCount = cycleScorecards.filter((s) => (Number(s.overall) || 0) > 0).length;
  const cycleCompletionPct = cycleScorecards.length ? Math.round((completedCount / cycleScorecards.length) * 100) : 0;
  const pendingScorecards = cycleScorecards.filter((s) => (Number(s.overall) || 0) === 0);

  const filteredScorecards = useMemo(() => {
    const q = scorecardSearch.trim().toLowerCase();
    return cycleScorecards.filter((s) => {
      const matchesQuery = !q || s.name?.toLowerCase().includes(q) || s.role?.toLowerCase().includes(q);
      const matchesStatus = scorecardStatusFilter === "all" || s.status === scorecardStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [cycleScorecards, scorecardSearch, scorecardStatusFilter]);

  // Only graded scorecards count toward these — a freshly-created cycle's
  // blank "Not Started" rows would otherwise drag the average toward 0.
  const gradedScorecards = scorecards.filter((c) => (Number(c.overall) || 0) > 0);
  const avgScore = gradedScorecards.length
    ? (gradedScorecards.reduce((sum, c) => sum + (Number(c.overall) || 0), 0) / gradedScorecards.length).toFixed(1)
    : "0.0";
  const topPerformers = gradedScorecards.filter((c) => (Number(c.overall) || 0) >= 90).length;
  const needsImprovement = scorecards.filter((c) => c.status === "Needs Improvement").length;

  // Real year-over-year history, grouped from the actual scorecard records
  // by their createdAt year — replaces a previously hardcoded 3-row table of
  // invented years/scores/departments. There's no department field tracked
  // on Staff/Appraisal records, so "Top Department" is dropped rather than
  // fabricated; "Evaluations" (a real count) takes its place.
  const appraisalHistory = useMemo(() => {
    const byYear = new Map<string, { totalScore: number; gradedCount: number; allCount: number }>();
    scorecards.forEach((s) => {
      if (!s.createdAt) return;
      const d = new Date(s.createdAt);
      if (isNaN(d.getTime())) return;
      const year = String(d.getFullYear());
      const bucket = byYear.get(year) || { totalScore: 0, gradedCount: 0, allCount: 0 };
      bucket.allCount++;
      const score = Number(s.overall) || 0;
      if (score > 0) {
        bucket.totalScore += score;
        bucket.gradedCount++;
      }
      byYear.set(year, bucket);
    });
    return Array.from(byYear.entries())
      .map(([year, b]) => ({
        year,
        avgScore: b.gradedCount ? `${(b.totalScore / b.gradedCount).toFixed(1)}%` : "—",
        evaluations: b.allCount,
        completion: b.allCount ? `${Math.round((b.gradedCount / b.allCount) * 100)}%` : "0%",
      }))
      .sort((a, b) => Number(b.year) - Number(a.year));
  }, [scorecards]);

  function handleDownloadYearReport(year: string) {
    const rows = scorecards.filter((s) => s.createdAt && String(new Date(s.createdAt).getFullYear()) === year);
    if (rows.length === 0) {
      toast.error(`No appraisal data for ${year}`);
      return;
    }
    const headers = ["Staff Name", "Role", "Teaching Quality", "Punctuality", "Student Feedback", "Admin Tasks", "Overall Score", "Status"];
    const csvContent = [
      headers.join(","),
      ...rows.map((s) =>
        [`"${s.name}"`, `"${s.role}"`, s.teaching, s.punctuality, s.feedback, s.admin, s.overall, `"${s.status}"`].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `staff_appraisals_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${rows.length} appraisal scorecard${rows.length === 1 ? "" : "s"} for ${year}`);
  }

  function handleDownloadReports() {
    if (scorecards.length === 0) {
      toast.error("No appraisal data to export");
      return;
    }
    const headers = ["Staff Name", "Role", "Teaching Quality", "Punctuality", "Student Feedback", "Admin Tasks", "Overall Score", "Status"];
    const csvContent = [
      headers.join(","),
      ...scorecards.map((s) =>
        [`"${s.name}"`, `"${s.role}"`, s.teaching, s.punctuality, s.feedback, s.admin, s.overall, `"${s.status}"`].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `staff_appraisals_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${scorecards.length} appraisal scorecards`);
  }

  async function handleSubmitCycleWizard(config: AppraisalCycleConfig) {
    if (!user) return;
    setSubmittingCycle(true);
    setCycleProgress(null);
    try {
      const result = await createAppraisalCycle(config, {
        uid: user.uid,
        userName: user.displayName || user.email || "HR Admin",
        role: role || "admin",
        allStaff,
        onProgress: setCycleProgress,
      });
      setCreationResult(result);
      setWizardOpen(false);
      setSuccessOpen(true);
      await loadAll();
    } catch (e) {
      toast.error(`Failed to create appraisal cycle: ${(e as Error).message}`);
    } finally {
      setSubmittingCycle(false);
      setCycleProgress(null);
    }
  }

  async function handleSaveCycleDraft(config: AppraisalCycleConfig) {
    if (!user) return;
    try {
      const id = `cycle-draft-${Date.now()}`;
      await smartDb.create(
        "Appraisal",
        { id, type: "cycle-draft", ...config, uid: user.uid, createdAt: new Date().toISOString() },
        id
      );
      toast.success(`Draft saved — "${config.name || "Untitled cycle"}" can be resumed later.`);
      setWizardOpen(false);
    } catch {
      toast.error("Failed to save draft");
    }
  }

  async function handleSaveKpiTemplate(name: string, kpis: KpiCategoryConfig[]) {
    try {
      const id = `kpitpl-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      await smartDb.create("AppraisalKpiTemplate", { id, name, kpis, createdAt: new Date().toISOString() }, id);
      setKpiTemplates((prev) => ({ ...prev, [name]: kpis }));
      toast.success(`Saved KPI template "${name}"`);
    } catch {
      toast.error("Failed to save KPI template");
    }
  }

  async function handleSendReminders() {
    if (!cycle) {
      toast.error("Start an appraisal cycle first.");
      return;
    }
    if (pendingScorecards.length === 0) {
      toast.success("Every staff member already has a completed scorecard — nothing to remind.");
      return;
    }
    setSendingReminders(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        pendingScorecards.map(async (s) => {
          await pushNotify({
            title: "Appraisal Reminder",
            message: `Your ${cycle.title || "performance appraisal"} scorecard is still pending — please complete it.`,
            audienceRole: "staff", recipientName: s.name,
            category: "hr", entity: "Appraisal", uid: user?.uid,
          });
          await smartDb.update("Appraisal", s.id, { reminderSentAt: now });
        })
      );
      toast.success(`Reminders sent to ${pendingScorecards.length} pending staff.`);
      await loadAll();
    } catch {
      toast.error("Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  }

  async function handleScheduleObs(): Promise<boolean> {
    if (!user) return false;
    if (!obsTeacher || !obsDate || !obsObserver) {
      toast.error("Please fill in all observation fields.");
      return false;
    }
    const id = `obs-${Date.now()}`;
    await smartDb.create(
      "Appraisal",
      {
        id,
        type: "observation",
        teacher: obsTeacher,
        date: obsDate,
        observer: obsObserver,
        status: "Scheduled",
        uid: user.uid,
        createdAt: new Date().toISOString(),
      },
      id
    );
    toast.success(`Observation scheduled for ${obsTeacher} on ${obsDate} by ${obsObserver}.`);
    setObsTeacher("");
    setObsDate("");
    setObsObserver("");
    return true;
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Award className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Performance Appraisal</h1>
              <p className="text-sm text-slate-400">Manage staff KPIs, appraisal cycles, and performance reviews</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleDownloadReports}>
              <Download className="mr-2 h-4 w-4" />
              Download Reports
            </Button>
            <Button size="sm" className="gradient-primary" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Appraisal Cycle
            </Button>
          </div>
        </div>

        {/* Current cycle summary — consolidates cycle status + HR config into one card */}
        <Card className="border-none shadow-sm bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{hrSettings.academicYear} · {cycle?.title || hrSettings.appraisalCycleLabel}</p>
                  <Badge className={cycle ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {cycle ? cycle.status || "In Progress" : "No Active Cycle"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cycle ? (
                    <>Started {new Date(cycle.startedAt || "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · Rating scale 1–{hrSettings.ratingScale} · 360° Peer Feedback {hrSettings.peer360 ? "on" : "off"}</>
                  ) : (
                    <>Start a new cycle to generate scorecards for every teaching staff member. Rating scale 1–{hrSettings.ratingScale} · 360° Peer Feedback {hrSettings.peer360 ? "on" : "off"}</>
                  )}
                </p>
                {cycle && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${cycleCompletionPct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">{cycleCompletionPct}% · {completedCount}/{cycleScorecards.length}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="text-xs" disabled={!cycle} onClick={() => setViewCycleOpen(true)}>
                View Cycle
              </Button>
              <Button size="sm" variant="outline" className="text-xs border-primary/20 hover:bg-primary/5" disabled={!cycle || sendingReminders} onClick={handleSendReminders}>
                {sendingReminders ? "Sending…" : "Send Reminders"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Staff Evaluated</p>
                  <p className="text-xl font-bold text-gray-900">{completedCount} / {cycleScorecards.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Average Score</p>
                  <p className="text-xl font-bold text-gray-900">{avgScore}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Award className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Top Performers</p>
                  <p className="text-xl font-bold text-gray-900">{topPerformers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Star className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Needs Improvement</p>
                  <p className="text-xl font-bold text-gray-900">{needsImprovement}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="scorecards" className="space-y-4">
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            <TabsTrigger value="scorecards" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Users className="h-4 w-4" /> Staff Scorecards
            </TabsTrigger>
            <TabsTrigger value="kpi" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <ClipboardList className="h-4 w-4" /> KPI Framework
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <MessageSquare className="h-4 w-4" /> Feedback Templates
            </TabsTrigger>
            <TabsTrigger value="feedback-results" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Star className="h-4 w-4" /> Feedback Results
            </TabsTrigger>
            <TabsTrigger value="submission-tracking" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <UserCheck className="h-4 w-4" /> Submission Tracking
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Clock className="h-4 w-4" /> Appraisal History
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <TrendingUp className="h-4 w-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scorecards" className="mt-0 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff name or role..."
                  className="pl-10 rounded-xl bg-white border-none shadow-sm"
                  value={scorecardSearch}
                  onChange={(e) => setScorecardSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={scorecardStatusFilter}
                  onChange={(e) => setScorecardStatusFilter(e.target.value)}
                  className="h-9 rounded-xl border-none bg-white pl-3 pr-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none appearance-none"
                >
                  <option value="all">All Status</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Satisfactory">Satisfactory</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                  <option value="Self Review Submitted">Self Review Submitted</option>
                  <option value="Not Started">Not Started</option>
                </select>
                <Button size="sm" variant="outline" className="border-none bg-white shadow-sm" onClick={() => setScheduleObsOpen(true)}>
                  <CalendarClock className="mr-2 h-4 w-4" /> Schedule Observation
                </Button>
              </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-center">Teaching Quality</TableHead>
                      <TableHead className="text-center">Punctuality</TableHead>
                      <TableHead className="text-center">Student Feedback</TableHead>
                      <TableHead className="text-center">Admin Tasks</TableHead>
                      <TableHead className="text-center">Overall Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScorecards.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center text-sm text-gray-400">
                          {scorecards.length === 0
                            ? "No appraisal scorecards yet. Start a new appraisal cycle and schedule classroom observations to evaluate staff."
                            : "No staff match your search or filter."}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredScorecards.map((staff) => (
                      <TableRow key={staff.id || staff.name}>
                        <TableCell className="font-medium">{staff.name}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{staff.role}</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.teaching))}>{staff.teaching != null ? `${staff.teaching}%` : "—"}</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.punctuality))}>{staff.punctuality != null ? `${staff.punctuality}%` : "—"}</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.feedback))}>{staff.feedback != null ? `${staff.feedback}%` : "—"}</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.admin))}>{staff.admin != null ? `${staff.admin}%` : "—"}</TableCell>
                        <TableCell className={cn("text-center text-base", scoreColor(staff.overall))}>{staff.overall}%</TableCell>
                        <TableCell>{statusBadge(staff.status)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setEditCard({ ...staff })}>
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kpi" className="mt-4">
            <KpiFrameworkManager />
          </TabsContent>

          <TabsContent value="feedback" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 max-w-md">
                Students and parents only see this once you notify them — templates and weighting alone don't send anything.
              </p>
              <NotifyFeedbackButton />
            </div>
            <FeedbackWeightingCard />
            <FeedbackTemplatesManager />
          </TabsContent>

          <TabsContent value="feedback-results" className="mt-4">
            <FeedbackResultsTab />
          </TabsContent>

          <TabsContent value="submission-tracking" className="mt-4">
            <SubmissionTrackingTab cycle={cycle} cycleScorecards={cycleScorecards} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                {appraisalHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No appraisal history yet — scorecards are grouped here by year once graded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-center">Average Score</TableHead>
                        <TableHead className="text-center">Evaluations</TableHead>
                        <TableHead className="text-center">Completion Rate</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appraisalHistory.map((row) => (
                        <TableRow key={row.year}>
                          <TableCell className="font-medium">{row.year}</TableCell>
                          <TableCell className="text-center font-semibold text-green-600">{row.avgScore}</TableCell>
                          <TableCell className="text-center">{row.evaluations}</TableCell>
                          <TableCell className="text-center">{row.completion}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handleDownloadYearReport(row.year)}>
                              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <AppraisalAnalyticsTab
              cards={cycleScorecards}
              allStaff={allStaff}
              cycleName={cycle?.title}
              onExport={handleDownloadReports}
            />
          </TabsContent>
        </Tabs>

        <Dialog open={scheduleObsOpen} onOpenChange={setScheduleObsOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-indigo-500" />
                Schedule Classroom Observation
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="block mb-1">Teacher</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={obsTeacher}
                  onChange={(e) => setObsTeacher(e.target.value)}
                >
                  <option value="">Select teacher...</option>
                  {teacherOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="block mb-1">Observation Date</Label>
                <Input
                  type="date"
                  value={obsDate}
                  onChange={(e) => setObsDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="block mb-1">Observer Name</Label>
                <Input
                  placeholder="e.g. Dr. Khalid Nasser Al-Farsi"
                  value={obsObserver}
                  onChange={(e) => setObsObserver(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleObsOpen(false)}>Cancel</Button>
              <Button
                className="gap-2"
                onClick={async () => { if (await handleScheduleObs()) setScheduleObsOpen(false); }}
              >
                <Plus className="h-4 w-4" />
                Schedule Observation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editCard} onOpenChange={(o) => !o && setEditCard(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{editCard ? `Scorecard — ${editCard.name}` : "Scorecard"}</DialogTitle>
            </DialogHeader>
            {editCard && (
              <div className="space-y-3 py-2">
                {editCard.reviewers && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <GitBranch className="h-3.5 w-3.5 text-purple-500" />
                    <span>HOD: <b>{editCard.reviewers.hod || "Unassigned"}</b> · Principal: <b>{editCard.reviewers.principal || "Unassigned"}</b> · HR: <b>{editCard.reviewers.hr || "Unassigned"}</b></span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {editCard.kpiScores ? (
                    Object.entries(editCard.kpiScores).map(([title, score]) => (
                      <div key={title} className="grid gap-2">
                        <Label htmlFor={`sc-${title}`}>{title}{editCard.kpiWeights?.[title] ? ` (${editCard.kpiWeights[title]}%)` : ""}</Label>
                        <Input id={`sc-${title}`} type="number" value={score} onChange={(e) =>
                          setEditCard({ ...editCard, kpiScores: { ...editCard.kpiScores, [title]: Number(e.target.value) } })} />
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="sc-teaching">Teaching Quality</Label>
                        <Input id="sc-teaching" type="number" value={editCard.teaching} onChange={(e) => setEditCard({ ...editCard, teaching: Number(e.target.value) })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="sc-punctuality">Punctuality</Label>
                        <Input id="sc-punctuality" type="number" value={editCard.punctuality} onChange={(e) => setEditCard({ ...editCard, punctuality: Number(e.target.value) })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="sc-feedback">Student Feedback</Label>
                        <Input id="sc-feedback" type="number" value={editCard.feedback} onChange={(e) => setEditCard({ ...editCard, feedback: Number(e.target.value) })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="sc-admin">Admin Tasks</Label>
                        <Input id="sc-admin" type="number" value={editCard.admin} onChange={(e) => setEditCard({ ...editCard, admin: Number(e.target.value) })} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleSaveScorecard} className="gap-2">Save Scorecard</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewCycleOpen} onOpenChange={setViewCycleOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{cycle?.title || "Appraisal Cycle"}</DialogTitle>
            </DialogHeader>
            {cycle && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-gray-50 border">
                    <p className="text-xl font-bold text-gray-900">{cycleScorecards.length}</p>
                    <p className="text-xs text-gray-500">Total Staff</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                    <p className="text-xl font-bold text-green-700">{completedCount}</p>
                    <p className="text-xs text-green-600">Completed</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <p className="text-xl font-bold text-orange-700">{pendingScorecards.length}</p>
                    <p className="text-xs text-orange-600">Pending</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Pending Staff</p>
                  {pendingScorecards.length === 0 ? (
                    <p className="text-sm text-gray-400">Everyone has a completed scorecard.</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5">
                      {pendingScorecards.map((s) => (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border text-sm">
                          <div>
                            <span className="font-medium">{s.name}</span>
                            {s.reviewers && (
                              <p className="text-[10px] text-gray-400">HOD: {s.reviewers.hod || "Unassigned"} · Principal: {s.reviewers.principal || "Unassigned"} · HR: {s.reviewers.hr || "Unassigned"}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{s.reminderSentAt ? `Reminded ${new Date(s.reminderSentAt).toLocaleDateString()}` : "No reminder sent"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewCycleOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AppraisalCycleWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          staff={allStaff}
          branches={branches}
          academicYear={hrSettings.academicYear}
          kpiTemplates={kpiTemplates}
          onSaveTemplate={handleSaveKpiTemplate}
          submitting={submittingCycle}
          progress={cycleProgress}
          onSubmit={handleSubmitCycleWizard}
          onSaveDraft={handleSaveCycleDraft}
        />

        <CycleSuccessScreen
          open={successOpen}
          result={creationResult}
          onViewCycle={() => { setSuccessOpen(false); setViewCycleOpen(true); }}
          onAssignReviewers={() => { setSuccessOpen(false); setViewCycleOpen(true); }}
          onClose={() => setSuccessOpen(false)}
        />
      </div>
    </DashboardLayout>
  );
}
