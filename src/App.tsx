import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isRouteAllowed } from "./lib/routeAccess";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { RoleAccessSync } from "./contexts/RoleAccessContext.tsx";
import { StudentProvider } from "./contexts/StudentContext.tsx";
import { BranchProvider } from "./contexts/BranchContext.tsx";
import { ClassProvider } from "./contexts/ClassContext.tsx";
import { LiveClassProvider } from "./contexts/LiveClassContext.tsx";
import { StaffProvider } from "./contexts/StaffContext.tsx";
import { AssignmentProvider } from "./contexts/AssignmentContext.tsx";
import { SubmissionProvider } from "./contexts/SubmissionContext.tsx";
import { FlashCardProvider } from "./contexts/FlashCardContext.tsx";
import { LearningUniverseProvider } from "./contexts/LearningUniverseContext.tsx";
import { AdmissionsProvider } from "./contexts/AdmissionsContext.tsx";
import { CurriculumProvider } from "./contexts/CurriculumContext.tsx";
import { LeaveProvider } from "./contexts/LeaveContext.tsx";
import { RecruitmentProvider } from "./contexts/RecruitmentContext.tsx";
import { NoticeProvider } from "./contexts/NoticeContext.tsx";
import { HRSettingsProvider } from "./contexts/HRSettingsContext.tsx";
import { NotificationsProvider } from "./contexts/NotificationsContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { useAuth } from "./hooks/useAuth.ts";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import { AppLayout } from "./components/layout/AppLayout.tsx";

// ── Lazy-loaded pages (each chunk only downloads when the route is first visited)
const Index                  = lazy(() => import("./pages/Index.tsx"));
const Login                  = lazy(() => import("./pages/Login.tsx"));
const ResetPassword          = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound               = lazy(() => import("./pages/NotFound.tsx"));
const Students               = lazy(() => import("./pages/Students.tsx"));
const Staff                  = lazy(() => import("./pages/Staff.tsx"));
const Attendance             = lazy(() => import("./pages/Attendance.tsx"));
const Behavior               = lazy(() => import("./pages/Behavior.tsx"));
const Graduates              = lazy(() => import("./pages/Graduates.tsx"));
const StudentExit            = lazy(() => import("./pages/students/StudentExit.tsx"));
const Library                = lazy(() => import("./pages/Library.tsx"));
const Admissions             = lazy(() => import("./pages/Admissions.tsx"));
const AiTutor                = lazy(() => import("./pages/AiTutor.tsx"));
const Timetable              = lazy(() => import("./pages/Timetable.tsx"));
const Users                  = lazy(() => import("./pages/Users.tsx"));
const SystemSettings         = lazy(() => import("./pages/SystemSettings.tsx"));
const BoardDashboard         = lazy(() => import("./pages/BoardDashboard.tsx"));

// Academics
const ClassesList            = lazy(() => import("./pages/academics/classes/ClassesList.tsx"));
const CreateClassWizard      = lazy(() => import("./pages/academics/classes/CreateClassWizard.tsx"));
const CreateSectionWizard    = lazy(() => import("./pages/academics/classes/CreateSectionWizard.tsx"));
const ClassDetail            = lazy(() => import("./pages/academics/classes/ClassDetail.tsx"));
const ApplicationForm        = lazy(() => import("./pages/admissions/ApplicationForm.tsx"));
const AdmissionOfficerDashboard = lazy(() => import("./pages/admissions/AdmissionOfficerDashboard.tsx"));
const PublicAdmissionForm    = lazy(() => import("./pages/admissions/PublicAdmissionForm.tsx"));
const Assignments            = lazy(() => import("./pages/academics/Assignments.tsx"));
const CreateAssignment       = lazy(() => import("./pages/academics/CreateAssignment.tsx"));
const SubmissionReviewCenter = lazy(() => import("./pages/academics/SubmissionReviewCenter.tsx"));
const Exams                  = lazy(() => import("./pages/academics/Exams.tsx"));
const Transcripts            = lazy(() => import("./pages/academics/Transcripts.tsx"));
const FlashCards             = lazy(() => import("./pages/academics/FlashCards.tsx"));
const FlashCardPractice      = lazy(() => import("./pages/academics/FlashCardPractice.tsx"));
const FlashCardGame          = lazy(() => import("./pages/academics/FlashCardGame.tsx"));
const MissionGenerator       = lazy(() => import("./pages/academics/MissionGenerator.tsx"));
const FlashCardAnalytics     = lazy(() => import("./pages/academics/FlashCardAnalytics.tsx"));
const LiveClasses            = lazy(() => import("./pages/academics/LiveClasses.tsx"));
const LiveClassDetails       = lazy(() => import("./pages/academics/LiveClassDetails.tsx"));
const LiveClassRoom          = lazy(() => import("./pages/academics/LiveClassRoom.tsx"));
const AdvancedCurriculum     = lazy(() => import("./pages/academics/AdvancedCurriculum.tsx"));
const Gradebook              = lazy(() => import("./pages/academics/Gradebook.tsx"));
const ReportCard             = lazy(() => import("./pages/academics/ReportCard.tsx"));
const CertificatesPage       = lazy(() => import("./pages/academics/Certificates.tsx"));
const LMS                    = lazy(() => import("./pages/academics/LMS.tsx"));
const Subjects               = lazy(() => import("./pages/academics/Subjects.tsx"));
const AITimetableGenerator    = lazy(() => import("./pages/academics/AITimetableGenerator.tsx"));
const Assessments            = lazy(() => import("./pages/academics/Assessments.tsx"));
const Achievements           = lazy(() => import("./pages/academics/Achievements.tsx"));
const CertificateRequests    = lazy(() => import("./pages/academics/CertificateRequests.tsx"));

