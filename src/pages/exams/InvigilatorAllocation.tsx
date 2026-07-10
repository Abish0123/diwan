import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useExams } from "@/lib/examStore";
import type { ExamRecord } from "@/lib/examStore";
import {
  getSeating, saveSeating, type SeatingConfig,
  examDateWindows, findInvigilatorConflicts, type InvigilatorConflict,
} from "@/lib/seatingStore";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { UserCheck, Save, MapPin, Hash, Users, Search, Plus, X, AlertTriangle } from "lucide-react";

interface InvigilatorCandidate { name: string; role: string }

// Real, currently-employed staff eligible to be assigned invigilator duty —
// class teachers (users with an assigned grade/section), subject teachers
// (from Subject Assignments), and the general Staff directory. No fabricated
// names: only people who actually exist in these tables can be picked.
function useInvigilatorPool(): InvigilatorCandidate[] {
  const [pool, setPool] = useState<InvigilatorCandidate[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/data/staff").then(r => r.json()).catch(() => []),
      fetch("/api/data/subject_assignments").then(r => r.json()).catch(() => []),
      fetch("/api/data/users").then(r => r.json()).catch(() => []),
    ]).then(([staffRows, assignRows, userRows]) => {
      const byName = new Map<string, string>();
      (Array.isArray(staffRows) ? staffRows : []).forEach((s: any) => {
        const name = (s.name || [s.firstName, s.lastName].filter(Boolean).join(" ")).trim();
        if (!name || (s.status && s.status !== "Active")) return;
        byName.set(name, s.role || "Staff");
      });
      (Array.isArray(assignRows) ? assignRows : []).forEach((a: any) => {
        const name = (a.teacherName || "").trim();
        if (name && !byName.has(name)) byName.set(name, "Subject Teacher");
      });
      (Array.isArray(userRows) ? userRows : []).forEach((u: any) => {
        const name = (u.name || u.displayName || "").trim();
        if (name && u.assignedGrade && u.assignedSection && !byName.has(name)) byName.set(name, "Class Teacher");
      });
      setPool(Array.from(byName.entries()).map(([name, role]) => ({ name, role })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setPool([]));
  }, []);
  return pool;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter((p) => p.length > 1)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

// Real Invigilator Duty UI, extracted for embedding as a step inside the
// consolidated Exam Setup wizard — see RoomAllocation.tsx for the same pattern.
export function InvigilatorAllocationContent({ examId, onExamIdChange }: { examId: string; onExamIdChange: (id: string) => void }) {
  const exams = useExams();
  const pool = useInvigilatorPool();
  const selectedExamId = examId;
  const setSelectedExamId = onExamIdChange;
  const [cfg, setCfg] = useState<SeatingConfig | null>(null);
  const [invigilatorMap, setInvigilatorMap] = useState<Record<string, string>>({});
  const [poolSearch, setPoolSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [activeRoomForPool, setActiveRoomForPool] = useState<string | null>(null);

  // Cross-exam data for double-booking detection — every saved seating config
  // (all rooms' invigilator assignments) across every exam, refreshed whenever
  // the exam selection changes or a save happens.
  const [allSeatingConfigs, setAllSeatingConfigs] = useState<SeatingConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("ExamSeating", "").then((rows) => {
      if (!cancelled) setAllSeatingConfigs((rows as unknown as SeatingConfig[]) || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedExamId, saved]);

  const examsById = useMemo(() => new Map<string, ExamRecord>(exams.map((e) => [e.id, e])), [exams]);

  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;
  const selectedExamWindows = useMemo(
    () => (selectedExam ? examDateWindows(selectedExam) : []),
    [selectedExam]
  );

  // Live conflict lookup for the on-screen editor: for each room, does its
  // CURRENTLY SELECTED (possibly unsaved) invigilator already have an
  // overlapping assignment elsewhere? Recomputed from the in-memory
  // invigilatorMap so the warning icon updates as the admin picks names,
  // before they even hit Save.
  const roomConflicts = useMemo(() => {
    const map = new Map<string, InvigilatorConflict[]>();
    if (!cfg || !selectedExamId) return map;
    for (const room of cfg.rooms) {
      const inv = invigilatorMap[room.id] || "";
      if (!inv.trim()) continue;
      const conflicts = findInvigilatorConflicts(
        inv, selectedExamWindows, selectedExamId, room.id, allSeatingConfigs, examsById
      );
      if (conflicts.length > 0) map.set(room.id, conflicts);
    }
    return map;
  }, [cfg, invigilatorMap, selectedExamId, selectedExamWindows, allSeatingConfigs, examsById]);

  useEffect(() => {
    if (!selectedExamId) {
      setCfg(null);
      setInvigilatorMap({});
      setSaved(false);
      return;
    }
    const loaded = getSeating(selectedExamId);
    setCfg(loaded);
    const map: Record<string, string> = {};
    loaded.rooms.forEach((r) => {
      map[r.id] = r.invigilator || "";
    });
    setInvigilatorMap(map);
    setSaved(false);
    setActiveRoomForPool(null);
  }, [selectedExamId]);

  const hasSeating = cfg !== null && cfg.rooms.length > 0;

  const rollRanges = (() => {
    if (!cfg || cfg.assignments.length === 0) return new Map<string, { min: number; max: number; count: number }>();
    const map = new Map<string, { min: number; max: number; count: number }>();
    cfg.assignments.forEach((a) => {
      const roll = parseInt(String(a.rollNo).replace(/\D/g, ""), 10);
      const num = Number.isFinite(roll) ? roll : 0;
      const cur = map.get(a.roomNo) || { min: Infinity, max: -Infinity, count: 0 };
      map.set(a.roomNo, { min: Math.min(cur.min, num), max: Math.max(cur.max, num), count: cur.count + 1 });
    });
    return map;
  })();

  const studentCountByRoom = (() => {
    if (!cfg) return new Map<string, number>();
    const map = new Map<string, number>();
    cfg.assignments.forEach((a) => {
      map.set(a.roomNo, (map.get(a.roomNo) || 0) + 1);
    });
    return map;
  })();

  function handleSave() {
    if (!cfg) return;

    // Double-booking guard: warn (don't silently save) if any room's assigned
    // invigilator already has an overlapping-time assignment elsewhere.
    if (roomConflicts.size > 0) {
      const lines = Array.from(roomConflicts.entries()).flatMap(([roomId, conflicts]) => {
        const room = cfg.rooms.find((r) => r.id === roomId);
        const inv = invigilatorMap[roomId] || "";
        return conflicts.map(
          (c) =>
            `${inv} — ${room?.roomNo || "this room"} clashes with ${c.roomNo} (${c.examName}) on ${c.date} ${c.start}-${c.end}`
        );
      });
      const proceed = window.confirm(
        `Invigilator double-booking detected:\n\n${lines.join("\n")}\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    const updatedRooms = cfg.rooms.map((r) => ({
      ...r,
      invigilator: invigilatorMap[r.id] ?? r.invigilator,
    }));
    const updatedCfg: SeatingConfig = { ...cfg, rooms: updatedRooms };
    saveSeating(updatedCfg);
    setCfg(updatedCfg);
    setSaved(true);
    toast.success("Duty roster saved successfully.");
  }

  function assignFromPool(invName: string) {
    if (!activeRoomForPool || !cfg) return;
    setInvigilatorMap((prev) => ({ ...prev, [activeRoomForPool]: invName }));
    setSaved(false);
  }

  const filteredPool = pool.filter((c) =>
    c.name.toLowerCase().includes(poolSearch.toLowerCase())
  );

  const allAssigned =
    hasSeating && cfg!.rooms.every((r) => (invigilatorMap[r.id] || "").trim() !== "");

  return (
      <div className="min-h-screen bg-slate-50 print:bg-white">
        {/* Header */}
        <div className="print:hidden bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Invigilator Duty Assignment</h1>
              <p className="text-sm text-slate-400">Assign invigilators to exam rooms and generate duty rosters</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Exam Selector */}
          <div className="print:hidden bg-white rounded-2xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Examination</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">-- Choose an exam --</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.grade}
                </option>
              ))}
            </select>
            {selectedExam && (
              <p className="mt-2 text-xs text-slate-500">
                {selectedExam.grade} &bull; {selectedExam.section} &bull; {selectedExam.startDate} to {selectedExam.endDate}
              </p>
            )}
          </div>

          {selectedExamId && !hasSeating && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium mb-1">No seating plan found for this exam.</p>
              <p className="text-sm text-slate-400 mb-4">Create a room allocation first before assigning invigilators.</p>
              <a
                href="/exams/seating"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                Go to Room Allocation
              </a>
            </div>
          )}

          {hasSeating && cfg && (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Invigilator Pool */}
              <div className="print:hidden xl:col-span-1 bg-white rounded-2xl border border-slate-200 p-4 h-fit">
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-500" />
                  Invigilator Pool
                </h2>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                {activeRoomForPool && (
                  <p className="text-xs text-purple-600 font-medium mb-2 bg-violet-50 rounded-lg px-2.5 py-1.5">
                    Assigning to:{" "}
                    <span className="font-bold">
                      {cfg.rooms.find((r) => r.id === activeRoomForPool)?.roomNo}
                    </span>
                    <button
                      onClick={() => setActiveRoomForPool(null)}
                      className="ml-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3 inline" />
                    </button>
                  </p>
                )}
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {filteredPool.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => assignFromPool(c.name)}
                      disabled={!activeRoomForPool}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs transition-all",
                        activeRoomForPool
                          ? "hover:bg-violet-50 hover:text-violet-700 cursor-pointer text-slate-700"
                          : "text-slate-500 cursor-default opacity-60"
                      )}
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold">
                        {getInitials(c.name)}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="block truncate">{c.name}</span>
                        <span className="block text-[10px] text-slate-400 truncate">{c.role}</span>
                      </span>
                    </button>
                  ))}
                  {filteredPool.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">
                      {pool.length === 0 ? "No staff records found." : "No results"}
                    </p>
                  )}
                </div>
                {!activeRoomForPool && (
                  <p className="text-[11px] text-slate-400 mt-3 text-center">
                    Click "Assign" on a room to activate pool selection
                  </p>
                )}
              </div>

              {/* Rooms Table — the live editor (dropdown selects) is for on-screen
                  assignment only; it must never appear in print output. The
                  Duty Summary below is the actual printable document. */}
              <div className="xl:col-span-3 space-y-4">
                <div className="print:hidden bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-violet-500" />
                      Room Assignments
                    </h2>
                    <span className="text-xs text-slate-400">{cfg.rooms.length} rooms</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room No</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Capacity</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Students</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invigilator</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide print:hidden">Actions</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cfg.rooms.map((room) => {
                          const count = studentCountByRoom.get(room.roomNo) || 0;
                          const inv = invigilatorMap[room.id] || "";
                          const isAssigned = inv.trim() !== "";
                          const isActive = activeRoomForPool === room.id;
                          const conflicts = roomConflicts.get(room.id);
                          return (
                            <tr
                              key={room.id}
                              className={cn(
                                "transition-colors",
                                isActive ? "bg-violet-50" : "hover:bg-slate-50"
                              )}
                            >
                              <td className="px-4 py-3 font-medium text-slate-800">{room.roomNo}</td>
                              <td className="px-4 py-3 text-slate-600">{room.capacity}</td>
                              <td className="px-4 py-3 text-slate-600">{count}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={inv}
                                    onChange={(e) => {
                                      setInvigilatorMap((prev) => ({ ...prev, [room.id]: e.target.value }));
                                      setSaved(false);
                                    }}
                                    className={cn(
                                      "w-full min-w-[200px] px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white",
                                      conflicts ? "border-amber-300 focus:ring-amber-400" : "border-slate-200 focus:ring-violet-400"
                                    )}
                                  >
                                    <option value="">— Select staff —</option>
                                    {/* Keep a stale/legacy value visible (as a disabled option) rather than silently
                                        wiping it, so a bad prior assignment is obvious instead of hidden. */}
                                    {inv && !pool.some((c) => c.name === inv) && (
                                      <option value={inv} disabled>{inv} (not in staff directory)</option>
                                    )}
                                    {pool.map((c) => (
                                      <option key={c.name} value={c.name}>{c.name} — {c.role}</option>
                                    ))}
                                  </select>
                                  {conflicts && (
                                    <span
                                      title={conflicts
                                        .map((c) => `Double-booked in ${c.roomNo} (${c.examName}) on ${c.date} ${c.start}-${c.end}`)
                                        .join("\n")}
                                      className="flex-shrink-0 text-amber-500"
                                    >
                                      <AlertTriangle className="w-4 h-4" />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                <button
                                  onClick={() =>
                                    setActiveRoomForPool(isActive ? null : room.id)
                                  }
                                  className={cn(
                                    "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors",
                                    isActive
                                      ? "border-violet-400 bg-purple-600 text-white"
                                      : "border-slate-200 text-purple-600 hover:bg-violet-50"
                                  )}
                                >
                                  <Plus className="w-3 h-3" />
                                  Assign
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                    isAssigned
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-500 border border-slate-200"
                                  )}
                                >
                                  {isAssigned ? "Assigned" : "Unassigned"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="print:hidden flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save Duty Roster
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={!saved}
                    title={!saved ? "Save the duty roster first — the printable sheet is generated from the saved roster" : undefined}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    Print Duty Sheet
                  </button>
                  {!allAssigned && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      Some rooms have no invigilator assigned
                    </span>
                  )}
                </div>

                {/* Duty Summary (shown after save) */}
                {saved && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {/* Printable header visible always on print */}
                    <div className="px-6 py-5 border-b border-slate-100">
                      <div className="text-center mb-1">
                        <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Duty Roster</p>
                        <h3 className="text-lg font-bold text-slate-900 mt-0.5">{selectedExam?.name}</h3>
                        <p className="text-sm text-slate-500">
                          {selectedExam?.grade} &bull; {selectedExam?.startDate}
                          {selectedExam?.endDate && selectedExam.endDate !== selectedExam.startDate
                            ? ` – ${selectedExam.endDate}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invigilator</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Roll Range</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Students</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cfg.rooms.map((room) => {
                            const inv = invigilatorMap[room.id] || "—";
                            const range = rollRanges.get(room.roomNo);
                            const rollRange =
                              range && range.min !== Infinity
                                ? `${range.min} – ${range.max}`
                                : "—";
                            const count = range?.count ?? studentCountByRoom.get(room.roomNo) ?? 0;
                            return (
                              <tr key={room.id} className="hover:bg-slate-50 print:break-inside-avoid">
                                <td className="px-5 py-3 font-medium text-slate-800">{room.roomNo}</td>
                                <td className="px-5 py-3 text-slate-700">{inv}</td>
                                <td className="px-5 py-3 text-slate-600">{rollRange}</td>
                                <td className="px-5 py-3 text-slate-600">{count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Signature lines */}
                    <div className="px-6 py-6 border-t border-slate-100 grid grid-cols-3 gap-6 mt-4 print:break-inside-avoid">
                      {["Prepared By", "Checked By", "Approved By"].map((label) => (
                        <div key={label} className="text-center">
                          <div className="border-b border-slate-300 h-10 mb-2" />
                          <p className="text-xs text-slate-500 font-medium">{label}</p>
                          <p className="text-xs text-slate-400">Signature &amp; Date</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}

// Thin standalone wrapper — kept so the old /exams/invigilators route (and
// anyone importing this file directly) still works exactly as before.
export default function InvigilatorAllocation() {
  const [examId, setExamId] = useState("");
  return (
    <DashboardLayout>
      <InvigilatorAllocationContent examId={examId} onExamIdChange={setExamId} />
    </DashboardLayout>
  );
}
