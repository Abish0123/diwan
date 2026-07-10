import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  Clock,
  Filter,
  School,
  Users,
  Wallet,
  Calendar,
  ArrowRight,
  Bell,
  Sparkles,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { smartDb } from '@/lib/localDb';
import { useFinancialSettings } from '@/hooks/useFinancialSettings';
import { num, money } from '@/pages/analytics/analyticsUtils';

interface Insight {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  type: 'academic' | 'finance' | 'attendance' | 'hr';
  trend: 'up' | 'down' | 'stable';
  value: string;
  date: string;
}

interface SmartInsightsProps {
  onBack: () => void;
}

// Derive the grade label from an attendance row's class ("Grade 5-B" -> "Grade 5")
// or from a student record.
const gradeOf = (raw: unknown): string => {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  return str.split('-')[0].trim();
};

// Compute real insight cards from live tables — students, attendance marks and
// invoices. Every card is backed by actual rows; when a signal's underlying
// data doesn't exist, the card simply isn't emitted.
const buildInsights = (
  students: any[],
  attendance: any[],
  invoices: any[],
  currency: string
): Insight[] => {
  const out: Insight[] = [];
  const today = 'Live data';

  // ---- Attendance signals (from real attendance rows: Present/Late/Absent) ----
  const studentRows = attendance.filter((r) => r.entityType === 'student');
  if (studentRows.length > 0) {
    // Per-student attendance %: Present=1, Late=0.5, Absent=0.
    const perStudent = new Map<string, { score: number; total: number; grade: string }>();
    for (const r of studentRows) {
      const id = String(r.entityId || '');
      if (!id) continue;
      const agg = perStudent.get(id) || { score: 0, total: 0, grade: gradeOf(r.class) };
      agg.total += 1;
      if (r.status === 'Present') agg.score += 1;
      else if (r.status === 'Late') agg.score += 0.5;
      perStudent.set(id, agg);
    }

    // Grade with the lowest average attendance.
    const byGrade = new Map<string, { sum: number; count: number }>();
    for (const agg of perStudent.values()) {
      if (!agg.grade || agg.total === 0) continue;
      const g = byGrade.get(agg.grade) || { sum: 0, count: 0 };
      g.sum += (agg.score / agg.total) * 100;
      g.count += 1;
      byGrade.set(agg.grade, g);
    }
    let worstGrade = '';
    let worstPct = 101;
    for (const [g, v] of byGrade.entries()) {
      const pct = v.sum / v.count;
      if (pct < worstPct) { worstPct = pct; worstGrade = g; }
    }
    if (worstGrade) {
      const pct = Math.round(worstPct);
      out.push({
        id: 'att-grade',
        title: `Lowest Attendance: ${worstGrade}`,
        description: `${worstGrade} has the lowest average attendance across all grades at ${pct}%, computed from ${studentRows.length} real attendance marks.`,
        impact: pct < 75 ? 'high' : pct < 85 ? 'medium' : 'low',
        type: 'attendance',
        trend: pct < 85 ? 'down' : 'stable',
        value: `${pct}%`,
        date: today,
      });
    }

    // Students below the 75% attendance threshold.
    const below = Array.from(perStudent.values()).filter(
      (a) => a.total > 0 && (a.score / a.total) * 100 < 75
    ).length;
    if (below > 0) {
      out.push({
        id: 'att-below',
        title: `${below} Student${below === 1 ? '' : 's'} Below 75% Attendance`,
        description: `${below} of ${perStudent.size} students with attendance records are below the 75% threshold and may need follow-up.`,
        impact: below >= 10 ? 'high' : 'medium',
        type: 'attendance',
        trend: 'down',
        value: `${below}`,
        date: today,
      });
    }
  }

  // ---- Finance signals (from real invoices) ----
  if (invoices.length > 0) {
    const paid = invoices.filter((i) => String(i.status).toLowerCase() === 'paid').length;
    const rate = Math.round((paid / invoices.length) * 100);
    out.push({
      id: 'fee-rate',
      title: `Fee Collection at ${rate}%`,
      description: `${paid} of ${invoices.length} invoices are fully paid. Collection rate is computed from live invoice statuses.`,
      impact: rate < 70 ? 'high' : rate < 85 ? 'medium' : 'low',
      type: 'finance',
      trend: rate >= 85 ? 'up' : 'down',
      value: `${rate}%`,
      date: today,
    });

    const overdue = invoices.filter((i) => String(i.status).toLowerCase() === 'overdue');
    if (overdue.length > 0) {
      const amount = overdue.reduce((s, i) => s + num(i.amount), 0);
      out.push({
        id: 'fee-overdue',
        title: `${overdue.length} Overdue Invoice${overdue.length === 1 ? '' : 's'}`,
        description: `${money(amount, currency)} is outstanding across ${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}. Consider sending payment reminders.`,
        impact: 'high',
        type: 'finance',
        trend: 'down',
        value: money(amount, currency),
        date: today,
      });
    }
  }

  // ---- Academic risk (students flagged with a high risk score) ----
  if (students.length > 0) {
    const atRisk = students.filter((s) => num(s.riskScore) >= 75);
    if (atRisk.length > 0) {
      out.push({
        id: 'risk-students',
        title: `${atRisk.length} Student${atRisk.length === 1 ? '' : 's'} At High Risk`,
        description: `${atRisk.length} of ${students.length} students have a risk score of 75 or higher and may need academic intervention.`,
        impact: 'high',
        type: 'academic',
        trend: 'down',
        value: `${atRisk.length}`,
        date: today,
      });
    }
  }

  return out;
};

