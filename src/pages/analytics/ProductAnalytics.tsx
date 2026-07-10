import { useEffect, useState } from "react";
import { Activity, Users, TrendingUp, MousePointerClick, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import {
  computeDailyActiveUsers, computeRetentionSummary, computeFeatureUsage,
  computeTopPages, computeAdmissionsFunnel, computeFeeFunnel,
  AnalyticsEventRow, RetentionPoint, FeatureUsagePoint, PageViewPoint,
  FunnelStage, FeeFunnelStage,
} from "@/lib/analyticsEngine";

export default function ProductAnalytics() {
  const [loading, setLoading] = useState(true);
  const [dau, setDau] = useState<RetentionPoint[]>([]);
  const [summary, setSummary] = useState({ dau: 0, wau: 0, mau: 0, stickiness: 0 });
  const [featureUsage, setFeatureUsage] = useState<FeatureUsagePoint[]>([]);
  const [topPages, setTopPages] = useState<PageViewPoint[]>([]);
  const [admissionsFunnel, setAdmissionsFunnel] = useState<FunnelStage[]>([]);
  const [feeFunnel, setFeeFunnel] = useState<FeeFunnelStage[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [events, leads, invoices] = await Promise.all([
          smartDb.getAll("AnalyticsEvent") as Promise<AnalyticsEventRow[]>,
          smartDb.getAll("leads") as Promise<{ status: string }[]>,
          smartDb.getAll("invoices") as Promise<{ status?: string; amount?: number }[]>,
        ]);
        const rows = events || [];
        setTotalEvents(rows.length);
        setDau(computeDailyActiveUsers(rows).slice(-30));
        setSummary(computeRetentionSummary(rows, new Date().toISOString().slice(0, 10)));
        setFeatureUsage(computeFeatureUsage(rows));
        setTopPages(computeTopPages(rows));
        setAdmissionsFunnel(computeAdmissionsFunnel(leads || []));
        setFeeFunnel(computeFeeFunnel(invoices || []));
      } catch (e) {
        console.error("Error loading product analytics:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const kpis = [
    { title: "Daily Active Users", value: summary.dau, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { title: "Weekly Active Users", value: summary.wau, icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { title: "Monthly Active Users", value: summary.mau, icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { title: "Stickiness (WAU/MAU)", value: `${summary.stickiness}%`, icon: MousePointerClick, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  ];

  const hasEnoughData = totalEvents >= 10;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real usage instrumentation — logins, page views, and feature actions, tracked since this dashboard was enabled.
          </p>
        </div>

        {!hasEnoughData && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
            <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-300">
              Only {totalEvents} usage event{totalEvents === 1 ? "" : "s"} recorded so far — instrumentation was just added, so
              retention/funnel numbers below will fill in as staff use the app over the next few days. This is real, not
              placeholder data; it's simply early.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-semibold mt-1 tabular-nums">{kpi.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Active Users (last 30 days)</CardTitle>
            <CardDescription>Distinct users who logged in each day.</CardDescription>
          </CardHeader>
          <CardContent>
            {dau.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No login events yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dau}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Area type="monotone" dataKey="activeUsers" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Feature Actions</CardTitle>
              <CardDescription>Real feature_action events, ranked by frequency.</CardDescription>
            </CardHeader>
            <CardContent>
              {featureUsage.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No feature_action events recorded yet — wire trackEvent() calls into specific actions (invoice created, exam
                  published, etc.) to populate this.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={featureUsage} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="feature" fontSize={11} width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most Visited Pages</CardTitle>
              <CardDescription>Real page_view events, ranked by visit count.</CardDescription>
            </CardHeader>
            <CardContent>
              {topPages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No page views recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topPages} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="path" fontSize={10} width={140} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--chart-2, 200 80% 50%))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admissions Funnel</CardTitle>
            <CardDescription>
              Real lead pipeline (Enquiry → Enrolled), computed from actual lead status — cumulative: each stage includes leads
              that have progressed further.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {admissionsFunnel.every((s) => s.count === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No admissions leads recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={admissionsFunnel} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="stage" angle={-35} textAnchor="end" fontSize={11} interval={0} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip formatter={(value: number, name: string, props) => [
                    `${value} leads (${props.payload.conversionFromStart}%)`, "Reached this stage",
                  ]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {admissionsFunnel.map((_, i) => (
                      <Cell key={i} fill={`hsl(${220 - i * 12} 70% ${55 - i * 2}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fee Collection Funnel</CardTitle>
            <CardDescription>Real invoice status breakdown — Invoiced, Paid, Pending, Overdue.</CardDescription>
          </CardHeader>
          <CardContent>
            {feeFunnel.every((s) => s.count === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No invoices recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={feeFunnel}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="stage" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip formatter={(value: number, name: string, props) => [
                    `${value} invoices (AED ${props.payload.amount.toLocaleString()})`, "Count",
                  ]} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
