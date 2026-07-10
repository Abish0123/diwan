import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Users,
  BarChart3,
  Info,
  Sparkles,
  ChevronRight,
  Calendar,
  Download,
  Loader2
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/lib/utils';
import { smartDb } from '@/lib/localDb';
import { useFinancialSettings } from '@/hooks/useFinancialSettings';
import { num, money, monthlySeries, exportCsv } from '@/pages/analytics/analyticsUtils';

interface PredictionProps {
  onBack: () => void;
}

// Assumed monthly growth used to extend real history forward. A clearly-labeled
// statistical assumption — NOT a trained ML model (same approach as the
// Predictive Analytics page).
const GROWTH = 0.04;
const HISTORY_MONTHS = 7;
const FORECAST_MONTHS = 5;

interface SeriesPoint {
  name: string;
  actual?: number;
  predicted?: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Extend a real monthly history with a forward projection at GROWTH per month.
// The projection starts from the last actual value (bridged so the dashed line
// connects), or the history average when the last month is empty.
const buildProjection = (history: { name: string; value: number }[], anchor = new Date()): SeriesPoint[] => {
  const points: SeriesPoint[] = history.map((h, i) => ({
    name: h.name,
    actual: Math.round(h.value),
    // Bridge the dashed projection line to the last actual point.
    ...(i === history.length - 1 ? { predicted: Math.round(h.value) } : {}),
  }));
  const nonZero = history.filter((h) => h.value > 0);
  const base = history.length && history[history.length - 1].value > 0
    ? history[history.length - 1].value
    : nonZero.length
      ? nonZero.reduce((s, h) => s + h.value, 0) / nonZero.length
      : 0;
  for (let i = 1; i <= FORECAST_MONTHS; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    points.push({
      name: MONTH_NAMES[d.getMonth()],
      predicted: Math.round(base * Math.pow(1 + GROWTH, i)),
    });
  }
  return points;
};

export const Predictions: React.FC<PredictionProps> = ({ onBack }) => {
  const [activeCategory, setActiveCategory] = useState('fees');
  const [loading, setLoading] = useState(true);
  const { settings } = useFinancialSettings();
  const [data, setData] = useState<{ revenue: any[]; entityRevenue: any[]; expenses: any[]; attendance: any[] }>({
    revenue: [], entityRevenue: [], expenses: [], attendance: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const [revenue, entityRevenue, expenses, attendance] = await Promise.all([
          smartDb.getAll('student_revenue'),
          smartDb.getAll('entity_revenue'),
          smartDb.getAll('expenses'),
          smartDb.getAll('attendance'),
        ]);
        setData({
          revenue: revenue || [], entityRevenue: entityRevenue || [],
          expenses: expenses || [], attendance: attendance || [],
        });
      } catch (e) {
        console.error('Predictions load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = [
    { id: 'fees', label: 'Fees', icon: Wallet, color: 'purple' },
    { id: 'attendance', label: 'Attendance', icon: Users, color: 'blue' },
    { id: 'expenses', label: 'Expenses', icon: BarChart3, color: 'red' },
  ];

  // ---- Real monthly histories ----
  const revenueHistory = useMemo(() => monthlySeries(
    [...data.revenue, ...data.entityRevenue],
    (r: any) => r.date || r.createdAt,
    (r: any) => r.amount,
    HISTORY_MONTHS,
  ), [data.revenue, data.entityRevenue]);

  const expenseHistory = useMemo(() => monthlySeries(
    data.expenses,
    (r: any) => r.date || r.createdAt,
    (r: any) => r.amount,
    HISTORY_MONTHS,
  ), [data.expenses]);

  // Attendance rate % per month from real Present/Late/Absent marks.
  const attendanceHistory = useMemo(() => {
    const buckets: { name: string; score: number; total: number; key: string }[] = [];
    const index = new Map<string, number>();
    const anchor = new Date();
    for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      index.set(key, buckets.length);
      buckets.push({ name: MONTH_NAMES[d.getMonth()], score: 0, total: 0, key });
    }
    for (const r of data.attendance) {
      if (r.entityType !== 'student' || !r.date) continue;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) continue;
      const idx = index.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx === undefined) continue;
      buckets[idx].total += 1;
      if (r.status === 'Present') buckets[idx].score += 1;
      else if (r.status === 'Late') buckets[idx].score += 0.5;
    }
    return buckets.map((b) => ({
      name: b.name,
      value: b.total > 0 ? Math.round((b.score / b.total) * 100) : 0,
    }));
  }, [data.attendance]);

  const isMoney = activeCategory !== 'attendance';
  const activeHistory =
    activeCategory === 'fees' ? revenueHistory :
    activeCategory === 'expenses' ? expenseHistory :
    attendanceHistory;
  const hasData = activeHistory.some((h) => h.value > 0);

  const chartData = useMemo(() => {
    if (activeCategory === 'attendance') {
      // A growth assumption makes no sense for a percentage — project the
      // recent non-zero average forward, capped at 100.
      const nonZero = attendanceHistory.filter((h) => h.value > 0);
      const avg = nonZero.length ? nonZero.reduce((s, h) => s + h.value, 0) / nonZero.length : 0;
      const points: SeriesPoint[] = attendanceHistory.map((h, i) => ({
        name: h.name,
        actual: h.value,
        ...(i === attendanceHistory.length - 1 ? { predicted: h.value } : {}),
      }));
      const anchor = new Date();
      for (let i = 1; i <= FORECAST_MONTHS; i++) {
        const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
        points.push({ name: MONTH_NAMES[d.getMonth()], predicted: Math.min(100, Math.round(avg)) });
      }
      return points;
    }
    return buildProjection(activeHistory);
  }, [activeCategory, activeHistory, attendanceHistory]);

