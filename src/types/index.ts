import { Timestamp, FieldValue } from "firebase/firestore";

export type LiveClassStatus = "live" | "upcoming" | "completed";

export interface LiveClass {
  id: string;
  title: string;
  subject: string;
  teacher: string;
  startTime: string;
  endTime: string;
  date: string;
  status: LiveClassStatus;
  studentsCount: number;
  description?: string;
  autoAttendance?: boolean;
  // Real Jitsi Meet room this class's video call happens in — generated once
  // when the class is scheduled so "Join Now" always opens a working call
  // instead of the old fake camera-tile mockup.
  jitsiRoom?: string;
  uid: string;
  branchId?: string;
  createdAt: Timestamp | FieldValue | string;
}

export interface CurriculumWeek {
  id: string;
  week: number;
  topic: string;
  content: string[];
  activities: string[];
  detailedContent?: string;
}

export interface CurriculumAssessment {
  type: string;
  week: number;
  weight: number;
}

export interface CurriculumUnit {
  id: string;
  name: string;
  difficulty: string;
  learningOutcomes: string[];
  weeks: CurriculumWeek[];
  assessments: CurriculumAssessment[];
}

export interface CurriculumTerm {
  id: string;
  name: string;
  units: CurriculumUnit[];
}

export type CurriculumType = 'CBSE' | 'IB' | 'Cambridge' | 'ICSE' | 'Montessori' | 'AI' | 'Hybrid';

export interface Curriculum {
  id: string;
  curriculumType: CurriculumType;
  grade: string;
  subject: string;
  board: string;
  academicYear: string;
  durationWeeks: number;
  status: 'draft' | 'published';
  structureType: 'unit_based' | 'chapter_based' | 'activity_based' | 'skill_based';
  terms: CurriculumTerm[];
  aiMetadata?: {
    generated: boolean;
    lastOptimized?: string;
    confidenceScore?: number;
    aiVersion?: string;
  };
  referenceMaterial?: string;
  uid: string;
  branchId?: string;
  createdAt: { seconds: number; nanoseconds: number } | string | null;
  updatedAt: { seconds: number; nanoseconds: number } | string | null;
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  status: string;
  email: string;
  phone?: string;
  address?: string;
  grade?: string;
  section?: string;
  uid: string;
  // Which campus/branch this student belongs to (BranchContext) — absent on
  // every existing record since this school has no branches tagged yet;
  // set on new records once a branch is actively selected at creation time.
  branchId?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
  medicalConditions?: string;
  allergies?: string;
  
  // Parent Details
  fatherName?: string;
  motherName?: string;
  fatherPhone?: string;
  motherPhone?: string;
  fatherEmail?: string;
  motherEmail?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  fatherEmployer?: string;
  motherEmployer?: string;

  // Guardian Details
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianOccupation?: string;
  guardianAddress?: string;
  guardianEmergencyContact?: string;

  // Address Details
  currentAddress?: string;
  permanentAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;

  // Academic Details
  stream?: string;
  academicYear?: string;
  previousSchool?: string;
  enrollmentDate?: string;
  admissionNumber?: string;
  rollNumber?: string;
  dateOfAdmission?: string;

  // Medical Details
  bloodGroup?: string;
  emergencyMedicalNotes?: string;

  // Fee Details
  feePlan?: string;
  outstandingBalance?: number;
  scholarshipDetails?: string;

  // Intelligence Fields
  attendance?: number;
  feeStatus?: "Paid" | "Pending" | "Overdue";
  performance?: "Excellent" | "Good" | "Average" | "Below Average" | "Poor";
  riskScore?: number;
  parentEngagement?: "High" | "Medium" | "Low";
  lastPresence?: string;
  avatar?: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  } | string;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  email: string;
  phone?: string;
  joinDate?: string;
  salary?: number;
  bankName?: string;
  accountNumber?: string;
  /** `url` is a data-URL for small files uploaded via the Staff Directory; older/larger docs are metadata-only. */
  documents?: { name: string; size: string; date: string; type: string; url?: string }[];
  uid: string;
  branchId?: string;
  createdAt?: {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  } | string;
}

export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type LeaveType =
  | "Annual Leave" | "Sick Leave" | "Personal Leave" | "Maternity Leave" | "Paternity Leave"
  | "Casual Leave" | "Emergency Leave" | "Duty Leave" | "Special Leave" | "Unpaid Leave"
  | "Family Emergency" | "Medical Appointment" | "Other";

export interface ApprovalStep {
  roleId: string;
  label: string;
  status: "Pending" | "Approved" | "Rejected";
  remark?: string;
  actedAt?: string;
  actedBy?: string;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  days: number;
  appliedOn: string;
  uid: string;
  branchId?: string;
  createdAt: Timestamp | FieldValue | string;
  /** Distinguishes who raised the request so the admin queue can route it correctly. */
  category?: "staff" | "student";
  /** Optional uploaded supporting document filename. */
  docFile?: string;
  /** Reviewer's note recorded on approve/reject. */
  approverRemark?: string;
  /** Ordered list of approval steps; built on submission, updated on each approval action. */
  approvalChain?: ApprovalStep[];
  /** Index into approvalChain indicating which step is currently active. */
  currentStep?: number;
}
