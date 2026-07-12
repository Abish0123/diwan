import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileSearch, Upload, Plus, Loader2, Sparkles, ClipboardPaste, Inbox, Eye, Search,
  FileText, AlertTriangle, Trophy, Database, SlidersHorizontal, BarChart3, FileSpreadsheet,
} from "lucide-react";
import { RepositoryPanel } from "@/components/plagiarism/RepositoryPanel";
import { PolicyPanel } from "@/components/plagiarism/PolicyPanel";
import { AnalyticsPanel } from "@/components/plagiarism/AnalyticsPanel";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import {
  ensurePlagiarismSeed, getReports, getRepository, getPolicy, PROJECT_REPORTS,
} from "@/lib/plagiarismData";
import { extractText } from "@/lib/textExtract";
import { analyzeReport } from "@/lib/plagiarismEngine";
import {
  ProjectReport, RepositoryDocument, PlagiarismPolicy, riskFromSimilarity,
} from "@/types/plagiarism";
import { RiskBadge, StatusBadge } from "@/components/plagiarism/shared";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { notifyRoles } from "@/lib/notificationBus";

const ACCEPT = ".pdf,.docx,.doc,.txt,.rtf";

/**
 * Centralised plagiarism page — handles the whole flow in one place:
 * upload a report → run analysis → list reports → open to view / review.
 * Students see their own reports; instructors & admins see all submissions.
 */
