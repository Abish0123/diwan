import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  PieChart, 
  ArrowRight, 
  Download,
  Calendar,
  Search,
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  Cell,
  PieChart as RePieChart,
  Pie
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { num, sumBy, monthlySeries, recDate, money, exportCsv, MONTHS } from "./analyticsUtils";

const PIE_COLORS = ["#9810fa", "#A29BFE", "#00CEC9", "#FAB1A0", "#DFE6E9", "#fbbf24", "#34d399"];

export default function FinanceReports() {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState("6m");
  const [search, setSearch] = useState("");
  const { settings } = useFinancialSettings();

  const [studentRevenue, setStudentRevenue] = useState<any[]>([]);
  const [entityRevenue, setEntityRevenue] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [sRev, eRev, exp, pay, inv] = await Promise.all([
          smartDb.getAll("student_revenue"),
          smartDb.getAll("entity_revenue"),
          smartDb.getAll("expenses"),
          smartDb.getAll("payroll"),
          smartDb.getAll("invoices"),
        ]);
        setStudentRevenue(sRev || []);
        setEntityRevenue(eRev || []);
        setExpenses(exp || []);
        setPayroll(pay || []);
        setInvoices(inv || []);
      } catch (e) {
        console.error("Error loading finance data:", e);
      }
    })();
  }, []);

  const monthsCount = timeRange === "3m" ? 3 : timeRange === "1y" ? 12 : 6;

  // Revenue vs Expense by month (last N months).
  const revenueData = useMemo(() => {
    const allRevenue = [...studentRevenue, ...entityRevenue];
    const allExpense = [...expenses, ...payroll];
    const rev = monthlySeries(allRevenue, (r: any) => r.date, (r: any) => r.amount, monthsCount);
    const exp = monthlySeries(allExpense, (r: any) => r.date, (r: any) => r.amount, monthsCount);
    return rev.map((m, i) => ({
      month: m.name,
      revenue: Math.round(m.value),
      expenses: Math.round(exp[i]?.value || 0),
    }));
  }, [studentRevenue, entityRevenue, expenses, payroll, monthsCount]);

  // KPI totals.
  const totalRevenue = useMemo(
    () => sumBy(studentRevenue, (r: any) => r.amount) + sumBy(entityRevenue, (r: any) => r.amount),
    [studentRevenue, entityRevenue],
  );
  const totalExpenses = useMemo(
    () => sumBy(expenses, (r: any) => r.amount) + sumBy(payroll, (r: any) => r.amount),
    [expenses, payroll],
  );
  const netProfit = totalRevenue - totalExpenses;

  // Collection rate = paid invoices / total invoices.
  const collectionRate = useMemo(() => {
    if (!invoices.length) return 0;
    const paid = invoices.filter((i: any) => String(i.status).toLowerCase() === "paid").length;
    return (paid / invoices.length) * 100;
  }, [invoices]);

  // Expense breakdown grouped by category (expenses + payroll).
  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of [...expenses, ...payroll]) {
      const cat = String(r.category || "Payroll").trim() || "Other";
      map.set(cat, (map.get(cat) || 0) + num(r.amount));
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], i) => ({
        name,
        amount,
        value: total ? Math.round((amount / total) * 100) : 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
    return rows.length ? rows : [{ name: "No data", amount: 0, value: 0, color: "#DFE6E9" }];
  }, [expenses, payroll]);

  // Recent transactions: latest revenue/expense records by date.
  const transactions = useMemo(() => {
    const rows = [
      ...studentRevenue.map((r: any) => ({ ...r, _kind: "in", _cat: r.category || "Fees" })),
      ...entityRevenue.map((r: any) => ({ ...r, _kind: "in", _cat: r.category || "Revenue" })),
      ...expenses.map((r: any) => ({ ...r, _kind: "out", _cat: r.category || "Expense" })),
      ...payroll.map((r: any) => ({ ...r, _kind: "out", _cat: r.category || "Payroll" })),
    ];
    return rows
      .sort((a, b) => (recDate(b.date)?.getTime() || 0) - (recDate(a.date)?.getTime() || 0))
      .slice(0, 8)
      .map((r, i) => {
        const amt = num(r.amount);
        const d = recDate(r.date);
        return {
          id: String(r.id || `TXN-${i + 1}`),
          desc: String(r.description || r.category || (r._kind === "in" ? "Revenue" : "Expense")),
          cat: String(r._cat),
          date: d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "—",
          amount: `${r._kind === "in" ? "+" : "-"}${money(amt, settings.currency)}`,
          status: String(r.status || "Completed"),
          type: r._kind,
        };
      });
  }, [studentRevenue, entityRevenue, expenses, payroll, settings.currency]);

  const visibleTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) =>
      t.desc.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  // Fee collection broken down by invoice status (count-based progress bars).
  const feeStatus = useMemo(() => {
    if (!invoices.length) return [{ grade: "No invoices", collected: 0, pending: 100 }];
    const map = new Map<string, number>();
    for (const inv of invoices) {
      const s = String(inv.status || "Unknown").trim() || "Unknown";
      map.set(s, (map.get(s) || 0) + 1);
    }
    const total = invoices.length;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => {
        const collected = Math.round((count / total) * 100);
        return { grade: `${status} (${count})`, collected, pending: 100 - collected };
      });
  }, [invoices]);

  // Real, derived insights (no fabricated numbers) built from the same data
  // already loaded on this page.
  const financialInsights = useMemo(() => {
    const insights: { title: string; desc: string; icon: typeof TrendingUp }[] = [];

    // Revenue vs expenses trend: compare the most recent month to the prior one.
    if (revenueData.length >= 2) {
      const last = revenueData[revenueData.length - 1];
      const prev = revenueData[revenueData.length - 2];
      if (prev.revenue > 0) {
        const pct = ((last.revenue - prev.revenue) / prev.revenue) * 100;
        insights.push({
          title: "Revenue Trend",
          desc: `Revenue in ${last.month} is ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% vs ${prev.month} (${money(last.revenue, settings.currency)} vs ${money(prev.revenue, settings.currency)}).`,
          icon: pct >= 0 ? TrendingUp : AlertTriangle,
        });
      }
      if (prev.expenses > 0) {
        const pct = ((last.expenses - prev.expenses) / prev.expenses) * 100;
        insights.push({
          title: "Expense Trend",
          desc: `Expenses in ${last.month} are ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% vs ${prev.month} (${money(last.expenses, settings.currency)} vs ${money(prev.expenses, settings.currency)}).`,
          icon: pct > 0 ? AlertTriangle : CheckCircle2,
        });
      }
    }

    // Fee collection based on real invoice statuses.
    const overdueCount = invoices.filter((i: any) => String(i.status).toLowerCase() === "overdue").length;
    if (overdueCount > 0) {
      const overdueTotal = invoices
        .filter((i: any) => String(i.status).toLowerCase() === "overdue")
        .reduce((sum: number, i: any) => sum + num(i.amount), 0);
      insights.push({
        title: "Overdue Fees",
        desc: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue, totaling ${money(overdueTotal, settings.currency)}.`,
        icon: AlertTriangle,
      });
    } else if (invoices.length > 0) {
      insights.push({
        title: "Collection Health",
        desc: `Fee collection rate is ${collectionRate.toFixed(1)}% with no overdue invoices.`,
        icon: CheckCircle2,
      });
    }

    // Largest expense category, from the real breakdown already computed above.
    const topCategory = expenseCategories.find((c) => c.name !== "No data");
    if (topCategory) {
      insights.push({
        title: "Top Expense Category",
        desc: `${topCategory.name} accounts for ${topCategory.value}% of total expenses (${money(topCategory.amount, settings.currency)}).`,
        icon: PieChart,
      });
    }

    return insights;
  }, [revenueData, invoices, collectionRate, expenseCategories, settings.currency]);

  const kpiCards = [
    { title: "Total Revenue", value: money(totalRevenue, settings.currency), trend: "Revenue", isUp: true, icon: DollarSign, color: "indigo" },
    { title: "Total Expenses", value: money(totalExpenses, settings.currency), trend: "Expenses", isUp: false, icon: CreditCard, color: "rose" },
    { title: "Net Profit", value: money(netProfit, settings.currency), trend: netProfit >= 0 ? "Positive" : "Negative", isUp: netProfit >= 0, icon: TrendingUp, color: "emerald" },
    { title: "Fee Collection", value: `${collectionRate.toFixed(1)}%`, trend: collectionRate >= 80 ? "Healthy" : "Watch", isUp: collectionRate >= 80, icon: PieChart, color: "amber" },
  ];

  const handleExport = () => {
    exportCsv("finance-report", [
      { metric: "Total Revenue", value: Math.round(totalRevenue) },
      { metric: "Total Expenses", value: Math.round(totalExpenses) },
      { metric: "Net Profit", value: Math.round(netProfit) },
      { metric: "Collection Rate %", value: collectionRate.toFixed(1) },
      ...revenueData.map((m) => ({ metric: `${m.month} Revenue`, value: m.revenue })),
      ...revenueData.map((m) => ({ metric: `${m.month} Expenses`, value: m.expenses })),
      ...expenseCategories.map((c) => ({ metric: `Expense - ${c.name}`, value: Math.round(c.amount) })),
    ]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Financial Analytics</h1>
              <p className="text-sm text-slate-400">Real-time revenue, expense tracking & fee collection insights.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4 text-slate-500" /> Export CSV
            </button>
            <button onClick={() => navigate("/finance/fees")} className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <DollarSign className="h-4 w-4" /> Process Fees
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((kpi, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", `bg-${kpi.color}-50`)}>
                  <kpi.icon className={cn("h-5 w-5", `text-${kpi.color}-600`)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight flex-1">{kpi.title}</span>
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center whitespace-nowrap",
                  kpi.isUp ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                  {kpi.isUp ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                  {kpi.trend}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* AI Financial Insights */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">AI Financial Advisor</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-600">Live Analysis</span>
                </div>
                <p className="text-sm text-slate-400">Data-driven insights from your real financial records.</p>
              </div>
            </div>
            <button onClick={() => navigate("/finance/budget")} className="flex items-center gap-2 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Sparkles className="h-4 w-4" /> Optimize Budget
            </button>
          </div>

          {financialInsights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {financialInsights.map((insight, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <insight.icon className="h-4 w-4 text-purple-600" />
                    <h4 className="font-semibold text-slate-900 text-sm">{insight.title}</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{insight.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4">Not enough data yet to generate insights.</p>
          )}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Revenue vs Expenses */}
          <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-5 pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Revenue vs Expenses</CardTitle>
                  <CardDescription className="text-xs text-slate-400">Monthly financial performance overview</CardDescription>
                </div>
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-[110px] h-9 rounded-lg border-slate-200 text-sm font-medium">
                    <SelectValue placeholder="Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3m">Last 3m</SelectItem>
                    <SelectItem value="6m">Last 6m</SelectItem>
                    <SelectItem value="1y">Last 1y</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9810fa" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#9810fa" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      tickFormatter={(value) => `$${value/1000}k`}
                    />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#9810fa" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    <Area type="monotone" dataKey="expenses" stroke="#A29BFE" strokeWidth={3} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Expense Distribution */}
          <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-5 pb-0">
              <CardTitle className="text-base font-bold text-slate-900">Expense Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-400">Breakdown of operational costs</CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex flex-col md:flex-row items-center gap-5">
              <div className="h-[220px] w-full md:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={expenseCategories}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full md:w-1/2 space-y-2.5">
                {expenseCategories.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{backgroundColor: cat.color}} />
                      <span className="text-sm font-medium text-slate-600">{cat.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{cat.value}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fee Collection Status */}
        <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
          <CardHeader className="p-5">
            <CardTitle className="text-base font-bold text-slate-900">Fee Collection Status</CardTitle>
            <CardDescription className="text-xs text-slate-400">Invoice payment progress by status</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="space-y-4">
              {feeStatus.map((item, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{item.grade}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-600 font-semibold text-xs">{item.collected}% of total</span>
                      <span className="text-rose-500 font-semibold text-xs">{item.pending}% rest</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${item.collected}%` }} />
                    <div className="h-full bg-rose-400 transition-all duration-1000" style={{ width: `${item.pending}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions Table */}
        <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
          <CardHeader className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base font-bold text-slate-900">Recent Transactions</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search transactions…"
                    className="pl-9 h-9 rounded-lg border-slate-200 text-sm w-[220px]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button onClick={() => navigate("/finance/transactions")} className="text-sm font-semibold text-purple-600 hover:text-purple-700">View All</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    {["Transaction ID", "Description", "Category", "Date", "Amount", "Status"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                        {transactions.length === 0 ? "No transactions recorded yet." : "No transactions match your search."}
                      </td>
                    </tr>
                  )}
                  {visibleTransactions.map((txn, i) => (
                    <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">{txn.id}</td>
                      <td className="px-4 py-3 text-slate-600">{txn.desc}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">{txn.cat}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{txn.date}</td>
                      <td className={cn("px-4 py-3 font-bold whitespace-nowrap", txn.type === "in" ? "text-emerald-600" : "text-rose-500")}>
                        {txn.amount}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap",
                          ["completed", "paid"].includes(txn.status.toLowerCase()) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                          {txn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
