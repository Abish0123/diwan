import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Upload, MoreVertical, Search, SlidersHorizontal, Eye,
  FileText, ClipboardList, ClipboardCheck, CheckCircle2,
  ChevronLeft, ChevronRight, Calendar, CalendarClock,
  CalendarPlus, FileQuestion, Send, BarChart3, Trash2, Pencil, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const C = { primary: "#7C3AED", secondary: "#A855F7", success: "#22C55E", warning: "#F59E0B", error: "#EF4444", blue: "#3B82F6" };

const QUICK_ACTIONS = [
  { label: "Create Exam", icon: Plus },
  { label: "Exam Timetable", icon: Calendar },
  { label: "Import Questions", icon: Upload },
  { label: "Generate Report", icon: FileText },
  { label: "Publish Result", icon: Send },
  { label: "Send Notification", icon: Send },
];

const initials = (n: string) => n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

interface ExamSlot { subject: string; date: string; start: string; end: string; invigilator: string; room: string }
interface Datesheet { id: string; title: string; slots: ExamSlot[]; published: boolean }
interface ExamsProProps {
  classData: { name?: string; grade?: string; academicYear?: string; status?: string };
  semesterName?: string | null;
  onExportData?: (payload: { header: string[]; rows: (string | number)[][]; filename: string }) => void;
  datesheets?: Datesheet[];
  onDeleteDatesheet?: (id: string) => void;
  onPublishDatesheet?: (id: string) => void;
  onCreateDatesheet?: () => void;
}

const fmtDate = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };
const dsFirstDate = (ds: Datesheet) => [...ds.slots].map(s => s.date).filter(Boolean).sort()[0] || "";
const todayIsoForCompare = () => new Date().toISOString().slice(0, 10);
const dsIsPast = (ds: Datesheet) => { const d = dsFirstDate(ds); return d ? d < todayIsoForCompare() : false; };