// HR
const HRDashboard            = lazy(() => import("./pages/hr/HRDashboard.tsx"));
const StaffDirectory         = lazy(() => import("./pages/hr/StaffDirectory.tsx"));
const StaffOnboarding        = lazy(() => import("./pages/hr/StaffOnboarding.tsx"));
const LeaveManagement        = lazy(() => import("./pages/hr/LeaveManagement.tsx"));
const PayrollProcessing      = lazy(() => import("./pages/hr/PayrollProcessing.tsx"));
const Recruitment            = lazy(() => import("./pages/hr/Recruitment.tsx"));
const PTMBooking             = lazy(() => import("./pages/hr/PTMBooking.tsx"));
const StaffAppraisal         = lazy(() => import("./pages/hr/StaffAppraisal.tsx"));
const HRStaffSettingsDeepWorkflow = lazy(() => import("./pages/hr/HRStaffSettingsDeepWorkflow.tsx"));
// Finance
const FinanceOverview        = lazy(() => import("./pages/finance/FinanceOverview.tsx"));
const FeesManagement         = lazy(() => import("./pages/finance/FeesManagement.tsx"));
const Transactions           = lazy(() => import("./pages/finance/Transactions.tsx"));
const FinanceSetup           = lazy(() => import("./pages/finance/FinanceSetup.tsx"));
const Budgeting              = lazy(() => import("./pages/finance/Budgeting.tsx"));
const Reconciliation         = lazy(() => import("./pages/finance/Reconciliation.tsx"));
const FinancialStatements    = lazy(() => import("./pages/finance/FinancialStatements.tsx"));
const Automation             = lazy(() => import("./pages/finance/Automation.tsx"));
const Assets                 = lazy(() => import("./pages/finance/Assets.tsx"));
const Scholarships           = lazy(() => import("./pages/finance/Scholarships.tsx"));
const PurchaseApprovals      = lazy(() => import("./pages/finance/PurchaseApprovals.tsx"));

// Analytics
const AnalyticsHome          = lazy(() => import("./pages/analytics/AnalyticsHome.tsx"));
const AcademicReports        = lazy(() => import("./pages/analytics/AcademicReports.tsx"));
const FinanceReports         = lazy(() => import("./pages/analytics/FinanceReports.tsx"));
const HRReports              = lazy(() => import("./pages/analytics/HRReports.tsx"));
const CustomReportBuilder    = lazy(() => import("./pages/analytics/CustomReportBuilder.tsx"));
const PredictiveAnalytics    = lazy(() => import("./pages/analytics/PredictiveAnalytics.tsx"));
const PresentationBuilder    = lazy(() => import("./pages/analytics/PresentationBuilder.tsx"));
const ProductAnalytics       = lazy(() => import("./pages/analytics/ProductAnalytics.tsx"));

// Settings
const Permissions            = lazy(() => import("./pages/settings/Permissions.tsx"));
const AcademicSetup          = lazy(() => import("./pages/settings/AcademicSetup.tsx"));
const Integrations           = lazy(() => import("./pages/settings/Integrations.tsx"));
const AuditLogs              = lazy(() => import("./pages/settings/AuditLogs.tsx"));
const Documents              = lazy(() => import("./pages/settings/Documents.tsx"));
const RoomManagement         = lazy(() => import("./pages/settings/RoomManagement.tsx"));
const SubjectCodes           = lazy(() => import("./pages/academics/SubjectCodes.tsx"));

// Security / Inventory
const Visitors               = lazy(() => import("./pages/security/Visitors.tsx"));
const GatePass               = lazy(() => import("./pages/security/GatePass.tsx"));
const Incidents              = lazy(() => import("./pages/security/Incidents.tsx"));
const InventoryOverview       = lazy(() => import("./pages/inventory/Overview.tsx"));
const Stock                  = lazy(() => import("./pages/inventory/Stock.tsx"));
const Purchases              = lazy(() => import("./pages/inventory/Purchases.tsx"));
const Vendors                = lazy(() => import("./pages/inventory/Vendors.tsx"));
const PurchaseOrders         = lazy(() => import("./pages/inventory/PurchaseOrders.tsx"));

// Communication
const Announcements          = lazy(() => import("./pages/communication/Announcements.tsx"));
const Messages               = lazy(() => import("./pages/communication/Messages.tsx"));
const Notifications          = lazy(() => import("./pages/communication/Notifications.tsx"));
const Outreach               = lazy(() => import("./pages/communication/Outreach.tsx"));
const CommunicationCalendar  = lazy(() => import("./pages/communication/Calendar.tsx"));

// Transport
const TransportOverview      = lazy(() => import("./pages/transport/Overview.tsx"));
const TransportRoutes        = lazy(() => import("./pages/transport/TransportRoutes.tsx"));
const TransportVehicles      = lazy(() => import("./pages/transport/Vehicles.tsx"));
const TransportDrivers       = lazy(() => import("./pages/transport/Drivers.tsx"));
const TransportHelpers       = lazy(() => import("./pages/transport/Helpers.tsx"));
const TransportAllocation    = lazy(() => import("./pages/transport/Allocation.tsx"));
const TransportTracking      = lazy(() => import("./pages/transport/TransportTracking.tsx"));
const TransportOperations    = lazy(() => import("./pages/transport/Operations.tsx"));
const TransportReports       = lazy(() => import("./pages/transport/TransportReports.tsx"));
const TransportSettingsPage  = lazy(() => import("./pages/transport/TransportSettings.tsx"));
const GPSParentTracking      = lazy(() => import("./pages/transport/GPSParentTracking.tsx"));
const DriverGPS              = lazy(() => import("./pages/transport/DriverGPS.tsx"));
const DriverApp              = lazy(() => import("./pages/transport/DriverApp.tsx"));
const HelperApp              = lazy(() => import("./pages/transport/HelperApp.tsx"));

