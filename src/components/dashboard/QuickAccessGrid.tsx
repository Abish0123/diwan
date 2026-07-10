import { motion } from "motion/react";
import { Users, UserPlus, UserCheck, Calendar, FileText, ClipboardList, Award, DollarSign, Briefcase, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ACTIONS = [
  { label: "All Students", icon: Users, color: "bg-blue-50 text-blue-600", url: "/students" },
  { label: "Admissions", icon: UserPlus, color: "bg-emerald-50 text-emerald-600", url: "/admissions" },
  { label: "Attendance", icon: UserCheck, color: "bg-amber-50 text-amber-600", url: "/attendance" },
  { label: "Timetable", icon: Calendar, color: "bg-violet-50 text-violet-600", url: "/timetable" },
  { label: "Assignments", icon: FileText, color: "bg-rose-50 text-rose-600", url: "/assignments" },
  { label: "Gradebook", icon: ClipboardList, color: "bg-cyan-50 text-cyan-600", url: "/academics/gradebook" },
  { label: "Exams", icon: Award, color: "bg-fuchsia-50 text-fuchsia-600", url: "/exams/setup" },
  { label: "Fee Collection", icon: DollarSign, color: "bg-teal-50 text-teal-600", url: "/finance/fees" },
  { label: "Staff Directory", icon: Briefcase, color: "bg-orange-50 text-orange-600", url: "/hr/staff" },
  { label: "Reports", icon: BarChart3, color: "bg-indigo-50 text-indigo-600", url: "/analytics" },
];

export function QuickAccessGrid() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.65, duration: 0.4 }}
      className="premium-card p-5"
    >
      <h3 className="text-sm font-bold text-foreground font-heading mb-4">Quick Access</h3>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {ACTIONS.map((action, i) => (
          <motion.button
            key={action.label}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.03, duration: 0.25 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate(action.url)}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-slate-50 transition-colors group text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <div className={`h-11 w-11 rounded-xl ${action.color} flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-[8deg] transition-transform shadow-sm`}>
              <action.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">{action.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
