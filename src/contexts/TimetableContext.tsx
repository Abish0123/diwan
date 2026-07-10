/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { TimetableEntry, Subject, Teacher, Room, TimeSlot, DayOfWeek, TimetableConflict } from '@/types/timetable';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { db, isFirestoreWorking, handleFirestoreError, OperationType } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface TimetableContextType {
  entries: TimetableEntry[];
  subjects: Subject[];
  teachers: Teacher[];
  rooms: Room[];
  timeSlots: TimeSlot[];
  days: DayOfWeek[];
  conflicts: TimetableConflict[];
  addEntry: (entry: Omit<TimetableEntry, 'id'>) => Promise<void>;
  updateEntry: (id: string, updates: Partial<TimetableEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  generateAITimetable: (config: { classId: string; sectionId: string }) => Promise<void>;
  checkConflicts: () => void;
  publishTimetable: () => void;
  isPublished: boolean;
  loading: boolean;
}

export const TimetableContext = createContext<TimetableContextType | undefined>(undefined);

export const TimetableProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockSession } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);
  const [loading, setLoading] = useState(true);

  const subjects: Subject[] = useMemo(() => [
    { id: 'S1', name: 'Mathematics', code: 'MATH', color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
    { id: 'S2', name: 'Science', code: 'SCI', color: 'bg-blue-500/10 text-purple-600 border-blue-200' },
    { id: 'S3', name: 'English', code: 'ENG', color: 'bg-green-500/10 text-green-600 border-green-200' },
    { id: 'S4', name: 'History', code: 'HIST', color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
    { id: 'S5', name: 'Computer Sci', code: 'CS', color: 'bg-indigo-500/10 text-purple-600 border-indigo-200' },
    { id: 'S6', name: 'Physical Ed', code: 'PE', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  ], []);

  const teachers: Teacher[] = useMemo(() => [
    { id: 'T1', name: 'Mr. Smith', subjects: ['S1'] },
    { id: 'T2', name: 'Ms. Johnson', subjects: ['S2'] },
    { id: 'T3', name: 'Ms. Davis', subjects: ['S3'] },
    { id: 'T4', name: 'Mr. Brown', subjects: ['S4'] },
    { id: 'T5', name: 'Mr. Gates', subjects: ['S5'] },
    { id: 'T6', name: 'Coach Carter', subjects: ['S6'] },
  ], []);

  const rooms: Room[] = useMemo(() => [
    { id: 'R101', name: 'Room 101', capacity: 30 },
    { id: 'R102', name: 'Room 102', capacity: 30 },
    { id: 'R103', name: 'Room 103', capacity: 30 },
    { id: 'LAB1', name: 'Science Lab', capacity: 25 },
    { id: 'GYM', name: 'Gymnasium', capacity: 100 },
  ], []);

  const timeSlots: TimeSlot[] = useMemo(() => [
    { id: 'SL1', startTime: '08:00', endTime: '09:00', label: '08:00 AM - 09:00 AM' },
    { id: 'SL2', startTime: '09:00', endTime: '10:00', label: '09:00 AM - 10:00 AM' },
    { id: 'SL3', startTime: '10:00', endTime: '11:00', label: '10:00 AM - 11:00 AM' },
    { id: 'SL4', startTime: '11:00', endTime: '12:00', label: '11:00 AM - 12:00 PM' },
    { id: 'SL5', startTime: '12:00', endTime: '13:00', label: '12:00 PM - 01:00 PM' },
    { id: 'SL6', startTime: '13:00', endTime: '14:00', label: '01:00 PM - 02:00 PM' },
    { id: 'SL7', startTime: '14:00', endTime: '15:00', label: '02:00 PM - 03:00 PM' },
  ], []);

  const days: DayOfWeek[] = useMemo(() => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], []);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await smartDb.getAll("TimetableEntry", user.uid);
      setEntries(data);
    } catch (error) {
      console.error("Error fetching timetable entries:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession || user.uid.startsWith('demo-')) {
      fetchEntries();
      return;
    }

    setLoading(true);
    const q = query(collection(db, "TimetableEntry"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TimetableEntry[];
      setEntries(data);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore snapshot failed for timetable, falling back to local fetch.");
      fetchEntries();
    });

    return () => unsubscribe();
  }, [user, isMockSession, fetchEntries]);

  const checkConflicts = useCallback(() => {
    const newConflicts: TimetableConflict[] = [];
    
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const e1 = entries[i];
        const e2 = entries[j];

        if (e1.day === e2.day && e1.slotId === e2.slotId) {
          // Teacher conflict
          if (e1.teacherId === e2.teacherId) {
            newConflicts.push({
              type: 'teacher',
              message: `Teacher ${teachers.find(t => t.id === e1.teacherId)?.name} is already assigned at this time.`,
              entryId: e1.id,
              conflictingEntryId: e2.id
            });
          }
          // Room conflict
          if (e1.roomId && e2.roomId && e1.roomId === e2.roomId) {
            newConflicts.push({
              type: 'room',
              message: `Room ${rooms.find(r => r.id === e1.roomId)?.name} is already occupied at this time.`,
              entryId: e1.id,
              conflictingEntryId: e2.id
            });
          }
          // Class/Section conflict
          if (e1.classId === e2.classId && e1.sectionId === e2.sectionId) {
            newConflicts.push({
              type: 'class',
              message: `Class ${e1.classId}-${e1.sectionId} already has a subject at this time.`,
              entryId: e1.id,
              conflictingEntryId: e2.id
            });
          }
        }
      }
    }
    setConflicts(newConflicts);
  }, [entries, teachers, rooms]);

  useEffect(() => {
    checkConflicts();
  }, [entries, checkConflicts]);

  const addEntry = async (entry: Omit<TimetableEntry, 'id'>) => {
    if (!user) return;
    try {
      const subject = subjects.find(s => s.id === entry.subjectId);
      await smartDb.create("TimetableEntry", {
        ...entry,
        uid: user.uid,
        color: subject?.color,
        createdAt: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchEntries();
      toast.success('Period added successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "TimetableEntry");
    }
  };

  const updateEntry = async (id: string, updates: Partial<TimetableEntry>) => {
    try {
      await smartDb.update("TimetableEntry", id, { ...updates, updatedAt: new Date().toISOString() });
      if (!isFirestoreWorking) fetchEntries();
      toast.info('Period updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "TimetableEntry");
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await smartDb.delete("TimetableEntry", id);
      if (!isFirestoreWorking) fetchEntries();
      toast.error('Period removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "TimetableEntry");
    }
  };

  const generateAITimetable = async (config: { classId: string; sectionId: string }) => {
    toast.loading('AI is generating an optimized timetable...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newEntries: Omit<TimetableEntry, 'id'>[] = [];
    days.forEach(day => {
      timeSlots.slice(0, 4).forEach((slot, idx) => {
        const subject = subjects[idx % subjects.length];
        const teacher = teachers.find(t => t.subjects.includes(subject.id)) || teachers[0];
        newEntries.push({
          day,
          slotId: slot.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          roomId: rooms[idx % rooms.length].id,
          classId: config.classId,
          sectionId: config.sectionId,
          color: subject.color,
          uid: user?.uid || ''
        });
      });
    });
    
    for (const entry of newEntries) {
      await addEntry(entry);
    }
    
    toast.dismiss();
    toast.success('AI Timetable generated successfully!');
  };

  const publishTimetable = () => {
    if (conflicts.length > 0) {
      toast.error('Cannot publish with active conflicts!');
      return;
    }
    setIsPublished(true);
    toast.success('Timetable published to students and teachers!');
  };

  return (
    <TimetableContext.Provider value={{
      entries,
      subjects,
      teachers,
      rooms,
      timeSlots,
      days,
      conflicts,
      addEntry,
      updateEntry,
      deleteEntry,
      generateAITimetable,
      checkConflicts,
      publishTimetable,
      isPublished,
      loading
    }}>
      {children}
    </TimetableContext.Provider>
  );
};

export const useTimetable = () => {
  const context = useContext(TimetableContext);
  if (context === undefined) {
    throw new Error('useTimetable must be used within a TimetableProvider');
  }
  return context;
};
