import { motion } from "framer-motion";
import { Sparkles, AlertCircle, TrendingUp, ArrowRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";

export function AiInsightsPanel() {
  const { collectionRate, overdueInvoicesCount, loading } = useDashboardStats();

  const insights = [
    {
      id: 1,
      type: collectionRate < 90 ? "warning" : "success",
      title: collectionRate < 90 ? `Fee collection rate is ${collectionRate}%` : "Fee collection is on track",
      description: collectionRate < 90 ? "Below the target of 95%. Consider sending reminders." : "Collection rate is healthy and meeting targets.",
      icon: AlertCircle,
      color: collectionRate < 90 ? "text-red-500" : "text-green-500",
      bg: collectionRate < 90 ? "bg-red-500/10" : "bg-green-500/10"
    },
    {
      id: 2,
      type: "info",
      title: "Academic performance monitoring",
      description: "Class 10 average test scores are stable across all core subjects.",
      icon: TrendingUp,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      id: 3,
      type: overdueInvoicesCount > 0 ? "warning" : "success",
      title: overdueInvoicesCount > 0 ? `${overdueInvoicesCount} overdue invoices detected` : "No overdue invoices",
      description: overdueInvoicesCount > 0 ? "These require immediate follow-up to maintain cash flow." : "All recent invoices have been settled on time.",
      icon: Info,
      color: overdueInvoicesCount > 0 ? "text-yellow-500" : "text-green-500",
      bg: overdueInvoicesCount > 0 ? "bg-yellow-500/10" : "bg-green-500/10"
    }
  ];

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 text-primary animate-spin opacity-20" />
        <p className="text-[11px] text-muted-foreground font-medium">Analyzing data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">AI Insights</h3>
        </div>
        <button className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">Refresh</button>
      </div>
      
      <div className="space-y-4">
        {insights.map((insight, i) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 hover:bg-sidebar-accent transition-all duration-300 group"
          >
            <div className="flex gap-4">
              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110 duration-300", insight.bg, insight.color)}>
                <insight.icon className="h-4 w-4" />
              </div>
              <div className="space-y-1 flex-1">
                <h4 className="text-[13px] font-bold text-foreground leading-tight">{insight.title}</h4>
                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">{insight.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Recommended Action</p>
        </div>
        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
          {overdueInvoicesCount > 0 
            ? `Send reminders for the ${overdueInvoicesCount} overdue invoices to improve collection rate.`
            : "Continue monitoring academic performance and maintain current collection strategies."}
        </p>
        <Button size="sm" className="w-full h-9 rounded-xl gradient-primary border-none font-bold text-[11px] shadow-lg shadow-primary/20">
          Execute Recommendations
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
