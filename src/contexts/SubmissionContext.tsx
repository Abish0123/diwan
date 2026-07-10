/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: 'Submitted' | 'Pending' | 'Late';
  submissionDate?: string;
  uid: string;
  createdAt?: string;
}

interface SubmissionContextType {
  submissions: Submission[];
  addSubmission: (data: Omit<Submission, "id" | "uid" | "createdAt">) => Promise<void>;
  updateSubmission: (id: string, data: Partial<Submission>) => Promise<void>;
  deleteSubmission: (id: string) => Promise<void>;
  loading: boolean;
}

export const SubmissionContext = createContext<SubmissionContextType | undefined>(undefined);

export const SubmissionProvider = ({ children }: { children: ReactNode }) => {
  const { user, role, isMockSession } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Unlike the other contexts fixed alongside this one, Submission.uid IS a
  // legitimate "who is this for" field — each row is one student's own
  // submitted work. Self-scoping is correct for a student viewing their own
  // submissions, but ViewSubmissionsDialog needs every student's submissions
  // for an assignment to grade them, so staff/admin roles get the full list.
  const scopeUid = role === "student" ? user?.uid : undefined;

  const fetchSubmissions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll("Submission", scopeUid);
      setSubmissions(data);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  }, [user, scopeUid]);

  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession || user.uid.startsWith('demo-')) {
      fetchSubmissions();
      return;
    }

    setLoading(true);
    const q = scopeUid
      ? query(collection(db, "Submission"), where("uid", "==", scopeUid))
      : query(collection(db, "Submission"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissionData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Submission[];
      setSubmissions(submissionData);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore snapshot failed for submissions, falling back to local fetch.");
      fetchSubmissions();
    });

    return () => unsubscribe();
  }, [user, isMockSession, scopeUid, fetchSubmissions]);

  const addSubmission = useCallback(async (data: Omit<Submission, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await smartDb.create("Submission", {
        ...data,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchSubmissions();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "Submission");
    }
  }, [user, fetchSubmissions]);

  const updateSubmission = useCallback(async (id: string, data: Partial<Submission>) => {
    if (!user) return;
    try {
      await smartDb.update("Submission", id, data);
      if (!isFirestoreWorking) fetchSubmissions();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "Submission");
    }
  }, [user, fetchSubmissions]);

  const deleteSubmission = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await smartDb.delete("Submission", id);
      if (!isFirestoreWorking) fetchSubmissions();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "Submission");
    }
  }, [user, fetchSubmissions]);

  const value = useMemo(() => ({ submissions, addSubmission, updateSubmission, deleteSubmission, loading }),
    [submissions, addSubmission, updateSubmission, deleteSubmission, loading]);

  return (
    <SubmissionContext.Provider value={value}>
      {children}
    </SubmissionContext.Provider>
  );
};

export const useSubmissions = () => {
  const context = useContext(SubmissionContext);
  if (context === undefined) {
    throw new Error("useSubmissions must be used within a SubmissionProvider");
  }
  return context;
};
