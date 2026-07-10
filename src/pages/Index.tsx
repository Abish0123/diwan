import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AiInsightsBanner } from "@/components/dashboard/AiInsightsBanner";
import { CopilotAlerts } from "@/components/dashboard/CopilotAlerts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AttendanceChart } from "@/components/dashboard/AttendanceChart";
import { EarningsChart } from "@/components/dashboard/EarningsChart";
import { TopStudents } from "@/components/dashboard/TopStudents";
import { TotalStudentsChart } from "@/components/dashboard/TotalStudentsChart";
import { NoticeBoard } from "@/components/dashboard/NoticeBoard";
import { EventsWidget } from "@/components/dashboard/EventsWidget";
import { LibraryWidget } from "@/components/dashboard/LibraryWidget";
import { RecentVisitors } from "@/components/dashboard/RecentVisitors";
import { StaffLeaveStatus } from "@/components/dashboard/StaffLeaveStatus";
import { RecentAdmissions } from "@/components/dashboard/RecentAdmissions";
import { SystemAuditLogs } from "@/components/dashboard/SystemAuditLogs";
import { Search, Plus, Users, GraduationCap, UserCheck, Briefcase, DollarSign, Activity, Sparkles, Banknote } from "lucide-react";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/hooks/useClasses";
import { useStaff } from "@/contexts/StaffContext";
import { useDashboardStats } from "@/hooks/useDashboardStats";
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
  const { classes } = useClasses();
  const { staff } = useStaff();
  const stats = useDashboardStats();
  const { isGradeCoordinator, assignedGrade: coordAssignedGrade } = useGradeCoordinator();
  // A Grade Coordinator's dashboard counts only their own grade's students —
  // the shared admin dashboard otherwise reports school-wide totals to
  // everyone who lands on it. Other widgets on this page (revenue, staff,
  // attendance charts) are school-wide financial/HR data that Grade
  // Coordinators can't reach in the sidebar anyway (their role has no
  // Finance/Staff & HR group), so they're left as-is rather than
  // half-scoped for a role that shouldn't be reasoning about them at all.
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              <Sparkles className="mr-2 h-4 w-4" />
              AI Command
            </Button>
          </div>
        </div>

        {/* AI Insights Banner */}
        <AiInsightsBanner />

        {/* Copilot Alerts — proactive, read-only, Admin/Principal only */}
        <CopilotAlerts />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title="Total Students"
            value={totalStudents || 0}
            icon={Users}
            trend="12%"
            trendType="up"
            description="vs last month"
            iconClassName="bg-indigo-50 text-purple-600"
            index={0}
          />
          <KpiCard
            title="Total Staff"
            value={staff.length || 0}
            icon={GraduationCap}
            trend="5%"
            trendType="up"
            description="vs last month"
            iconClassName="bg-purple-50 text-purple-600"
            index={1}
          />
          <KpiCard
            title={`Total Revenue (${currencySymbol})`}
            value={`${stats.revenueThisMonth || "45,230"}`}
            icon={Banknote}
            trend="8%"
            trendType="up"
            description="vs last month"
            iconClassName="bg-emerald-50 text-emerald-600"
            index={2}
          />
          <KpiCard
            title="Attendance %"
            value={`${stats.avgAttendance ?? 0}%`}
            icon={Activity}
            trend="1.2%"
            trendType="up"
            description="vs last month"
            iconClassName="bg-blue-50 text-purple-600"
            index={3}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <AttendanceChart />
          </div>
          <div>
            <EarningsChart />
          </div>
        </div>

        {/* Performance & Demographics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TopStudents />
          </div>
          <div>
            <TotalStudentsChart />
          </div>
        </div>

        {/* Library Row */}
        <LibraryWidget />

        {/* Activity Row — announcements & scheduling */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <NoticeBoard />
          <EventsWidget />
          <RecentAdmissions />
        </div>

        {/* Activity Row — operations & staff */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <RecentVisitors />
          <StaffLeaveStatus />
          <SystemAuditLogs />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
