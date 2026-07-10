import { Timestamp } from "firebase/firestore";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: "Active" | "On Leave" | "Inactive" | "Terminated";
  joinDate: string;
  baseSalary: number;
  allowances: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  bankDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  leaveBalance: {
    annual: number;
    sick: number;
    other: number;
  };
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  type: "Annual" | "Sick" | "Maternity" | "Paternity" | "Other";
  startDate: string;
  endDate: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  staff?: string; // Legacy field
  amount?: number; // Legacy field
  period: string; // e.g., "March 2024"
  role?: string;
  baseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  netSalary: number;
  status: "Draft" | "Processed" | "Paid" | "Pending";
  paymentDate?: string;
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface ScreeningQuestion {
  id: string;
  question: string;
  idealAnswer: string;
  isEssential: boolean;
  type: "Education" | "Experience" | "Skill" | "Language" | "Location" | "Custom";
}

export interface JobOpening {
  id: string;
  title: string;
  department: string;
  company?: string;
  workplaceType: "On-site" | "Remote" | "Hybrid";
  location: string;
  type: "Full-time" | "Part-time" | "Contract";
  description: string;
  requirements: string[];
  screeningQuestions: ScreeningQuestion[];
  rejectionSettings: {
    enabled: boolean;
    message: string;
  };
  manageApplicants: {
    onPlatform: boolean;
    emailUpdates: string;
  };
  hiringFrame: boolean;
  status: "Open" | "Closed";
  uid: string;
  createdAt: Timestamp;
}

export interface JobApplication {
  id: string;
  jobId: string;
  applicantName: string;
  email: string;
  phone: string;
  resumeUrl: string;
  coverLetter?: string;
  status: "Pending" | "Reviewing" | "Interview" | "Hired" | "Rejected";
  appliedDate: string;
  answers: { questionId: string; question: string; answer: string }[];
  uid: string;
  createdAt: Timestamp;
}