// Hostel
const Rooms                  = lazy(() => import("./pages/hostel/Rooms.tsx"));
const Allocation             = lazy(() => import("./pages/hostel/Allocation.tsx"));
const Mess                   = lazy(() => import("./pages/hostel/Mess.tsx"));
const HostelAttendance       = lazy(() => import("./pages/hostel/HostelAttendance.tsx"));
const HostelVisitorLog       = lazy(() => import("./pages/hostel/VisitorLog.tsx"));

// Portals
const StudentPortal          = lazy(() => import("./pages/students/StudentPortal.tsx"));
const Health                 = lazy(() => import("./pages/students/Health.tsx"));
const Alumni                 = lazy(() => import("./pages/students/Alumni.tsx"));
const ParentPortal           = lazy(() => import("./pages/portals/Index.tsx"));

// Parent portal pages
const ParentDashboard        = lazy(() => import("./pages/parent/ParentDashboard.tsx"));
const MyChildren             = lazy(() => import("./pages/parent/MyChildren.tsx"));
const ParentAttendance       = lazy(() => import("./pages/parent/ParentAttendance.tsx"));
const ParentTimetable        = lazy(() => import("./pages/parent/ParentTimetable.tsx"));
const ParentAssignments      = lazy(() => import("./pages/parent/ParentAssignments.tsx"));
const ParentLMS              = lazy(() => import("./pages/parent/ParentLMS.tsx"));
const ParentGradebook        = lazy(() => import("./pages/parent/ParentGradebook.tsx"));
const ParentAssessments      = lazy(() => import("./pages/parent/ParentAssessments.tsx"));
const ParentExams            = lazy(() => import("./pages/parent/ParentExams.tsx"));
const ParentReportCards      = lazy(() => import("./pages/parent/ParentReportCards.tsx"));
const ParentBehavior         = lazy(() => import("./pages/parent/ParentBehavior.tsx"));
const ParentAchievements     = lazy(() => import("./pages/parent/ParentAchievements.tsx"));
const ParentFees             = lazy(() => import("./pages/parent/ParentFees.tsx"));
const ParentPTM              = lazy(() => import("./pages/parent/ParentPTM.tsx"));
const ParentTransport        = lazy(() => import("./pages/parent/ParentTransport.tsx"));
const ParentHealth           = lazy(() => import("./pages/parent/ParentHealth.tsx"));
const ParentLibrary          = lazy(() => import("./pages/parent/ParentLibrary.tsx"));
const ParentDocuments        = lazy(() => import("./pages/parent/ParentDocuments.tsx"));
const ParentNotifications    = lazy(() => import("./pages/parent/ParentNotifications.tsx"));
const ParentStudyMaterials   = lazy(() => import("./pages/parent/ParentStudyMaterials.tsx"));
const ParentSettings         = lazy(() => import("./pages/parent/ParentSettings.tsx"));

// AI / Reports / Misc
const AICenter               = lazy(() => import("./pages/ai-center/AICenter.tsx"));
const SmartReports           = lazy(() => import("./pages/ai-center/SmartReports.tsx"));
const ExecutiveInsights      = lazy(() => import("./pages/ai-center/ExecutiveInsights.tsx"));
const ReportsHub             = lazy(() => import("./pages/reports/ReportsHub.tsx"));
const KHDAReport             = lazy(() => import("./pages/reports/KHDAReport.tsx"));
const BranchManagement       = lazy(() => import("./pages/branches/BranchManagement.tsx"));
const Cafeteria              = lazy(() => import("./pages/cafeteria/Cafeteria.tsx"));

// Coding Assessment
const StudentAssessments     = lazy(() => import("./pages/coding/StudentAssessments.tsx"));
const AssessmentIntro        = lazy(() => import("./pages/coding/AssessmentIntro.tsx"));
const CodingInterface        = lazy(() => import("./pages/coding/CodingInterface.tsx"));
const AssessmentResult       = lazy(() => import("./pages/coding/AssessmentResult.tsx"));
const InstructorTests        = lazy(() => import("./pages/coding/InstructorTests.tsx"));
const QuestionBank           = lazy(() => import("./pages/coding/QuestionBank.tsx"));
const LiveProctor            = lazy(() => import("./pages/coding/LiveProctor.tsx"));
const CodingAnalytics        = lazy(() => import("./pages/coding/CodingAnalytics.tsx"));
const CodingAdminDashboard   = lazy(() => import("./pages/coding/admin/AdminDashboard.tsx"));
const CodingProctoringSettings = lazy(() => import("./pages/coding/admin/ProctoringSettings.tsx"));
const CodingGradingRules     = lazy(() => import("./pages/coding/admin/GradingRules.tsx"));
const CodingAssignments      = lazy(() => import("./pages/coding/admin/Assignments.tsx"));
const CodingAuditLogs        = lazy(() => import("./pages/coding/admin/AuditLogs.tsx"));
const CodingClasses          = lazy(() => import("./pages/coding/admin/Classes.tsx"));

