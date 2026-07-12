import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { notifyClassTeacherEvent } from "@/lib/classPublishNotify";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { UserCheck, AlertTriangle, Clock, Send, X, Users2, Wifi } from "lucide-react";

// No holiday/academic-calendar table exists anywhere in this app (grepped
// HolidayCalendar/holiday_calendar/AcademicCalendar/SchoolHoliday — zero
// hits), so a "holiday" status here could never be produced by real data —
// it was permanently decorative. Real statuses only.
type DayStatus = "present" | "absent" | "late" | "none";
interface DayRecord { date: number; status: DayStatus; note?: string; }

const DAYS_OF_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function dayStyle(s: DayStatus) {
  switch (s) {
    case "present": return "bg-emerald-100 text-emerald-700 font-bold";
    case "absent":  return "bg-rose-100 text-rose-700 font-bold";
    case "late":    return "bg-amber-100 text-amber-700 font-bold";
    default:        return "text-slate-200";
  }
}

export default function ParentAttendance() {
  const { selected, loading } = useParentChildren();
  const { user } = useAuth();
  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ date: "", reason: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [liveDays, setLiveDays] = useState<DayRecord[] | null>(null);
  const [myRequests, setMyRequests] = useState<any[]>([]);

  const loadMyRequests = () => {
    if (!selected?.id) { setMyRequests([]); return; }
    smartDb.getAll("StudentAbsenceRequest").then((rows: any[]) => {
      setMyRequests(
        (rows || [])
          .filter((r: any) => String(r.studentId) === String(selected.id))
          .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      );
    }).catch(() => {});
  };
  useEffect(loadMyRequests, [selected?.id]);

  // Query real TeacherAttendance records — same table teachers write to.
  // TeacherAttendance.grade is stored WITH the "Grade " prefix (e.g.
  // "Grade 3", from useTeacherClass's parsed classSection), but the real
  // Student.grade is stored bare (e.g. "3") — a plain === never matched real
  // records, so a parent never saw attendance the teacher actually took.
  useEffect(() => {
    setLiveDays(null);
    if (!selected?.id) return;
    const now = new Date();
    const yr = now.getFullYear();
    const mo = now.getMonth() + 1;
    const canonGrade = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const canonSection = (v: any) => String(v ?? "").trim().toUpperCase();

    smartDb.getAll("TeacherAttendance").then((rows: any[]) => {
      const relevant = (rows || []).filter((r: any) =>
        canonGrade(r.grade) === canonGrade(selected.grade) &&
        canonSection(r.section) === canonSection(selected.section) &&
        r.marks?.[selected.id] !== undefined
      );
      if (relevant.length === 0) return;

      // Build per-date map for current month
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const statusMap: Record<number, DayStatus> = {};
      relevant.forEach((r: any) => {
        const d = new Date(r.date || r.createdAt || "");
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() !== yr || d.getMonth() + 1 !== mo) return;
        const day = d.getDate();
        const mark = r.marks?.[selected.id];
        statusMap[day] = mark === "P" ? "present" : mark === "A" ? "absent" : mark === "L" ? "late" : "none";
      });

      const mapped: DayRecord[] = Array.from({ length: daysInMonth }, (_, i) => ({
        date: i + 1,
        status: statusMap[i + 1] || "none",
      }));
      setLiveDays(mapped);
    }).catch(() => {});
  }, [selected?.id, selected?.grade, selected?.section]);

  const now = new Date();
  const currentMonth = now.toLocaleString("default", { month: "long" });
  const currentYear  = now.getFullYear();
  const daysInCurrentMonth = new Date(currentYear, now.getMonth() + 1, 0).getDate();
  // Current month starts on what day (0=Sun..6=Sat) — for calendar offset
  const startOffset = new Date(currentYear, now.getMonth(), 1).getDay();

  const days = liveDays ?? [];
  const isLive = liveDays !== null;

  const schoolDays = days.filter(d => d.status !== "none");
  const present    = schoolDays.filter(d => d.status === "present").length;
  const absent     = schoolDays.filter(d => d.status === "absent").length;
  const late       = schoolDays.filter(d => d.status === "late").length;
  const pct        = schoolDays.length ? Math.round((present / schoolDays.length) * 100) : 0;

  const handleSubmit = async () => {
    if (!reqForm.date || !reqForm.reason) { toast.error("Date and reason are required."); return; }
    if (!selected) return;
    setSaving(true);
    try {
      const id = `ABSREQ-${selected.id}-${Date.now()}`;
      await smartDb.create("StudentAbsenceRequest", {
        studentId: selected.id, studentName: selected.name,
        grade: selected.grade, section: selected.section,
        parentUid: user?.uid, parentEmail: user?.email,
        date: reqForm.date, reason: reqForm.reason, note: reqForm.note,
        status: "Pending",
      }, id);
      // Best-effort — the class teacher sees it in their real Attendance
      // page's "Absence Requests" panel; this just gets their attention sooner.
      notifyClassTeacherEvent({
        grade: selected.grade || "", section: selected.section || "",
        entity: "StudentAbsenceRequest", type: "absence_request_submitted",
        title: "Absence Request",
        message: `${selected.name} — absence requested for ${reqForm.date} (${reqForm.reason}).`,
        sourceId: id,
        redirectUrl: "/teacher/attendance",
      }).catch(() => {});
      setShowRequest(false);
      setReqForm({ date:"", reason:"", note:"" });
      toast.success("Absence request submitted to the school.");
      loadMyRequests();
    } catch {
      toast.error("Failed to submit absence request. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
              <p className="text-sm text-slate-400">{currentMonth} {currentYear} — {selected.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChildSwitcher className="w-56" />
            <button onClick={() => setShowRequest(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
              <Send className="w-4 h-4" /> Absence Request
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Attendance %",  value:`${pct}%`,  icon: UserCheck,    color: pct>=90?"text-emerald-600 bg-emerald-50":"text-rose-600 bg-rose-50" },
            { label:"Present Days",  value: present,   icon: UserCheck,    color:"text-emerald-600 bg-emerald-50" },
            { label:"Absent Days",   value: absent,    icon: AlertTriangle,color:"text-rose-600 bg-rose-50" },
            { label:"Late Arrivals", value: late,      icon: Clock,        color:"text-amber-600 bg-amber-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs border",
          isLive
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-amber-50 border-amber-200 text-amber-700")}>
          {isLive ? <Wifi className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
          {isLive
            ? `Live attendance data for ${currentMonth} ${currentYear} from teacher records.`
            : `No attendance records yet for ${selected.name} this month.`}
        </div>

        {/* Calendar */}
        {days.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">{currentMonth} {currentYear}</h3>
              <div className="flex gap-4 text-xs">
                {[["bg-emerald-100 text-emerald-700","Present"],["bg-rose-100 text-rose-700","Absent"],["bg-amber-100 text-amber-700","Late"]].map(([cls,lbl])=>(
                  <span key={lbl} className="flex items-center gap-1">
                    <span className={cn("w-3 h-3 rounded-sm inline-block",cls)} />{lbl}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
              ))}
              {Array.from({length: startOffset}, (_, i) => <div key={`pad-${i}`} />)}
              {days.map(d => (
                <div key={d.date} title={d.note || d.status}
                  className={cn("aspect-square rounded-lg flex items-center justify-center text-xs cursor-default transition hover:opacity-80", dayStyle(d.status))}>
                  {d.date}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Absence history */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black text-slate-900 mb-4">Absence & Late History</h3>
          <div className="divide-y divide-slate-100">
            {days.filter(d => d.status === "absent" || d.status === "late").map(d => (
              <div key={d.date} className="py-3 flex items-center gap-3">
                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0",
                  d.status === "absent" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
                  {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                </span>
                <span className="text-sm font-medium text-slate-700">{currentMonth} {d.date}, {currentYear}</span>
                {d.note && <span className="text-xs text-slate-400">— {d.note}</span>}
              </div>
            ))}
            {days.filter(d=>d.status==="absent"||d.status==="late").length===0 && (
              <p className="py-4 text-center text-slate-400 text-sm">No absences or late arrivals recorded.</p>
            )}
          </div>
        </div>

        {/* My Absence Requests — real submissions, reviewed by the class teacher */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black text-slate-900 mb-4">My Absence Requests</h3>
          <div className="divide-y divide-slate-100">
            {myRequests.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3">
                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0",
                  r.status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  r.status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
                  "bg-amber-50 text-amber-700 border-amber-200")}>
                  {r.status || "Pending"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{r.date} — {r.reason}</p>
                  {r.note && <p className="text-xs text-slate-400">{r.note}</p>}
                </div>
              </div>
            ))}
            {myRequests.length === 0 && (
              <p className="py-4 text-center text-slate-400 text-sm">No absence requests submitted yet.</p>
            )}
          </div>
        </div>

        {/* Absence Request Modal */}
        {showRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-900">Absence Request</h2>
                <button onClick={() => setShowRequest(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Student</label>
                  <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">{selected.name}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Date of Absence *</label>
                  <input type="date" value={reqForm.date} onChange={e => setReqForm(f=>({...f,date:e.target.value}))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Reason *</label>
                  <select value={reqForm.reason} onChange={e => setReqForm(f=>({...f,reason:e.target.value}))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    <option value="">Select reason</option>
                    {["Medical / Illness","Family Emergency","Travel","Religious Occasion","Other"].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Additional Note</label>
                  <textarea value={reqForm.note} onChange={e => setReqForm(f=>({...f,note:e.target.value}))}
                    rows={3} placeholder="Optional details…"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                  You can also upload a supporting document (medical certificate, etc.) from the health records section.
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-2">
                <button onClick={() => setShowRequest(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                  {saving ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
