import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { motion } from "motion/react";
import { FileText, Sparkles, Download, TrendingUp, Users, DollarSign, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

// Every "report" here used to be entirely fake: a static recentReports list
// with invented filenames/dates/sizes, a "12% increase in digital payments"
// trend that was never computed from anything, dead Generate/Download
// buttons, and a claim that a monthly summary "will be generated
// automatically in 2 days" — there is no scheduler or email job anywhere in
// this codebase backing that claim. "Explore Reports" now links to the
// real report pages that already exist under /analytics; "Generate" builds
// a real CSV from live smartDb data at click-time and appends it to a real
// (session-local) history — nothing here is invented anymore.
const reportCategories = [
  { id: "finance", title: "Finance Summary", icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10", description: "Monthly revenue, expenses, and collection rate.", route: "/analytics/finance" },
  { id: "academic", title: "Academic Performance", icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10", description: "Class-wise performance and student growth trends.", route: "/analytics/academic" },
  { id: "attendance", title: "Attendance Analysis", icon: Users, color: "text-purple-500", bg: "bg-purple-500/10", description: "Detailed attendance reports and absence patterns.", route: "/analytics/academic" },
  { id: "staff", title: "Staff Efficiency", icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", description: "Workload distribution and performance metrics.", route: "/analytics/hr" },
];

interface GeneratedReport { id: string; title: string; date: string; rows: number; }

async function buildReportCsv(categoryId: string): Promise<{ rows: number; csv: string } | null> {
  if (categoryId === "finance") {
    const rows = await smartDb.getAll("StudentRevenue", undefined).catch(() => []) as { student?: string; amount?: number; category?: string; date?: string; status?: string }[];
    if (rows.length === 0) return null;
    const csv = [["Student", "Category", "Amount", "Date", "Status"].join(",")]
      .concat(rows.map(r => [r.student || "", r.category || "", r.amount ?? "", r.date || "", r.status || ""].map(c => `"${c}"`).join(",")))
      .join("\n");
    return { rows: rows.length, csv };
  }
  if (categoryId === "staff") {
    const rows = await smartDb.getAll("Staff", undefined).catch(() => []) as { name?: string; role?: string; department?: string; status?: string }[];
    if (rows.length === 0) return null;
    const csv = [["Name", "Role", "Department", "Status"].join(",")]
      .concat(rows.map(r => [r.name || "", r.role || "", r.department || "", r.status || ""].map(c => `"${c}"`).join(",")))
      .join("\n");
    return { rows: rows.length, csv };
  }
  // finance/academic/attendance detail already has dedicated real report
  // pages (linked via "Explore Reports"); a quick roster export covers the
  // rest without duplicating those pages' full computation here.
  const rows = await smartDb.getAll("Student", undefined).catch(() => []) as { name?: string; grade?: string; section?: string; status?: string }[];
  if (rows.length === 0) return null;
  const csv = [["Name", "Grade", "Section", "Status"].join(",")]
    .concat(rows.map(r => [r.name || "", r.grade || "", r.section || "", r.status || ""].map(c => `"${c}"`).join(",")))
    .join("\n");
  return { rows: rows.length, csv };
}

export default function SmartReports() {
  const navigate = useNavigate();
  const [generated, setGenerated] = useState<GeneratedReport[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  async function handleGenerate(cat: typeof reportCategories[number]) {
    setGenerating(cat.id);
    try {
      const result = await buildReportCsv(cat.id);
      if (!result) {
        toast.error(`No real data available yet for ${cat.title}`);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cat.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setGenerated(prev => [{ id: `${cat.id}-${Date.now()}`, title: cat.title, date: new Date().toLocaleString(), rows: result.rows }, ...prev].slice(0, 10));
      toast.success(`${cat.title} generated — ${result.rows} real rows`);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              Smart Reports
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-black uppercase bg-primary/10 text-primary border-none">Real Data</Badge>
            </h2>
            <p className="text-xs text-muted-foreground font-bold tracking-[0.15em] uppercase opacity-70">Generate real reports from live school data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reportCategories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="border-sidebar-border shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 group h-full">
                <CardHeader className="pb-2">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110 duration-300", cat.bg, cat.color)}>
                    <cat.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm font-bold text-foreground">{cat.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed h-8">
                    {cat.description}
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 h-9 rounded-xl font-bold text-[11px]" onClick={() => navigate(cat.route)}>
                      Explore Report
                    </Button>
                    <Button size="sm" className="h-9 w-9 rounded-xl p-0" disabled={generating === cat.id} onClick={() => handleGenerate(cat)} title="Download real CSV now">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="border-sidebar-border shadow-sm h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold">Generated This Session</CardTitle>
                    <CardDescription>Reports you've actually generated, from real data — nothing pre-populated</CardDescription>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {generated.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No reports generated yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Click the download icon on a category above to generate a real CSV.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {generated.map((report) => (
                      <motion.div
                        key={report.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-4 rounded-xl hover:bg-sidebar-accent transition-all duration-300 group border border-transparent hover:border-sidebar-border"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-sidebar-accent flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="space-y-0.5">
                            <h4 className="text-[13px] font-bold text-foreground">{report.title}</h4>
                            <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                              <span>{report.date}</span>
                              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                              <span>{report.rows} rows · CSV</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 border-none">
                          Downloaded
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-sidebar-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">About These Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">On-Demand Only</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                      Reports here are generated fresh from real data at the moment you click Download — nothing is cached or pre-built.
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10 flex gap-3">
                  <Clock className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-600">No Scheduled Delivery</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                      There's no automatic monthly report or email delivery set up yet — every report is generated manually, on this page.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
