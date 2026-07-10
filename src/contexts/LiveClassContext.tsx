/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp,
  Timestamp,
  FieldValue
} from "firebase/firestore";
import { db, auth, isFirestoreWorking, OperationType, handleFirestoreError } from "../firebase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { LiveClass, LiveClassStatus } from "@/types";
export type { LiveClassStatus };

interface LiveClassContextType {
  liveClasses: LiveClass[];
  loading: boolean;
  addLiveClass: (newClass: Omit<LiveClass, "id" | "uid" | "createdAt">) => Promise<void>;
  updateLiveClass: (id: string, updatedClass: Partial<LiveClass>) => Promise<void>;
  deleteLiveClass: (id: string) => Promise<void>;
}

const LiveClassContext = createContext<LiveClassContextType | undefined>(undefined);

export const LiveClassProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  // LiveClass sessions are broadcast to every enrolled student — the
  // Firestore path below already queries unscoped (correctly). This local
  // smartDb fallback was scoping to the viewer's own uid instead, meaning
  // when Firestore is unavailable, staff/students would only see live
  // classes THEY personally scheduled.
  const fetchLiveClasses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll("LiveClass", undefined);
      setLiveClasses(data);
    } catch (error) {
      console.error("Error fetching live classes:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLiveClasses([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || user.uid.startsWith('demo-')) {
      fetchLiveClasses();
      return;
    }

    setLoading(true);
    const q = query(collection(db, "LiveClass"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const classesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LiveClass[];
      
      setLiveClasses(classesData);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore snapshot failed for live classes, falling back to local fetch.");
      fetchLiveClasses();
    });

    return () => unsubscribe();
  }, [user, fetchLiveClasses]);

  const addLiveClass = useCallback(async (newClass: Omit<LiveClass, "id" | "uid" | "createdAt">) => {
    if (!user) {
      toast.error("You must be logged in to schedule a class");
      return;
    }

    try {
      // Every scheduled class gets its own real Jitsi Meet room up front —
      // "Join Now" always opens an actual video call at meet.jit.si, never a
      // mockup. Room names are namespaced so they never collide with anyone
      // else's public meet.jit.si room.
      const jitsiRoom = `StudentDiwan-${(newClass.title || "class").replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now().toString(36)}`;
      await smartDb.create("LiveClass", {
        ...newClass,
        jitsiRoom,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchLiveClasses();
      toast.success("Live class scheduled successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "LiveClass");
    }
  }, [user, fetchLiveClasses]);

  const updateLiveClass = useCallback(async (id: string, updatedClass: Partial<LiveClass>) => {
    try {
      await smartDb.update("LiveClass", id, { ...updatedClass, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchLiveClasses();
      toast.success("Class updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `LiveClass/${id}`);
    }
  }, [fetchLiveClasses]);

  const deleteLiveClass = useCallback(async (id: string) => {
    try {
      await smartDb.delete("LiveClass", id);
      if (!isFirestoreWorking) fetchLiveClasses();
      toast.success("Class deleted successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `LiveClass/${id}`);
    }
  }, [fetchLiveClasses]);

  const value = useMemo(() => ({ liveClasses, loading, addLiveClass, updateLiveClass, deleteLiveClass }),
    [liveClasses, loading, addLiveClass, updateLiveClass, deleteLiveClass]);

  return (
    <LiveClassContext.Provider value={value}>
      {children}
    </LiveClassContext.Provider>
  );
};

export const useLiveClasses = () => {
  const context = useContext(LiveClassContext);
  if (context === undefined) {
    throw new Error("useLiveClasses must be used within a LiveClassProvider");
  }
  return context;
};
