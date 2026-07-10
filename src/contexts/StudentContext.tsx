/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo, useRef } from "react";
import { handleFirestoreError, OperationType, isFirestoreWorking } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useBranch } from "@/contexts/BranchContext";
import { smartDb } from "@/lib/localDb";
import { Student } from "@/types";

interface StudentContextType {
  students: Student[];
  addStudents: (newStudents: (Omit<Student, "id" | "uid" | "createdAt"> & { id?: string })[]) => Promise<void>;
  updateStudent: (id: string, data: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  totalStudents: number;
  loading: boolean;
}

export const StudentContext = createContext<StudentContextType | undefined>(undefined);

export const StudentProvider = ({ children }: { children: ReactNode }) => {
  const { user, role, isMockSession } = useAuth();
  const { children: parentChildren } = useParentChildren();
  const { activeBranchId } = useBranch();
  const [rawStudents, setRawStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  // Student.uid is "who owns this row" (whichever staff account enrolled or
  // bulk-imported the student) — it is NEVER the student's own login uid, so
  // it cannot be used to scope a student's view of their own record. Every
  // role except the student themself needs the full real roster (admin,
  // every staff role, and parents — who filter their own children client-side
  // via email matching, same as useParentChildren already does). A student
  // looks up their own row by email server-side instead (getAllByEmail),
  // so their browser never downloads every other student's record just to
  // find their own one row.
  const isSelfViewStudent = role === "student";

  // fetchSideData below only reads rawStudents[0]?.id (for the single-student
  // self-view case) — depending on the full array directly meant every
  // roster refresh (a brand-new array reference, even for 500+ admin rows
  // where fetchSideData doesn't use rawStudents at all) reran this callback's
  // identity, retriggering the effect that calls it in a cascading loop.
  const rawStudentsRef = useRef(rawStudents);
  rawStudentsRef.current = rawStudents;

  const fetchStudents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = isSelfViewStudent && user.email
        ? await smartDb.getAllByEmail("Student", user.email)
        : await smartDb.getAll("Student", undefined);
      setRawStudents(data);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoading(false);
    }
  }, [user, isSelfViewStudent]);

  useEffect(() => {
    if (!user) {
      setRawStudents([]);
      setLoading(false);
      return;
    }

    // A student's own record is looked up by email (one-shot, no live watch
    // support for that lookup); every other role gets the real-time roster.
    if (isSelfViewStudent) {
      fetchStudents();
      return;
    }

    setLoading(true);
    const unsubscribe = smartDb.watch("Student", undefined, (data) => {
      setRawStudents(data as Student[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isSelfViewStudent, fetchStudents]);

  // Load attendance + invoices so each student's attendance % and fee status reflect
  // the real transactional tables instead of the static seeded fields. Refreshes on
  // mount, when the window regains focus, and when the Attendance/Finance pages dispatch
  // "attendance-updated" / "fees-updated" events after a save — no constant polling.
  const fetchSideData = useCallback(async () => {
    if (!user) return;
    try {
      const isStudent = role === "student";
      const isParent = role === "parent";
      
      const studentId = isStudent ? rawStudentsRef.current[0]?.id : undefined;
      const childIds = isParent ? parentChildren.map(c => c.id) : [];

      let attParams: Record<string, string> | undefined;
      let invParams: Record<string, string> | undefined;

      if (isStudent && studentId) {
        attParams = { entityId: studentId, entityType: "student" };
        invParams = { studentId };
      } else if (isParent && childIds.length > 0) {
        attParams = { entityId: childIds.join(","), entityType: "student" };
        invParams = { studentId: childIds.join(",") };
      }

      const [att, invs] = await Promise.all([
        smartDb.getAll("attendance", undefined, attParams),
        smartDb.getAll("Invoice", undefined, invParams),
      ]);
      setAttendanceRecords(att as Record<string, unknown>[]);
      setInvoices(invs as Record<string, unknown>[]);
    } catch (error) {
      console.error("Error fetching attendance/invoices:", error);
    }
  }, [user, role, parentChildren]);

  useEffect(() => {
    if (!user) {
      setAttendanceRecords([]);
      setInvoices([]);
      return;
    }
    fetchSideData();
    const onRefresh = () => fetchSideData();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("attendance-updated", onRefresh);
    window.addEventListener("fees-updated", onRefresh);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("attendance-updated", onRefresh);
      window.removeEventListener("fees-updated", onRefresh);
    };
  }, [user, fetchSideData]);

  // Merge live attendance % and fee status into each student. Students with no matching
  // records keep their existing value, so demo/seeded data is preserved.
  const students = useMemo<Student[]>(() => {
    // Deduplicate by ID first, then by name — keeps first occurrence of each
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    let base = rawStudents.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      const normName = (s.name || "").trim().toLowerCase();
      if (normName && seenNames.has(normName)) return false;
      if (normName) seenNames.add(normName);
      return true;
    });

    // Real branch isolation: when an admin has selected a specific campus
    // (BranchContext), only that branch's students are shown. Records with
    // no branchId (the entire current dataset, since this school has no
    // branches tagged yet) are left visible rather than hidden — an
    // untagged record isn't "wrong branch", it's "not migrated to
    // multi-branch yet", and hiding it would look like data loss.
    if (activeBranchId) {
      base = base.filter(s => !s.branchId || s.branchId === activeBranchId);
    }

    if (attendanceRecords.length === 0 && invoices.length === 0) return base;

    // Attendance: score Present=1, Late=0.5, Absent=0 across all records per student.
    const attByStudent = new Map<string, { score: number; total: number }>();
    for (const r of attendanceRecords) {
      if (r.entityType !== "student") continue;
      const id = r.entityId as string;
      if (!id) continue;
      const agg = attByStudent.get(id) || { score: 0, total: 0 };
      agg.total += 1;
      if (r.status === "Present") agg.score += 1;
      else if (r.status === "Late") agg.score += 0.5;
      attByStudent.set(id, agg);
    }

    // Fees: any overdue invoice => Overdue, any unpaid/partial => Pending, else Paid.
    const feeByStudent = new Map<string, { overdue: boolean; pending: boolean; any: boolean }>();
    for (const inv of invoices) {
      const id = inv.studentId as string;
      if (!id) continue;
      const status = inv.status as string;
      const agg = feeByStudent.get(id) || { overdue: false, pending: false, any: false };
      agg.any = true;
      if (status === "Overdue") agg.overdue = true;
      else if (status === "Unpaid" || status === "Partial") agg.pending = true;
      feeByStudent.set(id, agg);
    }

    return base.map((s) => {
      const att = attByStudent.get(s.id);
      const fee = feeByStudent.get(s.id);
      if (!att && !fee) return s;
      const next: Student = { ...s };
      if (att && att.total > 0) next.attendance = Math.round((att.score / att.total) * 100);
      if (fee && fee.any) next.feeStatus = fee.overdue ? "Overdue" : fee.pending ? "Pending" : "Paid";
      return next;
    });
  }, [rawStudents, attendanceRecords, invoices, activeBranchId]);

  // No seed function — cPanel MySQL is the single source of truth.
  // Students come exclusively from the real database (506+ records).

  // Seeding is intentionally disabled; the useEffect below is a no-op guard.
  useEffect(() => {
    // nothing to seed
  }, []);

  const addStudents = useCallback(async (newStudents: (Omit<Student, "id" | "uid" | "createdAt"> & { id?: string })[]) => {
    if (!user) return;

    try {
      const promises = newStudents.map(student => {
        const { id, ...data } = student;
        return smartDb.create("Student", {
          ...data,
          // Tag with whichever campus is currently active, unless the caller
          // already specified one explicitly (e.g. a bulk import assigning
          // students across branches directly).
          branchId: data.branchId ?? activeBranchId ?? undefined,
          uid: user.uid,
          createdAt: new Date().toISOString()
        }, id);
      });
      await Promise.all(promises);
      if (!isFirestoreWorking) fetchStudents();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "Student");
    }
  }, [user, fetchStudents, activeBranchId]);

  const updateStudent = useCallback(async (id: string, data: Partial<Student>) => {
    if (!user) return;
    try {
      await smartDb.update("Student", id, { ...data, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchStudents();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "Student");
    }
  }, [user, fetchStudents]);

  const deleteStudent = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await smartDb.delete("Student", id);
      if (!isFirestoreWorking) fetchStudents();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "Student");
    }
  }, [user, fetchStudents]);

  // Memoized so this Provider's context value only changes identity when the
  // data it actually carries changes — an inline object literal here would
  // hand every consumer (all ~15 sibling providers + every page, since
  // StudentProvider wraps almost the entire app) a brand-new reference on
  // every render of this provider, including ones triggered by unrelated
  // state elsewhere, cascading unnecessary re-renders through the whole tree.
  const value = useMemo(
    () => ({ students, addStudents, updateStudent, deleteStudent, totalStudents: students?.length || 0, loading }),
    [students, addStudents, updateStudent, deleteStudent, loading]
  );

  return (
    <StudentContext.Provider value={value}>
      {children}
    </StudentContext.Provider>
  );
};

export const useStudents = () => {
  const context = useContext(StudentContext);
  if (context === undefined) {
    throw new Error("useStudents must be used within a StudentProvider");
  }
  return context;
};
