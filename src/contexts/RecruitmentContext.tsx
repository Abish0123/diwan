/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { JobOpening, JobApplication } from "@/types/hr";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db, auth, isFirestoreWorking } from "@/firebase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface RecruitmentContextType {
  jobs: JobOpening[];
  applications: JobApplication[];
  loading: boolean;
  addJob: (job: Omit<JobOpening, "id" | "uid" | "createdAt">) => Promise<void>;
  updateJob: (id: string, job: Partial<JobOpening>) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  addApplication: (app: Omit<JobApplication, "id" | "uid" | "createdAt">) => Promise<void>;
  updateApplication: (id: string, app: Partial<JobApplication>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
}

const RecruitmentContext = createContext<RecruitmentContextType | undefined>(undefined);

export const useRecruitment = () => {
  const context = useContext(RecruitmentContext);
  if (context === undefined) {
    throw new Error('useRecruitment must be used within a RecruitmentProvider');
  }
  return context;
};

export const RecruitmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, isMockSession } = useAuth();
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  // JobOpening/JobApplication.uid is whichever HR account created the
  // posting, not who's allowed to review it — recruitment is a shared HR
  // workflow. Scoping to the viewer's own uid hid postings/applications
  // created by any other HR/admin account.
  const fetchRecruitmentData = useCallback(async () => {
    if (!user || !role) return;

    // Recruitment workflow is administrative. Skip fetch for students, parents, teachers, and coordinators.
    const isUnprivileged = ["student", "parent", "class_teacher", "subject_teacher", "teacher", "staff", "academic_coordinator", "grade_coordinator"].includes(role);
    if (isUnprivileged) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [jobsData, appsData] = await Promise.all([
        smartDb.getAll("JobOpening", undefined),
        smartDb.getAll("JobApplication", undefined)
      ]);
      setJobs(jobsData);
      setApplications(appsData);
    } catch (error) {
      console.error("Error fetching recruitment data:", error);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (!user || !role) {
      setJobs([]);
      setApplications([]);
      setLoading(false);
      return;
    }

    // Recruitment workflow is administrative. Skip fetch/watch for students, parents, teachers, and coordinators.
    const isUnprivileged = ["student", "parent", "class_teacher", "subject_teacher", "teacher", "staff", "academic_coordinator", "grade_coordinator"].includes(role);
    if (isUnprivileged) {
      setLoading(false);
      return;
    }

    if (isMockSession || !isFirestoreWorking || user.uid.startsWith('demo-')) {
      fetchRecruitmentData();
      return;
    }

    setLoading(true);
    const unsubscribeJobs = onSnapshot(collection(db, "JobOpening"), (snapshot) => {
      const jobsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobOpening));
      setJobs(jobsList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching jobs:", error);
      fetchRecruitmentData();
    });

    const unsubscribeApps = onSnapshot(collection(db, "JobApplication"), (snapshot) => {
      const appsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobApplication));
      setApplications(appsList);
    }, (error) => {
      console.error("Error fetching applications:", error);
      fetchRecruitmentData();
    });

    return () => {
      unsubscribeJobs();
      unsubscribeApps();
    };
  }, [user, role, isMockSession, fetchRecruitmentData]);

  const addJob = useCallback(async (job: Omit<JobOpening, "id" | "uid" | "createdAt">) => {
    try {
      if (!user) throw new Error("Not authenticated");
      await smartDb.create("JobOpening", {
        ...job,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Job opening posted successfully");
    } catch (error) {
      console.error("Error adding job:", error);
      handleFirestoreError(error, OperationType.CREATE, "JobOpening");
    }
  }, [user, fetchRecruitmentData]);

  const updateJob = useCallback(async (id: string, job: Partial<JobOpening>) => {
    try {
      await smartDb.update("JobOpening", id, job);
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Job opening updated");
    } catch (error) {
      console.error("Error updating job:", error);
      handleFirestoreError(error, OperationType.UPDATE, `JobOpening/${id}`);
    }
  }, [fetchRecruitmentData]);

  const deleteJob = useCallback(async (id: string) => {
    try {
      await smartDb.delete("JobOpening", id);
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Job opening deleted");
    } catch (error) {
      console.error("Error deleting job:", error);
      handleFirestoreError(error, OperationType.DELETE, `JobOpening/${id}`);
    }
  }, [fetchRecruitmentData]);

  const addApplication = useCallback(async (app: Omit<JobApplication, "id" | "uid" | "createdAt">) => {
    try {
      if (!user) throw new Error("Not authenticated");
      await smartDb.create("JobApplication", {
        ...app,
        uid: user.uid,
        appliedDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Application submitted successfully");
    } catch (error) {
      console.error("Error adding application:", error);
      handleFirestoreError(error, OperationType.CREATE, "JobApplication");
    }
  }, [user, fetchRecruitmentData]);

  const updateApplication = useCallback(async (id: string, app: Partial<JobApplication>) => {
    try {
      await smartDb.update("JobApplication", id, app);
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Application updated");
    } catch (error) {
      console.error("Error updating application:", error);
      handleFirestoreError(error, OperationType.UPDATE, `JobApplication/${id}`);
    }
  }, [fetchRecruitmentData]);

  const deleteApplication = useCallback(async (id: string) => {
    try {
      await smartDb.delete("JobApplication", id);
      if (!isFirestoreWorking) fetchRecruitmentData();
      toast.success("Application deleted");
    } catch (error) {
      console.error("Error deleting application:", error);
      handleFirestoreError(error, OperationType.DELETE, `JobApplication/${id}`);
    }
  }, [fetchRecruitmentData]);

  const value = useMemo(() => ({
    jobs,
    applications,
    loading,
    addJob,
    updateJob,
    deleteJob,
    addApplication,
    updateApplication,
    deleteApplication
  }), [jobs, applications, loading, addJob, updateJob, deleteJob, addApplication, updateApplication, deleteApplication]);

  return (
    <RecruitmentContext.Provider value={value}>
      {children}
    </RecruitmentContext.Provider>
  );
};
