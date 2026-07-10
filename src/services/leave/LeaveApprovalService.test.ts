import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeaveApprovalService } from "./LeaveApprovalService";
import { LeaveRequestRepository } from "@/repositories/LeaveRequestRepository";
import { LeaveRequest } from "@/types";

// Mock smartDb.create so the notification side effect doesn't hit the
// network during a unit test — this is exactly the seam Repository/Service
// extraction is supposed to buy: business logic testable without a server.
vi.mock("@/lib/localDb", () => ({
  smartDb: { create: vi.fn().mockResolvedValue({}) },
}));

// A fake repository standing in for the real one — proving the DI payoff:
// LeaveApprovalService takes its repository as a constructor argument, so
// tests never touch smartDb/fetch/MySQL at all.
class FakeLeaveRequestRepository extends LeaveRequestRepository {
  public updateCalls: { id: string; data: Partial<LeaveRequest> }[] = [];
  async update(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest> {
    this.updateCalls.push({ id, data });
    return { id, ...data } as LeaveRequest;
  }
}

function makeLeave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "LR-1",
    staffId: "S-1",
    staffName: "Ms. Ali",
    type: "Sick Leave",
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    reason: "flu",
    status: "Pending",
    days: 3,
    appliedOn: "2026-07-09",
    uid: "ms.ali@school.test",
    createdAt: "2026-07-09T00:00:00.000Z",
    approvalChain: [
      { roleId: "teacher", label: "Class Teacher", status: "Pending" },
      { roleId: "principal", label: "Principal", status: "Pending" },
    ],
    currentStep: 0,
    ...overrides,
  };
}

describe("LeaveApprovalService", () => {
  let repo: FakeLeaveRequestRepository;
  let service: LeaveApprovalService;

  beforeEach(() => {
    repo = new FakeLeaveRequestRepository();
    service = new LeaveApprovalService(repo);
  });

  it("approveStep persists the advanced chain and keeps status Pending when steps remain", async () => {
    const leave = makeLeave();
    await service.approveStep(leave, "Mr. Khan", "ok");

    expect(repo.updateCalls).toHaveLength(1);
    const { data } = repo.updateCalls[0];
    expect(data.status).toBe("Pending");
    expect(data.currentStep).toBe(1);
    expect((data.approvalChain as any)[0]).toMatchObject({ status: "Approved", actedBy: "Mr. Khan" });
  });

  it("approveStep flips overall status to Approved on the final step", async () => {
    const leave = makeLeave({ currentStep: 1 });
    await service.approveStep(leave, "Dr. Rao", "");

    const { data } = repo.updateCalls[0];
    expect(data.status).toBe("Approved");
  });

  it("reject sets status Rejected regardless of which step it's rejected at", async () => {
    const leave = makeLeave({ currentStep: 0 });
    await service.reject(leave, "Mr. Khan", "not eligible");

    const { data } = repo.updateCalls[0];
    expect(data.status).toBe("Rejected");
    expect((data.approvalChain as any)[0]).toMatchObject({ status: "Rejected", remark: "not eligible" });
  });

  it("calls the repository with the correct leave id", async () => {
    const leave = makeLeave({ id: "LR-42" });
    await service.approveStep(leave, "Someone");
    expect(repo.updateCalls[0].id).toBe("LR-42");
  });
});
