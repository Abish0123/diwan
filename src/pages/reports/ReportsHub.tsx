import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import {
  BarChart3, DollarSign, GraduationCap, Users2, Bus, FileCheck, Sparkles, Brain,
  BookOpen, UtensilsCrossed, ShieldAlert, Download, ArrowRight,
} from "lucide-react";

// No central Reports hub existed anywhere in the app — reporting was
// scattered across a dozen unlinked routes, and three modules with real
// data (Library, Cafeteria, Security) had no reporting surface at all.
// This links out to every existing real report page, and adds a real,
// data-backed summary card for the three modules that had none.

const EXISTING_REPORTS = [
  { title: "Finance Reports", desc: "Revenue, expenses, budget utilization", icon: DollarSign, route: "/analytics/finance", color: "text-green-600 bg-green-50" },
  { title: "Academic Reports", desc: "Subject performance, attendance trends", icon: GraduationCap, route: "/analytics/academic", color: "text-blue-600 bg-blue-50" },
  { title: "HR Reports", desc: "Staff, payroll, leave", icon: Users2, route: "/analytics/hr", color: "text-purple-600 bg-purple-50" },
  { title: "Transport Reports", desc: "Trips, attendance, fleet", icon: Bus, route: "/transport/reports", color: "text-amber-600 bg-amber-50" },
  { title: "KHDA / Ministry Report", desc: "Student & staff census", icon: FileCheck, route: "/reports/khda", color: "text-rose-600 bg-rose-50" },
  { title: "Smart Reports", desc: "On-demand CSV exports", icon: Sparkles, route: "/ai-center/smart-reports", color: "text-violet-600 bg-violet-50" },
  { title: "Executive Insights", desc: "Real revenue trend & budget utilization", icon: Brain, route: "/ai-center/executive-insights", color: "text-indigo-600 bg-indigo-50" },
];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

export default function ReportsHub() {
  const navigate = useNavigate();
  const [libStats, setLibStats] = useState<{ total: number; borrowed: number; unpaidFines: number } | null>(null);
  const [cafStats, setCafStats] = useState<{ orders: number; revenue: number; wallets: number } | null>(null);
  const [secStats, setSecStats] = useState<{ open: number; critical: number; visitorsToday: number } | null>(null);

  useEffect(() => {
    smartDb.getAll("LibraryItem", undefined).then((items) => {
      smartDb.getAll("LibraryFine", undefined).then((fines) => {
        const borrowed = (items as { status?: string }[]).filter(b => b.status === "Borrowed" || b.status === "Issued").length;
        const unpaid = (fines as { status?: string }[]).filter(f => f.status === "unpaid").length;
        setLibStats({ total: (items as unknown[]).length, borrowed, unpaidFines: unpaid });
      }).catch(() => {});
    }).catch(() => {});

    smartDb.getAll("CafeteriaOrder", undefined).then((orders) => {
      smartDb.getAll("CafeteriaWallet", undefined).then((wallets) => {
        const revenue = (orders as { total?: number }[]).reduce((s, o) => s + (o.total || 0), 0);
        setCafStats({ orders: (orders as unknown[]).length, revenue, wallets: (wallets as unknown[]).length });
      }).catch(() => {});
    }).catch(() => {});

    smartDb.getAll("SecurityIncident", undefined).then((incidents) => {
      smartDb.getAll("Visitor", undefined).then((visitors) => {
        const today = new Date().toISOString().slice(0, 10);
        const open = (incidents as { status?: string }[]).filter(i => i.status !== "Resolved").length;
        const critical = (incidents as { severity?: string }[]).filter(i => i.severity === "Critical").length;
        const visitorsToday = (visitors as { date?: string; createdAt?: string }[]).filter(v => (v.date || v.createdAt || "").slice(0, 10) === today).length;
        setSecStats({ open, critical, visitorsToday });
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-purple-600" /> Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Every real reporting surface in the school, in one place</p>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Module Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXISTING_REPORTS.map(r => (
              <Card key={r.route} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(r.route)}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${r.color}`}>
                    <r.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{r.title}</p>
                    <p className="text-xs text-slate-500 truncate">{r.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Newly Connected — Real Data, No Report View Before</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-600" /> Library</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!libStats}
                  onClick={() => libStats && (downloadCsv(`library_summary_${new Date().toISOString().slice(0,10)}.csv`,
                    [["Metric", "Value"], ["Total Catalogued Books", libStats.total], ["Currently Borrowed", libStats.borrowed], ["Unpaid Fines", libStats.unpaidFines]]),
                    toast.success("Library summary downloaded"))}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent>
                {!libStats ? <p className="text-xs text-slate-400">Loading…</p> : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Total Books</span><span className="font-bold">{libStats.total}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Currently Borrowed</span><span className="font-bold">{libStats.borrowed}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Unpaid Fines</span><span className={`font-bold ${libStats.unpaidFines > 0 ? "text-rose-600" : ""}`}>{libStats.unpaidFines}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-amber-600" /> Cafeteria</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!cafStats}
                  onClick={() => cafStats && (downloadCsv(`cafeteria_summary_${new Date().toISOString().slice(0,10)}.csv`,
                    [["Metric", "Value"], ["Total Orders", cafStats.orders], ["Total Revenue", cafStats.revenue], ["Active Wallets", cafStats.wallets]]),
                    toast.success("Cafeteria summary downloaded"))}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent>
                {!cafStats ? <p className="text-xs text-slate-400">Loading…</p> : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Total Orders</span><span className="font-bold">{cafStats.orders}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total Revenue</span><span className="font-bold">{cafStats.revenue.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Active Wallets</span><span className="font-bold">{cafStats.wallets}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-rose-600" /> Security</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!secStats}
                  onClick={() => secStats && (downloadCsv(`security_summary_${new Date().toISOString().slice(0,10)}.csv`,
                    [["Metric", "Value"], ["Open Incidents", secStats.open], ["Critical Incidents", secStats.critical], ["Visitors Today", secStats.visitorsToday]]),
                    toast.success("Security summary downloaded"))}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent>
                {!secStats ? <p className="text-xs text-slate-400">Loading…</p> : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Open Incidents</span><span className="font-bold">{secStats.open}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Critical</span><span className={`font-bold ${secStats.critical > 0 ? "text-rose-600" : ""}`}>{secStats.critical}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Visitors Today</span><span className="font-bold">{secStats.visitorsToday}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
