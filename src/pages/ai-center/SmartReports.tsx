import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { motion } from "motion/react";
import { FileText, Sparkles, Download, Search, Filter, ArrowRight, TrendingUp, Users, DollarSign, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const reportCategories = [
  { id: 1, title: "Finance Summary", icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10", description: "Monthly revenue, expenses, and collection rate." },
  { id: 2, title: "Academic Performance", icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10", description: "Class-wise performance and student growth trends." },
  { id: 3, title: "Attendance Analysis", icon: Users, color: "text-purple-500", bg: "bg-purple-500/10", description: "Detailed attendance reports and absence patterns." },
  { id: 4, title: "Staff Efficiency", icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", description: "Workload distribution and performance metrics." }
];

const recentReports = [
  { id: 1, title: "Q1 Financial Forecast", date: "Mar 24, 2026", type: "PDF", size: "2.4 MB", status: "Ready" },
  { id: 2, title: "Student Retention Report", date: "Mar 22, 2026", type: "XLSX", size: "1.1 MB", status: "Ready" },
  { id: 3, title: "Academic Growth Trends", date: "Mar 20, 2026", type: "PDF", size: "3.8 MB", status: "Ready" },
  { id: 4, title: "Staff Payroll Summary", date: "Mar 18, 2026", type: "PDF", size: "1.5 MB", status: "Ready" }
];

export default function SmartReports() {
  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              Smart Reports
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-black uppercase bg-primary/10 text-primary border-none">AI-GENERATED</Badge>
            </h2>
            <p className="text-xs text-muted-foreground font-bold tracking-[0.15em] uppercase opacity-70">Automated reporting and data visualization</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Search reports..." 
                className="pl-10 h-10 rounded-xl border-sidebar-border bg-card/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
              />
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-sidebar-border">
              <Filter className="h-4 w-4" />
            </Button>
            <Button className="h-10 rounded-xl gradient-primary border-none font-bold text-[11px] shadow-lg shadow-primary/20">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate New Report
            </Button>
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
              <Card className="border-sidebar-border shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 group cursor-pointer h-full">
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
                  <Button variant="ghost" size="sm" className="w-full justify-between h-9 rounded-xl font-bold text-[11px] group-hover:bg-primary/5 group-hover:text-primary transition-all">
                    Explore Reports
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
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
                    <CardTitle className="text-lg font-bold">Recent Reports</CardTitle>
                    <CardDescription>Your latest AI-generated documents</CardDescription>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentReports.map((report, i) => (
                    <motion.div
                      key={report.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
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
                            <span>{report.type}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                            <span>{report.size}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 border-none">
                          {report.status}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary transition-all">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-sidebar-border shadow-sm gradient-primary border-none text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <CardHeader>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm mb-2">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg font-bold">AI Report Builder</CardTitle>
                <CardDescription className="text-white/70">Create custom reports using natural language</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                <p className="text-xs text-white/80 font-medium leading-relaxed">
                  "Generate a report showing the correlation between attendance and fee collection for Grade 10."
                </p>
                <Button className="w-full h-10 rounded-xl bg-white text-primary font-bold text-[11px] hover:bg-white/90">
                  Start Building
                </Button>
              </CardContent>
            </Card>

            <Card className="border-sidebar-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Report Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
                  <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Key Trend</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                      Your revenue reports show a 12% increase in digital payments this month.
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10 flex gap-3">
                  <Clock className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-600">Upcoming</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                      Monthly academic summary will be generated automatically in 2 days.
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