// Plagiarism
const ProjectReports         = lazy(() => import("./pages/plagiarism/ProjectReports.tsx"));
const ReportView             = lazy(() => import("./pages/plagiarism/ReportView.tsx"));

// Student portal — scoped pages (no admin/finance/HR access)
const StudentProfile        = lazy(() => import("./pages/student/Profile.tsx"));
const StudentAttendance     = lazy(() => import("./pages/student/Attendance.tsx"));
const StudentTimetable      = lazy(() => import("./pages/student/Timetable.tsx"));
const StudentAssignments    = lazy(() => import("./pages/student/Assignments.tsx"));
const StudentStudyMaterials = lazy(() => import("./pages/student/StudyMaterials.tsx"));
const StudentGradebook      = lazy(() => import("./pages/student/Gradebook.tsx"));
const StudentAssessmentsModule = lazy(() => import("./pages/student/Assessments.tsx"));
const StudentExams          = lazy(() => import("./pages/student/Exams.tsx"));
const StudentReportCards    = lazy(() => import("./pages/student/ReportCards.tsx"));
const StudentCertificates   = lazy(() => import("./pages/student/Certificates.tsx"));
const StudentFlashCards     = lazy(() => import("./pages/student/FlashCards.tsx"));
const StudentAchievements   = lazy(() => import("./pages/student/Achievements.tsx"));
const StudentLibrary        = lazy(() => import("./pages/student/Library.tsx"));
const StudentFees           = lazy(() => import("./pages/student/Fees.tsx"));
const StudentCafeteria      = lazy(() => import("./pages/student/StudentCafeteria.tsx"));
const StudentHealth         = lazy(() => import("./pages/student/Health.tsx"));
const StudentHomework       = lazy(() => import("./pages/student/Homework.tsx"));
const StudentTransport       = lazy(() => import("./pages/student/Transport.tsx"));
const StudentSettings       = lazy(() => import("./pages/student/Settings.tsx"));
const StudentNotifications  = lazy(() => import("./pages/student/StudentNotifications.tsx"));

// Teacher (Class Teacher) portal
const TeacherDashboard       = lazy(() => import("./pages/teacher/TeacherDashboard.tsx"));
const TeacherMyClass         = lazy(() => import("./pages/teacher/MyClass.tsx"));
const TeacherStudents        = lazy(() => import("./pages/teacher/TeacherStudents.tsx"));
const TeacherTimetable       = lazy(() => import("./pages/teacher/TeacherTimetable.tsx"));
const TeacherHomework        = lazy(() => import("./pages/teacher/Homework.tsx"));
const TeacherAssessments     = lazy(() => import("./pages/teacher/Assessments.tsx"));
const TeacherGradebook       = lazy(() => import("./pages/teacher/TeacherGradebook.tsx"));
const TeacherStudyMaterials  = lazy(() => import("./pages/teacher/StudyMaterials.tsx"));
const TeacherLMS             = lazy(() => import("./pages/teacher/TeacherLMS.tsx"));
const TeacherFlashCards      = lazy(() => import("./pages/teacher/TeacherFlashcards.tsx"));
const TeacherExams           = lazy(() => import("./pages/teacher/TeacherExams.tsx"));
const MyInvigilations        = lazy(() => import("./pages/teacher/MyInvigilations.tsx"));
const TeacherReports         = lazy(() => import("./pages/teacher/Reports.tsx"));
const TeacherAttendance      = lazy(() => import("./pages/teacher/TeacherAttendance.tsx"));
const TeacherAssignments     = lazy(() => import("./pages/teacher/TeacherAssignments.tsx"));
const TeacherBehavior        = lazy(() => import("./pages/teacher/TeacherBehavior.tsx"));
const TeacherPTM             = lazy(() => import("./pages/teacher/TeacherPTM.tsx"));
const TeacherProjectReports  = lazy(() => import("./pages/teacher/TeacherProjectReports.tsx"));
const TeacherLeave           = lazy(() => import("./pages/teacher/TeacherLeave.tsx"));
const TeacherNotifications   = lazy(() => import("./pages/teacher/TeacherNotifications.tsx"));
const TeacherSettings        = lazy(() => import("./pages/teacher/TeacherSettings.tsx"));

