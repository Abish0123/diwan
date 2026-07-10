import { cn } from "@/lib/utils";
import {
  ClipboardList, LayoutGrid, FileText, UserCheck, ClipboardCheck, Check, Lock,
} from "lucide-react";

// The real steps of running an exam end-to-end, each mapped to the content
// component the wizard shell renders for it. Mark Entry and Results are
// deliberately NOT steps here — once the exam is over, answer sheets go to
// the assigned class/subject teacher, who enters marks in their own portal
// (Teacher > Exams). The Gradebook then pulls those real marks automatically;
// this admin wizard only owns exam logistics (schedule/rooms/tickets/
// invigilators/attendance), never marks entry.
export const WIZARD_STEPS = [
  { id: "schedule",     label: "Exam Schedule",   icon: ClipboardList,  hint: "Create exam + subjects" },
  { id: "rooms",        label: "Room Allocation", icon: LayoutGrid,     hint: "Halls + seating plan" },
  { id: "hall-tickets", label: "Hall Tickets",    icon: FileText,       hint: "Print admit cards" },
  { id: "invigilators", label: "Invigilators",    icon: UserCheck,      hint: "Duty roster" },
  { id: "attendance",   label: "Attendance",      icon: ClipboardCheck, hint: "Mark present/absent" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export function ExamWizardSteps({
  current, unlockedSteps, onStepChange,
}: {
  current: WizardStepId;
  unlockedSteps: Set<WizardStepId>;
  onStepChange: (id: WizardStepId) => void;
}) {
  const currentIdx = WIZARD_STEPS.findIndex(s => s.id === current);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 print:hidden">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Exam Operations</p>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const unlocked = unlockedSteps.has(s.id);
          return (
            <div key={s.id} className="flex items-center shrink-0">
              <button
                onClick={() => unlocked && onStepChange(s.id)}
                disabled={!unlocked}
                title={unlocked ? s.hint : `Complete the previous steps first — ${s.hint} isn't ready yet`}
                className={cn(
                  "group flex items-center gap-2 rounded-xl px-3 py-2 border transition-all text-left",
                  !unlocked ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                    : active ? "border-[#7C3AED] bg-violet-50 ring-2 ring-violet-100"
                    : done ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <span className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black",
                  !unlocked ? "bg-slate-200 text-slate-400"
                    : active ? "bg-[#7C3AED] text-white"
                    : done ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-500"
                )}>
                  {!unlocked ? <Lock className="h-3 w-3" /> : done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </span>
                <div className="pr-1">
                  <p className={cn("text-[12px] font-bold leading-tight whitespace-nowrap",
                    !unlocked ? "text-slate-400" : active ? "text-[#7C3AED]" : done ? "text-emerald-700" : "text-slate-700")}>
                    {i + 1}. {s.label}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight whitespace-nowrap">{s.hint}</p>
                </div>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={cn("w-4 h-0.5 mx-0.5 shrink-0", i < currentIdx ? "bg-emerald-300" : "bg-slate-200")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
