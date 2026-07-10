import { useState, useMemo, useEffect, useRef } from "react";
import { useGrades } from "@/contexts/CurriculumContext";
import { useTimetableSettings, DEFAULT_SETTINGS } from "@/hooks/useTimetableSettings";
import { useAuth } from "@/hooks/useAuth";
import {
  loadTimetableRules, getTeacherLimit, DEFAULT_TIMETABLE_RULES, type TimetableRules,
  findAssignedTeacher, subjectsAssignedFor, subjectsAssignedToTeacher,
} from "@/lib/timetableRules";
import socket from "@/lib/socket";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Calendar as CalendarIcon, Filter, Plus, ChevronDown, ChevronLeft, ChevronRight,
  Zap, CalendarRange, Settings, Info, Video, MapPin, User, Wifi, X, Check,
  CalendarDays, Users, Monitor, Trash2, Globe, Sparkles, Search, GraduationCap,
  ChevronUp, BookOpen, Save, ChevronsUpDown, AlertTriangle, ShieldCheck, Lock,
  Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useIntegrationConnected } from "@/hooks/useIntegrationStatus";

// ─── Types ───────────────────────────────────────────────────────────────────
type Mode = "Physical" | "Online" | "Hybrid";
interface Slot { mode: Mode; subject: string; teacher: string; room: string; }

// ─── Static Data ─────────────────────────────────────────────────────────────
// TIME_SLOTS is now computed dynamically from TimetableSettings (see useTimetableSettings hook)

const CLASSROOMS = ["Room 201","Room 202","Room 203","Room 204","Room 205","Room 206","Lab 1","Lab 2","Art Room","Play Ground","Library"];
// Every entry here maps to a real integration provider id (see
// integrationsConfig.ts) — filtered down to only the ones actually connected
// before being offered as a choice (see useConnectedPlatforms below), so a
// user never picks "Zoom" only to find out later nothing real backs it.
const ALL_PLATFORMS: { label: string; providerId: string }[] = [
  { label: "Jitsi Meet", providerId: "jitsi" },
  { label: "Google Meet", providerId: "googlemeet-live" },
  { label: "Zoom", providerId: "zoom" },
  { label: "Microsoft Teams", providerId: "msteams" },
];

// ─── Sidebar structure ────────────────────────────────────────────────────────
// ALL_GRADES kept only for INITIAL_TIMETABLES seed (module-level, can't use hook)
const ALL_GRADES_SEED = [
  "Pre-KG","LKG","UKG","Grade 1","Grade 2","Grade 3","Grade 4",
  "Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
];
const ALL_SECTIONS = ["A", "B", "C"];

// ─── Grade colour palette ─────────────────────────────────────────────────────
const GRADE_COLORS = [
  "from-violet-500 to-fuchsia-600","from-fuchsia-500 to-purple-600",
  "from-purple-500 to-purple-600","from-indigo-500 to-purple-600",
  "from-blue-500 to-sky-600","from-sky-500 to-cyan-600",
  "from-cyan-500 to-teal-600","from-teal-500 to-emerald-600",
  "from-emerald-500 to-green-600","from-green-500 to-lime-600",
  "from-lime-500 to-amber-600","from-amber-500 to-orange-600",
  "from-orange-500 to-red-600","from-red-500 to-rose-600",
  "from-rose-500 to-pink-600",
];

const SECTION_BADGE: Record<string,string> = {
  A: "bg-purple-100 text-purple-700 border-purple-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-green-100 text-green-700 border-green-200",
};

// ─── Qatar school workload limits (periods per day) ──────────────────────────
// Defaults; overridden by admin via Settings → Timetable Workload Limits
// (types/functions shared via @/lib/timetableRules — imported at top of file)

// Role badge label and colour for the workload indicator
function roleBadge(role: string): { label: string; cls: string } {
  if (!role) return { label: "Teacher", cls: "bg-slate-100 text-slate-600" };
  if (role === "Principal" || role === "Vice Principal")
    return { label: role, cls: "bg-rose-100 text-rose-700" };
  if (role === "Grade Coordinator")
    return { label: "Coord.", cls: "bg-violet-100 text-violet-700" };
  if (role.startsWith("HOD"))
    return { label: "HOD", cls: "bg-indigo-100 text-indigo-700" };
  if (role === "Class Teacher")
    return { label: "Class Tchr", cls: "bg-amber-100 text-amber-700" };
  return { label: "Teacher", cls: "bg-emerald-100 text-emerald-700" };
}

// Helper to get Monday of the week
function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

// ─── Generate default grid ────────────────────────────────────────────────────
function generateDefaultGrid(_grade: string, _section: string, slotCount = DEFAULT_SETTINGS.periodsPerDay): (Slot|null)[][] {
  return Array.from({ length: slotCount }, () => [null, null, null, null, null, null]);
}

// ─── Build initial timetable registry ────────────────────────────────────────
const INITIAL_TIMETABLES: Record<string, (Slot|null)[][]> = {};
ALL_GRADES_SEED.forEach(g => ALL_SECTIONS.forEach(s => {
  INITIAL_TIMETABLES[`${g}-${s}`] = generateDefaultGrid(g, s);
}));

// ─── Mode styling ─────────────────────────────────────────────────────────────
const modeStyle = (m: Mode) =>
  m === "Physical" ? { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: MapPin } :
  m === "Online"   ? { dot: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 border-blue-200",         icon: Video  } :
                     { dot: "bg-purple-500",   chip: "bg-purple-50 text-purple-700 border-purple-200",   icon: Monitor };

// ─── Teacher-view Cell ───────────────────────────────────────────────────────
function TeacherCell({ slot, onClick }: { slot: Slot|null; onClick: () => void }) {
  if (!slot) {
    return (
      <div
        onClick={onClick}
        className="h-full min-h-[76px] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 bg-gray-50/30 group hover:border-amber-400 hover:bg-amber-50/30 cursor-pointer hover:text-amber-400 transition-all"
      >
        <Plus className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">Assign</span>
      </div>
    );
  }
  const st = modeStyle(slot.mode);
  const Icon = st.icon;
  const classKey = slot.teacher; // teacher field stores classKey in aggregated teacher view
  const lastDash = classKey.lastIndexOf("-");
  const g = lastDash > 0 ? classKey.substring(0, lastDash) : classKey;
  const s = lastDash > 0 ? classKey.substring(lastDash + 1) : "";
  return (
    <div
      onClick={onClick}
      className="h-full min-h-[76px] rounded-xl border p-2.5 bg-white transition-all group relative border-amber-100 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 uppercase tracking-wide border", st.chip)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
          {slot.mode}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold text-amber-500 uppercase tracking-wide">Edit</span>
      </div>
      <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{slot.subject}</p>
      <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
        <GraduationCap className="w-3 h-3 shrink-0 text-amber-400" />
        <span className="truncate font-semibold">{g}{s ? ` · Sec ${s}` : ""}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
        <Icon className="w-3 h-3 shrink-0" />
        {slot.room.startsWith("http")
          ? <a href={slot.room} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="truncate text-indigo-600 hover:underline font-semibold">Join Link</a>
          : <span className="truncate">{slot.room}</span>}
      </div>
    </div>
  );
}