  const fmt = (v: number) => (isMoney ? money(v, settings.currency) : `${v}%`);

  const summary = useMemo(() => {
    const dataPoints = activeHistory.filter((h) => h.value > 0).length;
    const lastActual = activeHistory.length ? activeHistory[activeHistory.length - 1].value : 0;
    const firstProjected = chartData.find((p) => p.actual === undefined && p.predicted !== undefined)?.predicted ?? 0;
    switch (activeCategory) {
      case 'fees': return {
        title: 'Fee Collection Forecast',
        text: dataPoints
          ? `Based on ${dataPoints} month${dataPoints === 1 ? '' : 's'} of real revenue records, next month projects to ${fmt(firstProjected)} (assumes ${GROWTH * 100}% monthly growth from ${fmt(lastActual)}).`
          : 'No revenue records yet — the forecast will populate once fee collections are recorded.',
        dataPoints,
        basis: `${GROWTH * 100}% growth assumption`,
      };
      case 'attendance': return {
        title: 'Attendance Forecast',
        text: dataPoints
          ? `Based on ${dataPoints} month${dataPoints === 1 ? '' : 's'} of real attendance marks, attendance is projected to hold near ${fmt(firstProjected)} (recent average carried forward).`
          : 'No attendance records yet — the forecast will populate once attendance is marked.',
        dataPoints,
        basis: 'Recent average',
      };
      case 'expenses': return {
        title: 'Expense Forecast',
        text: dataPoints
          ? `Based on ${dataPoints} month${dataPoints === 1 ? '' : 's'} of real expense records, next month projects to ${fmt(firstProjected)} (assumes ${GROWTH * 100}% monthly growth from ${fmt(lastActual)}).`
          : 'No expense records yet — the forecast will populate once expenses are recorded.',
        dataPoints,
        basis: `${GROWTH * 100}% growth assumption`,
      };
      default: return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeHistory, chartData, settings.currency]);

  const forecastRange = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + FORECAST_MONTHS, 1);
    const label = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    return `${label(from)} - ${label(to)}`;
  }, []);

  const handleDownload = () => {
    exportCsv(`ai-predictions-${activeCategory}`, chartData.map((p) => ({
      month: p.name,
      actual: p.actual ?? '',
      projected: p.predicted ?? '',
      basis: p.actual !== undefined ? 'Actual (live data)' : `Projection (assumes ${GROWTH * 100}% growth)`,
    })));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm font-medium">Loading live data…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left Sidebar: Categories */}
      <div className="w-full lg:w-64 space-y-2">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 px-2">Categories</h3>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "w-full flex items-center justify-between p-4 rounded-2xl transition-all group",
              activeCategory === cat.id
                ? "bg-white border border-purple-200 shadow-lg shadow-purple-500/5 text-purple-600"
                : "bg-transparent text-slate-500 hover:bg-slate-50 border border-transparent"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                activeCategory === cat.id ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
              )}>
                <cat.icon className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm">{cat.label}</span>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 transition-opacity",
              activeCategory === cat.id ? "opacity-100" : "opacity-0"
            )} />
          </button>
        ))}

        <div className="mt-8 p-6 rounded-[24px] bg-slate-900 text-white">
          <Info className="w-6 h-6 mb-4 text-purple-400" />
          <h4 className="text-sm font-bold mb-2 uppercase tracking-wider">How it works</h4>
          <p className="text-xs opacity-70 leading-relaxed">
            Actuals come straight from your live records. Projections extend them forward with an
            assumed {GROWTH * 100}% monthly growth — a statistical assumption, not a trained ML model.
          </p>
        </div>
      </div>

      {/* Main Content: Chart & Summary */}
      <div className="flex-1 space-y-8">
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{summary?.title}</h2>
              <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                <Calendar className="w-4 h-4" />
                <span>Forecast for {forecastRange}</span>
              </div>
            </div>

            <button
              onClick={handleDownload}
              title="Download series as CSV"
              className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          {!hasData ? (
            <div className="h-[320px] w-full flex flex-col items-center justify-center text-center gap-3">
              <Sparkles className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-500">Not enough data yet for a forecast</p>
              <p className="text-xs text-slate-400 max-w-sm">
                This category has no records in the last {HISTORY_MONTHS} months.
                Projections only appear once real data exists.
              </p>
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d12386" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#d12386" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    dx={-10}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      fmt(value),
                      name === 'actual' ? 'Actual (live data)' : `Projection (assumes ${GROWTH * 100}% growth)`,
                    ]}
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      padding: '12px'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorActual)"
                    dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="predicted"
                    stroke="#d12386"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    fillOpacity={1}
                    fill="url(#colorPredicted)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center gap-6 mt-8 pt-8 border-t border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-600" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Actual (Live Data)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-pink-500 border-2 border-dashed border-white" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Projection (assumes {GROWTH * 100}% growth)
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Forecast Summary</span>
            </div>
            <p className="text-lg font-bold text-slate-900 mb-2 leading-tight">
              {summary?.text}
            </p>
            <div className="flex items-center gap-4 mt-6">
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Points</p>
                <p className="text-sm font-bold text-slate-900">{summary?.dataPoints ?? 0} month{summary?.dataPoints === 1 ? '' : 's'}</p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Basis</p>
                <p className="text-sm font-bold text-slate-900">{summary?.basis}</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-purple-50 rounded-full opacity-50 pointer-events-none" />
        </div>
      </div>
    </div>
  );
};
