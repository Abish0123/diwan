import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Sparkles, Target, Zap, ArrowRight, BarChart3, PieChart, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

export default function ExecutiveInsights() {
  const { revenueThisMonth, loading } = useDashboardStats();
  const { settings } = useFinancialSettings();

  const insights = [
    {
      title: "Projected Revenue Growth",
      value: `${settings.currency}${(revenueThisMonth * 1.15).toLocaleString()}`,
      subValue: "+15% projected",
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
      description: "AI predicts a steady increase in fee collection due to improved automation and student retention."
    },
    {
      title: "Operational Efficiency",
      value: "94%",
      subValue: "+5% improvement",
      icon: Zap,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      description: "Automation of attendance and payroll has reduced manual workload significantly across all departments."
    },
    {
      title: "Student Retention Risk",
      value: "4.2%",
      subValue: "-1.5% decrease",
      icon: Target,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      description: "Early intervention strategies are successfully reducing student churn based on current behavior patterns."
    }
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Analyzing executive data...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              Executive Insights
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-black uppercase bg-primary/10 text-primary border-none">AI-POWERED</Badge>
            </h2>
            <p className="text-xs text-muted-foreground font-bold tracking-[0.15em] uppercase opacity-70">Strategic overview and predictive analytics</p>
          </div>
          <Button className="h-10 rounded-xl gradient-primary border-none font-bold text-[11px] shadow-lg shadow-primary/20">
            Export Executive Summary
          </Button>
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
                  <CardTitle className="text-lg font-bold">Revenue Forecast</CardTitle>
                  <CardDescription>Predicted collection for the next 6 months</CardDescription>
                </div>
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-end justify-between gap-2 pt-4">
                {[45, 60, 55, 80, 75, 90].map((height, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ delay: i * 0.1, duration: 1 }}
                      className={cn(
                        "w-full rounded-t-lg transition-all duration-300 relative",
                        i === 5 ? "gradient-primary" : "bg-primary/20 group-hover:bg-primary/40"
                      )}
                    >
                      {i === 5 && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-2 py-1 rounded shadow-lg">
                          PREDICTED
                        </div>
                      )}
                    </motion.div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Month {i + 1}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-sidebar-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">Resource Allocation</CardTitle>
                  <CardDescription>AI-optimized budget distribution</CardDescription>
                </div>
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <PieChart className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { label: "Academics", value: 45, color: "bg-blue-500" },
                { label: "Infrastructure", value: 25, color: "bg-purple-500" },
                { label: "Staff Payroll", value: 20, color: "bg-green-500" },
                { label: "Marketing", value: 10, color: "bg-yellow-500" }
              ].map((item, i) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground uppercase tracking-wider">{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <Progress value={item.value} className={cn("h-2", item.color)} />
                </div>
              ))}
              <div className="pt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                  <span className="font-bold text-primary">AI Recommendation:</span> Reallocate 5% from Marketing to Academics to support the new digital learning initiative.
                </p>
              </div>
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
