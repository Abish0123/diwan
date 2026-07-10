import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Download, FileSpreadsheet, Trophy, ShieldCheck, Code2, Sparkles,
  CheckCircle2, XCircle, Loader2, TrendingUp, TrendingDown, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { getQuestions, CODING_ATTEMPTS } from "@/lib/codingData";
import { getGradingRules, DEFAULT_GRADING } from "@/lib/codingSettings";
import {
  CodingAttempt, CodingQuestion, VIOLATION_LABELS, integrityStatus, LANGUAGE_LABELS, GradingRules,
} from "@/types/coding";
import { IntegrityBadge, integrityColor } from "@/components/coding/shared";
import {
  RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell,
} from "recharts";

export default function AssessmentResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<CodingAttempt | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [grading, setGrading] = useState<GradingRules>(DEFAULT_GRADING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, qs, g] = await Promise.all([
        smartDb.getOne(CODING_ATTEMPTS, attemptId!) as Promise<CodingAttempt | null>,
        getQuestions(),
        getGradingRules(),
      ]);
      setAttempt(a);
      setQuestions(qs || []);
      setGrading(g);
      setLoading(false);
    })();
  }, [attemptId]);

  const subs = useMemo(() => (attempt ? Object.values(attempt.submissions || {}) : []), [attempt]);
  const codePct = attempt && attempt.totalMarks ? Math.round((attempt.totalScore / attempt.totalMarks) * 100) : 0;
  const didPass = codePct >= grading.passingPercentage;
  const anyNeedsReview = subs.some((s) => s.needsReview);

  // AI code evaluation (heuristic, transparent). A real build sends code to an
  // LLM/static-analysis service; here we derive plausible sub-scores.
  const aiScores = useMemo(() => {
    if (!subs.length) return { quality: 0, optimization: 0, maintainability: 0 };
    const avgPass = subs.reduce((s, v) => s + (v.total ? v.passed / v.total : 0), 0) / subs.length;
    const avgLen = subs.reduce((s, v) => s + v.code.replace(/\s/g, "").length, 0) / subs.length;
    const concise = Math.max(40, Math.min(100, 140 - avgLen / 6));
    return {
      quality: Math.round(40 + avgPass * 55),
      optimization: Math.round(35 + avgPass * 50),
      maintainability: Math.round(concise),
    };
  }, [subs]);

  const violationCounts = useMemo(() => {
    const m: Record<string, number> = {};
    attempt?.violations.forEach((v) => { m[v.type] = (m[v.type] || 0) + 1; });
    return Object.entries(m).map(([type, count]) => ({ type, count, label: VIOLATION_LABELS[type as keyof typeof VIOLATION_LABELS] }));
  }, [attempt]);

  const strengths = subs.filter((s) => s.total && s.passed / s.total >= 0.8);
  const weak = subs.filter((s) => s.total && s.passed / s.total < 0.5);

  const exportPdf = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const a = attempt!;
      doc.setFontSize(18); doc.text("Coding Assessment Report", 14, 20);
      doc.setFontSize(11); doc.setTextColor(100);
      doc.text(`${a.testTitle}`, 14, 28);
      doc.setTextColor(0); doc.setFontSize(12);
      let y = 42;
      const line = (label: string, val: string) => { doc.text(`${label}:`, 14, y); doc.text(val, 90, y); y += 8; };
      line("Student", a.studentName);
      line("Submitted", new Date(a.submittedAt || a.startedAt).toLocaleString());
      line("Total Score", `${a.totalScore} / ${a.totalMarks} (${codePct}%)`);
      line("Integrity Score", `${a.integrityScore} - ${integrityStatus(a.integrityScore)}`);
      line("Face Verified", a.faceVerified ? "Yes" : "No");
      line("AI Code Quality", `${aiScores.quality}/100`);
      line("AI Optimization", `${aiScores.optimization}/100`);
      line("AI Maintainability", `${aiScores.maintainability}/100`);
      y += 4; doc.setFontSize(13); doc.text("Per-question breakdown", 14, y); y += 8; doc.setFontSize(11);
      subs.forEach((s) => {
        const q = questions.find((x) => x.id === s.questionId);
        line(q?.title || s.questionId, `${s.passed}/${s.total} cases - ${s.score} marks`);
      });
      y += 2; doc.setFontSize(13); doc.text("Proctoring violations", 14, y); y += 8; doc.setFontSize(11);
      if (!violationCounts.length) line("Violations", "None");
      violationCounts.forEach((v) => line(v.label, String(v.count)));
      doc.save(`${a.studentName.replace(/\s/g, "_")}_report.pdf`);
      toast.success("PDF report downloaded");
    } catch {
      toast.error("Could not generate PDF");
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const a = attempt!;
      const rows = subs.map((s) => {
        const q = questions.find((x) => x.id === s.questionId);
        return {
          Question: q?.title || s.questionId,
          Language: LANGUAGE_LABELS[s.language],
          "Cases Passed": s.passed,
          "Total Cases": s.total,
          Marks: s.score,
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Questions");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{
          Student: a.studentName, TotalScore: a.totalScore, TotalMarks: a.totalMarks,
          Percentage: codePct, IntegrityScore: a.integrityScore, Status: integrityStatus(a.integrityScore),
          FaceVerified: a.faceVerified ? "Yes" : "No",
        }]),
        "Summary"
      );
      XLSX.writeFile(wb, `${a.studentName.replace(/\s/g, "_")}_report.xlsx`);
      toast.success("Excel report downloaded");
    } catch {
      toast.error("Could not generate Excel");
    }
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</div></DashboardLayout>;
  }
  if (!attempt) {
    return <DashboardLayout><p className="text-slate-500">Report not found.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="-ml-2 text-slate-500" onClick={() => navigate("/coding/assessments")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
          <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-1.5" /> PDF</Button>
        </div>
      </div>

      {/* hero scores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1"><Trophy className="h-4 w-4" /> {attempt.testTitle}</div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{attempt.studentName}</h1>
              <Badge className={didPass ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-rose-100 text-rose-700 hover:bg-rose-100"}>
                {didPass ? "PASS" : "FAIL"} · {grading.passingPercentage}% to pass
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Submitted {new Date(attempt.submittedAt || attempt.startedAt).toLocaleString()}</p>
            {anyNeedsReview && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Some answers require manual instructor grading — the score shown is provisional and may change after review.</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <BigStat label="Total Score" value={`${attempt.totalScore}/${attempt.totalMarks}`} sub={`${codePct}%`} icon={<Code2 className="h-4 w-4" />} />
              <BigStat label="Integrity" value={String(attempt.integrityScore)} sub={integrityStatus(attempt.integrityScore)} icon={<ShieldCheck className="h-4 w-4" />} color={integrityColor(attempt.integrityScore)} />
              <BigStat label="Questions" value={`${subs.length}`} sub="attempted" icon={<CheckCircle2 className="h-4 w-4" />} />
              <BigStat label="Face Verified" value={attempt.faceVerified ? "Yes" : "No"} sub="identity" icon={<ShieldCheck className="h-4 w-4" />} />
            </div>
          </CardContent>
        </Card>

        {/* integrity gauge */}
        <Card className="border-slate-200">
          <CardHeader className="pb-0"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-[#9810fa]" /> Integrity</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={160}>
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "score", value: attempt.integrityScore, fill: integrityColor(attempt.integrityScore) }]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={10} />
                <text x="50%" y="48%" textAnchor="middle" className="fill-slate-900 text-2xl font-bold">{attempt.integrityScore}</text>
                <text x="50%" y="62%" textAnchor="middle" className="fill-slate-400 text-xs">{integrityStatus(attempt.integrityScore)}</text>
              </RadialBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI evaluation — only when enabled in grading rules */}
        {grading.aiEvaluation && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#9810fa]" /> AI Code Evaluation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Meter label="Code Quality" value={aiScores.quality} />
            <Meter label="Optimization" value={aiScores.optimization} />
            <Meter label="Maintainability" value={aiScores.maintainability} />
            <p className="text-[11px] text-slate-400 pt-1">Heuristic evaluation derived from correctness and code structure.</p>
          </CardContent>
        </Card>
        )}

        {/* per-question */}
        <Card className={`border-slate-200 ${grading.aiEvaluation ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <CardHeader><CardTitle className="text-base">Question Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(140, subs.length * 56)}>
              <BarChart layout="vertical" data={subs.map((s) => {
                const q = questions.find((x) => x.id === s.questionId);
                return { name: q?.title?.slice(0, 18) || s.questionId, score: s.score, max: q?.marks || 0, pct: s.total ? Math.round((s.passed / s.total) * 100) : 0 };
              })} margin={{ left: 10, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                  {subs.map((s, i) => <Cell key={i} fill={s.total && s.passed / s.total >= 0.8 ? "#059669" : s.total && s.passed / s.total >= 0.4 ? "#d97706" : "#e11d48"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {subs.map((s) => {
                const q = questions.find((x) => x.id === s.questionId);
                return (
                  <div key={s.questionId} className="flex items-center justify-between text-sm rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-slate-700">{q?.title}</span>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{LANGUAGE_LABELS[s.language]}</Badge>
                      {s.needsReview && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-normal">Pending review</Badge>}
                      <span className="text-slate-500">{s.total ? `${s.passed}/${s.total} cases` : "—"}</span>
                      <span className="font-semibold text-slate-800 w-14 text-right">{s.score}/{q?.marks}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* strengths / weak / recommendations + violations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Strength Areas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {strengths.length ? strengths.map((s) => {
              const q = questions.find((x) => x.id === s.questionId);
              return <div key={s.questionId} className="text-sm text-slate-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {q?.category} — {q?.title}</div>;
            }) : <p className="text-sm text-slate-400">Keep practising to build strengths.</p>}
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-rose-600" /> Weak Areas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {weak.length ? weak.map((s) => {
              const q = questions.find((x) => x.id === s.questionId);
              return <div key={s.questionId} className="text-sm text-slate-700 flex items-center gap-2"><XCircle className="h-4 w-4 text-rose-500" /> {q?.category} — {q?.title}</div>;
            }) : <p className="text-sm text-slate-400">No major weak areas. Great job!</p>}
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#9810fa]" /> AI Recommendations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            {weak.length > 0 && <p>• Revisit {weak.map((s) => questions.find((q) => q.id === s.questionId)?.category).filter(Boolean).join(", ")} fundamentals.</p>}
            {aiScores.optimization < 70 && <p>• Focus on time/space complexity — aim for optimal algorithms.</p>}
            {attempt.integrityScore < 85 && <p>• Maintain focus and stay in frame to improve integrity scores.</p>}
            {aiScores.maintainability < 70 && <p>• Improve readability: meaningful names and smaller functions.</p>}
            {weak.length === 0 && aiScores.optimization >= 70 && attempt.integrityScore >= 85 && <p>• Strong all-round performance — try harder difficulty tiers next.</p>}
          </CardContent>
        </Card>
      </div>

      {violationCounts.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-600" /> Proctoring Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {violationCounts.map((v) => (
                <Badge key={v.type} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{v.label}: {v.count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}

function BigStat({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: React.ReactNode; color?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: color || "#0f172a" }}>{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{label}</span><span className="font-semibold text-slate-800">{value}/100</span></div>
      <Progress value={value} className="h-2" />
    </div>
  );
}
