import { motion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Users, GitBranch, Mail, Sparkles } from "lucide-react";
import { ConfettiBurst } from "./ConfettiBurst";
import { CreationResult } from "./createAppraisalCycle";

interface Props {
  open: boolean;
  result: CreationResult | null;
  onViewCycle: () => void;
  onAssignReviewers: () => void;
  onClose: () => void;
}

export function CycleSuccessScreen({ open, result, onViewCycle, onAssignReviewers, onClose }: Props) {
  if (!result) return null;

  const facts = [
    { icon: Users, text: `${result.employeesEnrolled} employee${result.employeesEnrolled === 1 ? "" : "s"} enrolled` },
    { icon: GitBranch, text: `${result.reviewersAssigned} reviewer${result.reviewersAssigned === 1 ? "" : "s"} assigned` },
    ...(result.notifications.inAppSent > 0 || result.notifications.emailSent > 0
      ? [{ icon: Mail, text: `${result.notifications.inAppSent} in-app + ${result.notifications.emailSent} email notification${result.notifications.emailSent === 1 ? "" : "s"} sent` }]
      : []),
    ...(result.aiEnabled ? [{ icon: Sparkles, text: "AI-assisted review tools enabled for this cycle" }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && <ConfettiBurst />}
      <DialogContent className="sm:max-w-[440px] text-center py-8">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4"
        >
          <Check className="w-8 h-8 text-emerald-600" />
        </motion.div>
        <DialogTitle className="text-xl font-black text-slate-900">Performance Appraisal Created</DialogTitle>
        <p className="text-sm text-slate-500 mt-1">{result.cycleName}</p>

        <div className="mt-6 space-y-2.5 text-left">
          {facts.map((f, i) => (
            <motion.div
              key={f.text}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.25 }}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5"
            >
              <f.icon className="h-4 w-4 text-purple-600 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-700">{f.text}</span>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onViewCycle} className="bg-purple-600 hover:bg-purple-700">View Cycle</Button>
          <Button variant="outline" onClick={onAssignReviewers}>Assign Reviewers</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
