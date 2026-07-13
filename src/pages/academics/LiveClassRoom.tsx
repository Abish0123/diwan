import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useLiveClasses } from "@/contexts/LiveClassContext";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { JitsiEmbed } from "@/components/live-class/JitsiEmbed";
import { useTranslation } from "react-i18next";
import {
  Video, MoreVertical, Clock, Users, CalendarDays, BookOpen,
  Wifi, PenTool, Hand, Circle, MoreHorizontal, Presentation,
  PhoneOff, Search, Filter, Send, FileText, ExternalLink,
  Download, CheckCircle2, Loader2,
} from "lucide-react";

const AVATAR_COLORS = [
  "bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500",
  "bg-sky-500", "bg-rose-500", "bg-violet-500", "bg-teal-500",
];
function Avatar({ name, className }: { name: string; className?: string }) {
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = name.charAt(0).toUpperCase() + (name.split(" ")[1]?.charAt(0).toUpperCase() || "");
  return (
    <div className={cn("rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", color, className || "w-9 h-9")}>
      {initials}
    </div>
  );
}

interface RosterStudent {
  id: string;
  name: string;
  grade: string;
  section: string;
}

type Tab = "details" | "materials" | "whiteboard" | "polls" | "qa" | "recording";

const normGrade = (g: string) => (g || "").toLowerCase().replace("grade ", "").trim();

