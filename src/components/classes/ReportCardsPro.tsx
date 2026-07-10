import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText, FileCheck, Clock, Send, Award, Search, SlidersHorizontal,
  Eye, Download, MoreVertical, Medal, Sparkles, ChevronLeft, ChevronRight,
  CheckCircle2, Printer,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeClassGradebook, discoverSubjects,
  type GradebookSources, type GradebookStudent,
} from "@/lib/gradebookEngine";
import {
  getReportCard, saveReportCards, regenerateReportCard, reportCardId,
  type ReportCardRecord,
} from "@/lib/reportCardStore";
import { smartDb } from "@/lib/localDb";

const C = { primary: "#7C3AED", secondary: "#A855F7", success: "#22C55E", warning: "#F59E0B", error: "#EF4444", blue: "#3B82F6" };

type RStatus = "Published" | "Generated" | "Pending";

function gradeColor(p: number) { return p >= 85 ? C.success : p >= 70 ? C.blue : p >= 50 ? C.warning : C.error; }
const initials = (n: string) => (n || "?").split(" ").map(p => p[0] || "").join("").slice(0, 2).toUpperCase();
const PAGE_SIZE = 10;

interface ReportCardsProProps {
  classData: { name?: string; grade?: string; academicYear?: string; status?: string; teacher?: string };
  students?: { id: string; name: string; rollNo?: string; rollNumber?: string; grade?: string; section?: string; sectionName?: string }[];
  semesterName?: string | null;
}

