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
import { Star, TrendingUp, Users, Award, ChevronDown, ChevronUp, ClipboardList, Plus, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useHRSettings } from "@/contexts/HRSettingsContext";

const kpiCategories = [
  {
    title: "Teaching Quality",
    weight: 30,
    criteria: [
      "Lesson plan preparation and alignment with curriculum",
      "Clarity and effectiveness of instruction delivery",
      "Use of diverse teaching methodologies",
      "Integration of technology in lessons",
      "Differentiation for varied learning needs",
    ],
  },
  {
    title: "Classroom Management",
    weight: 20,
    criteria: [
      "Maintaining a positive and productive environment",
      "Effective handling of student behaviour",
      "Time management and lesson pacing",
      "Classroom organisation and resource management",
    ],
  },
  {
    title: "Student Outcomes",
    weight: 25,
    criteria: [
      "Student assessment scores and progression",
      "Improvement rates across term benchmarks",
      "Completion of curriculum targets",
      "Student satisfaction and engagement metrics",
    ],
  },
  {
    title: "Professional Development",
    weight: 15,
    criteria: [
      "Participation in CPD workshops and training",
      "Self-reflection and professional goal-setting",
      "Contribution to department improvement plans",
    ],
  },
  {
    title: "Administrative Compliance",
    weight: 10,
    criteria: [
      "Timely submission of reports and grades",
      "Attendance and punctuality records",
      "Adherence to school policies and procedures",
    ],
  },
];

interface Scorecard {
  id: string;
  name: string;
  role: string;
  teaching: number;
  punctuality: number;
  feedback: number;
  admin: number;
  overall: number;
  status: string;
  type?: string;
  uid?: string;
  createdAt?: string;
  cycleId?: string;
  reminderSentAt?: string;
}

interface Cycle {
  id: string;
  type?: string;
  title?: string;
  startedAt?: string;
  status?: string;
}

