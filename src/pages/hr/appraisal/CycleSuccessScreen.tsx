import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (!result) return null;

  const facts = [
    {
      icon: Users,
      text:
        result.employeesEnrolled === 1
          ? t("admin.hr.appraisal.cycleSuccessScreen.employeesEnrolledSingular", { count: result.employeesEnrolled })
          : t("admin.hr.appraisal.cycleSuccessScreen.employeesEnrolledPlural", { count: result.employeesEnrolled }),
    },
    {
      icon: GitBranch,
      text:
        result.reviewersAssigned === 1
          ? t("admin.hr.appraisal.cycleSuccessScreen.reviewersAssignedSingular", { count: result.reviewersAssigned })
          : t("admin.hr.appraisal.cycleSuccessScreen.reviewersAssignedPlural", { count: result.reviewersAssigned }),
    },
    ...(result.notifications.inAppSent > 0 || result.notifications.emailSent > 0
      ? [
          {
            icon: Mail,
            text:
              result.notifications.emailSent === 1
                ? t("admin.hr.appraisal.cycleSuccessScreen.notificationsSentSingular", {
                    inApp: result.notifications.inAppSent,
                    email: result.notifications.emailSent,
                  })
                : t("admin.hr.appraisal.cycleSuccessScreen.notificationsSentPlural", {
                    inApp: result.notifications.inAppSent,
                    email: result.notifications.emailSent,
                  }),
          },
        ]
      : []),
    ...(result.aiEnabled
      ? [{ icon: Sparkles, text: t("admin.hr.appraisal.cycleSuccessScreen.aiEnabled") }]
      : []),
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
        <DialogTitle className="text-xl font-black text-slate-900">{t("admin.hr.appraisal.cycleSuccessScreen.pageTitle")}</DialogTitle>
        <p className="text-sm text-slate-500 mt-1">{result.cycleName}</p>

        <div className="mt-6 space-y-2.5 text-start">
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
          <Button onClick={onViewCycle} className="bg-purple-600 hover:bg-purple-700">{t("admin.hr.appraisal.cycleSuccessScreen.viewCycle")}</Button>
          <Button variant="outline" onClick={onAssignReviewers}>{t("admin.hr.appraisal.cycleSuccessScreen.assignReviewers")}</Button>
          <Button variant="ghost" onClick={onClose}>{t("admin.hr.appraisal.cycleSuccessScreen.close")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
