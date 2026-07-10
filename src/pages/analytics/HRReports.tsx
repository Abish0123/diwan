import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  Clock, 
  TrendingUp, 
  Download, 
  Filter, 
  Search,
  Brain,
  Sparkles,
  Award,
  Calendar,
  Briefcase,
  Heart,
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
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
  Cell,
  LineChart,
  Line
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "motion/react";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { num, sumBy, money, exportCsv } from "./analyticsUtils";

const DEPT_COLORS = ["#9810fa", "#A29BFE", "#00CEC9", "#FAB1A0", "#fbbf24", "#34d399", "#60a5fa"];

export default function HRReports() {
  const navigate = useNavigate();
  const { settings } = useFinancialSettings();

  const [staff, setStaff] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [jobOpenings, setJobOpenings] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [sf, lv, jo, pay] = await Promise.all([
          smartDb.getAll("staff"),
          smartDb.getAll("leave_requests"),
          smartDb.getAll("job_openings"),
          smartDb.getAll("payroll"),
        ]);
        setStaff(sf || []);
        setLeaveRequests(lv || []);
        setJobOpenings(jo || []);
        setPayroll(pay || []);
      } catch (e) {
        console.error("Error loading HR data:", e);
      }
    })();
  }, []);

  // Staff grouped by department -> donut.
  const staffDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of staff) {
      const d = String(s.department || "Other").trim() || "Other";
      map.set(d, (map.get(d) || 0) + 1);
    }
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
    return rows.length ? rows : [{ name: "No staff", value: 1, color: "#DFE6E9" }];
  }, [staff]);

  // Headcount per department -> bar chart (replaces hardcoded weekly attendance).
  const attendanceData = useMemo(
    () => staffDistribution.map((d) => ({ day: d.name, present: d.value, absent: 0 })),
    [staffDistribution],
  );

  // Top staff by salary -> "performance index" style list / chart source.
  const topStaff = useMemo(
    () =>
      [...staff]
        .sort((a, b) => num(b.salary) - num(a.salary))
        .slice(0, 4)
        .map((s) => ({
          name: String(s.name || `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Staff"),
          role: String(s.role || s.department || "Staff"),
          salary: num(s.salary),
          dept: String(s.department || "—"),
          icon: String(s.name || "ST").split(" ").map((n: string) => n[0] || "").join("").slice(0, 2).toUpperCase(),
        })),
    [staff],
  );

  // Salary distribution across departments -> line chart source.
  const performanceData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of staff) {
      const d = String(s.department || "Other").trim() || "Other";
      map.set(d, (map.get(d) || 0) + num(s.salary));
    }
    const rows = Array.from(map.entries()).map(([month, total]) => ({
      month,
      rating: Math.round(total),
    }));
    return rows.length ? rows : [{ month: "—", rating: 0 }];
  }, [staff]);

  // Staff Inflow vs Outflow — real hires-per-month computed from each
  // staff record's actual join date. Outflow needs a real "left the school"
  // signal (an exit date or a non-Active status) to be anything but zero —
  // right now every staff record in this school's data is status "Active"
  // with no exit-tracking feature anywhere in the app, so outflow is
  // genuinely 0 rather than fabricated. If exit tracking is added later,
  // this picks it up automatically via the status check below.
  const inflowOutflow = useMemo(() => {
    const MONTHS = 6;
    const now = new Date();
    const buckets: { month: string; key: string; inflow: number; outflow: number }[] = [];
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ month: d.toLocaleDateString("en", { month: "short" }), key: `${d.getFullYear()}-${d.getMonth()}`, inflow: 0, outflow: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    for (const s of staff) {
      const joined = new Date(String(s.joinDate || s.joiningDate || ""));
      if (!Number.isNaN(joined.getTime())) {
        const key = `${joined.getFullYear()}-${joined.getMonth()}`;
        const idx = index.get(key);
        if (idx !== undefined) buckets[idx].inflow += 1;
      }
      const statusLower = String(s.status || "").toLowerCase();
      const isExited = ["inactive", "resigned", "terminated", "left"].includes(statusLower);
      if (isExited) {
        const left = new Date(String((s as any).exitDate || (s as any).leftDate || s.updatedAt || ""));
        const key = !Number.isNaN(left.getTime()) ? `${left.getFullYear()}-${left.getMonth()}` : null;
        const idx = key ? index.get(key) : undefined;
        if (idx !== undefined) buckets[idx].outflow += 1;
      }
    }
    return buckets;
  }, [staff]);
  const totalInflow = inflowOutflow.reduce((s, b) => s + b.inflow, 0);
  const totalOutflow = inflowOutflow.reduce((s, b) => s + b.outflow, 0);
  const hasAnyExitedStaff = staff.some((s: any) => ["inactive", "resigned", "terminated", "left"].includes(String(s.status || "").toLowerCase()));

  // KPIs.
  const totalStaff = staff.length;
  const pendingLeave = useMemo(
    () => leaveRequests.filter((l: any) => String(l.status).toLowerCase() === "pending").length,
    [leaveRequests],
  );
  const openPositions = useMemo(
    () => jobOpenings.filter((j: any) => String(j.status).toLowerCase() === "open").length,
    [jobOpenings],
  );
  const totalPayroll = useMemo(() => sumBy(payroll, (p: any) => p.amount), [payroll]);

  const kpiCards = [
    { title: "Total Staff", value: totalStaff.toLocaleString(), trend: "Headcount", isUp: true, icon: Users, color: "indigo" },
    { title: "Pending Leave", value: pendingLeave.toLocaleString(), trend: pendingLeave > 0 ? "To review" : "Clear", isUp: pendingLeave === 0, icon: Clock, color: "amber" },
    { title: "Open Positions", value: openPositions.toLocaleString(), trend: openPositions > 0 ? "Hiring" : "Filled", isUp: openPositions === 0, icon: Briefcase, color: "rose" },
    { title: "Total Payroll", value: money(totalPayroll, settings.currency), trend: "Monthly", isUp: true, icon: Award, color: "emerald" },
  ];

  const handleExport = () => {
    exportCsv("hr-report", [
      { metric: "Total Staff", value: totalStaff },
      { metric: "Pending Leave", value: pendingLeave },
      { metric: "Open Positions", value: openPositions },
      { metric: "Total Payroll", value: Math.round(totalPayroll) },
      ...staffDistribution.map((d) => ({ metric: `Dept - ${d.name}`, value: d.value })),
      ...topStaff.map((s) => ({ metric: `Top Staff - ${s.name}`, value: Math.round(s.salary) })),
    ]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">HR & Staff Analytics</h1>
              <p className="text-sm text-slate-400">Monitor staff performance, attendance, and resource allocation.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200 font-bold gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Staff Directory
            </Button>
            <Button
              className="rounded-xl bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold gap-2 shadow-lg shadow-[#9810fa]/20"
              onClick={() => navigate("/hr/staff")}
            >
              <Users className="h-4 w-4" />
              Manage Staff
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpiCards.map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
                <div className={`absolute top-0 left-0 w-1 h-full bg-${kpi.color}-500`} />
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2 bg-${kpi.color}-50 rounded-xl`}>
                      <kpi.icon className={`h-5 w-5 text-${kpi.color}-600`} />
                    </div>
                    <Badge className={cn(
                      "rounded-full border-none font-bold",
                      kpi.isUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {kpi.trend}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.title}</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1">{kpi.value}</h3>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* AI HR Insights */}
        <Card className="border-none shadow-xl shadow-indigo-100/50 bg-gradient-to-br from-[#9810fa] to-[#a29bfe] rounded-[32px] overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-white">AI HR Assistant</h2>
                    <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase tracking-widest">Smart Analysis</Badge>
                  </div>
                  <p className="text-white/80 font-medium">Predictive staff workload and burnout analysis.</p>
                </div>
              </div>
              <Button
                className="bg-white text-[#9810fa] hover:bg-white/90 font-bold rounded-xl px-8 h-12 gap-2 shadow-lg"
                onClick={() => navigate("/hr/leave")}
              >
                <Sparkles className="h-4 w-4" />
                Review Pending Leave
              </Button>
            </div>

            {/* Real, computed insights — replaces 3 fabricated cards (a fake
                "Science department" workload claim, a fake named staff
                member's fake engagement improvement, a fake training-need
                headcount). Only shows a card when there's real data behind it. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              {(() => {
                const items: { title: string; desc: string; icon: typeof AlertCircle }[] = [];
                const topDept = staffDistribution[0];
                if (topDept && topDept.name !== "No staff") {
                  items.push({ title: "Largest Department", desc: `${topDept.name} has the most staff (${topDept.value} ${topDept.value === 1 ? "person" : "people"}).`, icon: Briefcase });
                }
                if (pendingLeave > 0) {
                  items.push({ title: "Leave Requests Pending", desc: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} awaiting review.`, icon: AlertCircle });
                }
                if (openPositions > 0) {
                  items.push({ title: "Open Positions", desc: `${openPositions} position${openPositions === 1 ? "" : "s"} currently open for hiring.`, icon: Award });
                }
                if (items.length === 0) {
                  items.push({ title: "All Clear", desc: "No pending leave requests or open positions right now.", icon: Award });
                }
                return items;
              })().map((insight, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <insight.icon className="h-4 w-4 text-white" />
                    <h4 className="font-bold text-white text-sm">{insight.title}</h4>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">{insight.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Staff Attendance */}
          <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
            <CardHeader className="p-8 pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Headcount by Department</CardTitle>
                  <CardDescription>Staff distribution across departments</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-[#9810fa] font-bold" onClick={() => navigate("/hr/attendance")}>View History</Button>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{fill: '#f1f5f9'}}
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="present" name="Staff" fill="#9810fa" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Staff Performance Trend */}
          <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
            <CardHeader className="p-8 pb-0">
              <CardTitle className="text-xl font-black text-slate-900">Payroll by Department</CardTitle>
              <CardDescription>Total salary cost per department</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}}
                      domain={[0, 5]}
                    />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Line type="monotone" dataKey="rating" stroke="#9810fa" strokeWidth={4} dot={{r: 6, fill: '#9810fa', strokeWidth: 3, stroke: '#fff'}} activeDot={{r: 8}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Staff Inflow vs Outflow — real hires-per-month from each staff
            record's actual join date. Outflow is genuinely 0 right now: no
            staff exit/termination tracking exists anywhere in this app, and
            every real staff record on file is status "Active" — this isn't
            hidden or faked, the empty state below says so plainly. */}
        <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-900">Staff Inflow vs Outflow</CardTitle>
                <CardDescription>Hires and exits over the last 6 months</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-[#9810fa] font-bold" onClick={() => navigate("/hr/onboarding")}>
                View Onboarding
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {!hasAnyExitedStaff && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                No staff exit records on file — outflow shows as 0 because this app doesn't track terminations/resignations yet, not because the data was hidden.
              </p>
            )}
            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-600">Inflow ({totalInflow} total)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="text-xs font-bold text-slate-600">Outflow ({totalOutflow} total)</span>
              </div>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inflowOutflow}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="inflow" name="Hired" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="outflow" name="Exited" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Staff Distribution & Top Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-1 border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
            <CardHeader className="p-8 pb-0">
              <CardTitle className="text-xl font-black text-slate-900">Staff Breakdown</CardTitle>
              <CardDescription>Distribution by department</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={staffDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {staffDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                {staffDistribution.map((dept, i) => {
                  // dept.value is a real headcount, not a percentage — this
                  // used to slap a "%" suffix straight onto the raw count.
                  const pct = totalStaff > 0 ? Math.round((dept.value / totalStaff) * 100) : 0;
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{backgroundColor: dept.color}} />
                        <span className="text-xs font-bold text-slate-600">{dept.name}</span>
                      </div>
                      <span className="text-xs font-black text-slate-900">{dept.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
            <CardHeader className="p-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Highest-Paid Staff</CardTitle>
                  <CardDescription>Top 4 by recorded salary — no performance/engagement scoring exists yet, so this ranks by real payroll data instead of a fabricated rating.</CardDescription>
                </div>
                <Button variant="ghost" className="text-[#9810fa] font-bold" onClick={() => navigate("/hr/staff")}>View All Staff</Button>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {topStaff.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No staff records with salary data on file yet.</p>
              ) : (
                <div className="space-y-6">
                  {topStaff.map((staff, i) => (
                    <div key={i} className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 rounded-2xl border-2 border-slate-50 group-hover:border-[#9810fa]/20 transition-all">
                          <AvatarFallback className="bg-slate-100 text-slate-600 font-black">{staff.icon}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-bold text-slate-900">{staff.name}</h4>
                          <p className="text-xs text-slate-500">{staff.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</p>
                          <span className="text-sm font-black text-slate-900">{staff.dept}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salary</p>
                          <span className="text-sm font-black text-slate-900">{money(staff.salary, settings.currency)}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-[#9810fa]/5 hover:text-[#9810fa]" onClick={() => navigate("/hr/staff")}>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
