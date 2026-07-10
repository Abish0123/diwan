export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
}

export interface TimetableEntry {
  id: string;
  day: DayOfWeek;
  slotId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string;
  classId: string;
  sectionId: string;
  color?: string;
  startTime?: string;
  endTime?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface Teacher {
  id: string;
  name: string;
  subjects: string[]; // subject IDs
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export interface TimetableConflict {
  type: 'teacher' | 'room' | 'class';
  message: string;
  entryId: string;
  conflictingEntryId: string;
}
