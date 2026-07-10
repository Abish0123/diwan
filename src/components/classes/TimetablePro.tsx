import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Calendar, CalendarClock,
  BookOpen, Users, Building2, Sparkles, UserPlus, Repeat, Plus, Coffee,
  DoorOpen, AlertTriangle, Download, Send, Clock, Trash2,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const C = { primary: "#7C3AED", secondary: "#A855F7", success: "#22C55E", warning: "#F59E0B", error: "#EF4444" };

const SUBJ: Record<string, { hex: string; light: string }> = {
  English: { hex: "#7C3AED", light: "#F1ECFF" },
  Mathematics: { hex: "#2563EB", light: "#DBEAFE" },
  Science: { hex: "#22C55E", light: "#DCFCE7" },
  Urdu: { hex: "#F59E0B", light: "#FEF3C7" },
  Islamiyat: { hex: "#0EA5E9", light: "#E0F2FE" },
  Activity: { hex: "#EC4899", light: "#FCE7F3" },
  Library: { hex: "#64748B", light: "#F1F5F9" },
  Computer: { hex: "#8B5CF6", light: "#EDE9FE" },
  Assembly: { hex: "#14B8A6", light: "#CCFBF1" },
  "Physical Training": { hex: "#EF4444", light: "#FEE2E2" },
  "Islamic Studies": { hex: "#0EA5E9", light: "#E0F2FE" },
  "Social Studies": { hex: "#F59E0B", light: "#FEF3C7" },
  "Physical Education": { hex: "#EF4444", light: "#FEE2E2" },
  Art: { hex: "#EC4899", light: "#FCE7F3" },
  Quran: { hex: "#14B8A6", light: "#CCFBF1" },
};

// Shared timetable time slots — must match /timetable admin page
const ADMIN_TIME_SLOTS = ["08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 01:00"];
const ADMIN_DAYS       = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface CellData { subject: string; teacher?: string; room: string; slotId?: string; }
interface Row { time: string; break?: boolean; cells?: CellData[]; }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const QUICK_ACTIONS = [
  { label: "Assign Teacher", icon: UserPlus }, { label: "Swap Period", icon: Repeat },
  { label: "Add Period", icon: Plus }, { label: "Add Break", icon: Coffee },
  { label: "Room Allocation", icon: DoorOpen }, { label: "View Conflicts", icon: AlertTriangle },
  { label: "Export Timetable", icon: Download }, { label: "Publish", icon: Send },
];

const SUBJECT_LIST = ["English", "Mathematics", "Science", "Urdu", "Islamiyat", "Islamic Studies", "Social Studies", "Activity", "Library", "Computer", "Assembly", "Physical Training", "Physical Education", "Art", "Quran"];

const initials = (n: string) => n.replace(/^(Miss|Mr\.|Mrs\.)\s*/, "").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

interface SectionRef { letter: string; classId: string; }
interface TimetableProProps {
  classData: { name?: string; grade?: string; academicYear?: string };
  sections?: SectionRef[];
  lockedSection?: string;
  slots?: any[];
  academicYear?: string;
  onSaveSlot?: (slot: any) => Promise<void> | void;
  onDeleteSlot?: (slotId: string) => Promise<void> | void;
  semesterName?: string | null;
  onExportData?: (payload: { header: string[]; rows: (string | number)[][]; filename: string }) => void;
}