export default function LiveClassRoom() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { liveClasses, loading } = useLiveClasses();
  const { assignment } = useTeacherClass();

  const currentClass = liveClasses.find((c: any) => c.id === id) as any;

  // Real class metadata — the live-class record first, the teacher's own class
  // assignment as fallback, never a hardcoded value.
  const grade   = currentClass?.grade   || assignment.grade   || "";
  const section = (currentClass?.section || assignment.section || "").toUpperCase();
  const subject = currentClass?.subject || "—";
  const chapter = currentClass?.chapter || currentClass?.topic || currentClass?.description || "—";
  const title   = currentClass?.title || [grade && section ? `${grade} - ${section}` : grade, subject !== "—" ? subject : ""].filter(Boolean).join(" - ");
  const startTime = currentClass?.startTime || "";
  const endTime   = currentClass?.endTime || "";
  const classDate = currentClass?.date || "";
  // Classes scheduled before Jitsi was wired in have no jitsiRoom on their
  // record — fall back to a name derived from the class id so joining still
  // always opens a real (if unlabeled) call instead of erroring.
  const jitsiRoom = currentClass?.jitsiRoom || `StudentDiwan-live-${id}`;

  // Real roster: students of this class's grade + section. Student rows stamp
  // uid with the creating staff account, so fetch unscoped and filter here.
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  useEffect(() => {
    if (!grade) { setRoster([]); setRosterLoading(false); return; }
    let cancelled = false;
    setRosterLoading(true);
    smartDb.getAll("Student", "").then((all: any[]) => {
      if (cancelled) return;
      const wantG = normGrade(grade);
      const filtered = (all || []).filter((s: any) => {
        if (normGrade(s.grade || s.gradeLevel || "") !== wantG) return false;
        if (section && (s.section || "").toUpperCase() !== section) return false;
        return true;
      });
      setRoster(filtered.map((s: any) => ({
        id: s.id || s.uid || "",
        name: s.name || s.studentName || s.displayName || t("admin.academics.liveClassRoom.defaultStudentName"),
        grade: s.grade || s.gradeLevel || "",
        section: s.section || "",
      })).filter((s: RosterStudent) => s.id));
    }).catch(() => setRoster([])).finally(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
  }, [grade, section]);

  // Attendance: one row per live class in `live_class_attendance`, keyed by an
  // explicit id so repeat saves upsert instead of duplicating (same pattern as
  // the sd seating/settings rows).
  const attendanceRowId = `lca_${id}`;
  const [present, setPresent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    smartDb.getAll("live_class_attendance", "").then((rows: any[]) => {
      if (cancelled) return;
      const row = (rows || []).find((r: any) => r.id === attendanceRowId || r.classId === id);
      if (row && row.present && typeof row.present === "object") setPresent(row.present);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, attendanceRowId]);

  const persistAttendance = useCallback((next: Record<string, boolean>) => {
    smartDb.create("live_class_attendance", {
      id: attendanceRowId,
      classId: id,
      present: next,
      markedBy: user?.uid || "",
      updatedAt: new Date().toISOString(),
    }, attendanceRowId).catch(() => toast.error(t("admin.academics.liveClassRoom.failedToSaveAttendance")));
  }, [attendanceRowId, id, user?.uid]);

  const toggleAttendance = useCallback((studentId: string) => {
    setPresent(prev => {
      const next = { ...prev, [studentId]: !prev[studentId] };
      persistAttendance(next);
      return next;
    });
  }, [persistAttendance]);

  // Elapsed time from the class's real start, when parseable.
  const initialElapsed = useMemo(() => {
    if (!classDate || !startTime) return 0;
    const start = Date.parse(`${classDate} ${startTime}`);
    if (isNaN(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 1000));
  }, [classDate, startTime]);

  const [timer, setTimer] = useState(initialElapsed);
  useEffect(() => { setTimer(initialElapsed); }, [initialElapsed]);

  const [handRaised, setHandRaised] = useState(false);
  const [recording, setRecording] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [participantSearch, setParticipantSearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<{ who: string; me: boolean; text: string; time: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTimer(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const totalStudents = roster.length;
  const joined = roster.filter(s => present[s.id]).length;

  const filteredRoster = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(s => s.name.toLowerCase().includes(q));
  }, [roster, participantSearch]);

  // Upcoming classes: real scheduled records, not fabricated ones.
  const upcomingClasses = useMemo(() =>
    liveClasses
      .filter((c: any) => c.id !== id && c.status !== "completed" && c.status !== "cancelled")
      .filter((c: any) => {
        const t = Date.parse(`${c.date || ""} ${c.startTime || ""}`);
        return !isNaN(t) ? t > Date.now() : true;
      })
      .slice(0, 3),
    [liveClasses, id]);

  const endClass = () => {
    toast.success(t("admin.academics.liveClassRoom.classEndedAttendanceSaved"));
    navigate("/academics/live-classes");
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setChat(c => [...c, { who: t("admin.academics.liveClassRoom.you"), me: true, text: chatInput.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }]);
    setChatInput("");
  };

  const KPIS = [
    { icon: Clock,         bg: "bg-purple-50",  ic: "text-purple-500",  label: t("admin.academics.liveClassRoom.timeElapsed"),  value: fmt(timer),            sub: endTime ? t("admin.academics.liveClassRoom.untilTime", { time: endTime }) : "" },
    { icon: Users,         bg: "bg-emerald-50", ic: "text-emerald-500", label: t("admin.academics.liveClassRoom.studentsPresent"), value: `${joined} / ${totalStudents}`, sub: totalStudents ? `${Math.round((joined / totalStudents) * 100)}%` : t("admin.academics.liveClassRoom.noRoster") },
    { icon: CalendarDays,  bg: "bg-amber-50",   ic: "text-amber-500",   label: t("admin.academics.liveClassRoom.startedAt"),    value: startTime || "—",      sub: classDate || "" },
    { icon: BookOpen,      bg: "bg-blue-50",    ic: "text-blue-500",    label: t("admin.academics.liveClassRoom.subject"),       value: subject,               sub: chapter !== "—" ? chapter.split(":")[0] : "" },
    { icon: Wifi,          bg: "bg-teal-50",    ic: "text-teal-500",    label: t("admin.academics.liveClassRoom.classStatus"),  value: currentClass?.status ? String(currentClass.status).replace(/^\w/, (c: string) => c.toUpperCase()) : t("admin.academics.liveClassRoom.live"), sub: t("admin.academics.liveClassRoom.session") },
  ];

  // Mic/camera/screen-share are handled by Jitsi's own in-call toolbar now —
  // these only stay here for app-level features Jitsi doesn't cover.
  const CONTROLS = [
    { key: "hand",  label: t("admin.academics.liveClassRoom.raiseHand"), icon: Hand, active: handRaised, onClick: () => { setHandRaised(h => !h); if (!handRaised) toast.success(t("admin.academics.liveClassRoom.handRaised")); } },
    { key: "rec",   label: recording ? t("admin.academics.liveClassRoom.stopRec") : t("admin.academics.liveClassRoom.record"), icon: Circle, active: recording, danger: recording, onClick: () => { setRecording(r => !r); toast[recording ? "info" : "success"](recording ? t("admin.academics.liveClassRoom.recordingStopped") : t("admin.academics.liveClassRoom.recordingStarted")); } },
    { key: "more",  label: t("admin.academics.liveClassRoom.more"), icon: MoreHorizontal, onClick: () => toast.info(t("admin.academics.liveClassRoom.moreOptions")) },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-10 w-10 text-purple-600 animate-spin mb-3" />
          <p className="text-sm font-medium">{t("admin.academics.liveClassRoom.connectingToClassroom")}</p>
        </div>
      </DashboardLayout>
    );
  }

  const TABS: { k: Tab; label: string }[] = [
    { k: "details", label: t("admin.academics.liveClassRoom.classDetails") }, { k: "materials", label: t("admin.academics.liveClassRoom.materials") },
    { k: "whiteboard", label: t("admin.academics.liveClassRoom.whiteboard") }, { k: "polls", label: t("admin.academics.liveClassRoom.polls") },
    { k: "qa", label: t("admin.academics.liveClassRoom.qa") }, { k: "recording", label: t("admin.academics.liveClassRoom.recording") },
  ];

  const classLabel = [grade, section].filter(Boolean).join(" - ") || "—";

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Video className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{title || t("admin.academics.liveClassRoom.liveClass")}</h1>
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t("admin.academics.liveClassRoom.live")}
                </span>
              </div>
              <p className="text-sm text-slate-400">{classLabel} &nbsp;|&nbsp; {subject} &nbsp;|&nbsp; {chapter}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={endClass}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-rose-200 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <PhoneOff className="h-4 w-4" /> {t("admin.academics.liveClassRoom.endClass")}
            </button>
            <button onClick={() => toast.info(t("admin.academics.liveClassRoom.classOptions"))}
              className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-3">
          {KPIS.map((k, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{k.label}</span>
              </div>
              <p className="text-xl font-bold text-slate-900 leading-none truncate">{k.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Stage + sidebar */}
        <div className="grid grid-cols-3 gap-4">

          {/* Presentation stage — a real Jitsi Meet call, not a mockup */}
          <div className="col-span-2 bg-[#0f1320] rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800/80">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5 text-emerald-400" /> {jitsiRoom}
              </span>
              <a
                href={`https://meet.jit.si/${jitsiRoom}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                title={t("admin.academics.liveClassRoom.openThisCallInNewTab")}
              >
                {t("admin.academics.liveClassRoom.openInJitsiMeet")} <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex-1 min-h-[420px]">
              <JitsiEmbed
                roomName={jitsiRoom}
                displayName={user?.displayName || t("admin.academics.liveClassRoom.teacher")}
                className="h-full w-full"
                onLeave={endClass}
              />
            </div>

            {/* Control toolbar — mic/camera/screen-share live inside the Jitsi call above */}
            <div className="px-4 py-3 border-t border-slate-800/80 flex items-center justify-center gap-2.5">
              {CONTROLS.map(c => (
                <button key={c.key} onClick={c.onClick} title={c.label}
                  className="flex flex-col items-center gap-1 group">
                  <span className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                    c.danger ? "bg-rose-500/20 text-rose-400" :
                    c.active ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 group-hover:bg-slate-700")}>
                    <c.icon className={cn("h-4 w-4", c.key === "rec" && c.active && "fill-rose-400")} />
                  </span>
                  <span className="text-[8px] text-slate-400">{c.label}</span>
                </button>
              ))}
              <button onClick={endClass} title={t("admin.academics.liveClassRoom.endClass")} className="flex flex-col items-center gap-1 group ms-1">
                <span className="px-3.5 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center group-hover:bg-rose-600 transition-colors">
                  <PhoneOff className="h-4 w-4" />
                </span>
                <span className="text-[8px] text-slate-400">{t("admin.academics.liveClassRoom.endClass")}</span>
              </button>
            </div>
          </div>

          {/* Right: participants + chat */}
          <div className="space-y-4 flex flex-col">
            {/* Participants / attendance */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">{t("admin.academics.liveClassRoom.classParticipantsCount", { joined, total: totalStudents })}</h3>
              </div>
              <div className="px-4 py-2.5 flex items-center gap-2 border-b border-slate-50">
                <div className="relative flex-1">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input placeholder={t("admin.academics.liveClassRoom.searchParticipants")}
                    value={participantSearch}
                    onChange={e => setParticipantSearch(e.target.value)}
                    className="w-full ps-8 pe-3 h-8 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                </div>
                <button className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50" title={t("admin.academics.liveClassRoom.filter")}>
                  <Filter className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-50 max-h-[240px] overflow-y-auto">
                {rosterLoading ? (
                  <div className="px-4 py-6 flex items-center justify-center text-slate-400 text-xs">
                    <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("admin.academics.liveClassRoom.loadingRoster")}
                  </div>
                ) : filteredRoster.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    {roster.length === 0
                      ? (grade ? t("admin.academics.liveClassRoom.noStudentsFoundFor", { classLabel }) : t("admin.academics.liveClassRoom.noGradeAssignedYet"))
                      : t("admin.academics.liveClassRoom.noParticipantsMatchSearch")}
                  </div>
                ) : filteredRoster.map(p => {
                  const isPresent = !!present[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={isPresent}
                        onChange={() => toggleAttendance(p.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-400 cursor-pointer"
                        title={isPresent ? t("admin.academics.liveClassRoom.markAbsent") : t("admin.academics.liveClassRoom.markPresent")}
                      />
                      <Avatar name={p.name} className="w-8 h-8 text-[10px]" />
                      <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{p.name}</span>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded",
                        isPresent ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                        {isPresent ? t("admin.academics.liveClassRoom.present") : t("admin.academics.liveClassRoom.absent")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Chat */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col flex-1 min-h-[260px]">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">💬 {t("admin.academics.liveClassRoom.liveChat")}</h3>
                <MoreVertical className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chat.length === 0 && (
                  <p className="text-center text-xs text-slate-300 pt-8">{t("admin.academics.liveClassRoom.noMessagesYet")}</p>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={cn("flex gap-2", m.me && "flex-row-reverse")}>
                    {!m.me && <Avatar name={m.who} className="w-6 h-6 text-[9px]" />}
                    <div className={cn("max-w-[75%]", m.me && "items-end flex flex-col")}>
                      {!m.me && <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{m.who}</p>}
                      <div className={cn("px-3 py-1.5 rounded-2xl text-xs",
                        m.me ? "bg-purple-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-700 rounded-bl-sm")}>
                        {m.text}
                      </div>
                      <p className="text-[9px] text-slate-300 mt-0.5">{m.time}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-slate-50 flex items-center gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  placeholder={t("admin.academics.liveClassRoom.typeAMessage")}
                  className="flex-1 h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                <button onClick={sendChat} className="w-9 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tabs */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm">
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
                  tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div className="p-5 grid grid-cols-3 gap-5">
              {/* Class Information */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-3">{t("admin.academics.liveClassRoom.classInformation")}</h4>
                <div className="space-y-3">
                  {[
                    { icon: Users,        label: t("admin.academics.liveClassRoom.classLabel"), value: classLabel },
                    { icon: BookOpen,     label: t("admin.academics.liveClassRoom.subject"), value: subject },
                    { icon: FileText,     label: t("admin.academics.liveClassRoom.topic"), value: chapter },
                    { icon: Clock,        label: t("admin.academics.liveClassRoom.duration"), value: startTime && endTime ? `${startTime} - ${endTime}` : "—" },
                    { icon: CalendarDays, label: t("admin.academics.liveClassRoom.date"), value: classDate || "—" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <r.icon className="h-4 w-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">{r.label}</p>
                        <p className="text-xs font-semibold text-slate-800">{r.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attendance summary */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-3">{t("admin.academics.liveClassRoom.attendance")}</h4>
                {totalStudents === 0 ? (
                  <p className="text-xs text-slate-400">{t("admin.academics.liveClassRoom.noRosterLoadedYet")}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{t("admin.academics.liveClassRoom.markedPresentCount", { count: joined })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Circle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{t("admin.academics.liveClassRoom.notYetMarkedCount", { count: totalStudents - joined })}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${totalStudents ? Math.round((joined / totalStudents) * 100) : 0}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {t("admin.academics.liveClassRoom.toggleCheckboxesHint")}
                    </p>
                  </div>
                )}
              </div>

              {/* Upcoming Live Classes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900 text-sm">{t("admin.academics.liveClassRoom.upcomingLiveClasses")}</h4>
                </div>
                {upcomingClasses.length === 0 ? (
                  <p className="text-xs text-slate-400">{t("admin.academics.liveClassRoom.noUpcomingClassesScheduled")}</p>
                ) : (
                  <div className="space-y-2.5">
                    {upcomingClasses.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2.5">
                        <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex flex-col items-center justify-center flex-shrink-0">
                          <CalendarDays className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{c.subject || c.title}</p>
                          <p className="text-[10px] text-slate-400">{[c.startTime, c.endTime].filter(Boolean).join(" - ") || "—"}</p>
                          <p className="text-[10px] text-slate-400">{c.date || ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab !== "details" && (
            <div className="p-10 flex flex-col items-center justify-center text-slate-400">
              {tab === "materials" && <Presentation className="h-10 w-10 mb-2 opacity-30" />}
              {tab === "whiteboard" && <PenTool className="h-10 w-10 mb-2 opacity-30" />}
              {tab === "polls" && <CheckCircle2 className="h-10 w-10 mb-2 opacity-30" />}
              {tab === "qa" && <Hand className="h-10 w-10 mb-2 opacity-30" />}
              {tab === "recording" && <Circle className="h-10 w-10 mb-2 opacity-30" />}
              <p className="text-sm font-semibold capitalize">{TABS.find(t => t.k === tab)?.label}</p>
              <p className="text-xs mt-1">
                {tab === "polls" ? t("admin.academics.liveClassRoom.launchLivePollHint") :
                 tab === "qa" ? t("admin.academics.liveClassRoom.studentQuestionsHint") :
                 tab === "recording" ? (recording ? t("admin.academics.liveClassRoom.recordingInProgress") : t("admin.academics.liveClassRoom.startRecordingHint")) :
                 tab === "whiteboard" ? t("admin.academics.liveClassRoom.openWhiteboardHint") :
                 t("admin.academics.liveClassRoom.shareStudyMaterialsHint")}
              </p>
              {tab === "materials" && (
                <button onClick={() => navigate("/teacher/study-materials")} className="mt-3 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" /> {t("admin.academics.liveClassRoom.openStudyMaterials")}
                </button>
              )}
              {tab === "polls" && (
                <button onClick={() => toast.success(t("admin.academics.liveClassRoom.pollCreated"))} className="mt-3 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">
                  {t("admin.academics.liveClassRoom.createPoll")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