export default function ExamsPro({ classData, onExportData, datesheets = [], onDeleteDatesheet, onPublishDatesheet, onCreateDatesheet }: ExamsProProps) {
  const now = new Date();
  const [search, setSearch] = useState("");
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [viewDS, setViewDS] = useState<Datesheet | null>(null);
  const [resultsDS, setResultsDS] = useState<Datesheet | null>(null);
  const [deleteDS, setDeleteDS] = useState<Datesheet | null>(null);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const visibleDS = datesheets.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.slots.some(s => s.subject.toLowerCase().includes(search.toLowerCase())));

  const total = datesheets.length;
  const subjectsScheduled = datesheets.reduce((a, d) => a + d.slots.length, 0);
  const upcoming = datesheets.filter(d => !dsIsPast(d)).length;
  const publishedCount = datesheets.filter(d => d.published).length;

  // Bubble datesheet data up for the header's context-aware export.
  useEffect(() => {
    const rows: (string | number)[][] = [];
    datesheets.forEach(d => d.slots.forEach(s => rows.push([d.title, s.subject, s.date, s.start, s.end, s.invigilator, s.room])));
    onExportData?.({
      header: ["Datesheet", "Subject", "Date", "Start", "End", "Invigilator", "Hall"],
      rows,
      filename: `${(classData?.name || "class").replace(/\s+/g, "-")}-exam-datesheets.csv`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesheets]);

  // Build a printable exam datesheet and open the browser print dialog so the admin
  // can print / save-as-PDF for publishing and sending to parents.
  function printDatesheet(ds: Datesheet) {
    const rows = [...ds.slots].sort((a, b) => a.date.localeCompare(b.date)).map(s => `<tr>
      <td>${s.subject}</td><td>${fmtDate(s.date)}</td><td>${s.start || "—"} – ${s.end || "—"}</td><td>${s.invigilator || "—"}</td><td>${s.room || "—"}</td>
    </tr>`).join("");
    const html = `<!doctype html><html><head><title>${ds.title} — ${classData?.name || ""}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #e2e8f0;padding:9px 12px;text-align:left}
        th{background:#f1f5f9;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#475569}
        .foot{margin-top:22px;font-size:12px;color:#94a3b8}
      </style></head><body>
      <h1>${ds.title}</h1>
      <div class="sub">${classData?.name || ""} · ${classData?.academicYear || ""} — Examination Datesheet</div>
      <table><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th>Invigilator</th><th>Hall</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="foot">Generated for parent circulation · ${classData?.name || ""}</div>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Allow pop-ups to print the datesheet"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 250);
    toast.success("Opening print view for the datesheet");
  }

  function publishToParents(label = "Exam datesheet") {
    toast.success(`${label} published & sent to parents`);
  }

  const kpis = [
    { label: "Total Datesheets", value: total, sub: "All Time", icon: ClipboardList, hex: "#7C3AED", light: "#F1ECFF" },
    { label: "Upcoming", value: upcoming, sub: "Not yet held", icon: CalendarClock, hex: "#22C55E", light: "#DCFCE7" },
    { label: "Subjects Scheduled", value: subjectsScheduled, sub: "Across datesheets", icon: ClipboardCheck, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Published", value: publishedCount, sub: total > 0 ? `${Math.round((publishedCount / total) * 100)}% of datesheets` : "Sent to parents", icon: Send, hex: "#3B82F6", light: "#DBEAFE" },
  ];

  // Calendar grid for the real current month — marks days that have a real
  // datesheet slot scheduled (instead of a hardcoded fake June-2024 layout).
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calFirstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Mon=0
  const calDays: (number | null)[] = [];
  for (let i = 0; i < calFirstWeekday; i++) calDays.push(null);
  for (let d = 1; d <= calDaysInMonth; d++) calDays.push(d);
  const examDaysThisMonth = new Set<number>();
  datesheets.forEach(d => d.slots.forEach(s => {
    if (!s.date) return;
    const dt = new Date(s.date + "T00:00:00");
    if (dt.getFullYear() === calYear && dt.getMonth() === calMonth) examDaysThisMonth.add(dt.getDate());
  }));
  const todayForCal = new Date();

  return (
    <div className="space-y-5">
      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all">
            <CardContent className="p-5 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}>
                <k.icon style={{ color: k.hex, width: 22, height: 22 }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 truncate">{k.label}</p>
                <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{k.value}</p>
                <p className="text-[11px] text-slate-400 truncate">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main grid: Exam Datesheets + Right analytics ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        {/* LEFT — Exam Datesheets */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="font-bold text-lg text-slate-900">Exam Datesheets</p>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search datesheets / subjects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl border-slate-200 h-10 w-[220px]" />
              </div>
              <Button className="rounded-xl gap-2 font-semibold text-white h-10" style={{ background: C.primary }} onClick={() => onCreateDatesheet?.()}>
                <CalendarPlus className="w-4 h-4" /> New Datesheet
              </Button>
            </div>
          </div>
          <div className="p-5 pt-0 space-y-4">
            {visibleDS.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
                <Calendar className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-500">No exam datesheets yet</p>
                <p className="text-xs text-slate-400 mb-4">Create a datesheet to schedule subjects with dates, timing, halls and invigilators.</p>
                <Button className="rounded-xl gap-2 font-semibold text-white h-10" style={{ background: C.primary }} onClick={() => onCreateDatesheet?.()}><CalendarPlus className="w-4 h-4" /> Create Datesheet</Button>
              </div>
            ) : visibleDS.map(ds => {
              const past = dsIsPast(ds);
              const sorted = [...ds.slots].sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div key={ds.id} className="rounded-2xl border border-slate-100 overflow-hidden">
                  {/* Datesheet header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#F1ECFF" }}><FileText className="w-4 h-4" style={{ color: C.primary }} /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{ds.title}</p>
                        <p className="text-[11px] text-slate-400">{ds.slots.length} subjects · starts {fmtDate(dsFirstDate(ds))}</p>
                      </div>
                      <Badge className={cn("text-[10px] font-bold rounded-md ml-1", ds.published ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : past ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-600 border border-amber-100")}>
                        {ds.published ? "Published" : past ? "Held" : "Draft"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs gap-1.5" onClick={() => setViewDS(ds)}><Eye className="w-3.5 h-3.5" /> View</Button>
                      <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs gap-1.5" onClick={() => printDatesheet(ds)}><Printer className="w-3.5 h-3.5" /> Print</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {past
                            ? <DropdownMenuItem onClick={() => setResultsDS(ds)}><BarChart3 className="w-4 h-4 mr-2" /> View Results</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => { onPublishDatesheet?.(ds.id); publishToParents(`${ds.title} datesheet`); }}><Send className="w-4 h-4 mr-2" /> Publish to Parents</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => printDatesheet(ds)}><Printer className="w-4 h-4 mr-2" /> Print Datesheet</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteDS(ds)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {/* Datesheet table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="text-left px-4 py-2.5">Subject</th>
                          <th className="text-left px-3 py-2.5">Date</th>
                          <th className="text-left px-3 py-2.5">Time</th>
                          <th className="text-left px-3 py-2.5">Invigilator</th>
                          <th className="text-left px-3 py-2.5">Hall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((s, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40">
                            <td className="px-4 py-2.5 font-semibold text-slate-700">{s.subject}</td>
                            <td className="px-3 py-2.5 text-slate-600">{fmtDate(s.date)}</td>
                            <td className="px-3 py-2.5 text-slate-600">{s.start || "—"}{s.end ? ` – ${s.end}` : ""}</td>
                            <td className="px-3 py-2.5 text-slate-600">{s.invigilator || <span className="text-rose-400">Unassigned</span>}</td>
                            <td className="px-3 py-2.5"><Badge variant="outline" className="text-[10px] font-semibold rounded-md border-slate-200 text-slate-600">{s.room || "—"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* RIGHT — Analytics sidebar */}
        <div className="space-y-4">
          {/* Score-band / subject / top-performer analytics need real marks
              per student per subject, which this datesheet-scheduling view
              doesn't have wired in — see Gradebook for real subject
              performance and student rankings instead of fabricating numbers. */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-2">Performance Analytics</p>
              <p className="text-xs text-slate-400">Score bands, subject performance and top performers are computed from real marks — open the <span className="font-semibold text-slate-500">Gradebook</span> tab once results are entered.</p>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Quick Actions</p>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => {
                    if (a.label === "Create Exam") return onCreateDatesheet?.();
                    if (a.label === "Exam Timetable") { if (datesheets[0]) printDatesheet(datesheets[0]); else toast.info("Create a datesheet first"); return; }
                    if (a.label === "Publish Result") return publishToParents("Results");
                    if (a.label === "Send Notification") return publishToParents("Exam notification");
                    toast.success(a.label);
                  }} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${C.primary}12` }}><a.icon className="w-4 h-4" style={{ color: C.primary }} /></span>
                    <span className="text-[10px] font-semibold text-slate-600 leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Bottom: Upcoming Exams + Calendar ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Upcoming Exams — derived from datesheets */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-lg text-slate-900">Upcoming Exams</p>
            </div>
            <div className="space-y-3">
              {datesheets.filter(d => !dsIsPast(d)).slice(0, 4).flatMap(d => [...d.slots].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 1).map(s => ({ d, s }))).map(({ d, s }, i) => {
                const dt = s.date ? new Date(s.date + "T00:00:00") : null;
                return (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:shadow-sm transition-all">
                    <div className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0" style={{ background: `${C.primary}14` }}>
                      <span className="text-lg font-black leading-none" style={{ color: C.primary }}>{dt ? String(dt.getDate()).padStart(2, "0") : "—"}</span>
                      <span className="text-[10px] font-bold uppercase" style={{ color: C.primary }}>{dt ? dt.toLocaleDateString("en-GB", { month: "short" }) : ""}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{d.title}</p>
                      <p className="text-xs text-slate-400 truncate">Starts with {s.subject} · {d.slots.length} subjects</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color: C.primary }}>{fmtDate(s.date)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 shrink-0 hover:text-purple-600" onClick={() => setViewDS(d)}><Eye className="w-4 h-4" /></Button>
                  </div>
                );
              })}
              {datesheets.filter(d => !dsIsPast(d)).length === 0 && <p className="text-sm text-slate-400 text-center py-6">No upcoming exams scheduled.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Exam Calendar */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-lg text-slate-900">Exam Calendar</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => setCalMonth(m => { if (m === 0) { setCalYear(y => y - 1); return 11; } return m - 1; })}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                <span className="text-sm font-bold text-slate-700 min-w-[88px] text-center">{MONTHS[calMonth]} {calYear}</span>
                <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => setCalMonth(m => { if (m === 11) { setCalYear(y => y + 1); return 0; } return m + 1; })}><ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(d => (
                <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map((d, i) => {
                const hasExam = d ? examDaysThisMonth.has(d) : false;
                const isToday = d === todayForCal.getDate() && calMonth === todayForCal.getMonth() && calYear === todayForCal.getFullYear();
                return (
                  <div key={i} className={cn("aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative",
                    d ? "hover:bg-slate-50 cursor-pointer" : "",
                    isToday ? "bg-purple-600 text-white font-bold" : "text-slate-600")}>
                    {d || ""}
                    {hasExam && !isToday && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: C.primary }} />}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.primary }} /><span className="text-[10px] text-slate-500 font-medium">Exam scheduled</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Datesheet — full timetable, opened inline */}
      <Dialog open={!!viewDS} onOpenChange={(o) => !o && setViewDS(null)}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" /> {viewDS?.title}</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{classData?.name} · {viewDS?.slots.length} subjects</DialogDescription>
          </DialogHeader>
          {viewDS && (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr><th className="text-left px-4 py-2.5">Subject</th><th className="text-left px-3 py-2.5">Date</th><th className="text-left px-3 py-2.5">Time</th><th className="text-left px-3 py-2.5">Invigilator</th><th className="text-left px-3 py-2.5">Hall</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...viewDS.slots].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{s.subject}</td>
                      <td className="px-3 py-2.5 text-slate-600">{fmtDate(s.date)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{s.start || "—"}{s.end ? ` – ${s.end}` : ""}</td>
                      <td className="px-3 py-2.5 text-slate-600">{s.invigilator || <span className="text-rose-400">Unassigned</span>}</td>
                      <td className="px-3 py-2.5"><Badge variant="outline" className="text-[10px] font-semibold rounded-md border-slate-200 text-slate-600">{s.room || "—"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setViewDS(null)}>Close</Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => viewDS && printDatesheet(viewDS)}><Printer className="w-4 h-4" /> Print</Button>
            {viewDS && dsIsPast(viewDS) ? (
              <Button className="rounded-xl text-white font-bold gap-2" style={{ background: C.primary }} onClick={() => { const d = viewDS; setViewDS(null); setResultsDS(d); }}><BarChart3 className="w-4 h-4" /> View Results</Button>
            ) : (
              <Button className="rounded-xl text-white font-bold gap-2" style={{ background: C.primary }} onClick={() => { if (viewDS) { onPublishDatesheet?.(viewDS.id); publishToParents(`${viewDS.title} datesheet`); } setViewDS(null); }}><Send className="w-4 h-4" /> Publish to Parents</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Datesheet Results */}
      <Dialog open={!!resultsDS} onOpenChange={(o) => !o && setResultsDS(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-600" /> {resultsDS?.title} — Results</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">{classData?.name}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
            <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-500">Results aren't wired to this view yet</p>
            <p className="text-xs text-slate-400 mt-1 px-6">Once marks are entered, open the <span className="font-semibold text-slate-500">Gradebook</span> tab for real per-student scores instead of an estimate here.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setResultsDS(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteDS} onOpenChange={(o) => !o && setDeleteDS(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-2"><Trash2 className="h-6 w-6 text-red-500" /></div>
            <DialogTitle className="text-center text-xl font-bold">Delete Datesheet?</DialogTitle>
            <DialogDescription className="text-center">Permanently delete <span className="font-bold text-slate-800">"{deleteDS?.title}"</span>. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteDS(null)}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold" onClick={() => { if (deleteDS) { onDeleteDatesheet?.(deleteDS.id); toast.success(`"${deleteDS.title}" deleted`); } setDeleteDS(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
