import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Class, Section, Enrollment, AcademicYear, TimetableSlot } from "@/types/classes";

interface AcademicContextType {
  classes: Class[];
  sections: Section[];
  enrollments: Enrollment[];
  academicYears: AcademicYear[];
  timetableSlots: TimetableSlot[];
  
  addClass: (newClass: Omit<Class, "id" | "uid" | "createdAt">) => Promise<string | undefined>;
  updateClass: (id: string, updatedClass: Partial<Class>) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  
  addSection: (newSection: Omit<Section, "id" | "uid" | "createdAt">) => Promise<string | undefined>;
  updateSection: (id: string, updatedSection: Partial<Section>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  
  addEnrollment: (newEnrollment: Omit<Enrollment, "id" | "uid" | "createdAt">) => Promise<void>;
  updateEnrollment: (id: string, updatedEnrollment: Partial<Enrollment>) => Promise<void>;
  deleteEnrollment: (id: string) => Promise<void>;
  
  addAcademicYear: (newYear: Omit<AcademicYear, "id" | "uid" | "createdAt">) => Promise<void>;
  updateAcademicYear: (id: string, updatedYear: Partial<AcademicYear>) => Promise<void>;
  deleteAcademicYear: (id: string) => Promise<void>;
  
  addTimetableSlot: (newSlot: Omit<TimetableSlot, "id" | "uid" | "createdAt">) => Promise<void>;
  updateTimetableSlot: (id: string, updatedSlot: Partial<TimetableSlot>) => Promise<void>;
  deleteTimetableSlot: (id: string) => Promise<void>;
  
  loading: boolean;
}

export const ClassContext = createContext<AcademicContextType | undefined>(undefined);

export const ClassProvider = ({ children }: { children: ReactNode }) => {
  const { user, isMockSession } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // uid on these records means "which admin account created it", not "who may
  // view it" — Classes/Sections/Enrollments/AcademicYears/TimetableSlots are
  // shared institutional structures. Scoping to the viewer's own uid was
  // hiding real data from every account that didn't happen to create it (e.g.
  // 1306 real enrollments existed under a single uid — every other admin saw
  // zero students enrolled in any class).
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [classesData, sectionsData, enrollmentsData, yearsData, slotsData] = await Promise.all([
        smartDb.getAll("Class", undefined),
        smartDb.getAll("Section", undefined),
        smartDb.getAll("Enrollment", undefined),
        smartDb.getAll("AcademicYear", undefined),
        smartDb.getAll("TimetableSlot", undefined)
      ]);
      setClasses(classesData);
      setSections(sectionsData);
      setEnrollments(enrollmentsData);
      setAcademicYears(yearsData);
      setTimetableSlots(slotsData);
    } catch (error) {
      console.error("Error fetching academic data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setClasses([]);
      setSections([]);
      setEnrollments([]);
      setAcademicYears([]);
      setTimetableSlots([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession) {
      fetchAllData();
      return;
    }

    setLoading(true);
    
    const unsubClasses = onSnapshot(collection(db, "classes"), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Class[]);
    });

    const unsubSections = onSnapshot(collection(db, "sections"), (snap) => {
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Section[]);
    });

