import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useLeave } from "@/contexts/LeaveContext";
import { LeaveRequest, LeaveType as LeaveTypeT } from "@/types";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  UserCheck, CheckCircle2, XCircle, Clock, TrendingUp,
  Calendar, ChevronLeft, ChevronRight, AlertTriangle,
  FileText, Upload, X, Check, Send, Wifi, WifiOff,
  LogIn, LogOut, Download, Eye, Trash2, CircleAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttStatus = "P" | "A" | "L" | "H"; // Present / Absent / Late / Half-Day

interface RFIDLog {
  time: string;
  type: "Entry" | "Exit";
  gate: string;
}

interface DayRecord {
  date: string;
  status: AttStatus | null;
  remarks?: string;
  rfid?: RFIDLog[];
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Leave types a student may request — all members of the shared LeaveType union so
// requests persist into the same `leave_requests` store the admin approval queue reads.
const LEAVE_TYPES: LeaveTypeT[] = ["Sick Leave","Family Emergency","Medical Appointment","Personal Leave","Other"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusMeta(s: AttStatus | null, isWeekend = false) {
  if (s === "P") return { label:"Present",   dot:"bg-emerald-500", badge:"bg-emerald-50 text-emerald-700 border-emerald-200", cell:"bg-emerald-500 text-white" };
  if (s === "A") return { label:"Absent",    dot:"bg-rose-500",    badge:"bg-rose-50 text-rose-700 border-rose-200",         cell:"bg-rose-500 text-white" };
  if (s === "L") return { label:"Late",      dot:"bg-amber-500",   badge:"bg-amber-50 text-amber-700 border-amber-200",      cell:"bg-amber-500 text-white" };
  if (s === "H") return { label:"Half-Day",  dot:"bg-blue-400",    badge:"bg-blue-50 text-blue-700 border-blue-200",         cell:"bg-blue-400 text-white" };
  if (isWeekend) return { label:"Weekend",   dot:"bg-slate-200",   badge:"bg-slate-50 text-slate-400 border-slate-200",      cell:"bg-slate-100 text-slate-400" };
  return           { label:"No Record", dot:"bg-slate-100",   badge:"bg-slate-50 text-slate-400 border-slate-100",      cell:"bg-white text-slate-300 border border-slate-100" };
}

function leaveStatusMeta(s: string) {
  if (s === "Pending")   return { cls:"bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "Approved")  return { cls:"bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "Rejected")  return { cls:"bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "Cancelled") return { cls:"bg-slate-100 text-slate-500 border-slate-200" };
  return { cls:"bg-slate-100 text-slate-500 border-slate-200" };
}

// RFID gate logs come from the biometric terminal integration. During pilot the feed
// is not yet connected, so we surface only what is actually persisted on the record
// (rec.rfid) — no fabricated entry/exit times.
function recordRFID(rec?: DayRecord): RFIDLog[] {
  return rec?.rfid ?? [];
}

// ─── CircularProgress ─────────────────────────────────────────────────────────

function CircularProgress({ percent }: { percent: number }) {
  const r = 46; const c = r * 2 * Math.PI;
  const color = percent >= 75 ? "#10b981" : percent >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="9" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (percent / 100) * c} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900" style={{ color }}>{percent}%</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rate</span>
      </div>
    </div>
  );
}

// ─── Tab: Attendance Records ──────────────────────────────────────────────────

// Builds a real CSV from the student's actual attendance records — no fake
// "downloading…" toast with nothing behind it.
function downloadAttendanceReport(records: DayRecord[], student: any) {
  if (!records.length) {
    toast.error("No attendance records to download yet.");
    return;
  }
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const rows = [
    ["Date", "Status", "Remarks"],
    ...sorted.map(r => [r.date, statusMeta(r.status).label, r.remarks || ""]),
  ];
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${(student?.name || "student").replace(/\s+/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("Attendance report downloaded.");
}

function RecordsTab({ records, student }: { records: DayRecord[]; student: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      {/* Download banner */}
      <div className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 text-violet-700 text-sm font-semibold">
          <FileText className="w-4 h-4" /> Attendance Records — {student?.name || "Student"}
        </div>
        <button onClick={() => downloadAttendanceReport(records, student)}
          className="flex items-center gap-1.5 text-xs text-purple-600 font-semibold hover:underline">
          <Download className="w-3.5 h-3.5" /> Download Report
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          No attendance records yet. Your daily presence will appear here once marked by the teacher.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">RFID Entry</th>
                  <th className="px-4 py-3 text-left">RFID Exit</th>
                  <th className="px-4 py-3 text-left">Remarks</th>
                  <th className="px-4 py-3 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(r => {
                  const rfid = recordRFID(r);
                  const entry = rfid.find(l => l.type === "Entry");
                  const exit  = rfid.find(l => l.type === "Exit");
                  const meta  = statusMeta(r.status);
                  const dateObj = new Date(r.date);
                  return (
                    <>
                      <tr key={r.date} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 text-xs">
                            {dateObj.toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", meta.badge)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {entry ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                              <LogIn className="w-3 h-3" /> {entry.time} · {entry.gate}
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {exit ? (
                            <div className="flex items-center gap-1.5 text-xs text-rose-500">
                              <LogOut className="w-3 h-3" /> {exit.time} · {exit.gate}
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{r.remarks || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setExpanded(expanded === r.date ? null : r.date)}
                            className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-purple-600 transition">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {expanded === r.date && (
                        <tr key={r.date + "-exp"}>
                          <td colSpan={6} className="px-6 py-4 bg-violet-50/50 border-b border-violet-100">
                            <div className="flex flex-wrap gap-6 text-xs">
                              <div>
                                <p className="font-bold text-slate-600 mb-1 uppercase tracking-wide text-[10px]">RFID Logs</p>
                                {rfid.length === 0 ? <p className="text-slate-400">No RFID data available</p> : rfid.map((l, i) => (
                                  <div key={i} className={cn("flex items-center gap-2 mb-1", l.type === "Entry" ? "text-emerald-600" : "text-rose-500")}>
                                    {l.type === "Entry" ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                                    <span className="font-semibold">{l.type}</span> · {l.time} · {l.gate}
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p className="font-bold text-slate-600 mb-1 uppercase tracking-wide text-[10px]">Teacher Remarks</p>
                                <p className="text-slate-500">{r.remarks || "No remarks from teacher."}</p>
                              </div>
                              {entry && exit && (
                                <div>
                                  <p className="font-bold text-slate-600 mb-1 uppercase tracking-wide text-[10px]">Duration</p>
                                  <p className="text-slate-500">
                                    {entry.time} → {exit.time}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Monthly Calendar ────────────────────────────────────────────────────

function MonthlyTab({ records, student }: { records: DayRecord[]; student: any }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<DayRecord | null>(null);

  const shiftMonth = (n: number) => {
    setSelectedDay(null);
    setViewMonth(p => {
      let m = p.month + n; let y = p.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const calendarDays = useMemo(() => {
    const totalDays = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    const s = student as any;
    return Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      const date = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const rec = records.find(r => r.date === date);
      const dateObj = new Date(viewMonth.year, viewMonth.month, day);
      const dow = dateObj.getDay();
      return { day, date, status: rec?.status || null, remarks: rec?.remarks, isWeekend: dow === 5 || dow === 6, dayLabel: dateObj.toLocaleDateString("en-US",{weekday:"short"}) };
    });
  }, [viewMonth, records, student]);

  const monthStats = useMemo(() => {
    const days = calendarDays.filter(d => !d.isWeekend);
    const p = days.filter(d => d.status === "P").length;
    const a = days.filter(d => d.status === "A").length;
    const l = days.filter(d => d.status === "L").length;
    const h = days.filter(d => d.status === "H").length;
    const total = p + a + l + h;
    const pct = total ? Math.round(((p + l * 0.5 + h * 0.5) / total) * 100) : 0;
    return { p, a, l, h, total, pct };
  }, [calendarDays]);

  const firstDay = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const eligibility = monthStats.pct >= 75;

  return (
    <div className="space-y-5">
      {/* Header with stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Present",   value:monthStats.p,    color:"text-emerald-600 bg-emerald-50" },
          { label:"Absent",    value:monthStats.a,    color:"text-rose-600 bg-rose-50" },
          { label:"Late",      value:monthStats.l,    color:"text-amber-600 bg-amber-50" },
          { label:"Half-Day",  value:monthStats.h,    color:"text-purple-600 bg-blue-50" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black", k.color)}>
              {k.value}
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Eligibility banner */}
      <div className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-semibold",
        eligibility
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-rose-50 border-rose-200 text-rose-700")}>
        {eligibility ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
        <div>
          <span className="font-black">{monthStats.pct}% attendance</span> this month —{" "}
          {eligibility
            ? "Eligibility requirement met (≥ 75%)"
            : "Below 75% school eligibility requirement. Risk of losing exam eligibility."}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-500" />
            <h3 className="font-bold text-slate-900">Monthly Attendance Calendar</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-sm font-bold text-slate-800 min-w-[140px] text-center">
              {MONTHS[viewMonth.month]} {viewMonth.year}
            </span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="p-5">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Offset for first day */}
            {Array.from({ length: firstDay }, (_, i) => <div key={`off-${i}`} />)}
            {calendarDays.map(d => {
              const meta = statusMeta(d.status, d.isWeekend);
              return (
                <motion.button key={d.date} whileHover={{ scale: 1.05 }}
                  onClick={() => setSelectedDay(selectedDay?.date === d.date ? null : d as any)}
                  className={cn("aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition",
                    d.status ? meta.cell : d.isWeekend ? "bg-slate-50 text-slate-300" : "bg-white border border-slate-100 text-slate-500 hover:border-violet-200",
                    selectedDay?.date === d.date && "ring-2 ring-violet-400 ring-offset-1"
                  )}>
                  {d.day}
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-100">
            {[["P","bg-emerald-500","Present"],["A","bg-rose-500","Absent"],["L","bg-amber-500","Late"],["H","bg-blue-400","Half-Day"]].map(([k,c,l]) => (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold">
                <div className={cn("w-3 h-3 rounded-md",c)} />{l}
              </div>
            ))}
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <AnimatePresence>
              <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold mb-0.5">
                      {new Date(selectedDay.date).toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                    </p>
                    <p className="font-bold text-slate-900">
                      {statusMeta(selectedDay.status, (selectedDay as any).isWeekend).label}
                    </p>
                    {selectedDay.remarks && <p className="text-xs text-slate-500 mt-1">Remark: {selectedDay.remarks}</p>}
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border",
                    statusMeta(selectedDay.status).badge)}>
                    {statusMeta(selectedDay.status).label}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Leave Requests ──────────────────────────────────────────────────────

function dayCount(from: string, to: string) {
  if (!from || !to) return 0;
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
}

function LeaveTab({ student }: { student: any }) {
  const { user } = useAuth();
  const { leaves: allLeaves, loading, applyForLeave, updateLeaveStatus } = useLeave();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fromDate:"", toDate:"", leaveType:"Sick Leave" as LeaveTypeT, reason:"", docFile:"" });
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The context already scopes to the signed-in student's uid; keep only student-raised rows.
  const leaves = useMemo(
    () => allLeaves.filter(l => (l as any).category === "student"),
    [allLeaves]
  );

  const pending = leaves.filter(l => l.status === "Pending").length;
  const approved = leaves.filter(l => l.status === "Approved").length;

  const handleSubmit = async () => {
    if (!form.fromDate || !form.toDate || !form.reason) {
      toast.error("Please fill in all required fields");
      return;
    }
    const days = dayCount(form.fromDate, form.toDate);
    if (days <= 0) { toast.error("End date must be on or after start date"); return; }
    setSubmitting(true);
    try {
      await applyForLeave({
        staffId: student?.id || user?.uid || "",
        staffName: student?.name || user?.displayName || "Student",
        type: form.leaveType,
        startDate: form.fromDate,
        endDate: form.toDate,
        reason: form.reason,
        days,
        category: "student",
        ...(form.docFile ? { docFile: form.docFile } : {}),
      } as any);
      setForm({ fromDate:"", toDate:"", leaveType:"Sick Leave", reason:"", docFile:"" });
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    await updateLeaveStatus(id, "Cancelled");
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"Pending",  value:pending,                          color:"text-amber-600 bg-amber-50" },
          { label:"Approved", value:approved,                         color:"text-emerald-600 bg-emerald-50" },
          { label:"Total",    value:leaves.filter(l=>l.status!=="Cancelled").length, color:"text-purple-600 bg-violet-50" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-black", k.color)}>{k.value}</div>
            <p className="text-xs font-semibold text-slate-500">{k.label} Leaves</p>
          </div>
        ))}
      </div>

      {/* Apply button */}
      {!showForm && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
            <Send className="w-4 h-4" /> Apply for Leave
          </button>
        </div>
      )}

      {/* Application form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            className="bg-white rounded-2xl border border-violet-200 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-purple-600 to-purple-600 flex items-center justify-between">
              <h3 className="text-white font-bold">Apply for Leave</h3>
              <button onClick={() => setShowForm(false)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">From Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={form.fromDate} onChange={e=>setForm(f=>({...f,fromDate:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">To Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={form.toDate} onChange={e=>setForm(f=>({...f,toDate:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Leave Type <span className="text-rose-500">*</span></label>
                <select value={form.leaveType} onChange={e=>setForm(f=>({...f,leaveType:e.target.value as LeaveType}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                  {LEAVE_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason <span className="text-rose-500">*</span></label>
                <textarea rows={3} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
                  placeholder="Describe the reason for leave…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Supporting Document (Optional)</label>
                <div onClick={() => fileRef.current?.click()}
                  className={cn("border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition",
                    form.docFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-violet-300")}>
                  <input ref={fileRef} type="file" className="hidden" onChange={e => {
                    if (e.target.files?.[0]) setForm(f=>({...f,docFile:e.target.files![0].name}));
                  }} />
                  {form.docFile ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-600 text-xs">
                      <Check className="w-4 h-4" /> {form.docFile}
                      <button onClick={e=>{e.stopPropagation();setForm(f=>({...f,docFile:""}))}} className="text-rose-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <Upload className="w-4 h-4" /> Click to upload medical certificate or document
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Submit Request"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave history */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Leave History</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && (
            <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
          )}
          {!loading && leaves.length === 0 && (
            <div className="py-12 text-center text-slate-400">No leave requests yet. Use “Apply for Leave” above to submit one.</div>
          )}
          {!loading && leaves.map(l => {
            const meta = leaveStatusMeta(l.status);
            const d = l.days || dayCount(l.startDate, l.endDate);
            const days = d === 1 ? "1 day" : `${d} days`;
            return (
              <div key={l.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-900 text-sm">{l.type}</span>
                      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold border", meta.cls)}>{l.status}</span>
                      <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{days}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">
                      {l.startDate === l.endDate ? l.startDate : `${l.startDate} → ${l.endDate}`}
                    </p>
                    <p className="text-xs text-slate-600">{l.reason}</p>
                    {l.approverRemark && (
                      <p className="text-xs text-purple-600 mt-1.5 italic">
                        Teacher: "{l.approverRemark}"
                      </p>
                    )}
                    {l.docFile && (
                      <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {l.docFile}
                      </p>
                    )}
                    {l.appliedOn && <p className="text-[10px] text-slate-400 mt-1">Applied on {l.appliedOn}</p>}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {l.status === "Pending" && (
                      <button onClick={() => handleCancel(l.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workflow info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-2">Leave Approval Workflow</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
          {["You (Student)","→","Class Teacher","→","Principal (if extended)","→","Attendance Updated"].map((s,i)=>(
            <span key={i} className={s==="→" ? "text-blue-400" : "font-semibold bg-blue-100 px-2 py-0.5 rounded-lg"}>{s}</span>
          ))}
        </div>
        <p className="text-[11px] text-purple-600 mt-2">Approved leaves are automatically reflected in your attendance record. You and your parent will be notified.</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "records" | "monthly" | "leave";

export default function StudentAttendance() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [tab, setTab] = useState<Tab>("monthly");
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  useEffect(() => {
    if (!student) return;
    setLoaded(false);
    // TeacherAttendance.grade is stored WITH the "Grade " prefix (e.g.
    // "Grade 3"), but the real Student.grade is stored bare (e.g. "3") — a
    // plain === never matched real records, so a student never saw
    // attendance the teacher actually took for their own section.
    const canonGrade = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const canonSection = (v: any) => String(v ?? "").trim().toUpperCase();
    smartDb.getAll("TeacherAttendance").then((rows: any[]) => {
      const s = student as any;
      const filtered = (rows || []).filter(r =>
        s && canonGrade(r.grade) === canonGrade(s.grade) && canonSection(r.section) === canonSection(s.section) && r.marks?.[s.id]
      );
      const mapped: DayRecord[] = filtered.map(r => ({
        date: r.date || r.createdAt?.slice(0, 10) || "",
        status: r.marks?.[s.id] as AttStatus || null,
        remarks: r.remarks?.[s.id] || r.remark || "",
      }));
      setRecords(mapped);
    }).catch(() => setRecords([])).finally(() => setLoaded(true));
  }, [student]);

  const stats = useMemo(() => {
    const p = records.filter(r => r.status === "P").length;
    const a = records.filter(r => r.status === "A").length;
    const l = records.filter(r => r.status === "L").length;
    const h = records.filter(r => r.status === "H").length;
    const total = p + a + l + h;
    const pct = total ? Math.round(((p + l * 0.5 + h * 0.5) / total) * 100) : 0;
    return { p, a, l, h, total, pct };
  }, [records]);

  const isLive = loaded && records.length > 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5">
            {!loaded ? (
              <div className="w-28 h-28 rounded-full border-4 border-slate-100 border-t-violet-500 animate-spin flex-shrink-0" />
            ) : (
              <CircularProgress percent={stats.pct} />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-slate-900 mb-0.5">Attendance Overview</h2>
              <p className="text-xs text-slate-500 mb-2">
                {loaded && stats.total === 0
                  ? "No attendance records yet. Your logs appear here once your teacher marks daily attendance."
                  : "Track your physical presence, RFID logs and leave requests."}
              </p>
              {stats.total > 0 && stats.pct < 75 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5" /> Below 75% threshold — exam eligibility at risk
                </span>
              )}
              <div className={cn("flex items-center gap-1.5 text-xs font-semibold mt-2",
                isLive ? "text-emerald-600" : "text-amber-600")}>
                {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isLive ? `Live data — ${records.length} days recorded` : "Sample data — no records from DB yet"}
              </div>
            </div>
          </div>
          {student && (
            <div className="w-full sm:w-60 bg-gradient-to-br from-purple-600 to-purple-600 rounded-2xl p-5 text-white flex flex-col justify-between">
              <div>
                <p className="font-black text-sm">{(student as any).name}</p>
                <p className="text-white/60 text-xs mt-1">
                  {[(student as any).grade && `Grade ${(student as any).grade}`,
                    (student as any).section && `Section ${(student as any).section}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/15">
                <div><p className="text-lg font-black">{stats.total}</p><p className="text-[10px] text-white/50 font-semibold">Total Days</p></div>
                <div><p className="text-lg font-black">{stats.p}</p><p className="text-[10px] text-white/50 font-semibold">Present</p></div>
              </div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:"Days Present",  value:stats.p,     icon:CheckCircle2, color:"text-emerald-600 bg-emerald-50" },
            { label:"Days Absent",   value:stats.a,     icon:XCircle,      color:"text-rose-600 bg-rose-50" },
            { label:"Late Arrivals", value:stats.l,     icon:Clock,        color:"text-amber-600 bg-amber-50" },
            { label:"Total Sessions",value:stats.total, icon:TrendingUp,   color:"text-purple-600 bg-violet-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
            {([
              { id:"monthly" as Tab,  label:"Monthly Calendar" },
              { id:"records" as Tab,  label:"Attendance Records" },
              { id:"leave"   as Tab,  label:"Leave Requests" },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition",
                  tab === t.id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "records"  && <RecordsTab records={records} student={student} />}
          {tab === "monthly"  && <MonthlyTab records={records} student={student} />}
          {tab === "leave"    && <LeaveTab student={student} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
