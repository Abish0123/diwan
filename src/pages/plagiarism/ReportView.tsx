import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Download, FileSpreadsheet, Loader2, Sparkles, Globe, Users, BookMarked,
  Quote, CheckCircle2, XCircle, RotateCcw, ShieldCheck, ExternalLink, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { PROJECT_REPORTS, getPolicy, addToRepository } from "@/lib/plagiarismData";
import { logAudit } from "@/lib/codingAudit";
import {
  ProjectReport, PlagiarismPolicy, ReportStatus, riskFromSimilarity, bandForScore,
} from "@/types/plagiarism";
import { RiskBadge, StatusBadge, ScoreRing, riskColor } from "@/components/plagiarism/shared";
import { HighlightedViewer } from "@/components/plagiarism/HighlightedViewer";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";

const CITATION_LABELS: Record<string, string> = {
  "missing-citation": "Missing Citation",
  "improper-reference": "Improper Reference",
  "unquoted-content": "Unquoted Content",
  "citation-mismatch": "Citation Check",
};

export default function ReportView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const canReview = can(role, "submission.review") || role === "admin";
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [policy, setPolicy] = useState<PlagiarismPolicy | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [r, p] = await Promise.all([
        smartDb.getOne(PROJECT_REPORTS, id!) as Promise<ProjectReport | null>,
        getPolicy(),
      ]);
      setReport(r); setPolicy(p);
      setComment(r?.reviewComment || "");
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DashboardLayout><div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</div></DashboardLayout>;
  if (!report || !report.result) return <DashboardLayout><p className="text-slate-500">Report not found.</p></DashboardLayout>;

  const res = report.result;
  const simRisk = riskFromSimilarity(res.overallSimilarity, policy || undefined);

  const setStatus = async (status: ReportStatus) => {
    const updated: ProjectReport = { ...report, status, reviewComment: comment, reviewedBy: user?.email, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await smartDb.update(PROJECT_REPORTS, report.id, updated as never);
    await logAudit(`Report ${status.toLowerCase()}`, "project_reports", { user: user?.email, role }, `${report.title} — ${report.studentName}`);
    if (status === "Approved") await addToRepository(updated); // approved reports join the repository
    setReport(updated);
    toast.success(`Report ${status.toLowerCase()}`);
  };

  const exportPdf = async () => {
    try {
      const { generatePlagiarismPdf } = await import("@/lib/plagiarismPdf");
      await generatePlagiarismPdf(report, policy);
      toast.success("PDF report downloaded");
    } catch (e) { toast.error("Could not generate PDF"); console.error(e); }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
        Student: report.studentName, Title: report.title, Department: report.department,
        Similarity: res.overallSimilarity, StudentRepo: res.breakdown.studentRepo,
        Internet: res.breakdown.internet, Research: res.breakdown.research,
        AI: res.ai.aiProbability, Status: report.status,
      }]), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.sources.map((s) => ({
        Type: s.type, Source: s.label, Match: s.matchPercent, Location: s.location || "",
      }))), "Sources");
      XLSX.writeFile(wb, `${report.studentName.replace(/\s/g, "_")}_sources.xlsx`);
      toast.success("Excel downloaded");
    } catch { toast.error("Could not generate Excel"); }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" className="-ml-2 text-slate-500" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
          <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-1.5" /> PDF Report</Button>
        </div>
      </div>

      {/* header */}
      <Card className="border-slate-200">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><FileText className="h-4 w-4" /> {report.subject || report.department}</div>
              <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{report.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{report.studentName} · Guide: {report.guideName || "—"} · Semester {report.semester} · {res.wordCount} words</p>
            </div>
            <StatusBadge status={report.status} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 items-center">
            <div className="flex flex-col items-center gap-1">
              <ScoreRing value={res.overallSimilarity} label="Similarity" color={riskColor(simRisk)} />
              <RiskBadge risk={simRisk} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <ScoreRing value={res.ai.aiProbability} label="AI Content" color={riskColor(res.ai.risk)} />
              <RiskBadge risk={res.ai.risk} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <BreakdownBar label="Student Repository" value={res.breakdown.studentRepo} color="#8b5cf6" icon={<Users className="h-3.5 w-3.5" />} />
              <BreakdownBar label="Internet Sources" value={res.breakdown.internet} color="#0ea5e9" icon={<Globe className="h-3.5 w-3.5" />} />
              <BreakdownBar label="Research Papers" value={res.breakdown.research} color="#f59e0b" icon={<BookMarked className="h-3.5 w-3.5" />} />
              <div className="flex gap-4 text-xs text-slate-500 pt-1">
                <span>{res.exactMatches} exact</span><span>{res.partialMatches} partial</span><span>{res.paraphrased} paraphrased</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="document">
        <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
          {[
            { v: "document", label: "Highlighted Document" },
            { v: "sources", label: `Sources (${res.sources.length})` },
            { v: "ai", label: "AI Detection" },
            { v: "citations", label: `Citations (${res.citations.length})` },
          ].map((t) => (
            <TabsTrigger key={t.v} value={t.v} className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="document" className="mt-4">
          <Card className="border-slate-200"><CardContent className="p-4">
            <HighlightedViewer sentences={res.sentenceMatches} suspiciousAi={res.ai.suspiciousSentences} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sources" className="mt-4 space-y-4">
          {res.studentMatches.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-violet-500" /> Student-to-Student Matches</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {res.studentMatches.map((s) => (
                  <div key={s.reportId} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div><div className="font-medium text-slate-800 text-sm">{s.studentName}</div><div className="text-xs text-slate-400">{s.reportTitle} · {s.matchedSections} matching sections</div></div>
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-semibold">{s.matchPercent}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-sky-500" /> Source Matches</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {res.sources.length === 0 && <p className="text-sm text-slate-400">No external sources matched.</p>}
              {res.sources.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal capitalize shrink-0">{s.type}</Badge>
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-sky-600 hover:underline truncate flex items-center gap-1">{s.label}<ExternalLink className="h-3 w-3" /></a> : <span className="text-sm text-slate-700 truncate">{s.label}</span>}
                    </div>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-semibold shrink-0">{s.matchPercent}%</Badge>
                  </div>
                  {s.location && <div className="text-xs text-slate-400 mt-1">{s.location}</div>}
                  {s.snippet && <div className="text-xs text-slate-500 mt-1 italic">“{s.snippet}…”</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#9810fa]" /> AI Content Detection</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 text-center">
                  <div className="text-3xl font-bold text-[#9810fa]">{res.ai.aiProbability}%</div>
                  <div className="text-xs text-slate-500 mt-1">AI-Generated</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-600">{res.ai.humanProbability}%</div>
                  <div className="text-xs text-slate-500 mt-1">Human-Written</div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Detection signals</h4>
                <ul className="space-y-1.5">
                  {res.ai.signals.map((sig, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />{sig}</li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-slate-400">Heuristic detector (burstiness, lexical diversity, AI-phrase patterns). {res.ai.suspiciousSentences.length} sentence(s) flagged — underlined in the Highlighted Document tab.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="citations" className="mt-4">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Quote className="h-4 w-4 text-amber-500" /> Citation Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {res.citations.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 shrink-0">{CITATION_LABELS[c.type]}</Badge>
                  <span className="text-slate-600">{c.detail}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* instructor review panel */}
      {canReview && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Instructor Review</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={2} placeholder="Add a review comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus("Approved")}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>
              <Button variant="outline" className="text-purple-600 border-violet-200" onClick={() => setStatus("Revision Requested")}><RotateCcw className="h-4 w-4 mr-1.5" /> Request Revision</Button>
              <Button variant="outline" className="text-rose-600 border-rose-200" onClick={() => setStatus("Rejected")}><XCircle className="h-4 w-4 mr-1.5" /> Reject</Button>
            </div>
            {report.reviewedBy && <p className="text-xs text-slate-400">Last reviewed by {report.reviewedBy} on {new Date(report.reviewedAt!).toLocaleString()}</p>}
          </CardContent>
        </Card>
      )}

      {/* recommendation banner */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#9810fa] shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-slate-800">Recommendation</div>
            <p className="text-sm text-slate-600 mt-0.5">{recommendation(res.overallSimilarity, res.ai.aiProbability, policy)}</p>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

function BreakdownBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="flex items-center gap-1.5 text-slate-600">{icon}{label}</span><span className="font-semibold text-slate-800">{value}%</span></div>
      <Progress value={Math.min(100, value * 3)} className="h-1.5" />
    </div>
  );
}

function recommendation(sim: number, ai: number, policy: PlagiarismPolicy | null): string {
  const auto = policy?.autoApproveBelow ?? 15;
  const manual = policy?.manualReviewBelow ?? 30;
  const parts: string[] = [];
  if (sim < auto) parts.push(`Similarity (${sim}%) is within the safe limit — eligible for auto-approval.`);
  else if (sim < manual) parts.push(`Similarity (${sim}%) needs manual review.`);
  else parts.push(`Similarity (${sim}%) is high — flag for investigation and request revision.`);
  if (ai >= (policy?.aiReviewBelow ?? 50)) parts.push(`AI content (${ai}%) is high risk — verify authorship.`);
  else if (ai >= (policy?.aiLowBelow ?? 20)) parts.push(`AI content (${ai}%) warrants a closer look.`);
  return parts.join(" ");
}