    const unsubEnrollments = onSnapshot(collection(db, "enrollments"), (snap) => {
      setEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Enrollment[]);
    });

    const unsubYears = onSnapshot(collection(db, "academic_years"), (snap) => {
      setAcademicYears(snap.docs.map(d => ({ id: d.id, ...d.data() })) as AcademicYear[]);
    });

    const unsubSlots = onSnapshot(collection(db, "timetable_slots"), (snap) => {
      setTimetableSlots(snap.docs.map(d => ({ id: d.id, ...d.data() })) as TimetableSlot[]);
      setLoading(false);
    });

    return () => {
      unsubClasses();
      unsubSections();
      unsubEnrollments();
      unsubYears();
      unsubSlots();
    };
  }, [user, isMockSession, fetchAllData]);

  // CRUD for Class
  const addClass = useCallback(async (newClass: Omit<Class, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      const res = await smartDb.create("Class", { ...newClass, uid: user.uid, createdAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
      return res?.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "classes");
    }
  }, [user, isMockSession, fetchAllData]);

  const updateClass = useCallback(async (id: string, updatedClass: Partial<Class>) => {
    try {
      await smartDb.update("Class", id, { ...updatedClass, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, "classes"); }
  }, [isMockSession, fetchAllData]);

  const deleteClass = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Class", id);
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, "classes"); }
  }, [isMockSession, fetchAllData]);

  // CRUD for Section
  const addSection = useCallback(async (newSection: Omit<Section, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      const res = await smartDb.create("Section", { ...newSection, uid: user.uid, createdAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
      return res?.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "sections");
    }
  }, [user, isMockSession, fetchAllData]);

  const updateSection = useCallback(async (id: string, updatedSection: Partial<Section>) => {
    try {
      await smartDb.update("Section", id, { ...updatedSection, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, "sections"); }
  }, [isMockSession, fetchAllData]);

  const deleteSection = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Section", id);
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, "sections"); }
  }, [isMockSession, fetchAllData]);

  // CRUD for Enrollment
  const addEnrollment = useCallback(async (newEnrollment: Omit<Enrollment, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await smartDb.create("Enrollment", { ...newEnrollment, uid: user.uid, createdAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.CREATE, "enrollments"); }
  }, [user, isMockSession, fetchAllData]);

  const updateEnrollment = useCallback(async (id: string, updatedEnrollment: Partial<Enrollment>) => {
    try {
      await smartDb.update("Enrollment", id, { ...updatedEnrollment, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, "enrollments"); }
  }, [isMockSession, fetchAllData]);

  const deleteEnrollment = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Enrollment", id);
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, "enrollments"); }
  }, [isMockSession, fetchAllData]);

  // CRUD for AcademicYear
  const addAcademicYear = useCallback(async (newYear: Omit<AcademicYear, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await smartDb.create("AcademicYear", { ...newYear, uid: user.uid, createdAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.CREATE, "academic_years"); }
  }, [user, isMockSession, fetchAllData]);

  const updateAcademicYear = useCallback(async (id: string, updatedYear: Partial<AcademicYear>) => {
    try {
      await smartDb.update("AcademicYear", id, { ...updatedYear, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, "academic_years"); }
  }, [isMockSession, fetchAllData]);

  const deleteAcademicYear = useCallback(async (id: string) => {
    try {
      await smartDb.delete("AcademicYear", id);
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, "academic_years"); }
  }, [isMockSession, fetchAllData]);

  // CRUD for TimetableSlot
  const addTimetableSlot = useCallback(async (newSlot: Omit<TimetableSlot, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await smartDb.create("TimetableSlot", { ...newSlot, uid: user.uid, createdAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.CREATE, "timetable_slots"); }
  }, [user, isMockSession, fetchAllData]);

  const updateTimetableSlot = useCallback(async (id: string, updatedSlot: Partial<TimetableSlot>) => {
    try {
      await smartDb.update("TimetableSlot", id, { ...updatedSlot, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, "timetable_slots"); }
  }, [isMockSession, fetchAllData]);

  const deleteTimetableSlot = useCallback(async (id: string) => {
    try {
      await smartDb.delete("TimetableSlot", id);
      if (!isFirestoreWorking || isMockSession) fetchAllData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, "timetable_slots"); }
  }, [isMockSession, fetchAllData]);

  const value = useMemo(() => ({
    classes, sections, enrollments, academicYears, timetableSlots,
    addClass, updateClass, deleteClass,
    addSection, updateSection, deleteSection,
    addEnrollment, updateEnrollment, deleteEnrollment,
    addAcademicYear, updateAcademicYear, deleteAcademicYear,
    addTimetableSlot, updateTimetableSlot, deleteTimetableSlot,
    loading,
  }), [classes, sections, enrollments, academicYears, timetableSlots,
      addClass, updateClass, deleteClass,
      addSection, updateSection, deleteSection,
      addEnrollment, updateEnrollment, deleteEnrollment,
      addAcademicYear, updateAcademicYear, deleteAcademicYear,
      addTimetableSlot, updateTimetableSlot, deleteTimetableSlot,
      loading]);

  return (
    <ClassContext.Provider value={value}>
      {children}
    </ClassContext.Provider>
  );
};

export const useClasses = () => {
  const context = useContext(ClassContext);
  if (context === undefined) {
    throw new Error("useClasses must be used within a ClassProvider");
  }
  return context;
};
