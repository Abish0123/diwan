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
import { LeaveRequest, LeaveStatus } from '@/types';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { canApproveLeave, buildApprovalChain } from '@/lib/roles';
import { services } from '@/services/container';

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
  //
  // The actual chain math + persistence + notification now live in
  // LeaveApprovalService (src/services/leave/LeaveApprovalService.ts) — this
  // callback's job is only to find the leave, call the service, and drive
  // React-specific concerns (refetch, toast). Behavior is unchanged; the
  // logic just has a testable, non-React home now.
  const approveLeaveStep = useCallback(async (id: string, remark?: string) => {
    if (!user) return;
    const leave = leaves.find(l => l.id === id);
    if (!leave) return;

    const stepIdx = leave.currentStep ?? 0;
    const chainLength = leave.approvalChain?.length ?? 0;
    const isLastStep = stepIdx + 1 >= chainLength;
    const actorName = (user as { displayName?: string }).displayName || user.uid;

    try {
      const updated = await services.leaveApproval.approveStep(leave, actorName, remark || '');
      if (!isFirestoreWorking) fetchLeaves();
      const nextLabel = updated.approvalChain?.[stepIdx + 1]?.label;
      toast.success(
        isLastStep
          ? 'Leave fully approved'
          : `Step approved — forwarded to ${nextLabel ?? 'next approver'}`,
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

    const actorName = (user as { displayName?: string }).displayName || user.uid;

    try {
      await services.leaveApproval.reject(leave, actorName, remark || '');
      if (!isFirestoreWorking) fetchLeaves();
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
