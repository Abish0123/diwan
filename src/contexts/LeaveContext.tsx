/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from '@/firebase';
import { LeaveRequest, LeaveStatus, ApprovalStep } from '@/types';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { canApproveLeave, buildApprovalChain } from '@/lib/roles';

interface LeaveContextType {
  leaves: LeaveRequest[];
  loading: boolean;
  canSeeAllLeaves: boolean;
  applyForLeave: (leave: Omit<LeaveRequest, 'id' | 'uid' | 'createdAt' | 'status' | 'appliedOn'>) => Promise<void>;
  updateLeaveStatus: (id: string, status: LeaveStatus) => Promise<void>;
  approveLeaveStep: (id: string, remark?: string) => Promise<void>;
  rejectLeave: (id: string, remark?: string) => Promise<void>;
  deleteLeaveRequest: (id: string) => Promise<void>;
}

const LeaveContext = createContext<LeaveContextType | undefined>(undefined);

// Notify the requester when their leave moves through the approval chain.
// Deterministic id (leave id + outcome + step) so re-running the same action
// upserts instead of spamming duplicate rows — mirrors examStore's
// notifyNewlyGradableTeachers pattern. recipientUid targets leave.uid, the
// requester's own auth uid stamped at submission time.
function notifyLeaveStatus(
  leave: LeaveRequest,
  outcome: 'step-approved' | 'approved' | 'rejected',
  stepIdx: number,
  nextApproverLabel?: string,
) {
  const id = `leave-${leave.id}-${outcome}-step${stepIdx}`;
  const range = `${leave.startDate} → ${leave.endDate}`;
  const title =
    outcome === 'approved' ? 'Leave request approved'
    : outcome === 'rejected' ? 'Leave request rejected'
    : 'Leave request update';
  const message =
    outcome === 'approved'
      ? `Your ${leave.type} request (${range}) has been fully approved.`
      : outcome === 'rejected'
      ? `Your ${leave.type} request (${range}) was rejected.`
      : `Your ${leave.type} request (${range}) was approved at step ${stepIdx + 1} and forwarded to ${nextApproverLabel ?? 'the next approver'}.`;
  void smartDb.create('Notification', {
    id,
    recipientUid: leave.uid,
    category: leave.category === 'student' ? 'student' : 'staff',
    entity: 'LeaveRequest',
    type: 'leave_status',
    title,
    message,
    createdAt: new Date().toISOString(),
    time: new Date().toISOString(),
    read: false,
  }, id).catch(() => { /* non-fatal — the approval itself already persisted */ });
}

