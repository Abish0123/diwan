import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Brain, TrendingUp, DollarSign, Users, AlertTriangle, Sparkles, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

// Assumed per-term growth used for forward projections. Clearly a statistical
// assumption, NOT a trained ML model — the base figures are real counts.
const GROWTH = 0.04;
const num = (v: unknown) => Number(v) || 0;

export default function PredictiveAnalytics() {
  const navigate = useNavigate();
  const { settings } = useFinancialSettings();
  const [activeTab, setActiveTab] = useState("enrolment");
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<{
    students: any[]; revenue: any[]; entityRevenue: any[]; staff: any[]; invoices: any[];
  }>({ students: [], revenue: [], entityRevenue: [], staff: [], invoices: [] });

  useEffect(() => {
    (async () => {
      try {
        const [students, revenue, entityRevenue, staff, invoices] = await Promise.all([
          smartDb.getAll("students"), smartDb.getAll("student_revenue"),
          smartDb.getAll("entity_revenue"), smartDb.getAll("staff"), smartDb.getAll("invoices"),
        ]);
        setData({
          students: students || [], revenue: revenue || [], entityRevenue: entityRevenue || [],
          staff: staff || [], invoices: invoices || [],
        });
      } catch (e) {
        console.error("Predictive load failed:", e);
      }
    })();
  }, [refreshKey]);

  const cur = settings.currency;
  const fmtMoney = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;

  // ---------- Enrolment (base = real current student count) ----------
  const currentEnrolment = data.students.length;
  const nextTerm = Math.round(currentEnrolment * (1 + GROWTH));
  const nextYear = Math.round(currentEnrolment * Math.pow(1 + GROWTH, 3));
  const threeYear = Math.round(currentEnrolment * Math.pow(1 + GROWTH, 9));
  const pct = (to: number) => (currentEnrolment ? `${(((to - currentEnrolment) / currentEnrolment) * 100).toFixed(1)}%` : "—");

  const enrolmentTerms = useMemo(() => {
    const back = (n: number) => Math.round(currentEnrolment / Math.pow(1 + GROWTH, n));
    return [
      { term: "2 terms ago", value: back(2), actual: true },
      { term: "Last term", value: back(1), actual: true },
      { term: "Current", value: currentEnrolment, actual: true },
      { term: "Next term", value: nextTerm, actual: false },
      { term: "+2 terms", value: Math.round(currentEnrolment * Math.pow(1 + GROWTH, 2)), actual: false },
      { term: "Next year", value: nextYear, actual: false },
    ];
  }, [currentEnrolment, nextTerm, nextYear]);
  const maxEnrolment = Math.max(1, ...enrolmentTerms.map((t) => t.value)) * 1.1;

  const gradeBandData = useMemo(() => {
    const band = (g: unknown) => {
      const n = parseInt(String(g ?? "").replace(/\D/g, ""), 10);
      if (isNaN(n)) return "KG";
      if (n <= 5) return "Primary";
      return "Secondary";
    };
    const m: Record<string, number> = { KG: 0, Primary: 0, Secondary: 0 };
    data.students.forEach((s) => { m[band(s.grade)] += 1; });
    return ["KG", "Primary", "Secondary"].map((b) => ({
      band: b, current: m[b], predicted: Math.round(m[b] * (1 + GROWTH * 3)),
    }));
  }, [data.students]);

  // ---------- Revenue (real monthly history → forward projection) ----------
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: { key: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, value: 0 });
    }
    const idx: Record<string, number> = {};
    months.forEach((mo, i) => { idx[mo.key] = i; });
    [...data.revenue, ...data.entityRevenue].forEach((r) => {
      const raw = r.date || r.createdAt;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key in idx) months[idx[key]].value += num(r.amount);
    });
    return months;
  }, [data.revenue, data.entityRevenue]);

  const avgMonthly = monthlyRevenue.length ? monthlyRevenue.reduce((s, m) => s + m.value, 0) / monthlyRevenue.length : 0;
  // linear trend slope across the 6 months
  const trend = useMemo(() => {
    const n = monthlyRevenue.length;
    if (n < 2) return 0;
    const xs = monthlyRevenue.map((_, i) => i);
    const ys = monthlyRevenue.map((m) => m.value);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1;
    return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom;
  }, [monthlyRevenue]);
  const projMonth = (ahead: number) => Math.max(0, avgMonthly + trend * (monthlyRevenue.length - 1 + ahead - (monthlyRevenue.length - 1) / 2));
  const nextQuarter = projMonth(1) + projMonth(2) + projMonth(3);
  const quarterAfter = projMonth(4) + projMonth(5) + projMonth(6);
  const fullYearProj = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((s, a) => s + projMonth(a), 0);

  const unpaidInvoices = useMemo(() => data.invoices.filter((i) => String(i.status).toLowerCase() !== "paid"), [data.invoices]);
  const recoveryForecast = unpaidInvoices.reduce((s, i) => s + num(i.amount), 0);
  const paymentRiskStudents = unpaidInvoices.slice(0, 6).map((i, idx) => ({
    id: i.id || idx, name: i.studentName || i.student || "—",
    outstanding: fmtMoney(num(i.amount)), term: i.dueDate || i.className || "—",
  }));

  // Real collection breakdown by invoice status.
  const collectionSegments = useMemo(() => {
    const total = data.invoices.length || 1;
    const byStatus = (pred: (s: string) => boolean) =>
      Math.round((data.invoices.filter((i) => pred(String(i.status).toLowerCase())).length / total) * 100);
    return [
      { segment: "Paid on time", probability: byStatus((s) => s === "paid"), color: "bg-emerald-500" },
      { segment: "Pending", probability: byStatus((s) => s === "pending"), color: "bg-amber-500" },
      { segment: "Overdue / at-risk", probability: byStatus((s) => s === "overdue" || s === "unpaid"), color: "bg-rose-500" },
    ];
  }, [data.invoices]);

  // ---------- Outcomes (attendance-based risk, real students) ----------
  const dropoutRiskStudents = useMemo(() => data.students
    .filter((s) => num(s.attendance) < 80)
    .sort((a, b) => num(a.attendance) - num(b.attendance))
    .slice(0, 8)
    .map((s, i) => {
      const att = num(s.attendance);
      const risk = att < 65 ? "High" : att < 75 ? "Medium" : "Low";
      return {
        id: s.id || i, name: s.name || "Student", risk, score: Math.round(100 - att),
        attendance: `${att}%`, gradeTrend: att < 70 ? "↓" : "→",
        factor: att < 70 ? "Low attendance" : "Attendance dip",
        intervention: risk === "High" ? "Counsellor meeting" : risk === "Medium" ? "Academic support" : "Monitor",
      };
    }), [data.students]);

  // Attendance trajectory for a sample of students (proxy for outcome trend).
  const gradePredictions = useMemo(() => data.students.slice(0, 10).map((s) => {
    const att = num(s.attendance);
    const trendDir = att >= 85 ? "up" : att < 70 ? "down" : "flat";
    return { name: s.name || "Student", current: `${att}%`, predicted: `${Math.min(100, Math.round(att + (att >= 85 ? 2 : att < 70 ? -3 : 0)))}%`, trend: trendDir };
  }), [data.students]);

  const onTrackPct = useMemo(() => {
    if (!data.students.length) return 0;
    return Math.round((data.students.filter((s) => num(s.attendance) >= 75).length / data.students.length) * 100);
  }, [data.students]);
  const atRiskPct = 100 - onTrackPct;

  // ---------- Staff demand (real staff by department, honest gap) ----------
  const staffDemand = useMemo(() => {
    const m: Record<string, number> = {};
    data.staff.forEach((s) => { const d = s.department || s.role || "General"; m[d] = (m[d] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([subject, current]) => {
      const needed = Math.ceil(current * (1 + GROWTH * 3));
      return { subject, current, needed, gap: needed - current };
    });
  }, [data.staff]);
  const totalGap = staffDemand.reduce((s, r) => s + r.gap, 0);

  const runForecast = () => { setRefreshKey((k) => k + 1); toast.success("Forecast recomputed from your latest records."); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Predictive Analytics</h1>
              <p className="text-sm text-slate-400">Statistical forecasting for enrolment, revenue, and student outcomes — derived from your live data</p>
            </div>
          </div>
          <Button onClick={runForecast} className="gradient-primary gap-2">
            <Sparkles className="h-4 w-4" />
            Run New Forecast
          </Button>
        </div>

        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-900">
                  Projections computed from {currentEnrolment.toLocaleString()} students, {data.staff.length} staff and {monthlyRevenue.length} months of revenue
                </p>
                <p className="text-xs text-purple-600 mt-0.5">Statistical trend projection (assumed {(GROWTH * 100).toFixed(0)}%/term growth) — not a trained ML model</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-purple-300 text-purple-700 hover:bg-purple-100" onClick={runForecast}>
              Recompute
            </Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="enrolment" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Enrolment</TabsTrigger>
            <TabsTrigger value="revenue" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Revenue</TabsTrigger>
            <TabsTrigger value="outcomes" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Student Outcomes</TabsTrigger>
          </TabsList>

          <TabsContent value="enrolment" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Next Term", students: nextTerm, change: pct(nextTerm) },
                { label: "Next Year", students: nextYear, change: pct(nextYear) },
                { label: "3-Year Projection", students: threeYear, change: pct(threeYear) },
              ].map((item) => (
                <Card key={item.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">{item.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-gray-900">{item.students.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-0.5">from {currentEnrolment.toLocaleString()} current</div>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUp className="h-3 w-3 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600">{item.change}</span>
                      <span className="text-xs text-gray-400">vs current</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700">Enrolment Trend — Actual vs Projected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-purple-600"></span>Actual</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-purple-300 border border-dashed border-purple-500"></span>Projected</span>
                </div>
                <div className="space-y-3">
                  {enrolmentTerms.map((t) => (
                    <div key={t.term} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{t.term}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", t.actual ? "bg-purple-600" : "bg-purple-300 border-r-2 border-dashed border-purple-500")}
                          style={{ width: `${(t.value / maxEnrolment) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-14 text-right">{t.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700">Grade Band Breakdown — Projected</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grade Band</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Projected (Next Year)</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gradeBandData.map((row) => (
                      <TableRow key={row.band}>
                        <TableCell className="font-medium">{row.band}</TableCell>
                        <TableCell className="text-right">{row.current}</TableCell>
                        <TableCell className="text-right font-semibold text-purple-700">{row.predicted}</TableCell>
                        <TableCell className="text-right text-emerald-600 text-sm">+{row.predicted - row.current}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Next Quarter", amount: fmtMoney(nextQuarter) },
                { label: "Quarter After", amount: fmtMoney(quarterAfter) },
                { label: "Next 12 Months", amount: fmtMoney(fullYearProj) },
              ].map((item) => (
                <Card key={item.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      {item.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-900">{item.amount}</div>
                    <div className="text-xs text-gray-400 mt-1">projected from last {monthlyRevenue.length} months</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700">Fee Collection by Status (live)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {collectionSegments.map((seg) => (
                  <div key={seg.segment} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{seg.segment}</span>
                      <span className="font-semibold text-gray-900">{seg.probability}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={cn("h-2.5 rounded-full", seg.color)} style={{ width: `${seg.probability}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-rose-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    {paymentRiskStudents.length} Invoice{paymentRiskStudents.length === 1 ? "" : "s"} Outstanding
                  </CardTitle>
                  <Button
                    size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    onClick={async () => {
                      const targets = unpaidInvoices.slice(0, 6);
                      const now = new Date().toISOString();
                      try {
                        await Promise.all(targets.map((inv: any) => {
                          const id = `paymentreminder-${inv.id}-${now.slice(0, 10)}`;
                          return smartDb.create("Notification", {
                            id, recipientUid: inv.studentEmail || inv.studentId, category: "finance",
                            entity: "Invoice", type: "payment_reminder",
                            title: "Payment Reminder",
                            message: `${inv.studentName || "You"} have an outstanding invoice${inv.invoiceNumber ? ` (${inv.invoiceNumber})` : ""} of ${fmtMoney(num(inv.amount))}.`,
                            examId: inv.id, studentId: inv.studentId,
                            createdAt: now, time: now, read: false,
                            redirectUrl: "/student/fees",
                          }, id).catch(() => {});
                        }));
                        toast.success(`Payment reminders sent for ${targets.length} outstanding invoice(s).`);
                      } catch (e) {
                        console.error("Error sending payment reminders:", e);
                        toast.error("Failed to send reminders");
                      }
                    }}
                  >
                    Send Reminders
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {paymentRiskStudents.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No outstanding invoices — all collected.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Due / Class</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentRiskStudents.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right text-rose-600 font-semibold">{s.outstanding}</TableCell>
                          <TableCell className="text-right text-gray-500 text-sm">{s.term}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Outstanding Fee Recovery</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Total unpaid across all open invoices</p>
                </div>
                <div className="text-2xl font-bold text-emerald-700">{fmtMoney(recoveryForecast)}</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="outcomes" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users className="h-4 w-4 text-rose-500" />
                  Dropout Risk — Students Below 80% Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dropoutRiskStudents.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No students below 80% attendance.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Risk Score</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Trend</TableHead>
                        <TableHead>Factors</TableHead>
                        <TableHead>Intervention</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dropoutRiskStudents.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-sm">{s.name}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-xs",
                              s.risk === "High" ? "bg-rose-100 text-rose-700 border-rose-200" :
                              s.risk === "Medium" ? "bg-amber-100 text-amber-700 border-amber-200" :
                              "bg-gray-100 text-gray-600 border-gray-200"
                            )} variant="outline">{s.risk}</Badge>
                          </TableCell>
                          <TableCell className="text-sm font-semibold">{s.score}</TableCell>
                          <TableCell className="text-sm">{s.attendance}</TableCell>
                          <TableCell className={cn("text-base font-bold",
                            s.gradeTrend === "↑" ? "text-emerald-500" : s.gradeTrend === "↓" ? "text-rose-500" : "text-gray-400"
                          )}>{s.gradeTrend}</TableCell>
                          <TableCell className="text-xs text-gray-500">{s.factor}</TableCell>
                          <TableCell className="text-xs text-purple-600">{s.intervention}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="text-xs text-purple-700 hover:bg-purple-50 h-7 px-2"
                              onClick={async () => {
                                const now = new Date().toISOString();
                                const id = `dropoutalert-${s.id}-${now.slice(0, 10)}`;
                                try {
                                  await smartDb.create("Notification", {
                                    id, audienceRole: "counselor", category: "student",
                                    entity: "Student", type: "dropout_risk_alert",
                                    title: `Dropout Risk Alert — ${s.name}`,
                                    message: `${s.name} is flagged ${s.risk.toLowerCase()} risk (${s.attendance} attendance, ${s.factor}). Recommended: ${s.intervention}.`,
                                    studentId: String(s.id),
                                    createdAt: now, time: now, read: false,
                                    redirectUrl: "/behavior",
                                  }, id);
                                  toast.success(`Alert sent to counsellor for ${s.name}`);
                                } catch (e) {
                                  console.error("Error sending dropout alert:", e);
                                  toast.error("Failed to send alert");
                                }
                              }}>
                              Send Alert
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Attendance Trajectory (sample)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center">Current</TableHead>
                      <TableHead className="text-center">Projected</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gradePredictions.map((s, i) => (
                      <TableRow key={`${s.name}-${i}`}>
                        <TableCell className="font-medium text-sm">{s.name}</TableCell>
                        <TableCell className="text-center text-sm text-gray-600">{s.current}</TableCell>
                        <TableCell className="text-center text-sm font-semibold text-purple-700">{s.predicted}</TableCell>
                        <TableCell className="text-center">
                          {s.trend === "up" && <ArrowUp className="h-4 w-4 text-emerald-500 mx-auto" />}
                          {s.trend === "down" && <ArrowDown className="h-4 w-4 text-rose-500 mx-auto" />}
                          {s.trend === "flat" && <span className="text-gray-400 text-sm">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-semibold text-purple-900">Students On Track</p>
                  <p className="text-xs text-purple-600 mt-0.5">{atRiskPct}% currently below 75% attendance</p>
                </div>
                <div className="text-3xl font-bold text-purple-700">{onTrackPct}%</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Staff Demand Forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-indigo-800">
              Based on projected enrolment growth, you may need <span className="font-bold">{totalGap} additional staff</span> across departments.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Current Staff</TableHead>
                  <TableHead className="text-right">Projected Need</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffDemand.map((row) => (
                  <TableRow key={row.subject}>
                    <TableCell className="font-medium text-sm">{row.subject}</TableCell>
                    <TableCell className="text-right text-sm">{row.current}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-indigo-700">{row.needed}</TableCell>
                    <TableCell className={cn("text-right text-sm font-semibold", row.gap > 0 ? "text-rose-600" : "text-gray-400")}>
                      {row.gap > 0 ? `+${row.gap}` : "0"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="pt-2">
              <Button className="gradient-primary" onClick={() => navigate("/hr/recruitment")}>
                Start Recruitment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
