import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Download, 
  Printer, 
  Calendar,
  TrendingUp,
  TrendingDown,
  Sparkles,
  FileText,
  ArrowLeft,
  Wallet,
  Scale,
  Activity,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfQuarter, 
  endOfQuarter, 
  startOfYear, 
  endOfYear, 
  isWithinInterval, 
  parseISO,
  format
} from "date-fns";

type Period = "this-month" | "last-month" | "this-quarter" | "this-year";

const FinancialStatements = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("income");
  const { settings: financialSettings } = useFinancialSettings();
  const [isGenerating, setIsGenerating] = useState(false);
  const [period, setPeriod] = useState<Period>("this-month");
  const [loading, setLoading] = useState(true);
  
  const [data, setData] = useState({
    studentRevenue: [] as Record<string, unknown>[],
    entityRevenue: [] as Record<string, unknown>[],
    expenses: [] as Record<string, unknown>[],
    payroll: [] as Record<string, unknown>[],
    assets: [] as Record<string, unknown>[],
    bankTransactions: [] as Record<string, unknown>[]
  });

  const [reportData, setReportData] = useState<{
    generatedAt: string;
    periodName: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Financial statements must aggregate ALL school-wide revenue/expense
        // records, not just whichever ones the current viewer happens to have
        // created — scoping any of these by uid produces an incomplete,
        // materially wrong income statement / balance sheet.
        const [studentRev, entityRev, exp, pay, ass, bank] = await Promise.all([
          smartDb.getAll("StudentRevenue"),
          smartDb.getAll("EntityRevenue"),
          smartDb.getAll("Expense"),
          smartDb.getAll("Payroll"),
          smartDb.getAll("AssetRecord"),
          smartDb.getAll("BankTransaction")
        ]);
        setData({
          studentRevenue: studentRev as Record<string, unknown>[],
          entityRevenue: entityRev as Record<string, unknown>[],
          expenses: exp as Record<string, unknown>[],
          payroll: pay as Record<string, unknown>[],
          assets: ass as Record<string, unknown>[],
          bankTransactions: bank as Record<string, unknown>[]
        });
      } catch (error) {
        console.error("Error fetching financial data:", error);
        toast.error(t("admin.finance.financialStatements.toastLoadFailed"));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);


  // Computes the full statement snapshot for an arbitrary [start, end] window.
  // Factored out so we can run it twice — once for the selected period and
  // once for the immediately-preceding period of equal length — to derive a
  // genuine period-over-period % change instead of a fabricated badge.
  const computeStats = (start: Date, end: Date) => {
    const filterByDateAccrual = (item: Record<string, unknown>) => {
      const dateStr = (item.date || item.purchaseDate) as string | undefined;
      if (!dateStr) return false;
      try {
        const date = parseISO(dateStr);
        return isWithinInterval(date, { start, end });
      } catch {
        return false;
      }
    };

    const filterByDateCash = (item: Record<string, unknown>) => {
      if (item.status === "Pending" || item.status === "Unpaid") return false;
      return filterByDateAccrual(item);
    };

    // 1. INCOME STATEMENT (Accrual Basis - specific period)
    const periodStudentRev = data.studentRevenue.filter(filterByDateAccrual).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const periodEntityRev = data.entityRevenue.filter(filterByDateAccrual).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalRevenue = periodStudentRev + periodEntityRev;

    const periodExpenses = data.expenses.filter(filterByDateAccrual).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const periodPayroll = data.payroll.filter(filterByDateAccrual).reduce((sum, r) => sum + (Number(r.gross || r.net || r.netSalary || r.amount) || 0), 0);
    const totalExpenses = periodExpenses + periodPayroll;
    const netIncome = totalRevenue - totalExpenses;

    // 2. BALANCE SHEET (Cumulative Snapshot up to 'end' date), grounded in the
    // opening balance / capital / bank loan configured in Finance Setup.
    const isPastOrPresent = (item: Record<string, unknown>) => {
      const dateStr = (item.date || item.purchaseDate) as string | undefined;
      if (!dateStr) return false;
      return parseISO(dateStr) <= end;
    };
    // Bank transactions are seeded as Income/Expense in some data and Credit/Debit
    // in others — treat both spellings consistently.
    const isInflow = (r: Record<string, unknown>) => r.type === "Credit" || r.type === "Income";
    const isOutflow = (r: Record<string, unknown>) => r.type === "Debit" || r.type === "Expense";

    const openingBalance = Number(financialSettings.openingBalance) || 0;
    const contributedCapital = Number(financialSettings.initialCapital) || 0;
    const bankLoan = Number(financialSettings.bankLoan) || 0;

    // Cumulative cash position = opening balance + cash received − cash paid.
    const allCashIn =
      data.studentRevenue.filter(r => isPastOrPresent(r) && r.status !== "Pending").reduce((s, r) => s + (Number(r.amount) || 0), 0) +
      data.entityRevenue.filter(r => isPastOrPresent(r) && r.status !== "Pending").reduce((s, r) => s + (Number(r.amount) || 0), 0) +
      data.bankTransactions.filter(r => isPastOrPresent(r) && isInflow(r)).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const allCashOut =
      data.expenses.filter(r => isPastOrPresent(r) && r.status === "Paid").reduce((s, r) => s + (Number(r.amount) || 0), 0) +
      data.payroll.filter(r => isPastOrPresent(r) && (r.status === "Processed" || r.status === "Paid")).reduce((s, r) => s + (Number(r.netSalary || r.net || r.amount) || 0), 0) +
      data.assets.filter(a => isPastOrPresent(a)).reduce((s, a) => s + (Number(a.purchaseValue) || 0), 0) +
      data.bankTransactions.filter(r => isPastOrPresent(r) && isOutflow(r)).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const cash = openingBalance + allCashIn - allCashOut;

    // Fixed Assets (Net Book Value)
    const fixedAssets = data.assets.filter(isPastOrPresent).reduce((sum, a) => sum + (Number(a.currentValue) || 0), 0);
    const totalAssets = cash + fixedAssets;

    // Liabilities = unpaid bills + unpaid payroll + outstanding bank loan.
    const accountsPayable = data.expenses.filter(r => isPastOrPresent(r) && r.status === "Pending").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const pendingPayroll = data.payroll.filter(r => isPastOrPresent(r) && r.status === "Pending").reduce((s, r) => s + (Number(r.netSalary || r.net || r.amount) || 0), 0);
    const totalLiabilities = accountsPayable + pendingPayroll + bankLoan;

    // Equity = contributed capital + retained earnings, where retained earnings is
    // the residual (accumulated earnings since inception). The sheet stays balanced
    // (A = L + E) while being grounded in the configured capital and loans.
    const retainedEarnings = totalAssets - totalLiabilities - contributedCapital;
    const totalEquity = contributedCapital + retainedEarnings;

    // 3. CASH FLOW STATEMENT (Cash Basis - specific period)
    const cashReceivedOps =
      data.studentRevenue.filter(filterByDateCash).reduce((s, r) => s + (Number(r.amount) || 0), 0) +
      data.entityRevenue.filter(filterByDateCash).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const cashPaidOps =
      data.expenses.filter(r => filterByDateCash(r)).reduce((s, r) => s + (Number(r.amount) || 0), 0) +
      data.payroll.filter(r => filterByDateCash(r)).reduce((s, r) => s + (Number(r.netSalary || r.net || r.amount) || 0), 0);

    const operatingCash = cashReceivedOps - cashPaidOps;
    const investingCash = data.assets.filter(filterByDateAccrual).reduce((sum, a) => sum + (Number(a.purchaseValue) || 0), 0) * -1; // Outflow

    // Financing Cash (Bank Transactions specifically mapped to Lending/Equity)
    const financingInflow = data.bankTransactions.filter(filterByDateAccrual).filter(isInflow).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const financingOutflow = data.bankTransactions.filter(filterByDateAccrual).filter(isOutflow).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const financingCash = financingInflow - financingOutflow;

    return {
      totalRevenue,
      totalExpenses,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      cash,
      fixedAssets,
      accountsPayable,
      pendingPayroll,
      bankLoan,
      contributedCapital,
      retainedEarnings,
      operatingCash,
      investingCash,
      financingCash,
      periodStudentRev,
      periodEntityRev,
      periodExpenses,
      periodPayroll,
    };
  };

  // Real period-over-period % change: null means the previous period had a
  // zero base (can't compute a meaningful percentage) — callers should render
  // "New" rather than dividing by zero.
  const pctChange = (curr: number, prev: number): number | null => {
    if (prev === 0) return curr === 0 ? 0 : null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const stats = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;

    switch (period) {
      case "last-month": {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        const twoMonthsAgo = subMonths(now, 2);
        prevStart = startOfMonth(twoMonthsAgo);
        prevEnd = endOfMonth(twoMonthsAgo);
        break;
      }
      case "this-quarter": {
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        const prevQuarterAnchor = subMonths(now, 3);
        prevStart = startOfQuarter(prevQuarterAnchor);
        prevEnd = endOfQuarter(prevQuarterAnchor);
        break;
      }
      case "this-year": {
        start = startOfYear(now);
        end = endOfYear(now);
        const prevYearAnchor = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        prevStart = startOfYear(prevYearAnchor);
        prevEnd = endOfYear(prevYearAnchor);
        break;
      }
      case "this-month":
      default: {
        start = startOfMonth(now);
        end = endOfMonth(now);
        const lastMonth = subMonths(now, 1);
        prevStart = startOfMonth(lastMonth);
        prevEnd = endOfMonth(lastMonth);
        break;
      }
    }

    const current = computeStats(start, end);
    const previous = computeStats(prevStart, prevEnd);

    return {
      ...current,
      changes: {
        totalRevenue: pctChange(current.totalRevenue, previous.totalRevenue),
        totalExpenses: pctChange(current.totalExpenses, previous.totalExpenses),
        netIncome: pctChange(current.netIncome, previous.netIncome),
        totalAssets: pctChange(current.totalAssets, previous.totalAssets),
        totalLiabilities: pctChange(current.totalLiabilities, previous.totalLiabilities),
        totalEquity: pctChange(current.totalEquity, previous.totalEquity),
        operatingCash: pctChange(current.operatingCash, previous.operatingCash),
        investingCash: pctChange(current.investingCash, previous.investingCash),
        financingCash: pctChange(current.financingCash, previous.financingCash),
      },
      periodName: format(start, "MMM yyyy") + (period !== "this-month" && period !== "last-month" ? ` - ${format(end, "MMM yyyy")}` : "")
    };
  }, [data, period, financialSettings]);

  // Real 6-month sparkline series (independent of the period selector) so
  // each KPI card shows an actual trend line instead of one fake array reused
  // everywhere.
  const monthlySparklines = useMemo(() => {
    const now = new Date();
    const months: { start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ start: startOfMonth(d), end: endOfMonth(d) });
    }
    const series = months.map(({ start, end }) => computeStats(start, end));
    const toPoints = (key: keyof ReturnType<typeof computeStats>) =>
      series.map(s => ({ value: s[key] as number }));

    return {
      totalRevenue: toPoints("totalRevenue"),
      totalExpenses: toPoints("totalExpenses"),
      netIncome: toPoints("netIncome"),
      totalAssets: toPoints("totalAssets"),
      totalLiabilities: toPoints("totalLiabilities"),
      totalEquity: toPoints("totalEquity"),
      operatingCash: toPoints("operatingCash"),
      investingCash: toPoints("investingCash"),
      financingCash: toPoints("financingCash"),
    };
  }, [data]);

  // Auto-generate the report view whenever the period changes or data finishes loading
  useEffect(() => {
    if (!loading && stats) {
      setReportData({
        generatedAt: new Date().toLocaleString(),
        periodName: stats.periodName,
        status: t("admin.finance.financialStatements.statusRealTimeSync")
      });
    }
  }, [loading, period, stats.periodName]);

  const handleGenerateReport = () => {
    setIsGenerating(true);
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: t("admin.finance.financialStatements.toastGenerating"),
        success: () => {
          setIsGenerating(false);
          setReportData({
            generatedAt: new Date().toLocaleString(),
            periodName: stats.periodName,
            status: t("admin.finance.financialStatements.statusFinalized")
          });
          return t("admin.finance.financialStatements.toastGenerateSuccess");
        },
        error: t("admin.finance.financialStatements.toastGenerateFailed"),
      }
    );
  };

  const handleExportCSV = () => {
    const currency = financialSettings.currency;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Financial Statement: ${activeTab.toUpperCase()}\n`;
    csvContent += `Period: ${stats.periodName}\n\n`;
    
    if (activeTab === "income") {
      csvContent += "Category,Amount\n";
      csvContent += `Total Revenue,${stats.totalRevenue}\n`;
      csvContent += `Total Expenses,${stats.totalExpenses}\n`;
      csvContent += `Net Income,${stats.netIncome}\n`;
    } else if (activeTab === "balance") {
      csvContent += "Category,Amount\n";
      csvContent += `Total Assets,${stats.totalAssets}\n`;
      csvContent += `Total Liabilities,${stats.totalLiabilities}\n`;
      csvContent += `Total Equity,${stats.totalEquity}\n`;
    } else {
      csvContent += "Category,Amount\n";
      csvContent += `Operating Cash,${stats.operatingCash}\n`;
      csvContent += `Investing Cash,${stats.investingCash}\n`;
      csvContent += `Financing Cash,${stats.financingCash}\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `financial_statement_${activeTab}_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("admin.finance.financialStatements.toastCsvExported"));
  };

  const handlePrint = () => {
    window.print();
  };

  // Formats a real pct-change (or null for "no prior-period base") into the
  // badge string + trend direction used by the KPI cards.
  const formatChange = (pct: number | null): { change: string; trend: "up" | "down" } => {
    if (pct === null) return { change: t("admin.finance.financialStatements.trendNew"), trend: "up" };
    return { change: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, trend: pct >= 0 ? "up" : "down" };
  };

  const getKpis = () => {
    const currency = financialSettings.currency;
    switch (activeTab) {
      case "balance":
        return [
          {
            title: t("admin.finance.financialStatements.kpiTotalAssets"),
            value: `${currency}${stats.totalAssets.toLocaleString()}`,
            ...formatChange(stats.changes.totalAssets),
            icon: Wallet,
            color: "text-blue-500",
            bgColor: "bg-blue-50",
            gradientId: "assetsGradient",
            strokeColor: "#3b82f6",
            sparkline: monthlySparklines.totalAssets
          },
          {
            title: t("admin.finance.financialStatements.kpiTotalLiabilities"),
            value: `${currency}${stats.totalLiabilities.toLocaleString()}`,
            ...formatChange(stats.changes.totalLiabilities),
            icon: Scale,
            color: "text-orange-500",
            bgColor: "bg-orange-50",
            gradientId: "liabilitiesGradient",
            strokeColor: "#f97316",
            sparkline: monthlySparklines.totalLiabilities
          },
          {
            title: t("admin.finance.financialStatements.kpiTotalEquity"),
            value: `${currency}${stats.totalEquity.toLocaleString()}`,
            ...formatChange(stats.changes.totalEquity),
            icon: TrendingUp,
            color: "text-indigo-500",
            bgColor: "bg-indigo-50",
            gradientId: "equityGradient",
            strokeColor: "#6366f1",
            sparkline: monthlySparklines.totalEquity
          }
        ];
      case "cash":
        return [
          {
            title: t("admin.finance.financialStatements.kpiOperatingCash"),
            value: `${currency}${stats.operatingCash.toLocaleString()}`,
            ...formatChange(stats.changes.operatingCash),
            icon: Activity,
            color: "text-cyan-500",
            bgColor: "bg-cyan-50",
            gradientId: "operatingGradient",
            strokeColor: "#06b6d4",
            sparkline: monthlySparklines.operatingCash
          },
          {
            title: t("admin.finance.financialStatements.kpiInvestingCash"),
            value: `${stats.investingCash < 0 ? '-' : ''}${currency}${Math.abs(stats.investingCash).toLocaleString()}`,
            ...formatChange(stats.changes.investingCash),
            icon: TrendingDown,
            color: "text-rose-500",
            bgColor: "bg-rose-50",
            gradientId: "investingGradient",
            strokeColor: "#f43f5e",
            sparkline: monthlySparklines.investingCash
          },
          {
            title: t("admin.finance.financialStatements.kpiFinancingCash"),
            value: `${currency}${stats.financingCash.toLocaleString()}`,
            ...formatChange(stats.changes.financingCash),
            icon: TrendingUp,
            color: "text-emerald-500",
            bgColor: "bg-emerald-50",
            gradientId: "financingGradient",
            strokeColor: "#10b981",
            sparkline: monthlySparklines.financingCash
          }
        ];
      case "income":
      default:
        return [
          {
            title: t("admin.finance.financialStatements.kpiTotalRevenue"),
            value: `${currency}${stats.totalRevenue.toLocaleString()}`,
            ...formatChange(stats.changes.totalRevenue),
            icon: TrendingUp,
            color: "text-emerald-500",
            bgColor: "bg-emerald-50",
            gradientId: "revenueGradient",
            strokeColor: "#10b981",
            sparkline: monthlySparklines.totalRevenue
          },
          {
            title: t("admin.finance.financialStatements.kpiTotalExpenses"),
            value: `${currency}${stats.totalExpenses.toLocaleString()}`,
            ...formatChange(stats.changes.totalExpenses),
            icon: TrendingDown,
            color: "text-rose-500",
            bgColor: "bg-rose-50",
            gradientId: "expenseGradient",
            strokeColor: "#f43f5e",
            sparkline: monthlySparklines.totalExpenses
          },
          {
            title: t("admin.finance.financialStatements.kpiNetIncome"),
            value: `${currency}${stats.netIncome.toLocaleString()}`,
            ...formatChange(stats.changes.netIncome),
            icon: TrendingUp,
            color: "text-purple-500",
            bgColor: "bg-purple-50",
            gradientId: "incomeGradient",
            strokeColor: "#8b5cf6",
            sparkline: monthlySparklines.netIncome
          }
        ];
    }
  };

  const kpis = getKpis();

  const STATEMENT_TITLE_KEYS: Record<string, string> = {
    income: "admin.finance.financialStatements.statementTitleIncome",
    balance: "admin.finance.financialStatements.statementTitleBalance",
    cash: "admin.finance.financialStatements.statementTitleCash",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20 print:p-0 print:pb-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 rounded-xl border-slate-200 shrink-0 print:hidden"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 print:hidden">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{t("admin.finance.financialStatements.pageTitle")}</h1>
                <p className="text-sm text-slate-400 mt-1 print:hidden">{t("admin.finance.financialStatements.pageSubtitle")}</p>
                <p className="hidden print:block text-slate-500 mt-1">{t("admin.finance.financialStatements.reportForPeriod", { period: stats.periodName })}</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              {([
                { k: "this-month", label: t("admin.finance.financialStatements.periodThisMonth") },
                { k: "last-month", label: t("admin.finance.financialStatements.periodLastMonth") },
                { k: "this-quarter", label: t("admin.finance.financialStatements.periodQuarter") },
                { k: "this-year", label: t("admin.finance.financialStatements.periodYear") },
              ] as const).map(p => (
                <button key={p.k} onClick={() => setPeriod(p.k)}
                  className={cn("rounded-md px-3 h-8 text-xs font-semibold transition-all", period === p.k ? "bg-white shadow-sm text-purple-600" : "text-slate-500 hover:text-slate-700")}>
                  {p.label}
                </button>
              ))}
            </div>

            <button onClick={handlePrint} className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Printer className="h-3.5 w-3.5" /> {t("admin.finance.financialStatements.buttonPrint")}
            </button>

            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("admin.finance.financialStatements.buttonGenerateReport")}
            </button>
          </div>
        </div>

        {/* KPI Cards with Sparklines */}
        <div className="grid gap-3 md:grid-cols-3">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm animate-pulse h-32" />
            ))
          ) : kpis.map((kpi, index) => (
            <div key={index} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", kpi.bgColor)}>
                    <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{kpi.title}</span>
                </div>
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-md", kpi.bgColor, kpi.color)}>
                  {kpi.change} {kpi.trend === "up" ? "↑" : "↓"}
                </span>
              </div>
                <div className="text-2xl font-bold text-slate-900 mb-3">{kpi.value}</div>
                <div className="h-14 w-full print:hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={kpi.sparkline}>
                      <defs>
                        <linearGradient id={kpi.gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={kpi.strokeColor} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={kpi.strokeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={kpi.strokeColor} 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill={`url(#${kpi.gradientId})`} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
            </div>
          ))}
        </div>

        {/* Tabs and Secondary Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-1 border-b border-slate-100">
            {([
              { k: "income", label: t("admin.finance.financialStatements.tabIncomeStatement") },
              { k: "balance", label: t("admin.finance.financialStatements.tabBalanceSheet") },
              { k: "cash", label: t("admin.finance.financialStatements.tabCashFlow") },
            ] as const).map(tab => (
              <button key={tab.k} onClick={() => setActiveTab(tab.k)}
                className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                  activeTab === tab.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleExportCSV} className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> {t("admin.finance.financialStatements.buttonExportCsv")}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {/* Real PDF: this page is already laid out for print (see the
                  print:* classes below) — reuses the browser's native print
                  dialog, which lets the user "Save as PDF", instead of the
                  old fake "Generating…/Downloaded" toast pair that never
                  produced a file. */}
              <FileText className="h-3.5 w-3.5" /> {t("admin.finance.financialStatements.buttonDownloadPdf")}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {reportData ? (
          <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden print:shadow-none print:border print:rounded-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center print:hidden">
                    <FileText className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{t(STATEMENT_TITLE_KEYS[activeTab] || activeTab)}</h3>
                    <p className="text-xs text-slate-500">{t("admin.finance.financialStatements.reportPeriodGenerated", { period: reportData.periodName, generated: reportData.generatedAt })}</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">
                  {reportData.status}
                </span>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
                  <div className="p-6 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("admin.finance.financialStatements.summaryAnalysisTitle")}</p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {stats.netIncome > 0
                        ? t("admin.finance.financialStatements.summaryPositive", { period: stats.periodName })
                        : t("admin.finance.financialStatements.summaryNegative", { period: stats.periodName })}{" "}
                      {stats.totalRevenue > stats.totalExpenses ? t("admin.finance.financialStatements.summaryRevenueOutpacing") : t("admin.finance.financialStatements.summaryCostsHigher")}
                    </p>
                  </div>
                  <div className="p-6 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("admin.finance.financialStatements.keyRecommendationsTitle")}</p>
                    <ul className="text-sm text-slate-600 space-y-2 list-disc ps-4">
                      <li>{stats.netIncome > 0 ? t("admin.finance.financialStatements.recommendationReinvest") : t("admin.finance.financialStatements.recommendationReviewExpenses")}</li>
                      <li>{t("admin.finance.financialStatements.recommendationMonitorFees")}</li>
                      <li>{t("admin.finance.financialStatements.recommendationEvaluateDepreciation")}</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-widest">{t("admin.finance.financialStatements.detailedBreakdownTitle")}</span>
                    <span className="text-xs text-slate-500 font-medium">{t("admin.finance.financialStatements.allFiguresIn", { currency: financialSettings.currency })}</span>
                  </div>
                  <div className="p-6 space-y-4">
                    {activeTab === "income" && (
                      <>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600">{t("admin.finance.financialStatements.rowOperatingRevenue")}</span>
                          <span className="text-sm font-bold text-slate-900">{financialSettings.currency} {stats.totalRevenue.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowStudentFees")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.periodStudentRev.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowOtherIncome")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.periodEntityRev.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600">{t("admin.finance.financialStatements.rowOperatingExpenses")}</span>
                          <span className="text-sm font-bold text-rose-600">({financialSettings.currency} {stats.totalExpenses.toLocaleString()})</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowPayrollBenefits")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.periodPayroll.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowGeneralExpenses")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.periodExpenses.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 pt-4">
                          <span className="text-base font-bold text-slate-900">{t("admin.finance.financialStatements.rowNetOperatingIncome")}</span>
                          <span className={cn("text-base font-bold", stats.netIncome >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {financialSettings.currency} {stats.netIncome.toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}

                    {activeTab === "balance" && (
                      <>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-bold text-slate-900">{t("admin.finance.financialStatements.rowTotalAssets")}</span>
                          <span className="text-sm font-bold text-slate-900">{financialSettings.currency} {stats.totalAssets.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowCashEquivalents")}</span>
                          <span className={cn("text-sm", stats.cash < 0 ? "text-rose-600" : "text-slate-600")}>{financialSettings.currency} {stats.cash.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowFixedAssetsNet")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.fixedAssets.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-bold text-slate-900">{t("admin.finance.financialStatements.rowTotalLiabilities")}</span>
                          <span className="text-sm font-bold text-rose-600">{financialSettings.currency} {stats.totalLiabilities.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowAccountsPayable")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {(stats.accountsPayable + stats.pendingPayroll).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowBankLoan")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.bankLoan.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-bold text-slate-900">{t("admin.finance.financialStatements.rowTotalEquity")}</span>
                          <span className="text-sm font-bold text-purple-600">{financialSettings.currency} {stats.totalEquity.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowContributedCapital")}</span>
                          <span className="text-sm text-slate-600">{financialSettings.currency} {stats.contributedCapital.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600 ms-4">{t("admin.finance.financialStatements.rowRetainedEarnings")}</span>
                          <span className={cn("text-sm", stats.retainedEarnings < 0 ? "text-rose-600" : "text-slate-600")}>{financialSettings.currency} {stats.retainedEarnings.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 pt-4 border-t border-slate-200">
                          <span className="text-base font-bold text-slate-900">{t("admin.finance.financialStatements.rowLiabilitiesPlusEquity")}</span>
                          <span className="text-base font-bold text-slate-900">{financialSettings.currency} {(stats.totalLiabilities + stats.totalEquity).toLocaleString()}</span>
                        </div>
                      </>
                    )}

                    {activeTab === "cash" && (
                      <>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600">{t("admin.finance.financialStatements.rowCashFromOperating")}</span>
                          <span className={cn("text-sm font-bold", stats.operatingCash >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {financialSettings.currency} {stats.operatingCash.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600">{t("admin.finance.financialStatements.rowCashFromInvesting")}</span>
                          <span className={cn("text-sm font-bold", stats.investingCash >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {financialSettings.currency} {stats.investingCash.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-sm font-medium text-slate-600">{t("admin.finance.financialStatements.rowCashFromFinancing")}</span>
                          <span className={cn("text-sm font-bold", stats.financingCash >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {financialSettings.currency} {stats.financingCash.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 pt-4">
                          <span className="text-base font-bold text-slate-900">{t("admin.finance.financialStatements.rowNetIncreaseInCash")}</span>
                          <span className="text-base font-bold text-cyan-600">
                            {financialSettings.currency} {(stats.operatingCash + stats.investingCash + stats.financingCash).toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl min-h-[400px] flex flex-col items-center justify-center text-center p-12">
            <div className="h-20 w-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-6">
              <FileText className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t("admin.finance.financialStatements.emptyStateTitle")}</h3>
            <p className="text-slate-500 max-w-xs mt-2">{t("admin.finance.financialStatements.emptyStateDescription")}</p>
          </Card>
        )}

        {/* Floating Action Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="fixed bottom-8 end-8 h-14 w-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-xl shadow-purple-200 flex items-center justify-center z-50 print:hidden"
          onClick={handleGenerateReport}
        >
          <Sparkles className="h-6 w-6" />
        </motion.button>
      </div>
    </DashboardLayout>
  );
};

export default FinancialStatements;