// ── Write a single cell to the shared localStorage timetable ─────────────────
function writeToSharedTimetable(grade: string, sec: string, day: string, time: string, subject: string, teacher: string, room: string) {
  const dayIdx = ADMIN_DAYS.indexOf(day);
  let timeIdx = ADMIN_TIME_SLOTS.indexOf(time);
  if (timeIdx < 0) {
    // Fuzzy match by start hour
    const startH = time.split("-")[0].trim().split(":")[0];
    timeIdx = ADMIN_TIME_SLOTS.findIndex(t => t.trim().startsWith(startH + ":"));
  }
  if (dayIdx < 0 || timeIdx < 0) return;

  const gradeKey = `${grade}-${sec}`;
  for (const key of ["sd_timetables_v3_draft", "sd_timetables_v3"]) {
    try {
      const raw = localStorage.getItem(key);
      const all = raw ? JSON.parse(raw) : {};
      if (!all[gradeKey]) all[gradeKey] = ADMIN_TIME_SLOTS.map(() => ADMIN_DAYS.map(() => null));
      if (!Array.isArray(all[gradeKey][timeIdx])) all[gradeKey][timeIdx] = ADMIN_DAYS.map(() => null);
      all[gradeKey][timeIdx][dayIdx] = { mode: "Physical", subject, teacher: teacher || "", room: room || "" };
      localStorage.setItem(key, JSON.stringify(all));
    } catch { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent("sd-timetable-updated"));
  window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
}

function clearFromSharedTimetable(grade: string, sec: string, day: string, time: string) {
  const dayIdx = ADMIN_DAYS.indexOf(day);
  let timeIdx = ADMIN_TIME_SLOTS.indexOf(time);
  if (timeIdx < 0) {
    const startH = time.split("-")[0].trim().split(":")[0];
    timeIdx = ADMIN_TIME_SLOTS.findIndex(t => t.trim().startsWith(startH + ":"));
  }
  if (dayIdx < 0 || timeIdx < 0) return;

  const gradeKey = `${grade}-${sec}`;
  for (const key of ["sd_timetables_v3_draft", "sd_timetables_v3"]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const all = JSON.parse(raw);
      if (Array.isArray(all[gradeKey]?.[timeIdx])) {
        all[gradeKey][timeIdx][dayIdx] = null;
        localStorage.setItem(key, JSON.stringify(all));
      }
    } catch { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent("sd-timetable-updated"));
  window.dispatchEvent(new CustomEvent("sd-timetable-draft-updated"));
}

export default function TimetablePro(props: TimetableProProps) {
  const allSections: SectionRef[] = props.sections && props.sections.length ? props.sections : [{ letter: "A", classId: "" }];
  const sectionList: SectionRef[] = props.lockedSection
    ? allSections.filter(s => s.letter === props.lockedSection).length
      ? allSections.filter(s => s.letter === props.lockedSection)
      : [{ letter: props.lockedSection, classId: allSections[0]?.classId || "" }]
    : allSections;
  const [section, setSection] = useState(sectionList[0].letter);
  const activeClassId = sectionList.find(s => s.letter === section)?.classId || "";
  const allSlots = props.slots || [];
  const propSectionSlots = useMemo(() => allSlots.filter(s => s.classId === activeClassId), [allSlots, activeClassId]);

  const [view, setView] = useState<"grid" | "list" | "calendar">("grid");
  const [weekOffset, setWeekOffset] = useState(0);
  const [extraTimes, setExtraTimes] = useState<Record<string, string[]>>({});
  const [editCell, setEditCell] = useState<{ time: string; day: string } | null>(null);
  const [cellForm, setCellForm] = useState<CellData>({ subject: "", teacher: "", room: "" });
  const [cellTime, setCellTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); return { m: d.getMonth(), y: d.getFullYear() }; });

  // Real teachers fetched from staff API
  const [teacherList, setTeacherList] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/data/staff").then(r => r.json()).then((data: any[]) => {
      if (!Array.isArray(data)) return;
      const names = [...new Set<string>(
        data.filter(s =>
          s.role === "Teacher" ||
          s.role === "Class Teacher" ||
          s.role === "Grade Coordinator" ||
          (typeof s.role === "string" && s.role.startsWith("HOD"))
        ).map(s => s.name).filter(Boolean)
      )];
      if (names.length) setTeacherList(names);
    }).catch(() => {});
  }, []);

  // ── Read from the shared admin timetable (sd_timetables_v3) ─────────────────
  function readLocalTimetable(grade: string, sec: string): any[] {
    try {
      const raw = localStorage.getItem("sd_timetables_v3");
      if (!raw) return [];
      const all = JSON.parse(raw);
      const grid: any[][] = all[`${grade}-${sec}`] || all[`Grade ${grade}-${sec}`];
      if (!grid) return [];
      const slots: any[] = [];
      grid.forEach((row: any[], ri: number) => {
        if (ri >= ADMIN_TIME_SLOTS.length) return;
        const [startTime, endTime] = ADMIN_TIME_SLOTS[ri].split(" - ");
        row.forEach((slot: any, ci: number) => {
          if (ci >= ADMIN_DAYS.length) return;
          if (!slot || !slot.subject) return;
          slots.push({
            id: `local-${ri}-${ci}`,
            day: ADMIN_DAYS[ci],
            startTime: startTime.trim(),
            endTime: endTime.trim(),
            subject: slot.subject,
            teacherName: slot.teacher || "",
            room: slot.room || "",
            classId: activeClassId,
          });
        });
      });
      return slots;
    } catch { return []; }
  }

  const grade = props.classData?.grade || "";
  const [localAdminSlots, setLocalAdminSlots] = useState<any[]>(() => readLocalTimetable(grade, section));

  useEffect(() => {
    function refresh() { setLocalAdminSlots(readLocalTimetable(grade, section)); }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("sd-timetable-updated", refresh);
    window.addEventListener("sd-timetable-draft-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("sd-timetable-updated", refresh);
      window.removeEventListener("sd-timetable-draft-updated", refresh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, section]);

  // DB slots take priority; fall back to admin localStorage when DB is empty
  const mergedSlots = propSectionSlots.length > 0 ? propSectionSlots : localAdminSlots;

  const [sectionSlots, setSectionSlots] = useState<any[]>(mergedSlots);
  useEffect(() => { setSectionSlots(mergedSlots); }, [propSectionSlots, localAdminSlots]);

  function selectSection(s: string) { setSection(s); }
  const weekLabel = ["26 May - 31 May 2024", "2 Jun - 7 Jun 2024", "9 Jun - 14 Jun 2024", "19 May - 24 May 2024"][((weekOffset % 4) + 4) % 4];

  // Grid times — derived from real slots only (no fake template times)
  const times = useMemo(() => {
    if (sectionSlots.length === 0) return [];
    const slotTimes = sectionSlots.map(s => `${s.startTime} - ${s.endTime}`);
    return [...new Set([...slotTimes, ...(extraTimes[section] || [])])].sort();
  }, [sectionSlots, extraTimes, section]);

  // Schedule — built entirely from real slots; empty when no data
  const schedule: Row[] = useMemo(() => {
    if (sectionSlots.length === 0) return [];
    return times.map(time => ({
      time,
      cells: DAYS.map(day => {
        const slot = sectionSlots.find(s => s.day === day && `${s.startTime} - ${s.endTime}` === time);
        return slot
          ? { subject: slot.subject, teacher: slot.teacherName || "", room: slot.room || "", slotId: slot.id }
          : { subject: "Free", teacher: "", room: "—" };
      }),
    }));
  }, [times, sectionSlots]);

  // Computed KPIs from real data
  const realPeriods = sectionSlots.length;
  const realSubjects = new Set(sectionSlots.map(s => s.subject)).size;
  const realTeachers = new Set(sectionSlots.map(s => s.teacherName).filter(Boolean)).size;

  // Computed subject distribution
  const subjectDist = useMemo(() => {
    const counts: Record<string, number> = {};
    sectionSlots.forEach(s => { counts[s.subject] = (counts[s.subject] || 0) + 1; });
    const total = sectionSlots.length || 1;
    return Object.entries(counts).map(([name, value]) => ({
      name, value, pct: Math.round((value / total) * 100),
      hex: (SUBJ[name] || SUBJ.Library).hex,
    }));
  }, [sectionSlots]);

  // Computed teacher workload
  const teacherWorkload = useMemo(() => {
    const counts: Record<string, number> = {};
    sectionSlots.forEach(s => {
      if (s.teacherName) counts[s.teacherName] = (counts[s.teacherName] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, periods]) => ({ name, periods }));
  }, [sectionSlots]);

  // Bubble current timetable for export
  useEffect(() => {
    const header = ["Time", ...DAYS];
    const rows: (string | number)[][] = schedule.map(r =>
      r.break ? [r.time, "Break", "Break", "Break", "Break", "Break"]
        : [r.time, ...r.cells!.map(c => c.subject + (c.teacher ? ` (${c.teacher})` : ""))]);
    props.onExportData?.({
      header,
      rows,
      filename: `${(props.classData?.grade || "class").replace(/\s+/g, "-")}-Section-${section}-timetable.csv`,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, section]);

  function openCell(time: string, day: string, c: CellData) {
    setEditCell({ time, day });
    setCellForm({ subject: c.subject, teacher: c.teacher || "", room: c.room });
    setCellTime(time);
  }

  async function saveCell() {
    if (!editCell) return;
    const newTime = cellTime || editCell.time;
    const [startTime, endTime] = newTime.split(" - ");
    const existing = sectionSlots.find(s => s.day === editCell.day && `${s.startTime} - ${s.endTime}` === editCell.time);
    const slot: any = {
      ...(existing ? { id: existing.id } : { id: `tmp-${editCell.day}-${startTime}` }),
      day: editCell.day, startTime: (startTime || "").trim(), endTime: (endTime || "").trim(),
      subject: cellForm.subject, teacherName: cellForm.teacher, teacherId: "", room: cellForm.room,
      classId: activeClassId, sectionId: activeClassId, academicYear: props.academicYear || "",
    };
    setSectionSlots(prev => [
      ...prev.filter(s => !(s.day === editCell.day && `${s.startTime} - ${s.endTime}` === editCell.time)),
      slot,
    ]);
    setEditCell(null);
    setSaving(true);
    try {
      await props.onSaveSlot?.(existing ? slot : { ...slot, id: undefined });
      // Propagate to shared localStorage so /timetable page reflects this immediately
      writeToSharedTimetable(grade, section, editCell.day, newTime, cellForm.subject, cellForm.teacher || "", cellForm.room || "");
      toast.success("Period saved and published to all portals");
    } catch { toast.error("Could not save period"); }
    finally { setSaving(false); }
  }

  async function clearCell() {
    if (!editCell) return;
    const existing = sectionSlots.find(s => s.day === editCell.day && `${s.startTime} - ${s.endTime}` === editCell.time);
    setSectionSlots(prev => prev.filter(s => !(s.day === editCell.day && `${s.startTime} - ${s.endTime}` === editCell.time)));
    setEditCell(null);
    setSaving(true);
    try {
      if (existing && !String(existing.id).startsWith("tmp-")) await props.onDeleteSlot?.(existing.id);
      // Remove from shared localStorage too
      clearFromSharedTimetable(grade, section, editCell.day, editCell.time);
      toast.success("Period cleared");
    } catch { toast.error("Could not clear period"); }
    finally { setSaving(false); }
  }

  function addPeriod() {
    const last = times[times.length - 1] || "12:00 - 01:00";
    const startH = parseInt(last) || 13;
    const newTime = `${String(startH + 1).padStart(2, "0")}:00 - ${String(startH + 1).padStart(2, "0")}:40`;
    setExtraTimes(prev => ({ ...prev, [section]: [...(prev[section] || []), newTime] }));
    toast.success("New period row added — click a cell to fill & save it");
  }
  function addBreak() {
    setExtraTimes(prev => ({ ...prev, [section]: [...(prev[section] || []), "10:00 - 10:20"] }));
    toast.info("Break row added");
  }

  function handleQuickAction(label: string) {
    if (label === "Add Period") return addPeriod();
    if (label === "Add Break") return addBreak();
    if (label === "Export Timetable") {
      const lines = ["Time," + DAYS.join(",")];
      schedule.forEach(r => { if (r.break) lines.push(`${r.time},BREAK,,,,`); else lines.push(`${r.time},${r.cells!.map(c => c.subject).join(",")}`); });
      const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n")); a.download = "timetable.csv"; a.click();
      return toast.success("Timetable exported");
    }
    toast.success(label);
  }

  const kpis = [
    { label: "Weekly Periods", value: realPeriods, sub: "Total Periods", icon: CalendarClock, hex: "#7C3AED", light: "#F1ECFF" },
    { label: "Subjects", value: realSubjects, sub: "Subjects in timetable", icon: BookOpen, hex: "#22C55E", light: "#DCFCE7" },
    { label: "Teachers Assigned", value: realTeachers, sub: "From staff directory", icon: Users, hex: "#F59E0B", light: "#FEF3C7" },
    { label: "Days Covered", value: realPeriods > 0 ? new Set(sectionSlots.map(s => s.day)).size : 0, sub: "School days", icon: Building2, hex: "#2563EB", light: "#DBEAFE" },
  ];

  return (
    <div className="space-y-5">
      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="border border-slate-100 shadow-sm rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all">
            <CardContent className="p-5 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: k.light }}><k.icon style={{ color: k.hex, width: 22, height: 22 }} /></div>
              <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">{k.label}</p><p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{k.value}</p><p className="text-[11px] text-slate-400 truncate">{k.sub}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Grid + Sidebar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* Weekly Timetable */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
            <div>
              <p className="font-bold text-lg text-slate-900">Weekly Timetable</p>
              <p className="text-xs text-slate-400 font-medium">{props.classData?.grade || "Grade"} · Section {section}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-semibold text-slate-700 px-2 min-w-[150px] text-center">{weekLabel}</span>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="flex items-center rounded-xl border border-slate-200 p-0.5">
                <button title="Grid view" className={cn("p-1.5 rounded-lg", view === "grid" ? "text-white" : "text-slate-400")} style={view === "grid" ? { background: C.primary } : undefined} onClick={() => setView("grid")}><LayoutGrid className="w-4 h-4" /></button>
                <button title="List view" className={cn("p-1.5 rounded-lg", view === "list" ? "text-white" : "text-slate-400")} style={view === "list" ? { background: C.primary } : undefined} onClick={() => setView("list")}><List className="w-4 h-4" /></button>
                <button title="Calendar view" className={cn("p-1.5 rounded-lg", view === "calendar" ? "text-white" : "text-slate-400")} style={view === "calendar" ? { background: C.primary } : undefined} onClick={() => setView("calendar")}><Calendar className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Section tabs */}
          {!props.lockedSection && sectionList.length > 1 && (
            <div className="flex items-center gap-1.5 px-5 pb-3 flex-wrap">
              {sectionList.map(s => (
                <button key={s.letter} onClick={() => selectSection(s.letter)}
                  className={cn("text-xs font-bold rounded-lg px-3 py-1.5 border transition-colors",
                    section === s.letter ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>
                  Section {s.letter}
                </button>
              ))}
            </div>
          )}

          {view === "grid" && (
          <div className="overflow-x-auto">
            {schedule.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <Calendar className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No timetable set for {props.classData?.grade} Section {section}</p>
                <p className="text-xs text-slate-400 mt-1">Go to <strong>Timetable</strong> in the admin menu to configure periods, then click Publish.</p>
                <p className="text-xs text-slate-400 mt-0.5">Or click a cell below after adding a period row using Quick Actions.</p>
              </div>
            ) : (
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-[92px]">Time</th>
                  {DAYS.map(d => <th key={d} className="text-center px-2 py-3 text-xs font-bold text-slate-600">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {schedule.map((row, ri) => row.break ? (
                  <tr key={ri}>
                    <td className="px-3 py-2 text-[10px] font-bold text-slate-400">{row.time}</td>
                    <td colSpan={5} className="px-2 py-2">
                      <div className="rounded-lg bg-amber-50 text-amber-600 text-center text-xs font-bold py-1.5">Break Time</div>
                    </td>
                  </tr>
                ) : (
                  <tr key={ri}>
                    <td className="px-3 py-1.5 text-[10px] font-bold text-slate-400 align-top">{row.time}</td>
                    {row.cells!.map((c, ci) => {
                      const col = SUBJ[c.subject] || SUBJ.Library;
                      return (
                        <td key={ci} className="px-1 py-1.5 align-top">
                          <div className="rounded-lg p-2 border-l-[3px] cursor-pointer hover:shadow-md hover:ring-1 hover:ring-violet-200 transition-all" style={{ background: col?.light || "#F1F5F9", borderColor: col?.hex || "#64748B" }} onClick={() => openCell(row.time, DAYS[ci], c)}>
                            <p className="text-[11px] font-bold leading-tight" style={{ color: col?.hex || "#64748B" }}>{c.subject}</p>
                            <p className="text-[9px] text-slate-500 leading-tight mt-0.5 truncate">{c.teacher}</p>
                            <p className="text-[9px] text-slate-400 leading-tight truncate">{c.room}</p>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          )}

          {/* List view */}
          {view === "list" && (
            <div className="p-5 pt-0 space-y-4">
              {schedule.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">No timetable configured yet.</div>
              ) : DAYS.map((d, ci) => (
                <div key={d}>
                  <p className="text-xs font-bold text-slate-700 mb-2">{d}</p>
                  <div className="space-y-1.5">
                    {schedule.map((row, ri) => row.break ? (
                      <div key={ri} className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                        <span className="text-[10px] font-bold text-amber-600 w-24">{row.time}</span>
                        <span className="text-xs font-bold text-amber-600">Break Time</span>
                      </div>
                    ) : (() => {
                      const c = row.cells![ci]; const col = SUBJ[c.subject] || SUBJ.Library;
                      return (
                        <button key={ri} onClick={() => openCell(row.time, DAYS[ci], c)} className="flex items-center gap-3 w-full rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 text-left">
                          <span className="text-[10px] font-bold text-slate-400 w-24 shrink-0">{row.time}</span>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col?.hex || "#64748B" }} />
                          <span className="text-xs font-semibold text-slate-700 w-28 shrink-0 truncate">{c.subject}</span>
                          <span className="text-[11px] text-slate-500 flex-1 truncate">{c.teacher}</span>
                          <span className="text-[11px] text-slate-400 truncate">{c.room}</span>
                        </button>
                      );
                    })())}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Calendar view */}
          {view === "calendar" && (() => {
            const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
            const firstWeekday = (new Date(calCursor.y, calCursor.m, 1).getDay() + 6) % 7;
            const cells: (number | null)[] = [];
            for (let i = 0; i < firstWeekday; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            const iso = (d: number) => `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const moveMonth = (delta: number) => setCalCursor(c => { let m = c.m + delta, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { m, y }; });
            const selWeekday = selectedDate ? new Date(selectedDate + "T00:00:00").getDay() : null;
            const selDayName = selWeekday !== null ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][selWeekday] : null;
            const isSchoolDay = selDayName ? DAYS.includes(selDayName) : false;
            const ci = selDayName ? DAYS.indexOf(selDayName) : -1;
            return (
            <div className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => moveMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-sm font-bold text-slate-700">{MONTHS[calCursor.m]} {calCursor.y}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-slate-400 hover:text-purple-600" onClick={() => moveMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} />;
                    const dIso = iso(d);
                    const wd = new Date(dIso + "T00:00:00").getDay();
                    const weekend = wd === 0 || wd === 6;
                    const isSel = selectedDate === dIso;
                    return (
                      <button key={i} onClick={() => setSelectedDate(dIso)}
                        className={cn("aspect-square rounded-lg flex items-center justify-center text-xs font-semibold transition-all",
                          isSel ? "bg-purple-600 text-white shadow" : weekend ? "text-slate-300 hover:bg-slate-50" : "text-slate-600 hover:bg-violet-50")}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-w-0">
                {!selectedDate ? (
                  <div className="h-full rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-12 text-center">
                    <Calendar className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-500">Pick a date to view its timetable</p>
                    <p className="text-xs text-slate-400 mt-0.5">Section {section} · {props.classData?.grade}</p>
                  </div>
                ) : !isSchoolDay ? (
                  <div className="h-full rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-12 text-center">
                    <Coffee className="w-8 h-8 text-amber-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-500">{selDayName} — no classes (weekend)</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                ) : schedule.length === 0 ? (
                  <div className="h-full rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-12 text-center">
                    <Calendar className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-500">No timetable configured yet</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-600 to-violet-500 px-4 py-3 text-white">
                      <p className="text-sm font-bold">{selDayName}, {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</p>
                      <p className="text-[11px] text-white/80">Section {section} · {schedule.filter(r => !r.break).length} periods</p>
                    </div>
                    <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
                      {schedule.map((row, ri) => row.break ? (
                        <div key={ri} className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
                          <span className="text-[10px] font-bold text-amber-600 w-24 shrink-0">{row.time}</span>
                          <span className="text-xs font-bold text-amber-600">Break Time</span>
                        </div>
                      ) : (() => {
                        const c = row.cells![ci] || { subject: "Free", teacher: "", room: "—" };
                        const col = SUBJ[c.subject] || SUBJ.Library;
                        return (
                          <button key={ri} onClick={() => openCell(row.time, DAYS[ci], c)} className="w-full flex items-center gap-3 rounded-lg p-2.5 border-l-[3px] text-left hover:shadow-sm transition-all" style={{ background: col?.light || "#F1F5F9", borderColor: col?.hex || "#64748B" }}>
                            <span className="text-[10px] font-bold text-slate-500 w-24 shrink-0">{row.time}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold leading-tight" style={{ color: col?.hex || "#64748B" }}>{c.subject}</p>
                              <p className="text-[10px] text-slate-400 truncate">{c.teacher}{c.teacher && c.room ? " · " : ""}{c.room}</p>
                            </div>
                          </button>
                        );
                      })())}
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}
        </Card>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Subject Distribution */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Subject Distribution <span className="text-xs text-slate-400 font-medium">(Weekly)</span></p>
              {subjectDist.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No timetable data yet</p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={subjectDist} dataKey="value" innerRadius={36} outerRadius={54} paddingAngle={2} stroke="none">{subjectDist.map((d, i) => <Cell key={i} fill={d.hex} />)}</Pie></PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-black text-slate-900 leading-none">{realPeriods}</span><span className="text-[8px] text-slate-400 font-semibold mt-0.5">Periods</span></div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {subjectDist.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="w-2 h-2 rounded-full" style={{ background: d.hex }} />{d.name}</span><span className="font-bold text-slate-700">{d.value} ({d.pct}%)</span></div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Teacher Workload */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Teacher Workload <span className="text-xs text-slate-400 font-medium">(Periods)</span></p>
              {teacherWorkload.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No teachers assigned yet</p>
              ) : (
                <div className="space-y-3">
                  {teacherWorkload.map(w => (
                    <div key={w.name} className="flex items-center gap-2.5">
                      <Avatar className="w-7 h-7"><AvatarFallback className="text-[9px] font-bold text-white" style={{ background: C.secondary }}>{initials(w.name)}</AvatarFallback></Avatar>
                      <span className="text-xs font-medium text-slate-700 flex-1 truncate">{w.name}</span>
                      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (w.periods / Math.max(realPeriods, 1)) * 100 * 2)}%`, background: C.primary }} /></div>
                      <span className="text-[11px] font-bold text-slate-500 w-10 text-right">{w.periods}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border border-slate-100 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="font-bold text-slate-900 mb-3">Quick Actions</p>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => handleQuickAction(a.label)} className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors text-center">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${C.primary}12` }}><a.icon className="w-4 h-4" style={{ color: C.primary }} /></span>
                    <span className="text-[9px] font-semibold text-slate-600 leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Bottom Summary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timetable Summary */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <p className="font-bold text-slate-900 mb-4">Timetable Summary</p>
            <div className="space-y-3">
              {[
                { icon: Clock, label: "Start Time", value: sectionSlots.length > 0 ? (sectionSlots.sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime) : "—" },
                { icon: Clock, label: "End Time", value: sectionSlots.length > 0 ? (sectionSlots.sort((a, b) => b.endTime.localeCompare(a.endTime))[0].endTime) : "—" },
                { icon: Calendar, label: "Days", value: sectionSlots.length > 0 ? [...new Set(sectionSlots.map(s => s.day))].join(", ").slice(0, 30) : "Not configured" },
                { icon: BookOpen, label: "Total Periods", value: realPeriods > 0 ? `${realPeriods} periods/week` : "None yet" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-500"><s.icon className="w-4 h-4 text-slate-400" />{s.label}</span>
                  <span className="text-sm font-bold text-slate-800">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Timetable Assistant */}
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden" style={{ background: "#F5F1FF" }}>
          <CardContent className="p-5 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4" style={{ color: C.primary }} /><p className="font-bold" style={{ color: C.primary }}>AI Timetable Assistant</p></div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {realPeriods === 0
                  ? <li className="flex items-start gap-1.5"><span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: C.primary }} />No timetable configured yet — go to the Timetable admin page to set it up</li>
                  : [
                    `${realPeriods} periods scheduled across ${new Set(sectionSlots.map(s => s.day)).size} days`,
                    `${realSubjects} subject${realSubjects !== 1 ? "s" : ""} in rotation`,
                    realTeachers > 0 ? `${realTeachers} teacher${realTeachers !== 1 ? "s" : ""} assigned` : "No teachers assigned yet",
                    "Timetable auto-publishes to student and teacher portals",
                    "Edit any cell to update and re-publish instantly",
                  ].map((t, i) => <li key={i} className="flex items-start gap-1.5"><span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: C.primary }} />{t}</li>)
                }
              </ul>
            </div>
            <Button className="mt-4 rounded-xl text-white font-semibold shadow-lg w-full" style={{ background: C.primary }} onClick={() => toast.success("Optimizing timetable…")}>
              <Sparkles className="w-4 h-4 mr-1.5" /> Optimize Timetable
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Edit period dialog */}
      <Dialog open={!!editCell} onOpenChange={o => !o && setEditCell(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Period</DialogTitle><DialogDescription>{editCell ? `${editCell.time} · ${editCell.day} · Section ${section}` : ""}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs font-semibold text-slate-500">Time Slot</Label>
              <Select value={cellTime || editCell?.time || ""} onValueChange={setCellTime}>
                <SelectTrigger><SelectValue placeholder="Select time slot" /></SelectTrigger>
                <SelectContent>
                  {ADMIN_TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  {cellTime && !ADMIN_TIME_SLOTS.includes(cellTime) && <SelectItem value={cellTime}>{cellTime}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs font-semibold text-slate-500">Subject</Label>
              <Select value={cellForm.subject} onValueChange={v => setCellForm(f => ({ ...f, subject: v }))}><SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger><SelectContent>{["Free", ...SUBJECT_LIST].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs font-semibold text-slate-500">Teacher</Label>
              {teacherList.length > 0 ? (
                <Select value={cellForm.teacher || ""} onValueChange={v => setCellForm(f => ({ ...f, teacher: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>{teacherList.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={cellForm.teacher || ""} onChange={e => setCellForm(f => ({ ...f, teacher: e.target.value }))} placeholder="Teacher name" />
              )}
            </div>
            <div><Label className="text-xs font-semibold text-slate-500">Room</Label><Input value={cellForm.room} onChange={e => setCellForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 101" /></div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" className="text-red-600 hover:text-red-700 gap-1.5" onClick={clearCell} disabled={saving}><Trash2 className="w-4 h-4" /> Clear</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditCell(null)} disabled={saving}>Cancel</Button>
              <Button className="text-white" style={{ background: C.primary }} onClick={saveCell} disabled={saving}>{saving ? "Saving…" : "Save & Publish"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
