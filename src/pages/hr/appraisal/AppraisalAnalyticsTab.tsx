import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie } from "recharts";
import { Users, CheckCircle2, Clock, AlertTriangle, Bell, TrendingUp, Download, Award, TrendingDown } from "lucide-react";
import { Staff } from "@/types";
import { computeCycleAnalytics, AnalyticsScorecard } from "./appraisalAnalytics";

interface Props {
  cards: AnalyticsScorecard[];
  allStaff: Staff[];
  cycleName?: string;
  onExport?: () => void;
}

const BAND_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

export function AppraisalAnalyticsTab({ cards, allStaff, cycleName, onExport }: Props) {
  const a = useMemo(() => computeCycleAnalytics(cards, allStaff), [cards, allStaff]);

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          No active appraisal cycle to analyze yet. Start one with "New Appraisal Cycle" above.
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    { label: "Employees", value: a.totalCount, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "Completed", value: a.gradedCount, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
    { label: "Pending", value: a.pendingCount, icon: Clock, color: "text-amber-600 bg-amber-50" },
    { label: "Overdue", value: a.hasDeadlineData ? a.overdueCount : "—", icon: AlertTriangle, color: "text-rose-600 bg-rose-50" },
    { label: "Avg. Score", value: a.gradedCount ? `${a.avgScore}%` : "—", icon: TrendingUp, color: "text-indigo-600 bg-indigo-50" },
    { label: "Reminders Sent", value: a.remindersSent, icon: Bell, color: "text-sky-600 bg-sky-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">{cycleName || "Current Cycle"} — Analytics</h3>
          <p className="text-xs text-slate-400">Real-time figures from this cycle's actual scorecards.</p>
        </div>
        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export Report
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${k.color}`}>
                <k.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="text-xl font-black text-slate-900">{k.value}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Completion Rate */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completion Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ v: a.gradedCount }, { v: a.pendingCount }]}
                      dataKey="v" innerRadius={30} outerRadius={44} startAngle={90} endAngle={-270}
                      animationDuration={700}
                    >
                      <Cell fill="#9810fa" />
                      <Cell fill="#e2e8f0" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">{a.completionPct}%</p>
                <p className="text-xs text-slate-500">{a.gradedCount} of {a.totalCount} scorecards completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Score Distribution</CardTitle></CardHeader>
          <CardContent>
            {a.gradedCount === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No graded scorecards yet.</p>
            ) : (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.scoreDistribution} layout="vertical" margin={{ left: 8 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={130} fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(152,16,250,0.06)" }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={600}>
                      {a.scoreDistribution.map((_, i) => <Cell key={i} fill={BAND_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Comparison */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Department Comparison</CardTitle></CardHeader>
          <CardContent>
            {a.departmentStats.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No department data available.</p>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.departmentStats.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="department" fontSize={9} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(152,16,250,0.06)" }} formatter={(v: number) => [`${v}%`, "Avg Score"]} />
                    <Bar dataKey="avgScore" radius={[6, 6, 0, 0]} fill="#9810fa" animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reviewer Workload */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reviewer Workload</CardTitle></CardHeader>
          <CardContent>
            {!a.hasReviewerData ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No reviewer assignments for this cycle — reviewer resolution is only available for cycles created via the New Appraisal Cycle wizard.
              </p>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.reviewerWorkload} layout="vertical" margin={{ left: 8 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="reviewer" width={140} fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(152,16,250,0.06)" }} formatter={(v: number) => [v, "Assigned"]} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#4f46e5" animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Performers */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-amber-500" /> Top Performers</CardTitle></CardHeader>
          <CardContent>
            {a.topPerformers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No graded scorecards yet.</p>
            ) : (
              <ul className="space-y-2">
                {a.topPerformers.map((p, i) => (
                  <li key={p.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">{i + 1}</span>
                      <span className="truncate font-semibold text-slate-700">{p.name}</span>
                    </span>
                    <span className="font-bold text-emerald-600 shrink-0">{p.overall}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Improvement Areas */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-rose-500" /> Improvement Areas</CardTitle></CardHeader>
          <CardContent>
            {a.improvementAreas.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No graded scorecards yet.</p>
            ) : (
              <ul className="space-y-2">
                {a.improvementAreas.slice(0, 5).map((k) => (
                  <li key={k.category} className="flex items-center justify-between text-xs">
                    <span className="truncate font-semibold text-slate-700">{k.category}</span>
                    <span className={`font-bold shrink-0 ${k.avgScore < 60 ? "text-rose-600" : k.avgScore < 75 ? "text-amber-600" : "text-emerald-600"}`}>{k.avgScore}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Needs Attention (Principal-focused) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> Needs Attention</CardTitle></CardHeader>
          <CardContent>
            {a.atRiskStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {a.gradedCount === 0 ? "No graded scorecards yet." : "No staff currently below 60%."}
              </p>
            ) : (
              <ul className="space-y-2">
                {a.atRiskStaff.slice(0, 6).map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-xs">
                    <span className="min-w-0">
                      <span className="truncate font-semibold text-slate-700 block">{s.name}</span>
                      <span className="text-[10px] text-slate-400">{s.department}</span>
                    </span>
                    <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-none text-[10px] font-bold shrink-0">{s.overall}%</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
