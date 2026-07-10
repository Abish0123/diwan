import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, BarChart3, Users, Award, TrendingUp, ShieldCheck, Trophy,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { ensureCodingSeed, getTests, getQuestions, getAttempts } from "@/lib/codingData";
import { AdminNav } from "@/components/coding/AdminNav";
import {
  CodingTest, CodingQuestion, CodingAttempt, integrityStatus,
} from "@/types/coding";
import { IntegrityBadge } from "@/components/coding/shared";

const COLORS = ["#9810fa", "#a855f7", "#c084fc", "#d8b4fe", "#e9d5ff"];

export default function CodingAnalytics() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);

  useEffect(() => {
    (async () => {
      await ensureCodingSeed();
      const [t, q, a] = await Promise.all([getTests(), getQuestions(), getAttempts()]);
      setTests(t || []); setQuestions(q || []); setAttempts(a || []);
    })();
  }, []);

  const submitted = useMemo(() => attempts.filter((a) => a.status === "submitted"), [attempts]);
  const totalStudents = new Set(attempts.map((a) => a.studentId)).size;
  const scoredSubmissions = submitted.filter((a) => a.totalMarks && a.totalMarks > 0);
  const avgScore = scoredSubmissions.length ? Math.round(scoredSubmissions.reduce((s, a) => s + (a.totalScore / a.totalMarks!) * 100, 0) / scoredSubmissions.length) : 0;
  const passRate = submitted.length ? Math.round((submitted.filter((a) => a.totalMarks && a.totalScore / a.totalMarks >= 0.4).length / submitted.length) * 100) : 0;
  const avgIntegrity = submitted.length ? Math.round(submitted.reduce((s, a) => s + a.integrityScore, 0) / submitted.length) : 0;

  // score distribution buckets
  const buckets = ["0-20", "21-40", "41-60", "61-80", "81-100"];
  const dist = buckets.map((b) => ({ bucket: b, count: 0 }));
  scoredSubmissions.forEach((a) => {
    const pct = (a.totalScore / a.totalMarks!) * 100;
    const i = Math.min(4, Math.floor(pct / 20.0001));
    dist[i].count++;
  });

  // per-test attempts
  const perTest = tests.map((t) => ({
    name: t.title.length > 16 ? t.title.slice(0, 16) + "…" : t.title,
    attempts: attempts.filter((a) => a.testId === t.id).length,
  }));

  // integrity status pie
  const integrityPie = useMemo(() => {
    const m: Record<string, number> = {};
    submitted.forEach((a) => { const s = integrityStatus(a.integrityScore); m[s] = (m[s] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [submitted]);

  // leaderboard
  const leaderboard = useMemo(() =>
    [...submitted].sort((a, b) => (b.totalScore / (b.totalMarks || 1)) - (a.totalScore / (a.totalMarks || 1))).slice(0, 10),
  [submitted]);

  // question difficulty analysis — avg pass rate per difficulty across all submissions
  const difficultyStats = useMemo(() => {
    const qById: Record<string, CodingQuestion> = {};
    questions.forEach((q) => { qById[q.id] = q; });
    const acc: Record<string, { passSum: number; n: number }> = { Easy: { passSum: 0, n: 0 }, Medium: { passSum: 0, n: 0 }, Hard: { passSum: 0, n: 0 } };
    submitted.forEach((a) => Object.values(a.submissions || {}).forEach((s) => {
      const q = qById[s.questionId];
      if (!q || !s.total) return;
      const d = q.difficulty;
      acc[d].passSum += s.passed / s.total;
      acc[d].n += 1;
    }));
    return (["Easy", "Medium", "Hard"] as const).map((d) => ({
      difficulty: d, attempts: acc[d].n,
      successRate: acc[d].n ? Math.round((acc[d].passSum / acc[d].n) * 100) : 0,
    }));
  }, [submitted, questions]);

  // class rankings — grouped by the real Grade/Section a test was targeted at
  const classRankings = useMemo(() => {
    const m: Record<string, { sum: number; n: number }> = {};
    submitted.forEach((a) => {
      const t = tests.find((x) => x.id === a.testId);
      const cls = t?.grade && t?.section ? `Grade ${t.grade}-${t.section}` : "Unassigned";
      (m[cls] ||= { sum: 0, n: 0 });
      m[cls].sum += a.totalMarks ? (a.totalScore / a.totalMarks) * 100 : 0;
      m[cls].n += 1;
    });
    return Object.entries(m).map(([cls, v]) => ({ cls, avg: Math.round(v.sum / v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
  }, [submitted, tests]);

  return (
    <DashboardLayout>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assessment Analytics</h1>
          <p className="text-sm text-slate-400">Institution-wide performance and integrity insights.</p>
        </div>
      </div>

      <AdminNav />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat icon={<Users className="h-5 w-5" />} label="Students" value={totalStudents} />
        <Stat icon={<Trophy className="h-5 w-5" />} label="Submissions" value={submitted.length} />
        <Stat icon={<Award className="h-5 w-5" />} label="Avg Score" value={`${avgScore}%`} />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Pass Rate" value={`${passRate}%`} />
        <Stat icon={<ShieldCheck className="h-5 w-5" />} label="Avg Integrity" value={avgIntegrity || "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Score Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#9810fa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Integrity Breakdown</CardTitle></CardHeader>
          <CardContent>
            {integrityPie.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={integrityPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {integrityPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[240px] grid place-items-center text-slate-400 text-sm">No submissions yet</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Attempts per Test</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={perTest} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="attempts" fill="#a855f7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Leaderboard</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Student</TableHead><TableHead>Score</TableHead><TableHead>Integrity</TableHead></TableRow></TableHeader>
              <TableBody>
                {leaderboard.map((a, i) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold text-slate-400">{i + 1}</TableCell>
                    <TableCell className="font-medium text-slate-800">{a.studentName}</TableCell>
                    <TableCell>{a.totalScore}/{a.totalMarks}</TableCell>
                    <TableCell><IntegrityBadge score={a.integrityScore} status={integrityStatus(a.integrityScore)} /></TableCell>
                  </TableRow>
                ))}
                {leaderboard.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">No submissions yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Question Difficulty Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {difficultyStats.map((d) => (
              <div key={d.difficulty}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700">{d.difficulty} <span className="text-slate-400">({d.attempts} submissions)</span></span>
                  <span className="font-semibold text-slate-800">{d.successRate}% success</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${d.successRate}%`, background: d.difficulty === "Easy" ? "#059669" : d.difficulty === "Medium" ? "#d97706" : "#e11d48" }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Class Rankings</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Class</TableHead><TableHead>Avg Score</TableHead><TableHead>Submissions</TableHead></TableRow></TableHeader>
              <TableBody>
                {classRankings.map((d, i) => (
                  <TableRow key={d.cls}>
                    <TableCell className="font-semibold text-slate-400">{i + 1}</TableCell>
                    <TableCell className="font-medium text-slate-800">{d.cls}</TableCell>
                    <TableCell>{d.avg}%</TableCell>
                    <TableCell>{d.n}</TableCell>
                  </TableRow>
                ))}
                {classRankings.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">No submissions yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-lg bg-violet-50 text-[#9810fa] grid place-items-center">{icon}</div>
        <div><div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>
      </CardContent>
    </Card>
  );
}
