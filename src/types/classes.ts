export interface Class {
  id: string;
  name: string;
  grade: string;
  teacher?: string;
  academicYearId: string;
  academicYear: string;
  sections: string[]; // List of section IDs or names
  section?: string;
  subjects: string[];
  subjectsCount?: number;
  studentsCount?: number;
  status: 'Active' | 'Inactive';
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

export interface Student {
  id: string;
  name: string;
  email: string;
  classId: string;
  sectionId: string;
  sectionName?: string;
  status: 'Active' | 'Inactive' | 'Pending' | 'Promoted' | 'Withdrawn' | 'Graduated' | 'Suspended';
  uid: string;
  image?: string;
  rollNo?: string;
}

export interface Section {
  id: string;
  name: string;
  classId: string;
  className: string;
  teacherId?: string;
  teacherName?: string;
  capacity: number;
  studentsCount: number;
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  academicYear: string;
  status: 'Active' | 'Promoted' | 'Withdrawn' | 'Graduated';
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Upcoming' | 'Completed';
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

export interface TimetableSlot {
  id: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  startTime: string;
  endTime: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  sectionId: string;
  uid: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
}

export interface PerformanceMetric {
  classAverage: number;
  attendanceRate: number;
  subjectWisePerformance: { subject: string; score: number }[];
  topPerformers: { name: string; score: number }[];
  weakStudents: { name: string; score: number }[];
  aiInsight?: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  classId: string;
  subject: string;
  status: 'Pending' | 'Active' | 'Completed' | 'Graded' | 'Overdue';
  submissionsCount: number;
  uid: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Achievement {
  id: string;
  studentId: string;
  studentName: string;
  type?: string;
  title?: string;
  category?: string;
  issuedDate?: string;
  date?: string;
  grade?: string;
  status?: string;
  image?: string;
  description?: string;
  issuer?: string;
  uid?: string;
  createdAt?: any;
}
