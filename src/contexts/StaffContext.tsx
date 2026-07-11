/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Staff } from "@/types";
import { userRepository } from "@/repositories/UserRepository";

interface StaffContextType {
  staff: Staff[];
  addStaff: (newStaff: Omit<Staff, "id" | "uid" | "createdAt">) => Promise<void>;
  updateStaff: (id: string, updatedStaff: Partial<Staff>) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;
  refetchStaff: () => Promise<void>;
  loading: boolean;
}

export const StaffContext = createContext<StaffContextType | undefined>(undefined);

export const StaffProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Staff.uid records who ONBOARDED that employee, not who's allowed to see
  // them — the school's HR directory is shared institutional data. Scoping
  // this fetch to the viewer's own uid was hiding real staff created by any
  // other admin account (61 real records spread across 60 different uids —
  // almost every admin saw at most one colleague).
  const fetchStaff = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // getAllLatest (not getAll) — this is also called as an explicit
      // "refresh now" right after creating/editing a staff record (see
      // StaffOnboarding's handleSubmit). Without the shared generation guard,
      // the background 20s poll below could have an already-in-flight
      // request that resolves just after this one and silently overwrite the
      // record we just created back out of state — exactly the bug where a
      // newly onboarded staff member intermittently didn't show up in the
      // Staff Directory. null here means a newer request already superseded
      // this one, so there's nothing to apply.
      const data = await smartDb.getAllLatest("Staff", undefined);
      if (data !== null) setStaff(data);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setStaff([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = smartDb.watch("Staff", undefined, (data) => {
      setStaff(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // No seed function — cPanel MySQL is the single source of truth (61+ real
  // staff records). The old auto-seed-on-empty here used to inject 4 fake
  // mock employees into the real database every time a differently-uid'd
  // admin loaded this page and (because of the uid-scoping bug above) saw
  // zero staff — compounding the visibility bug with actual data pollution.

  const addStaff = useCallback(async (newStaff: Omit<Staff, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await smartDb.create("Staff", {
        ...newStaff,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchStaff();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "Staff");
    }
  }, [user, fetchStaff]);

  const updateStaff = useCallback(async (id: string, updatedStaff: Partial<Staff>) => {
    try {
      await smartDb.update("Staff", id, { ...updatedStaff, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchStaff();
      // Real login deactivation — previously Staff.status and the real
      // login account (provisioned by staffAccounts.ts on onboarding/hire)
      // were fully disconnected, so a staff member set Inactive/Terminated
      // here kept a fully working login indefinitely. Mirrors the status
      // onto their real User row; login itself enforces it server-side
      // (POST /api/session/login). Symmetric: setting status back to
      // Active reactivates the login too, so a correction isn't permanent.
      if (updatedStaff.status === "Inactive" || updatedStaff.status === "Terminated" || updatedStaff.status === "Active") {
        const email = updatedStaff.email || staff.find(s => s.id === id)?.email;
        if (email) {
          userRepository.findByEmail(email).then(existingUser => {
            if (!existingUser) return;
            return userRepository.update(existingUser.id, { status: updatedStaff.status === "Active" ? "Active" : "Inactive" });
          }).catch(() => {});
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "Staff");
    }
  }, [fetchStaff, staff]);

  const deleteStaff = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Staff", id);
      if (!isFirestoreWorking) fetchStaff();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "Staff");
    }
  }, [fetchStaff]);

  const value = useMemo(() => ({ staff, addStaff, updateStaff, deleteStaff, refetchStaff: fetchStaff, loading }),
    [staff, addStaff, updateStaff, deleteStaff, fetchStaff, loading]);

  return (
    <StaffContext.Provider value={value}>
      {children}
    </StaffContext.Provider>
  );
};

export const useStaff = () => {
  const context = useContext(StaffContext);
  if (context === undefined) {
    throw new Error("useStaff must be used within a StaffProvider");
  }
  return context;
};
