import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Sparkles, Target, Zap, ArrowRight, BarChart3, PieChart, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { smartDb } from "@/lib/localDb";

const ALLOC_COLORS = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-yellow-500", "bg-rose-500", "bg-cyan-500"];

// Every number on this page used to be a hardcoded constant presented as
// "AI-powered" insight (94% efficiency, 4.2% retention risk, a static
// [45,60,55,80,75,90] forecast bar chart, a fixed 45/25/20/10 budget split,
// and a canned "reallocate 5% from Marketing" recommendation naming
// categories that may not even exist in this school's real budget). This
// now computes every figure from real smartDb data — no LLM call is made
// here, so nothing is labeled "AI predicts"; it's real historical data and
// real trend, described as such.
export default function ExecutiveInsights() {
  const { revenueThisMonth, loading } = useDashboardStats();
  const { settings } = useFinancialSettings();

  const [monthlyRevenue, setMonthlyRevenue] = useState<{ label: string; amount: number }[]>([]);
  const [allocation, setAllocation] = useState<{ label: string; value: number }[]>([]);
  const [budgetUtilization, setBudgetUtilization] = useState<number | null>(null);
  const [atRiskPct, setAtRiskPct] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      smartDb.getAll("StudentRevenue", undefined).catch(() => []),
      smartDb.getAll("Expense", undefined).catch(() => []),
      smartDb.getAll("FinancialCategory", undefined).catch(() => []),
      smartDb.getAll("attendance", undefined).catch(() => []),
      smartDb.getAll("Student", undefined).catch(() => []),
    ]).then(([revenue, expenses, categories, attendance, students]) => {
      if (!alive) return;

      // Real trailing 6-month revenue, from actual StudentRevenue rows.
      const now = new Date();
      const months: { key: string; label: string }[] = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short" }) };
      });
      const revByMonth = new Map<string, number>();
      (revenue as { date?: string; amount?: number }[]).forEach(r => {
        if (!r.date) return;
        const key = String(r.date).slice(0, 7);
        revByMonth.set(key, (revByMonth.get(key) || 0) + (r.amount || 0));
      });
      setMonthlyRevenue(months.map(m => ({ label: m.label, amount: revByMonth.get(m.key) || 0 })));

      // Real spend-by-category, from actual Expense rows.
      const spendByCategory = new Map<string, number>();
      (expenses as { category?: string; amount?: number; status?: string }[]).forEach(e => {
        if (e.status === "Cancelled" || !e.category) return;
        spendByCategory.set(e.category, (spendByCategory.get(e.category) || 0) + (e.amount || 0));
      });
      const totalSpend = [...spendByCategory.values()].reduce((a, b) => a + b, 0);
      const alloc = [...spendByCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, amount]) => ({ label, value: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0 }));
      setAllocation(alloc);

      // Real budget utilization — total real spend vs total real allocated
      // budget across categories that actually have a budget set.
      const budgeted = (categories as { budget?: number }[]).filter(c => (c.budget || 0) > 0);
      const totalBudget = budgeted.reduce((a, c) => a + (c.budget || 0), 0);
      setBudgetUtilization(totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : null);

      // Real at-risk proxy — % of students with real attendance below 75%,
      // the same threshold the Student Directory's own "At Risk" filter
      // uses elsewhere in the app.
      const byStudent = new Map<string, { present: number; total: number }>();
      (attendance as { studentId?: string; status?: string }[]).forEach(r => {
        if (!r.studentId) return;
        const cur = byStudent.get(r.studentId) || { present: 0, total: 0 };
        cur.total++;
        if (r.status === "Present" || r.status === "Late") cur.present++;
        byStudent.set(r.studentId, cur);
      });
      const totalStudents = (students as unknown[]).length;
      const atRisk = [...byStudent.entries()].filter(([, v]) => v.total >= 5 && v.present / v.total < 0.75).length;
      setAtRiskPct(totalStudents > 0 ? Math.round((atRisk / totalStudents) * 1000) / 10 : null);

      setDataLoading(false);
    }).catch(() => setDataLoading(false));
    return () => { alive = false; };
  }, []);

  const thisMonthRev = monthlyRevenue[monthlyRevenue.length - 1]?.amount ?? revenueThisMonth;
  const lastMonthRev = monthlyRevenue[monthlyRevenue.length - 2]?.amount ?? 0;
  const revGrowthPct = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 1000) / 10 : null;
  const topCategory = allocation[0];

  const insights = [
    {
      title: "Revenue vs Last Month",
      value: `${settings.currency}${thisMonthRev.toLocaleString()}`,
      subValue: revGrowthPct != null ? `${revGrowthPct >= 0 ? "+" : ""}${revGrowthPct}% vs last month` : "No prior month data",
      icon: revGrowthPct != null && revGrowthPct < 0 ? TrendingDown : TrendingUp,
      color: revGrowthPct != null && revGrowthPct < 0 ? "text-rose-500" : "text-green-500",
      bg: revGrowthPct != null && revGrowthPct < 0 ? "bg-rose-500/10" : "bg-green-500/10",
      description: "Real collected revenue this month compared to last month — actual StudentRevenue records, not a projection.",
    },
    {
      title: "Budget Utilization",
      value: budgetUtilization != null ? `${budgetUtilization}%` : "No budget set",
      subValue: "Real spend vs allocated budget",
      icon: Zap,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      description: budgetUtilization != null ? "Total real Expense records against the real budget allocated per category in Finance Setup." : "No category has a budget amount configured yet — set one in Budgeting to see this.",
    },
    {
      title: "Students Below 75% Attendance",
      value: atRiskPct != null ? `${atRiskPct}%` : "No attendance data",
      subValue: "Real attendance-risk proxy",
      icon: Target,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      description: "Share of students whose real recorded attendance is below 75% — the same threshold used by the Student Directory's own At Risk filter.",
    }
  ];

  if (loading || dataLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading real executive data...</p>
        </div>
      </DashboardLayout>
    );
  }

  const maxMonthly = Math.max(1, ...monthlyRevenue.map(m => m.amount));

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              Executive Insights
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-black uppercase bg-primary/10 text-primary border-none">Real Data</Badge>
            </h2>
            <p className="text-xs text-muted-foreground font-bold tracking-[0.15em] uppercase opacity-70">Strategic overview from real finance &amp; attendance records</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {insights.map((insight, i) => (
            <motion.div
              key={insight.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="border-sidebar-border shadow-sm hover:shadow-lg transition-all duration-300 group overflow-hidden relative">
                <div className={cn("absolute top-0 right-0 p-6 opacity-5 group-hover:scale-150 transition-transform duration-700", insight.color)}>
                   <insight.icon className="h-24 w-24" />
                </div>
                <CardHeader className="pb-2">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-2", insight.bg, insight.color)}>
                    <insight.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{insight.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black text-foreground tracking-tight">{insight.value}</h3>
                    <p className={cn("text-xs font-bold", insight.color)}>{insight.subValue}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    {insight.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-sidebar-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">Revenue Trend — Last 6 Months</CardTitle>
                  <CardDescription>Real collected revenue, from StudentRevenue records</CardDescription>
                </div>
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyRevenue.every(m => m.amount === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-16">No revenue recorded in the last 6 months yet.</p>
              ) : (
                <div className="h-[300px] flex items-end justify-between gap-2 pt-4">
                  {monthlyRevenue.map((m, i) => {
                    const height = Math.round((m.amount / maxMonthly) * 100);
                    return (
                      <div key={m.label + i} className="flex-1 flex flex-col items-center gap-2 group">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${height}%` }}
                          transition={{ delay: i * 0.1, duration: 1 }}
                          className={cn(
                            "w-full rounded-t-lg transition-all duration-300 relative",
                            i === monthlyRevenue.length - 1 ? "gradient-primary" : "bg-primary/20 group-hover:bg-primary/40"
                          )}
                          title={`${settings.currency}${m.amount.toLocaleString()}`}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-sidebar-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">Resource Allocation</CardTitle>
                  <CardDescription>Real spend distribution, from Expense records</CardDescription>
                </div>
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <PieChart className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {allocation.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No Expense records yet.</p>
              ) : (
                <>
                  {allocation.map((item, i) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-muted-foreground uppercase tracking-wider">{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <Progress value={item.value} className={cn("h-2", ALLOC_COLORS[i % ALLOC_COLORS.length])} />
                    </div>
                  ))}
                  {topCategory && (
                    <div className="pt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
                      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                        <span className="font-bold text-primary">Insight:</span> "{topCategory.label}" is the largest real spend category this period at {topCategory.value}% of total Expense records.
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Badge({ children, variant, className }: { children: React.ReactNode; variant?: "default" | "secondary"; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      variant === "secondary" ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground hover:bg-primary/80",
      className
    )}>
      {children}
    </span>
  );
}