export const SmartInsights: React.FC<SmartInsightsProps> = ({ onBack }) => {
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { settings } = useFinancialSettings();
  const [data, setData] = useState<{ students: any[]; attendance: any[]; invoices: any[] }>({
    students: [], attendance: [], invoices: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const [students, attendance, invoices] = await Promise.all([
          smartDb.getAll('students'),
          smartDb.getAll('attendance'),
          smartDb.getAll('invoices'),
        ]);
        setData({ students: students || [], attendance: attendance || [], invoices: invoices || [] });
      } catch (e) {
        console.error('Error loading insight data:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const insights = useMemo(
    () => buildInsights(data.students, data.attendance, data.invoices, settings.currency),
    [data, settings.currency]
  );

  const filteredInsights = filter === 'all' ? insights : insights.filter(i => i.type === filter);

  // Top Alerts sidebar = the highest-impact live insights.
  const topAlerts = useMemo(() =>
    [...insights]
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.impact] - rank[b.impact];
      })
      .slice(0, 3)
      .map((i) => ({
        title: i.title,
        value: i.value,
        color: i.impact === 'high' ? 'red' : i.impact === 'medium' ? 'amber' : 'emerald',
      })),
    [insights]
  );

  // Recommendation grounded in the strongest live signal.
  const recommendation = useMemo(() => {
    const overdueCount = data.invoices.filter((i) => String(i.status).toLowerCase() === 'overdue').length;
    if (overdueCount > 0) {
      return `Based on live invoice data, we recommend sending automated payment reminders for the ${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'}.`;
    }
    const attInsight = insights.find((i) => i.id === 'att-below');
    if (attInsight) {
      return `Based on live attendance data, we recommend scheduling follow-ups for the ${attInsight.value} student${attInsight.value === '1' ? '' : 's'} below 75% attendance.`;
    }
    if (insights.length > 0) {
      return 'Keep monitoring — no urgent action needed based on current attendance and fee data.';
    }
    return null;
  }, [data.invoices, insights]);

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'academic': return <School className="w-5 h-5" />;
      case 'finance': return <Wallet className="w-5 h-5" />;
      case 'attendance': return <Users className="w-5 h-5" />;
      case 'hr': return <Users className="w-5 h-5" />;
      default: return <BarChart3 className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm font-medium">Analysing live data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 overflow-x-auto pb-2 md:pb-0">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm border",
              filter === 'all'
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"
            )}
          >
            All Insights
          </button>
          {[
            { id: 'academic', label: 'Academic', icon: School },
            { id: 'finance', label: 'Finance', icon: Wallet },
            { id: 'attendance', label: 'Attendance', icon: Users },
            { id: 'hr', label: 'HR', icon: Users }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm border whitespace-nowrap",
                filter === f.id
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"
              )}
            >
              <f.icon className="w-4 h-4" />
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>All Records</span>
          </div>
          <button className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Insights Grid */}
        <div className="flex-1">
          {filteredInsights.length === 0 ? (
            <div className="bg-white p-12 rounded-[24px] border border-slate-200 shadow-sm text-center">
              <Sparkles className="w-10 h-10 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Not enough data yet for insights</h3>
              <p className="text-sm text-slate-500">
                Insights are generated from real attendance marks, invoices and student records.
                Record attendance or generate invoices to see signals here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredInsights.map((insight) => (
                <motion.div
                  key={insight.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                      insight.type === 'finance' ? "bg-red-50 text-red-600" :
                      insight.type === 'academic' ? "bg-blue-50 text-purple-600" :
                      insight.type === 'attendance' ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600"
                    )}>
                      {getTypeIcon(insight.type)}
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                      getImpactColor(insight.impact)
                    )}>
                      {insight.impact} Impact
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                    {insight.title}
                    {insight.trend === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : insight.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    ) : null}
                  </h3>

                  <p className="text-sm text-slate-500 leading-relaxed mb-6">
                    {insight.description}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      {insight.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-purple-600">
                      {insight.value}
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Decorative background element */}
                  <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-slate-50 rounded-full opacity-50 group-hover:scale-110 transition-transform pointer-events-none" />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar: Top Alerts */}
        <div className="w-full lg:w-80 space-y-6">
          <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-600" />
                Top Alerts
              </h3>
            </div>

            {topAlerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No alerts — no data signals yet.</p>
            ) : (
              <div className="space-y-4">
                {topAlerts.map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:border-purple-200 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        alert.color === 'red' ? "bg-red-500" :
                        alert.color === 'amber' ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <span className="text-sm font-medium text-slate-700 truncate">{alert.title}</span>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0",
                      alert.color === 'red' ? "bg-red-100 text-red-700" :
                      alert.color === 'amber' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {alert.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {recommendation && (
            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-6 rounded-[24px] text-white shadow-lg shadow-purple-500/20">
              <Sparkles className="w-8 h-8 mb-4 opacity-80" />
              <h4 className="text-lg font-bold mb-2">AI Recommendation</h4>
              <p className="text-sm opacity-90 leading-relaxed">
                {recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
