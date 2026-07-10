import { BaseRepository } from "./base/Repository";
import { LeaveRequest } from "@/types";

// Entity-specific repository for leave_requests — wraps the generic
// BaseRepository and adds the one query LeaveContext actually needs
// (scope-by-uid is already handled by BaseRepository.getAll's scopeUid
// param; this class exists so LeaveContext/LeaveApprovalService depend on
// a typed LeaveRequest surface instead of calling smartDb("leave_requests", ...)
// directly).
export class LeaveRequestRepository extends BaseRepository<LeaveRequest> {
  constructor() {
    super("leave_requests");
  }
}

export const leaveRequestRepository = new LeaveRequestRepository();