// ── Lightweight spinner shown while a page chunk is downloading ────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="h-8 w-8 border-4 border-[#9810fa] border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Auth guard ─────────────────────────────────────────────────────────────────
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-[#9810fa] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing Student Diwan...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isRouteAllowed(role, location.pathname)) {
    toast.error("You don't have access to that page.");
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Coding module landing — students see assessments, staff/admins manage tests
const CodingEntry = () => {
  const { role } = useAuth();
  return role === "student" ? <StudentAssessments /> : <InstructorTests />;
};

// Role-aware home: teachers and students get their own portal, admins get Index
const VALID_TEACHER_LANDING_PAGES = new Set([
  "/teacher/dashboard", "/teacher/my-class", "/teacher/attendance",
  "/teacher/assessments", "/teacher/exams",
]);

const HomeRouter = () => {
  const { role, user } = useAuth();
  if (role === "staff") {
    // Real per-teacher preference from Settings ("Landing page") — falls
    // back to the dashboard when unset/invalid rather than trusting an
    // arbitrary stored string as a route.
    let landing = "/teacher/dashboard";
    try {
      const uid = (user as any)?.uid || (user as any)?.email;
      const raw = uid && localStorage.getItem(`sd_teacher_settings_${uid}`);
      const stored = raw && JSON.parse(raw)?.landingPage;
      if (stored && VALID_TEACHER_LANDING_PAGES.has(stored)) landing = stored;
    } catch { /* ignore, use default */ }
    return <Navigate to={landing} replace />;
  }
  if (role === "student") return <Navigate to="/portals/student" replace />;
  if (role === "parent") return <Navigate to="/parent/dashboard" replace />;
  return <Index />;
};

// ── React Query client — 5-min stale time prevents refetch on every tab switch
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RoleAccessSync />
          <BranchProvider>
          <StudentProvider>
          <NotificationsProvider>
            <ClassProvider>
              <LiveClassProvider>
                <StaffProvider>
                  <AssignmentProvider>
                    <SubmissionProvider>
                      <FlashCardProvider>
                        <LearningUniverseProvider>
                        <AdmissionsProvider>
                          <CurriculumProvider>
                            <LeaveProvider>
                              <RecruitmentProvider>
                                <NoticeProvider>
                                  <HRSettingsProvider>
                                    <TooltipProvider>
                                    <Toaster />
                                    <Sonner />
                                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                                      <Suspense fallback={<PageLoader />}>
                                        <Routes>
                                          <Route path="/login" element={<Login />} />
                                          <Route path="/reset-password" element={<ResetPassword />} />

                                          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                                            <Route path="/" element={<HomeRouter />} />
                                            <Route path="/dashboard" element={<Navigate to="/" replace />} />
                                            <Route path="/classes" element={<ClassesList />} />
                                            <Route path="/academics" element={<Navigate to="/academics/classes" replace />} />
                                            <Route path="/academics/classes" element={<ClassesList />} />
                                            <Route path="/academics/classes/new" element={<CreateClassWizard />} />
                                            <Route path="/academics/classes/new-section" element={<CreateSectionWizard />} />
                                            <Route path="/academics/classes/:id" element={<ClassDetail />} />
                                            <Route path="/timetable" element={<Timetable />} />
                                            <Route path="/academics/timetable" element={<Navigate to="/timetable" replace />} />
                                            <Route path="/academics/homework" element={<Navigate to="/assignments" replace />} />
                                            <Route path="/academics/assignments" element={<Navigate to="/assignments" replace />} />
                                            <Route path="/library" element={<Library />} />
                                            <Route path="/students" element={<Students />} />
                                            <Route path="/students/new" element={<Navigate to="/admissions/new" replace />} />
                                            <Route path="/admissions" element={<Admissions />} />
                                            <Route path="/admissions/new" element={<ApplicationForm />} />
                                            <Route path="/admissions/officer" element={<AdmissionOfficerDashboard />} />
                                            {/* Retired — school fee payment now goes through the real Invoice
                                                pipeline (Finance "Generate Fee Invoice" → parent's own Fees page),
                                                not this standalone FinancePendingPayment-based flow. Old email
                                                links land safely on the parent's real Fees page instead of a dead end. */}
                                            <Route path="/school-fees-payment" element={<Navigate to="/parent/fees" replace />} />
                                            <Route path="/behavior" element={<Behavior />} />
                                            <Route path="/graduates" element={<Graduates />} />
                                            <Route path="/students/exit" element={<StudentExit />} />
                                            <Route path="/attendance" element={<Attendance />} />
                                            <Route path="/staff" element={<Staff />} />
                                            <Route path="/staff/list" element={<Navigate to="/hr/staff" replace />} />
                                            <Route path="/staff/performance" element={<Navigate to="/analytics/hr" replace />} />
                                            <Route path="/users" element={<Users />} />
                                            <Route path="/ai-tutor" element={<AiTutor />} />

                                            {/* HR */}
                                            <Route path="/hr" element={<HRDashboard />} />
                                            <Route path="/hr/dashboard" element={<HRDashboard />} />
                                            <Route path="/hr/staff" element={<StaffDirectory />} />
                                            <Route path="/hr/onboarding" element={<StaffOnboarding />} />
                                            <Route path="/hr/leave" element={<LeaveManagement />} />
                                            <Route path="/hr/payroll" element={<PayrollProcessing />} />
                                            <Route path="/hr/recruitment" element={<Recruitment />} />
                                            <Route path="/hr/attendance" element={<Attendance />} />
                                            <Route path="/hr/ptm" element={<PTMBooking />} />
                                            <Route path="/hr/appraisal" element={<StaffAppraisal />} />
                                            <Route path="/hr/settings" element={<HRStaffSettingsDeepWorkflow />} />

                                            {/* Finance */}
                                            <Route path="/finance" element={<FinanceOverview />} />
                                            <Route path="/finance/overview" element={<FinanceOverview />} />
                                            <Route path="/finance/fees" element={<FeesManagement />} />
                                            <Route path="/finance/transactions" element={<Transactions />} />
                                            {/* Billing retired 2026-07-01 — its Invoices/Receipts tabs never worked (schema
                                                mismatch with the real Invoice shape) and its 4 real features (Admission/School
                                                Fee confirmation, VAT Invoices, Online Payments) now live in Fees Management. */}
                                            <Route path="/finance/billing" element={<Navigate to="/finance/fees" replace />} />
                                            <Route path="/finance/budget" element={<Budgeting />} />
                                            <Route path="/finance/assets" element={<Assets />} />
                                            <Route path="/finance/reconciliation" element={<Reconciliation />} />
                                            <Route path="/finance/statements" element={<FinancialStatements />} />
                                            <Route path="/finance/setup" element={<FinanceSetup />} />
                                            <Route path="/finance/automation" element={<Automation />} />
                                            <Route path="/finance/scholarships" element={<Scholarships />} />
                                            <Route path="/finance/purchase-approvals" element={<PurchaseApprovals />} />
                                            <Route path="/finance/expenses" element={<Navigate to="/finance/transactions" replace />} />
                                            <Route path="/finance/income" element={<Navigate to="/finance/fees" replace />} />
                                            <Route path="/finance/reports" element={<Navigate to="/analytics/finance" replace />} />
                                            <Route path="/finance/payroll" element={<Navigate to="/hr/payroll" replace />} />

                                            {/* Security */}
                                            <Route path="/security" element={<Visitors />} />
                                            <Route path="/security/visitors" element={<Visitors />} />
                                            <Route path="/security/gate-pass" element={<GatePass />} />
                                            <Route path="/security/incidents" element={<Incidents />} />

                                            {/* Inventory & Procurement */}
                                            <Route path="/inventory/overview" element={<InventoryOverview />} />
                                            <Route path="/inventory/stock" element={<Stock />} />
                                            <Route path="/inventory/purchases" element={<Purchases />} />
                                            <Route path="/inventory/vendors" element={<Vendors />} />
                                            <Route path="/inventory/orders" element={<PurchaseOrders />} />

                                            {/* Students sub-pages */}
                                            <Route path="/students/health" element={<Health />} />
                                            <Route path="/students/alumni" element={<Alumni />} />

                                            {/* Academics */}
                                            <Route path="/academics/flashcards" element={<FlashCards />} />
                                            <Route path="/academics/flashcards/practice/:setId" element={<FlashCardPractice />} />
                                            <Route path="/academics/flashcards/game/:setId" element={<FlashCardGame />} />
                                            <Route path="/academics/mission-generator" element={<MissionGenerator />} />
                                            <Route path="/academics/flashcards/analytics/:setId" element={<FlashCardAnalytics />} />
                                            <Route path="/academics/live-classes" element={<LiveClasses />} />
                                            <Route path="/academics/live-classes/:id" element={<LiveClassDetails />} />
                                            <Route path="/academics/live-classes/room/:id" element={<LiveClassRoom />} />
                                            <Route path="/academics/curriculum" element={<AdvancedCurriculum />} />
                                            <Route path="/academics/gradebook" element={<Gradebook />} />
                                            <Route path="/academics/report-cards" element={<ReportCard />} />
                                            <Route path="/academics/certificates" element={<CertificatesPage />} />
                                            <Route path="/academics/lms" element={<LMS />} />
                                            <Route path="/academics/subjects" element={<Subjects />} />
                                            <Route path="/academics/ai-timetable" element={<AITimetableGenerator />} />
                                            <Route path="/academics/assessments" element={<Assessments />} />
                                            <Route path="/academics/transcripts" element={<Transcripts />} />
                                            <Route path="/academics/achievements" element={<Achievements />} />
                                            <Route path="/academics/certificate-requests" element={<CertificateRequests />} />
                                            <Route path="/assignments" element={<Assignments />} />
                                            <Route path="/assignments/new" element={<CreateAssignment />} />
                                            <Route path="/assignments/:assignmentId/edit" element={<CreateAssignment />} />
                                            <Route path="/assignments/:assignmentId/submissions" element={<SubmissionReviewCenter />} />
                                            <Route path="/exams" element={<Navigate to="/exams/setup" replace />} />
                                            <Route path="/exams/setup" element={<Exams />} />
                                            {/* Mark Entry & Results are no longer admin wizard steps — once an exam
                                                is over, the assigned class/subject teacher enters marks in their own
                                                portal (Teacher > Exams), and the Gradebook picks them up automatically. */}
                                            <Route path="/exams/marks" element={<Navigate to="/exams/setup" replace />} />
                                            <Route path="/exams/results" element={<Navigate to="/exams/setup" replace />} />
                                            <Route path="/exams/seating" element={<Navigate to="/exams/setup?step=rooms" replace />} />
                                            <Route path="/exams/hall-tickets" element={<Navigate to="/exams/setup?step=hall-tickets" replace />} />
                                            <Route path="/exams/invigilators" element={<Navigate to="/exams/setup?step=invigilators" replace />} />
                                            <Route path="/exams/attendance" element={<Navigate to="/exams/setup?step=attendance" replace />} />

                                            {/* Communication */}
                                            <Route path="/communication" element={<Announcements />} />
                                            <Route path="/communication/announcements" element={<Announcements />} />
                                            <Route path="/communication/messages" element={<Messages />} />
                                            <Route path="/communication/notifications" element={<Notifications />} />
                                            <Route path="/communication/outreach" element={<Outreach />} />
                                            <Route path="/communication/calendar" element={<CommunicationCalendar />} />

                                            {/* Transport */}
                                            <Route path="/transport" element={<TransportOverview />} />
                                            <Route path="/transport/overview" element={<TransportOverview />} />
                                            <Route path="/transport/routes" element={<TransportRoutes />} />
                                            <Route path="/transport/vehicles" element={<TransportVehicles />} />
                                            <Route path="/transport/drivers" element={<TransportDrivers />} />
                                            <Route path="/transport/helpers" element={<TransportHelpers />} />
                                            <Route path="/transport/allocation" element={<TransportAllocation />} />
                                            <Route path="/transport/tracking" element={<TransportTracking />} />
                                            <Route path="/transport/operations" element={<TransportOperations />} />
                                            <Route path="/transport/reports" element={<TransportReports />} />
                                            <Route path="/transport/settings" element={<TransportSettingsPage />} />
                                            <Route path="/transport/gps" element={<GPSParentTracking />} />
                                            <Route path="/transport/driver-gps" element={<DriverGPS />} />

                                            {/* Hostel */}
                                            <Route path="/hostel" element={<Rooms />} />
                                            <Route path="/hostel/rooms" element={<Rooms />} />
                                            <Route path="/hostel/allocation" element={<Allocation />} />
                                            <Route path="/hostel/mess" element={<Mess />} />
                                            <Route path="/hostel/attendance" element={<HostelAttendance />} />
                                            <Route path="/hostel/visitors" element={<HostelVisitorLog />} />

                                            {/* Portals */}
                                            <Route path="/portals/student" element={<StudentPortal />} />
                                            <Route path="/portals/parent" element={<ParentPortal />} />

                                            {/* Parent portal — scoped pages */}
                                            <Route path="/parent/dashboard"   element={<ParentDashboard />} />
                                            <Route path="/parent/children"    element={<MyChildren />} />
                                            <Route path="/parent/attendance"  element={<ParentAttendance />} />
                                            <Route path="/parent/timetable"   element={<ParentTimetable />} />
                                            <Route path="/parent/assignments" element={<ParentAssignments />} />
                                            <Route path="/parent/lms"         element={<ParentLMS />} />
                                            <Route path="/parent/gradebook"   element={<ParentGradebook />} />
                                            <Route path="/parent/exams"       element={<ParentExams />} />
                                            <Route path="/parent/results"     element={<ParentExams />} />
                                            <Route path="/parent/assessments" element={<ParentAssessments />} />
                                            <Route path="/parent/report-cards" element={<ParentReportCards />} />
                                            <Route path="/parent/behaviour"   element={<ParentBehavior />} />
                                            <Route path="/parent/achievements" element={<ParentAchievements />} />
                                            <Route path="/parent/fees"        element={<ParentFees />} />
                                            <Route path="/parent/ptm"         element={<ParentPTM />} />
                                            <Route path="/parent/transport"   element={<ParentTransport />} />
                                            <Route path="/parent/health"      element={<ParentHealth />} />
                                            <Route path="/parent/library"     element={<ParentLibrary />} />
                                            <Route path="/parent/documents"   element={<ParentDocuments />} />
                                            <Route path="/parent/notifications" element={<ParentNotifications />} />
                                            <Route path="/parent/study-materials" element={<ParentStudyMaterials />} />
                                            <Route path="/parent/settings"    element={<ParentSettings />} />

                                            {/* Student portal — scoped pages */}
                                            <Route path="/student/profile" element={<StudentProfile />} />
                                            <Route path="/student/attendance" element={<StudentAttendance />} />
                                            <Route path="/student/timetable" element={<StudentTimetable />} />
                                            <Route path="/student/assignments" element={<StudentAssignments />} />
                                            <Route path="/student/study-materials" element={<StudentStudyMaterials />} />
                                            <Route path="/student/gradebook" element={<StudentGradebook />} />
                                            <Route path="/student/exams" element={<StudentExams />} />
                                            <Route path="/student/results" element={<StudentExams />} />
                                            <Route path="/student/assessments" element={<StudentAssessmentsModule />} />
                                            <Route path="/student/report-cards" element={<StudentReportCards />} />
                                            <Route path="/student/certificates" element={<StudentCertificates />} />
                                            <Route path="/student/flashcards" element={<StudentFlashCards />} />
                                            <Route path="/student/achievements" element={<StudentAchievements />} />
                                            <Route path="/student/library" element={<StudentLibrary />} />
                                            <Route path="/student/fees" element={<StudentFees />} />
                                            <Route path="/student/cafeteria" element={<StudentCafeteria />} />
                                            <Route path="/student/health" element={<StudentHealth />} />
                                            <Route path="/student/homework" element={<StudentHomework />} />
                                            <Route path="/student/transport" element={<StudentTransport />} />
                                            <Route path="/student/settings" element={<StudentSettings />} />
                                            <Route path="/student/notifications" element={<StudentNotifications />} />

                                            {/* AI / Analytics */}
                                            <Route path="/ai-center" element={<AICenter />} />
                                            <Route path="/ai-center/smart-reports" element={<SmartReports />} />
                                            <Route path="/ai-center/executive-insights" element={<ExecutiveInsights />} />
                                            <Route path="/reports" element={<ReportsHub />} />
                                            <Route path="/analytics" element={<AnalyticsHome />} />
                                            <Route path="/analytics/academic" element={<AcademicReports />} />
                                            <Route path="/analytics/finance" element={<FinanceReports />} />
                                            <Route path="/analytics/hr" element={<HRReports />} />
                                            <Route path="/analytics/custom" element={<CustomReportBuilder />} />
                                            <Route path="/analytics/predictive" element={<PredictiveAnalytics />} />
                                            <Route path="/analytics/presentation-builder" element={<PresentationBuilder />} />
                                            <Route path="/analytics/product" element={<ProductAnalytics />} />

                                            {/* Coding Assessment */}
                                            <Route path="/coding" element={<CodingEntry />} />
                                            <Route path="/coding/assessments" element={<StudentAssessments />} />
                                            <Route path="/coding/instructor" element={<InstructorTests />} />
                                            <Route path="/coding/questions" element={<QuestionBank />} />
                                            <Route path="/coding/analytics" element={<CodingAnalytics />} />
                                            <Route path="/coding/monitor/:testId" element={<LiveProctor />} />
                                            <Route path="/coding/admin" element={<CodingAdminDashboard />} />
                                            <Route path="/coding/admin/proctoring" element={<CodingProctoringSettings />} />
                                            <Route path="/coding/admin/grading" element={<CodingGradingRules />} />
                                            <Route path="/coding/admin/assignments" element={<CodingAssignments />} />
                                            <Route path="/coding/admin/classes" element={<CodingClasses />} />
                                            <Route path="/coding/admin/audit" element={<CodingAuditLogs />} />
                                            <Route path="/coding/test/:testId" element={<AssessmentIntro />} />
                                            <Route path="/coding/attempt/:attemptId/result" element={<AssessmentResult />} />

                                            {/* Teacher (Class Teacher) portal — section-scoped only */}
                                            <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                                            <Route path="/teacher/my-class" element={<TeacherMyClass />} />
                                            <Route path="/teacher/students" element={<TeacherStudents />} />
                                            <Route path="/teacher/timetable" element={<TeacherTimetable />} />
                                            <Route path="/teacher/homework" element={<TeacherHomework />} />
                                            <Route path="/teacher/assessments" element={<TeacherAssessments />} />
                                            <Route path="/teacher/gradebook" element={<TeacherGradebook />} />
                                            <Route path="/teacher/study-materials" element={<TeacherStudyMaterials />} />
                                            <Route path="/teacher/lms" element={<TeacherLMS />} />
                                            <Route path="/teacher/flashcards" element={<TeacherFlashCards />} />
                                            <Route path="/teacher/exams" element={<TeacherExams />} />
                                            <Route path="/teacher/invigilations" element={<MyInvigilations />} />
                                            <Route path="/teacher/reports" element={<TeacherReports />} />
                                            <Route path="/teacher/analytics" element={<TeacherReports />} />
                                            <Route path="/teacher/attendance" element={<TeacherAttendance />} />
                                            <Route path="/teacher/assignments" element={<TeacherAssignments />} />
                                            <Route path="/teacher/assignments/new" element={<CreateAssignment />} />
                                            <Route path="/teacher/assignments/:assignmentId/edit" element={<CreateAssignment />} />
                                            <Route path="/teacher/assignments/:assignmentId/submissions" element={<SubmissionReviewCenter />} />
                                            <Route path="/teacher/behavior" element={<TeacherBehavior />} />
                                            <Route path="/teacher/ptm" element={<TeacherPTM />} />
                                            <Route path="/teacher/availability" element={<Navigate to="/teacher/ptm?tab=availability" replace />} />
                                            <Route path="/teacher/project-reports" element={<TeacherProjectReports />} />
                                            <Route path="/teacher/leave" element={<TeacherLeave />} />
                                            <Route path="/teacher/notifications" element={<TeacherNotifications />} />
                                            <Route path="/teacher/settings" element={<TeacherSettings />} />

                                            {/* Plagiarism */}
                                            <Route path="/plagiarism" element={<ProjectReports />} />
                                            <Route path="/plagiarism/reports" element={<ProjectReports />} />
                                            <Route path="/plagiarism/review" element={<ProjectReports />} />
                                            <Route path="/plagiarism/report/:id" element={<ReportView />} />

                                            {/* Settings */}
                                            <Route path="/settings" element={<Users />} />
                                            <Route path="/settings/users" element={<Users />} />
                                            <Route path="/settings/permissions" element={<Permissions />} />
                                            <Route path="/settings/academic" element={<AcademicSetup />} />
                                            <Route path="/settings/finance" element={<FinanceSetup />} />
                                            <Route path="/settings/integrations" element={<Integrations />} />
                                            <Route path="/settings/audit" element={<AuditLogs />} />
                                            <Route path="/settings/documents" element={<Documents />} />
                                            <Route path="/academics/rooms" element={<RoomManagement />} />
                                            <Route path="/academics/subject-codes" element={<SubjectCodes />} />
                                            <Route path="/settings/school" element={<Navigate to="/system-settings" replace />} />
                                            <Route path="/settings/notifications" element={<Navigate to="/communication/notifications" replace />} />

                                            {/* Misc */}
                                            <Route path="/system-settings" element={<SystemSettings />} />
                                            <Route path="/reports/khda" element={<KHDAReport />} />
                                            <Route path="/branches" element={<BranchManagement />} />
                                            <Route path="/board" element={<BoardDashboard />} />
                                            <Route path="/cafeteria" element={<Cafeteria />} />
                                          </Route>

                                          {/* Full-screen test runner (no sidebar) */}
                                          <Route path="/coding/test/:testId/take" element={<ProtectedRoute><CodingInterface /></ProtectedRoute>} />

                                          <Route path="/admission" element={<PublicAdmissionForm />} />
                                          {/* Standalone mobile apps — no sidebar, accessible by drivers/helpers/parents without login */}
                                          <Route path="/driver-app" element={<DriverApp />} />
                                          <Route path="/helper-app" element={<HelperApp />} />
                                          <Route path="/track" element={<GPSParentTracking />} />
                                          <Route path="/track/:vehicleId" element={<GPSParentTracking />} />
                                          <Route path="*" element={<NotFound />} />
                                        </Routes>
                                      </Suspense>
                                    </BrowserRouter>
                                  </TooltipProvider>
                                  </HRSettingsProvider>
                                </NoticeProvider>
                              </RecruitmentProvider>
                            </LeaveProvider>
                          </CurriculumProvider>
                        </AdmissionsProvider>
                        </LearningUniverseProvider>
                      </FlashCardProvider>
                    </SubmissionProvider>
                  </AssignmentProvider>
                </StaffProvider>
              </LiveClassProvider>
            </ClassProvider>
          </NotificationsProvider>
          </StudentProvider>
          </BranchProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