function scoreColor(score: number) {
  if (score >= 90) return "text-green-600 font-semibold";
  if (score >= 75) return "text-yellow-600 font-semibold";
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
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function StaffAppraisal() {
  const { user } = useAuth();
  const hrSettings = useHRSettings();
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);
  const [obsTeacher, setObsTeacher] = useState("");
  const [obsDate, setObsDate] = useState("");
  const [obsObserver, setObsObserver] = useState("");
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [editCard, setEditCard] = useState<Scorecard | null>(null);
  const [teachingStaff, setTeachingStaff] = useState<{ name: string; role: string; email?: string }[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [viewCycleOpen, setViewCycleOpen] = useState(false);
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  function statusForScore(score: number) {
    if (score >= 90) return "Excellent";
    if (score >= 83) return "Good";
    if (score >= 75) return "Satisfactory";
    return "Needs Improvement";
  }

  async function handleSaveScorecard() {
    if (!editCard) return;
    const teaching = Number(editCard.teaching) || 0;
    const punctuality = Number(editCard.punctuality) || 0;
    const feedback = Number(editCard.feedback) || 0;
    const admin = Number(editCard.admin) || 0;
    const overall = Math.round((teaching + punctuality + feedback + admin) / 4);
    const status = statusForScore(overall);
    const updated = { ...editCard, teaching, punctuality, feedback, admin, overall, status };
    await smartDb.update("Appraisal", editCard.id, { teaching, punctuality, feedback, admin, overall, status });
    setScorecards((prev) => prev.map((c) => (c.id === editCard.id ? updated : c)));
    setEditCard(null);
    toast.success(`Scorecard updated for ${editCard.name}`);
  }

  const teacherOptions = teachingStaff.map((s) => s.name);

  const loadAll = useCallback(async () => {
    if (!user) return;
    // School-wide, not scoped to this admin's own uid — appraisal records and
    // the staff roster are shared org data, same fix as HRDashboard.tsx.
    const [appraisalData, staffData] = await Promise.all([
      smartDb.getAll("Appraisal", undefined) as Promise<Scorecard[]>,
      smartDb.getAll("Staff", undefined) as Promise<Record<string, unknown>[]>,
    ]);
    setScorecards(appraisalData.filter((d) => d.type !== "observation" && d.type !== "cycle"));
    const teaching = staffData
      .filter((s) => (s.role === "Class Teacher" || s.role === "Subject Teacher") && s.status !== "Inactive")
      .map((s) => ({ name: (s.name as string) || "", role: (s.role as string) || "Teacher", email: s.email as string | undefined }))
      .filter((s) => s.name);
    setTeachingStaff(teaching);
    const cycles = appraisalData.filter((d) => d.type === "cycle") as unknown as Cycle[];
    const latest = [...cycles].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
    setCycle(latest || null);
  }, [user]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const cycleScorecards = cycle ? scorecards.filter((s) => s.cycleId === cycle.id) : scorecards;
  const completedCount = cycleScorecards.filter((s) => (Number(s.overall) || 0) > 0).length;
  const cycleCompletionPct = cycleScorecards.length ? Math.round((completedCount / cycleScorecards.length) * 100) : 0;
  const pendingScorecards = cycleScorecards.filter((s) => (Number(s.overall) || 0) === 0);

  function toggleKpi(idx: number) {
    setExpandedKpi(expandedKpi === idx ? null : idx);
  }

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

  async function handleNewCycle() {
    if (!user) return;
    if (teachingStaff.length === 0) {
      toast.error("No teaching staff found to evaluate — add staff before starting a cycle.");
      return;
    }
    setCreatingCycle(true);
    try {
      const id = `cycle-${Date.now()}`;
      await smartDb.create(
        "Appraisal",
        {
          id,
          type: "cycle",
          title: hrSettings.appraisalCycleLabel || "Appraisal Cycle",
          startedAt: new Date().toISOString(),
          status: "In Progress",
          uid: user.uid,
          createdAt: new Date().toISOString(),
        },
        id
      );
      // A cycle is only useful once every teaching staff member has a
      // scorecard to fill in — without this, "Staff Scorecards" stays empty
      // forever because nothing in the UI could previously create one.
      await Promise.all(
        teachingStaff.map((s) => {
          const cardId = `sc-${id}-${s.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return smartDb.create(
            "Appraisal",
            {
              id: cardId,
              name: s.name,
              role: s.role,
              teaching: 0, punctuality: 0, feedback: 0, admin: 0, overall: 0,
              status: "Not Started",
              cycleId: id,
              uid: user.uid,
              createdAt: new Date().toISOString(),
            },
            cardId
          );
        })
      );
      toast.success(`New appraisal cycle started — ${teachingStaff.length} staff scorecards created.`);
      await loadAll();
    } catch {
      toast.error("Failed to start appraisal cycle");
    } finally {
      setCreatingCycle(false);
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

  async function handleScheduleObs() {
    if (!user) return;
    if (!obsTeacher || !obsDate || !obsObserver) {
      toast.error("Please fill in all observation fields.");
      return;
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
          <div className="flex gap-2">
            <Button onClick={handleNewCycle} disabled={creatingCycle} className="gap-2">
              <Plus className="h-4 w-4" />
              {creatingCycle ? "Starting…" : "New Appraisal Cycle"}
            </Button>
            <Button variant="outline" onClick={handleDownloadReports} className="gap-2">
              <Download className="h-4 w-4" />
              Download Reports
            </Button>
          </div>
        </div>

        {/* HR Settings strip */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border bg-purple-50 border-purple-100 text-sm">
          <span className="font-semibold text-purple-800">Appraisal Config (from HR Settings):</span>
          <span className="text-purple-700">Cycle: <b>{hrSettings.appraisalCycleLabel}</b></span>
          <span className="text-purple-400">·</span>
          <span className="text-purple-700">Rating Scale: <b>1 to {hrSettings.ratingScale}</b></span>
          <span className="text-purple-400">·</span>
          <span className="text-purple-700">360° Peer Feedback: <b>{hrSettings.peer360 ? 'Enabled' : 'Disabled'}</b></span>
        </div>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-blue-900">{hrSettings.academicYear} · {cycle?.title || hrSettings.appraisalCycleLabel}</h2>
                  <Badge className={cycle ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {cycle ? cycle.status || "In Progress" : "No Active Cycle"}
                  </Badge>
                </div>
                <p className="text-sm text-blue-700">
                  {cycle ? (
                    <>Started: <span className="font-medium">{new Date(cycle.startedAt || "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></>
                  ) : (
                    "Start a new cycle to generate scorecards for every teaching staff member."
                  )}
                </p>
                {cycle && (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-48 h-2 bg-blue-200 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full" style={{ width: `${cycleCompletionPct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-blue-800">{cycleCompletionPct}% Complete ({completedCount}/{cycleScorecards.length})</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="border-blue-300 text-blue-800 hover:bg-blue-100" disabled={!cycle} onClick={() => setViewCycleOpen(true)}>
                  View Cycle
                </Button>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white" disabled={!cycle || sendingReminders} onClick={handleSendReminders}>
                  {sendingReminders ? "Sending…" : "Send Reminders"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        <Tabs defaultValue="scorecards">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="scorecards">Staff Scorecards</TabsTrigger>
            <TabsTrigger value="kpi">KPI Framework</TabsTrigger>
            <TabsTrigger value="history">Appraisal History</TabsTrigger>
          </TabsList>

          <TabsContent value="scorecards" className="mt-4">
            <Card>
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
                    {scorecards.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center text-sm text-gray-400">
                          No appraisal scorecards yet. Start a new appraisal cycle and schedule classroom observations to evaluate staff.
                        </TableCell>
                      </TableRow>
                    )}
                    {scorecards.map((staff) => (
                      <TableRow key={staff.id || staff.name}>
                        <TableCell className="font-medium">{staff.name}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{staff.role}</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.teaching))}>{staff.teaching}%</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.punctuality))}>{staff.punctuality}%</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.feedback))}>{staff.feedback}%</TableCell>
                        <TableCell className={cn("text-center", scoreColor(staff.admin))}>{staff.admin}%</TableCell>
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

          <TabsContent value="kpi" className="mt-4 space-y-3">
            {kpiCategories.map((cat, idx) => (
              <Card key={cat.title}>
                <CardHeader className="pb-0 pt-4">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => toggleKpi(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <ClipboardList className="h-5 w-5 text-indigo-500" />
                      <CardTitle className="text-base">{cat.title}</CardTitle>
                      <Badge variant="outline" className="text-xs">{cat.weight}% weight</Badge>
                    </div>
                    {expandedKpi === idx ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </CardHeader>
                {expandedKpi === idx && (
                  <CardContent className="pt-3 pb-4">
                    <ul className="space-y-2">
                      {cat.criteria.map((criterion) => (
                        <li key={criterion} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-0.5 h-4 w-4 rounded border border-indigo-300 bg-indigo-50 flex items-center justify-center flex-shrink-0">
                            <span className="block h-2 w-2 rounded-sm bg-indigo-400" />
                          </span>
                          {criterion}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            ))}
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
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-500" />
              Schedule Classroom Observation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Observation Date</label>
                <Input
                  type="date"
                  value={obsDate}
                  onChange={(e) => setObsDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observer Name</label>
                <Input
                  placeholder="e.g. Dr. Khalid Nasser Al-Farsi"
                  value={obsObserver}
                  onChange={(e) => setObsObserver(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleScheduleObs} className="gap-2">
                <Plus className="h-4 w-4" />
                Schedule Observation
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!editCard} onOpenChange={(o) => !o && setEditCard(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{editCard ? `Scorecard — ${editCard.name}` : "Scorecard"}</DialogTitle>
            </DialogHeader>
            {editCard && (
              <div className="grid grid-cols-2 gap-4 py-2">
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
                          <span className="font-medium">{s.name}</span>
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
      </div>
    </DashboardLayout>
  );
}
