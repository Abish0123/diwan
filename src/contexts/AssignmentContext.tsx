/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Assignment } from "@/types/classes";

interface AssignmentContextType {
  assignments: Assignment[];
  addAssignment: (newAssignment: Omit<Assignment, "id" | "uid" | "submissionsCount">) => Promise<void>;
  updateAssignment: (id: string, updatedAssignment: Partial<Assignment>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  loading: boolean;
}

export const AssignmentContext = createContext<AssignmentContextType | undefined>(undefined);

export const AssignmentProvider = ({ children }: { children: ReactNode }) => {
  const { user, isMockSession } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment.uid is the creating teacher, not who's allowed to see it —
  // class-level assignments are shared with every student/co-teacher in that
  // class. Scoping to the viewer's own uid hid every assignment created by
  // a different teacher account.
  const fetchAssignments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll("Assignment", undefined);
      setAssignments(data);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession || user.uid.startsWith('demo-')) {
      fetchAssignments();
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, "Assignment"), (snapshot) => {
      const assignmentData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Assignment[];
      setAssignments(assignmentData);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore snapshot failed for assignments, falling back to local fetch.");
      fetchAssignments();
    });

    return () => unsubscribe();
  }, [user, isMockSession, fetchAssignments]);

  const addAssignment = useCallback(async (newAssignment: Omit<Assignment, "id" | "uid" | "submissionsCount">) => {
    if (!user) return;
    try {
      await smartDb.create("Assignment", {
        ...newAssignment,
        submissionsCount: 0,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchAssignments();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "Assignment");
    }
  }, [user, fetchAssignments]);

  const updateAssignment = useCallback(async (id: string, updatedAssignment: Partial<Assignment>) => {
    try {
      await smartDb.update("Assignment", id, { ...updatedAssignment, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchAssignments();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "Assignment");
    }
  }, [fetchAssignments]);

  const deleteAssignment = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Assignment", id);
      if (!isFirestoreWorking) fetchAssignments();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "Assignment");
    }
  }, [fetchAssignments]);

  const value = useMemo(() => ({ assignments, addAssignment, updateAssignment, deleteAssignment, loading }),
    [assignments, addAssignment, updateAssignment, deleteAssignment, loading]);

  return (
    <AssignmentContext.Provider value={value}>
      {children}
    </AssignmentContext.Provider>
  );
};

export const useAssignments = () => {
  const context = useContext(AssignmentContext);
  if (context === undefined) {
    throw new Error("useAssignments must be used within an AssignmentProvider");
  }
  return context;
};
