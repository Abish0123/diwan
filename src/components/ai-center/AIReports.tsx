import React, { useState, useEffect } from 'react';
import { smartDb } from '@/lib/localDb';
import { motion } from 'motion/react';
import { 
  FileText, 
  Download, 
  Share2, 
  Calendar, 
  Sparkles, 
  ChevronRight, 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowRight,
  Eye,
  MoreVertical,
  Search,
  Filter,
  Plus
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart as RePieChart,
  Pie
} from 'recharts';
import { cn } from '@/lib/utils';

interface AIReportsProps {
  onBack: () => void;
}

export const AIReports: React.FC<AIReportsProps> = ({ onBack }) => {
  const [activeReport, setActiveReport] = useState('academic');
  const [barData, setBarData] = useState<{ name: string; score: number }[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [avgAttendance, setAvgAttendance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // Real per-grade average score, computed from ExamMark rows (id: examId,
  // [subject]: { [studentId]: number }) joined against each student's grade
  // — replaces a hardcoded Grade 6-12 85/78/92/88/74/81/89 stub.
  useEffect(() => {
    (async () => {
      try {
        const [students, marks] = await Promise.all([
          smartDb.getAll('students'),
          smartDb.getAll('ExamMark'),
        ]);
        const gradeById = new Map((students || []).map((s: any) => [String(s.id), String(s.grade || s.classId || 'Unknown')]));
        const gradeTotals = new Map<string, { sum: number; count: number }>();
        const studentTotals = new Map<string, { sum: number; count: number }>();
        for (const row of (marks || []) as Record<string, unknown>[]) {
          for (const [key, val] of Object.entries(row)) {
            if (['id', 'uid', 'createdAt', 'updatedAt'].includes(key)) continue;
            if (!val || typeof val !== 'object') continue;
            for (const [studentId, mark] of Object.entries(val as Record<string, unknown>)) {
              const n = Number(mark);
              if (!Number.isFinite(n)) continue;
              const grade = gradeById.get(studentId) || 'Unknown';
              const g = gradeTotals.get(grade) || { sum: 0, count: 0 };
              g.sum += n; g.count += 1;
              gradeTotals.set(grade, g);
              const st = studentTotals.get(studentId) || { sum: 0, count: 0 };
              st.sum += n; st.count += 1;
              studentTotals.set(studentId, st);
            }
          }
        }
        const bars = Array.from(gradeTotals.entries())
          .map(([name, { sum, count }]) => ({ name, score: count > 0 ? Math.round(sum / count) : 0 }))
          .filter(b => b.score > 0)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setBarData(bars);

        // Real performance distribution — bucket each student's own average
        // mark, not a fabricated 35/45/15/5% split.
        const buckets = { Excellent: 0, Good: 0, Average: 0, 'Below Avg': 0 };
        for (const { sum, count } of studentTotals.values()) {
          const avg = count > 0 ? sum / count : 0;
          if (avg >= 90) buckets.Excellent++;
          else if (avg >= 75) buckets.Good++;
          else if (avg >= 60) buckets.Average++;
          else buckets['Below Avg']++;
        }
        const totalGraded = Object.values(buckets).reduce((a, b) => a + b, 0);
        const colors: Record<string, string> = { Excellent: '#9810fa', Good: '#d12386', Average: '#F59E0B', 'Below Avg': '#EF4444' };
        setPieData(
          totalGraded > 0
            ? Object.entries(buckets).map(([name, count]) => ({ name, value: Math.round((count / totalGraded) * 100), color: colors[name] }))
            : []
        );

        const allScores = Array.from(studentTotals.values());
        setAvgScore(allScores.length > 0 ? Math.round(allScores.reduce((s, x) => s + x.sum / x.count, 0) / allScores.length) : null);

        const attVals = (students || []).map((s: any) => Number(s.attendance)).filter((n: number) => Number.isFinite(n));
        setAvgAttendance(attVals.length > 0 ? Math.round((attVals.reduce((a: number, b: number) => a + b, 0) / attVals.length) * 10) / 10 : null);
      } catch (e) {
        console.error('Error loading AI report data:', e);
      } finally {
        setLoaded(true);
        setLoadedAt(new Date());
      }
    })();
  }, []);

  const reportTypes = [
    { id: 'academic', label: 'Academic Performance', icon: BarChart3 },
    { id: 'finance', label: 'Finance Summary', icon: TrendingUp },
    { id: 'hr', label: 'HR & Staffing', icon: PieChart },
    { id: 'custom', label: 'Custom Reports', icon: FileText }
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left Sidebar: Report Types */}
      <div className="w-full lg:w-72 space-y-6">
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Report Types</h3>
          </div>
          
          <div className="space-y-2">
            {reportTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setActiveReport(type.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                  activeReport === type.id 
                    ? "bg-purple-50 text-[#9810fa] border border-purple-100" 
                    : "bg-transparent text-slate-500 hover:bg-slate-100 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    activeReport === type.id ? "bg-[#9810fa] text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                  )}>
                    <type.icon className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-xs">{type.label}</span>
                </div>
                <ChevronRight className={cn(
                  "w-3.5 h-3.5 transition-opacity",
                  activeReport === type.id ? "opacity-100" : "opacity-0"
                )} />
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Recent Reports</h3>
          {/* No report-generation/history log exists yet in this app — an
              honest empty state instead of a fabricated report list. */}
          <p className="text-xs text-slate-400">No reports generated yet. Reports you export will appear here.</p>
        </div>
      </div>

      {/* Main Content: Report Preview */}
      <div className="flex-1 space-y-8">
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="px-2.5 py-1 rounded-full bg-purple-100 text-[#9810fa] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI Generated
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {loadedAt ? `Last updated: ${loadedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${loadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Loading…"}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Student Performance Report</h2>
              <p className="text-sm text-slate-500 mt-1">Overall performance analysis for the past term across all grades.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-primary text-white text-sm font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50"
                disabled={barData.length === 0}
                onClick={() => {
                  const lines = [
                    "metric,value",
                    `Average Score,${avgScore ?? ""}`,
                    `Average Attendance,${avgAttendance ?? ""}`,
                    ...barData.map(b => `${b.name} Average Score,${b.score}`),
                    ...pieData.map(p => `${p.name} %,${p.value}`),
                  ].join("\n");
                  const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `academic-report-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                }}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Report Summary — built entirely from the real barData/avgScore/
              avgAttendance computed above, no fabricated percentages or
              cohort claims (there's no prior-term snapshot to compare
              against, so this deliberately doesn't claim a trend). */}
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 mb-10">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Executive Summary
            </h3>
            {!loaded ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : barData.length === 0 ? (
              <p className="text-sm text-slate-400">No exam marks on file yet — this summary will populate once marks are entered.</p>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                {avgScore !== null && (
                  <>Current overall average score across all graded exams is <span className="font-bold text-[#9810fa]">{avgScore}%</span>. </>
                )}
                {(() => {
                  const sorted = [...barData].sort((a, b) => b.score - a.score);
                  const top = sorted[0];
                  const bottom = sorted[sorted.length - 1];
                  if (!top || !bottom || top.name === bottom.name) return null;
                  return <>{top.name} has the highest average ({top.score}%), while {bottom.name} has the lowest ({bottom.score}%) and may need targeted support. </>;
                })()}
                {avgAttendance !== null && (
                  <>Average attendance across the student roster is <span className="font-bold">{avgAttendance}%</span>.</>
                )}
              </p>
            )}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Average Scores by Grade</h4>
              <div className="h-[240px] w-full bg-slate-50/30 rounded-2xl p-4 border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.score < 80 ? '#F59E0B' : '#9810fa'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Performance Distribution</h4>
              <div className="h-[240px] w-full bg-slate-50/30 rounded-2xl p-4 border border-slate-100 flex items-center">
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-32 space-y-2">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[10px] font-medium text-slate-500">{item.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-700">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Insights & Recommendations — derived from the real barData/
              pieData computed above, not fabricated cards. Only shows a
              card when there's real data behind it. */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Insights & Recommendations</h4>
            {barData.length === 0 ? (
              <p className="text-xs text-slate-400">Not enough exam data yet to generate insights.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const sorted = [...barData].sort((a, b) => a.score - b.score);
                  const lowest = sorted[0];
                  const highest = sorted[sorted.length - 1];
                  const belowAvgPct = pieData.find(p => p.name === 'Below Avg')?.value ?? 0;
                  const items: { title: string; text: string; icon: typeof AlertCircle; color: string }[] = [];
                  if (lowest && lowest.name !== highest?.name) {
                    items.push({ title: `Focus on ${lowest.name}`, text: `Lowest average score at ${lowest.score}%. Consider targeted support.`, icon: AlertCircle, color: 'amber' });
                  }
                  if (highest && highest.name !== lowest?.name) {
                    items.push({ title: `${highest.name} Leading`, text: `Highest average score at ${highest.score}%.`, icon: CheckCircle2, color: 'emerald' });
                  }
                  if (avgAttendance !== null) {
                    items.push({ title: 'Attendance', text: `Roster-wide average attendance is ${avgAttendance}%.`, icon: TrendingUp, color: 'blue' });
                  }
                  if (belowAvgPct > 0) {
                    items.push({ title: 'Below-Average Students', text: `${belowAvgPct}% of graded students are averaging below 60%.`, icon: BarChart3, color: 'purple' });
                  }
                  return items.map((item, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        item.color === 'amber' ? "bg-amber-50 text-amber-600" :
                        item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                        item.color === 'blue' ? "bg-blue-50 text-purple-600" : "bg-purple-50 text-purple-600"
                      )}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-slate-900 mb-1">{item.title}</h5>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
