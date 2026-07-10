import { useState } from "react";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Share2, 
  FileText, 
  LayoutGrid, 
  List, 
  Trash2, 
  Copy, 
  Edit3, 
  ArrowRight,
  Brain,
  Sparkles,
  Database,
  PieChart,
  BarChart3,
  TrendingUp,
  Settings,
  MoreVertical,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { motion, AnimatePresence } from "motion/react";

const reportTemplates: {
  id: number; title: string; category: string; lastRun: string;
  icon: typeof TrendingUp; color: string; source: SourceKey;
}[] = [
  { id: 1, title: "Student Performance Summary", category: "Academic", lastRun: "2h ago", icon: TrendingUp, color: "indigo", source: "students" },
  { id: 2, title: "Monthly Fee Collection", category: "Finance", lastRun: "1d ago", icon: FileText, color: "emerald", source: "student_revenue" },
  { id: 3, title: "Staff Attendance Overview", category: "HR", lastRun: "3h ago", icon: Database, color: "rose", source: "staff" },
  { id: 4, title: "Outstanding Invoices", category: "Finance", lastRun: "5d ago", icon: PieChart, color: "amber", source: "invoices" },
  { id: 5, title: "Operating Expenses", category: "Finance", lastRun: "1w ago", icon: BarChart3, color: "indigo", source: "expenses" },
  { id: 6, title: "Active Students Roster", category: "Custom", lastRun: "2d ago", icon: Settings, color: "slate", source: "students" },
];

type SourceKey = "students" | "student_revenue" | "expenses" | "staff" | "invoices";

interface SourceConfig {
  key: SourceKey;
  label: string;
  collection: string;
  columns: { field: string; header: string }[];
}

