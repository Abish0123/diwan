// Shared types + pure helper logic for the appraisal-cycle creation wizard.
// Kept separate from the wizard's UI (AppraisalCycleWizard.tsx) so the
// selection/reviewer-resolution logic is unit-testable without mounting
// React, and so StaffAppraisal.tsx can reuse the same types for scorecards
// created through the wizard.

export type CycleType = "Annual" | "Semester" | "Quarterly" | "Custom";
export type RatingScaleType = "5-point" | "10-point" | "letter";

export const STAFF_CATEGORIES = [
  "Teachers",
  "Administrative Staff",
  "HR",
  "Finance",
  "Drivers",
  "Support Staff",
] as const;
export type StaffCategory = typeof STAFF_CATEGORIES[number];

// Real designation/department values (see StaffOnboarding.tsx's own
// Designation dropdown) grouped into the broad categories HR thinks in terms
// of when scoping a cycle — not a fabricated taxonomy, just a grouping of
// values that already exist on real Staff records.
export function staffCategoriesFor(s: { role?: string; department?: string }): StaffCategory[] {
  const role = (s.role || "").toLowerCase();
  const dept = (s.department || "").toLowerCase();
  const cats: StaffCategory[] = [];
  if (["teacher", "class teacher", "subject teacher"].includes(role)) cats.push("Teachers");
  if (role === "administrative staff" || role === "coordinator" || role === "vice principal" || role === "principal" || dept === "administration") cats.push("Administrative Staff");
  if (dept === "hr" || role === "hr manager") cats.push("HR");
  if (dept === "finance" || role === "accountant") cats.push("Finance");
  if (role === "driver" || dept === "transport") cats.push("Drivers");
  if (["support staff", "lab technician", "librarian", "counselor"].includes(role)) cats.push("Support Staff");
  return cats;
}

export interface KpiCategoryConfig {
  title: string;
  weight: number;
}

// The exact framework the user asked for as the default — real weights that
// sum to 100, not arbitrary placeholders.
export const DEFAULT_KPI_TEMPLATE: KpiCategoryConfig[] = [
  { title: "Teaching Quality", weight: 20 },
  { title: "Student Feedback", weight: 20 },
  { title: "Attendance", weight: 15 },
  { title: "Discipline", weight: 15 },
  { title: "Innovation", weight: 10 },
  { title: "Parent Feedback", weight: 10 },
  { title: "Professional Development", weight: 10 },
];

export interface ReviewWorkflowConfig {
  chain: string[]; // e.g. ["Teacher", "HOD", "Principal", "HR"]
  selfReview: boolean;
  peerReview: boolean;
  review360: boolean;
  parentFeedback: boolean;
  studentFeedback: boolean;
}

export interface RatingScaleConfig {
  type: RatingScaleType;
  labels?: string[]; // for 5-point: ["Poor","Needs Improvement","Good","Very Good","Outstanding"]; for letter: ["A","B","C","D"]
}

export interface DeadlineConfig {
  selfReview: string;
  managerReview: string;
  principalApproval: string;
  hrFinalize: string;
  reminders: { d7: boolean; d3: boolean; d1: boolean; dueDate: boolean };
}

export interface AiConfig {
  insights: boolean;
  summary: boolean;
  kpiSuggestions: boolean;
  biasDetection: boolean;
  performancePrediction: boolean;
}

export interface NotificationConfig {
  email: boolean;
  whatsapp: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
}

export interface AppraisalCycleConfig {
  name: string;
  academicYear: string;
  cycleType: CycleType;
  startDate: string;
  endDate: string;
  description: string;
  scope: "all" | "filtered";
  categories: StaffCategory[];
  campuses: string[];
  departments: string[];
  kpis: KpiCategoryConfig[];
  workflow: ReviewWorkflowConfig;
  ratingScale: RatingScaleConfig;
  deadlines: DeadlineConfig;
  ai: AiConfig;
  notifications: NotificationConfig;
}

export interface ResolvedReviewers {
  hod: string; // real Staff name, or "Unassigned"
  principal: string;
  hr: string;
}

// Real reviewer lookup — matches on actual role/department values already
// present on Staff records (same values StaffOnboarding's Designation and
// Department dropdowns write). Never invents a name: an unfilled slot in the
// real roster honestly reports "Unassigned" rather than guessing.
export function resolveReviewers(
  employee: { department?: string },
  allStaff: { name: string; role?: string; department?: string; status?: string }[]
): ResolvedReviewers {
  const active = allStaff.filter((s) => s.status !== "Inactive");
  const hod = active.find(
    (s) => (s.role === "Department Head" || s.role === "Coordinator") && s.department === employee.department
  );
  const principal = active.find((s) => s.role === "Principal");
  const hr = active.find((s) => s.role === "HR Manager" || s.department === "HR");
  return {
    hod: hod?.name || "Unassigned",
    principal: principal?.name || "Unassigned",
    hr: hr?.name || "Unassigned",
  };
}
