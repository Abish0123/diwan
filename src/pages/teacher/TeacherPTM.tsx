import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar, Clock, Users, MessageSquare,
  X, Phone, Video, Building2, Trash2, Plus, CheckCircle2,
  ChevronRight, CalendarOff,
} from "lucide-react";
import {
  PTMSession, PTMStatus, ActionItem, PTM_STATUSES, STATUS_COLORS,
  effectiveMode, meetingSummary, notifyPTMEvent,
} from "@/lib/ptm";
import {
  DAYS_OF_WEEK, TeacherAvailability, TimeRange, emptyAvailability,
  getTeacherAvailability, saveTeacherAvailability,
  DEFAULT_SLOT_DURATION_MINUTES, SLOT_DURATION_OPTIONS,
} from "@/lib/teacherAvailability";

// TimeRange is stored as 24h "HH:MM" throughout (what <input type=time> and
// teacherAvailability.ts's toMinutes() both expect) — this is only for the
// read-only 12h display label next to the pickers.
function to12(v24: string): string {
  const [h, m] = v24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function TeacherPTM() {
  const { assignment, classStudents } = useTeacherClass();
  const { user } = useAuth();
  const grade   = assignment.grade   || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab: "book" | "availability" = searchParams.get("tab") === "availability" ? "availability" : "book";
  const setTab = (t: "book" | "availability") => {
    setSearchParams(t === "availability" ? { tab: "availability" } : {}, { replace: true });
  };

  const [sessions, setSessions]     = useState<PTMSession[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [showNotes, setShowNotes]   = useState<PTMSession | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [actionItemsDraft, setActionItemsDraft] = useState<ActionItem[]>([]);
  const [newActionText, setNewActionText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [availability, setAvailability] = useState<TeacherAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    setAvailabilityLoading(true);
    getTeacherAvailability(user.uid)
      .then((a) => setAvailability(a || emptyAvailability(user.uid, assignment.teacherName)))
      .catch(() => setAvailability(emptyAvailability(user.uid, assignment.teacherName)))
      .finally(() => setAvailabilityLoading(false));
  }, [user?.uid, assignment.teacherName]);

  const addSlot = (day: string) => {
    if (!availability) return;
    setAvailability({
      ...availability,
      weeklySlots: availability.weeklySlots.map((d) =>
        d.day === day ? { ...d, slots: [...d.slots, { start: "15:00", end: "16:00" }] } : d
      ),
    });
  };
  const updateSlot = (day: string, idx: number, patch: Partial<TimeRange>) => {
    if (!availability) return;
    setAvailability({
      ...availability,
      weeklySlots: availability.weeklySlots.map((d) =>
        d.day === day ? { ...d, slots: d.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)) } : d
      ),
    });
  };
  const removeSlot = (day: string, idx: number) => {
    if (!availability) return;
    setAvailability({
      ...availability,
      weeklySlots: availability.weeklySlots.map((d) =>
        d.day === day ? { ...d, slots: d.slots.filter((_, i) => i !== idx) } : d
      ),
    });
  };
  const addBlockedDate = () => {
    if (!availability || !newBlockedDate) return;
    if (availability.blockedDates.includes(newBlockedDate)) {
      toast.info("That date is already blocked");
      return;
    }
    setAvailability({ ...availability, blockedDates: [...availability.blockedDates, newBlockedDate].sort() });
    setNewBlockedDate("");
  };
  const removeBlockedDate = (date: string) => {
    if (!availability) return;
    setAvailability({ ...availability, blockedDates: availability.blockedDates.filter((d) => d !== date) });
  };

  // Writes to MySQL and updates local state directly (instead of relying on a
  // refetch) so the "Book Meeting" tab's available-slots calc reflects the
  // change immediately — this tab and that one now share one mounted
  // component, so a stale refetch would otherwise leave Schedule Meeting
  // showing the old slots until the next full page load.
  const handleSaveAvailability = async () => {
    if (!availability || !user?.uid) return;
    setSavingAvailability(true);
    try {
      const toSave = { ...availability, teacherId: user.uid, teacherName: assignment.teacherName };
      await saveTeacherAvailability(toSave);
      setAvailability(toSave);
      toast.success("Availability saved — now bookable in Schedule Meeting");
    } catch {
      toast.error("Failed to save availability");
    } finally {
      setSavingAvailability(false);
    }
  };

  // Load every PTM session that's either addressed to this teacher by name
  // or booked for one of this teacher's own students — parents can mistype a
  // teacher's name, but they always pick the right student.
  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const rows = ((await smartDb.getAll("PTMSession")) || []) as PTMSession[];
      const studentIds = new Set(classStudents.map(s => s.id));
      const studentNames = new Set(classStudents.map(s => s.name.toLowerCase()));
      const teacherNameLower = assignment.teacherName.toLowerCase();
      const mine = rows.filter(s =>
        (s.studentId && studentIds.has(s.studentId)) ||
        (s.student && studentNames.has(s.student.toLowerCase())) ||
        (s.teacher && s.teacher.toLowerCase() === teacherNameLower)
      );
      setSessions(mine);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [classStudents, assignment.teacherName]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const contactFor = (s: PTMSession) => {
    const student = classStudents.find(cs => cs.id === s.studentId || cs.name.toLowerCase() === (s.student || "").toLowerCase());
    return {
      parentName: (student as any)?.guardianName || (student as any)?.fatherName || (student as any)?.motherName || "Parent",
      contactNo: (student as any)?.guardianPhone || (student as any)?.fatherPhone || (student as any)?.motherPhone || "Not on file",
    };
  };

  const cancelMeeting = async (s: PTMSession) => {
    await updateStatus(s.id, "Cancelled");
    await notifyPTMEvent("cancelled-by-teacher", s);
  };

  // A parent's booking request lands as "Pending" — the teacher's only say
  // in whether it happens at all is here, not by creating/editing sessions
  // themselves (booking is entirely parent-initiated against the teacher's
  // own published availability).
  const confirmMeeting = async (s: PTMSession) => {
    await updateStatus(s.id, "Scheduled");
    await notifyPTMEvent("approved", s);
  };
  const declineMeeting = async (s: PTMSession) => {
    await updateStatus(s.id, "Cancelled");
    await notifyPTMEvent("declined", s);
  };

  const filtered = filterDate ? sessions.filter(s => s.date === filterDate) : sessions;

  const pendingCount = sessions.filter(s => s.status === "Pending").length;
  const scheduled  = sessions.filter(s => s.status === "Scheduled").length;
  const completed  = sessions.filter(s => s.status === "Completed").length;
  const cancelled  = sessions.filter(s => s.status === "Cancelled" || s.status === "No Show").length;
  const inProgress = sessions.filter(s => s.status === "Checked In" || s.status === "In Progress").length;

  const updateStatus = async (id: string, status: PTMStatus) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    try {
      await smartDb.update("PTMSession", id, { status });
      toast.success(`Meeting marked ${status}`);
    } catch {
      toast.error("Could not update the meeting — try again.");
      loadSessions();
    }
  };

  const openNotes = (s: PTMSession) => {
    setShowNotes(s);
    setNotesDraft(s.meetingNotes || "");
    setActionItemsDraft(s.actionItems ? [...s.actionItems] : []);
    setNewActionText("");
  };

  const addActionItem = () => {
    if (!newActionText.trim()) return;
    setActionItemsDraft(prev => [...prev, { id: `ai-${Date.now()}`, text: newActionText.trim(), done: false }]);
    setNewActionText("");
  };

  const saveNotes = async () => {
    if (!showNotes) return;
    setSavingNotes(true);
    try {
      await smartDb.update("PTMSession", showNotes.id, { meetingNotes: notesDraft, actionItems: actionItemsDraft });
      setSessions(prev => prev.map(s => s.id === showNotes.id ? { ...s, meetingNotes: notesDraft, actionItems: actionItemsDraft } : s));
      toast.success("Meeting notes saved.");
      setShowNotes(null);
    } catch {
      toast.error("Could not save notes — try again.");
    } finally {
      setSavingNotes(false);
    }
  };

  const dates = [...new Set(sessions.map(s => s.date))].sort();

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Teacher Portal</span>
          <ChevronRight className="h-3 w-3" />
          {tab === "availability" ? (
            <>
              <button onClick={() => setTab("book")} className="hover:text-purple-600 hover:underline">PTM Requests</button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-purple-600 font-semibold">My Availability</span>
            </>
          ) : (
            <span className="text-purple-600 font-semibold">PTM Requests</span>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Parent-Teacher Meetings</h1>
              <p className="text-sm text-slate-400">
                {grade} · Section {section} — {tab === "book"
                  ? "Confirm or decline meetings parents book against your availability."
                  : "Set the hours parents can book you for."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === "availability" && (
              <Button onClick={handleSaveAvailability} disabled={savingAvailability || availabilityLoading} className="bg-purple-600 hover:bg-purple-700 text-white">
                <CheckCircle2 className="h-4 w-4 mr-2" /> {savingAvailability ? "Saving…" : "Save Availability"}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          <button onClick={() => setTab("book")}
            className={cn("px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition flex items-center gap-1.5",
              tab === "book" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <Users className="w-3.5 h-3.5" /> PTM Requests
            {pendingCount > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingCount}</span>
            )}
          </button>
          <button onClick={() => setTab("availability")}
            className={cn("px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition flex items-center gap-1.5",
              tab === "availability" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <Clock className="w-3.5 h-3.5" /> My Availability
          </button>
        </div>

        {tab === "availability" ? (
        <>
        {/* Availability stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Weekly Time Blocks</p>
              <p className="text-xl font-black text-slate-900">{availability?.weeklySlots.reduce((sum, d) => sum + d.slots.length, 0) || 0}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Days Available</p>
              <p className="text-xl font-black text-slate-900">{availability?.weeklySlots.filter((d) => d.slots.length > 0).length || 0}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
              <CalendarOff className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Blocked Dates</p>
              <p className="text-xl font-black text-slate-900">{availability?.blockedDates.length || 0}</p>
            </div>
          </div>
        </div>

        {availabilityLoading || !availability ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
        <>
        {/* Weekly slots */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-slate-800">Weekly Availability</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Meeting Duration</span>
              <Select
                value={String(availability.slotDurationMinutes || DEFAULT_SLOT_DURATION_MINUTES)}
                onValueChange={(v) => setAvailability({ ...availability, slotDurationMinutes: Number(v) })}
              >
                <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_DURATION_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="px-5 pt-3 text-[11px] text-slate-400">Parents will be offered bookable start times this far apart within each block below.</p>
          <div className="divide-y divide-slate-100">
            {availability.weeklySlots.map((day) => (
              <div key={day.day} className="px-5 py-4 flex items-start gap-4 flex-wrap">
                <div className="w-28 shrink-0 pt-1.5">
                  <p className="font-bold text-slate-800 text-sm">{day.day}</p>
                </div>
                <div className="flex-1 min-w-[280px] space-y-2">
                  {day.slots.length === 0 && (
                    <p className="text-xs text-slate-400">No slots — parents can't book this day.</p>
                  )}
                  {day.slots.map((slot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input type="time" value={slot.start} onChange={(e) => updateSlot(day.day, idx, { start: e.target.value })} className="h-9 w-32 text-sm" />
                      <span className="text-slate-400 text-sm">to</span>
                      <Input type="time" value={slot.end} onChange={(e) => updateSlot(day.day, idx, { end: e.target.value })} className="h-9 w-32 text-sm" />
                      <span className="text-xs text-slate-400 ml-1">{to12(slot.start)} – {to12(slot.end)}</span>
                      <button onClick={() => removeSlot(day.day, idx)} className="text-slate-300 hover:text-rose-500 ml-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addSlot(day.day)}
                    className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add time slot
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blocked dates */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalendarOff className="h-4 w-4 text-rose-500" /> Blocked Dates</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Input type="date" value={newBlockedDate} onChange={(e) => setNewBlockedDate(e.target.value)} className="h-9 w-48 text-sm" />
              <Button size="sm" variant="outline" onClick={addBlockedDate}><Plus className="h-3.5 w-3.5 mr-1" /> Block Date</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {availability.blockedDates.length === 0 && <p className="text-xs text-slate-400">No blocked dates — you're bookable every day you have slots.</p>}
              {availability.blockedDates.map((d) => (
                <span key={d} className="flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-3 py-1 text-xs font-semibold">
                  {d}
                  <button onClick={() => removeBlockedDate(d)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
        </div>
        </>
        )}
        </>
        ) : (
        <>
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label:"Awaiting Your Confirmation", value: pendingCount, color:"text-amber-700 bg-amber-100" },
            { label:"Scheduled",   value: scheduled,  color:"text-blue-600 bg-blue-50" },
            { label:"In Progress", value: inProgress, color:"text-amber-600 bg-amber-50" },
            { label:"Completed",   value: completed,  color:"text-emerald-600 bg-emerald-50" },
            { label:"Cancelled / No Show", value: cancelled, color:"text-rose-600 bg-rose-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setFilterDate("")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition",
              !filterDate ? "bg-purple-600 text-white border-purple-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
            All Dates
          </button>
          {dates.map(d => (
            <button key={d} onClick={() => setFilterDate(d)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition",
                filterDate === d ? "bg-purple-600 text-white border-purple-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short" })}
            </button>
          ))}
        </div>

        {/* PTM list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading && (
            <div className="py-12 text-center text-slate-400">Loading meetings…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400">No meetings scheduled.</div>
          )}
          <div className="divide-y divide-slate-100">
            {filtered.map(s => {
              const { parentName, contactNo } = contactFor(s);
              const mode = effectiveMode(s);
              return (
                <div key={s.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50 transition">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Users className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{parentName}</p>
                      <span className="text-xs text-slate-400">— Parent of {s.student}</span>
                      {(s.studentGrade || s.studentSection) && (
                        <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 bg-slate-50">
                          {s.studentGrade}{s.studentSection ? ` · Section ${s.studentSection}` : ""}
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn("text-[10px]", mode === "Online" ? "border-sky-200 text-sky-700 bg-sky-50" : mode === "Offline" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 bg-amber-50")}>
                        {mode === "Online" && <Video className="h-3 w-3 mr-1" />}
                        {mode === "Offline" && <Building2 className="h-3 w-3 mr-1" />}
                        {mode}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{s.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.timeRange || s.nextSlot} {s.duration ? `· ${s.duration}` : ""}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contactNo}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {mode === "Online" && s.meetingLink ? (
                        <a href={s.meetingLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-sky-600 hover:underline w-fit">
                          <Video className="h-3 w-3" /> Join Meeting
                        </a>
                      ) : (
                        meetingSummary(s)
                      )}
                    </p>
                    {s.purpose && (
                      <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                        <span className="font-semibold text-slate-500">Purpose: </span>"{s.purpose}"
                      </p>
                    )}
                    {s.meetingNotes && <p className="text-xs text-slate-500 mt-1 italic">"{s.meetingNotes}"</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {s.status === "Pending" ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => confirmMeeting(s)}
                          className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition">
                          <CheckCircle2 className="w-3 h-3" /> Confirm
                        </button>
                        <button onClick={() => declineMeeting(s)}
                          className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold transition">
                          <X className="w-3 h-3" /> Decline
                        </button>
                      </div>
                    ) : (
                      <Select value={s.status} onValueChange={(v) => updateStatus(s.id, v as PTMStatus)}>
                        <SelectTrigger className={cn("h-7 text-[11px] w-[130px] border", STATUS_COLORS[s.status])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PTM_STATUSES.filter(st => st !== "Pending").map((st) => (
                            <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => openNotes(s)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition" title="Meeting notes">
                        <MessageSquare className="w-3.5 h-3.5" /> Notes {s.actionItems?.length ? `(${s.actionItems.length})` : ""}
                      </button>
                      {s.status !== "Pending" && s.status !== "Cancelled" && s.status !== "Completed" && (
                        <button onClick={() => cancelMeeting(s)}
                          className="text-[11px] text-rose-400 hover:text-rose-600 transition" title="Cancel meeting">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
        )}

        {/* Notes Modal */}
        {showNotes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-900">Meeting Notes</h2>
                  <p className="text-xs text-slate-400">{contactFor(showNotes).parentName} · {showNotes.student}</p>
                </div>
                <button onClick={() => setShowNotes(null)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <Textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
                  rows={4} placeholder="What was discussed, concerns raised, progress noted…" />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">Action Items / Follow-ups</p>
                  <div className="space-y-1.5">
                    {actionItemsDraft.map(a => (
                      <div key={a.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <Checkbox checked={a.done} onCheckedChange={(c) => setActionItemsDraft(prev => prev.map(x => x.id === a.id ? { ...x, done: !!c } : x))} />
                        <span className={cn("flex-1 text-sm", a.done && "line-through text-slate-400")}>{a.text}</span>
                        <button onClick={() => setActionItemsDraft(prev => prev.filter(x => x.id !== a.id))} className="text-slate-300 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {actionItemsDraft.length === 0 && <p className="text-xs text-slate-400 py-1">No action items yet.</p>}
                  </div>
                  <div className="flex gap-2">
                    <input value={newActionText} onChange={e => setNewActionText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addActionItem(); } }}
                      placeholder="Add a follow-up action…"
                      className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                    <button onClick={addActionItem} className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-2">
                <button onClick={() => setShowNotes(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={saveNotes} disabled={savingNotes}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                  {savingNotes ? "Saving…" : "Save Notes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
