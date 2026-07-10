import { type ReactNode, useMemo } from "react";
import { useExams, getGradePlans, type ExamRecord } from "@/lib/examStore";
import { getSeating, useSeating } from "@/lib/seatingStore";
import { ExamWizardSteps, WIZARD_STEPS, type WizardStepId } from "./ExamWizardSteps";
import { RoomAllocationContent } from "@/pages/exams/RoomAllocation";
import { HallTicketsContent } from "@/pages/exams/HallTickets";
import { InvigilatorAllocationContent } from "@/pages/exams/InvigilatorAllocation";
import { ExamAttendanceContent } from "@/pages/exams/ExamAttendance";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

function totalSlots(e: ExamRecord): number {
  return getGradePlans(e).reduce((a, p) => a + p.slots.length, 0);
}

// Which steps are reachable for the currently-selected exam. Reuses the exact
// same values each standalone page already computed for its own empty state
// (getSeating(...).rooms.length > 0, exam.status === "Completed"/"Published",
// etc.) — see ExamSetupWizard's sibling content components for the originals.
export function computeUnlockedSteps(exam: ExamRecord | undefined): Set<WizardStepId> {
  const unlocked = new Set<WizardStepId>(["schedule"]);
  if (!exam) return unlocked;
  const hasSlots = totalSlots(exam) > 0;
  const hasSeating = getSeating(exam.id).rooms.length > 0;
  if (hasSlots) unlocked.add("rooms");
  if (hasSeating) { unlocked.add("hall-tickets"); unlocked.add("invigilators"); }
  if (hasSlots) unlocked.add("attendance");
  return unlocked;
}

// The single centralized exam-operations flow at /exams/setup. Owns nothing
// about any individual step's business logic — each step's real UI/state
// lives in its own extracted "...Content" component (same one the old
// standalone route still renders, via a thin redirect-free shim, for
// backward compatibility). This shell only owns: which exam is selected,
// which step is active, and whether the next step is allowed yet.
export function ExamSetupWizard({
  examId, onExamIdChange, step, onStepChange, children,
}: {
  examId: string;
  onExamIdChange: (id: string) => void;
  step: WizardStepId;
  onStepChange: (step: WizardStepId) => void;
  children: ReactNode; // the existing Exams.tsx "schedule" tab body
}) {
  const exams = useExams();
  const selectedExam = exams.find(e => e.id === examId);
  // computeUnlockedSteps reads seating via getSeating(exam.id) internally, but
  // seating lives in a separate store from `exams` — subscribe to its live
  // updates here too, or saving a room plan never unlocks the next step until
  // something unrelated happens to re-render with a new `selectedExam`.
  const seating = useSeating(examId);
  const unlockedSteps = useMemo(() => computeUnlockedSteps(selectedExam), [selectedExam, seating]);

  const currentIdx = WIZARD_STEPS.findIndex(s => s.id === step);
  const prevStep = WIZARD_STEPS[currentIdx - 1];
  const nextStep = WIZARD_STEPS[currentIdx + 1];
  const nextUnlocked = nextStep ? unlockedSteps.has(nextStep.id) : false;

  return (
    <div className="space-y-5">
      <ExamWizardSteps current={step} unlockedSteps={unlockedSteps} onStepChange={onStepChange} />

      {step === "schedule" && children}
      {step === "rooms" && <RoomAllocationContent examId={examId} onExamIdChange={onExamIdChange} />}
      {step === "hall-tickets" && <HallTicketsContent examId={examId} onExamIdChange={onExamIdChange} />}
      {step === "invigilators" && <InvigilatorAllocationContent examId={examId} onExamIdChange={onExamIdChange} />}
      {step === "attendance" && <ExamAttendanceContent examId={examId} onExamIdChange={onExamIdChange} />}

      {/* One clear forward action per step — the "achieve success without
          hassle" flow the wizard exists for. Disabled (with a reason) rather
          than hidden, so the admin always sees what's next and why they can't
          get there yet. */}
      {(prevStep || nextStep) && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-4 print:hidden">
          {prevStep ? (
            <button
              onClick={() => onStepChange(prevStep.id)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Back to {prevStep.label}
            </button>
          ) : <span />}
          {nextStep && (
            <button
              onClick={() => nextUnlocked && onStepChange(nextStep.id)}
              disabled={!nextUnlocked}
              title={!nextUnlocked ? `Complete this step before continuing to ${nextStep.label}` : undefined}
              className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!nextUnlocked && <Lock className="h-3.5 w-3.5" />}
              Continue to {nextStep.label} <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
