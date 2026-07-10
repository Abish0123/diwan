import { ApprovalStep, LeaveStatus } from "@/types";

// Shared Chain-of-Responsibility primitive for any ordered-approver workflow
// (Leave today; Purchase and GatePass are meant to migrate onto this same
// shape in a later phase — see the architecture audit). Pure and
// framework-free on purpose: no React, no fetch, no side effects, so it's
// trivially unit-testable and reusable from any context/service.

export interface ChainAdvanceResult {
  updatedChain: ApprovalStep[];
  nextStepIdx: number;
  isLastStep: boolean;
  overallStatus: LeaveStatus;
}

// Marks the step at `stepIdx` Approved and reports whether the chain is now
// fully approved (isLastStep) or should move to the next approver.
export function advanceChain(
  chain: ApprovalStep[],
  stepIdx: number,
  actorName: string,
  remark: string,
  now: string,
): ChainAdvanceResult {
  const updatedChain = chain.map((step, i) =>
    i === stepIdx
      ? { ...step, status: "Approved" as const, remark: remark || "", actedAt: now, actedBy: actorName }
      : step
  );
  const nextStepIdx = stepIdx + 1;
  const isLastStep = nextStepIdx >= updatedChain.length;
  const overallStatus: LeaveStatus = isLastStep ? "Approved" : "Pending";
  return { updatedChain, nextStepIdx, isLastStep, overallStatus };
}

// Marks the step at `stepIdx` Rejected. Rejection always terminates the
// chain immediately — there is no "reject at step 2, still let step 3
// review it" case in any of this app's approval workflows.
export function rejectChain(
  chain: ApprovalStep[],
  stepIdx: number,
  actorName: string,
  remark: string,
  now: string,
): { updatedChain: ApprovalStep[] } {
  const updatedChain = chain.map((step, i) =>
    i === stepIdx
      ? { ...step, status: "Rejected" as const, remark: remark || "", actedAt: now, actedBy: actorName }
      : step
  );
  return { updatedChain };
}