export default function ProjectReports() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isReviewer = role === "admin" || role === "staff";
  const fileRef = useRef<HTMLInputElement>(null);

  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [repo, setRepo] = useState<RepositoryDocument[]>([]);
  const [policy, setPolicy] = useState<PlagiarismPolicy | null>(null);
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [form, setForm] = useState({
    studentName: "", title: "", subject: "", department: "Computer Science", guideName: "", semester: "6", description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");

  const load = async () => {
    await ensurePlagiarismSeed();
    const [r, rp, p] = await Promise.all([getReports(), getRepository(), getPolicy()]);
    setReports(r || []); setRepo(rp || []); setPolicy(p);
  };
  useEffect(() => { load(); }, []);
  // prefill the student's own name (instructors/admins overwrite it when uploading on behalf)
  useEffect(() => {
    if (user?.displayName) setForm((f) => (f.studentName ? f : { ...f, studentName: user.displayName! }));
  }, [user]);

  const visible = useMemo(() => {
    let list = isReviewer ? reports : reports.filter((r) => r.studentId === (user?.uid || ""));
    list = list.filter((r) => statusFilter === "all" || r.status === statusFilter);
    list = list.filter((r) => [r.title, r.studentName, r.department].join(" ").toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [reports, isReviewer, user, statusFilter, search]);

  const approved = visible.filter((r) => r.status === "Approved").length;
  const avgSim = visible.length ? Math.round(visible.reduce((s, r) => s + (r.result?.overallSimilarity || 0), 0) / visible.length) : 0;
  const highRisk = visible.filter((r) => (r.result?.overallSimilarity || 0) >= (policy?.manualReviewBelow ?? 30)).length;

  const submit = async () => {
    if (!form.studentName.trim()) return toast.error("Enter the student name");
    if (!form.title.trim()) return toast.error("Enter a project title");
    let text = "", fileName = "pasted-text.txt", fileType = "txt", fileSizeKb = 0;

    if (pasteMode) {
      if (pastedText.trim().split(/\s+/).length < 30) return toast.error("Paste at least ~30 words to analyse");
      text = pastedText; fileSizeKb = Math.round(new Blob([pastedText]).size / 1024);
    } else {
      if (!file) return toast.error("Choose a file to upload");
      const maxMb = policy?.maxFileSizeMb ?? 50;
      if (file.size > maxMb * 1024 * 1024) return toast.error(`File exceeds the ${maxMb} MB limit`);
      setAnalyzing(true);
      const ext = await extractText(file);
      if (!ext.ok) { setAnalyzing(false); return toast.error(ext.note || "Could not read the file"); }
      text = ext.text; fileName = file.name; fileType = file.name.split(".").pop() || "txt"; fileSizeKb = Math.round(file.size / 1024);
    }

    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 50));
    const result = analyzeReport(text, repo, repo.map((d) => ({ id: d.id, studentName: d.studentName, title: d.title })));
    const sim = result.overallSimilarity;
    const status = sim < (policy?.autoApproveBelow ?? 15) ? "Submitted" : "Under Review";

    const report: ProjectReport = {
      id: `RPT-${Date.now()}`, ...form, fileName, fileType, fileSizeKb,
      studentId: user?.uid || "anon",
      studentName: form.studentName.trim() || user?.displayName || user?.email || "Student",
      status, version: 1, text, result,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await smartDb.create(PROJECT_REPORTS, report as never, report.id);
    // A report that crosses the manual-review threshold is a real,
    // high-signal event with no path to a reviewer today — it only ever
    // showed up if an admin happened to open this page. One notification,
    // deterministic id keyed off the report so re-checking never duplicates.
    if (status === "Under Review") {
      notifyRoles(["admin"], {
        idPrefix: `plagiarism_${report.id}`,
        entity: "ProjectReport",
        category: "academic",
        type: "plagiarism_flagged",
        title: "Plagiarism Review Needed",
        message: `${report.studentName}'s "${report.title}" scored ${sim}% similarity — needs manual review.`,
      }).catch(() => {});
    }
    setAnalyzing(false); setOpen(false);
    setForm({ studentName: user?.displayName || "", title: "", subject: "", department: "Computer Science", guideName: "", semester: "6", description: "" });
    setFile(null); setPastedText("");
    toast.success(`Analysis complete — ${sim}% similarity, ${result.ai.aiProbability}% AI`);
    navigate(`/plagiarism/report/${report.id}`);
  };

  const exportExcel = async () => {
    if (visible.length === 0) return toast.error("No reports to export");
    try {
      const XLSX = await import("xlsx");
      const rows = visible.map((r) => ({
        Student: r.studentName,
        Title: r.title,
        Subject: r.subject || "",
        Department: r.department,
        Guide: r.guideName || "",
        Semester: r.semester || "",
        "Similarity %": r.result?.overallSimilarity ?? 0,
        "Risk": riskFromSimilarity(r.result?.overallSimilarity || 0, policy || undefined),
        "AI %": r.result?.ai.aiProbability ?? 0,
        "Student Repo %": r.result?.breakdown.studentRepo ?? 0,
        "Internet %": r.result?.breakdown.internet ?? 0,
        "Research %": r.result?.breakdown.research ?? 0,
        Status: r.status,
        Submitted: new Date(r.createdAt).toLocaleString(),
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, "Plagiarism Results");
      XLSX.writeFile(wb, `plagiarism_results_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${rows.length} report(s) to Excel`);
    } catch {
      toast.error("Could not export");
    }
  };

  const reportsBody = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat icon={<FileText className="h-5 w-5" />} label={isReviewer ? "Submissions" : "My Reports"} value={visible.length} />
        <Stat icon={<Trophy className="h-5 w-5" />} label="Approved" value={approved} />
        <Stat icon={<Sparkles className="h-5 w-5" />} label="Avg Similarity" value={`${avgSim}%`} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="High Risk" value={highRisk} tone="rose" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search by title, student or department…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["Submitted", "Under Review", "Approved", "Rejected", "Revision Requested"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export Excel</Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">{isReviewer ? "All Submissions" : "My Submissions"}</CardTitle></CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-slate-400"><Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" /> No reports yet — upload one to run a similarity check.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isReviewer && <TableHead>Student</TableHead>}
                  <TableHead>Report</TableHead><TableHead>Dept</TableHead><TableHead>Submitted</TableHead>
                  <TableHead>Similarity</TableHead><TableHead>AI</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    {isReviewer && <TableCell className="font-medium text-slate-800">{r.studentName}</TableCell>}
                    <TableCell className="max-w-[220px] truncate">{r.title}</TableCell>
                    <TableCell className="text-sm text-slate-500">{r.department}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">{r.result?.overallSimilarity ?? 0}%</span>
                        <RiskBadge risk={riskFromSimilarity(r.result?.overallSimilarity || 0, policy || undefined)} />
                      </span>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">{r.result?.ai.aiProbability ?? 0}%</Badge></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => navigate(`/plagiarism/report/${r.id}`)}><Eye className="h-4 w-4 mr-1" /> {isReviewer ? "Review" : "View"}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FileSearch className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Project Reports</h1>
            <p className="text-sm text-slate-400">
              {isReviewer ? "Upload, review and approve project reports — plagiarism & AI analysis in one place." : "Upload reports for plagiarism & AI-content analysis. PDF, DOCX, TXT supported."}
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-[#9810fa] hover:bg-[#5d1899]"><Plus className="h-4 w-4 mr-1.5" /> Upload Report</Button></DialogTrigger>
          <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Submit Project Report</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Student Name</Label><Input value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} placeholder="Full name of the student" /></div>
                <div className="col-span-2"><Label>Project Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
                <div><Label>Guide Name</Label><Input value={form.guideName} onChange={(e) => setForm({ ...form, guideName: e.target.value })} /></div>
                <div><Label>Semester</Label><Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} /></div>
                <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Report Content</Label>
                <Button type="button" variant="ghost" size="sm" className="text-[#9810fa] h-auto py-1" onClick={() => setPasteMode((v) => !v)}>
                  {pasteMode ? <><Upload className="h-3.5 w-3.5 mr-1" /> Upload file</> : <><ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Paste text</>}
                </Button>
              </div>
              {pasteMode ? (
                <Textarea rows={6} placeholder="Paste your report text here…" value={pastedText} onChange={(e) => setPastedText(e.target.value)} />
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-200 hover:border-violet-300 p-6 text-center transition-colors">
                  <Upload className="h-7 w-7 mx-auto text-slate-400 mb-2" />
                  {file ? <span className="text-sm text-slate-700 font-medium">{file.name}</span> : <span className="text-sm text-slate-500">Click to choose a file (PDF, DOCX, TXT, RTF)</span>}
                  <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={analyzing}>Cancel</Button>
              <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={submit} disabled={analyzing}>
                {analyzing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Analysing…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Analyse &amp; Submit</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isReviewer ? (
        <Tabs defaultValue="reports">
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            {[
              { v: "reports", label: "Reports", icon: FileText },
              { v: "repository", label: "Repository", icon: Database },
              { v: "policy", label: "Policy & Rules", icon: SlidersHorizontal },
              { v: "analytics", label: "Analytics", icon: BarChart3 },
            ].map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="reports" className="mt-4">{reportsBody}</TabsContent>
          <TabsContent value="repository" className="mt-4"><RepositoryPanel /></TabsContent>
          <TabsContent value="policy" className="mt-4"><PolicyPanel /></TabsContent>
          <TabsContent value="analytics" className="mt-4"><AnalyticsPanel /></TabsContent>
        </Tabs>
      ) : (
        reportsBody
      )}
    </DashboardLayout>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "rose" }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("h-10 w-10 rounded-lg grid place-items-center", tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-[#9810fa]")}>{icon}</div>
        <div><div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>
      </CardContent>
    </Card>
  );
}
