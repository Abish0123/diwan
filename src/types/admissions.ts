export type LeadStatus = 'Enquiry' | 'Form Sent' | 'Form Submitted' | 'Payment Done' | 'Exam' | 'Interview' | 'Doc Verification' | 'School Fee' | 'Section Allocation' | 'Enrolled';

export interface Lead {
  id: string;
  studentName: string;
  parentName: string;
  phone: string;
  email: string;
  interestedClass: string;
  source: 'Website' | 'Walk-in' | 'Ads' | 'Referral' | 'Social Media' | 'Phone Call' | 'Open Day';
  notes: string;
  status: LeadStatus;
  score: number;
  aiInsight?: string;
  createdAt: string;
  updatedAt: string;
  // Admission form & payment
  formLinkSent?: boolean;
  formSubmittedDate?: string;
  admissionFeesPaid?: boolean;
  admissionFeesAmount?: number;
  invoiceNumber?: string;
  paymentDate?: string;
  // Exam
  examDate?: string;
  examTime?: string;
  examVenue?: string;
  examResult?: 'Pass' | 'Fail' | 'Pending';
  // Interview
  interviewDate?: string;
  interviewTime?: string;
  interviewPanel?: string;
  interviewResult?: 'Pass' | 'Fail' | 'Pending';
  // Document verification & section allocation
  docsApproved?: boolean;
  docsApprovedDate?: string;
  allocatedGrade?: string;
  allocatedSection?: string;
  onboardingStatus?: {
    classAssigned: boolean;
    feesSetup: boolean;
    docsUploaded: boolean;
    portalActivated: boolean;
    parentDetailsAdded: boolean;
  };
  studentId?: string;
  assignedClass?: string;
}

export interface LeadDocument {
  id: string;
  leadId: string;
  name: string;
  type: 'Birth Certificate' | 'ID Proof' | 'Previous Records' | 'Other';
  status: 'Verified' | 'Pending' | 'Missing' | 'Rejected';
  url?: string;
}

export interface LeadCommunication {
  id: string;
  leadId: string;
  type: 'Call' | 'Message' | 'Email';
  content: string;
  timestamp: string;
  outcome?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  isActive: boolean;
  /** Message template used when the rule's action sends an email. */
  template?: string;
  /** ISO timestamp of the last time this rule actually fired (undefined = never). */
  lastRun?: string;
}
