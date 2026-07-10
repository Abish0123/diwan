import { motion } from "motion/react";
import { AlertCircle, TrendingUp, Zap, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actions = [
  {
    id: 1,
    type: "critical",
    title: "23 Students Pending Fees",
    description: "Fee collection is 15% lower than last month.",
    action: "Send reminders now",
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20"
  },
  {
    id: 2,
    type: "warning",
    title: "Attendance dropping in Class 8",
    description: "Average attendance fell to 72% this week.",
    action: "View students",
    icon: Zap,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20"
  },
  {
    id: 3,
    type: "insight",
    title: "Transport budget exceeded by 18%",
    description: "Fuel costs are higher than projected.",
    action: "Review expenses",
    icon: TrendingUp,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20"
  }
];

export function AiActionBar() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {actions.map((action, i) => (
        <motion.div
          key={action.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={cn(
            "p-4 rounded-2xl border flex flex-col justify-between group hover:shadow-lg transition-all duration-300",
            action.bg,
            action.border
          )}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-lg bg-white/50 shadow-sm", action.color)}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className={cn("text-[10px] font-black uppercase tracking-wider", action.color)}>
                {action.type}
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground leading-tight">{action.title}</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">{action.description}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn(
              "mt-4 w-full justify-between h-9 rounded-xl font-bold text-[11px] group-hover:bg-white/50 transition-all",
              action.color
            )}
          >
            {action.action}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>
      ))}
    </div>
  );
}
