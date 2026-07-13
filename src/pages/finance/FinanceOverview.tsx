import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  ArrowUpRight, 
  ArrowDownRight,
  Sparkles,
  Download,
  Calendar,
  CreditCard,
  FileText,
  Landmark,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp
} from "firebase/firestore";
import { db } from "@/firebase";
import { smartDb } from "@/lib/localDb";
import { format } from "date-fns";
import { RecordRevenueDialog } from "@/components/finance/RecordRevenueDialog";
import { RecordExpenseDialog } from "@/components/finance/RecordExpenseDialog";
import { toast } from "sonner";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { generateComprehensiveAiReport } from "@/services/geminiService";
import { useTranslation } from "react-i18next";

interface MonthPoint { name: string; revenue: number; expenses: number; }

interface Transaction {
  id: string;
  source: string;
  student?: string;
  entity?: string;
  category?: string;
  type?: string;
  date?: string;
  status?: string;
  amount?: number;
  createdAt?: Timestamp;
}

const FinanceOverview = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isMockSession } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const statsData = useDashboardStats();
  
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState("Last 30 Days");
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [chartData, setChartData] = useState<MonthPoint[]>([]);
  const [trendData, setTrendData] = useState<{
    revenueChangePct: number | null;
    expensesChangePct: number | null;
    netProfitChangePct: number | null;
  }>({ revenueChangePct: null, expensesChangePct: null, netProfitChangePct: null });

  // Load revenue/expense data through smartDb (works against Firestore or the
  // local/cPanel API) and derive the monthly chart + recent transactions from
  // real records instead of hardcoded numbers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTransactions(true);
      try {
        const [sr, er, ex, pay] = (await Promise.all([
          smartDb.getAll("student_revenue"),
          smartDb.getAll("entity_revenue"),
          smartDb.getAll("expenses"),
          smartDb.getAll("payroll"),
        ])) as Transaction[][];
        if (cancelled) return;

        // ----- monthly chart: last 6 months -----
        const now = new Date();
        const months: (MonthPoint & { key: string })[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, name: d.toLocaleString("default", { month: "short" }), revenue: 0, expenses: 0 });
        }
        const idx: Record<string, number> = {};
        months.forEach((m, i) => { idx[m.key] = i; });
        const bucket = (rows: Transaction[], field: "revenue" | "expenses") => rows.forEach((r) => {
          const raw = (r.date as string) || (r.createdAt as unknown as string);
          if (!raw) return;
          const dt = new Date(raw);
          if (isNaN(dt.getTime())) return;
          const key = `${dt.getFullYear()}-${dt.getMonth()}`;
          if (key in idx) months[idx[key]][field] += Number((r.amount ?? (r as Record<string, unknown>).netSalary) ?? 0) || 0;
        });
        bucket([...sr, ...er], "revenue");
        bucket([...ex, ...pay], "expenses");
        setChartData(months.map(({ name, revenue, expenses }) => ({ name, revenue, expenses })));

        // ----- real month-over-month trend: this month vs last month -----
        const pctChange = (curr: number, prev: number): number | null => {
          if (prev === 0) return curr === 0 ? 0 : null; // "New" territory, can't compute a %
          return ((curr - prev) / Math.abs(prev)) * 100;
        };
        const thisMonth = months[months.length - 1];
        const lastMonth = months[months.length - 2];
        const thisNet = thisMonth.revenue - thisMonth.expenses;
        const lastNet = lastMonth.revenue - lastMonth.expenses;
        setTrendData({
          revenueChangePct: pctChange(thisMonth.revenue, lastMonth.revenue),
          expensesChangePct: pctChange(thisMonth.expenses, lastMonth.expenses),
          netProfitChangePct: pctChange(thisNet, lastNet),
        });

        // ----- recent transactions: newest 5 across revenue + expenses -----
        const tagged: Transaction[] = [
          ...sr.map((r) => ({ ...r, source: "student_revenue" })),
          ...er.map((r) => ({ ...r, source: "entity_revenue" })),
          ...ex.map((r) => ({ ...r, source: "expenses" })),
        ];
        tagged.sort((a, b) => {
          const da = new Date((a.createdAt as unknown as string) || (a.date as string) || 0).getTime();
          const dbt = new Date((b.createdAt as unknown as string) || (b.date as string) || 0).getTime();
          return dbt - da;
        });
        setRecentTransactions(tagged.slice(0, 5));
      } catch (e) {
        console.error("Finance overview load failed:", e);
      } finally {
        if (!cancelled) setLoadingTransactions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatChange = (pct: number | null) => pct === null ? t('admin.finance.overview.new') : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;

  const DATE_RANGE_KEYS: Record<string, string> = {
    "Last 30 Days": "admin.finance.overview.last30Days",
    "Last 90 Days": "admin.finance.overview.last90Days",
    "This Year": "admin.finance.overview.thisYear",
    "All Time": "admin.finance.overview.allTime",
  };

  const STAT_TITLE_KEYS: Record<string, string> = {
    "Total Revenue": "admin.finance.overview.totalRevenue",
    "Total Expenses": "admin.finance.overview.totalExpenses",
    "Net Profit": "admin.finance.overview.netProfit",
  };

  const stats = useMemo(() => [
    {
      title: "Total Revenue",
      value: `${financialSettings.currency} ${statsData.revenueThisMonth.toLocaleString()}`,
      change: formatChange(trendData.revenueChangePct),
      trend: (trendData.revenueChangePct ?? 0) >= 0 ? "up" : "down",
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Total Expenses",
      value: `${financialSettings.currency} ${statsData.expensesThisMonth.toLocaleString()}`,
      change: formatChange(trendData.expensesChangePct),
      trend: (trendData.expensesChangePct ?? 0) >= 0 ? "up" : "down",
      icon: TrendingDown,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      title: "Net Profit",
      value: `${financialSettings.currency} ${statsData.netProfitThisMonth.toLocaleString()}`,
      change: formatChange(trendData.netProfitChangePct),
      trend: (trendData.netProfitChangePct ?? 0) >= 0 ? "up" : "down",
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-blue-50",
    },
  ], [financialSettings.currency, statsData.revenueThisMonth, statsData.expensesThisMonth, statsData.netProfitThisMonth, trendData]);

  const aiInsights = useMemo(() => {
    const insights = [];
    
    if (statsData.overdueInvoicesCount > 0) {
      insights.push({
        title: "Overdue Fees",
        titleKey: "admin.finance.overview.insightOverdueFeesTitle",
        description: t('admin.finance.overview.insightOverdueFeesDesc', { count: statsData.overdueInvoicesCount, currency: financialSettings.currency, amount: statsData.pendingFees.toLocaleString() }),
        icon: AlertCircle,
        color: "text-rose-600",
        action: "Send Reminders",
        actionKey: "admin.finance.overview.sendReminders",
        onClick: () => navigate('/finance/fees')
      });
    }

    if (statsData.collectionRate < 80) {
      insights.push({
        title: "Collection Rate Low",
        titleKey: "admin.finance.overview.insightCollectionLowTitle",
        description: t('admin.finance.overview.insightCollectionLowDesc', { rate: statsData.collectionRate }),
        icon: TrendingDown,
        color: "text-orange-600",
        action: "Review Invoices",
        actionKey: "admin.finance.overview.reviewInvoices",
        onClick: () => navigate('/finance/transactions')
      });
    } else {
      insights.push({
        title: "Healthy Collection",
        titleKey: "admin.finance.overview.insightHealthyCollectionTitle",
        description: t('admin.finance.overview.insightHealthyCollectionDesc', { rate: statsData.collectionRate }),
        icon: CheckCircle2,
        color: "text-emerald-600",
        action: "View Report",
        actionKey: "admin.finance.overview.viewReport",
        onClick: () => navigate('/finance/statements')
      });
    }

    if (statsData.netProfitThisMonth > 0) {
      insights.push({
        title: "Profit Target",
        titleKey: "admin.finance.overview.insightProfitTargetTitle",
        description: t('admin.finance.overview.insightProfitTargetDesc'),
        icon: TrendingUp,
        color: "text-purple-600",
        action: "View Statements",
        actionKey: "admin.finance.overview.viewStatements",
        onClick: () => navigate('/finance/statements')
      });
    }

    return insights;
  }, [statsData, financialSettings, navigate, t]);

  const handleExport = () => {
    if (!statsData.revenueThisMonth && !statsData.pendingFees) {
      toast.error(t('admin.finance.overview.noDataToExport'));
      return;
    }

    const csvContent = [
      [t('admin.finance.overview.csvMetric'), t('admin.finance.overview.csvValue')],
      [t('admin.finance.overview.totalRevenue'), `${financialSettings.currency}${statsData.revenueThisMonth.toLocaleString()}`],
      [t('admin.finance.overview.csvPendingFees'), `${financialSettings.currency}${statsData.pendingFees.toLocaleString()}`],
      [t('admin.finance.overview.csvCollectionRate'), `${statsData.collectionRate}%`],
      [t('admin.finance.overview.csvOverdueInvoices'), statsData.overdueInvoicesCount],
      [t('admin.finance.overview.csvExportDate'), new Date().toLocaleString()]
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `finance_overview_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(t('admin.finance.overview.exportSuccess'));
  };

  const handleGenerateReport = async () => {
    toast.loading(t('admin.finance.overview.generatingReport'), { id: "finance-report" });
    
    try {
      const report = await generateComprehensiveAiReport(
        chartData.map(d => ({ name: d.name, score: d.revenue })), // Reusing PerformanceData structure for revenue
        chartData.map(d => ({ month: d.name, rate: d.revenue + d.expenses > 0 ? (d.revenue / (d.revenue + d.expenses)) * 100 : 0 })),
        [{ name: "Collection Rate", value: statsData.collectionRate }]
      );
      
      // For now, we'll display it in the console and prompt to print, 
      // in a real app we'd open a modal with the Markdown
      console.log("AI Generated Report:", report);
      toast.success(t('admin.finance.overview.reportGenerated'), { id: "finance-report" });

      // Open a simple window with the report
      const reportWindow = window.open('', '_blank');
      if (reportWindow) {
        reportWindow.document.write(`
          <html>
            <head>
              <title>${t('admin.finance.overview.aiReportWindowTitle')}</title>
              <style>
                body { font-family: sans-serif; padding: 40px; line-height: 1.6; color: #1e293b; }
                h1 { color: #7c3aed; }
                pre { white-space: pre-wrap; background: #f8fafc; padding: 20px; border-radius: 12px; }
              </style>
            </head>
            <body>
              <h1>${t('admin.finance.overview.aiReportWindowTitle')}</h1>
              <pre>${report}</pre>
              <button onclick="window.print()">${t('admin.finance.overview.printReport')}</button>
            </body>
          </html>
        `);
      }
    } catch (error) {
      toast.error(t('admin.finance.overview.reportFailed'), { id: "finance-report" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.finance.overview.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.finance.overview.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <Calendar className="me-2 h-4 w-4" />
                  {t(DATE_RANGE_KEYS[dateRange] || dateRange)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                {["Last 30 Days", "Last 90 Days", "This Year", "All Time"].map((range) => (
                  <DropdownMenuItem
                    key={range}
                    onClick={() => {
                      setDateRange(range);
                      toast.info(t('admin.finance.overview.filteringDataFor', { range: t(DATE_RANGE_KEYS[range] || range) }));
                    }}
                    className="rounded-lg"
                  >
                    {t(DATE_RANGE_KEYS[range] || range)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={handleExport} className="rounded-xl">
              <Download className="me-2 h-4 w-4" />
              {t('admin.finance.overview.export')}
            </Button>
            <Button size="sm" className="gradient-primary rounded-xl" onClick={handleGenerateReport}>
              <Sparkles className="me-2 h-4 w-4" />
              {t('admin.finance.overview.generateReport')}
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {statsData.loading ? (
            Array(3).fill(0).map((_, i) => (
              <Card key={i} className="overflow-hidden border-none shadow-sm animate-pulse">
                <CardContent className="p-6 h-32 bg-slate-100" />
              </Card>
            ))
          ) : (
            stats.map((stat) => (
              <Card key={stat.title} className="overflow-hidden border-none shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl ${stat.bg}`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <Badge variant="secondary" className={`rounded-full ${
                      stat.trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {stat.trend === 'up' ? <ArrowUpRight className="me-1 h-3 w-3" /> : <ArrowDownRight className="me-1 h-3 w-3" />}
                      {stat.change}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium text-muted-foreground">{t(STAT_TITLE_KEYS[stat.title] || stat.title)}</p>
                    <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          {/* Revenue vs Expense Chart */}
          <Card className="md:col-span-8 border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">{t('admin.finance.overview.revenueVsExpenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#8B5CF6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expenses" 
                      stroke="#F43F5E" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorExpenses)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights Panel */}
          <Card className="md:col-span-4 border-none shadow-sm bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('admin.finance.overview.aiInsights')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnimatePresence mode="popLayout">
                {aiInsights.map((insight, index) => (
                  <motion.div 
                    key={insight.title}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 rounded-xl bg-white border border-primary/10 shadow-sm group hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg bg-slate-50 group-hover:bg-primary/5 transition-colors`}>
                        <insight.icon className={`h-4 w-4 ${insight.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{t(insight.titleKey)}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {insight.description}
                        </p>
                        <Button
                          variant="link"
                          className="p-0 h-auto text-xs mt-2 text-primary font-bold hover:no-underline flex items-center gap-1 group/btn"
                          onClick={insight.onClick}
                        >
                          {t(insight.actionKey)}
                          <ChevronRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform rtl:rotate-180" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {aiInsights.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center mb-3">
                    <Info className="h-6 w-6 text-primary/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('admin.finance.overview.noInsights')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-4">
          <Button 
            variant="outline" 
            className="h-24 flex-col gap-2 rounded-2xl border-dashed hover:border-primary hover:bg-primary/5"
            onClick={() => setRevenueDialogOpen(true)}
          >
            <CreditCard className="h-6 w-6 text-primary" />
            <span>{t('admin.finance.overview.collectFees')}</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-24 flex-col gap-2 rounded-2xl border-dashed hover:border-primary hover:bg-primary/5"
            onClick={() => setExpenseDialogOpen(true)}
          >
            <TrendingDown className="h-6 w-6 text-rose-500" />
            <span>{t('admin.finance.overview.recordExpense')}</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 rounded-2xl border-dashed hover:border-primary hover:bg-primary/5"
            onClick={() => navigate("/finance/fees")}
          >
            <FileText className="h-6 w-6 text-blue-500" />
            <span>{t('admin.finance.overview.generateInvoice')}</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-24 flex-col gap-2 rounded-2xl border-dashed hover:border-primary hover:bg-primary/5"
            onClick={() => navigate("/finance/reconciliation")}
          >
            <Landmark className="h-6 w-6 text-emerald-500" />
            <span>{t('admin.finance.overview.reconcileBank')}</span>
          </Button>
        </div>

        {/* Recent Transactions */}
        <Card className="border-none shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">{t('admin.finance.overview.recentTransactions')}</CardTitle>
              <CardDescription className="text-xs">{t('admin.finance.overview.recentTransactionsSubtitle')}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary font-bold text-xs uppercase tracking-widest"
              onClick={() => navigate("/finance/transactions")}
            >
              {t('admin.finance.overview.viewAll')} <ChevronRight className="h-4 w-4 ms-1 rtl:rotate-180" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50/50 border-y border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('admin.finance.overview.colEntityStudent')}</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('admin.finance.overview.colCategory')}</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('admin.finance.overview.colDate')}</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('admin.finance.overview.colStatus')}</th>
                    <th className="px-6 py-3 text-end text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('admin.finance.overview.colAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingTransactions ? (
                    Array(3).fill(0).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="h-4 bg-slate-100 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : recentTransactions.length > 0 ? (
                    recentTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center",
                              tx.source === "expenses" ? "bg-rose-50" : "bg-emerald-50"
                            )}>
                              {tx.source === "expenses" ? (
                                <ArrowUpRight className="h-4 w-4 text-rose-600" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-emerald-600" />
                              )}
                            </div>
                            <span className="font-bold text-slate-900">{tx.student || tx.entity || t('admin.finance.overview.unknown')}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-600 border-none text-[10px] font-bold uppercase tracking-widest">
                            {tx.category || tx.type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground font-medium">
                          {tx.date ? format(new Date(tx.date), "MMM dd, yyyy") : t('admin.finance.overview.notAvailable')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              tx.status === "Paid" || tx.status === "Received" || tx.status === "Processed" ? "bg-emerald-500" : 
                              tx.status === "Pending" ? "bg-orange-500" : "bg-rose-500"
                            )} />
                            <span className="text-xs font-bold text-slate-700">{tx.status}</span>
                          </div>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-end font-black",
                          tx.source === "expenses" ? "text-rose-600" : "text-emerald-600"
                        )}>
                          {tx.source === "expenses" ? "-" : "+"}{financialSettings.currency} {tx.amount?.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
                            <Info className="h-6 w-6 text-slate-300" />
                          </div>
                          <p className="text-sm font-bold text-slate-400">{t('admin.finance.overview.noTransactionsFound')}</p>
                          <p className="text-xs text-muted-foreground">{t('admin.finance.overview.noTransactionsHint')}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Dialogs */}
        <RecordRevenueDialog 
          open={revenueDialogOpen} 
          onOpenChange={setRevenueDialogOpen} 
          type="student" 
        />
        <RecordExpenseDialog
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          type="expenses"
        />
      </div>
    </DashboardLayout>
  );
};

export default FinanceOverview;
