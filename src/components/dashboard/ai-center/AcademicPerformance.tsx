import { motion } from "motion/react";
import { GraduationCap, TrendingUp, TrendingDown, ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const performanceData = [
  {
    id: 1,
    title: "Top Class: Grade 9",
    value: "92% avg",
    trend: "+4%",
    trendType: "up",
    icon: TrendingUp,
    color: "text-green-500",
    bg: "bg-green-500/10"
  },
  {
    id: 2,
    title: "Lowest: Grade 8",
    value: "68% avg",
    trend: "-12%",
    trendType: "down",
    icon: TrendingDown,
    color: "text-red-500",
    bg: "bg-red-500/10"
  }
];

export function AcademicPerformance() {
  return (
    <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Academic Insights</h3>
        </div>
        <button className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">View Report</button>
      </div>
      
      <div className="space-y-4">
        {performanceData.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 hover:bg-sidebar-accent transition-all duration-300 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110 duration-300", item.bg, item.color)}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider leading-none">{item.title}</p>
                  <h4 className="text-lg font-black text-foreground leading-none tracking-tight">{item.value}</h4>
                </div>
              </div>
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase",
                item.trendType === "up" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
              )}>
                {item.trend}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6">
        <Button size="sm" variant="outline" className="w-full h-10 rounded-xl font-bold text-[11px] border-sidebar-border hover:bg-primary/10 hover:text-primary transition-all">
          View Academic Report
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
