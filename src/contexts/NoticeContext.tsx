/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: "General" | "Academic" | "Finance" | "Event" | "Urgent";
  priority: "Low" | "Medium" | "High";
  status: "Published" | "Draft" | "Scheduled";
  targetAudience: "All" | "Students" | "Staff" | "Parents";
  targetClass?: string;
  postedBy: string;
  date: string;
  views: number;
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

interface NoticeContextType {
  notices: Notice[];
  addNotice: (newNotice: Omit<Notice, "id" | "uid" | "createdAt" | "views" | "date" | "postedBy">) => Promise<void>;
  updateNotice: (id: string, updatedNotice: Partial<Notice>) => Promise<void>;
  deleteNotice: (id: string) => Promise<void>;
  loading: boolean;
}

export const NoticeContext = createContext<NoticeContextType | undefined>(undefined);

export const NoticeProvider = ({ children }: { children: ReactNode }) => {
  const { user, isMockSession } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  // Notice.uid records which admin posted it, not who it's for — audience
  // targeting is the separate `targetAudience`/`targetClass` fields below.
  // Scoping this fetch to the viewer's own uid hid every announcement posted
  // by a different admin account (and meant every student/staff/parent saw
  // no notices at all, since they never post any themselves).
  const fetchNotices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll("Notice", undefined);
      setNotices(data);
    } catch (error) {
      console.error("Error fetching notices:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotices([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession) {
      fetchNotices();
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, "notices"), (snapshot) => {
      const noticeData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notice[];
      setNotices(noticeData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "notices");
      setLoading(false);
      fetchNotices();
    });

    return () => unsubscribe();
  }, [user, isMockSession, fetchNotices]);

  const addNotice = useCallback(async (newNotice: Omit<Notice, "id" | "uid" | "createdAt" | "views" | "date" | "postedBy">) => {
    if (!user) return;

    const noticeData = {
      ...newNotice,
      postedBy: user.displayName || "Admin",
      date: new Date().toISOString().split('T')[0],
      views: 0,
      uid: user.uid,
      createdAt: new Date().toISOString()
    };

    try {
      await smartDb.create("Notice", noticeData);
      if (!isFirestoreWorking || isMockSession) fetchNotices();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "notices");
    }
  }, [user, isMockSession, fetchNotices]);

  const updateNotice = useCallback(async (id: string, updatedNotice: Partial<Notice>) => {
    try {
      await smartDb.update("Notice", id, { ...updatedNotice, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchNotices();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "notices");
    }
  }, [isMockSession, fetchNotices]);

  const deleteNotice = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Notice", id);
      if (!isFirestoreWorking || isMockSession) fetchNotices();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "notices");
    }
  }, [isMockSession, fetchNotices]);

  const value = useMemo(() => ({ notices, addNotice, updateNotice, deleteNotice, loading }),
    [notices, addNotice, updateNotice, deleteNotice, loading]);

  return (
    <NoticeContext.Provider value={value}>
      {children}
    </NoticeContext.Provider>
  );
};

export const useNotices = () => {
  const context = useContext(NoticeContext);
  if (context === undefined) {
    throw new Error("useNotices must be used within a NoticeProvider");
  }
  return context;
};
