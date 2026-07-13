// The 15 Help Center categories — one per admin sidebar nav group
// (src/lib/navGroups.ts) so Help Center coverage maps 1:1 onto the app's
// own navigation and nothing is orphaned or duplicated.
export interface CategoryMeta {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide-react icon name, resolved in the Help Center pages
}

export const HELP_CATEGORIES: CategoryMeta[] = [
  { id: "student-management", title: "Student Management", description: "Directory, admissions, attendance, health, conduct, and student lifecycle.", icon: "Users" },
  { id: "academics", title: "Academics", description: "Classes, timetables, subjects, assignments, assessments, gradebook, and the library.", icon: "GraduationCap" },
  { id: "examinations", title: "Examinations", description: "Exam setup, seating, hall tickets, marks entry, and results.", icon: "ClipboardCheck" },
  { id: "reports", title: "Reports & Certificates", description: "Report cards, transcripts, and official certificate requests.", icon: "FileCheck" },
  { id: "teaching-learning", title: "Teaching & Learning", description: "The coding lab and plagiarism-detection tools.", icon: "Code2" },
  { id: "staff-hr", title: "Staff & HR", description: "Staff directory, onboarding, attendance, leave, payroll, recruitment, and appraisals.", icon: "Briefcase" },
  { id: "finance", title: "Finance", description: "Fees, invoicing, scholarships, purchase approvals, budgeting, and financial reports.", icon: "DollarSign" },
  { id: "communication", title: "Communication", description: "Announcements, messages, notifications, and the shared calendar.", icon: "MessageSquare" },
  { id: "transport", title: "Transport", description: "Fleet, routes, student allocations, live GPS tracking, and driver operations.", icon: "Bus" },
  { id: "hostel-cafeteria", title: "Hostel & Cafeteria", description: "Room allocation, hostel attendance, visitor logs, and the cafeteria/mess menu.", icon: "Bed" },
  { id: "security", title: "Security", description: "Visitor management, gate passes, and incident reporting.", icon: "Shield" },
  { id: "inventory", title: "Inventory & Procurement", description: "Stock levels, vendors, and purchase orders.", icon: "Package" },
  { id: "intelligence", title: "Intelligence & Analytics", description: "Analytics, predictive insights, the AI Center, and compliance reporting.", icon: "BarChart3" },
  { id: "multi-branch", title: "Multi-Branch", description: "Managing more than one school branch from a single account.", icon: "Building2" },
  { id: "administration", title: "Administration", description: "Users & roles, academic/finance configuration, integrations, and system settings.", icon: "Settings" },
];