export default function ReportCardsPro({ classData, students = [], semesterName }: ReportCardsProProps) {
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  useEffect(() => {
    let alive = true;
    loadGradebookSources().then(s => { if (alive) setSources(s); }).catch(() => { if (alive) setSources(null); }).finally(() => { if (alive) setLoadingSources(false); });
    return () => { alive = false; };
  }, []);

  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    smartDb.getAll("attendance").then(rows => { if (alive) setAttendanceRows(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  function attendancePctFor(studentId: string): number | null {
    const rows = attendanceRows.filter((r: any) => r.entityType === "student" && String(r.entityId) === studentId);
    if (rows.length === 0) return null;
    const score = rows.reduce((a: number, r: any) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
    return Math.round((score / rows.length) * 100);
  }

  const classGrade = classData.grade || "";
  const band = useMemo(() => getBandForGrade(curriculum, classGrade), [curriculum, classGrade]);
  const year = classData.academicYear || "2026-27";
  const term = semesterName || "Term 1";

  const rosterKey = students.map((s, i) => [s.id, s.name, s.grade || "", s.section || s.sectionName || "", s.rollNo || s.rollNumber || String(i + 1)].join("^")).join("|");
  const roster: (GradebookStudent & { rollNo: string })[] = useMemo(() =>
    students.map((s, i) => ({
      id: String(s.id), name: s.name,
      grade: s.grade || classGrade,
      section: s.section || s.sectionName || "",
      rollNo: s.rollNo || s.rollNumber || String(i + 1),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey, classGrade]);

  const subjectList = useMemo(() => {
    if (!sources) return [];
    const set = new Set<string>();
    roster.forEach(st => discoverSubjects(st, sources).forEach(sub => set.add(sub)));
    return Array.from(set).sort();
  }, [sources, roster]);

  // Bump after any save/regenerate/publish so the table re-reads the report-card store.
  const [rcVersion, setRcVersion] = useState(0);

  const rcRoster = useMemo(() => {
    if (!sources || roster.length === 0) return [];
    const computed = computeClassGradebook(roster, band, sources, subjectList.length ? subjectList : undefined);
    const byId = new Map(roster.map(r => [String(r.id), r]));
    return computed.map(gb => {
      const stu = byId.get(gb.studentId)!;
      const existing = getReportCard(gb.studentId, year, term);
      const status: RStatus = existing ? (existing.status === "published" ? "Published" : "Generated") : "Pending";
      return {
        id: gb.studentId, name: gb.name, roll: stu.rollNo,
        pct: Math.round(gb.overallPercentage), grade: gb.overallLetter, rank: gb.rank,
        status, hasMarks: gb.subjects.some(s => s.hasData),
        subjects: gb.subjects, section: gb.section,
      };
    }).sort((a, b) => b.pct - a.pct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, roster, band, subjectList, rcVersion, year, term]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewRow, setViewRow] = useState<(typeof rcRoster)[number] | null>(null);

  const visible = rcRoster.filter(r =>
    (statusFilter === "all" || r.status.toLowerCase() === statusFilter) &&
    r.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = rcRoster.length;
  const published = rcRoster.filter(r => r.status === "Published").length;
  const generated = rcRoster.filter(r => r.status === "Generated").length;
  const pending = rcRoster.filter(r => r.status === "Pending").length;
  const gradedRows = rcRoster.filter(r => r.hasMarks);
  const avg = gradedRows.length ? Math.round(gradedRows.reduce((a, r) => a + r.pct, 0) / gradedRows.length) : null;

  const dist = useMemo(() => {
    const bands = [
      { name: "A+ / A", min: 80, hex: "#22C55E" },
      { name: "B+ / B", min: 60, hex: "#3B82F6" },
      { name: "C", min: 50, hex: "#F59E0B" },
      { name: "D / F", min: 0, hex: "#EF4444" },
    ];
    return bands.map((b, i) => {
      const next = bands[i - 1]?.min ?? 101;
      const count = gradedRows.filter(r => r.pct >= b.min && r.pct < next).length;
      return { name: b.name, value: count, hex: b.hex };
    }).filter(d => d.value > 0);
  }, [gradedRows]);

  const statusStyle: Record<RStatus, string> = {
    Published: "bg-emerald-50 text-emerald-600 border-emerald-100",
    Generated: "bg-blue-50 text-purple-600 border-blue-100",
    Pending: "bg-amber-50 text-amber-600 border-amber-100",
  };

  const kpis = [
    { label: "Total Students", value: total, sub: "This term", icon: FileText, hex: "#7C3AED", light: "#F1ECFF" },
    { label: "Generated", value: generated + published, sub: "Ready to publish", icon: FileCheck, hex: "#3B82F6", light: "#DBEAFE" },
    { label: "Pending", value: pending, sub: "Not generated yet", icon: Clock, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Published", value: published, sub: "Sent to parents", icon: Send, hex: "#22C55E", light: "#DCFCE7" },
    { label: "Class Average", value: avg != null ? `${avg}%` : "—", sub: "Overall result", icon: Award, hex: "#EC4899", light: "#FCE7F3" },
  ];

  function buildRecord(row: (typeof rcRoster)[number]): ReportCardRecord {
    const existing = getReportCard(row.id, year, term);
    return {
      id: reportCardId(row.id, year, term),
      studentId: row.id, name: row.name, grade: classGrade, section: row.section, term, year,
      subjects: row.subjects.filter(s => s.hasData).map(s => ({ subject: s.subject, obtained: Math.round(s.obtainedWeighted), max: s.presentWeight, pct: Math.round(s.percentage), letter: s.letter })),
      overallPct: row.pct, overallGrade: row.grade,
      attendancePct: attendancePctFor(row.id),
      classTeacherRemark: existing?.classTeacherRemark || "",
      principalRemark: existing?.principalRemark || "",
      status: existing?.status || "draft",
      approvalStage: existing?.approvalStage || 0,
      publishedToStudents: existing?.publishedToStudents || false,
      publishedToParents: existing?.publishedToParents || false,
      teacherName: existing?.teacherName || classData.teacher || "",
      generatedAt: "",
    };
  }

  function handleGenerateAll() {
    const targets = rcRoster.filter(r => r.status === "Pending" && r.hasMarks);
    if (targets.length === 0) { toast.info("No pending report cards with marks to generate."); return; }
    saveReportCards(targets.map(buildRecord));
    setRcVersion(v => v + 1);
    toast.success(`Generated ${targets.length} report card${targets.length === 1 ? "" : "s"}`);
  }

  function handleRegenerate(row: (typeof rcRoster)[number]) {
    regenerateReportCard(buildRecord(row));
    setRcVersion(v => v + 1);
    toast.success(`${row.name}'s report card regenerated with the latest marks`);
  }

  function handleSendToParent(row: (typeof rcRoster)[number]) {
    if (!row.hasMarks) { toast.error("No marks recorded yet — nothing to publish."); return; }
    const rec = buildRecord(row);
    rec.publishedToParents = true;
    rec.publishedToStudents = true;
    rec.status = "published";
    saveReportCards([rec]);
    setRcVersion(v => v + 1);
    toast.success(`Published to ${row.name}'s parent — notification sent`);
  }

  function handlePublishAllGenerated() {
    const targets = rcRoster.filter(r => r.status === "Generated");
    if (targets.length === 0) { toast.info("No generated report cards awaiting publish."); return; }
    const recs = targets.map(row => {
      const rec = buildRecord(row);
      rec.publishedToParents = true;
      rec.publishedToStudents = true;
      rec.status = "published";
      return rec;
    });
    saveReportCards(recs);
    setRcVersion(v => v + 1);
    toast.success(`Published ${recs.length} report card${recs.length === 1 ? "" : "s"} to parents`);
  }

  function printRow(row: (typeof rcRoster)[number]) {
    const rows = row.subjects.filter(s => s.hasData).map(s => `<tr><td>${s.subject}</td><td>${Math.round(s.percentage)}%</td><td>${s.letter}</td></tr>`).join("");
    const att = attendancePctFor(row.id);
    const html = `<!doctype html><html><head><title>${row.name} — Report Card</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
        th,td{border:1px solid #e2e8f0;padding:9px 12px;text-align:left}
        th{background:#f1f5f9;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#475569}
        .stats{display:flex;gap:24px;margin-top:16px}
        .stat{font-size:13px}
        .stat b{display:block;font-size:20px}
      </style></head><body>
      <h1>${row.name} — Report Card</h1>
      <div class="sub">${classData?.name || ""} · ${term} ${year}${row.roll ? ` · Roll ${row.roll}` : ""}</div>
      <div class="stats">
        <div class="stat">Overall<br/><b>${row.pct}%</b></div>
        <div class="stat">Grade<br/><b>${row.grade}</b></div>
        <div class="stat">Attendance<br/><b>${att != null ? `${att}%` : "—"}</b></div>
        <div class="stat">Rank<br/><b>${row.rank}</b></div>
      </div>
      <table><thead><tr><th>Subject</th><th>%</th><th>Grade</th></tr></thead><tbody>${rows || `<tr><td colspan="3">No marks recorded yet</td></tr>`}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (!w) { toast.error("Allow pop-ups to print the report card"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 250);
  }

  function printBatch() {
    const rows = visible.map(r => `<tr><td>${r.roll}</td><td>${r.name}</td><td>${r.pct}%</td><td>${r.grade}</td><td>${r.rank}</td><td>${r.status}</td></tr>`).join("");
    const html = `<!doctype html><html><head><title>${classData?.name || "Class"} — Report Card Summary</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
        th{background:#f1f5f9;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#475569}
      </style></head><body>
      <h1>${classData?.name || "Class"} — Report Card Summary</h1>
      <div class="sub">${term} ${year} · ${visible.length} students</div>
      <table><thead><tr><th>Roll</th><th>Student</th><th>%</th><th>Grade</th><th>Rank</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Allow pop-ups to print"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all">
            <CardContent className="p-5 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}><k.icon style={{ color: k.hex, width: 22, height: 22 }} /></div>
              <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">{k.label}</p><p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{k.value}</p><p className="text-[11px] text-slate-400 truncate">{k.sub}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* Report cards table */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="font-bold text-lg text-slate-900">Report Cards <span className="text-slate-400 font-semibold">({total})</span></p>
            <div className="flex items-center gap-2.5">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search students..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 rounded-xl border-slate-200 h-10 w-[200px]" /></div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] rounded-xl border-slate-200 h-10"><div className="flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" /><SelectValue /></div></SelectTrigger>
                <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="generated">Generated</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
              </Select>
              <Button className="rounded-xl gap-2 font-semibold text-white h-10" style={{ background: C.primary }} onClick={handleGenerateAll}><FileCheck className="w-4 h-4" /> Generate All</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-y border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="text-left px-5 py-3.5 min-w-[180px]">Student</th>
                  <th className="text-center px-3 py-3.5">Roll No</th>
                  <th className="text-center px-3 py-3.5">Overall %</th>
                  <th className="text-center px-3 py-3.5">Grade</th>
                  <th className="text-center px-3 py-3.5">Rank</th>
                  <th className="text-center px-3 py-3.5">Status</th>
                  <th className="text-center px-3 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingSources ? (
                  <tr><td colSpan={7} className="py-12 text-center text-slate-400 text-sm">Loading marks…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-slate-400 text-sm">No students match this filter.</td></tr>
                ) : pageRows.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3"><div className="flex items-center gap-2.5"><Avatar className="w-8 h-8"><AvatarFallback className="text-[10px] font-bold text-white" style={{ background: C.secondary }}>{initials(r.name)}</AvatarFallback></Avatar><span className="font-semibold text-slate-800">{r.name}</span></div></td>
                    <td className="px-3 py-3 text-center text-slate-500">{r.roll}</td>
                    <td className="px-3 py-3 text-center">{r.hasMarks ? <span className="text-sm font-black" style={{ color: gradeColor(r.pct) }}>{r.pct}%</span> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 text-center">{r.hasMarks ? <span className="text-xs font-black px-2 py-1 rounded-md" style={{ color: gradeColor(r.pct), background: `${gradeColor(r.pct)}18` }}>{r.grade}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 text-center">{r.hasMarks ? (r.rank <= 3 ? <Medal className="w-4 h-4 inline" style={{ color: r.rank === 1 ? "#F59E0B" : r.rank === 2 ? "#94A3B8" : "#D97706" }} /> : <span className="text-xs font-bold text-slate-400">{r.rank}</span>) : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 text-center"><Badge className={cn("text-[10px] font-bold rounded-md border", statusStyle[r.status])}>{r.status}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-violet-200" onClick={() => setViewRow(r)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-violet-200" onClick={() => printRow(r)}><Download className="w-3.5 h-3.5" /></Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem disabled={r.status === "Published"} onClick={() => handleSendToParent(r)}><Send className="w-4 h-4 mr-2" /> Send to Parent</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => printRow(r)}><Printer className="w-4 h-4 mr-2" /> Print</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!r.hasMarks} onClick={() => handleRegenerate(r)}><FileCheck className="w-4 h-4 mr-2" /> Regenerate</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <span className="text-sm text-slate-400 font-medium">Showing {visible.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, visible.length)} of {visible.length} report cards</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="icon" className="h-8 w-8 rounded-lg text-white" style={{ background: C.primary }}>{page}</Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Grade Distribution */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Grade Distribution</p>
              {dist.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No marks recorded yet.</p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dist} dataKey="value" innerRadius={36} outerRadius={54} paddingAngle={2} stroke="none">{dist.map((d, i) => <Cell key={i} fill={d.hex} />)}</Pie></PieChart></ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-black text-slate-900 leading-none">{gradedRows.length}</span><span className="text-[9px] text-slate-400 font-semibold">Students</span></div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {dist.map(d => (<div key={d.name} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="w-2 h-2 rounded-full" style={{ background: d.hex }} />{d.name}</span><span className="font-bold text-slate-700">{d.value}</span></div>))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Quick Actions</p>
              <div className="space-y-1.5">
                {[
                  { label: "Generate All Report Cards", icon: FileCheck, run: handleGenerateAll },
                  { label: "Publish to Parents", icon: Send, run: handlePublishAllGenerated },
                  { label: "Print Batch (visible)", icon: Printer, run: printBatch },
                ].map(a => (
                  <button key={a.label} onClick={a.run} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors group">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${C.primary}12` }}><a.icon className="w-3.5 h-3.5" style={{ color: C.primary }} /></span>{a.label}<ChevronRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-slate-400" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights — computed, not canned */}
          <Card className="border-none shadow-sm rounded-2xl overflow-hidden" style={{ background: "#F5F1FF" }}>
            <CardContent className="p-5">
              <div className="flex items-center gap-1.5 mb-3"><Sparkles className="w-4 h-4" style={{ color: C.primary }} /><p className="font-bold text-sm" style={{ color: C.primary }}>Insights</p></div>
              <ul className="space-y-2 text-[11px] text-slate-600">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.primary }} />{published} report card{published === 1 ? "" : "s"} published to parents.</li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.primary }} />{pending} pending — not generated yet.</li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.primary }} />{avg != null ? `Class average is ${avg}% this term.` : "No marks recorded yet this term."}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* View report card */}
      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{viewRow?.name} — Report Card</DialogTitle>
            <DialogDescription>{classData?.name} · {term} {year}{viewRow?.roll ? ` · Roll ${viewRow.roll}` : ""}</DialogDescription>
          </DialogHeader>
          {viewRow && (
            <>
              <div className="grid grid-cols-4 gap-3 mb-2">
                {[
                  { label: "Overall", value: viewRow.hasMarks ? `${viewRow.pct}%` : "—" },
                  { label: "Grade", value: viewRow.hasMarks ? viewRow.grade : "—" },
                  { label: "Attendance", value: attendancePctFor(viewRow.id) != null ? `${attendancePctFor(viewRow.id)}%` : "—" },
                  { label: "Rank", value: viewRow.hasMarks ? viewRow.rank : "—" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                    <p className="text-lg font-black mt-1 text-slate-800">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-[300px] overflow-y-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <tr><th className="text-left px-4 py-2">Subject</th><th className="text-center px-3 py-2">%</th><th className="text-center px-3 py-2">Grade</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {viewRow.subjects.filter(s => s.hasData).length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-6 text-slate-400 text-xs">No marks recorded yet</td></tr>
                    ) : viewRow.subjects.filter(s => s.hasData).map(s => (
                      <tr key={s.subject}>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{s.subject}</td>
                        <td className="px-3 py-2.5 text-center font-bold" style={{ color: gradeColor(s.percentage) }}>{Math.round(s.percentage)}%</td>
                        <td className="px-3 py-2.5 text-center"><span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{s.letter}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setViewRow(null)}>Close</Button>
            {viewRow && <Button className="rounded-xl text-white font-bold gap-2" style={{ background: C.primary }} onClick={() => printRow(viewRow)}><Printer className="w-4 h-4" /> Print</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
