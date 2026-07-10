import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, Sparkles, AlertTriangle, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { ensurePlagiarismSeed, getReports, getPolicy } from "@/lib/plagiarismData";
import { ProjectReport, PlagiarismPolicy } from "@/types/plagiarism";

const COLORS = ["#059669", "#d97706", "#ea580c", "#e11d48"];

export function AnalyticsPanel() {
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [policy, setPolicy] = useState<PlagiarismPolicy | null>(null);

  useEffect(() => {
    (async () => {
      await ensurePlagiarismSeed();
      const [r, p] = await Promise.all([getReports(), getPolicy()]);
      setReports(r || []); setPolicy(p);
    })();
  }, []);

  const total = reports.length;
  const avgSim = total ? Math.round(reports.reduce((s, r) => s + (r.result?.overallSimilarity || 0), 0) / total) : 0;
  const highRisk = reports.filter((r) => (r.result?.overallSimilarity || 0) >= (policy?.manualReviewBelow ?? 30)).length;
  const aiReports = reports.filter((r) => (r.result?.ai.aiProbability || 0) >= (policy?.aiReviewBelow ?? 50)).length;

  const buckets = ["0-15%", "15-30%", "30-50%", "50%+"];
  const dist = buckets.map((b) => ({ band: b, count: 0 }));
  reports.forEach((r) => { const s = r.result?.overallSimilarity || 0; dist[s < 15 ? 0 : s < 30 ? 1 : s < 50 ? 2 : 3].count++; });

  const aiPie = useMemo(() => {
    let ai = 0, human = 0;
    reports.forEach((r) => { ai += r.result?.ai.aiProbability || 0; human += r.result?.ai.humanProbability || 0; });
    const n = total || 1;
    return [{ name: "AI-Generated", value: Math.round(ai / n) }, { name: "Human-Written", value: Math.round(human / n) }];
  }, [reports, total]);

  const deptPerf = useMemo(() => {
    const m: Record<string, { sum: number; n: number }> = {};
    reports.forEach((r) => { const d = r.department || "—"; (m[d] ||= { sum: 0, n: 0 }); m[d].sum += r.result?.overallSimilarity || 0; m[d].n++; });
    return Object.entries(m).map(([dept, v]) => ({ dept, avg: Math.round(v.sum / v.n), count: v.n })).sort((a, b) => b.avg - a.avg);
  }, [reports]);

  const monthly = useMemo(() => {
    const m: Record<string, number> = {};
    reports.forEach((r) => { const k = new Date(r.createdAt).toLocaleDateString(undefined, { month: "short" }); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([month, count]) => ({ month, count }));
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<FileText className="h-5 w-5" />} label="Total Reports" value={total} />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Avg Similarity" value={`${avgSim}%`} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="High-Risk" value={highRisk} tone="rose" />
        <Stat icon={<Sparkles className="h-5 w-5" />} label="AI-Generated" value={aiReports} tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Similarity Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="band" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>{dist.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">AI vs Human (avg)</CardTitle></CardHeader>
          <CardContent>
            {total ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={aiPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    <Cell fill="#8b5cf6" /><Cell fill="#10b981" />
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[240px] grid place-items-center text-slate-400 text-sm">No reports yet</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Monthly Submission Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip />
                <Line type="monotone" dataKey="count" stroke="#9810fa" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Department Performance</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Reports</TableHead><TableHead>Avg Similarity</TableHead></TableRow></TableHeader>
              <TableBody>
                {deptPerf.map((d) => (<TableRow key={d.dept}><TableCell className="font-medium text-slate-800">{d.dept}</TableCell><TableCell>{d.count}</TableCell><TableCell>{d.avg}%</TableCell></TableRow>))}
                {deptPerf.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-6">No data yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "rose" }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`h-10 w-10 rounded-lg grid place-items-center ${tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-[#9810fa]"}`}>{icon}</div>
        <div><div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>
      </CardContent>
    </Card>
  );
}
