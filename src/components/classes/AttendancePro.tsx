import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Users, CalendarDays, CalendarClock, UserX,
  Calendar, Sparkles, CheckSquare, Download, CheckCheck,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

const C = { primary: "#7C3AED", secondary: "#A855F7", success: "#22C55E", warning: "#F59E0B", error: "#EF4444", blue: "#3B82F6" };

type Status = "Present" | "Absent" | "Late" | "Leave";
const STATUS_CYCLE: Status[] = ["Present", "Absent", "Late", "Leave"];

const STATUS_STYLE: Record<Status, string> = {
  Present: "bg-emerald-50 text-emerald-600",
  Absent: "bg-rose-50 text-rose-600",
  Late: "bg-amber-50 text-amber-600",
  Leave: "bg-blue-50 text-purple-600",
};

const initials = (n: string) => (n || "?").split(" ").map(p => p[0] || "").join("").slice(0, 2).toUpperCase();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface AttendanceStudent {
  id: string;
  name: string;
  classId?: string;
  section?: string;
  sectionName?: string;
  rollNumber?: string | number;
}

interface AttendanceProProps {
  classData: { name?: string; grade?: string };
  students: AttendanceStudent[];
  sections?: { letter: string; classId: string }[];
  semesterName?: string | null;
  markOpen?: boolean;
  onMarkOpenChange?: (open: boolean) => void;
  onExportData?: (payload: { header: string[]; rows: (string | number)[][]; filename: string }) => void;
}

// A row in the attendance table: a real student + today's (or the selected
// date's) status, joined from the `attendance` collection by entityId.
interface Row {
  id: string; name: string; roll: string | number; status: Status | null; classId?: string;
}

