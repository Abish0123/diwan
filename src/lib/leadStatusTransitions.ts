import { LeadStatus } from "@/types/admissions";

// State pattern for the admissions pipeline: a small helper that classifies
// a status transition, rather than a rigid whitelist that blocks it.
//
// Why not a hard block: the "Move to Stage" dropdown (LeadCard.tsx) already
// lets the admissions team jump to ANY stage directly — including backward
// moves to correct a mistake (e.g. a lead was marked Enrolled by accident)
// and forward skips for real shortcuts (e.g. a walk-in whose documents were
// already verified in person). A rigid from->to whitelist would break that
// existing, relied-on functionality. What moveLead() actually needed was
// visibility into "this skips N stages" so a genuinely accidental jump
// (Enquiry -> Enrolled from a stray drag-drop) surfaces before it happens,
// not a wall that also blocks legitimate corrections.
export const LEAD_STAGE_ORDER: LeadStatus[] = [
  "Enquiry", "Form Sent", "Form Submitted", "Payment Done", "Exam",
  "Interview", "Doc Verification", "School Fee", "Section Allocation", "Enrolled",
];

export type TransitionDirection = "forward" | "backward" | "same" | "unknown";

export interface LeadTransitionInfo {
  direction: TransitionDirection;
  // Stages strictly between `from` and `to`, exclusive — only populated for
  // forward moves that skip at least one stage.
  skippedStages: LeadStatus[];
}

// `unknown` covers a status outside LEAD_STAGE_ORDER (a legacy/custom value)
// or no previous status at all (e.g. a lead just created) — in both cases
// there's nothing meaningful to compare against, so nothing is flagged.
export function describeLeadTransition(from: LeadStatus | undefined, to: LeadStatus): LeadTransitionInfo {
  if (!from) return { direction: "unknown", skippedStages: [] };
  const fromIdx = LEAD_STAGE_ORDER.indexOf(from);
  const toIdx = LEAD_STAGE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return { direction: "unknown", skippedStages: [] };
  if (fromIdx === toIdx) return { direction: "same", skippedStages: [] };
  if (toIdx > fromIdx) {
    return { direction: "forward", skippedStages: LEAD_STAGE_ORDER.slice(fromIdx + 1, toIdx) };
  }
  return { direction: "backward", skippedStages: [] };
}
