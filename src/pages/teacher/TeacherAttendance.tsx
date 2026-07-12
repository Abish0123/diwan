import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useActiveSubjectAssignment } from "@/hooks/useActiveSubject";
import { useStudents } from "@/contexts/StudentContext";
import { SubjectContextBar } from "@/components/teacher/SubjectContextBar";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { notifyParentsOfStudents, notifyClassTeacherEvent } from "@/lib/classPublishNotify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users, CheckCircle2, XCircle, Clock, BarChart3, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, Search, Save, Upload, MessageSquare,
  FileSpreadsheet, CalendarDays, Download, Bus,
} from "lucide-react";

// Published timetable's real weekday columns and period time-slots — must
// mirror TeacherTimetable.tsx exactly since they read the same gridJson.
const DISPLAY_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ADMIN_TIME_SLOTS = ["08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 01:00"];

function normTeacherName(s?: string) {
  return String(s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}
function periodSlug(p: string) {
  return p.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

type Status = "P" | "A" | "L";

const AVATAR_COLORS = [
  "bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500",
  "bg-sky-500", "bg-rose-500", "bg-violet-500", "bg-teal-500",
];

function StudentAvatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = name.charAt(0).toUpperCase() + (name.split(" ")[1]?.charAt(0).toUpperCase() || "");
  return (
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", color)}>
      {initials}
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtLongDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}


export default function TeacherAttendance() {
  const { assignment, classStudents } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const { students: allStudents } = useStudents();
  const [activeSubject, setActiveSubject] = useActiveSubjectAssignment(mySubjects);

  // Use subject-teacher scope if a subject is selected, otherwise fall back to class teacher assignment
  const grade   = activeSubject?.grade   || assignment.grade   || "Grade 5";
  const section = (activeSubject?.section || assignment.section || "B").toUpperCase();
  const className = activeSubject
    ? `${activeSubject.grade} · Sec ${activeSubject.section} · ${activeSubject.subject}`
    : assignment.className || `${grade} - ${section}`;

  // Students scoped to effective grade/section. Student.grade is stored
  // WITHOUT the "Grade " prefix (e.g. "5"), but subject_assignments.grade is
  // stored WITH it (e.g. "Grade 5") — must canonicalize both sides, a plain
  // lowercase compare never matches real records.
  const students_override = useMemo(() => {
    if (!activeSubject) return null;
    const canon = (v: string) => String(v || "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const g = canon(activeSubject.grade);
    const s = activeSubject.section.trim().toUpperCase();
    return allStudents.filter(st => {
      const sg = canon(String(st.grade || ""));
      const ss = String(st.section || "").trim().toUpperCase();
      return sg === g && ss === s;
    });
  }, [activeSubject, allStudents]);

  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [periodFilter, setPeriodFilter] = useState("All Periods");
  const PER_PAGE = 8;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real published timetable grid — same source (/api/data/timetable_slots
  // /published-timetable-v3) TeacherTimetable.tsx reads. Used to derive which
  // periods actually exist for this class on the selected date, instead of a
  // hardcoded placeholder period list unrelated to the real class schedule.
  const [dbGrid, setDbGrid] = useState<Record<string, ({ subject?: string; teacher?: string } | null)[][]> | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !data || data.error || !data.gridJson) return;
        try { setDbGrid(JSON.parse(data.gridJson)); } catch { /* ignore */ }
      }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Real Transport boarding marks for the selected date — reference-only
  // (shown as a small badge next to the student's name). Deliberately never
  // auto-marks or overrides the actual Present/Absent/Late attendance below:
  // boarding the bus isn't proof a student made it into class (breakdowns,
  // a missed scan, or a student who's dropped elsewhere all mean the two
  // signals can legitimately disagree), so the teacher's own mark stays the
  // single source of truth for official attendance.
  const [transportBoarding, setTransportBoarding] = useState<Record<string, { status: string; markedAt: string }>>({});
  useEffect(() => {
    let alive = true;
    smartDb.getAll("TransportAttendance", undefined)
      .then((rows) => {
        if (!alive) return;
        const forDate = (rows as { studentId?: string; status?: string; markedAt?: string }[])
          .filter(r => r.studentId && r.markedAt && r.markedAt.slice(0, 10) === date);
        const latest: Record<string, { status: string; markedAt: string }> = {};
        for (const r of forDate) {
          const prev = latest[r.studentId!];
          if (!prev || r.markedAt! > prev.markedAt) latest[r.studentId!] = { status: r.status!, markedAt: r.markedAt! };
        }
        setTransportBoarding(latest);
      })
      .catch(() => setTransportBoarding({}));
    return () => { alive = false; };
  }, [date]);

  // Real periods for this teacher's class on the selected date — matched by
  // real teacher name (and subject, when a subject-class is active) against
  // the admin-published grid, not an arbitrary fixed list.
  const realPeriods = useMemo(() => {
    if (!dbGrid) return [];
    const grid = dbGrid[`${grade}-${section}`];
    if (!Array.isArray(grid)) return [];
    const jsDay = new Date(date + "T00:00:00").getDay(); // 0 = Sun ... 6 = Sat
    const dayIdx = jsDay - 1; // Monday = 0 ... Friday = 4
    if (dayIdx < 0 || dayIdx > 4) return [];
    const teacherName = normTeacherName(assignment.teacherName);
    const subjectFilter = activeSubject?.subject;
    const out: { time: string; subject: string }[] = [];
    grid.forEach((row, pi) => {
      if (!Array.isArray(row)) return;
      const cell = row[dayIdx];
      if (!cell) return;
      const matchesTeacher = teacherName && normTeacherName(cell.teacher) === teacherName;
      const matchesSubject = subjectFilter ? cell.subject === subjectFilter : true;
      if (matchesTeacher && matchesSubject) {
        out.push({ time: ADMIN_TIME_SLOTS[pi] || `Period ${pi + 1}`, subject: cell.subject || "" });
      }
    });
    return out;
  }, [dbGrid, grade, section, date, assignment.teacherName, activeSubject]);

  const periodOptions = useMemo(() =>
    ["All Periods", ...realPeriods.map(p => `${p.time} · ${p.subject}`)],
    [realPeriods]);

  // Reset back to "All Periods" if the previously-selected period no longer
  // exists on the real schedule for the newly selected date/class.
  useEffect(() => {
    if (!periodOptions.includes(periodFilter)) setPeriodFilter("All Periods");
  }, [periodOptions]);

  const students = useMemo(() => {
    const base = students_override ?? classStudents;
    return (base as any[]).map((s: any, i: number) => ({
      ...s,
      admNo: s.studentId || s.id || `STU-${String(i + 1).padStart(3, "0")}`,
    }));
  }, [classStudents, students_override]);

  // A specific real period selection gets its own record (so marking
  // attendance for one period doesn't clobber another period's record the
  // same day); "All Periods" keeps the original whole-day key.
  const recordKey = useMemo(() => {
    const base = `attendance_${grade}_${section}_${date}`;
    return periodFilter === "All Periods" ? base : `${base}_${periodSlug(periodFilter)}`;
  }, [grade, section, date, periodFilter]);

  // Load existing record for selected date/period
  useEffect(() => {
    smartDb.getOne("TeacherAttendance", recordKey).then((rec: any) => {
      if (rec?.marks) {
        setMarks(rec.marks);
        setRemarks(rec.remarks || {});
      } else {
        const init: Record<string, Status> = {};
        students.forEach(s => { init[s.id] = "P"; });
        setMarks(init);
        setRemarks({});
      }
    }).catch(() => {
      const init: Record<string, Status> = {};
      students.forEach(s => { init[s.id] = "P"; });
      setMarks(init);
      setRemarks({});
    });
  }, [recordKey, students]);

  // Every real saved attendance record for THIS grade/section — the single
  // source for both the calendar's day-by-day status and the real month
  // average (previously the calendar read localStorage directly, which
  // missed records synced from MySQL on another device/session, and "This
  // Month Average" just repeated today's % instead of averaging the month).
  const [allRecords, setAllRecords] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    smartDb.getAll("TeacherAttendance").then((rows: any[]) => {
      if (!alive) return;
      setAllRecords((rows || []).filter((r: any) => canonGrade(r.grade) === canonGrade(grade) && canonSection(r.section) === canonSection(section)));
    }).catch(() => { if (alive) setAllRecords([]); });
    return () => { alive = false; };
  }, [grade, section]);

  const recordsThisMonth = useMemo(() => {
    const prefix = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, "0")}`;
    return allRecords.filter(r => String(r.date || "").startsWith(prefix));
  }, [allRecords, calMonth]);

  const realMonthAvgPct = useMemo(() => {
    if (recordsThisMonth.length === 0) return null;
    const pcts = recordsThisMonth.map(r => {
      const vals = Object.values(r.marks || {}) as string[];
      if (!vals.length) return null;
      const p = vals.filter(v => v === "P").length;
      return (p / vals.length) * 100;
    }).filter((v): v is number => v !== null);
    if (pcts.length === 0) return null;
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
  }, [recordsThisMonth]);

  const summary = useMemo(() => {
    const vals = students.map(s => marks[s.id] || "P");
    const P = vals.filter(v => v === "P").length;
    const A = vals.filter(v => v === "A").length;
    const L = vals.filter(v => v === "L").length;
    const total = students.length || 1;
    return {
      P, A, L, total: students.length,
      pPct: ((P / total) * 100).toFixed(2),
      aPct: ((A / total) * 100).toFixed(2),
      lPct: ((L / total) * 100).toFixed(2),
    };
  }, [marks, students]);

  const monthAvg = useMemo(() => {
    return realMonthAvgPct !== null ? `${realMonthAvgPct.toFixed(2)}%` : "—";
  }, [realMonthAvgPct]);

  const STATUS_LABEL: Record<Status, string> = { P: "Present", A: "Absent", L: "Late" };

  const exportAttendance = () => {
    const rows = [
      ["Student ID", "Admission Number", "Student Name", "Date", "Attendance Status", "Remarks"],
      ...students.map(s => [s.id, s.admNo, s.name, date, STATUS_LABEL[marks[s.id] || "P"], remarks[s.id] || ""]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance_${grade.replace(/\s/g, "_")}_${section}_${date}.xlsx`);
    toast.success("Attendance exported to Excel");
  };

  // Blank upload template pre-filled with THIS class's real roster (name,
  // admission no., ID) so the teacher only has to edit the Attendance Status
  // column and re-upload — matches handleImport's expected column headers
  // exactly (Student ID / Admission Number / Student Name / Attendance
  // Status / Remarks).
  const downloadTemplate = () => {
    if (!students.length) { toast.error("No students in this class to build a template from"); return; }
    const rows = [
      ["Student ID", "Admission Number", "Student Name", "Attendance Status", "Remarks"],
      ...students.map(s => [s.id, s.admNo, s.name, "Present", ""]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Template");
    XLSX.writeFile(wb, `attendance_template_${grade.replace(/\s/g, "_")}_${section}.xlsx`);
    toast.success("Template downloaded with your class roster");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { toast.error("Template is empty"); return; }
        const header = (rows[0] as string[]).map(h => String(h).toLowerCase().trim());
        const idCol    = header.findIndex(h => h.includes("student id"));
        const admCol   = header.findIndex(h => h.includes("admission"));
        const nameCol  = header.findIndex(h => h.includes("name"));
        const statCol  = header.findIndex(h => h.includes("status") || h.includes("attendance"));
        const remCol   = header.findIndex(h => h.includes("remark"));
        if (statCol === -1) { toast.error("Could not find Attendance Status column"); return; }
        const STATUS_MAP: Record<string, Status> = {
          p: "P", present: "P", a: "A", absent: "A",
          l: "L", late: "L", excused: "L",
        };
        const newMarks: Record<string, Status> = { ...marks };
        const newRemarks: Record<string, string> = { ...remarks };
        let matched = 0;
        for (const row of rows.slice(1)) {
          const rawStatus = String(row[statCol] ?? "").toLowerCase().trim();
          const status: Status = STATUS_MAP[rawStatus] || "P";
          const rowId    = idCol   >= 0 ? String(row[idCol]   || "").trim() : "";
          const rowAdm   = admCol  >= 0 ? String(row[admCol]  || "").trim() : "";
          const rowName  = nameCol >= 0 ? String(row[nameCol] || "").toLowerCase().trim() : "";
          const student  = students.find(s =>
            (rowId   && s.id    === rowId) ||
            (rowAdm  && s.admNo === rowAdm) ||
            (rowName && (s.name || "").toLowerCase() === rowName)
          );
          if (student) {
            newMarks[student.id] = status;
            if (remCol >= 0) newRemarks[student.id] = String(row[remCol] || "");
            matched++;
          }
        }
        setMarks(newMarks);
        setRemarks(newRemarks);
        toast.success(`Imported ${matched} of ${students.length} student records`);
      } catch {
        toast.error("Failed to parse file — ensure it's a valid .xlsx or .csv");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        id: recordKey, grade, section, date, marks, remarks,
        period: periodFilter === "All Periods" ? null : periodFilter,
        savedAt: new Date().toISOString(),
      };
      const existing = await smartDb.getOne("TeacherAttendance", recordKey).catch(() => null);
      if (existing) await smartDb.update("TeacherAttendance", recordKey, payload);
      else await smartDb.create("TeacherAttendance", payload, recordKey);

      // Also mirror each student's mark into the real "attendance" entity —
      // the one StudentContext.tsx actually computes Student.attendance %
      // and riskScore-driving status from (used by Students/Behavior/"At
      // Risk" elsewhere). This page previously only wrote to
      // TeacherAttendance, so marks made here never moved those numbers.
      // Same id scheme (`ATT-STU-{studentId}-{date}`) admin's own
      // Attendance.tsx uses, so a re-save on the same date upserts instead
      // of creating duplicates.
      const createdAt = new Date().toISOString();
      const STATUS_NAME: Record<Status, string> = { P: "Present", A: "Absent", L: "Late" };
      await Promise.all(students.map(s => {
        const rec = {
          id: `ATT-STU-${s.id}-${date}`, entityId: s.id, entityType: "student",
          name: s.name, class: className, status: STATUS_NAME[marks[s.id] || "P"],
          date, time: "", createdAt,
        };
        return smartDb.create("attendance", rec, rec.id).catch(() => {});
      }));
      window.dispatchEvent(new Event("attendance-updated"));

      toast.success("Attendance saved successfully");

      // Absentee/late parents get a direct alert (not the whole section —
      // most students are present). The section's real class teacher is
      // also informed that attendance was submitted for the day.
      const flagged = students.filter(s => marks[s.id] === "A" || marks[s.id] === "L");
      if (flagged.length) {
        notifyParentsOfStudents(
          flagged.map(s => ({
            id: s.id, name: s.name,
            message: `${s.name} was marked ${marks[s.id] === "A" ? "Absent" : "Late"} on ${fmtLongDate(date)}.`,
          })),
          {
            entity: "Attendance", type: "attendance_marked",
            title: "Attendance Update",
            sourceId: recordKey, grade, section,
            redirectUrl: "/parent/attendance",
          }
        ).catch(() => {});
      }
      notifyClassTeacherEvent({
        grade, section,
        entity: "Attendance", type: "attendance_submitted",
        title: "Attendance Submitted",
        message: `${activeSubject ? `${activeSubject.subject} a` : "A"}ttendance was submitted for ${className} on ${fmtLongDate(date)}.`,
        sourceId: recordKey,
        redirectUrl: "/teacher/attendance",
      }).catch(() => {});
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() =>
    students.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.admNo || "").includes(q)),
    [students, q]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageStudents = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Calendar build
  const calendar = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return {
      cells,
      label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }, [calMonth]);

  const dayStatus = (day: number): "present" | "absent" | "late" | "holiday" | "none" => {
    const dateStr = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // A real saved record always wins, even on a school's usual weekend —
    // only fall back to the Fri/Sat weekend assumption when nothing was recorded.
    const rec = recordsThisMonth.find(r => r.date === dateStr);
    if (rec) {
      const vals = Object.values(rec.marks || {}) as string[];
      if (vals.length) {
        const P = vals.filter(v => v === "P").length;
        const A = vals.filter(v => v === "A").length;
        if (A > 0 && P === 0) return "absent";
        if (A > 0) return "late";
        return "present";
      }
    }
    const dow = new Date(calMonth.y, calMonth.m, day).getDay();
    if (dow === 5 || dow === 6) return "holiday";
    return "none";
  };

  const selDay = (() => {
    const d = new Date(date + "T00:00:00");
    return d.getFullYear() === calMonth.y && d.getMonth() === calMonth.m ? d.getDate() : -1;
  })();

  const KPIS = [
    { icon: Users,       bg: "bg-purple-50",  ic: "text-purple-500",  value: students.length, label: "Total Students", sub: "View all students →", subClass: "text-purple-600 font-semibold" },
    { icon: CheckCircle2,bg: "bg-emerald-50", ic: "text-emerald-500", value: summary.P,        label: "Present Today",  sub: `${summary.pPct}%`, subClass: "text-emerald-600 font-semibold" },
    { icon: XCircle,     bg: "bg-rose-50",    ic: "text-rose-500",    value: summary.A,        label: "Absent Today",   sub: `${summary.aPct}%`, subClass: "text-rose-600 font-semibold" },
    { icon: Clock,       bg: "bg-amber-50",   ic: "text-amber-500",   value: summary.L,        label: "Late Today",     sub: `${summary.lPct}%`, subClass: "text-amber-600 font-semibold" },
    { icon: BarChart3,   bg: "bg-blue-50",    ic: "text-blue-500",    value: monthAvg,         label: "This Month Average", sub: "Overall Attendance", subClass: "text-slate-400" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
              <p className="text-sm text-slate-400">{className} · {students.length} students</p>
            </div>
          </div>
          <SubjectContextBar
            assignments={mySubjects}
            selected={activeSubject}
            onChange={setActiveSubject}
          />
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
              <p className="text-2xl font-bold text-slate-900 leading-none">{k.value}</p>
              <p className={cn("text-xs mt-1.5", k.subClass)}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Control row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Date</label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
                className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">
              Period {realPeriods.length === 0 && <span className="text-slate-400 font-normal">(none scheduled today)</span>}
            </label>
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
              disabled={realPeriods.length === 0}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none disabled:bg-slate-50 disabled:text-slate-400">
              {periodOptions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImport} />
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download Template
            </button>
            <button onClick={exportAttendance}
              className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 h-9 px-4 rounded-lg border border-purple-200 text-sm font-semibold text-purple-700 hover:bg-purple-50">
              <Upload className="h-4 w-4" /> Import Attendance
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Attendance"}
            </button>
          </div>
        </div>

        {/* Main 2-column */}
        <div className="grid grid-cols-3 gap-5">

          {/* LEFT: marking table */}
          <div className="col-span-2 bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm">Students ({students.length})</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Present</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Absent</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Late</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search student..."
                    className="pl-8 pr-3 h-8 text-xs rounded-lg border border-slate-200 bg-slate-50 w-40 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 w-8">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Student Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Admission No.</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Attendance Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Remarks (Optional)</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageStudents.map((s, i) => {
                    const status = marks[s.id] || "P";
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-5 py-3 text-sm text-slate-400">{(page - 1) * PER_PAGE + i + 1}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar name={s.name} />
                            <span className="font-semibold text-slate-900 text-sm">{s.name}</span>
                            {transportBoarding[s.id] && (
                              <span
                                title={`Transport: ${transportBoarding[s.id].status} at ${new Date(transportBoarding[s.id].markedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} — reference only, not an attendance mark`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
                                <Bus className="h-2.5 w-2.5" /> {transportBoarding[s.id].status === "boarded" ? "On bus" : "Dropped"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-500">{s.admNo}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {([
                              { k: "P", label: "Present", on: "bg-emerald-500 text-white border-emerald-500", off: "bg-white text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600", icon: CheckCircle2 },
                              { k: "A", label: "Absent",  on: "bg-rose-500 text-white border-rose-500",       off: "bg-white text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-600", icon: XCircle },
                              { k: "L", label: "Late",    on: "bg-amber-500 text-white border-amber-500",     off: "bg-white text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-600", icon: Clock },
                            ] as const).map(b => (
                              <button key={b.k}
                                onClick={() => setMarks(p => ({ ...p, [s.id]: b.k as Status }))}
                                className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                  status === b.k ? b.on : b.off)}>
                                <b.icon className="h-3 w-3" /> {b.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <input
                            value={remarks[s.id] || ""}
                            onChange={e => setRemarks(p => ({ ...p, [s.id]: e.target.value }))}
                            placeholder="-"
                            className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => {
                              notifyParentsOfStudents(
                                [{ id: s.id, name: s.name, message: `Your class teacher sent a note about ${s.name}'s attendance on ${fmtLongDate(date)}.` }],
                                {
                                  entity: "Attendance", type: "attendance_note",
                                  title: "Attendance Note",
                                  sourceId: `${recordKey}-${s.id}`, grade, section,
                                  redirectUrl: "/parent/attendance",
                                }
                              ).then(() => toast.success(`Note sent to ${s.name}'s parent`))
                                .catch(() => toast.error("Failed to send note"));
                            }}
                            title="Notify parent"
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} students
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                      page === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT sidebar */}
          <div className="space-y-4">

            {/* Calendar */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Attendance Calendar</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCalMonth(c => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m }; })}
                    className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setCalMonth(c => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m }; })}
                    className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-center text-xs font-semibold text-slate-700 mb-2">{calendar.label}</p>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendar.cells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const st = dayStatus(day);
                  const isSel = day === selDay;
                  const color =
                    st === "present" ? "text-emerald-600" :
                    st === "absent"  ? "text-rose-600" :
                    st === "late"    ? "text-amber-600" :
                    st === "holiday" ? "text-slate-300" : "text-slate-600";
                  return (
                    <button key={i}
                      onClick={() => setDate(new Date(calMonth.y, calMonth.m, day).toISOString().slice(0, 10))}
                      className={cn("aspect-square rounded-lg text-[11px] font-semibold flex items-center justify-center transition-colors",
                        isSel ? "bg-purple-600 text-white" : cn("hover:bg-slate-100", color))}>
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-2.5 mt-3 pt-3 border-t border-slate-50 text-[9px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Present</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Absent</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Late</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Holiday</span>
              </div>
            </div>

            {/* Today's Summary */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Today's Summary</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Present", value: `${summary.P} (${summary.pPct}%)`, color: "text-emerald-600" },
                  { label: "Absent",  value: `${summary.A} (${summary.aPct}%)`, color: "text-rose-600" },
                  { label: "Late",    value: `${summary.L} (${summary.lPct}%)`, color: "text-amber-600" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={cn("font-semibold", r.color)}>{r.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-2.5 border-t border-slate-100">
                  <span className="text-slate-700 font-semibold">Total Students</span>
                  <span className="font-bold text-slate-900">{summary.total}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <button onClick={exportAttendance}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-100 flex-shrink-0">
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                </div>
                <span className="text-xs font-semibold text-slate-600 text-left leading-tight">Export Attendance Report (Excel)</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
