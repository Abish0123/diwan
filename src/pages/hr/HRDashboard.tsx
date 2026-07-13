import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Users, 
  UserCheck, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Briefcase,
  Clock,
  AlertCircle,
  Settings,
  LayoutDashboard
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

const COLORS = ["#9810fa", "#d12386", "#F59E0B", "#10B981", "#3B82F6"];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface LeaveRequest {
  id: string;
  name?: string;
  employeeName?: string;
  staffName?: string;
  type?: string;
  leaveType?: string;
  duration?: string;
  days?: number;
  status?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  Approved: "admin.hr.dashboard.statusApproved",
  Pending: "admin.hr.dashboard.statusPending",
};

function formatDate(d?: string): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const HRDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [staff, setStaff] = useState<Record<string, unknown>[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // School-wide HR dashboard — every staff/leave/payroll record, not just
      // ones this admin's own account happens to have created. Staff rows are
      // stamped with whichever account provisioned them (often a different
      // admin, an onboarding flow, or a seed script), so scoping this fetch to
      // `user.uid` filtered server-side to almost nothing.
      const [s, l, p] = await Promise.all([
        smartDb.getAll("Staff", undefined),
        smartDb.getAll("LeaveRequest", undefined),
        smartDb.getAll("Payroll", undefined),
      ]);
      setStaff(s as Record<string, unknown>[]);
      setLeaveRequests(l as LeaveRequest[]);
      setPayroll(p as Record<string, unknown>[]);
    })();
  }, [user]);

  const totalStaff = staff.length;
  const onLeaveCount = staff.filter((s) => (s.status as string) !== "Active").length;
  const presentToday = totalStaff - onLeaveCount;
  const pendingLeave = leaveRequests.filter((l) => (l.status || "").toLowerCase() === "pending").length;
  const payrollTotal = payroll.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const attendancePct = totalStaff ? Math.round((presentToday / totalStaff) * 100) : 0;

  // Department breakdown derived from staff
  const deptMap: Record<string, number> = {};
  staff.forEach((s) => {
    const d = (s.department as string) || "Unassigned";
    deptMap[d] = (deptMap[d] || 0) + 1;
  });
  const departmentData = Object.entries(deptMap).map(([name, value]) => ({ name, value }));

  // Payroll trend grouped by month from payroll records (fallback to current total)
  const monthMap: Record<string, { payroll: number; staff: number }> = {};
  payroll.forEach((p) => {
    const raw = (p.month as string) || (p.date as string) || (p.createdAt as string) || "";
    const dt = new Date(raw);
    const label = isNaN(dt.getTime()) ? (typeof raw === "string" ? raw.slice(0, 3) : "") : monthNames[dt.getMonth()];
    const key = label || "Current";
    if (!monthMap[key]) monthMap[key] = { payroll: 0, staff: totalStaff };
    monthMap[key].payroll += Number(p.amount) || 0;
  });
  const data = Object.entries(monthMap).map(([name, v]) => ({ name, payroll: v.payroll, staff: v.staff }));
  const chartData = data.length ? data : [{ name: "Current", payroll: payrollTotal, staff: totalStaff }];

  const recentLeave = [...leaveRequests]
    .sort((a, b) => new Date(b.createdAt || b.startDate || 0).getTime() - new Date(a.createdAt || a.startDate || 0).getTime())
    .slice(0, 3);

  // Real, derived HR alerts — no hardcoded counts. Each is computed straight
  // off the same staff/leave data the stat cards above use.
  const now = Date.now();
  const DAY = 86400000;
  const newHires = staff.filter((s) => {
    const joined = new Date((s.joiningDate as string) || (s.joinDate as string) || "");
    return !isNaN(joined.getTime()) && now - joined.getTime() <= 14 * DAY && now - joined.getTime() >= 0;
  });
  const pendingConfirmation = staff.filter((s) => {
    const joined = new Date((s.joiningDate as string) || (s.joinDate as string) || "");
    return !isNaN(joined.getTime()) && !s.confirmationDate && now - joined.getTime() > 90 * DAY;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.hr.dashboard.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.hr.dashboard.pageSubtitle')}</p>
            </div>
          </div>
          <Button onClick={() => navigate("/hr/settings")} variant="outline" className="gap-2 shrink-0">
            <Settings className="h-4 w-4" /> {t('admin.hr.dashboard.hrSettingsButton')}
          </Button>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { label: t('admin.hr.dashboard.statTotalStaff'), value: String(totalStaff), icon: Users, color: "blue", sub: t('admin.hr.dashboard.statTotalStaffSub', { count: totalStaff }) },
            { label: t('admin.hr.dashboard.statPresentToday'), value: String(presentToday), icon: UserCheck, color: "green", sub: t('admin.hr.dashboard.statPresentTodaySub', { pct: attendancePct }) },
            { label: t('admin.hr.dashboard.statOnLeave'), value: String(onLeaveCount), icon: Calendar, color: "orange", sub: t('admin.hr.dashboard.statOnLeaveSub', { count: pendingLeave }) },
            { label: t('admin.hr.dashboard.statMonthlyPayroll'), value: `$${payrollTotal.toLocaleString()}`, icon: DollarSign, color: "purple", sub: t('admin.hr.dashboard.statProcessed') },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.02, y: -5 }}
              className="premium-card p-6 flex items-center gap-5"
            >
              <div className={`h-12 w-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center`}>
                <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <Card className="premium-card border-none shadow-xl overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
              <CardTitle className="text-lg font-bold">{t('admin.hr.dashboard.payrollTrendsTitle')}</CardTitle>
              <CardDescription>{t('admin.hr.dashboard.payrollTrendsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    />
                    <Bar dataKey="payroll" fill="#9810fa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-card border-none shadow-xl overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
              <CardTitle className="text-lg font-bold">{t('admin.hr.dashboard.staffDistributionTitle')}</CardTitle>
              <CardDescription>{t('admin.hr.dashboard.byDepartment')}</CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex items-center justify-center">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {departmentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 ms-4">
                {departmentData.map((dept, i) => (
                  <div key={dept.name} className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-medium">{dept.name} ({dept.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <Card className="premium-card border-none shadow-xl lg:col-span-2 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-br from-primary/5 to-transparent">
              <div>
                <CardTitle className="text-lg font-bold">{t('admin.hr.dashboard.recentLeaveRequestsTitle')}</CardTitle>
                <CardDescription>{t('admin.hr.dashboard.awaitingApproval')}</CardDescription>
              </div>
              <Briefcase className="h-5 w-5 text-muted-foreground/50" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {recentLeave.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t('admin.hr.dashboard.noLeaveRequestsFound')}</p>
                ) : (
                  recentLeave.map((leave, i) => {
                    const name = leave.name || leave.employeeName || leave.staffName || t('admin.hr.dashboard.unknownName');
                    const type = leave.type || leave.leaveType || t('admin.hr.dashboard.leaveTypeDefault');
                    const duration = leave.duration || (leave.days ? (leave.days === 1 ? t('admin.hr.dashboard.oneDay') : t('admin.hr.dashboard.multipleDays', { count: leave.days })) : "—");
                    const status = leave.status || "Pending";
                    const statusLabel = STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status;
                    const date = leave.date || [formatDate(leave.startDate), formatDate(leave.endDate)].filter(Boolean).join(" – ") || "—";
                    return (
                  <motion.div
                    key={leave.id || i}
                    whileHover={{ x: 5 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{name}</p>
                        <p className="text-[10px] text-muted-foreground">{type} • {duration}</p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] font-medium mb-1">{date}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        status === "Approved" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                      }`}>
                        {statusLabel}
                      </span>
                    </div>
                  </motion.div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="premium-card border-none shadow-xl overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
              <CardTitle className="text-lg font-bold">{t('admin.hr.dashboard.hrAlertsTitle')}</CardTitle>
              <CardDescription>{t('admin.hr.dashboard.importantNotifications')}</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="flex gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100 transition-all"
                >
                  <AlertCircle className="h-5 w-5 text-orange-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-orange-900">{t('admin.hr.dashboard.confirmationDue')}</p>
                    <p className="text-[10px] text-orange-700">
                      {pendingConfirmation.length === 0
                        ? t('admin.hr.dashboard.noStaffPendingConfirmation')
                        : t('admin.hr.dashboard.staffPastConfirmationDeadline', { count: pendingConfirmation.length })}
                    </p>
                  </div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="flex gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 transition-all"
                >
                  <Clock className="h-5 w-5 text-purple-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-900">{t('admin.hr.dashboard.leaveApprovals')}</p>
                    <p className="text-[10px] text-blue-700">
                      {pendingLeave === 0
                        ? t('admin.hr.dashboard.noLeaveAwaitingApproval')
                        : pendingLeave === 1
                        ? t('admin.hr.dashboard.oneLeaveAwaitingApproval')
                        : t('admin.hr.dashboard.multipleLeaveAwaitingApproval', { count: pendingLeave })}
                    </p>
                  </div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="flex gap-3 p-3 rounded-xl bg-green-50 border border-green-100 transition-all"
                >
                  <TrendingUp className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-green-900">{t('admin.hr.dashboard.newHires')}</p>
                    <p className="text-[10px] text-green-700">
                      {newHires.length === 0
                        ? t('admin.hr.dashboard.noNewHiresRecently')
                        : t('admin.hr.dashboard.welcomeNewHires', { count: newHires.length })}
                    </p>
                  </div>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default HRDashboard;