const dataSources: SourceConfig[] = [
  {
    key: "students",
    label: "Students",
    collection: "students",
    columns: [
      { field: "studentId", header: "Student ID" },
      { field: "name", header: "Name" },
      { field: "classId", header: "Class" },
      { field: "status", header: "Status" },
      { field: "attendance", header: "Attendance %" },
    ],
  },
  {
    key: "student_revenue",
    label: "Revenue",
    collection: "student_revenue",
    columns: [
      { field: "id", header: "Ref" },
      { field: "date", header: "Date" },
      { field: "studentName", header: "Student" },
      { field: "category", header: "Category" },
      { field: "amount", header: "Amount" },
      { field: "status", header: "Status" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    collection: "expenses",
    columns: [
      { field: "id", header: "Ref" },
      { field: "date", header: "Date" },
      { field: "category", header: "Category" },
      { field: "entity", header: "Vendor" },
      { field: "amount", header: "Amount" },
      { field: "status", header: "Status" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    collection: "staff",
    columns: [
      { field: "staffId", header: "Staff ID" },
      { field: "name", header: "Name" },
      { field: "department", header: "Department" },
      { field: "role", header: "Role" },
      { field: "status", header: "Status" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    collection: "invoices",
    columns: [
      { field: "invoiceNumber", header: "Invoice #" },
      { field: "studentName", header: "Student" },
      { field: "className", header: "Class" },
      { field: "amount", header: "Amount" },
      { field: "dueDate", header: "Due Date" },
      { field: "status", header: "Status" },
    ],
  },
];

// Map a natural-language query to a data source + row filter.
function interpretQuery(raw: string): { source: SourceKey; filter?: (r: any) => boolean; note: string } | null {
  const q = raw.toLowerCase();
  if (!q.trim()) return null;

  if (q.includes("low attendance") || (q.includes("attendance") && q.includes("student"))) {
    return {
      source: "students",
      filter: (r) => Number(r.attendance) < 75,
      note: "Students with attendance below 75%",
    };
  }
  if (q.includes("unpaid") || (q.includes("invoice") && (q.includes("overdue") || q.includes("pending")))) {
    return {
      source: "invoices",
      filter: (r) => String(r.status).toLowerCase() !== "paid",
      note: "Invoices that are not yet Paid",
    };
  }
  if (q.includes("inactive") && q.includes("student")) {
    return {
      source: "students",
      filter: (r) => String(r.status).toLowerCase() !== "active",
      note: "Students who are not Active",
    };
  }
  if (q.includes("pending") && q.includes("expense")) {
    return {
      source: "expenses",
      filter: (r) => String(r.status).toLowerCase() !== "paid",
      note: "Expenses that are not yet Paid",
    };
  }
  // Fall back: match a bare source keyword.
  if (q.includes("revenue") || q.includes("fee")) return { source: "student_revenue", note: "All revenue records" };
  if (q.includes("expense")) return { source: "expenses", note: "All expense records" };
  if (q.includes("staff") || q.includes("teacher")) return { source: "staff", note: "All staff records" };
  if (q.includes("invoice")) return { source: "invoices", note: "All invoices" };
  if (q.includes("student")) return { source: "students", note: "All students" };
  return null;
}

export default function CustomReportBuilder() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const { settings } = useFinancialSettings();

  const [selectedSource, setSelectedSource] = useState<SourceKey>("students");
  const [nlQuery, setNlQuery] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<{ field: string; header: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultLabel, setResultLabel] = useState("");
  const [hasRun, setHasRun] = useState(false);

  const runReport = async (
    sourceKey: SourceKey,
    filter?: (r: any) => boolean,
    label?: string
  ) => {
    const config = dataSources.find((s) => s.key === sourceKey)!;
    setLoading(true);
    setHasRun(true);
    try {
      const all = (await smartDb.getAll(config.collection)) as any[];
      const filtered = filter ? all.filter(filter) : all;
      setRows(filtered);
      setColumns(config.columns);
      setResultLabel(label || config.label);
      if (filtered.length === 0) {
        toast.info(`No rows found for "${label || config.label}".`);
      } else {
        toast.success(`Loaded ${filtered.length} ${config.label} row(s).`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load data.");
      setRows([]);
      setColumns(config.columns);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSource = () => runReport(selectedSource);

  const handleRunNlQuery = () => {
    const parsed = interpretQuery(nlQuery);
    if (!parsed) {
      toast.error("Couldn't interpret that. Try e.g. 'students low attendance' or 'unpaid invoices'.");
      return;
    }
    setSelectedSource(parsed.source);
    runReport(parsed.source, parsed.filter, parsed.note);
  };

  const formatCell = (field: string, value: any) => {
    if (value === undefined || value === null) return "";
    if (field === "amount") return `${settings.currency} ${Number(value).toLocaleString()}`;
    return String(value);
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Run a report first — nothing to export.");
      return;
    }
    const headers = columns.map((c) => c.header);
    const escape = (v: any) => {
      const s = v === undefined || v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((r) => columns.map((c) => escape(r[c.field])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resultLabel || "report"}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row(s) to CSV.`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Custom Report Builder</h1>
              <p className="text-sm text-slate-400">Design, generate and schedule custom data reports.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200 font-bold gap-2">
              <Clock className="h-4 w-4" />
              Scheduled Reports
            </Button>
            <Button className="rounded-xl bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold gap-2 shadow-lg shadow-[#9810fa]/20">
              <Plus className="h-4 w-4" />
              Build New Report
            </Button>
          </div>
        </div>

        {/* AI Report Assistant */}
        <Card className="border-none shadow-xl shadow-indigo-100/50 bg-gradient-to-br from-[#9810fa] to-[#a29bfe] rounded-[32px] overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center">
                  <Brain className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-white">AI Report Architect</h2>
                    <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase tracking-widest">Natural Language</Badge>
                  </div>
                  <p className="text-white/80 font-medium mt-1">"Describe the report you want, and I'll build the query for you."</p>
                </div>
              </div>
              <div className="flex-1 max-w-md w-full relative">
                <Input
                  placeholder="e.g., students low attendance, unpaid invoices, pending expenses"
                  value={nlQuery}
                  onChange={(e) => setNlQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRunNlQuery(); }}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-2xl h-14 pl-6 pr-14 focus-visible:ring-white/30"
                />
                <Button onClick={handleRunNlQuery} size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-[#9810fa] hover:bg-white/90 rounded-xl h-10 w-10">
                  <Sparkles className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Query Workbench — real data source + run + export */}
        <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-900">Query Workbench</CardTitle>
                <CardDescription>Pick a data source and run a live report from your records.</CardDescription>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={selectedSource} onValueChange={(v) => setSelectedSource(v as SourceKey)}>
                  <SelectTrigger className="w-44 rounded-xl border-slate-200 font-bold">
                    <Database className="h-4 w-4 mr-2 text-slate-400" />
                    <SelectValue placeholder="Data source" />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleRunSource}
                  disabled={loading}
                  className="rounded-xl bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold gap-2"
                >
                  {loading ? "Running..." : "Run"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  onClick={exportCsv}
                  variant="outline"
                  disabled={rows.length === 0}
                  className="rounded-xl border-slate-200 font-bold gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2">
            {!hasRun ? (
              <div className="text-center py-12 text-slate-400 font-medium">
                Select a data source and click <span className="font-bold text-slate-500">Run</span> to preview live rows.
              </div>
            ) : loading ? (
              <div className="text-center py-12 text-slate-400 font-medium">Loading rows…</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">No rows matched this query.</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50/50">
                  <span className="text-sm font-bold text-slate-700">{resultLabel}</span>
                  <Badge className="bg-slate-100 text-slate-500 border-none text-[10px] font-bold uppercase tracking-widest">
                    {rows.length} rows
                  </Badge>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-y border-slate-100">
                      {columns.map((c) => (
                        <th key={c.field} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 100).map((r, idx) => (
                      <tr key={r.id || idx} className="hover:bg-slate-50/50 transition-colors">
                        {columns.map((c) => (
                          <td key={c.field} className="px-4 py-3 text-sm text-slate-600 font-medium whitespace-nowrap">
                            {formatCell(c.field, r[c.field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <div className="px-4 py-3 text-xs text-slate-400 font-medium bg-slate-50/50">
                    Showing first 100 of {rows.length} rows. Export CSV for the full set.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters & View Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search reports..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl border-slate-100" 
              />
            </div>
            <Button variant="outline" className="rounded-xl border-slate-100 font-bold gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-50 rounded-xl">
            <Button 
              variant={viewMode === "grid" ? "secondary" : "ghost"} 
              size="icon" 
              className="rounded-lg h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === "list" ? "secondary" : "ghost"} 
              size="icon" 
              className="rounded-lg h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Reports Grid/List */}
        <AnimatePresence mode="wait">
          {viewMode === "grid" ? (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {reportTemplates.map((report, i) => (
                <Card key={report.id} className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden group hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300">
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className={`p-4 bg-${report.color}-50 rounded-2xl group-hover:scale-110 transition-transform`}>
                        <report.icon className={`h-6 w-6 text-${report.color}-600`} />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-[#9810fa] hover:bg-[#9810fa]/5">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Badge className="bg-slate-100 text-slate-500 border-none text-[10px] font-bold uppercase tracking-widest mb-2">
                      {report.category}
                    </Badge>
                    <h3 className="text-xl font-black text-slate-900 leading-tight mb-2">{report.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-bold">
                      <Clock className="h-3 w-3" />
                      Last run: {report.lastRun}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-8">
                      <Button variant="outline" className="rounded-xl border-slate-100 font-bold text-xs h-10 gap-2" onClick={() => { setSelectedSource(report.source); runReport(report.source, undefined, report.title); }}>
                        <Download className="h-3 w-3" />
                        Load
                      </Button>
                      <Button className="rounded-xl bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold text-xs h-10 gap-2" onClick={() => { setSelectedSource(report.source); runReport(report.source, undefined, report.title); }}>
                        Run Now
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-[32px] flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:border-[#9810fa] hover:bg-[#9810fa]/5 transition-all">
                <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform mb-4">
                  <Plus className="h-8 w-8 text-slate-400 group-hover:text-[#9810fa]" />
                </div>
                <h4 className="font-bold text-slate-900">Create New Template</h4>
                <p className="text-sm text-slate-500 mt-1">Start from scratch or use AI</p>
              </Card>
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white rounded-[32px] overflow-hidden shadow-sm"
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Report Name</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Run</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportTemplates.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 bg-${report.color}-50 rounded-lg`}>
                            <report.icon className={`h-4 w-4 text-${report.color}-600`} />
                          </div>
                          <span className="font-bold text-slate-900">{report.title}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <Badge variant="outline" className="rounded-lg border-slate-100 bg-slate-50 text-slate-600 font-bold">
                          {report.category}
                        </Badge>
                      </td>
                      <td className="px-8 py-4 text-sm text-slate-500 font-medium">{report.lastRun}</td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-bold text-slate-600">Active</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="rounded-xl font-bold text-[#9810fa] hover:bg-[#9810fa]/5" onClick={() => { setSelectedSource(report.source); runReport(report.source, undefined, report.title); }}>Run</Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scheduled Reports Section */}
        <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden">
          <CardHeader className="p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-900">Scheduled Reports</CardTitle>
                <CardDescription>Automated reports sent to your email or dashboard</CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl font-bold gap-2">
                <Settings className="h-4 w-4" />
                Manage Schedules
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "Weekly Performance Digest", frequency: "Every Monday, 8:00 AM", recipients: "Admin, HODs", icon: CheckCircle2 },
                { title: "Monthly Financial Statement", frequency: "1st of every month", recipients: "Principal, Finance Manager", icon: CheckCircle2 },
              ].map((schedule, i) => (
                <div key={i} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <schedule.icon className="h-5 w-5 text-[#9810fa]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900">{schedule.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{schedule.frequency}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recipients:</span>
                      <span className="text-[10px] font-bold text-[#9810fa]">{schedule.recipients}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-lg text-slate-400">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