export const LeaveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Admins/principals/HR/vice-principals are approvers — they need the whole queue.
  // Everyone else (teachers, students) only ever sees their own requests.
  const canSeeAllLeaves = canApproveLeave(role);

  const fetchLeaves = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll('leave_requests', canSeeAllLeaves ? undefined : user.uid);
      // The local data API does not enforce the uid filter server-side, so scope
      // here too: a non-approver must only ever see the requests they raised.
      const scoped = canSeeAllLeaves
        ? data
        : (Array.isArray(data) ? data.filter((l: LeaveRequest) => l.uid === user.uid) : []);
      setLeaves(scoped);
    } catch (error) {
      console.error("Error fetching leaves:", error);
    } finally {
      setLoading(false);
    }
  }, [user, canSeeAllLeaves]);

  useEffect(() => {
    if (!user) {
      setLeaves([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || user.uid.startsWith('demo-')) {
      fetchLeaves();
      return;
    }

    setLoading(true);
    // Approvers subscribe to the full collection; individual users are scoped to
    // their own uid so they never see other people's leave in the cloud path.
    const q = canSeeAllLeaves
      ? query(collection(db, 'leave_requests'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'leave_requests'), where('uid', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leaveData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LeaveRequest[];
      // The scoped query can't also orderBy without a composite index, so sort here.
      leaveData.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      setLeaves(leaveData);
      setLoading(false);
    }, () => {
      console.warn("Firestore snapshot failed for leaves, falling back to local fetch.");
      fetchLeaves();
    });

    return () => unsubscribe();
  }, [user, role, canSeeAllLeaves, fetchLeaves]);

  const applyForLeave = useCallback(async (leave: Omit<LeaveRequest, 'id' | 'uid' | 'createdAt' | 'status' | 'appliedOn'>) => {
    if (!user) {
      toast.error("You must be logged in to apply for leave");
      return;
    }

    try {
      const category = leave.category ?? 'staff';
      await smartDb.create('leave_requests', {
        ...leave,
        status: 'Pending',
        appliedOn: new Date().toISOString().split('T')[0],
        uid: user.uid,
        createdAt: new Date().toISOString(),
        approvalChain: buildApprovalChain(category),
        currentStep: 0,
      });
      if (!isFirestoreWorking) fetchLeaves();
      toast.success("Leave application submitted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leave_requests');
    }
  }, [user, fetchLeaves]);

  // Legacy: force-set a status without chain logic (used by bulk/admin actions).
  const updateLeaveStatus = useCallback(async (id: string, status: LeaveStatus) => {
    try {
      await smartDb.update('leave_requests', id, { status, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchLeaves();
      toast.success(`Leave request ${status.toLowerCase()} successfully`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leave_requests/${id}`);
    }
  }, [fetchLeaves]);

  // Advance the approval chain by one step. If the current step is the last,
  // the overall status flips to "Approved". Otherwise it stays "Pending" and
  // the next approver in the chain becomes responsible.
  const approveLeaveStep = useCallback(async (id: string, remark?: string) => {
    if (!user) return;
    const leave = leaves.find(l => l.id === id);
    if (!leave) return;

    const chain: ApprovalStep[] = leave.approvalChain ?? [];
    const stepIdx = leave.currentStep ?? 0;
    const now = new Date().toISOString();
    const actorName = (user as { displayName?: string }).displayName || user.uid;

    const updatedChain = chain.map((step, i) =>
      i === stepIdx
        ? { ...step, status: 'Approved' as const, remark: remark || '', actedAt: now, actedBy: actorName }
        : step
    );

    const nextStep = stepIdx + 1;
    const isLastStep = nextStep >= updatedChain.length;
    const overallStatus: LeaveStatus = isLastStep ? 'Approved' : 'Pending';

    try {
      await smartDb.update('leave_requests', id, {
        approvalChain: updatedChain,
        currentStep: isLastStep ? stepIdx : nextStep,
        status: overallStatus,
        approverRemark: remark || '',
        updatedAt: now,
      });
      if (!isFirestoreWorking) fetchLeaves();
      notifyLeaveStatus(
        leave,
        isLastStep ? 'approved' : 'step-approved',
        stepIdx,
        updatedChain[nextStep]?.label,
      );
      toast.success(
        isLastStep
          ? 'Leave fully approved'
          : `Step approved — forwarded to ${updatedChain[nextStep]?.label ?? 'next approver'}`,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leave_requests/${id}`);
    }
  }, [user, leaves, fetchLeaves]);

  // Reject the leave request at the current chain step.
  const rejectLeave = useCallback(async (id: string, remark?: string) => {
    if (!user) return;
    const leave = leaves.find(l => l.id === id);
    if (!leave) return;

    const chain: ApprovalStep[] = leave.approvalChain ?? [];
    const stepIdx = leave.currentStep ?? 0;
    const now = new Date().toISOString();
    const actorName = (user as { displayName?: string }).displayName || user.uid;

    const updatedChain = chain.map((step, i) =>
      i === stepIdx
        ? { ...step, status: 'Rejected' as const, remark: remark || '', actedAt: now, actedBy: actorName }
        : step
    );

    try {
      await smartDb.update('leave_requests', id, {
        approvalChain: updatedChain,
        status: 'Rejected',
        approverRemark: remark || '',
        updatedAt: now,
      });
      if (!isFirestoreWorking) fetchLeaves();
      notifyLeaveStatus(leave, 'rejected', stepIdx);
      toast.success('Leave request rejected');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leave_requests/${id}`);
    }
  }, [user, leaves, fetchLeaves]);

  const deleteLeaveRequest = useCallback(async (id: string) => {
    try {
      await smartDb.delete('leave_requests', id);
      if (!isFirestoreWorking) fetchLeaves();
      toast.success("Leave request deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leave_requests/${id}`);
    }
  }, [fetchLeaves]);

  const value = useMemo(() => ({
    leaves, loading, canSeeAllLeaves,
    applyForLeave, updateLeaveStatus, approveLeaveStep, rejectLeave, deleteLeaveRequest,
  }), [leaves, loading, canSeeAllLeaves, applyForLeave, updateLeaveStatus, approveLeaveStep, rejectLeave, deleteLeaveRequest]);

  return (
    <LeaveContext.Provider value={value}>
      {children}
    </LeaveContext.Provider>
  );
};

export const useLeave = () => {
  const context = useContext(LeaveContext);
  if (context === undefined) {
    throw new Error('useLeave must be used within a LeaveProvider');
  }
  return context;
};
