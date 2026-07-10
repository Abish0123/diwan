import { motion } from "framer-motion";
import { Plus, UserPlus, CreditCard, FileText, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export const QuickActions = () => {
  const navigate = useNavigate();

  const actions = [
    { 
      label: "Add Student", 
      icon: UserPlus, 
      color: "bg-blue-50 text-purple-600", 
      onClick: () => navigate("/students/admission") 
    },
    { 
      label: "Record Revenue", 
      icon: CreditCard, 
      color: "bg-emerald-50 text-emerald-600", 
      onClick: () => navigate("/finance/revenue") 
    },
    { 
      label: "Create Invoice", 
      icon: FileText, 
      color: "bg-amber-50 text-amber-600", 
      onClick: () => navigate("/finance/invoices") 
    },
    { 
      label: "Send Notice", 
      icon: Bell, 
      color: "bg-rose-50 text-rose-600", 
      onClick: () => navigate("/communication")
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="premium-card p-5 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Quick Actions</h3>
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((action, i) => (
          <motion.button
            key={action.label}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + (i * 0.05) }}
            onClick={action.onClick}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-secondary hover:border-primary/20 transition-all duration-200 group text-left"
          >
            <div className={`h-10 w-10 rounded-lg ${action.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-foreground leading-tight">{action.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};
