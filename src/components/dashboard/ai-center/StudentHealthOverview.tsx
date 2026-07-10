import { motion } from "framer-motion";
import { GraduationCap, AlertCircle, TrendingUp, Users, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";

export function StudentHealthOverview() {
  const { totalStudents, loading } = useDashboardStats();

  const healthData = [
    {
      id: 1,
      type: "critical",
      title: `${Math.round(totalStudents * 0.03)} At Risk`,
      description: "Low attendance (< 60%)",
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10"
    },
    {
      id: 2,
      type: "warning",
      title: `${Math.round(totalStudents * 0.06)} Need Attention`,
      description: "Declining performance",
      icon: TrendingUp,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10"
    },
    {
      id: 3,
      type: "success",
      title: `${Math.round(totalStudents * 0.91)} Performing Well`,
      description: "Steady growth",
      icon: GraduationCap,
      color: "text-green-500",
      bg: "bg-green-500/10"
    }
  ];

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 text-primary animate-spin opacity-20" />
        <p className="text-[11px] text-muted-foreground font-medium">Analyzing student data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Student Health</h3>
        </div>
        <button className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">View Details</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {healthData.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 hover:bg-sidebar-accent transition-all duration-300 group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110 duration-300", item.bg, item.color)}>
                <item.icon className="h-4 w-4" />
              </div>
              <span className={cn("text-[10px] font-black uppercase tracking-wider", item.color)}>
                {item.type}
              </span>
            </div>
            <div className="space-y-1">
              <h4 className="text-[13px] font-bold text-foreground leading-tight">{item.title}</h4>
              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">{item.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-8 rounded-full border-2 border-background bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          <p className="text-[11px] font-bold text-foreground">+{Math.round(totalStudents * 0.03)} more at risk</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-xl font-bold text-[11px] border-sidebar-border hover:bg-primary/10 hover:text-primary transition-all">
          Take Action
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
