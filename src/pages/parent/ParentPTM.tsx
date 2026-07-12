import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, Clock, User, X, Users2, AlertTriangle, Video, Building2, MapPin, GraduationCap, BookOpen,
} from "lucide-react";
import {
  PTMSession, STATUS_COLORS, MeetingMode, generateJitsiLink, notifyPTMEvent, effectiveMode, meetingSummary,
} from "@/lib/ptm";
import { getTeacherAvailabilityByName, computeAvailableSlots } from "@/lib/teacherAvailability";
import { canonGrade, canonSection, classSection } from "@/lib/studentGradeSection";

interface AssignedTeacher {
  name: string;
  role: "Class Teacher" | "Subject Teacher";
  subject?: string;
}

function statusStyle(s: string) {
  return STATUS_COLORS[s as keyof typeof STATUS_COLORS] || "bg-slate-100 text-slate-600 border-slate-200";
}

const emptyForm = () => ({
  meetingWith: "" as "" | "Class Teacher" | "Subject Teacher",
  teacherName: "",
  subject: "",
  meetingType: "Offline" as MeetingMode,
  date: "",
  time: "",
  purpose: "",
});

export default function ParentPTM() {
  const { selected, loading } = useParentChildren();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<PTMSession[]>([]);
  const [fetching, setFetching] = useState(false);
  const [noteModal, setNoteModal] = useState<PTMSession | null>(null);
  const [bookModal, setBookModal] = useState(false);
  const [assignedTeachers, setAssignedTeachers] = useState<AssignedTeacher[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadSessions = useCallback(() => {
    if (!selected?.name) { setSessions([]); return; }
    setFetching(true);
    smartDb.getAll("PTMSession").then((rows: any[]) => {
      const mine = (rows || []).filter((s: any) =>
        s.studentId === selected.id || s.student === selected.name
      );
      setSessions(mine);
    }).catch(() => setSessions([])).finally(() => setFetching(false));
  }, [selected?.id, selected?.name]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Real Class Teacher + Subject Teachers for this child — from the same
  // master data the school itself uses (Class.teacher for homeroom,
  // subject_assignments for per-subject teachers), not a guessed/stale field.
  useEffect(() => {
    if (!selected?.grade) { setAssignedTeachers([]); return; }
    (async () => {
      const [classes, subjectAssignments] = await Promise.all([
        smartDb.getAll("Class", undefined).catch(() => []),
        smartDb.getAll("subject_assignments", undefined).catch(() => []),
      ]);
      const wantGrade = canonGrade(selected.grade);
      const wantSection = canonSection(selected.section);

      const teachers: AssignedTeacher[] = [];
      const cls = (classes as any[]).find((c) =>
        canonGrade(c.grade) === wantGrade && canonSection(classSection(c)) === wantSection
      );
      if (cls?.teacher) teachers.push({ name: cls.teacher, role: "Class Teacher" });

      (subjectAssignments as any[])
        .filter((a) => canonGrade(a.grade) === wantGrade && canonSection(a.section) === wantSection && a.teacherName)
        .forEach((a) => {
          if (!teachers.some((t) => t.name === a.teacherName && t.subject === a.subject)) {
            teachers.push({ name: a.teacherName, role: "Subject Teacher", subject: a.subject });
          }
        });
      setAssignedTeachers(teachers);
    })();
  }, [selected?.grade, selected?.section]);

  const teachersForRole = useMemo(
    () => assignedTeachers.filter((t) => t.role === form.meetingWith),
    [assignedTeachers, form.meetingWith]
  );

  // Real bookable times for the chosen teacher + date — pulled from that
  // teacher's own configured availability, minus whatever's already booked.
  useEffect(() => {
    if (!form.teacherName || !form.date) { setAvailableSlots([]); return; }
    setSlotsLoading(true);
    (async () => {
      const [availability, allSessions] = await Promise.all([
        getTeacherAvailabilityByName(form.teacherName),
        smartDb.getAll("PTMSession", undefined).catch(() => []) as Promise<PTMSession[]>,
      ]);
      const alreadyBooked = (allSessions || [])
        .filter((s) => s.teacher === form.teacherName && s.date === form.date && s.status !== "Cancelled")
        .map((s) => s.timeRange);
      setAvailableSlots(computeAvailableSlots(availability, form.date, alreadyBooked, availability?.slotDurationMinutes || 15));
      setSlotsLoading(false);
    })();
  }, [form.teacherName, form.date]);

  const pending = sessions.filter(s => s.status === "Pending").length;
  const scheduled = sessions.filter(s => s.status === "Scheduled" || s.status === "Checked In" || s.status === "In Progress").length;
  const completed = sessions.filter(s => s.status === "Completed").length;

  const openBook = () => {
    setForm(emptyForm());
    setBookModal(true);
  };

  const handleBook = async () => {
    if (!selected || !user) return;
    if (!form.meetingWith || !form.teacherName || !form.date || !form.time) {
      toast.error("Please choose who to meet, a date, and a time slot.");
      return;
    }
    try {
      const meetingLink = form.meetingType === "Online" ? generateJitsiLink(`${form.teacherName}-${selected.name}`) : undefined;
      const record: PTMSession = {
        id: `ptm-${Date.now()}`,
        date: form.date,
        timeRange: form.time,
        nextSlot: form.time,
        teacher: form.teacherName,
        subject: form.subject || (form.meetingWith === "Class Teacher" ? "General" : form.subject),
        student: selected.name,
        studentId: selected.id,
        studentGrade: selected.grade,
        studentSection: selected.section,
        // Awaits the teacher's confirmation before it's a real commitment —
        // see notifyPTMEvent("requested") below and TeacherPTM's Confirm action.
        status: "Pending",
        parent: (user as any).displayName || (user as any).name || "Parent",
        purpose: form.purpose.trim() || undefined,
        meetingMode: form.meetingType,
        allowOnline: form.meetingType === "Online",
        allowOffline: form.meetingType === "Offline",
        platform: form.meetingType === "Online" ? "Jitsi Meet" : undefined,
        meetingLink,
        location: form.meetingType === "Offline" ? `${selected.grade} - Section ${selected.section} classroom` : undefined,
        uid: user.uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("PTMSession", record, record.id);
      // Real link to the shared Calendar (src/pages/communication/Calendar.tsx)
      // — that page's Event interface already had a "PTM" source value and a
      // recipientStudentId field for exactly this, but nothing ever wrote one;
      // a parent's confirmed meeting never showed up on their own calendar.
      // Private to this family only (recipientStudentId), no `status` field
      // so it isn't gated behind Announcements-style publishing.
      // Deterministic id (derived from the PTMSession id) so a later
      // cancellation can remove the matching calendar entry without needing
      // to track a separately-returned server id.
      await smartDb.create("CalendarEvent", {
        id: `cal-${record.id}`,
        title: `PTM with ${form.teacherName}`,
        description: form.purpose.trim() || undefined,
        date: form.date,
        time: form.time,
        location: record.location || (form.meetingType === "Online" ? "Online" : ""),
        category: "Meetings",
        color: "bg-purple-500",
        source: "PTM",
        recipientStudentId: selected.id,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      }, `cal-${record.id}`).catch(() => {});
      await notifyPTMEvent("requested", record);
      toast.success(`Meeting request sent to ${form.teacherName} — you'll be notified once they confirm.`);
      setBookModal(false);
      setForm(emptyForm());
      loadSessions();
    } catch {
      toast.error("Failed to book meeting. Please try again.");
    }
  };

  const handleCancel = async (s: PTMSession) => {
    try {
      await smartDb.update("PTMSession", s.id, { status: "Cancelled" });
      // Remove the matching calendar entry (same deterministic id scheme
      // used at booking time) so a cancelled meeting doesn't linger on the
      // shared calendar.
      await smartDb.delete("CalendarEvent", `cal-${s.id}`).catch(() => {});
      await notifyPTMEvent("cancelled-by-parent", s);
      toast.info("Meeting cancelled.");
      loadSessions();
    } catch {
      toast.error("Failed to cancel meeting.");
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
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">PTM Booking</h1>
              <p className="text-sm text-slate-500 mt-0.5">{selected.name} — Parent-Teacher Meetings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChildSwitcher className="w-56" />
            <button onClick={openBook}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
              <Calendar className="w-4 h-4" /> Book Meeting
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label:"Awaiting Confirmation", value: pending, color:"text-amber-600 bg-amber-50" },
            { label:"Scheduled", value: scheduled, color:"text-purple-600 bg-blue-50" },
            { label:"Completed", value: completed, color:"text-slate-600 bg-slate-50" },
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

        {!fetching && sessions.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            No parent-teacher meetings scheduled yet.
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            PTM sessions for {selected.name}.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">Meeting History</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {sessions.length === 0 && (
              <div className="py-12 text-center text-slate-400">No parent-teacher meetings scheduled yet.</div>
            )}
            {sessions.map(slot => {
              const mode = effectiveMode(slot);
              return (
              <div key={slot.id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-slate-50 transition">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">{slot.teacher}</p>
                    <Badge variant="outline" className={cn("text-[10px]", mode === "Online" ? "border-sky-200 text-sky-700 bg-sky-50" : mode === "Offline" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 bg-amber-50")}>
                      {mode === "Online" && <Video className="h-3 w-3 mr-1" />}
                      {mode === "Offline" && <Building2 className="h-3 w-3 mr-1" />}
                      {mode}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {slot.date}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {slot.timeRange || slot.nextSlot}</span>
                    <span className="text-slate-500">{slot.subject}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {mode === "Online" && slot.meetingLink ? (
                      <a href={slot.meetingLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-sky-600 hover:underline w-fit">
                        <Video className="h-3 w-3" /> Join Meeting
                      </a>
                    ) : (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {meetingSummary(slot)}</span>
                    )}
                  </p>
                  {slot.meetingNotes && <p className="text-xs text-slate-500 mt-1 italic">Note: {slot.meetingNotes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", statusStyle(slot.status))}>{slot.status === "Pending" ? "Awaiting Confirmation" : slot.status}</span>
                  {(slot.status === "Pending" || slot.status === "Scheduled" || slot.status === "Checked In") && (
                    <>
                      {slot.meetingNotes && (
                        <button onClick={() => setNoteModal(slot)} className="text-xs text-purple-600 hover:underline">Notes</button>
                      )}
                      <button onClick={() => handleCancel(slot)} className="text-xs text-rose-500 hover:underline">Cancel</button>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Book modal — the real workflow: child -> meeting with -> teacher -> type -> date -> real slot */}
        {bookModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-900">Book a Meeting</h2>
                  <p className="text-xs text-slate-400">For {selected.name} — {selected.grade} · Section {selected.section}</p>
                </div>
                <button onClick={() => setBookModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-2">Meeting With *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={cn("flex items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-xs font-semibold cursor-pointer transition",
                      form.meetingWith === "Class Teacher" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500")}>
                      <input type="radio" className="sr-only" checked={form.meetingWith === "Class Teacher"}
                        onChange={() => setForm(f => ({ ...emptyForm(), meetingWith: "Class Teacher" }))} />
                      <GraduationCap className="h-3.5 w-3.5" /> Class Teacher
                    </label>
                    <label className={cn("flex items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-xs font-semibold cursor-pointer transition",
                      form.meetingWith === "Subject Teacher" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500")}>
                      <input type="radio" className="sr-only" checked={form.meetingWith === "Subject Teacher"}
                        onChange={() => setForm(f => ({ ...emptyForm(), meetingWith: "Subject Teacher" }))} />
                      <BookOpen className="h-3.5 w-3.5" /> Subject Teacher
                    </label>
                  </div>
                  {assignedTeachers.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1.5">No teachers are assigned to {selected.name}'s class yet — contact the school office.</p>
                  )}
                </div>

                {form.meetingWith && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Teacher *</label>
                    {teachersForRole.length === 0 ? (
                      <p className="text-xs text-slate-400">No {form.meetingWith.toLowerCase()} assigned yet.</p>
                    ) : (
                      <Select value={form.teacherName} onValueChange={(v) => {
                        const t = teachersForRole.find((tt) => tt.name === v);
                        setForm(f => ({ ...f, teacherName: v, subject: t?.subject || f.subject, date: "", time: "" }));
                      }}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Select a teacher" /></SelectTrigger>
                        <SelectContent>
                          {teachersForRole.map((t) => (
                            <SelectItem key={`${t.name}-${t.subject || ""}`} value={t.name}>
                              {t.name}{t.subject ? ` — ${t.subject}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {form.teacherName && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-2">Meeting Type *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className={cn("flex items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-xs font-semibold cursor-pointer transition",
                          form.meetingType === "Offline" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
                          <input type="radio" className="sr-only" checked={form.meetingType === "Offline"}
                            onChange={() => setForm(f => ({ ...f, meetingType: "Offline" }))} />
                          <Building2 className="h-3.5 w-3.5" /> Offline
                        </label>
                        <label className={cn("flex items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-xs font-semibold cursor-pointer transition",
                          form.meetingType === "Online" ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-500")}>
                          <input type="radio" className="sr-only" checked={form.meetingType === "Online"}
                            onChange={() => setForm(f => ({ ...f, meetingType: "Online" }))} />
                          <Video className="h-3.5 w-3.5" /> Online
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Date *</label>
                      <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, time: "" }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Preferred Time *</label>
                      {!form.date ? (
                        <p className="text-xs text-slate-400">Pick a date to see {form.teacherName.split(" ")[0]}'s open times.</p>
                      ) : slotsLoading ? (
                        <p className="text-xs text-slate-400">Loading available times…</p>
                      ) : availableSlots.length === 0 ? (
                        <p className="text-xs text-amber-600">No open slots that day — try another date.</p>
                      ) : (
                        <Select value={form.time} onValueChange={(v) => setForm(f => ({ ...f, time: v }))}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Choose a time" /></SelectTrigger>
                          <SelectContent className="max-h-56">
                            {availableSlots.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1.5">Only the teacher's own configured hours are shown — already-booked times are hidden.</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Purpose of Meeting</label>
                      <Textarea
                        value={form.purpose}
                        onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                        placeholder="e.g. Discuss recent exam performance, attendance concerns…"
                        className="text-sm min-h-[70px] resize-none"
                        maxLength={300}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Optional — helps {form.teacherName.split(" ")[0]} prepare before the meeting.</p>
                    </div>
                  </>
                )}
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-2">
                <button onClick={() => setBookModal(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={handleBook} className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">Book Slot</button>
              </div>
            </div>
          </div>
        )}

        {/* Notes modal */}
        {noteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-900">Meeting Notes</h2>
                <button onClick={() => setNoteModal(null)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-600 italic">"{noteModal.meetingNotes}"</p>
                <p className="text-xs text-slate-400 mt-3">— {noteModal.teacher} · {noteModal.date}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