export default function AttendancePro(props: AttendanceProProps) {
  const today = new Date();
  const [selected, setSelected] = useState(today.getDate());
  const [monthIdx, setMonthIdx] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [sectionFilter, setSectionFilter] = useState<string>("All");

  const [dailySearch, setDailySearch] = useState("");
  const [dailyFilter, setDailyFilter] = useState<"All" | Status>("All");

  // Real attendance records for these students — refetched whenever the
  // student roster changes; refreshed again after every save.
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [saving, setSaving] = useState(false);
  async function refreshAttendance() {
    setLoadingAttendance(true);
    try {
      const rows = await smartDb.getAll("attendance");
      setAttendanceRows(Array.isArray(rows) ? rows : []);
    } catch {
      setAttendanceRows([]);
    } finally {
      setLoadingAttendance(false);
    }
  }
  useEffect(() => { refreshAttendance(); }, []);

  const students = useMemo(
    () => sectionFilter === "All" ? props.students : props.students.filter(s => s.classId === sectionFilter),
    [props.students, sectionFilter]
  );

  const isoSelected = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`;
  const dayName = useMemo(() => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(year, monthIdx, selected).getDay()], [year, monthIdx, selected]);
  const selectedLabel = `${selected} ${MONTHS[monthIdx]} ${year}`;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Rows for the selected date — real status if a record exists for this
  // student on this date, else null (never marked yet).
  const rows: Row[] = useMemo(() => students.map((s, i) => {
    const rec = attendanceRows.find((r: any) => r.entityType === "student" && String(r.entityId) === s.id && r.date === isoSelected);
    return { id: s.id, name: s.name, roll: s.rollNumber ?? i + 1, status: (rec?.status as Status) ?? null, classId: s.classId };
  }), [students, attendanceRows, isoSelected]);

  const [draft, setDraft] = useState<Record<string, Status>>({});
  const markOpen = props.markOpen ?? false;
  const setMarkOpen = (o: boolean) => props.onMarkOpenChange?.(o);
  useEffect(() => {
    if (markOpen) setDraft(Object.fromEntries(rows.map(r => [r.id, r.status || "Present"])) as Record<string, Status>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markOpen]);

  // Bubble real attendance data up for the header's context-aware export.
  useEffect(() => {
    props.onExportData?.({
      header: ["Roll", "Name", "Status"],
      rows: rows.map(r => [r.roll, r.name, r.status || "Not marked"]),
      filename: `${(props.classData?.name || "class").replace(/\s+/g, "-")}-attendance-${isoSelected}.csv`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function persistStatuses(entries: { studentId: string; status: Status }[], date: string) {
    setSaving(true);
    try {
      await Promise.all(entries.map(({ studentId, status }) => {
        const s = students.find(st => st.id === studentId);
        const rec = {
          id: `ATT-STU-${studentId}-${date}`,
          entityId: studentId,
          entityType: "student",
          name: s?.name || "",
          class: props.classData?.name || "",
          status,
          date,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          createdAt: new Date().toISOString(),
        };
        return smartDb.create("attendance", rec, rec.id);
      }));
      await refreshAttendance();
    } finally {
      setSaving(false);
    }
  }

  function setStatus(studentId: string, status: Status) {
    persistStatuses([{ studentId, status }], isoSelected).then(() => toast.success("Attendance updated"));
  }

  function handleBulkPresent() {
    persistStatuses(students.map(s => ({ studentId: s.id, status: "Present" as Status })), isoSelected)
      .then(() => toast.success("All students marked Present"));
  }

  function handleExportReport() {
    const lines = ["Roll,Name,Status", ...rows.map(r => `${r.roll},${r.name},${r.status || "Not marked"}`)];
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n"));
    a.download = `attendance-${selectedLabel.replace(/ /g, "-")}.csv`;
    a.click();
    toast.success("Attendance report downloaded");
  }

  // ── Real, period-based attendance percentages (present+late/2 over marked days) ──
  function pctForRange(fromIso: string, toIso: string): number | null {
    const relevant = attendanceRows.filter((r: any) =>
      r.entityType === "student" && students.some(s => s.id === String(r.entityId)) &&
      String(r.date || "") >= fromIso && String(r.date || "") <= toIso
    );
    if (relevant.length === 0) return null;
    const score = relevant.reduce((a: number, r: any) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
    return Math.round((score / relevant.length) * 100);
  }
  const isoDaysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const monthStartIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  const todayPct = pctForRange(todayIso, todayIso);
  const weekPct = pctForRange(isoDaysAgo(6), todayIso);
  const monthPct = pctForRange(monthStartIso, todayIso);
  const todayRows = attendanceRows.filter((r: any) => r.entityType === "student" && students.some(s => s.id === String(r.entityId)) && r.date === todayIso);
  const todayPresentCount = todayRows.filter((r: any) => r.status === "Present" || r.status === "Late").length;
  const monthRows = attendanceRows.filter((r: any) => r.entityType === "student" && students.some(s => s.id === String(r.entityId)) && String(r.date || "") >= monthStartIso);
  const totalAbsencesThisMonth = monthRows.filter((r: any) => r.status === "Absent").length;

  const kpis = [
    { label: "Today's Attendance", value: todayPct != null ? `${todayPct}%` : "—", sub: todayRows.length ? `${todayPresentCount} / ${todayRows.length} Present` : "Not marked yet", subHex: C.primary, icon: Users, hex: "#7C3AED", light: "#F1ECFF" },
    { label: "This Week (Avg.)", value: weekPct != null ? `${weekPct}%` : "—", sub: weekPct != null ? "Last 7 days" : "No records yet", subHex: C.success, icon: CalendarDays, hex: "#22C55E", light: "#DCFCE7" },
    { label: "This Month (Avg.)", value: monthPct != null ? `${monthPct}%` : "—", sub: monthPct != null ? "Month to date" : "No records yet", subHex: C.warning, icon: CalendarClock, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Total Absences", value: totalAbsencesThisMonth, sub: "This Month", icon: UserX, hex: "#EF4444", light: "#FEE2E2" },
  ];

  const counts = {
    Present: rows.filter(r => r.status === "Present").length,
    Absent: rows.filter(r => r.status === "Absent").length,
    Late: rows.filter(r => r.status === "Late").length,
    Leave: rows.filter(r => r.status === "Leave").length,
    NotMarked: rows.filter(r => r.status === null).length,
  };
  const markedTotal = rows.length - counts.NotMarked;
  const breakdownData = [
    { label: "Present", value: counts.Present, hex: "#22C55E" },
    { label: "Late", value: counts.Late, hex: "#F59E0B" },
    { label: "Absent", value: counts.Absent, hex: "#EF4444" },
    { label: "Leave", value: counts.Leave, hex: "#3B82F6" },
  ].filter(b => b.value > 0);
  const todayAvgPct = markedTotal > 0 ? Math.round(((counts.Present + counts.Late * 0.5) / markedTotal) * 100) : null;

  const visibleRows = rows.filter(r =>
    (dailyFilter === "All" || r.status === dailyFilter) &&
    (r.name.toLowerCase().includes(dailySearch.toLowerCase()) || String(r.roll).includes(dailySearch)));

  // ── Real per-student monthly stats — late arrivals + at-risk (attendance < 85%) ──
  const perStudentMonthly = useMemo(() => {
    return students.map(s => {
      const own = monthRows.filter((r: any) => String(r.entityId) === s.id);
      const lateCount = own.filter((r: any) => r.status === "Late").length;
      const absentCount = own.filter((r: any) => r.status === "Absent").length;
      const score = own.reduce((a: number, r: any) => a + (r.status === "Present" ? 1 : r.status === "Late" ? 0.5 : 0), 0);
      const pct = own.length > 0 ? Math.round((score / own.length) * 100) : null;
      return { id: s.id, name: s.name, lateCount, absentCount, pct, marked: own.length };
    });
  }, [students, monthRows]);
  const lateArrivals = perStudentMonthly.filter(s => s.lateCount > 0).sort((a, b) => b.lateCount - a.lateCount);
  const atRisk = perStudentMonthly.filter(s => s.pct != null && s.pct < 85).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

  const [lateOpen, setLateOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);

  const insights: string[] = [];
  if (todayAvgPct != null) insights.push(`${todayAvgPct}% of students marked present today.`);
  if (atRisk.length > 0) insights.push(`${atRisk.length} student${atRisk.length === 1 ? "" : "s"} below 85% attendance this month.`);
  if (lateArrivals.length > 0) insights.push(`${lateArrivals.length} student${lateArrivals.length === 1 ? "" : "s"} recorded a late arrival this month.`);
  if (insights.length === 0) insights.push("Not enough attendance records yet to generate insights.");

  return (
    <div className="space-y-5">
      {props.sections && props.sections.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Section</span>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Filter by section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Sections</SelectItem>
              {props.sections.map(s => <SelectItem key={s.classId} value={s.classId}>Section {s.letter}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all">
            <CardContent className="p-5 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}><k.icon style={{ color: k.hex, width: 22, height: 22 }} /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 truncate">{k.label}</p>
                <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{k.value}</p>
                <p className="text-[11px] font-semibold mt-0.5 truncate" style={{ color: k.subHex || "#94A3B8" }}>{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Daily Attendance — full-width, the focus of this tab ── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4 border-b border-slate-100">
          <div>
            <p className="font-bold text-lg text-slate-900 flex items-center gap-2">
              Daily Attendance
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-purple-600">{dayName}</span>
            </p>
            <p className="text-slate-400 font-medium text-xs mt-0.5">{selectedLabel} · {rows.length} students</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input type="date" value={isoSelected}
                onChange={e => { const [y, m, d] = e.target.value.split("-").map(Number); if (y) { setYear(y); setMonthIdx(m - 1); setSelected(d); } }}
                className="h-10 pl-8 pr-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
            <Button variant="outline" className="rounded-xl text-xs gap-1.5 font-semibold h-10" onClick={handleExportReport}><Download className="w-3.5 h-3.5" />Export</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-50/40 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["All", "Present", "Absent", "Late", "Leave"] as const).map(f => (
              <button key={f} onClick={() => setDailyFilter(f)}
                className={cn("text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors",
                  dailyFilter === f ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100")}>
                {f}{f !== "All" ? ` · ${counts[f as Status]}` : ` · ${rows.length}`}
              </button>
            ))}
          </div>
          <div className="relative">
            <input placeholder="Search student or roll…" value={dailySearch} onChange={e => setDailySearch(e.target.value)}
              className="h-9 w-56 max-w-full pl-3 pr-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="text-left px-5 py-3 w-10">#</th>
                <th className="text-left px-2 py-3 min-w-[180px]">Student</th>
                <th className="text-center px-2 py-3 min-w-[300px]">Mark Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingAttendance ? (
                <tr><td colSpan={3} className="py-12 text-center text-slate-400 text-sm">Loading attendance…</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={3} className="py-12 text-center text-slate-400 text-sm">No students match this filter.</td></tr>
              ) : visibleRows.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-violet-50/30 transition-colors">
                  <td className="px-5 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-8 h-8"><AvatarFallback className="text-[10px] font-bold text-white" style={{ background: C.secondary }}>{initials(r.name)}</AvatarFallback></Avatar>
                      <div><p className="text-sm font-semibold text-slate-700 leading-tight">{r.name}</p><p className="text-[10px] text-slate-400">Roll {r.roll}</p></div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {STATUS_CYCLE.map(st => (
                        <button key={st} disabled={saving} onClick={() => setStatus(r.id, st)}
                          className={cn("text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50",
                            r.status === st ? `${STATUS_STYLE[st]} border-transparent shadow-sm` : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50")}>
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">{counts.Present} Present</span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600">{counts.Absent} Absent</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600">{counts.Late} Late</span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-purple-600">{counts.Leave} Leave</span>
            {counts.NotMarked > 0 && <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500">{counts.NotMarked} Not Marked</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={saving} className="rounded-xl text-xs gap-1.5 font-semibold h-10" onClick={handleBulkPresent}><CheckCheck className="w-3.5 h-3.5" />Mark All Present</Button>
          </div>
        </div>
      </Card>

      {/* ── Secondary analytics row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Today's Breakdown */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <p className="font-bold text-slate-900 mb-3 text-sm">Breakdown <span className="text-[11px] text-slate-400 font-medium">({selectedLabel})</span></p>
            {breakdownData.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No attendance marked for this date yet.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="relative w-24 h-24 shrink-0">
                  <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={breakdownData} dataKey="value" innerRadius={30} outerRadius={46} paddingAngle={2} stroke="none">{breakdownData.map((b, i) => <Cell key={i} fill={b.hex} />)}</Pie></PieChart></ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-base font-black text-slate-900 leading-none">{todayAvgPct != null ? `${todayAvgPct}%` : "—"}</span><span className="text-[8px] text-slate-400">Average</span></div>
                </div>
                <div className="flex-1 space-y-1">
                  {breakdownData.map(b => (
                    <div key={b.label} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="w-2 h-2 rounded-full" style={{ background: b.hex }} />{b.label}</span><span className="font-bold text-slate-700">{b.value}</span></div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Late Arrivals */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <p className="font-bold text-slate-900 mb-3 text-sm">Late Arrivals <span className="text-[11px] text-slate-400 font-medium">(This Month)</span></p>
            {lateArrivals.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No late arrivals recorded this month.</p>
            ) : (
              <div className="space-y-3">
                {lateArrivals.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <Avatar className="w-7 h-7"><AvatarFallback className="text-[9px] font-bold text-white" style={{ background: C.secondary }}>{initials(a.name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-700 truncate">{a.name}</p><p className="text-[10px] text-slate-400">{a.lateCount} late arrival{a.lateCount === 1 ? "" : "s"}</p></div>
                  </div>
                ))}
              </div>
            )}
            {lateArrivals.length > 0 && <button className="text-[11px] font-semibold mt-3 hover:underline" style={{ color: C.primary }} onClick={() => setLateOpen(true)}>View All →</button>}
          </CardContent>
        </Card>

        {/* At Risk Students */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <p className="font-bold text-slate-900 mb-3 text-sm">At Risk Students</p>
            {atRisk.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No students below 85% attendance this month.</p>
            ) : (
              <div className="space-y-3">
                {atRisk.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <Avatar className="w-7 h-7"><AvatarFallback className="text-[9px] font-bold text-white" style={{ background: C.secondary }}>{initials(a.name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-700 truncate">{a.name}</p><p className="text-[10px] text-slate-400">Attendance: {a.pct}%</p></div>
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", (a.pct ?? 0) < 75 ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600")}>{(a.pct ?? 0) < 75 ? "High" : "Medium"}</span>
                  </div>
                ))}
              </div>
            )}
            {atRisk.length > 0 && <button className="text-[11px] font-semibold mt-3 hover:underline" style={{ color: C.primary }} onClick={() => setRiskOpen(true)}>View All →</button>}
          </CardContent>
        </Card>

        {/* Insights — computed, not canned */}
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden" style={{ background: "#F5F1FF" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-1.5 mb-3"><Sparkles className="w-4 h-4" style={{ color: C.primary }} /><p className="font-bold text-sm" style={{ color: C.primary }}>Insights</p></div>
            <ul className="space-y-2 text-[11px] text-slate-600">
              {insights.map((t, i) => <li key={i} className="flex items-start gap-1.5"><CheckSquare className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.primary }} />{t}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Late Arrivals dialog */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Late Arrivals — This Month</DialogTitle>
            <DialogDescription>{lateArrivals.reduce((s, l) => s + l.lateCount, 0)} late arrivals recorded across {lateArrivals.length} students.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[380px] overflow-y-auto">
            {lateArrivals.map(l => (
              <div key={l.id} className="p-4 border border-slate-100 rounded-xl flex items-center gap-3">
                <Avatar className="w-9 h-9"><AvatarFallback className="text-xs font-bold text-white" style={{ background: C.secondary }}>{initials(l.name)}</AvatarFallback></Avatar>
                <div className="flex-1"><p className="font-bold text-slate-800">{l.name}</p><p className="text-xs text-slate-400">{l.lateCount} late arrival{l.lateCount === 1 ? "" : "s"} this month</p></div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-600">{l.lateCount}×</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLateOpen(false)} className="rounded-xl">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* At Risk dialog */}
      <Dialog open={riskOpen} onOpenChange={setRiskOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">At Risk Students</DialogTitle>
            <DialogDescription>Students with attendance below 85% this month.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {atRisk.map(a => (
              <div key={a.id} className="p-4 border border-slate-100 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-9 h-9"><AvatarFallback className="text-xs font-bold text-white" style={{ background: C.secondary }}>{initials(a.name)}</AvatarFallback></Avatar>
                  <div className="flex-1"><p className="font-bold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.absentCount} absence{a.absentCount === 1 ? "" : "s"} this month</p></div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", (a.pct ?? 0) < 75 ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600")}>{(a.pct ?? 0) < 75 ? "High" : "Medium"} Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${a.pct ?? 0}%`, background: (a.pct ?? 0) >= 85 ? C.success : (a.pct ?? 0) >= 75 ? C.warning : C.error }} />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-10 text-right">{a.pct ?? 0}%</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskOpen(false)} className="rounded-xl">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Take Attendance — opened by the page header "Mark Attendance" button */}
      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Take Attendance</DialogTitle>
            <DialogDescription>Mark each student for {selectedLabel} ({dayName}). Tap a status to set it.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-semibold text-slate-500">{rows.length} students</span>
            <button className="text-[11px] font-bold text-emerald-600 hover:underline"
              onClick={() => setDraft(Object.fromEntries(rows.map(r => [r.id, "Present"])) as Record<string, Status>)}>
              Mark all Present
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1.5">
            {rows.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-100">
                <Avatar className="w-7 h-7"><AvatarFallback className="text-[9px] font-bold text-white" style={{ background: C.secondary }}>{initials(r.name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                  <p className="text-[10px] text-slate-400">Roll {r.roll}</p>
                </div>
                <div className="flex items-center gap-1">
                  {STATUS_CYCLE.map(st => (
                    <button key={st} onClick={() => setDraft(d => ({ ...d, [r.id]: st }))}
                      className={cn("text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors",
                        draft[r.id] === st
                          ? `${STATUS_STYLE[st]} border-transparent ring-1 ring-offset-1 ring-slate-200`
                          : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50")}>
                      {st[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkOpen(false)} className="rounded-xl">Cancel</Button>
            <Button disabled={saving} className="rounded-xl text-white font-bold" style={{ background: C.primary }}
              onClick={async () => {
                const entries = rows.map(r => ({ studentId: r.id, status: draft[r.id] || r.status || "Present" }));
                await persistStatuses(entries, isoSelected);
                toast.success(`Attendance saved for ${selectedLabel}`);
                setMarkOpen(false);
              }}>
              <CheckCheck className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
