import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ClipboardList, LayoutGrid, FileText, UserCheck, ClipboardCheck, BarChart3, Check,
} from "lucide-react";

// The end-to-end offline-exam pipeline. Rendered as a clickable stepper at the top
// of each exam page so the admin always sees where they are and what comes next.
export const EXAM_STEPS = [
  { id: "schedule",     label: "Exam Schedule",   url: "/exams/setup",        icon: ClipboardList,  hint: "Create exam + subjects" },
  { id: "rooms",        label: "Room Allocation", url: "/exams/seating",      icon: LayoutGrid,     hint: "Halls + seating plan" },
  { id: "hall-tickets", label: "Hall Tickets",    url: "/exams/hall-tickets", icon: FileText,       hint: "Print admit cards" },
  { id: "invigilators", label: "Invigilators",    url: "/exams/invigilators", icon: UserCheck,      hint: "Duty roster" },
  { id: "attendance",   label: "Attendance",      url: "/exams/attendance",   icon: ClipboardCheck, hint: "Mark present/absent" },
  { id: "results",      label: "Marks & Results", url: "/exams/marks",        icon: BarChart3,      hint: "Enter & publish" },
] as const;

export type ExamStepId = (typeof EXAM_STEPS)[number]["id"];

export function ExamWorkflowSteps({ current }: { current: ExamStepId }) {
  const nav = useNavigate();
  const currentIdx = EXAM_STEPS.findIndex(s => s.id === current);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 print:hidden">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Examination Workflow</p>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {EXAM_STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.id} className="flex items-center shrink-0">
              <button
                onClick={() => nav(s.url)}
                title={s.hint}
                className={cn(
                  "group flex items-center gap-2 rounded-xl px-3 py-2 border transition-all text-left",
                  active ? "border-[#7C3AED] bg-violet-50 ring-2 ring-violet-100"
                    : done ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <span className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black",
                  active ? "bg-[#7C3AED] text-white"
                    : done ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-500"
                )}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </span>
                <div className="pr-1">
                  <p className={cn("text-[12px] font-bold leading-tight whitespace-nowrap",
                    active ? "text-[#7C3AED]" : done ? "text-emerald-700" : "text-slate-700")}>
                    {i + 1}. {s.label}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight whitespace-nowrap">{s.hint}</p>
                </div>
              </button>
              {i < EXAM_STEPS.length - 1 && (
                <div className={cn("w-4 h-0.5 mx-0.5 shrink-0", i < currentIdx ? "bg-emerald-300" : "bg-slate-200")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
