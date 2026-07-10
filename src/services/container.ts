// Lightweight, framework-free DI: services are wired to their concrete
// repository dependencies once, here, and consumers import the wired
// instance instead of constructing their own. This is deliberately NOT a DI
// framework (no decorators, no reflection, no InversifyJS/tsyringe) — React
// Context already plays that role at the component-tree level for this app;
// this module is the equivalent seam for plain (non-React) service/
// repository wiring. Swapping an implementation for tests means passing a
// fake into the class constructor directly (see LeaveApprovalService.test.ts)
// rather than reaching through this container, which only matters for the
// app's real runtime wiring.
import { leaveRequestRepository } from "@/repositories/LeaveRequestRepository";
import { LeaveApprovalService } from "@/services/leave/LeaveApprovalService";

export const services = {
  leaveApproval: new LeaveApprovalService(leaveRequestRepository),
};
