import { motion } from "motion/react";
import { DollarSign, Users, UserCheck, TrendingUp, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

export function SmartKpiCards() {
  const { revenueThisMonth, collectionRate, totalStudents, avgAttendance, loading } = useDashboardStats();
  const { settings: financialSettings } = useFinancialSettings();

  const kpis = [
    {
      title: "Revenue This Month",
      value: `${financialSettings.currency}${revenueThisMonth.toLocaleString()}`,
      trend: "+12%",
      trendType: "up",
      description: "vs last month",
      icon: DollarSign,
      color: "text-green-500",
      bg: "bg-green-500/10"
    },
    {
      title: "Collection Rate",
      value: `${collectionRate}%`,
      trend: "-5%",
      trendType: "down",
      description: "Below target",
      icon: TrendingUp,
      color: "text-red-500",
      bg: "bg-red-500/10"
    },
    {
      title: "Total Students",
      value: totalStudents.toLocaleString(),
      trend: "+35",
      trendType: "up",
      description: "New admissions",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Avg Attendance",
      value: `${avgAttendance}%`,
      trend: "-2%",
      trendType: "down",
      description: "Needs attention",
      icon: UserCheck,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10"
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-card border border-sidebar-border shadow-sm flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin opacity-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.title}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="p-5 rounded-2xl bg-card border border-sidebar-border shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110 duration-300", kpi.bg, kpi.color)}>
              <kpi.icon className="h-5 w-5" />
            </div>
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase",
              kpi.trendType === "up" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
            )}>
              {kpi.trendType === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {kpi.trend}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{kpi.title}</p>
            <h3 className="text-2xl font-black text-foreground tracking-tight">{kpi.value}</h3>
            <p className="text-[10px] font-medium text-muted-foreground/60 flex items-center gap-1">
              {kpi.description}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
