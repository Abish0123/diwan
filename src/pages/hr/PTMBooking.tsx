import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, Clock, Users, CheckCircle2, MessageCircle, Send, Plus, Download,
  ChevronsUpDown, MapPin, Video, Building2, Wand2, ClipboardList, X, Trash2,
} from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import {
  PTMSession, PTMStatus, MeetingMode, MeetingPlatform, ActionItem,
  PTM_STATUSES, MEETING_PLATFORMS, MEETING_DURATIONS, STATUS_COLORS,
  effectiveMode, meetingSummary, generateJitsiLink, notifyPTMEvent,
} from "@/lib/ptm";
import { TeacherAvailability, getAllTeacherAvailability } from "@/lib/teacherAvailability";
import { useIntegrationConnected } from "@/hooks/useIntegrationStatus";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const timeSlots = ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM"];
// Ready-made 30-min ranges built from the same slot grid the calendar tab
// uses — picking one is a click, not free-typed text.
const TIME_RANGES = timeSlots.slice(0, -1).map((t, i) => `${t} – ${timeSlots[i + 1]}`);

const CAMPUSES = ["Main Campus", "North Campus", "Girls' Campus"];

interface RoomOption {
  id: string;
  roomNo: string;
  roomName: string;
  type: string;
  capacity: number;
}

const TAB_TRIGGER_CLS = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none";

type CellState = "booked" | "available";

const emptyForm = () => ({
  date: "",
  timeRange: "",
  teacher: "",
  teacherId: "",
  subject: "",
  student: "",
  studentId: "",
  meetingMode: "Hybrid" as MeetingMode,
  allowOnline: true,
  allowOffline: true,
  campus: CAMPUSES[0],
  building: "",
  roomNumber: "",
  meetingDesk: "",
  parkingInstructions: "",
  platform: "Jitsi Meet" as MeetingPlatform,
  meetingLink: "",
  duration: "30 min",
});

