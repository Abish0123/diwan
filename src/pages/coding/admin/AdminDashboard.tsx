import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, FileQuestion, Users, Activity, Terminal,
  TrendingUp, AlertTriangle, GraduationCap, BarChart3,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import {
  ensureCodingSeed, getTests, getQuestions, getAttempts, getAssignments,
  getRealClasses,
} from "@/lib/codingData";
import { getAuditLogs } from "@/lib/codingAudit";
import {
  CodingTest, CodingQuestion, CodingAttempt, AssessmentAssignment, AuditLog, integrityStatus,
} from "@/types/coding";
import { AdminNav } from "@/components/coding/AdminNav";
import { IntegrityBadge } from "@/components/coding/shared";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel } from "@/lib/codingRbac";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [assignments, setAssignments] = useState<AssessmentAssignment[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [classCount, setClassCount] = useState(0);

  useEffect(() => {
    (async () => {
      await ensureCodingSeed();
      const [t, q, a, asg, au, cls] = await Promise.all([
        getTests(), getQuestions(), getAttempts(), getAssignments(), getAuditLogs(),
        getRealClasses(),
      ]);
      setTests(t || []); setQuestions(q || []); setAttempts(a || []);
      setAssignments(asg || []); setAudit(au || []);
      setClassCount((cls || []).length);
    })();
  }, []);

  const submitted = useMemo(() => attempts.filter((a) => a.status === "submitted"), [attempts]);
  const passRate = submitted.length ? Math.round((submitted.filter((a) => a.totalMarks && a.totalScore / a.totalMarks >= 0.4).length / submitted.length) * 100) : 0;
  const flagged = submitted.filter((a) => a.integrityScore < 65);
  const students = new Set(attempts.map((a) => a.studentId)).size;

  const recentAudit = useMemo(() => [...audit].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 6), [audit]);
  const visibleFlagged = flagged.slice(0, 6);

  // Score Distribution replaces the flat "Avg Score" number with the actual
  // shape of the class's performance — a PM can tell "everyone's clustered
  // around 60%" from a bar chart in a way a single average can never show.
  const BUCKETS = [
    { label: "0–20", min: 0, max: 20, color: "#e11d48" },
    { label: "20–40", min: 20, max: 40, color: "#f97316" },
    { label: "40–60", min: 40, max: 60, color: "#eab308" },
    { label: "60–80", min: 60, max: 80, color: "#84cc16" },
    { label: "80–100", min: 80, max: 100.0001, color: "#059669" },
  ];
  const scoreDistribution = useMemo(() => {
    const pcts = submitted.filter((a) => a.totalMarks > 0).map((a) => (a.totalScore / a.totalMarks) * 100);
    return BUCKETS.map((b) => ({
      range: b.label,
      color: b.color,
      count: pcts.filter((p) => p >= b.min && p < b.max).length,
    }));
  }, [submitted]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Terminal className="h-5 w-5 text-[#9810fa]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Coding Assessment Admin</h1>
            <p className="text-sm text-slate-500">Central control over assessments, proctoring, grading and access.</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-violet-50 text-[#9810fa] border-violet-200">{roleLabel(role)} access</Badge>
      </div>

      {/* AdminNav below is the single source of navigation to Institutions,
          Classes, Departments, Question Bank, Assessments, AI Proctoring,
          Grading Rules, Assignment and Audit Logs — a second "management
          tiles" grid linking to the exact same 9 destinations used to sit
          right underneath it, so every link appeared twice on one screen. */}
      <AdminNav />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={<GraduationCap className="h-5 w-5" />} label="Classes" value={classCount} />
        <Kpi icon={<ClipboardList className="h-5 w-5" />} label="Tests" value={tests.length} />
        <Kpi icon={<FileQuestion className="h-5 w-5" />} label="Questions" value={questions.length} />
        <Kpi icon={<Users className="h-5 w-5" />} label="Students" value={students} />
        <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Pass Rate" value={`${passRate}%`} tone={submitted.length ? (passRate >= 60 ? "emerald" : "amber") : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#9810fa]" /> Score Distribution</CardTitle>
            <CardDescription>How submitted attempts spread across score bands</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted.length === 0 ? (
              <p className="text-sm text-slate-400 py-16 text-center">No submitted attempts yet — the chart fills in once students finish tests.</p>
            ) : (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreDistribution} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <Tooltip
                      cursor={{ fill: "#faf5ff" }}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #f1f5f9", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                      formatter={(value: number) => [`${value} attempt${value === 1 ? "" : "s"}`, "Count"]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={900} animationEasing="ease-out">
                      {scoreDistribution.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={flagged.length ? "border-rose-200" : "border-slate-200"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${flagged.length ? "text-rose-500" : "text-slate-400"}`} /> Integrity — Review Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleFlagged.length === 0 && (
              <p className="text-sm text-slate-400 py-6 text-center">No integrity flags — every submission looks clean.</p>
            )}
            {visibleFlagged.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700 truncate">{a.studentName} · {a.testTitle}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <IntegrityBadge score={a.integrityScore} status={integrityStatus(a.integrityScore)} />
                  <Button size="sm" variant="ghost" className="text-[#9810fa] px-2" onClick={() => navigate(`/coding/attempt/${a.id}/result`)}>Report</Button>
                </div>
              </div>
            ))}
            {flagged.length > 6 && (
              <Button variant="link" className="p-0 h-auto text-[#9810fa]" onClick={() => navigate("/coding/admin/audit")}>View all {flagged.length} flagged →</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* recent activity */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-[#9810fa]" /> Recent Activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentAudit.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No admin actions logged yet.</p>}
            {recentAudit.map((a) => (
              <div key={a.id} className="text-sm border-l-2 border-violet-200 pl-3">
                <div className="text-slate-700">{a.action}</div>
                <div className="text-xs text-slate-400">{a.user} · {new Date(a.at).toLocaleString()}</div>
              </div>
            ))}
            {audit.length > 6 && (
              <Button variant="link" className="p-0 h-auto text-[#9810fa]" onClick={() => navigate("/coding/admin/audit")}>View all logs →</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

const KPI_TONES = {
  default: "bg-violet-50 text-[#9810fa]",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

function Kpi({ icon, label, value, sub, tone = "default" }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: keyof typeof KPI_TONES }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${KPI_TONES[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-2xl font-bold text-slate-900 leading-none tabular-nums truncate">{value}</div>
          <div className="text-xs text-slate-500 mt-1 truncate">{sub || label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
