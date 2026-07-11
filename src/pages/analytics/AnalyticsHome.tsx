import { useState, useEffect } from "react";
import {
  Presentation, BarChart3, Users, DollarSign, GraduationCap,
  TrendingUp, TrendingDown, AlertCircle, ArrowRight,
  Sparkles, Brain, Target, FileText, PieChart,
  Calendar, ChevronRight, Loader2, BookOpen, UtensilsCrossed, ShieldAlert, Code2, ScanSearch,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area
} from "recharts";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { analyzeStudentPerformance, PerformanceData, AttendanceData, StudentInsight } from "@/services/geminiService";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import {
  num, sumBy, avgBy, studentGrade, monthlySeries, money, exportCsv,
} from "./analyticsUtils";

export default function AnalyticsHome() {
  const navigate = useNavigate();
  const { settings } = useFinancialSettings();
  const [insights, setInsights] = useState<StudentInsight[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [studentRevenue, setStudentRevenue] = useState<any[]>([]);
  const [entityRevenue, setEntityRevenue] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [examMarks, setExamMarks] = useState<any[]>([]);
  const [attendanceLog, setAttendanceLog] = useState<any[]>([]);

  // Campus-operations data — previously the Intelligence/Analytics layer
  // referenced only Students/Staff/Finance/Attendance. Library, Cafeteria,
  // Security, Coding and Plagiarism all have real data and real reports
  // elsewhere (/reports), but none of it ever showed up here.
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [libraryFines, setLibraryFines] = useState<any[]>([]);
  const [cafeteriaOrders, setCafeteriaOrders] = useState<any[]>([]);
  const [securityIncidents, setSecurityIncidents] = useState<any[]>([]);
  const [codingAttempts, setCodingAttempts] = useState<any[]>([]);
  const [plagiarismReports, setPlagiarismReports] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [st, sf, sRev, eRev, inv, marks, att, libItems, libFines, cafOrders, secIncidents, coding, plag] = await Promise.all([
          smartDb.getAll("students"),
          smartDb.getAll("staff"),
          smartDb.getAll("student_revenue"),
          smartDb.getAll("entity_revenue"),
          smartDb.getAll("invoices"),
          smartDb.getAll("ExamMark"),
          smartDb.getAll("attendance"),
          smartDb.getAll("LibraryItem"),
          smartDb.getAll("LibraryFine"),
          smartDb.getAll("CafeteriaOrder"),
          smartDb.getAll("SecurityIncident"),
          smartDb.getAll("coding_attempts"),
          smartDb.getAll("project_reports"),
        ]);
        setStudents(st || []);
        setStaff(sf || []);
        setStudentRevenue(sRev || []);
        setEntityRevenue(eRev || []);
        setInvoices(inv || []);
        setExamMarks(marks || []);
        setAttendanceLog(att || []);
        setLibraryItems(libItems || []);
        setLibraryFines(libFines || []);
        setCafeteriaOrders(cafOrders || []);
        setSecurityIncidents(secIncidents || []);
        setCodingAttempts(coding || []);
        setPlagiarismReports(plag || []);
      } catch (e) {
        console.error("Error loading analytics data:", e);
      }
    })();
  }, []);

  // ---- Derived KPIs & chart series (real data) ----
  const totalStudents = students.length;
  const totalStaff = staff.length;
  const totalRevenue =
    sumBy(studentRevenue, (r: any) => r.amount) + sumBy(entityRevenue, (r: any) => r.amount);
  const avgAttendance = avgBy(students, (s: any) => s.attendance);
  const pendingFees = invoices
    .filter((i: any) => ["Pending", "Unpaid", "Overdue"].includes(i.status))
    .reduce((sum: number, i: any) => sum + num(i.amount), 0);

  const allRevenueRows = [...studentRevenue, ...entityRevenue];
  const revenueTrend = monthlySeries(
    allRevenueRows,
    (r: any) => r.date,
    (r: any) => r.amount,
    6,
  );

  // Enrollment grouped by grade -> chart-friendly series.
  const enrollmentByGrade = (() => {
    const map = new Map<string, number>();
    for (const s of students) {
      const g = studentGrade(s);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  })();

  // Real month-over-month revenue change from the same series the KPI sums.
  const revenueMoM = (() => {
    if (revenueTrend.length < 2) return "—";
    const prev = revenueTrend[revenueTrend.length - 2].value;
    const curr = revenueTrend[revenueTrend.length - 1].value;
    if (prev <= 0) return curr > 0 ? "New" : "—";
    const pct = ((curr - prev) / prev) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  })();

  const kpiData = [
    { title: "Total Students", value: totalStudents.toLocaleString(), trend: `${totalStudents}`, icon: Users, color: "text-purple-600", bg: "bg-blue-50" },
    { title: "Total Revenue", value: money(totalRevenue, settings.currency), trend: revenueMoM, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Fee Pending", value: money(pendingFees, settings.currency), trend: pendingFees > 0 ? "Due" : "Clear", icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
    { title: "Avg Attendance", value: `${avgAttendance.toFixed(1)}%`, trend: avgAttendance >= 85 ? "Healthy" : "Watch", icon: GraduationCap, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Staff Strength", value: totalStaff.toLocaleString(), trend: "Stable", icon: Users, color: "text-purple-600", bg: "bg-indigo-50" },
  ];

  const unpaidFines = libraryFines.filter((f: any) => f.status === "unpaid").length;
  const cafeteriaRevenue = sumBy(cafeteriaOrders, (o: any) => o.total);
  const openIncidents = securityIncidents.filter((i: any) => i.status !== "Resolved").length;
  const criticalIncidents = securityIncidents.filter((i: any) => i.severity === "Critical").length;

  const campusKpiData = [
    { title: "Library — Unpaid Fines", value: unpaidFines.toLocaleString(), trend: unpaidFines > 0 ? "Follow up" : "Clear", icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Cafeteria Revenue", value: money(cafeteriaRevenue, settings.currency), trend: `${cafeteriaOrders.length} orders`, icon: UtensilsCrossed, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Security — Open Incidents", value: openIncidents.toLocaleString(), trend: criticalIncidents > 0 ? `${criticalIncidents} critical` : "None critical", icon: ShieldAlert, color: "text-rose-600", bg: "bg-rose-50" },
    { title: "Coding — Attempts", value: codingAttempts.length.toLocaleString(), trend: "Real submissions", icon: Code2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Plagiarism — Reports", value: plagiarismReports.length.toLocaleString(), trend: "Real submissions", icon: ScanSearch, color: "text-purple-600", bg: "bg-indigo-50" },
  ];

  const handleExport = () => {
    exportCsv("analytics-overview", [
      { metric: "Total Students", value: totalStudents },
      { metric: "Total Staff", value: totalStaff },
      { metric: "Total Revenue", value: Math.round(totalRevenue) },
      { metric: "Avg Attendance %", value: avgAttendance.toFixed(1) },
      { metric: "Fee Pending", value: Math.round(pendingFees) },
      ...enrollmentByGrade.map((g) => ({ metric: `Enrollment - ${g.name}`, value: g.value })),
      ...revenueTrend.map((m) => ({ metric: `Revenue - ${m.name}`, value: Math.round(m.value) })),
    ]);
  };

  useEffect(() => {
    // Only runs once both fetches have actually landed — an empty perfData/
    // attendData on the very first render (before data loads) would look
    // identical to "no real data exists", so wait for the initial load
    // instead of firing on mount with nothing.
    if (students.length === 0 && examMarks.length === 0 && attendanceLog.length === 0) return;

    const fetchInsights = async () => {
      setIsLoadingInsights(true);
      try {
        // Real per-subject average, computed directly from ExamMark rows
        // (id: examId, [subject]: { [studentId]: number }) — replaces a
        // hardcoded Mathematics/Science/English 72/84/78 stub.
        const subjectTotals = new Map<string, { sum: number; count: number }>();
        for (const row of examMarks) {
          for (const [key, val] of Object.entries(row)) {
            if (["id", "uid", "createdAt", "updatedAt"].includes(key)) continue;
            if (!val || typeof val !== "object") continue;
            const entry = subjectTotals.get(key) || { sum: 0, count: 0 };
            for (const mark of Object.values(val as Record<string, unknown>)) {
              const n = Number(mark);
              if (Number.isFinite(n)) { entry.sum += n; entry.count += 1; }
            }
            subjectTotals.set(key, entry);
          }
        }
        const perfData: PerformanceData[] = Array.from(subjectTotals.entries())
          .map(([name, { sum, count }]) => ({ name, score: count > 0 ? Math.round(sum / count) : 0 }))
          .filter(p => p.score > 0)
          .slice(0, 6);

        // Real monthly attendance rate from the actual attendance log
        // (entityType/status per day) — replaces a hardcoded Jan/Feb/Mar
        // 94/92/88 stub.
        const monthBuckets = new Map<string, { present: number; total: number }>();
        for (const rec of attendanceLog) {
          if (rec.entityType !== "student" || !rec.date) continue;
          const d = new Date(rec.date);
          if (Number.isNaN(d.getTime())) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const b = monthBuckets.get(key) || { present: 0, total: 0 };
          b.total += 1;
          if (rec.status === "Present" || rec.status === "present") b.present += 1;
          monthBuckets.set(key, b);
        }
        const attendData: AttendanceData[] = Array.from(monthBuckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-3)
          .map(([key, { present, total }]) => ({
            month: new Date(`${key}-01`).toLocaleDateString("en", { month: "short" }),
            rate: total > 0 ? Math.round((present / total) * 100) : 0,
          }));

        const data = await analyzeStudentPerformance(perfData, attendData, totalStudents);
        setInsights(data);
      } catch (error) {
        console.error("Error fetching AI insights:", error);
      } finally {
        setIsLoadingInsights(false);
      }
    };
    fetchInsights();
  }, [students, examMarks, attendanceLog, totalStudents, refreshTrigger]);

  const categories = [
    {
      title: "Academic Reports",
      description: "Performance, attendance & risk analysis",
      icon: GraduationCap,
      path: "/analytics/academic",
      color: "bg-blue-500",
      stat: `${avgAttendance.toFixed(1)}%`,
      trend: `${totalStudents} students`,
      chartData: enrollmentByGrade.length
        ? enrollmentByGrade.map((g) => ({ name: g.name, value: g.value }))
        : [{ name: "—", value: 0 }],
    },
    {
      title: "Finance Reports",
      description: "Revenue, expenses & fee collection",
      icon: DollarSign,
      path: "/analytics/finance",
      color: "bg-emerald-500",
      stat: money(totalRevenue, settings.currency),
      trend: revenueMoM,
      chartData: revenueTrend.length
        ? revenueTrend.map((m) => ({ name: m.name, value: Math.round(m.value) }))
        : [{ name: "—", value: 0 }],
    },
    {
      title: "HR Reports",
      description: "Staff attendance, payroll & attrition",
      icon: Users,
      path: "/analytics/hr",
      color: "bg-indigo-500",
      stat: totalStaff.toLocaleString(),
      trend: "Stable",
      chartData: (() => {
        const map = new Map<string, number>();
        for (const s of staff) {
          const d = String((s as any).department || "Other");
          map.set(d, (map.get(d) || 0) + 1);
        }
        const series = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
        return series.length ? series : [{ name: "—", value: 0 }];
      })(),
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
              <p className="text-sm text-slate-400">Data-driven insights for institution-wide excellence.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => navigate("/analytics/presentation-builder")}>
              <Presentation className="mr-2 h-4 w-4 text-[#9810fa]" />
              AI Presentation Builder
            </Button>
            <Button variant="outline" className="rounded-xl border-slate-200" onClick={handleExport}>
              <Calendar className="mr-2 h-4 w-4" />
              Export This Term
            </Button>
            <Button
              className="gradient-primary text-white rounded-xl shadow-lg shadow-purple-200"
              disabled={isLoadingInsights}
              onClick={() => setRefreshTrigger(t => t + 1)}
            >
              {isLoadingInsights ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Regenerate Insights
            </Button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpiData.map((kpi, index) => (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className={cn("p-2 rounded-lg", kpi.bg)}>
                      <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                    </div>
                    <Badge variant="secondary" className={cn(
                      "text-[10px] font-bold",
                      kpi.trend.startsWith('+') ? "text-emerald-600 bg-emerald-50" : 
                      kpi.trend.startsWith('-') ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                    )}>
                      {kpi.trend}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.title}</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</h3>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Campus Operations — Library/Cafeteria/Security/Coding/Plagiarism,
            previously entirely absent from this analytics layer despite
            having real data and real dedicated reports at /reports. */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Campus Operations</p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {campusKpiData.map((kpi, index) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className={cn("p-2 rounded-lg", kpi.bg)}>
                        <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-bold text-slate-600 bg-slate-50">
                        {kpi.trend}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.title}</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</h3>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* AI Insights Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-none shadow-sm gradient-primary text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Brain className="h-48 w-48" />
            </div>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl">AI Intelligence Hub</CardTitle>
              </div>
              <CardDescription className="text-white/80">
                Predictive insights and critical alerts generated by AI analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              {isLoadingInsights ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
                  <p className="text-sm text-white/70 font-medium">Analyzing institution data...</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {insights.map((insight, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 transition-colors group cursor-pointer"
                      onClick={() => navigate(insight.path)}
                    >
                      <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        insight.type === 'warning' ? "bg-amber-400/20 text-amber-200" :
                        insight.type === 'danger' ? "bg-rose-400/20 text-rose-200" : "bg-emerald-400/20 text-emerald-200"
                      )}>
                        {insight.type === 'danger' ? <AlertCircle className="h-5 w-5" /> : 
                         insight.type === 'warning' ? <AlertCircle className="h-5 w-5" /> : 
                         <Target className="h-5 w-5" />}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">{insight.type.toUpperCase()}: Analysis Result</h4>
                        <p className="text-sm text-white/80 mt-1">{insight.text}</p>
                        <p className="text-xs text-white/60 mt-1 line-clamp-1 italic">{insight.reasoning}</p>
                      </div>
                      <Button size="sm" className="bg-white text-[#9810fa] hover:bg-white/90 font-bold rounded-xl gap-1 shadow-sm">
                        {insight.action}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#9810fa]" />
                Performance Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={categories[0].chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d12386" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#9810fa" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#9810fa" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Categories Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map((cat, index) => (
            <motion.div
              key={cat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + (index * 0.1) }}
            >
              <Card 
                className="overflow-hidden border-none shadow-sm hover:shadow-xl transition-all cursor-pointer group h-full"
                onClick={() => navigate(cat.path)}
              >
                <div className={cn("h-1.5 w-full", cat.color)} />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={cn("p-2 rounded-xl text-white", cat.color)}>
                      <cat.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-slate-200">
                      {cat.trend}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold mt-4 line-clamp-1">{cat.title}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">{cat.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[60px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cat.chartData}>
                        <Bar 
                          dataKey="value" 
                          fill={index === 0 ? "#3b82f6" : index === 1 ? "#10b981" : "#6366f1"} 
                          radius={[4, 4, 0, 0]} 
                          opacity={0.6}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 flex items-center text-[11px] font-bold text-[#9810fa]">
                    EXPLORE MODULE
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Power Features / Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card
            className="border-dashed border-2 border-slate-200 bg-transparent hover:bg-white hover:border-[#9810fa]/30 transition-all group cursor-pointer"
            onClick={() => navigate("/ai-center?module=reports")}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-[#9810fa]/10 transition-colors">
                <FileText className="h-6 w-6 text-slate-400 group-hover:text-[#9810fa]" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">AI Reports</h4>
                <p className="text-xs text-slate-500">Generate and export summary reports</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="border-dashed border-2 border-slate-200 bg-transparent hover:bg-white hover:border-[#9810fa]/30 transition-all group cursor-pointer"
            onClick={() => navigate("/analytics/presentation-builder")}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-[#9810fa]/10 transition-colors">
                <Presentation className="h-6 w-6 text-slate-400 group-hover:text-[#9810fa]" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">AI Presentations</h4>
                <p className="text-xs text-slate-500">Generate analytic PowerPoint slide decks</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="border-dashed border-2 border-slate-200 bg-transparent hover:bg-white hover:border-[#9810fa]/30 transition-all group cursor-pointer"
            onClick={() => navigate("/board")}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-[#9810fa]/10 transition-colors">
                <TrendingUp className="h-6 w-6 text-slate-400 group-hover:text-[#9810fa]" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Executive View</h4>
                <p className="text-xs text-slate-500">Open the high-level board KPI dashboard</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-dashed border-2 border-slate-200 bg-transparent hover:bg-white hover:border-[#9810fa]/30 transition-all group cursor-pointer" onClick={() => navigate("/analytics/custom")}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-[#9810fa]/10 transition-colors">
                <Sparkles className="h-6 w-6 text-slate-400 group-hover:text-[#9810fa]" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Natural Language</h4>
                <p className="text-xs text-slate-500">Ask AI for specific data</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