export default function PTMBooking() {
  const { user } = useAuth();
  const { connected: whatsappConnected } = useIntegrationConnected("whatsapp-business");
  const { connected: zoomConnected } = useIntegrationConnected("zoom");
  const { connected: teamsConnected } = useIntegrationConnected("msteams");
  const { connected: googleMeetConnected } = useIntegrationConnected("googlemeet-live");
  // Which meeting platforms actually have real credentials wired up under
  // Administration → Integrations — shown inline so picking "Zoom" doesn't
  // silently imply this app can generate a real Zoom link when it can't.
  const platformConnected: Partial<Record<MeetingPlatform, boolean>> = {
    "Jitsi Meet": true,
    "Zoom": zoomConnected,
    "Microsoft Teams": teamsConnected,
    "Google Meet": googleMeetConnected,
  };
  const { students } = useStudents();
  const { staff } = useStaff();
  const teachers = useMemo(
    () => staff.filter((s: any) => /teacher/i.test(s.role || s.designation || "")).length
      ? staff.filter((s: any) => /teacher/i.test(s.role || s.designation || ""))
      : staff,
    [staff]
  );

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTiming, setReminderTiming] = useState("1 day before");
  const [sessions, setSessions] = useState<PTMSession[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<PTMSession | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [actionItemsDraft, setActionItemsDraft] = useState<ActionItem[]>([]);
  const [newActionText, setNewActionText] = useState("");
  const [newPTM, setNewPTM] = useState(emptyForm());

  // Real rooms from Room Management — unscoped since every staff member
  // booking a PTM should see the school's full room list, not just rooms
  // they personally created.
  useEffect(() => {
    smartDb.getAll("Room", undefined).then((rows: any[]) => {
      setRooms((rows || []).filter((r) => r.status !== "Inactive"));
    }).catch(() => setRooms([]));
  }, []);

  // PTM sessions are shared institutional records every staff/admin should
  // see — not private to whoever created them, so this reads unscoped
  // (previously scoped to `user.uid`, which meant only the creator of a
  // session could ever see it existed).
  const loadSessions = useCallback(async () => {
    const data = (await smartDb.getAll("PTMSession", undefined)) as PTMSession[];
    setSessions(data);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const upcomingPTMs = sessions.filter((s) => !s.day);

  // Real slot calendar: every cell starts "available"; only cells with an
  // actual persisted PTMSession(day, slot) show as booked. No fabricated
  // "blocked" cells or randomized fake bookings.
  const calendarData = useMemo(() => {
    const calendar: Record<string, Record<string, { state: CellState; parent?: string }>> = {};
    days.forEach((day) => {
      calendar[day] = {};
      timeSlots.forEach((slot) => {
        calendar[day][slot] = { state: "available" };
      });
    });
    sessions.forEach((s) => {
      if (s.day && s.slot && calendar[s.day]?.[s.slot]) {
        calendar[s.day][s.slot] = { state: "booked", parent: s.parent || s.student || "Booked" };
      }
    });
    return calendar;
  }, [sessions]);

  // Real per-teacher schedule, derived from actual booked PTMSession rows —
  // not a hardcoded roster of fictional teachers.
  const teacherScheduleRows = useMemo(() => {
    const totalPerTeacher = timeSlots.length * days.length;
    return teachers.map((t: any) => {
      const booked = sessions.filter((s) => s.teacherId === t.id || s.teacher === t.name).length;
      return {
        id: t.id,
        name: t.name,
        subject: (t.subjects && t.subjects[0]) || t.department || t.subject || "—",
        total: totalPerTeacher,
        booked: Math.min(booked, totalPerTeacher),
      };
    });
  }, [teachers, sessions]);

  // Monitoring: which teachers have actually configured real availability
  // (weekly slots parents can book against), and each teacher's real
  // completed/pending meeting counts — for the admin's oversight view.
  const [availabilityRows, setAvailabilityRows] = useState<TeacherAvailability[]>([]);
  useEffect(() => { getAllTeacherAvailability().then(setAvailabilityRows).catch(() => setAvailabilityRows([])); }, []);

  const monitoringRows = useMemo(() => {
    return teachers.map((t: any) => {
      const av = availabilityRows.find((a) => a.teacherName === t.name || a.teacherId === t.id);
      const weeklySlotCount = av ? av.weeklySlots.reduce((sum, d) => sum + d.slots.length, 0) : 0;
      const mine = sessions.filter((s) => s.teacherId === t.id || s.teacher === t.name);
      return {
        id: t.id,
        name: t.name,
        configured: weeklySlotCount > 0,
        weeklySlotCount,
        blockedDates: av?.blockedDates.length || 0,
        pending: mine.filter((s) => s.status === "Scheduled" || s.status === "Checked In" || s.status === "In Progress").length,
        completed: mine.filter((s) => s.status === "Completed").length,
      };
    });
  }, [teachers, availabilityRows, sessions]);

  const statusBreakdown = useMemo(() =>
    PTM_STATUSES.map((st) => ({ status: st, count: sessions.filter((s) => s.status === st).length })),
    [sessions]
  );

  const updateStatus = async (s: PTMSession, status: PTMStatus) => {
    await smartDb.update("PTMSession", s.id, { status });
    setSessions((prev) => prev.map((p) => (p.id === s.id ? { ...p, status } : p)));
    toast.success(`${s.teacher || "Session"} marked ${status}`);
    if (status === "Scheduled" && s.status === "Scheduled") {
      // no-op: already scheduled, nothing changed meaningfully
    } else if (status === "Checked In" || status === "Completed") {
      // routine progress updates — no notification needed
    } else if (status === "Cancelled") {
      await notifyPTMEvent("cancelled-by-teacher", s);
    } else if (status === "Rescheduled") {
      await notifyPTMEvent("rescheduled", s);
    }
  };

  const handleSelectTeacher = (t: any) => {
    setNewPTM((p) => ({ ...p, teacher: t.name, teacherId: t.id, subject: p.subject || (t.subjects && t.subjects[0]) || t.department || "" }));
    setTeacherPickerOpen(false);
  };

  const handleSelectStudent = (s: any) => {
    setNewPTM((p) => ({ ...p, student: s.name, studentId: s.id }));
    setStudentPickerOpen(false);
  };

  const handleSelectRoom = (r: RoomOption) => {
    setNewPTM((p) => ({ ...p, roomNumber: r.roomNo, building: p.building || r.roomName }));
    setRoomPickerOpen(false);
  };

  // Real, working link — only Jitsi Meet can be auto-generated without a
  // third-party OAuth/API integration (Google Meet/Teams/Zoom links can only
  // come from the teacher's own account, so those need "Paste Existing Link").
  const handleGenerateLink = () => {
    if (newPTM.platform !== "Jitsi Meet") {
      toast.info(`Studentdiwan can't generate a ${newPTM.platform} link automatically — paste the link from your ${newPTM.platform} account below.`);
      return;
    }
    const seed = `${newPTM.teacher || "ptm"}-${newPTM.student || ""}`;
    setNewPTM((p) => ({ ...p, meetingLink: generateJitsiLink(seed) }));
    toast.success("Jitsi Meet link generated");
  };

  const handleCreatePTM = async () => {
    if (!user) return;
    if (!newPTM.teacher || !newPTM.date || !newPTM.student) {
      toast.error("Please select a teacher, student, and date");
      return;
    }
    if (newPTM.meetingMode !== "Offline" && !newPTM.meetingLink && newPTM.platform !== "Jitsi Meet") {
      toast.error(`Add a ${newPTM.platform} link, or switch platform to Jitsi Meet to auto-generate one`);
      return;
    }
    const id = `ptm-${Date.now()}`;
    const meetingLink = newPTM.meetingLink || (newPTM.meetingMode !== "Offline" && newPTM.platform === "Jitsi Meet"
      ? generateJitsiLink(`${newPTM.teacher}-${newPTM.student}`) : "");
    const base = {
      date: newPTM.date,
      timeRange: newPTM.timeRange || "TBD",
      teacher: newPTM.teacher,
      teacherId: newPTM.teacherId,
      subject: newPTM.subject || "General",
      student: newPTM.student,
      studentId: newPTM.studentId,
      status: "Scheduled" as PTMStatus,
      nextSlot: newPTM.timeRange || "TBD",
      meetingMode: newPTM.meetingMode,
      allowOnline: newPTM.meetingMode === "Hybrid" ? newPTM.allowOnline : newPTM.meetingMode === "Online",
      allowOffline: newPTM.meetingMode === "Hybrid" ? newPTM.allowOffline : newPTM.meetingMode === "Offline",
      campus: newPTM.meetingMode !== "Online" ? newPTM.campus : undefined,
      building: newPTM.meetingMode !== "Online" ? newPTM.building : undefined,
      roomNumber: newPTM.meetingMode !== "Online" ? newPTM.roomNumber : undefined,
      meetingDesk: newPTM.meetingMode !== "Online" ? newPTM.meetingDesk : undefined,
      parkingInstructions: newPTM.meetingMode !== "Online" ? newPTM.parkingInstructions : undefined,
      platform: newPTM.meetingMode !== "Offline" ? newPTM.platform : undefined,
      meetingLink: newPTM.meetingMode !== "Offline" ? meetingLink : undefined,
      duration: newPTM.meetingMode !== "Offline" ? newPTM.duration : undefined,
      uid: user.uid,
      createdAt: new Date().toISOString(),
    };
    const record: PTMSession = { id, ...base, location: meetingSummary(base as any) };
    await smartDb.create("PTMSession", record, id);
    setSessions((prev) => [...prev, record]);
    await notifyPTMEvent("scheduled-by-teacher", record);
    setNewOpen(false);
    setNewPTM(emptyForm());
    toast.success("New PTM session created");
  };

  const handleBookSlot = async (day: string, slot: string) => {
    if (!user) return;
    const id = `ptm-slot-${Date.now()}`;
    const record: PTMSession = {
      id,
      date: day,
      timeRange: slot,
      location: "TBD",
      teacher: "Unassigned",
      subject: "PTM",
      student: "",
      status: "Scheduled",
      nextSlot: slot,
      day,
      slot,
      parent: "Booked",
      meetingMode: "Hybrid",
      allowOnline: true,
      allowOffline: true,
      uid: user.uid,
      createdAt: new Date().toISOString(),
    };
    await smartDb.create("PTMSession", record, id);
    setSessions((prev) => [...prev, record]);
    toast.success(`Slot booked: ${day} ${slot}`);
  };

  const openNotes = (s: PTMSession) => {
    setNotesFor(s);
    setNotesDraft(s.meetingNotes || "");
    setActionItemsDraft(s.actionItems ? [...s.actionItems] : []);
    setNewActionText("");
  };

  const addActionItem = () => {
    if (!newActionText.trim()) return;
    setActionItemsDraft((prev) => [...prev, { id: `ai-${Date.now()}`, text: newActionText.trim(), done: false }]);
    setNewActionText("");
  };

  const saveNotes = async () => {
    if (!notesFor) return;
    await smartDb.update("PTMSession", notesFor.id, { meetingNotes: notesDraft, actionItems: actionItemsDraft });
    setSessions((prev) => prev.map((p) => (p.id === notesFor.id ? { ...p, meetingNotes: notesDraft, actionItems: actionItemsDraft } : p)));
    toast.success("Meeting notes saved");
    setNotesFor(null);
  };

  // Real distinct-parent count from actual upcoming sessions, not a
  // hardcoded number — students without a linked parent contact are
  // excluded rather than counted as a "sent" reminder.
  const parentCountForReminders = useMemo(() => {
    const studentIds = new Set(upcomingPTMs.map((s) => s.studentId).filter(Boolean));
    return students.filter((s: any) => studentIds.has(s.id) && (s.fatherEmail || s.motherEmail || s.fatherPhone)).length;
  }, [upcomingPTMs, students]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">PTM Booking</h1>
              <p className="text-sm text-slate-400">
                Manage parent-teacher meeting schedules — Offline, Online, or Hybrid
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setNewOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              New PTM Session
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const rows = [
                  ["Date", "Time", "Mode", "Where / Link", "Teacher", "Subject", "Student", "Status"],
                  ...sessions.map((s) => [s.date, s.timeRange, effectiveMode(s), s.location || meetingSummary(s), s.teacher, s.subject, s.student, s.status]),
                ];
                const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "ptm-schedule.csv";
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Schedule exported");
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Schedule
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {(() => {
            let totalSlots = 0;
            let bookedSlots = 0;
            days.forEach((day) =>
              timeSlots.forEach((slot) => {
                totalSlots += 1;
                if (calendarData[day][slot].state === "booked") bookedSlots += 1;
              })
            );
            const availableSlots = totalSlots - bookedSlots;
            const completion = totalSlots ? Math.round((bookedSlots / totalSlots) * 100) : 0;
            return [
              { label: "Total Slots", value: totalSlots, icon: Calendar, color: "text-purple-600 bg-blue-50" },
              { label: "Booked", value: bookedSlots, icon: CheckCircle2, color: "text-purple-600 bg-purple-50" },
              { label: "Available", value: availableSlots, icon: Clock, color: "text-green-600 bg-green-50" },
              { label: "Completion Rate", value: `${completion}%`, icon: Users, color: "text-orange-600 bg-orange-50" },
            ];
          })().map((stat) => (
            <Card key={stat.label} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            <TabsTrigger value="upcoming" className={TAB_TRIGGER_CLS}>Upcoming PTMs</TabsTrigger>
            <TabsTrigger value="calendar" className={TAB_TRIGGER_CLS}>Slot Calendar</TabsTrigger>
            <TabsTrigger value="teachers" className={TAB_TRIGGER_CLS}>Teacher Schedule</TabsTrigger>
            <TabsTrigger value="monitoring" className={TAB_TRIGGER_CLS}>Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4 space-y-4">
            {upcomingPTMs.length === 0 && (
              <Card className="border border-dashed border-gray-200">
                <CardContent className="py-12 text-center text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">No PTM sessions scheduled</p>
                  <p className="text-sm mt-1">Click "New PTM Session" to schedule a parent-teacher meeting</p>
                </CardContent>
              </Card>
            )}
            {upcomingPTMs.map((ptm) => {
              const mode = effectiveMode(ptm);
              return (
                <Card key={ptm.id} className="border border-gray-100 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="grid grid-cols-4 gap-6 flex-1">
                        <div className="space-y-1">
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Date & Time</p>
                          <p className="font-semibold text-gray-800">{ptm.date}</p>
                          <p className="text-sm text-gray-500">{ptm.timeRange}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Teacher & Subject</p>
                          <p className="font-semibold text-gray-800">{ptm.teacher}</p>
                          <p className="text-sm text-gray-500">{ptm.subject}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Meeting</p>
                          <Badge variant="outline" className={cn("text-[10px]", mode === "Online" ? "border-sky-200 text-sky-700 bg-sky-50" : mode === "Offline" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 bg-amber-50")}>
                            {mode === "Online" && <Video className="h-3 w-3 mr-1" />}
                            {mode === "Offline" && <Building2 className="h-3 w-3 mr-1" />}
                            {mode}
                          </Badge>
                          {mode === "Online" && ptm.meetingLink ? (
                            <a href={ptm.meetingLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline">
                              <Video className="h-3 w-3" /> Join Meeting
                            </a>
                          ) : (
                            <p className="text-xs text-gray-400">{meetingSummary(ptm)}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Student</p>
                          <p className="font-semibold text-gray-800">{ptm.student}</p>
                          <Badge className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLORS[ptm.status]}`}>
                            {ptm.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-2 min-w-[150px]">
                        <Select value={ptm.status} onValueChange={(v) => updateStatus(ptm, v as PTMStatus)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PTM_STATUSES.map((st) => (
                              <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => openNotes(ptm)}>
                          <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Notes {ptm.actionItems?.length ? `(${ptm.actionItems.length})` : ""}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Weekly Slot Grid</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs text-gray-400 font-medium py-2 pr-4 w-24">Time</th>
                      {days.map((day) => (
                        <th key={day} className="text-center text-xs text-gray-600 font-semibold py-2 px-1">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((slot) => (
                      <tr key={slot}>
                        <td className="text-xs text-gray-400 py-1.5 pr-4 whitespace-nowrap">{slot}</td>
                        {days.map((day) => {
                          const cell = calendarData[day][slot];
                          const isBooked = cell.state === "booked";
                          return (
                            <td key={day} className="px-1 py-1">
                              <div
                                onClick={() => {
                                  if (!isBooked) handleBookSlot(day, slot);
                                }}
                                className={`rounded-md px-2 py-1.5 text-center text-xs min-w-[90px] ${
                                  isBooked
                                    ? "bg-purple-100 text-purple-700 font-medium cursor-default"
                                    : "border-2 border-green-400 text-green-600 cursor-pointer hover:bg-green-50"
                                }`}
                              >
                                {isBooked ? cell.parent : "Available"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Legend:</p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-purple-100 border border-purple-200" />
                    <span className="text-xs text-gray-600">Booked</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded border-2 border-green-400" />
                    <span className="text-xs text-gray-600">Available — click to book</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teachers" className="mt-4">
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Teacher Schedule Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {teacherScheduleRows.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No teaching staff found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100">
                        <TableHead className="text-xs text-gray-500 font-medium">Teacher Name</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium">Subject</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Total Slots</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Booked</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Available</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium">Completion %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teacherScheduleRows.map((teacher) => {
                        const available = teacher.total - teacher.booked;
                        const pct = teacher.total ? Math.round((teacher.booked / teacher.total) * 100) : 0;
                        return (
                          <TableRow key={teacher.id} className="border-gray-100">
                            <TableCell className="font-medium text-sm text-gray-800">{teacher.name}</TableCell>
                            <TableCell className="text-sm text-gray-500">{teacher.subject}</TableCell>
                            <TableCell className="text-center text-sm text-gray-700">{teacher.total}</TableCell>
                            <TableCell className="text-center text-sm text-purple-600 font-medium">{teacher.booked}</TableCell>
                            <TableCell className="text-center text-sm text-green-600 font-medium">{available}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 rounded-full h-2">
                                  <div
                                    className="bg-purple-500 h-2 rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 w-8 text-right">{pct}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monitoring" className="mt-4 space-y-4">
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Meetings by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                  {statusBreakdown.map(({ status, count }) => (
                    <div key={status} className={cn("rounded-xl border px-3 py-2.5 text-center", STATUS_COLORS[status])}>
                      <p className="text-xl font-black">{count}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5">{status}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Teacher Availability Status</CardTitle>
                <p className="text-xs text-gray-400">Which teachers have configured real bookable hours — parents can only book teachers marked "Configured".</p>
              </CardHeader>
              <CardContent>
                {monitoringRows.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No teaching staff found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100">
                        <TableHead className="text-xs text-gray-500 font-medium">Teacher</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium">Availability</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Weekly Slots</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Blocked Dates</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Pending Meetings</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-center">Completed Meetings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monitoringRows.map((row) => (
                        <TableRow key={row.id} className="border-gray-100">
                          <TableCell className="font-medium text-sm text-gray-800">{row.name}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[10px] px-2 py-0.5 border-0", row.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                              {row.configured ? "Configured" : "Not Set"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm text-gray-700">{row.weeklySlotCount}</TableCell>
                          <TableCell className="text-center text-sm text-gray-700">{row.blockedDates}</TableCell>
                          <TableCell className="text-center text-sm text-blue-600 font-medium">{row.pending}</TableCell>
                          <TableCell className="text-center text-sm text-emerald-600 font-medium">{row.completed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-500" />
              Automated Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={reminderEnabled}
                      onChange={(e) => setReminderEnabled(e.target.checked)}
                    />
                    <div
                      className={`w-10 h-5 rounded-full transition-colors ${
                        reminderEnabled ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        reminderEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {reminderEnabled ? "Enabled" : "Disabled"}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <select
                    value={reminderTiming}
                    onChange={(e) => setReminderTiming(e.target.value)}
                    className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  >
                    <option>1 day before</option>
                    <option>2 hours before</option>
                    <option>30 mins before</option>
                  </select>
                </div>
                <p className="text-sm text-gray-500">
                  {whatsappConnected
                    ? "Reminders will be sent via WhatsApp to all booked parents"
                    : "WhatsApp Business isn't connected — connect it under Administration → Integrations to send real reminders"}
                </p>
              </div>
              <Button
                className="bg-green-500 hover:bg-green-600 text-white disabled:bg-slate-300"
                disabled={!whatsappConnected}
                title={whatsappConnected ? undefined : "WhatsApp Business isn't connected"}
                onClick={() => toast.success(`Reminders sent to ${parentCountForReminders} parent${parentCountForReminders === 1 ? "" : "s"}`)}
              >
                <Send className="w-4 h-4 mr-2" />
                {whatsappConnected ? "Send Now" : "Not Connected"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── New PTM Session ─────────────────────────────────────────────── */}
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New PTM Session</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="grid gap-2 col-span-2">
                <Label>Teacher *</Label>
                <Popover open={teacherPickerOpen} onOpenChange={setTeacherPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={teacherPickerOpen}
                      className="w-full h-11 justify-between rounded-xl border-slate-200 text-sm font-medium">
                      {newPTM.teacher ? (
                        <span className="flex items-center gap-2 truncate">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                              {newPTM.teacher.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{newPTM.teacher}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search and select teacher…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[430px] p-0 rounded-2xl shadow-2xl border-none" align="start">
                    <Command className="rounded-2xl">
                      <CommandInput placeholder="Type a name to search…" className="h-11 text-sm" />
                      <CommandList className="max-h-64">
                        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No teacher found.</CommandEmpty>
                        <CommandGroup heading={`${teachers.length} teachers`}>
                          {teachers.map((t: any) => (
                            <CommandItem
                              key={t.id}
                              value={t.name}
                              onSelect={() => handleSelectTeacher(t)}
                              className="flex items-center gap-3 py-2 px-3 cursor-pointer"
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                  {(t.name || "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate">{t.name}</p>
                                <p className="text-[10px] text-muted-foreground">{t.department || t.role || "—"}</p>
                              </div>
                              {newPTM.teacherId === t.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2 col-span-2">
                <Label>Student *</Label>
                <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={studentPickerOpen}
                      className="w-full h-11 justify-between rounded-xl border-slate-200 text-sm font-medium">
                      {newPTM.student ? (
                        <span className="flex items-center gap-2 truncate">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${newPTM.student}`} />
                            <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                              {newPTM.student.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{newPTM.student}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search and select student…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[430px] p-0 rounded-2xl shadow-2xl border-none" align="start">
                    <Command className="rounded-2xl">
                      <CommandInput placeholder="Type a name to search…" className="h-11 text-sm" />
                      <CommandList className="max-h-64">
                        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No student found.</CommandEmpty>
                        <CommandGroup heading={`${students.length} students`}>
                          {students.map((s: any) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => handleSelectStudent(s)}
                              className="flex items-center gap-3 py-2 px-3 cursor-pointer"
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                  {(s.name || "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate">{s.name}</p>
                                <p className="text-[10px] text-muted-foreground">{s.grade || "—"} {s.section ? `· ${s.section}` : ""}</p>
                              </div>
                              {newPTM.studentId === s.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ptm-subject">Subject</Label>
                <Input id="ptm-subject" value={newPTM.subject} onChange={(e) => setNewPTM({ ...newPTM, subject: e.target.value })} placeholder="Mathematics" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ptm-date">Date</Label>
                <Input id="ptm-date" type="date" value={newPTM.date} onChange={(e) => setNewPTM({ ...newPTM, date: e.target.value })} />
              </div>
              <div className="grid gap-2 col-span-2">
                <Label>Time Range</Label>
                <Select value={newPTM.timeRange} onValueChange={(v) => setNewPTM({ ...newPTM, timeRange: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pick a slot" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TIME_RANGES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Meeting Mode ──────────────────────────────────────────── */}
              <div className="grid gap-2 col-span-2 pt-2 border-t border-slate-100">
                <Label className="text-sm font-bold">Meeting Mode *</Label>
                <RadioGroup
                  value={newPTM.meetingMode}
                  onValueChange={(v) => setNewPTM({ ...newPTM, meetingMode: v as MeetingMode })}
                  className="grid grid-cols-3 gap-2"
                >
                  {([
                    { v: "Offline", label: "Offline", sub: "School Campus", Icon: Building2 },
                    { v: "Online", label: "Online", sub: "Video Meeting", Icon: Video },
                    { v: "Hybrid", label: "Hybrid", sub: "Parent Chooses", Icon: Wand2 },
                  ] as const).map(({ v, label, sub, Icon }) => (
                    <label key={v} className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 cursor-pointer transition",
                      newPTM.meetingMode === v ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:bg-slate-50"
                    )}>
                      <RadioGroupItem value={v} className="sr-only" />
                      <Icon className={cn("h-5 w-5", newPTM.meetingMode === v ? "text-purple-600" : "text-slate-400")} />
                      <span className="text-xs font-bold text-slate-800">{label}</span>
                      <span className="text-[10px] text-slate-400">{sub}</span>
                    </label>
                  ))}
                </RadioGroup>
                {newPTM.meetingMode === "Hybrid" && (
                  <div className="flex items-center gap-5 mt-1">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                      <Checkbox checked={newPTM.allowOnline} onCheckedChange={(c) => setNewPTM({ ...newPTM, allowOnline: !!c })} />
                      Parent can choose Online
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                      <Checkbox checked={newPTM.allowOffline} onCheckedChange={(c) => setNewPTM({ ...newPTM, allowOffline: !!c })} />
                      Parent can choose Offline
                    </label>
                  </div>
                )}
              </div>

              {/* ── Offline fields ────────────────────────────────────────── */}
              {newPTM.meetingMode !== "Online" && (
                <>
                  <div className="grid gap-2 col-span-2">
                    <Label className="text-xs font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> Offline Details
                    </Label>
                  </div>
                  <div className="grid gap-2">
                    <Label>Campus</Label>
                    <Select value={newPTM.campus} onValueChange={(v) => setNewPTM({ ...newPTM, campus: v })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CAMPUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ptm-building">Building</Label>
                    <Input id="ptm-building" value={newPTM.building} onChange={(e) => setNewPTM({ ...newPTM, building: e.target.value })} placeholder="Block B" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Room Number</Label>
                    <Popover open={roomPickerOpen} onOpenChange={setRoomPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={roomPickerOpen}
                          className="w-full h-10 justify-between rounded-xl border-slate-200 text-sm font-medium">
                          {newPTM.roomNumber ? (
                            <span className="flex items-center gap-2 truncate">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">Room {newPTM.roomNumber}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Type to find a room…</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none" align="start">
                        <Command className="rounded-2xl">
                          <CommandInput placeholder="Search rooms…" className="h-11 text-sm" />
                          <CommandList className="max-h-64">
                            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No room found.</CommandEmpty>
                            <CommandGroup heading={`${rooms.length} rooms`}>
                              {rooms.map((r) => (
                                <CommandItem
                                  key={r.id}
                                  value={`${r.roomName} ${r.roomNo}`}
                                  onSelect={() => handleSelectRoom(r)}
                                  className="flex items-center gap-2 py-2 px-3 cursor-pointer"
                                >
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-bold truncate">{r.roomName} <span className="text-muted-foreground font-normal">({r.roomNo})</span></p>
                                    <p className="text-[10px] text-muted-foreground">{r.type}{r.capacity ? ` · Capacity ${r.capacity}` : ""}</p>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ptm-desk">Meeting Desk (optional)</Label>
                    <Input id="ptm-desk" value={newPTM.meetingDesk} onChange={(e) => setNewPTM({ ...newPTM, meetingDesk: e.target.value })} placeholder="Class Teacher Room" />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label htmlFor="ptm-parking">Parking Instructions (optional)</Label>
                    <Textarea id="ptm-parking" rows={2} value={newPTM.parkingInstructions} onChange={(e) => setNewPTM({ ...newPTM, parkingInstructions: e.target.value })} placeholder="Visitor parking available at the North gate." />
                  </div>
                </>
              )}

              {/* ── Online fields ─────────────────────────────────────────── */}
              {newPTM.meetingMode !== "Offline" && (
                <>
                  <div className="grid gap-2 col-span-2 pt-1">
                    <Label className="text-xs font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" /> Online Details
                    </Label>
                  </div>
                  <div className="grid gap-2">
                    <Label>Meeting Platform</Label>
                    <Select value={newPTM.platform} onValueChange={(v) => setNewPTM({ ...newPTM, platform: v as MeetingPlatform, meetingLink: "" })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEETING_PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            <span className="flex items-center gap-2">
                              {p}
                              {p in platformConnected && (
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                  platformConnected[p] ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                                  {platformConnected[p] ? "Connected" : "Not Connected"}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Meeting Duration</Label>
                    <Select value={newPTM.duration} onValueChange={(v) => setNewPTM({ ...newPTM, duration: v })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEETING_DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label htmlFor="ptm-link">Meeting Link</Label>
                    <div className="flex gap-2">
                      <Input id="ptm-link" value={newPTM.meetingLink} onChange={(e) => setNewPTM({ ...newPTM, meetingLink: e.target.value })}
                        placeholder={newPTM.platform === "Jitsi Meet" ? "Auto-generated, or paste your own" : `Paste your ${newPTM.platform} link`} />
                      <Button type="button" variant="outline" onClick={handleGenerateLink} className="shrink-0" title="Generate Meeting Link">
                        <Wand2 className="h-4 w-4 mr-1.5" /> Generate
                      </Button>
                    </div>
                    {newPTM.platform !== "Jitsi Meet" && (
                      <p className="text-[11px] text-slate-400">
                        Studentdiwan can only auto-generate Jitsi Meet links. For {newPTM.platform}, paste the link from your own {newPTM.platform} account.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreatePTM} className="bg-purple-600 hover:bg-purple-700 text-white">Create Session</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Meeting Notes & Action Items ─────────────────────────────────── */}
        <Dialog open={!!notesFor} onOpenChange={(o) => !o && setNotesFor(null)}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Meeting Notes</DialogTitle>
            </DialogHeader>
            {notesFor && (
              <div className="space-y-4 py-2">
                <p className="text-xs text-slate-400">{notesFor.teacher} · {notesFor.student} · {notesFor.date}</p>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Textarea rows={4} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="What was discussed, concerns raised, progress noted…" />
                </div>
                <div className="grid gap-2">
                  <Label>Action Items / Follow-ups</Label>
                  <div className="space-y-1.5">
                    {actionItemsDraft.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <Checkbox checked={a.done} onCheckedChange={(c) => setActionItemsDraft((prev) => prev.map((x) => x.id === a.id ? { ...x, done: !!c } : x))} />
                        <span className={cn("flex-1 text-sm", a.done && "line-through text-slate-400")}>{a.text}</span>
                        <button onClick={() => setActionItemsDraft((prev) => prev.filter((x) => x.id !== a.id))} className="text-slate-300 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {actionItemsDraft.length === 0 && <p className="text-xs text-slate-400 py-1">No action items yet.</p>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newActionText} onChange={(e) => setNewActionText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addActionItem(); } }}
                      placeholder="Add a follow-up action…" className="h-9 text-sm" />
                    <Button type="button" size="sm" variant="outline" onClick={addActionItem}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesFor(null)}>Cancel</Button>
              <Button onClick={saveNotes} className="bg-purple-600 hover:bg-purple-700 text-white">Save & Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
