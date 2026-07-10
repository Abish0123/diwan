import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, DollarSign, Users, Shield, ChevronLeft, ChevronRight, Download, Calendar, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { canSeeGroup } from "@/lib/roles";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { smartDb } from "@/lib/localDb";
import { exportCsv } from "@/pages/analytics/analyticsUtils";

// Only KPIs with a real, computable data source in this app. Parent
// Satisfaction (no survey model) and KHDA Rating (no inspection-record
// model) were previously fabricated numbers with no backing feature —
// removed rather than faked, matching KHDAReport.tsx's "Not on file"
// convention for the same missing data.
const kpis = [
  {
    label: "Total Enrolment",
    value: "DYNAMIC",
    icon: Users,
    color: "text-purple-600",
    bg: "bg-blue-50",
  },
  {
    label: "Revenue",
    value: "DYNAMIC",
    icon: DollarSign,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    label: "Net Surplus",
    value: "DYNAMIC",
    icon: TrendingUp,
    color: "text-purple-600",
    bg: "bg-violet-50",
  },
  {
    label: "Staff:Student Ratio",
    value: "DYNAMIC",
    icon: Users,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
];

// All KPI values below are now genuinely derived from real collections.

export default function BoardDashboard() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const { totalStudents, students } = useStudents();
  const { staff } = useStaff();
  const { settings } = useFinancialSettings();
  const [year, setYear] = useState("2025–2026");
  const [totalRevenueReal, setTotalRevenueReal] = useState<number | null>(null);
  const [totalExpenseReal, setTotalExpenseReal] = useState<number | null>(null);
  const [revenueByCategory, setRevenueByCategory] = useState<{ label: string; amount: number }[]>([]);

  // Revenue/expense are school-wide financial records, not private to
  // whichever admin is logged in — unscoped, same fix applied elsewhere in
  // useFees.ts/useDashboardStats.ts/StudentContext.tsx this session.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [studentRev, entityRev, expenses, invoices] = await Promise.all([
          smartDb.getAll("StudentRevenue"),
          smartDb.getAll("EntityRevenue"),
          smartDb.getAll("Expense"),
          smartDb.getAll("Invoice"),
        ]);
        const revRows = [...(studentRev || []), ...(entityRev || [])];
        const sum = revRows.reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0);
        const expSum = (expenses || []).reduce((s: number, e: { amount?: number }) => s + (e.amount || 0), 0);
        if (!active) return;
        setTotalRevenueReal(sum);
        setTotalExpenseReal(expSum);

        // Real revenue breakdown by whatever category each invoice/revenue
        // row actually carries — no fabricated "Tuition/Registration/
        // After-School/Other" split with invented amounts.
        const catMap = new Map<string, number>();
        for (const r of revRows as { category?: string; amount?: number }[]) {
          const label = r.category || "Other";
          catMap.set(label, (catMap.get(label) || 0) + (r.amount || 0));
        }
        for (const inv of (invoices || []) as { category?: string; paidAmount?: number }[]) {
          if (!inv.paidAmount) continue;
          const label = inv.category || "Other";
          catMap.set(label, (catMap.get(label) || 0) + inv.paidAmount);
        }
        setRevenueByCategory(
          Array.from(catMap.entries())
            .map(([label, amount]) => ({ label, amount }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6)
        );
      } catch (error) {
        console.error("Error loading board finance data:", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  // Real gender/grade-band breakdown from the actual student roster —
  // replaces a previously hardcoded 53/47% split and fixed KG/Primary/
  // Secondary counts that didn't move with real enrolment.
  const genderCounts = (() => {
    let male = 0, female = 0, unknown = 0;
    for (const s of students || []) {
      const g = String((s as any).gender || "").toLowerCase();
      if (g === "male" || g === "m") male++;
      else if (g === "female" || g === "f") female++;
      else unknown++;
    }
    return { male, female, unknown, total: male + female + unknown };
  })();

  const gradeBands = (() => {
    const bands = [
      { label: "KG", match: (g: string) => /^kg|kindergarten|pre-?k/i.test(g), color: "bg-blue-400" },
      { label: "Primary", match: (g: string) => /grade\s*[1-5]\b/i.test(g), color: "bg-violet-400" },
      { label: "Secondary", match: (g: string) => /grade\s*(6|7|8|9|10|11|12)\b/i.test(g), color: "bg-emerald-400" },
    ];
    const counts = bands.map(b => ({
      label: b.label,
      color: b.color,
      count: (students || []).filter(s => b.match(String((s as any).grade || (s as any).classId || ""))).length,
    }));
    return counts;
  })();

  const currency = settings?.currency || "AED";
  const totalStaff = staff?.length || 0;
  const staffStudentRatio = totalStaff > 0 ? Math.round((totalStudents || 0) / totalStaff) : 0;

  // Mean of students' attendance values (real, derived).
  const attendanceVals = (students || [])
    .map((s) => (s as { attendance?: number }).attendance)
    .filter((a): a is number => typeof a === "number");
  const avgAttendance = attendanceVals.length > 0
    ? Math.round((attendanceVals.reduce((sum, a) => sum + a, 0) / attendanceVals.length) * 10) / 10
    : 0;

  const formatRevenue = (val: number) => {
    if (val >= 1_000_000) return `${currency} ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${currency} ${(val / 1_000).toFixed(1)}K`;
    return `${currency} ${val.toLocaleString()}`;
  };

  const kpiValue = (kpi: typeof kpis[number]): string => {
    switch (kpi.label) {
      case "Total Enrolment":
        return (totalStudents || 0).toLocaleString();
      case "Revenue":
        return totalRevenueReal !== null ? formatRevenue(totalRevenueReal) : "—";
      case "Net Surplus":
        return totalRevenueReal !== null && totalExpenseReal !== null
          ? formatRevenue(totalRevenueReal - totalExpenseReal)
          : "—";
      case "Staff:Student Ratio":
        return staffStudentRatio > 0 ? `1 : ${staffStudentRatio}` : "—";
      default:
        return kpi.value;
    }
  };

  const years = ["2023–2024", "2024–2025", "2025–2026"];
  const yearIndex = years.indexOf(year);

  if (!canSeeGroup(role, "Intelligence")) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
          <p className="text-sm text-slate-500 max-w-sm">
            This dashboard is confidential and restricted to Board Members and Administrators only.
          </p>
          <Button className="rounded-xl gradient-primary" onClick={() => navigate("/")}>
            Return to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const prevYear = () => {
    if (yearIndex > 0) setYear(years[yearIndex - 1]);
  };
  const nextYear = () => {
    if (yearIndex < years.length - 1) setYear(years[yearIndex + 1]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">Board Dashboard</h1>
                <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 tracking-wide uppercase">
                  Confidential — Board Members Only
                </span>
              </div>
              <p className="text-sm text-slate-400">Strategic governance overview for the 2025–2026 academic year</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                exportCsv("board-dashboard", [
                  { metric: "Total Enrolment", value: totalStudents || 0 },
                  { metric: "Total Staff", value: totalStaff },
                  { metric: "Revenue", value: totalRevenueReal !== null ? Math.round(totalRevenueReal) : "" },
                  { metric: "Net Surplus", value: totalRevenueReal !== null && totalExpenseReal !== null ? Math.round(totalRevenueReal - totalExpenseReal) : "" },
                  { metric: "Staff:Student Ratio", value: staffStudentRatio > 0 ? `1 : ${staffStudentRatio}` : "" },
                  { metric: "Avg Attendance %", value: avgAttendance },
                  ...gradeBands.map(g => ({ metric: `Enrolment - ${g.label}`, value: g.count })),
                  { metric: "Gender - Male", value: genderCounts.male },
                  { metric: "Gender - Female", value: genderCounts.female },
                  ...revenueByCategory.map(r => ({ metric: `Revenue - ${r.label}`, value: Math.round(r.amount) })),
                ]);
                toast.success("Board report downloaded.");
              }}
            >
              <Download className="h-4 w-4" />
              Export Report
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => {
                // No board-meeting scheduling feature exists in this app —
                // opens a real email compose window instead of faking a
                // "scheduling link sent" confirmation for something that
                // never actually happened.
                window.location.href = "mailto:?subject=" + encodeURIComponent("Board Meeting — Scheduling") +
                  "&body=" + encodeURIComponent("Proposing a board meeting for the following date/time:\n\n");
              }}
            >
              <Calendar className="h-4 w-4" />
              Schedule Board Meeting
            </Button>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Academic Year:</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
            <button
              onClick={prevYear}
              disabled={yearIndex === 0}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-800 min-w-[90px] text-center">{year}</span>
            <button
              onClick={nextYear}
              disabled={yearIndex === years.length - 1}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 ml-2">
            <span>
              Total Staff: <strong className="text-slate-800">{totalStaff.toLocaleString()}</strong>
            </span>
            <span>
              Avg Attendance: <strong className="text-slate-800">{avgAttendance}%</strong>
            </span>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className={cn("inline-flex rounded-lg p-2", kpi.bg)}>
                    <Icon className={cn("h-4 w-4", kpi.color)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</p>
                    </div>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{kpiValue(kpi)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Enrolment Breakdown */}
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                Enrolment Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium">By Grade Band</p>
                {genderCounts.total === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No students on file yet.</p>
                ) : gradeBands.map((g) => (
                  <div key={g.label} className="flex items-center gap-3">
                    <span className="w-16 text-xs font-semibold text-slate-600">{g.label}</span>
                    <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", g.color)}
                        style={{ width: `${genderCounts.total > 0 ? Math.round((g.count / genderCounts.total) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-slate-600">{g.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 font-medium mb-3">Gender Split</p>
                {genderCounts.male + genderCounts.female === 0 ? (
                  <p className="text-xs text-slate-400">No gender data on file yet.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex h-4 rounded-full overflow-hidden">
                        <div className="bg-blue-400" style={{ width: `${Math.round((genderCounts.male / genderCounts.total) * 100)}%` }} />
                        <div className="bg-rose-400" style={{ width: `${Math.round((genderCounts.female / genderCounts.total) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[11px] text-purple-600 font-medium">Male {Math.round((genderCounts.male / genderCounts.total) * 100)}%</span>
                        <span className="text-[11px] text-rose-500 font-medium">Female {Math.round((genderCounts.female / genderCounts.total) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revenue Breakdown */}
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                Revenue Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {revenueByCategory.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No revenue records on file yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-center">
                    <div className="relative w-36 h-36">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        {(() => {
                          let offset = 0;
                          const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#94a3b8"];
                          const catTotal = revenueByCategory.reduce((s, i) => s + i.amount, 0) || 1;
                          return revenueByCategory.map((item, i) => {
                            const pct = (item.amount / catTotal) * 100;
                            const dash = `${pct} ${100 - pct}`;
                            const el = (
                              <circle
                                key={item.label}
                                cx="18"
                                cy="18"
                                r="15.9"
                                fill="none"
                                stroke={colors[i % colors.length]}
                                strokeWidth="3.2"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                              />
                            );
                            offset += pct;
                            return el;
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-[11px] text-slate-500 font-medium">Total</p>
                        <p className="text-sm font-bold text-slate-800">
                          {totalRevenueReal !== null ? formatRevenue(totalRevenueReal) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {revenueByCategory.map((item, i) => {
                      const colors = ["bg-blue-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-pink-500", "bg-slate-400"];
                      const catTotal = revenueByCategory.reduce((s, x) => s + x.amount, 0) || 1;
                      const pct = Math.round((item.amount / catTotal) * 100);
                      return (
                        <div key={item.label} className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-sm shrink-0", colors[i % colors.length])} />
                          <span className="flex-1 text-sm text-slate-700 truncate">{item.label}</span>
                          <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                          <span className="text-sm font-semibold text-slate-800 w-24 text-right">{formatRevenue(item.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Risk & Compliance — no risk-register feature exists yet in this
            app; showing an honest empty state instead of fabricated rows. */}
        <Card className="border border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Risk & Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400 py-4 text-center">No risk register on file. Compliance tracking isn't set up for this school yet.</p>
          </CardContent>
        </Card>

        {/* Strategic Initiatives — no project/initiative tracker exists yet. */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            Strategic Initiatives
          </h2>
          <Card className="border border-slate-100 shadow-sm">
            <CardContent className="p-6">
              <p className="text-xs text-slate-400 text-center">No strategic initiatives on file yet.</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Board Items — no board-agenda feature exists yet. */}
        <Card className="border border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Next Board Meeting — Agenda Items</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400 py-4 text-center">No agenda items on file. Nothing has been scheduled for the next board meeting yet.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
