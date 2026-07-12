import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StaticKpiCard } from "@/components/dashboard/StaticKpiCard";
import { AttendanceOverviewCard } from "@/components/dashboard/AttendanceOverviewCard";
import { FeeCollectionOverviewCard } from "@/components/dashboard/FeeCollectionOverviewCard";
import { StudentDistributionDonut } from "@/components/dashboard/StudentDistributionDonut";
import { AdmissionsFunnelCard } from "@/components/dashboard/AdmissionsFunnelCard";
import { TopClassesCard } from "@/components/dashboard/TopClassesCard";
import { TeacherWorkloadCard } from "@/components/dashboard/TeacherWorkloadCard";
import { RecentActivitiesCard } from "@/components/dashboard/RecentActivitiesCard";
import { UpcomingEventsCard } from "@/components/dashboard/UpcomingEventsCard";
import { ApprovalsOverviewCard } from "@/components/dashboard/ApprovalsOverviewCard";
import { PerformanceOverviewCard } from "@/components/dashboard/PerformanceOverviewCard";
import { MyAppraisalWidget } from "@/pages/hr/appraisal/MyAppraisalWidget";
import { QuickAccessGrid } from "@/components/dashboard/QuickAccessGrid";
import { Users, UserCheck, GraduationCap, DollarSign, ClipboardList, Sparkles } from "lucide-react";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { Button } from "@/components/ui/button";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useDashboardOverview, cumulativeCountTrend } from "@/hooks/useDashboardOverview";
import { useAuth } from "@/hooks/useAuth";
import { useGradeCoordinator } from "@/hooks/useGradeCoordinator";
import TeacherDashboard from "@/pages/teacher/TeacherDashboard";
import { getRole } from "@/lib/roles";

const Index = () => {
  const { role } = useAuth();
  // Teacher-tier roles (class/subject teacher) get a scoped dashboard, not the admin view.
  if (getRole(role).layout === "teacher") return <TeacherDashboard />;
  return <AdminIndex />;
};

const AdminIndex = () => {
  const { students, totalStudents: totalStudentsRaw } = useStudents();
  const { staff } = useStaff();
  const stats = useDashboardStats();
  const overview = useDashboardOverview();
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // A Grade Coordinator's dashboard counts only their own grade's students —
  // the shared admin dashboard otherwise reports school-wide totals to
  // everyone who lands on it.
  const totalStudents = isGradeCoordinator
    ? students.filter(s => (s as any).grade === coordAssignedGrade).length
    : totalStudentsRaw;
  const { settings: finSettings } = useFinancialSettings();
  const currencySymbol = finSettings?.currency || "$";

  const { user, role } = useAuth();
  const navigate = useNavigate();

  // Reflect the real backend store rather than a hardcoded "Local Mode".
  const [dbLabel, setDbLabel] = useState<{ live: boolean; text: string }>({ live: false, text: "Connecting…" });
  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.dbMode === "mysql") setDbLabel({ live: true, text: "Cloud MySQL" });
        else setDbLabel({ live: false, text: "Local Mode" });
      })
      .catch(() => { if (active) setDbLabel({ live: false, text: "Local Mode" }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const layout = getRole(role).layout;
    if (layout === 'student') { navigate('/portals/student'); return; }
    if (layout === 'parent') { navigate('/portals/parent'); return; }
  }, [role, navigate]);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-6">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              👋 Good Morning, Admin
            </h2>
            <p className="text-xs text-muted-foreground font-bold tracking-[0.15em] uppercase opacity-70 flex items-center gap-2">
              Bluewood School <span className="h-1 w-1 rounded-full bg-muted-foreground/30" /> {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
              dbLabel.live
                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                : "bg-orange-50 border-orange-100 text-orange-700"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${dbLabel.live ? "bg-emerald-500" : "bg-orange-500"}`} />
              {dbLabel.text}
            </div>
            <Button
              className="h-10 rounded-xl gradient-primary border-none font-bold text-[11px] shadow-lg shadow-primary/20"
              onClick={() => navigate("/ai-center?module=ask")}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI Command
            </Button>
          </div>
        </motion.div>

        {/* My Appraisal — renders nothing unless the logged-in user has a
            real, active scorecard of their own to complete. */}
        <MyAppraisalWidget />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <StaticKpiCard
            title="Total Students"
            value={totalStudents || 0}
            icon={Users}
            trend="12.5%"
            trendType="up"
            description="this month"
            iconClassName="bg-indigo-50 text-purple-600"
            trendSeries={cumulativeCountTrend(students as any, totalStudents || 0)}
            accentColor="#4f46e5"
          />
          <StaticKpiCard
            title="Attendance Today"
            value={`${overview.attendanceBreakdown.presentPct}%`}
            icon={UserCheck}
            trend={overview.attendanceBreakdown.presentPct >= 90 ? "On track" : "Review"}
            trendType={overview.attendanceBreakdown.presentPct >= 90 ? "up" : "neutral"}
            description={overview.attendanceBreakdown.date ? `as of ${overview.attendanceBreakdown.date}` : "no data yet"}
            iconClassName="bg-emerald-50 text-emerald-600"
            trendSeries={overview.attendanceTrend}
            accentColor="#10b981"
          />
          <StaticKpiCard
            title="Total Staff"
            value={staff.length || 0}
            icon={GraduationCap}
            trend="5%"
            trendType="up"
            description="vs last month"
            iconClassName="bg-purple-50 text-purple-600"
            trendSeries={cumulativeCountTrend(staff as any, staff.length || 0)}
            accentColor="#9810fa"
          />
          <StaticKpiCard
            title={`Fee Collection (${currencySymbol})`}
            value={overview.feeOverview.collected}
            icon={DollarSign}
            trend={`${overview.feeOverview.collectedPct}%`}
            trendType="up"
            description="this month"
            iconClassName="bg-blue-50 text-blue-600"
            trendSeries={overview.feeTrend}
            accentColor="#3b82f6"
          />
          <StaticKpiCard
            title="Pending Tasks"
            value={overview.pendingTasksCount}
            icon={ClipboardList}
            trend={overview.pendingTasksCount > 0 ? "Action needed" : "All clear"}
            trendType={overview.pendingTasksCount > 0 ? "down" : "up"}
            description="awaiting review"
            iconClassName="bg-rose-50 text-rose-600"
            accentColor="#f43f5e"
          />
        </div>

        {/* Student Distribution / Attendance / Fees Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <StudentDistributionDonut data={overview.gradeStrength} loading={overview.loading} />
          <AttendanceOverviewCard data={overview.attendanceBreakdown} loading={overview.loading} />
          <FeeCollectionOverviewCard data={overview.feeOverview} currency={currencySymbol} loading={overview.loading} />
        </div>

        {/* Admissions Pipeline / Top Classes / Teacher Workload Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <AdmissionsFunnelCard data={overview.admissionsFunnel} loading={overview.loading} />
          <TopClassesCard data={overview.topClasses} loading={overview.loading} />
          <TeacherWorkloadCard data={overview.teacherWorkload} loading={overview.loading} />
        </div>

        {/* Recent Activities / Upcoming Events / Approvals Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <RecentActivitiesCard data={overview.recentActivities} loading={overview.loading} />
          <UpcomingEventsCard />
          <ApprovalsOverviewCard data={overview.approvalChips} loading={overview.loading} />
        </div>

        {/* Performance Overview / Quick Access Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1"><PerformanceOverviewCard /></div>
          <div className="lg:col-span-2"><QuickAccessGrid /></div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
