import { motion } from "motion/react";
import { CheckCircle2, AlertCircle, FileText, UserMinus, DollarSign, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "success",
    title: "₹12,000 received (Fees)",
    time: "2 hours ago",
    icon: DollarSign,
    color: "text-green-500",
    bg: "bg-green-500/10"
  },
  {
    id: 2,
    type: "info",
    title: "45 students marked absent",
    time: "4 hours ago",
    icon: UserMinus,
    color: "text-blue-500",
    bg: "bg-blue-500/10"
  },
  {
    id: 3,
    type: "success",
    title: "3 invoices generated",
    time: "5 hours ago",
    icon: FileText,
    color: "text-purple-500",
    bg: "bg-purple-500/10"
  },
  {
    id: 4,
    type: "warning",
    title: "2 expenses pending approval",
    time: "6 hours ago",
    icon: AlertCircle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10"
  }
];

export function DailyOperationsFeed() {
  return (
    <div className="p-6 rounded-2xl bg-card border border-sidebar-border shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Today's Activity</h3>
        </div>
        <button className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline">View All</button>
      </div>
      
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex gap-4 group"
          >
            <div className="relative flex flex-col items-center">
              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110 duration-300", activity.bg, activity.color)}>
                <activity.icon className="h-4 w-4" />
              </div>
              {i !== activities.length - 1 && (
                <div className="w-px h-full bg-sidebar-border mt-2" />
              )}
            </div>
            <div className="pb-4 space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-bold text-foreground leading-none">{activity.title}</h4>
                <span className="text-[10px] font-medium text-muted-foreground/60">{activity.time}</span>
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">Operation completed successfully</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
