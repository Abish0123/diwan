import { LeaveRequest, LeaveStatus, ApprovalStep } from "@/types";
import { advanceChain, rejectChain } from "@/lib/approvalChain";
import { leaveRequestRepository, LeaveRequestRepository } from "@/repositories/LeaveRequestRepository";
import { smartDb } from "@/lib/localDb";

// Business logic previously inline in LeaveContext.tsx's approveLeaveStep/
// rejectLeave callbacks — moved here so it's callable (and testable) without
// rendering a React component, and so Phase 4 (Purchase/GatePass approval
// unification) has a proven service to model itself on rather than a
// component-embedded implementation to reverse-engineer.
//
// No React import anywhere in this file — that's the point of a service.
export class LeaveApprovalService {
  constructor(private readonly repo: LeaveRequestRepository) {}

  // Advances the chain by one step (or fully approves on the last step),
  // persists it, and notifies the requester. Returns the updated request so
  // the caller (LeaveContext) can decide how to refresh its own state.
  async approveStep(leave: LeaveRequest, actorName: string, remark = ""): Promise<LeaveRequest> {
    const chain: ApprovalStep[] = leave.approvalChain ?? [];
    const stepIdx = leave.currentStep ?? 0;
    const now = new Date().toISOString();

    const { updatedChain, nextStepIdx, isLastStep, overallStatus } = advanceChain(
      chain, stepIdx, actorName, remark, now,
    );

    const updated = await this.repo.update(leave.id, {
      approvalChain: updatedChain,
      currentStep: isLastStep ? stepIdx : nextStepIdx,
      status: overallStatus,
      approverRemark: remark,
      updatedAt: now,
    } as Partial<LeaveRequest>);

    this.notifyStatus(
      leave,
      isLastStep ? "approved" : "step-approved",
      stepIdx,
      updatedChain[nextStepIdx]?.label,
    );

    // Real Leave -> Communication Calendar sync, only once fully approved
    // (not on intermediate chain steps) — previously approved leave had no
    // presence on the shared calendar at all. Visible to Staff so
    // colleagues/HR can see who's actually out for coverage planning,
    // rather than a private, invisible-to-everyone-else approval record.
    if (isLastStep) void this.syncLeaveCalendarEvent(leave);

    return updated;
  }

  private syncLeaveCalendarEvent(leave: LeaveRequest): void {
    const id = `leave-cal-${leave.id}`;
    void smartDb.create("CalendarEvent", {
      title: `${leave.staffName || "Staff"} — ${leave.type}`,
      description: `Approved leave (${leave.days} day${leave.days === 1 ? "" : "s"}).`,
      date: leave.startDate,
      time: "All day",
      location: "",
      category: "Holidays",
      color: "bg-rose-500",
      status: "Published",
      targetAudience: "Staff",
      targetClass: "",
      source: "Leave",
    }, id).catch(() => {});
  }

  // Rejects at the current step — rejection always terminates the chain.
  async reject(leave: LeaveRequest, actorName: string, remark = ""): Promise<LeaveRequest> {
    const chain: ApprovalStep[] = leave.approvalChain ?? [];
    const stepIdx = leave.currentStep ?? 0;
    const now = new Date().toISOString();

    const { updatedChain } = rejectChain(chain, stepIdx, actorName, remark, now);

    const updated = await this.repo.update(leave.id, {
      approvalChain: updatedChain,
      status: "Rejected" as LeaveStatus,
      approverRemark: remark,
      updatedAt: now,
    } as Partial<LeaveRequest>);

    this.notifyStatus(leave, "rejected", stepIdx);

    return updated;
  }

  // Unchanged from the original LeaveContext.tsx notifyLeaveStatus — same
  // deterministic id scheme (upsert-safe on retry), same message copy.
  private notifyStatus(
    leave: LeaveRequest,
    outcome: "step-approved" | "approved" | "rejected",
    stepIdx: number,
    nextApproverLabel?: string,
  ): void {
    const id = `leave-${leave.id}-${outcome}-step${stepIdx}`;
    const range = `${leave.startDate} → ${leave.endDate}`;
    const title =
      outcome === "approved" ? "Leave request approved"
      : outcome === "rejected" ? "Leave request rejected"
      : "Leave request update";
    const message =
      outcome === "approved"
        ? `Your ${leave.type} request (${range}) has been fully approved.`
        : outcome === "rejected"
        ? `Your ${leave.type} request (${range}) was rejected.`
        : `Your ${leave.type} request (${range}) was approved at step ${stepIdx + 1} and forwarded to ${nextApproverLabel ?? "the next approver"}.`;

    void smartDb.create("Notification", {
      id,
      recipientUid: leave.uid,
      category: leave.category === "student" ? "student" : "staff",
      entity: "LeaveRequest",
      type: "leave_status",
      title,
      message,
      createdAt: new Date().toISOString(),
      time: new Date().toISOString(),
      read: false,
    }, id).catch(() => { /* non-fatal — the approval itself already persisted */ });
  }
}

export const leaveApprovalService = new LeaveApprovalService(leaveRequestRepository);