// ─── Cell ─────────────────────────────────────────────────────────────────────
function ClassCell({
  slot, onClick, isEditable,
}: { slot: Slot | null; onClick: () => void; isEditable: boolean }) {
  if (!slot) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "h-full min-h-[76px] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 transition-all bg-gray-50/30 group",
          isEditable && "hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer hover:text-indigo-400"
        )}
      >
        {isEditable && (
          <>
            <Plus className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">Add</span>
          </>
        )}
      </div>
    );
  }
  const st = modeStyle(slot.mode);
  const Icon = st.icon;
  const isLink = slot.room.startsWith("http");
  return (
    <div
      onClick={onClick}
      className={cn(
        "h-full min-h-[76px] rounded-xl border p-2.5 bg-white transition-all group relative",
        slot.mode === "Online"   ? "border-blue-100 shadow-sm"   :
        slot.mode === "Hybrid"   ? "border-purple-100 shadow-sm" : "border-slate-200",
        isEditable && "hover:shadow-md hover:border-indigo-300 cursor-pointer"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 uppercase tracking-wide border", st.chip)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
          {slot.mode}
        </span>
        {isEditable && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Edit</span>
        )}
      </div>
      <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{slot.subject}</p>
      <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
        <User className="w-3 h-3 shrink-0 text-gray-400" />
        <span className="truncate font-semibold">{slot.teacher}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
        <Icon className="w-3 h-3 shrink-0" />
        {isLink
          ? <a href={slot.room} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="truncate text-indigo-600 hover:underline font-semibold">Join Link</a>
          : <span className="truncate">{slot.room}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Timetable = () => {
  const { user } = useAuth();
  const grades = useGrades();
  const { timeSlots } = useTimetableSettings(user?.uid);

  // Only offer meeting platforms that are actually connected under
  // Administration → Integrations — an unconnected option in this dropdown
  // has nothing real behind it and just confuses whoever picks it.
  const { connected: jitsiConnected } = useIntegrationConnected("jitsi");
  const { connected: googleMeetConnected } = useIntegrationConnected("googlemeet-live");
  const { connected: zoomConnected } = useIntegrationConnected("zoom");
  const { connected: teamsConnected } = useIntegrationConnected("msteams");
  const platformConnection: Record<string, boolean> = {
    jitsi: jitsiConnected, "googlemeet-live": googleMeetConnected, zoom: zoomConnected, msteams: teamsConnected,
  };
  const PLATFORMS = ALL_PLATFORMS.filter((p) => platformConnection[p.providerId]).map((p) => p.label);
  const [tab, setTab]         = useState<"class"|"teacher">("class");
  const [grade, setGrade]     = useState("Grade 5");
  const [section, setSection] = useState("A");
  const [teacher, setTeacher] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const [sidebarTab, setSidebarTab] = useState<"students"|"teachers">("students");

  // Dynamic Calendar / Week navigation states
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));

  const daysList = useMemo(() => {
    const list = [];
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const fullNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let i = 0; i < 6; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      const dateStr = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
      list.push({
        name: names[i],
        full: fullNames[i],
        date: dateStr,
        online: names[i] === "Sat",
        rawDate: d,
      });
    }
    return list;
  }, [currentWeekStart]);

  const weekRangeStr = useMemo(() => {
    const monday = currentWeekStart;
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const startStr = monday.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const endStr = saturday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    return `${startStr} – ${endStr}`;
  }, [currentWeekStart]);

  const handlePrevWeek = () => {
    setCurrentWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  // Teacher-slot edit states
  const [tEditSlot, setTEditSlot] = useState<{ri:number;ci:number;fromKey:string;slot:Slot|null}|null>(null);
  const [tGrade, setTGrade]       = useState("Grade 5");
  const [tSection, setTSection]   = useState("A");
  const [tSubject, setTSubject]   = useState("Mathematics");
  const [tMode, setTMode]         = useState<Mode>("Physical");
  const [tRoom, setTRoom]         = useState("Room 201");
  const [tLink, setTLink]         = useState("");
  const [tPlatform, setTPlatform] = useState("Jitsi Meet");

  // Timetable state (persisted to localStorage, using draft key first)
  const [timetables, setTimetables] = useState<Record<string, (Slot|null)[][]>>(() => {
    try {
      const draft = localStorage.getItem("sd_timetables_v3_draft");
      if (draft) return JSON.parse(draft);
      const pub = localStorage.getItem("sd_timetables_v3");
      if (pub) return JSON.parse(pub);
    } catch {}
    return INITIAL_TIMETABLES;
  });

  const [isDirty, setIsDirty] = useState(() => {
    try {
      const draft = localStorage.getItem("sd_timetables_v3_draft");
      const pub = localStorage.getItem("sd_timetables_v3");
      if (!draft && !pub) return false;
      return draft !== pub;
    } catch {}
    return false;
  });

  // Customizable workload rules (admin-configured in System Settings)
  const [timetableRules, setTimetableRules] = useState<TimetableRules>(DEFAULT_TIMETABLE_RULES);
  useEffect(() => {
    let active = true;
    loadTimetableRules().then((r) => { if (active) setTimetableRules(r); });
    return () => { active = false; };
  }, []);

  // Teachers list from API
  const [teachersList, setTeachersList] = useState<string[]>([]);
  // Map of teacher name → role (used for workload limit checks)
  const [staffRoles, setStaffRoles] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/data/staff").then(r => r.json()).then((data: any[]) => {
      if (!Array.isArray(data) || !data.length) return;
      const eligible = data.filter(s =>
        s.role === "Teacher" ||
        s.role === "Class Teacher" ||
        s.role === "Grade Coordinator" ||
        (typeof s.role === "string" && s.role.startsWith("HOD"))
      );
      const t = [...new Set<string>(eligible.map(s => s.name).filter(Boolean))];
      const roles: Record<string, string> = {};
      eligible.forEach(s => { if (s.name) roles[s.name] = s.role || "Teacher"; });
      setStaffRoles(roles);
      if (t.length) { setTeachersList(t); if (!t.includes(teacher)) setTeacher(t[0]); }
    }).catch(() => {});
  }, []);

  // Subject assignments — used to restrict subject dropdown per teacher
  const [allSubjectAssignments, setAllSubjectAssignments] = useState<{grade: string; section: string; subject: string; teacherName: string}[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((rows: any[]) => { if (Array.isArray(rows)) setAllSubjectAssignments(rows); })
      .catch(() => {});
  }, []);

  // ── One-time purge of fake seed data from localStorage on first load ──────
  useEffect(() => {
    const PURGE_KEY = "sd_timetable_seed_purged_v1";
    if (localStorage.getItem(PURGE_KEY)) return; // already done
    // Remove any cached draft/published timetable that contains known fake teacher names
    const FAKE_NAMES = ["Sarah Khan", "Imran Qureshi", "Faisal Malik", "Hina Mahmood"];
    const keysToCheck = ["sd_timetables_v3_draft", "sd_timetables_v3"];
    let purged = false;
    keysToCheck.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed: Record<string, (Slot|null)[][]> = JSON.parse(raw);
        let hasFake = false;
        Object.values(parsed).forEach(grid => {
          grid.forEach(row => row.forEach(slot => {
            if (slot && FAKE_NAMES.includes(slot.teacher)) hasFake = true;
          }));
        });
        if (hasFake) {
          localStorage.removeItem(key);
          purged = true;
        }
      } catch {}
    });
    if (purged) {
      // Reset to clean empty state
      setTimetables(INITIAL_TIMETABLES);
      setIsDirty(false);
      localStorage.removeItem("sd_teacher_timetables");
      localStorage.removeItem("sd_timetable_time_slots");
    }
    localStorage.setItem(PURGE_KEY, "1");
  }, []);

  // On mount: sync any already-published timetable from localStorage → DB
  // so teacher/student portals on other ports/origins can read it immediately
  useEffect(() => {
    try {
      const gridJson = localStorage.getItem("sd_timetables_v3");
      if (!gridJson || gridJson === "{}") return;
      const teacherJson = localStorage.getItem("sd_teacher_timetables") || "{}";
      const timeSlots = localStorage.getItem("sd_timetable_time_slots") || "[]";
      fetch("/api/data/timetable_slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "published-timetable-v3",
          gridJson,
          teacherJson,
          timeSlots,
          publishedAt: new Date().toISOString(),
          uid: "admin",
        }),
      }).catch(() => {});
    } catch {}
  }, []);

  // Active grid
  const key = `${grade}-${section}`;
  const grid = useMemo(() => timetables[key] || generateDefaultGrid(grade, section, timeSlots.length), [timetables, key, grade, section, timeSlots.length]);

  // Teacher aggregation
  const teacherGrid = useMemo(() => {
    const g: (Slot|null)[][] = timeSlots.map(() => daysList.map(() => null));
    Object.entries(timetables).forEach(([k, classGrid]) => {
      classGrid.forEach((row, ri) => row.forEach((slot, ci) => {
        if (slot?.teacher === teacher) g[ri][ci] = { ...slot, teacher: k };
      }));
    });
    return g;
  }, [timetables, teacher, daysList]);

  // Sidebar filter
  const filteredGrades = useMemo(() => {
    const q = sidebarSearch.toLowerCase();
    if (!q) return grades;
    return grades.filter(g => g.toLowerCase().includes(q));
  }, [sidebarSearch, grades]);

  // Toggle collapsed grade
  function toggleGrade(g: string) {
    setCollapsedGrades(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  // Online slot count
  const onlineCount = useMemo(() => grid.reduce((acc, row) => acc + row.filter(s => s?.mode === "Online").length, 0), [grid]);

  // Bulk scheduler
  const [bulkScope, setBulkScope]   = useState<"current" | "all">("current");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate]     = useState("");
  const [platform, setPlatform]     = useState("Jitsi Meet");
  const [opts, setOpts]             = useState({ links: true, invite: true, notify: true, record: true });

  useEffect(() => {
    if (daysList && daysList.length >= 6) {
      setBulkStartDate(daysList[0].rawDate.toISOString().split("T")[0]);
      setBulkEndDate(daysList[5].rawDate.toISOString().split("T")[0]);
    }
  }, [daysList]);

  // Edit drawer
  const [editingSlot, setEditingSlot] = useState<{ri:number;ci:number;slot:Slot|null}|null>(null);
  const [fSubject, setFSubject]   = useState("");
  const [fTeacher, setFTeacher]   = useState("");
  const [fMode, setFMode]         = useState<Mode>("Physical");
  const [fRoom, setFRoom]         = useState("");
  const [fPlatform, setFPlatform] = useState("Jitsi Meet");
  const [fLink, setFLink]         = useState("");
  const [fDate, setFDate]         = useState("");   // YYYY-MM-DD format
  const [fTimeSlot, setFTimeSlot] = useState(0);   // row index into TIME_SLOTS
  const [fDay, setFDay]           = useState(0);   // col index into DAYS
  // Combobox open states for subject/teacher pickers
  const [fSubjectOpen, setFSubjectOpen] = useState(false);
  const [tSubjectOpen, setTSubjectOpen] = useState(false);

  function openCell(ri: number, ci: number, slot: Slot|null) {
    if (tab !== "class") { toast.info("Switch to Class Timetable tab to edit."); return; }
    const safeRi = Math.max(0, Math.min(ri, timeSlots.length - 1));
    const safeCi = Math.max(0, Math.min(ci, daysList.length - 1));
    setEditingSlot({ ri: safeRi, ci: safeCi, slot });
    setFTimeSlot(safeRi);
    setFDay(safeCi);
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    setFDate(dateStr);
    if (slot) {
      setFSubject(slot.subject); setFTeacher(slot.teacher); setFMode(slot.mode);
      if (slot.mode !== "Online") { setFRoom(slot.room); setFLink(""); }
      else { setFRoom(""); setFPlatform(slot.room.includes("Zoom") ? "Zoom" : slot.room.includes("Teams") ? "Microsoft Teams" : slot.room.includes("Meet") ? "Google Meet" : "Jitsi Meet"); setFLink(slot.room.startsWith("http") ? slot.room : ""); }
    } else {
      setFSubject(""); setFTeacher("");
      setFMode("Physical"); setFRoom("Room 201"); setFLink("");
    }
  }

  // Subjects that have an assigned teacher for the currently selected grade+section.
  // The Subject picker only offers these — an unallocated subject cannot be scheduled.
  const classAssignedSubjects = useMemo(
    () => subjectsAssignedFor(allSubjectAssignments, grade, section),
    [allSubjectAssignments, grade, section]
  );

  // Teacher is derived, never hand-picked: the one person assigned to fSubject
  // for this grade+section in Subject Allocation. Null if nobody is assigned yet.
  const autoAssignedTeacher = useMemo(
    () => (fSubject ? findAssignedTeacher(allSubjectAssignments, grade, section, fSubject) : null),
    [allSubjectAssignments, grade, section, fSubject]
  );

  // Keep fTeacher locked to the mapping — re-syncs whenever subject/grade/section changes,
  // and self-heals editing of any legacy slot whose stored teacher no longer matches.
  useEffect(() => {
    setFTeacher(autoAssignedTeacher || "");
  }, [autoAssignedTeacher]);

  // Count how many periods a teacher already has on a given day column,
  // excluding the slot currently being edited (to avoid counting the slot we're replacing).
  function getTeacherDayLoad(
    teacherName: string,
    dayColIdx: number,
    excludeKey?: string,
    excludeRi?: number,
    excludeCi?: number
  ): number {
    let count = 0;
    Object.entries(timetables).forEach(([k, classGrid]) => {
      classGrid.forEach((row, ri) => {
        const slot = row[dayColIdx];
        if (!slot || slot.teacher !== teacherName) return;
        if (k === excludeKey && ri === excludeRi && dayColIdx === excludeCi) return;
        count++;
      });
    });
    return count;
  }

  // Exact day+period clash: is teacherName already teaching some OTHER class
  // at this same day/period? Returns the conflicting classKey, or null if free.
  function findTeacherClash(
    teacherName: string,
    periodIdx: number,
    dayIdx: number,
    excludeKey?: string,
    excludeRi?: number,
    excludeCi?: number
  ): string | null {
    for (const [k, classGrid] of Object.entries(timetables)) {
      const slot = classGrid[periodIdx]?.[dayIdx];
      if (!slot || slot.teacher !== teacherName) continue;
      if (k === excludeKey && periodIdx === excludeRi && dayIdx === excludeCi) continue;
      return k;
    }
    return null;
  }

  // Auto-fill every EMPTY period for the selected grade+section from the real
  // Subject Allocation mapping — walks a diagonal rotation (period+day offset)
  // through the assigned subjects so each day sees a VARIED subject across its
  // periods instead of the same subject repeated all day, skipping any
  // placement that would breach a teacher's daily workload limit or clash with
  // another class at the same exact day+period. Existing periods and Saturday
  // (Online Learning Day, scheduled separately via Bulk Online) are untouched.
  function autoGenerateTimetable() {
    const assignedSubjects = subjectsAssignedFor(allSubjectAssignments, grade, section);
    if (!assignedSubjects.length) {
      toast.error(`No subjects allocated to ${grade} – Section ${section}.`, {
        description: "Go to Academics → Subject Allocation to assign subjects & teachers first.",
      });
      return;
    }

    setTimetables(prev => {
      const base = (prev[key] || generateDefaultGrid(grade, section, timeSlots.length)).map(r => [...r]);
      const dayLoadDelta: Record<string, number> = {}; // `${teacher}·${day}` -> periods added this run
      let filled = 0;
      let skipped = 0;

      for (let ri = 0; ri < base.length; ri++) {
        for (let ci = 0; ci < daysList.length; ci++) {
          if (ci === 5) continue; // Saturday — Online Learning Day, left for Bulk Online
          if (base[ri][ci]) continue; // never overwrite an existing period

          // Diagonal starting offset: varies by BOTH period and day so a single
          // weekday doesn't just repeat subject[0] across every one of its periods.
          const startIdx = (ri + ci) % assignedSubjects.length;
          let placed = false;
          for (let attempt = 0; attempt < assignedSubjects.length; attempt++) {
            const subject = assignedSubjects[(startIdx + attempt) % assignedSubjects.length];
            const teacherName = findAssignedTeacher(allSubjectAssignments, grade, section, subject);
            if (!teacherName) continue;

            const role = staffRoles[teacherName] || "Teacher";
            const limit = getTeacherLimit(role, timetableRules);
            if (limit === 0) continue;

            const loadKey = `${teacherName}·${ci}`;
            const projectedLoad = getTeacherDayLoad(teacherName, ci) + (dayLoadDelta[loadKey] || 0);
            if (projectedLoad >= limit) continue;

            if (findTeacherClash(teacherName, ri, ci, key, ri, ci)) continue;

            base[ri][ci] = { mode: "Physical", subject, teacher: teacherName, room: "Room 201" };
            dayLoadDelta[loadKey] = (dayLoadDelta[loadKey] || 0) + 1;
            filled++;
            placed = true;
            break;
          }
          if (!placed) skipped++;
        }
      }

      const next = { ...prev, [key]: base };
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(next));
      setIsDirty(true);
      window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));

      if (filled === 0) {
        toast.error("Nothing could be auto-filled.", {
          description: "All assigned teachers are already at their daily workload limit or clashing with another class.",
        });
      } else {
        toast.success(`Auto-generated ${filled} period${filled !== 1 ? "s" : ""} for ${grade} – Section ${section}`, {
          description: skipped > 0
            ? `${skipped} slot${skipped !== 1 ? "s" : ""} left empty — no assigned teacher had room left. Review, then Publish.`
            : "All empty periods filled. Review, then Publish.",
        });
      }
      return next;
    });
  }

  function saveSlot() {
    if (!editingSlot) return;
    const ri = fTimeSlot;
    const ci = fDay;
    const isEditing = !!editingSlot.slot;

    // ── Subject → Teacher mapping validation ─────────────────────────────────
    if (!fSubject) {
      toast.error("Select a subject first.");
      return;
    }
    if (!fTeacher) {
      toast.error(`No teacher is assigned to ${fSubject} for ${grade} – Section ${section}.`, {
        description: "Go to Academics → Subject Allocation and assign a subject teacher before scheduling this period.",
      });
      return;
    }
    // ── end mapping validation ────────────────────────────────────────────────

    // ── Teacher clash validation (same day+period, different class) ─────────
    const clashKey = findTeacherClash(
      fTeacher, ri, ci,
      isEditing ? key : undefined,
      isEditing ? editingSlot.ri : undefined,
      isEditing ? editingSlot.ci : undefined
    );
    if (clashKey) {
      toast.error(`${fTeacher} is already teaching ${clashKey.replace(/-([A-Z])$/, " – Section $1")} at this exact day/period.`, {
        description: "Pick a different period, or clear the conflicting slot first.",
      });
      return;
    }
    // ── end teacher clash validation ─────────────────────────────────────────

    // ── Workload validation ──────────────────────────────────────────────────
    if (fTeacher) {
      const role  = staffRoles[fTeacher] || "Teacher";
      const limit = getTeacherLimit(role, timetableRules);
      if (limit === 0) {
        toast.error(`${fTeacher} (${role}) has no teaching allocation and cannot be assigned.`);
        return;
      }
      // Exclude the slot being edited when it already lives on the same key/row/col
      const currentLoad = getTeacherDayLoad(
        fTeacher, ci,
        isEditing ? key : undefined,
        isEditing ? editingSlot.ri : undefined,
        isEditing ? editingSlot.ci : undefined
      );
      if (currentLoad >= limit) {
        const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        toast.error(
          `${fTeacher} already has ${currentLoad}/${limit} periods on ${DAY_NAMES[ci] ?? "that day"} — limit for ${role}.`,
          { description: "Reassign a different teacher or reduce their existing load first." }
        );
        return;
      }
    }
    // ── end workload validation ──────────────────────────────────────────────

    const room = fMode === "Online"
      ? fLink || `https://meet.jit.si/StudentDiwan-${grade.replace(/\s/g,"")}-${section}-${Date.now().toString(36)}`
      : fRoom || "Room 201";
    const updated: Slot = { mode: fMode, subject: fSubject, teacher: fTeacher, room };
    setTimetables(prev => {
      const base = (prev[key] || generateDefaultGrid(grade, section)).map(r => [...r]);
      if (editingSlot.ri !== ri || editingSlot.ci !== ci) {
        base[editingSlot.ri][editingSlot.ci] = null;
      }
      base[ri][ci] = updated;
      const next = { ...prev, [key]: base };
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(next));
      setIsDirty(true);
      window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
      return next;
    });
    const dateDisplay = fDate ? new Date(fDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
    toast.success(`Saved to Draft: ${fSubject} — ${fTeacher}`);
    setEditingSlot(null);
  }

  function clearSlot() {
    if (!editingSlot) return;
    const { ri, ci } = editingSlot;
    setTimetables(prev => {
      const base = (prev[key] || generateDefaultGrid(grade, section)).map(r => [...r]);
      (base[ri] as any)[ci] = null;
      const next = { ...prev, [key]: base };
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(next));
      setIsDirty(true);
      window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
      return next;
    });
    toast.success("Period cleared in draft");
    setEditingSlot(null);
  }

  function bulkGenerate() {
    if (!bulkStartDate || !bulkEndDate) {
      toast.error("Please enter a valid Start Date and End Date.");
      return;
    }
    const start = new Date(bulkStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(bulkEndDate);
    end.setHours(23, 59, 59, 999);

    if (end < start) {
      toast.error("End Date cannot be before Start Date.");
      return;
    }

    // The timetable grid is a weekly-recurring template — one Slot per
    // weekday (Mon..Sat), not one per calendar date — so a picked date range
    // can't be matched against `daysList` (only ever the single CURRENTLY
    // VIEWED week). That made Bulk Online silently no-op for any range
    // outside whatever week happened to be on screen when the panel opened.
    // Instead, walk every calendar date in [start, end] and collect which
    // weekdays it actually touches, then flip just those weekday columns —
    // matching what "recurring online for this period" can actually mean
    // given the data model, and working regardless of which week is shown.
    const touchedDayIndexes = new Set<number>();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=Sun..6=Sat
      const ci = dow === 0 ? -1 : dow - 1; // Mon=0..Sat=5, Sunday has no column
      if (ci >= 0 && ci <= 5) touchedDayIndexes.add(ci);
    }
    if (touchedDayIndexes.size === 0) {
      toast.error("That date range doesn't include any Monday–Saturday school day.");
      return;
    }

    // Computed outside the setState updater (rather than read back from
    // `timetables` afterward) because setState is async — publishTimetable
    // needs the actual new grid right now, not whatever's in the closure
    // before this render commits.
    const next = { ...timetables };
    const targets = bulkScope === "all"
      ? grades.flatMap(g => ALL_SECTIONS.map(s => `${g}-${s}`))
      : [key];

    let count = 0;
    targets.forEach(classKey => {
      const parts = classKey.split("-");
      const g = parts[0];
      const s = parts[1] || "A";

      const base = (next[classKey] || generateDefaultGrid(g, s)).map(r => [...r]);
      base.forEach((row, ri) => {
        touchedDayIndexes.forEach(ci => {
          const cur = row[ci];
          row[ci] = {
            mode: "Online",
            subject: cur?.subject || "Self Study",
            teacher: cur?.teacher || teachersList[0] || "",
            // A real, working Jitsi room — same live meet.jit.si domain every
            // other Online meeting feature in this app uses. This used to be
            // a fabricated meet.google.com URL, which pointed nowhere (no
            // Google Meet integration is connected) and explains why nobody
            // could actually join the "online class" this generated.
            room: `https://meet.jit.si/StudentDiwan-${g.replace(/\s/g,"")}-${s}-P${ri + 1}-${daysList[ci]?.name || ci}`,
          };
          count++;
        });
      });
      next[classKey] = base;
    });

    setTimetables(next);
    window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));

    // Bulk Online is an urgent, take-effect-now action (e.g. "make Saturday
    // online starting today") — leaving it sitting as an unpublished draft
    // until someone separately remembers to hit "Publish Timetable" meant
    // students/teachers/parents never actually saw the change or any
    // notification about it. Publish immediately, respecting the panel's own
    // "Notify teachers & parents" checkbox instead of that toggle being
    // purely decorative.
    publishTimetable(next, opts.notify);
    toast.success(
      `Bulk scheduled ${count} online periods and published for ${bulkScope === "all" ? "the entire school" : `${grade} - ${section}`}${opts.notify ? " — students, teachers and parents notified" : ""}`
    );
    setBulkOpen(false);
  }

  function compileAndPublishTeacherSchedules(currentTimetables: Record<string, (Slot|null)[][]>) {
    // Sized from the school's actual configured periods/days, not a hardcoded
    // 5×6 — a school with more than 5 periods/day (this one has 6) has classGrid
    // rows beyond index 4, and writing into a fixed 5-row array threw
    // "Cannot set properties of undefined" the moment any class used period 6.
    const periodCount = Math.max(timeSlots.length, ...Object.values(currentTimetables).map(g => g.length));
    const dayCount = Math.max(daysList.length, ...Object.values(currentTimetables).map(g => g[0]?.length || 0));
    const teacherSchedules: Record<string, any> = {};
    teachersList.forEach(t => {
      const g = Array(periodCount).fill(null).map(() => Array(dayCount).fill(null));
      teacherSchedules[t] = {
        schedule: g,
        sentAt: new Date().toISOString(),
        days: daysList.map(d => d.full),
        times: timeSlots
      };
    });
    Object.entries(currentTimetables).forEach(([classKey, classGrid]) => {
      const lastDash = classKey.lastIndexOf("-");
      const gradeVal = lastDash > 0 ? classKey.substring(0, lastDash) : classKey;
      const sectionVal = lastDash > 0 ? classKey.substring(lastDash + 1) : "";
      classGrid.forEach((row, ri) => {
        row.forEach((slot, ci) => {
          if (slot && slot.teacher && teacherSchedules[slot.teacher]) {
            teacherSchedules[slot.teacher].schedule[ri][ci] = {
              subject: slot.subject,
              mode: slot.mode,
              room: slot.room,
              grade: gradeVal,
              section: sectionVal,
              classKey
            };
          }
        });
      });
    });
    localStorage.setItem("sd_teacher_timetables", JSON.stringify(teacherSchedules));
  }

  // `gridOverride` lets a caller that just computed a brand-new grid (e.g.
  // bulkGenerate) publish it immediately without waiting on setState/render —
  // reading the `timetables` closure right after calling setTimetables would
  // still see the OLD value, since React state updates aren't synchronous.
  // `sendNotifications` lets Bulk Online honor its own "Notify teachers &
  // parents" checkbox instead of the toggle being purely decorative.
  function publishTimetable(gridOverride?: Record<string, (Slot|null)[][]>, sendNotifications: boolean = true) {
    const grid = gridOverride || timetables;
    try {
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(grid));
      localStorage.setItem("sd_timetables_v3", JSON.stringify(grid));
      localStorage.setItem("sd_timetable_time_slots", JSON.stringify(timeSlots));
      compileAndPublishTeacherSchedules(grid);

      // Persist to shared MySQL DB so teacher/student portals on any port can read it
      const teacherJson = localStorage.getItem("sd_teacher_timetables") || "{}";
      fetch("/api/data/timetable_slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "published-timetable-v3",
          gridJson: JSON.stringify(grid),
          teacherJson,
          timeSlots: JSON.stringify(timeSlots),
          publishedAt: new Date().toISOString(),
          uid: "admin",
        }),
      }).then(r => {
        if (!r.ok) toast.error("DB sync failed — teacher/student portals may not update.");
        // Notify same-port listeners immediately via socket.io
        socket.emit("timetable-published");
      }).catch(() => {
        toast.error("DB sync failed — check server connection.");
      });

      // Create persistent, DB-backed notifications so affected teachers (and
      // students) are alerted even on a different server process / port. The
      // notification bell polls the shared `notifications` table.
      if (sendNotifications) publishTimetableNotifications(teacherJson, grid);

      window.dispatchEvent(new CustomEvent("sd-timetable-updated"));
      window.dispatchEvent(new CustomEvent("sd-teacher-timetable-sent"));
      setIsDirty(false);
      toast.success("Timetable Published Successfully! ✓", {
        description: "All changes are now live and visible on Student and Teacher portals."
      });
    } catch (e) {
      console.error("publishTimetable failed:", e);
      toast.error("Failed to publish timetable.", {
        description: e instanceof Error ? e.message : "Unknown error — check the browser console for details.",
      });
    }
  }

  // ── Export / Print — both read the exact same grid currently on screen
  // (displayGrid: the class grid or the aggregated teacher view), so what you
  // export/print always matches what you're looking at. ──
  const exportLabel = tab === "class" ? `${grade}_${section}` : `Teacher_${teacher}`;

  function exportTimetableCSV() {
    const headers = ["Time", ...daysList.map(d => `${d.full} (${d.date})`)];
    const rows = displayGrid.map((row, ri) => [
      timeSlots[ri] || "",
      ...row.map(slot => slot ? `"${slot.subject} — ${slot.teacher} (${slot.room}) [${slot.mode}]"` : ""),
    ].join(","));
    const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Timetable_${exportLabel}_${weekRangeStr.replace(/\s+/g, "")}.csv`.replace(/[^\w.-]/g, "_");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success("Timetable exported — open in Excel");
  }

  function printTimetable() {
    const title = tab === "class" ? `${grade} · Section ${section}` : `Teacher — ${teacher}`;
    const win = window.open("", "_blank", "width=1100,height=750");
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups for this site to print.");
      return;
    }
    const rowsHtml = displayGrid.map((row, ri) => `
      <tr>
        <td class="time">${(timeSlots[ri] || "").replace(" - ", "<br/>–<br/>")}</td>
        ${row.map(slot => slot
          ? `<td class="slot ${slot.mode.toLowerCase()}">
              <div class="subject">${slot.subject}</div>
              <div class="teacher">${slot.teacher}</div>
              <div class="room">${slot.mode === "Online" ? "Online" : `Room ${slot.room}`}</div>
            </td>`
          : `<td class="empty">—</td>`
        ).join("")}
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Timetable — ${title}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:#6b7280;font-size:12px;margin:0 0 18px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #e5e7eb;padding:8px;text-align:center;vertical-align:top;font-size:11px}
  th{background:#f9fafb;font-weight:700;color:#374151}
  td.time{background:#f9fafb;font-weight:700;white-space:nowrap;width:70px}
  td.empty{color:#d1d5db}
  td.slot .subject{font-weight:700;font-size:12px}
  td.slot .teacher{color:#4b5563;margin-top:2px}
  td.slot .room{color:#9ca3af;font-size:10px;margin-top:2px}
  td.slot.online{background:#eef2ff}
  td.slot.hybrid{background:#fef3c7}
  @media print { body{padding:0} }
</style></head><body>
<h1>Timetable — ${title}</h1>
<p class="sub">Week of ${weekRangeStr}</p>
<table>
  <thead><tr><th>Time</th>${daysList.map(d => `<th>${d.full}<br/><span style="font-weight:400">${d.date}</span></th>`).join("")}</tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  // Write one notification row per affected teacher + a single student broadcast
  // into the shared `notifications` table. Cross-process portals poll this table.
  function publishTimetableNotifications(teacherJson: string, grid: Record<string, (Slot|null)[][]> = timetables) {
    try {
      const compiled: Record<string, { schedule?: any[][] }> = JSON.parse(teacherJson || "{}");
      const stamp = new Date().toISOString();
      const base = Date.parse(stamp);

      // Teachers who actually have at least one assigned slot
      const affected = Object.entries(compiled)
        .filter(([, v]) =>
          Array.isArray(v?.schedule) &&
          v.schedule.some(row => Array.isArray(row) && row.some(Boolean))
        )
        .map(([name]) => name);

      const rows: any[] = affected.map((name, i) => ({
        id: `ntf-tt-${base}-t${i}`,
        type: "update",
        entity: "timetable_slots",
        category: "general",
        audienceRole: "teacher",
        recipientName: name,
        title: "Your timetable has been updated",
        time: stamp,
        uid: "admin",
      }));

      // One notification per grade/section that actually has timetable data —
      // scoped with recipientGrade/recipientSection so isForMe() only delivers
      // it to students actually IN that class. Previously this was a single
      // audienceRole: "student" row with no grade/section at all, which
      // broadcast to every student in the school regardless of class.
      Object.entries(grid).forEach(([classKey, classGrid]) => {
        const hasData = classGrid.some(row => Array.isArray(row) && row.some(Boolean));
        if (!hasData) return;
        const lastDash = classKey.lastIndexOf("-");
        const gradeVal = lastDash > 0 ? classKey.substring(0, lastDash) : classKey;
        const sectionVal = lastDash > 0 ? classKey.substring(lastDash + 1) : "";
        rows.push({
          id: `ntf-tt-${base}-${classKey}`,
          type: "update",
          entity: "timetable_slots",
          category: "general",
          audienceRole: "student",
          recipientGrade: gradeVal,
          recipientSection: sectionVal,
          title: "Your class timetable has been updated",
          message: `${gradeVal} · Section ${sectionVal}'s timetable was just published.`,
          time: stamp,
          uid: "admin",
        });
      });

      rows.forEach(row => {
        fetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        }).catch(() => {});
      });
    } catch {
      /* notifications are best-effort — never block publish */
    }
  }

  function syncDB() {
    localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(timetables));
    toast.success("Timetable draft synced to database ✓");
  }

  // ── Teacher editing ──────────────────────────────────────────────────────────
  function openTeacherCell(ri: number, ci: number, slot: Slot|null) {
    const fromKey = slot?.teacher || `${grade}-${section}`;
    setTEditSlot({ ri, ci, fromKey, slot });
    const lastDash = fromKey.lastIndexOf("-");
    const g = lastDash > 0 ? fromKey.substring(0, lastDash) : "Grade 5";
    const s = lastDash > 0 ? fromKey.substring(lastDash + 1) : "A";
    setTGrade(g); setTSection(s);
    if (slot) {
      setTSubject(slot.subject); setTMode(slot.mode);
      if (slot.mode !== "Online") { setTRoom(slot.room); setTLink(""); }
      else { setTRoom(""); setTLink(slot.room.startsWith("http") ? slot.room : ""); setTPlatform("Jitsi Meet"); }
    } else {
      setTSubject(""); setTMode("Physical"); setTRoom("Room 201"); setTLink("");
    }
  }

  // Subjects this teacher is actually assigned to teach for tGrade+tSection —
  // the only subjects they may be scheduled for (no manual/random assignment).
  const teacherAssignedSubjects = useMemo(
    () => subjectsAssignedToTeacher(allSubjectAssignments, teacher, tGrade, tSection),
    [allSubjectAssignments, teacher, tGrade, tSection]
  );

  // Whenever the target grade/section/teacher changes, drop a subject that no
  // longer belongs to this teacher's mapping and default to the first valid one.
  useEffect(() => {
    if (!teacherAssignedSubjects.includes(tSubject)) {
      setTSubject(teacherAssignedSubjects[0] || "");
    }
  }, [teacherAssignedSubjects]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveTeacherSlot() {
    if (!tEditSlot) return;
    const { ri, ci } = tEditSlot;

    // ── Subject → Teacher mapping validation ─────────────────────────────────
    if (!tSubject || !teacherAssignedSubjects.includes(tSubject)) {
      toast.error(`${teacher} is not assigned to teach any subject for ${tGrade} – Section ${tSection}.`, {
        description: "Go to Academics → Subject Allocation to assign this teacher first.",
      });
      return;
    }
    // ── end mapping validation ────────────────────────────────────────────────

    // ── Teacher clash validation (same day+period, different class) ─────────
    const classKey = `${tGrade}-${tSection}`;
    const clashKey = findTeacherClash(teacher, ri, ci, classKey, ri, ci);
    if (clashKey) {
      toast.error(`${teacher} is already teaching ${clashKey.replace(/-([A-Z])$/, " – Section $1")} at this exact day/period.`, {
        description: "Pick a different period, or clear the conflicting slot first.",
      });
      return;
    }
    // ── end teacher clash validation ─────────────────────────────────────────

    const room = tMode === "Online"
      ? tLink || `https://meet.jit.si/StudentDiwan-${tGrade.replace(/\s/g,"")}-${tSection}-${Date.now().toString(36)}`
      : tRoom || "Room 201";
    const updated: Slot = { mode: tMode, subject: tSubject, teacher: teacher, room };
    setTimetables(prev => {
      const base = (prev[classKey] || generateDefaultGrid(tGrade, tSection)).map(r => [...r]);
      base[ri][ci] = updated;
      const next = { ...prev, [classKey]: base };
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(next));
      setIsDirty(true);
      window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
      return next;
    });
    toast.success(`Assigned ${tSubject} to draft → ${tGrade} Sec ${tSection}`);
    setTEditSlot(null);
  }

  function clearTeacherSlot() {
    if (!tEditSlot) return;
    const { ri, ci, fromKey } = tEditSlot;
    setTimetables(prev => {
      const base = (prev[fromKey] || generateDefaultGrid(tGrade, tSection)).map(r => [...r]);
      (base[ri] as any)[ci] = null;
      const next = { ...prev, [fromKey]: base };
      localStorage.setItem("sd_timetables_v3_draft", JSON.stringify(next));
      setIsDirty(true);
      window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
      return next;
    });
    toast.success("Period cleared in draft");
    setTEditSlot(null);
  }

  function sendTeacherTimetable() {
    const schedule = teacherGrid.map(row => row.map(slot => {
      if (!slot) return null;
      const classKey = slot.teacher;
      const lastDash = classKey.lastIndexOf("-");
      const g = lastDash > 0 ? classKey.substring(0, lastDash) : classKey;
      const s = lastDash > 0 ? classKey.substring(lastDash + 1) : "";
      return { subject: slot.subject, mode: slot.mode, room: slot.room, grade: g, section: s, classKey };
    }));
    const stored = JSON.parse(localStorage.getItem("sd_teacher_timetables") || "{}");
    stored[teacher] = { schedule, sentAt: new Date().toISOString(), days: daysList.map(d => d.full), times: timeSlots };
    localStorage.setItem("sd_teacher_timetables", JSON.stringify(stored));
    window.dispatchEvent(new CustomEvent("sd-teacher-timetable-sent", { detail: { teacher } }));
    toast.success(`Timetable sent to ${teacher}'s dashboard ✓`, { description: "Teacher can now view their weekly schedule." });
  }

  // ── render ──────────────────────────────────────────────────────────────────
  const displayGrid = tab === "class" ? grid : teacherGrid;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-112px)] overflow-hidden">

        {/* ═══════════════════ LEFT SIDEBAR ═══════════════════ */}
        <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col shadow-sm overflow-hidden">
          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">Timetable</h1>
                <p className="text-sm text-slate-400">Admin Console</p>
              </div>
            </div>

            {/* Two main tabs */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
              <button
                onClick={() => { setSidebarTab("students"); setTab("class"); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                  sidebarTab === "students"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800 hover:bg-white"
                )}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Students
              </button>
              <button
                onClick={() => { setSidebarTab("teachers"); setTab("teacher"); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                  sidebarTab === "teachers"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800 hover:bg-white"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                Teachers
              </button>
            </div>
          </div>

          {/* ── STUDENTS: Grade/Section tree ── */}
          {sidebarTab === "students" && (
            <>
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search grade..."
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-indigo-300 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {filteredGrades.map((g, gi) => {
                  const isCollapsed  = collapsedGrades.has(g);
                  const gradColor    = GRADE_COLORS[gi % GRADE_COLORS.length];
                  const isGradeActive = grade === g && tab === "class";
                  return (
                    <div key={g}>
                      <button
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group",
                          isGradeActive ? "bg-indigo-50" : "hover:bg-gray-50"
                        )}
                        onClick={() => toggleGrade(g)}
                      >
                        <span className={cn("w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm", gradColor)}>
                          {g === "Pre-KG" ? "PK" : g === "LKG" ? "LK" : g === "UKG" ? "UK" : g.replace("Grade ","G")}
                        </span>
                        <span className={cn("flex-1 text-xs font-semibold truncate", isGradeActive ? "text-indigo-700" : "text-gray-700 group-hover:text-gray-900")}>{g}</span>
                        <span className="text-gray-300">
                          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="ml-6 mt-0.5 space-y-0.5 mb-1">
                          {ALL_SECTIONS.map(sec => {
                            const isActive = tab === "class" && grade === g && section === sec;
                            return (
                              <button
                                key={sec}
                                onClick={() => { setGrade(g); setSection(sec); setTab("class"); setSidebarTab("students"); }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all group",
                                  isActive ? "bg-purple-600 text-white shadow-md shadow-indigo-200" : "hover:bg-indigo-50 text-gray-600 hover:text-indigo-700"
                                )}
                              >
                                <span className={cn(
                                  "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black border shrink-0 transition-all",
                                  isActive ? "bg-white/20 border-white/30 text-white" : cn(SECTION_BADGE[sec] || "bg-gray-100 text-gray-600")
                                )}>{sec}</span>
                                <span className={cn("text-xs font-semibold", isActive ? "text-white" : "")}>Section {sec}</span>
                                {isActive && <span className="ml-auto"><ChevronRight className="w-3 h-3 text-white/70" /></span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── TEACHERS: Teacher list ── */}
          {sidebarTab === "teachers" && (
            <>
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Select Teacher</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search teacher..."
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-amber-300 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                {teachersList
                  .filter(t => !sidebarSearch || t.toLowerCase().includes(sidebarSearch.toLowerCase()))
                  .map((t, i) => {
                    const isActive = teacher === t && tab === "teacher";
                    const stored   = JSON.parse(localStorage.getItem("sd_teacher_timetables") || "{}");
                    const hasSent  = !!stored[t];
                    return (
                      <button
                        key={t}
                        onClick={() => { setTeacher(t); setTab("teacher"); setSidebarTab("teachers"); }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all group",
                          isActive
                            ? "bg-amber-500 text-white shadow-md shadow-amber-200"
                            : "hover:bg-amber-50 text-gray-600 hover:text-amber-800 border border-transparent hover:border-amber-100"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2",
                          isActive
                            ? "bg-white/20 border-white/30 text-white"
                            : "bg-amber-100 border-amber-200 text-amber-700"
                        )}>
                          {t.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-bold truncate", isActive ? "text-white" : "text-gray-800")}>{t}</p>
                          <p className={cn("text-[10px] truncate", isActive ? "text-white/70" : "text-gray-400")}>
                            {hasSent ? "✓ Schedule sent" : "No schedule sent"}
                          </p>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {/* Sidebar footer */}
          <div className="border-t border-gray-100 p-3">
            <button
              onClick={syncDB}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-all"
            >
              <Save className="w-4 h-4" />
              Sync to Database
            </button>
          </div>
        </aside>

        {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
        {/* min-w-0 overrides the flex item default of min-width:auto, which
            otherwise refuses to shrink below its content's intrinsic width —
            on narrower viewports that pushed the grid off-screen (leaving a
            large blank gap) instead of letting it scroll within its own pane. */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-gray-50/50">

          {/* Top bar — two rows so Publish Timetable is never crowded off-screen by
              the secondary tools, and everything wraps cleanly on narrow viewports
              instead of being clipped by the parent's overflow-hidden. */}
          <div className="flex flex-col gap-2.5 px-5 py-3 bg-white border-b border-gray-100 shadow-sm shrink-0">
            {/* Row 1: context + the one primary action */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                {tab === "class" ? (
                  <>
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                      <GraduationCap className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-500 font-medium truncate">{grade}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      <span className="font-extrabold text-gray-900 truncate">Section {section}</span>
                    </div>
                    {isDirty ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unpublished Draft
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Published &amp; Live
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-extrabold text-gray-900 text-sm truncate">Teacher Timetable — Aggregated View</span>
                    {isDirty ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unpublished Draft
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Published &amp; Live
                      </span>
                    )}
                  </>
                )}
              </div>

              <Button
                onClick={() => publishTimetable()}
                className={cn(
                  "h-9 gap-1.5 text-xs font-black shadow-sm transition-all cursor-pointer px-4 shrink-0",
                  isDirty
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100"
                    : "bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-200 shadow-none"
                )}
              >
                <Globe className="w-3.5 h-3.5" /> Publish Timetable
              </Button>
            </div>

            {/* Row 2: secondary tools — free to wrap, never affects Publish's position */}
            <div className="flex items-center gap-2 flex-wrap">
              {tab === "teacher" && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Teacher</label>
                  <Select value={teacher} onValueChange={setTeacher}>
                    <SelectTrigger className="h-8 w-48 text-xs border-gray-200 cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teachersList.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {tab === "class" && (
                <>
                  <Button variant="outline" size="sm" className="h-8 border-gray-200 gap-1.5 text-xs" onClick={() => setBulkOpen(v => !v)}>
                    <CalendarRange className="w-3.5 h-3.5 text-indigo-500" /> Bulk Online
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="h-8 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700 gap-1.5 text-xs font-bold"
                    onClick={autoGenerateTimetable}
                    title="Auto-fill empty periods from Subject Allocation"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Generate Timetable
                  </Button>
                </>
              )}
              {tab === "teacher" && (
                <>
                  <Button variant="outline" size="sm" className="h-8 border-gray-200 gap-1.5 text-xs"
                    onClick={() => openTeacherCell(0, 0, null)}>
                    <Plus className="w-3.5 h-3.5 text-amber-500" /> Assign Period
                  </Button>
                  <Button size="sm" className="h-8 bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs font-bold"
                    onClick={sendTeacherTimetable}>
                    <Zap className="w-3.5 h-3.5" /> Send to Teacher Dashboard
                  </Button>
                </>
              )}
              {/* Export / Print — always available on either tab, reads the exact grid on screen */}
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <Button variant="outline" size="sm" className="h-8 border-gray-200 gap-1.5 text-xs" onClick={exportTimetableCSV}>
                <Download className="w-3.5 h-3.5 text-gray-500" /> Export
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-gray-200 gap-1.5 text-xs" onClick={printTimetable}>
                <Printer className="w-3.5 h-3.5 text-gray-500" /> Print
              </Button>
            </div>
          </div>

          {/* Legend + week navigator */}
          <div className="flex items-center justify-between px-5 py-2 bg-white border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              {(["Physical","Online","Hybrid"] as Mode[]).map(m => {
                const st = modeStyle(m);
                return (
                  <span key={m} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className={cn("w-2 h-2 rounded-full", st.dot)} />
                    {m}
                  </span>
                );
              })}
              <span className="text-[11px] text-gray-400">·</span>
              <span className="text-[11px] text-purple-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                {onlineCount} online period{onlineCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7 border-gray-200" onClick={handlePrevWeek}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-7 px-3 flex items-center gap-1.5 border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700 bg-gray-50/50 hover:bg-gray-100 cursor-pointer">
                    <CalendarIcon className="w-3.5 h-3.5 text-gray-400" /> {weekRangeStr}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[300]" align="end">
                  <Calendar
                    mode="single"
                    selected={currentWeekStart}
                    onSelect={(date) => {
                      if (date) {
                        setCurrentWeekStart(getMonday(date));
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" className="h-7 w-7 border-gray-200" onClick={handleNextWeek}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Grid + optional bulk panel */}
          <div className="flex-1 min-h-0 overflow-auto flex gap-4 p-4">
            {/* Timetable grid — fills the available height evenly across periods
                instead of a fixed per-row size that either leaves a gap below on
                tall screens or forces awkward scrolling on short ones. */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* 96px time column + 6 day columns — 800px total left each day column
                  only ~117px, far too narrow for a period card (subject + teacher +
                  room), so every cell truncated hard even on a full-width desktop.
                  1200px gives each day ~184px and makes the grid genuinely scroll
                  (via the ancestor's overflow-auto) on narrower viewports instead
                  of silently cramming. */}
              <div className="min-w-[1200px] min-h-fit rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
                {/* Day headers */}
                <div className="grid border-b border-gray-200 bg-gray-50 shrink-0" style={{ gridTemplateColumns: "96px repeat(6, 1fr)" }}>
                  <div className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-r border-gray-200 flex items-center">
                    Time
                  </div>
                  {daysList.map(d => (
                    <div
                      key={d.name}
                      className={cn("px-3 py-3 text-center border-r border-gray-100 last:border-r-0 relative", d.online && "bg-indigo-50/60")}
                    >
                      {d.online && (
                        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 text-[8px] font-bold text-white bg-indigo-500 rounded px-1.5 py-0.5">
                          <Wifi className="w-2 h-2 animate-pulse" /> ONLINE
                        </span>
                      )}
                      <p className={cn("text-sm font-extrabold", d.online ? "text-indigo-700" : "text-gray-900")}>{d.full}</p>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">{d.date}</p>
                    </div>
                  ))}
                </div>

                {/* Rows — each an equal flex share of the remaining card height */}
                <div className="flex-1 flex flex-col">
                  {displayGrid.map((row, ri) => (
                    <div key={ri} className="flex-1 grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: "96px repeat(6, 1fr)" }}>
                      {/* Time label */}
                      <div className="border-r border-gray-200 px-3 py-3 flex flex-col items-center justify-center bg-gray-50/30 text-center select-none">
                        <span className="text-xs font-black text-gray-800">{timeSlots[ri]?.split(" - ")[0]}</span>
                        <span className="text-[10px] text-gray-400 font-semibold mt-0.5">{timeSlots[ri]?.split(" - ")[1]}</span>
                      </div>
                      {/* Cells */}
                      {row.map((slot, ci) => (
                        <div key={ci} className={cn("p-1.5 border-r border-gray-100 last:border-r-0", daysList[ci].online && (tab === "teacher" ? "bg-amber-50/20" : "bg-indigo-50/20"))}>
                          {tab === "teacher" ? (
                            <TeacherCell slot={slot} onClick={() => openTeacherCell(ri, ci, slot)} />
                          ) : (
                            <ClassCell slot={slot} onClick={() => openCell(ri, ci, slot)} isEditable={true} />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Info bar below grid */}
              <div className="mt-3 shrink-0 flex items-center gap-4 text-[12px] text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-indigo-500" /> Saturday = Online Learning Day</span>
                <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-blue-500" /> Click any cell to edit</span>
                <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-500" /> Changes auto-saved to storage</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ═══════════════════ BULK SCHEDULE ONLINE DRAWER ═══════════════════
          Was previously an inline flex sibling of the (very wide,
          horizontally-scrolling) timetable table — at normal desktop widths
          the table's natural width pushed this panel off past the visible
          viewport entirely, so clicking "Bulk Online" looked like it did
          nothing. A Sheet drawer (same pattern as Edit Period below) is
          always anchored to the viewport regardless of the table's width. */}
      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent className="sm:max-w-sm w-full bg-white z-[200]">
          <SheetHeader className="pb-4 border-b border-gray-100">
            <SheetTitle className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-purple-600" />
              Bulk Schedule Online
            </SheetTitle>
            <SheetDescription className="text-xs text-gray-500">
              Convert timetable periods to online virtual classes.
            </SheetDescription>
          </SheetHeader>

          {/* px-1: full-width fields (Select/Input) inside this scrollable
              container need a hair of horizontal room — `overflow-y: auto`
              also clips the x-axis at this element's own edges, so a
              zero-padding scroller crops the 4px focus ring right off the
              left/right sides regardless of how much padding SheetContent
              itself has (that padding is outside this element's own clip box). */}
          <div className="space-y-3 px-1 py-5 overflow-y-auto max-h-[calc(100vh-200px)]">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Scope</label>
              <Select value={bulkScope} onValueChange={(v: "current" | "all") => setBulkScope(v)}>
                <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[250]">
                  <SelectItem value="current">Current Class ({grade} - {section})</SelectItem>
                  <SelectItem value="all">All Classes &amp; Grades (Entire School)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Start Date</label>
              <Input
                type="date"
                value={bulkStartDate}
                onChange={e => setBulkStartDate(e.target.value)}
                className="h-9 text-xs border-gray-200 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">End Date</label>
              <Input
                type="date"
                value={bulkEndDate}
                onChange={e => setBulkEndDate(e.target.value)}
                className="h-9 text-xs border-gray-200 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[250]">
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {([ ["links","Auto-generate meeting links"], ["invite","Invite students"], ["notify","Notify teachers & parents"], ["record","Enable recording"] ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))}
                    className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all", opts[k] ? "bg-purple-600 border-purple-600" : "border-gray-300 bg-white hover:border-indigo-400")}>
                    {opts[k] && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className="text-xs text-gray-700 font-medium">{label}</span>
                </label>
              ))}
            </div>
            <div className="pt-2 border-t border-gray-100 space-y-1 text-xs">
              {[
                ["Scope", bulkScope === "all" ? "Entire School" : `${grade} — Sec ${section}`],
                ["Platform", platform]
              ].map(([k,v]) => (
                <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-semibold text-gray-900">{v}</span></div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-8 text-xs border-gray-200" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1" onClick={bulkGenerate}>
                <Zap className="w-3.5 h-3.5" /> Generate
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══════════════════ EDIT DRAWER ═══════════════════ */}
      <Sheet open={editingSlot !== null} onOpenChange={open => !open && setEditingSlot(null)}>
        <SheetContent className="sm:max-w-md w-full bg-white z-[200]">
          <SheetHeader className="pb-4 border-b border-gray-100">
            <SheetTitle className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-500" />
              {editingSlot?.slot ? "Edit Period" : "Add Period"}
            </SheetTitle>
            <SheetDescription className="text-xs text-gray-500">
              {editingSlot
                ? `${grade} · Section ${section} · ${daysList[editingSlot.ci].full} · ${timeSlots[editingSlot.ri]}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          {/* px-1: see Bulk Schedule Online's identical wrapper above — a
              zero-horizontal-padding scroller clips full-width fields' focus
              rings at its own edge, regardless of outer drawer padding. */}
          <div className="space-y-5 px-1 py-5 overflow-y-auto max-h-[calc(100vh-200px)]">
            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Date</Label>
              <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="border-gray-200 text-xs font-semibold" />
            </div>

            {/* Day */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Day</Label>
              <Select value={String(fDay)} onValueChange={v => setFDay(Number(v))}>
                <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[250]">
                  {daysList.map((d, i) => <SelectItem key={d.name} value={String(i)}>{d.full}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Time Slot */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Time Slot</Label>
              <Select value={String(fTimeSlot)} onValueChange={v => setFTimeSlot(Number(v))}>
                <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[250]">
                  {timeSlots.map((t, i) => <SelectItem key={t} value={String(i)}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Subject — searchable combobox, limited to subjects allocated to this grade+section */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Subject</Label>
              {classAssignedSubjects.length > 0 ? (
                <p className="text-[10px] text-purple-600 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {classAssignedSubjects.length} subject{classAssignedSubjects.length !== 1 ? "s" : ""} allocated to {grade} – Section {section}
                </p>
              ) : (
                <p className="text-[10px] text-red-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No subjects allocated to {grade} – Section {section} yet. Assign subjects &amp; teachers in Subject Allocation first.
                </p>
              )}
              <Popover open={fSubjectOpen} onOpenChange={setFSubjectOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={classAssignedSubjects.length === 0}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-md border border-gray-200 bg-white transition-colors text-left",
                      classAssignedSubjects.length === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"
                    )}
                  >
                    <span className={fSubject ? "text-gray-900" : "text-gray-400"}>
                      {fSubject || "Select subject..."}
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0 z-[300]"
                  align="start"
                  onWheel={(e) => e.stopPropagation()}
                >
                  <Command>
                    <CommandInput placeholder="Type to search..." className="h-8 text-xs" />
                    <CommandList style={{ maxHeight: '192px', overflowY: 'scroll' }}>
                      <CommandEmpty className="py-3 text-center text-xs text-gray-400">No subject found.</CommandEmpty>
                      <CommandGroup>
                        {classAssignedSubjects.map(s => (
                          <CommandItem
                            key={s}
                            value={s}
                            onSelect={(val) => { setFSubject(val); setFSubjectOpen(false); }}
                            className="text-xs cursor-pointer"
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", fSubject === s ? "opacity-100" : "opacity-0")} />
                            {s}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Teacher — auto-derived & locked from Subject Allocation; no manual/random selection */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Assigned Teacher</Label>
              {!fSubject ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-400 font-medium">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Select a subject to see its assigned teacher
                </div>
              ) : fTeacher ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                  <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-black text-indigo-700 shrink-0">
                    {fTeacher.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-indigo-900 truncate">{fTeacher}</p>
                    <p className="text-[10px] text-indigo-500">Auto-assigned · locked from Subject Allocation</p>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                </div>
              ) : (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] text-red-700 font-semibold">No teacher assigned to {fSubject} for {grade} – Section {section}.</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Go to Academics → Subject Allocation to assign one before scheduling.</p>
                  </div>
                </div>
              )}

              {/* Inline workload banner for the auto-assigned teacher */}
              {fTeacher && (() => {
                const role  = staffRoles[fTeacher] || "Teacher";
                const limit = getTeacherLimit(role, timetableRules);
                const isEditing = !!editingSlot?.slot;
                const load  = getTeacherDayLoad(
                  fTeacher, fDay,
                  isEditing ? key : undefined,
                  isEditing ? editingSlot?.ri : undefined,
                  isEditing ? editingSlot?.ci : undefined
                );
                const rb    = roleBadge(role);
                if (limit === 0) {
                  return (
                    <div className="flex items-center gap-2 mt-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <p className="text-[11px] text-red-700 font-semibold">{fTeacher} ({role}) has no teaching allocation.</p>
                    </div>
                  );
                }
                const full = load >= limit;
                return (
                  <div className={cn(
                    "flex items-center gap-2 mt-1.5 px-2.5 py-1.5 rounded-lg border",
                    full ? "bg-red-50 border-red-200" : load >= limit - 1 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
                  )}>
                    {full ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[11px] font-bold", full ? "text-red-700" : load >= limit - 1 ? "text-amber-700" : "text-emerald-700")}>
                        {full ? "At daily limit — cannot assign" : `${load}/${limit} periods today`}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{fTeacher} · <span className={cn("font-semibold px-1 rounded", rb.cls)}>{role}</span></p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} className={cn("w-2 h-4 rounded-sm", i < load ? (full ? "bg-red-500" : "bg-amber-400") : "bg-gray-200")} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Class Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["Physical","Online","Hybrid"] as Mode[]).map(m => (
                  <button key={m} type="button" onClick={() => setFMode(m)}
                    className={cn(
                      "py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center",
                      fMode === m
                        ? m === "Physical" ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                          : m === "Online" ? "bg-blue-50 border-blue-500 text-blue-700"
                          : "bg-purple-50 border-purple-500 text-purple-700"
                        : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                    )}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Physical / Hybrid — room */}
            {(fMode === "Physical" || fMode === "Hybrid") && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Classroom / Location</Label>
                <Select value={fRoom} onValueChange={setFRoom}>
                  <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[250]">
                    {CLASSROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Online — platform + link */}
            {fMode === "Online" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Platform</Label>
                  <Select value={fPlatform} onValueChange={setFPlatform}>
                    <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[250]">
                      {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                    <span>Meeting Link</span>
                    <button type="button" onClick={() =>
                      setFLink(`https://meet.jit.si/StudentDiwan-${grade.replace(/\s/g,"")}-${section}-${Date.now().toString(36)}`)
                    } className="text-[10px] font-bold text-purple-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer">
                      <Globe className="w-3.5 h-3.5" /> Auto-Generate
                    </button>
                  </Label>
                  <Input type="text" value={fLink} onChange={e => setFLink(e.target.value)}
                    placeholder="https://meet.jit.si/..."
                    className="border-gray-200 text-xs font-semibold" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-gray-100 absolute bottom-6 left-6 right-6">
            <Button variant="outline" className="border-red-100 hover:bg-red-50 text-red-600 gap-1.5 text-xs" onClick={clearSlot}>
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
            <div className="flex-1" />
            <Button variant="outline" className="border-gray-200 text-xs" onClick={() => setEditingSlot(null)}>Cancel</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-5 font-bold gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveSlot}
              disabled={!fSubject || !fTeacher}
            >
              <Save className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {/* ═══════════════════ TEACHER EDIT DRAWER ═══════════════════ */}
      <Sheet open={tEditSlot !== null} onOpenChange={open => !open && setTEditSlot(null)}>
        <SheetContent className="sm:max-w-md w-full bg-white z-[200]">
          <SheetHeader className="pb-4 border-b border-gray-100">
            <SheetTitle className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              {tEditSlot?.slot ? "Edit Teacher Assignment" : "Assign Period to Teacher"}
            </SheetTitle>
            <SheetDescription className="text-xs text-gray-500">
              {teacher} · {tEditSlot ? `${daysList[tEditSlot.ci]?.full} · ${timeSlots[tEditSlot.ri]}` : ""}
            </SheetDescription>
          </SheetHeader>

          {/* px-1: see Bulk Schedule Online's identical wrapper above — a
              zero-horizontal-padding scroller clips full-width fields' focus
              rings at its own edge, regardless of outer drawer padding. */}
          <div className="space-y-5 px-1 py-5 overflow-y-auto max-h-[calc(100vh-200px)]">
            {/* Teacher (read-only badge) */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Teacher</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center text-xs font-black text-amber-700">
                  {teacher.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-amber-800">{teacher}</span>
              </div>
            </div>

            {/* Class Grade */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Grade</Label>
              <Select value={tGrade} onValueChange={setTGrade}>
                <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[250]">
                  {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Section</Label>
              <div className="grid grid-cols-3 gap-2">
                {ALL_SECTIONS.map(sec => (
                  <button key={sec} type="button" onClick={() => setTSection(sec)}
                    className={cn(
                      "py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center",
                      tSection === sec
                        ? "bg-amber-50 border-amber-500 text-amber-700"
                        : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                    )}>
                    Section {sec}
                  </button>
                ))}
              </div>
            </div>

            {/* Day (display-only, from cell) */}
            {tEditSlot && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Day &amp; Time</Label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700">
                    {daysList[tEditSlot.ci]?.full}
                  </div>
                  <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700">
                    {timeSlots[tEditSlot.ri]}
                  </div>
                </div>
              </div>
            )}

            {/* Subject — searchable combobox, limited to what this teacher is actually assigned to teach */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Subject</Label>
              {teacherAssignedSubjects.length > 0 ? (
                <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {teacher} is assigned {teacherAssignedSubjects.length} subject{teacherAssignedSubjects.length !== 1 ? "s" : ""} for {tGrade} – Section {tSection}
                </p>
              ) : (
                <p className="text-[10px] text-red-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {teacher} is not assigned to any subject for {tGrade} – Section {tSection}.
                </p>
              )}
              <Popover open={tSubjectOpen} onOpenChange={setTSubjectOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={teacherAssignedSubjects.length === 0}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-md border border-gray-200 bg-white transition-colors text-left",
                      teacherAssignedSubjects.length === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"
                    )}
                  >
                    <span className={tSubject ? "text-gray-900" : "text-gray-400"}>
                      {tSubject || "Select subject..."}
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0 z-[300]"
                  align="start"
                  onWheel={(e) => e.stopPropagation()}
                >
                  <Command>
                    <CommandInput placeholder="Type to search..." className="h-8 text-xs" />
                    <CommandList style={{ maxHeight: '192px', overflowY: 'scroll' }}>
                      <CommandEmpty className="py-3 text-center text-xs text-gray-400">No subject found.</CommandEmpty>
                      <CommandGroup>
                        {teacherAssignedSubjects.map(s => (
                          <CommandItem
                            key={s}
                            value={s}
                            onSelect={(val) => { setTSubject(val); setTSubjectOpen(false); }}
                            className="text-xs cursor-pointer"
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", tSubject === s ? "opacity-100" : "opacity-0")} />
                            {s}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Class Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["Physical","Online","Hybrid"] as Mode[]).map(m => (
                  <button key={m} type="button" onClick={() => setTMode(m)}
                    className={cn(
                      "py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center",
                      tMode === m
                        ? m === "Physical" ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                          : m === "Online" ? "bg-blue-50 border-blue-500 text-blue-700"
                          : "bg-purple-50 border-purple-500 text-purple-700"
                        : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                    )}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Room */}
            {(tMode === "Physical" || tMode === "Hybrid") && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Classroom</Label>
                <Select value={tRoom} onValueChange={setTRoom}>
                  <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[250]">
                    {CLASSROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Online */}
            {tMode === "Online" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Platform</Label>
                  <Select value={tPlatform} onValueChange={setTPlatform}>
                    <SelectTrigger className="w-full border-gray-200 cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[250]">
                      {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                    <span>Meeting Link</span>
                    <button type="button" onClick={() =>
                      setTLink(`https://meet.jit.si/StudentDiwan-${tGrade.replace(/\s/g,"")}-${tSection}-${Date.now().toString(36)}`)
                    } className="text-[10px] font-bold text-amber-600 hover:text-amber-800 flex items-center gap-0.5 cursor-pointer">
                      <Globe className="w-3 h-3" /> Auto-Generate
                    </button>
                  </Label>
                  <Input type="text" value={tLink} onChange={e => setTLink(e.target.value)}
                    placeholder="https://meet.jit.si/..."
                    className="border-gray-200 text-xs font-semibold" />
                </div>
              </div>
            )}

            {/* Info banner */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>After saving, click <strong>Send to Teacher Dashboard</strong> to push the full schedule to the teacher's view.</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-gray-100 absolute bottom-6 left-6 right-6">
            {tEditSlot?.slot && (
              <Button variant="outline" className="border-red-100 hover:bg-red-50 text-red-600 gap-1.5 text-xs" onClick={clearTeacherSlot}>
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" className="border-gray-200 text-xs" onClick={() => setTEditSlot(null)}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-5 font-bold gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveTeacherSlot}
              disabled={!tSubject || !teacherAssignedSubjects.includes(tSubject)}
            >
              <Save className="w-3.5 h-3.5" /> Save Assignment
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Timetable;
