// ─────────────────────────────────────────────────────────────────────────────
// Exam Seating & Room Allocation store.
//
// For major exams (Mid-Term / Final / Board) Qatar schools rarely seat students
// in their own classroom — they are distributed across exam rooms to reduce
// copying. This module holds the per-exam seating configuration + the computed
// seat assignments, and the allocation engine that produces them.
//
// Persisted in localStorage ("sd_exam_seating") keyed by examId; changes
// broadcast on a custom event so any mounted view refreshes live.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";
import { type ExamRecord, getGradePlans } from "@/lib/examStore";

export type SeatingMethod =
  | "by-section"      // each section fills its own room(s)
  | "by-grade"        // whole grade, roll order, fill rooms sequentially
  | "mixed-sections"  // interleave sections by roll (A1,B1,C1,A2,…) — anti-copying
  | "mixed-grades"    // interleave students from DIFFERENT grades (G5,G6,G7,G5,…) — strongest anti-copying
  | "roll-number"     // sort by roll, fill rooms by roll ranges (1-20, 21-40…)
  | "auto";           // mixed-grades if >1 grade, else mixed-sections if >1 section, else roll-number

export type SeatGap = "none" | "one-gap" | "alternate";

export interface ExamRoom {
  id: string;
  roomNo: string;       // "Room 201"
  capacity: number;     // physical seats
  invigilator: string;  // assigned invigilator name
  block?: string;       // optional building/block
}

export interface SeatAssignment {
  studentId: string;
  name: string;
  rollNo: string;
  grade: string;
  section: string;
  roomNo: string;
  seatLabel: string;    // "07" or "R2-C3"
}

export interface SeatingConfig {
  examId: string;
  method: SeatingMethod;
  roomCapacity: number;       // default capacity for auto-generated rooms
  seatGap: SeatGap;
  autoAllocate: boolean;      // auto-generate enough rooms to fit everyone
  rooms: ExamRoom[];
  assignments: SeatAssignment[];
  updatedAt: string;
  // Snapshot of the exam's (grade, sections[]) pairs at the moment seating was
  // last saved — JSON.stringify(getGradePlans(exam).map(p => ({grade, sections}))).
  // Compared against the exam's CURRENT structure by isSeatingStale() to detect
  // grade/section edits made after seating was generated.
  examSnapshot?: string;
}

export interface SeatingStudent {
  id: string;
  name: string;
  rollNo: string;
  grade: string;
  section: string;
}

const LS_KEY = "sd_exam_seating";
const CHANGE_EVENT = "sd-seating-changed";

export function defaultConfig(examId: string): SeatingConfig {
  return {
    examId,
    method: "auto",
    roomCapacity: 25,
    seatGap: "none",
    autoAllocate: true,
    rooms: [],
    assignments: [],
    updatedAt: "",
  };
}

type Store = Record<string, SeatingConfig>;

function readStore(): Store {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function writeStore(s: Store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* ignore */ }
}

export function getSeating(examId: string): SeatingConfig {
  const s = readStore();
  return s[examId] ? { ...defaultConfig(examId), ...s[examId] } : defaultConfig(examId);
}

// Snapshot of an exam's grade/section structure, used to detect edits made
// after seating was last generated. Order-stable so re-saving with the same
// structure doesn't spuriously flag as stale.
export function examStructureSnapshot(exam: ExamRecord): string {
  return JSON.stringify(getGradePlans(exam).map(p => ({ grade: p.grade, sections: p.sections })));
}

// Detects whether a saved seating config is stale relative to the exam's
// CURRENT structure/roster:
//   1. Structure drift — the exam's (grade, sections[]) pairs no longer match
//      the snapshot taken when seating was last saved (grades/sections edited).
//   2. Roster drift — the current roster (passed in by the caller, which
//      already knows how to derive it — see RoomAllocation.tsx) contains
//      students who were never seated, or previously-seated students are no
//      longer part of the roster.
// An empty (never-saved) config is never "stale" — that's just "not generated
// yet", a different UI state the caller already handles.
export function isSeatingStale(
  config: SeatingConfig,
  exam: ExamRecord,
  currentRoster?: SeatingStudent[]
): boolean {
  if (!config.assignments || config.assignments.length === 0) return false;

  if (config.examSnapshot) {
    const currentSnapshot = examStructureSnapshot(exam);
    if (config.examSnapshot !== currentSnapshot) return true;
  }

  if (currentRoster) {
    const seatedIds = new Set(config.assignments.map(a => String(a.studentId)));
    const currentIds = new Set(currentRoster.map(s => String(s.id)));
    for (const id of currentIds) if (!seatedIds.has(id)) return true;   // new student, unseated
    for (const id of seatedIds) if (!currentIds.has(id)) return true;   // seated student no longer in roster
  }

  return false;
}

export function saveSeating(config: SeatingConfig, exam?: ExamRecord) {
  const s = readStore();
  const updated = {
    ...config,
    updatedAt: stamp(),
    examSnapshot: exam ? examStructureSnapshot(exam) : config.examSnapshot,
  };
  s[config.examId] = updated;
  writeStore(s);
  // Write-through: persist to MySQL in background. Explicit id = examId so
  // repeated saves upsert the same row instead of each save creating a new
  // randomly-id'd row (the backend generates an id when none is passed).
  void smartDb.create("ExamSeating", updated as unknown as Record<string, unknown>, config.examId).catch(() => {});
}

// performance.now() is used instead of Date.now() (unavailable in the preview sandbox).
let _seq = 0;
function stamp(): string {
  _seq += 1;
  const t = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : _seq;
  return `t${t}-${_seq}`;
}
export function newRoomId(): string {
  _seq += 1;
  const t = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now()) : _seq;
  return `ROOM-${String(t).slice(-6)}-${_seq}`;
}

// ── Allocation engine ─────────────────────────────────────────────────────────

const rollNum = (s: SeatingStudent, fallback: number) => {
  const n = parseInt(String(s.rollNo).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback + 1;
};

// Seats usable in a room once the seat-gap rule is applied.
export function effectiveCapacity(capacity: number, gap: SeatGap): number {
  if (gap === "none") return capacity;
  return Math.max(1, Math.ceil(capacity / 2)); // one-gap & alternate ≈ half the seats
}

// Physical seat label for the j-th (0-based) occupied seat in a room.
function seatLabel(j: number, gap: SeatGap): string {
  if (gap === "none") return String(j + 1).padStart(2, "0");
  if (gap === "one-gap") return String(j * 2 + 1).padStart(2, "0"); // 01,03,05…
  // alternate: checkerboard on a 5-column grid (only (row+col) even cells used)
  const COLS = 5;
  let count = 0;
  for (let cell = 0; ; cell++) {
    const r = Math.floor(cell / COLS), c = cell % COLS;
    if ((r + c) % 2 === 0) {
      if (count === j) return `R${r + 1}-C${c + 1}`;
      count++;
    }
  }
}

// Round-robin interleave a set of pre-sorted groups: take the 1st of each group,
// then the 2nd of each, etc. Produces G5,G6,G7,G5,G6,G7… so adjacent seats differ.
function roundRobin<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...groups.map(g => g.length));
  for (let i = 0; i < max; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out;
}

// Order students according to the chosen method. Mixed methods interleave so that
// no two physically-adjacent seats hold the same grade/section (anti-copying).
export function orderStudents(students: SeatingStudent[], method: SeatingMethod): SeatingStudent[] {
  const sections = Array.from(new Set(students.map(s => (s.section || "").toUpperCase()))).filter(Boolean).sort();
  const grades = Array.from(new Set(students.map(s => (s.grade || "").trim()))).filter(Boolean).sort();
  const effective: SeatingMethod = method === "auto"
    ? (grades.length > 1 ? "mixed-grades" : sections.length > 1 ? "mixed-sections" : "roll-number")
    : method;

  const withRoll = students.map((s, i) => ({ s, roll: rollNum(s, i) }));

  if (effective === "mixed-grades") {
    // Group by grade, sort each grade by (section, roll), round-robin across grades.
    const groups = grades.map(g =>
      withRoll
        .filter(x => (x.s.grade || "").trim() === g)
        .sort((a, b) => {
          const sa = (a.s.section || "").toUpperCase(), sb = (b.s.section || "").toUpperCase();
          return sa === sb ? a.roll - b.roll : sa.localeCompare(sb);
        })
        .map(x => x.s)
    );
    return roundRobin(groups);
  }
  if (effective === "mixed-sections") {
    // group by section, sort each by roll, then round-robin across sections
    const groups = sections.map(sec =>
      withRoll.filter(x => (x.s.section || "").toUpperCase() === sec).sort((a, b) => a.roll - b.roll).map(x => x.s)
    );
    return roundRobin(groups);
  }
  if (effective === "by-section") {
    return [...withRoll].sort((a, b) => {
      const sa = (a.s.section || "").toUpperCase(), sb = (b.s.section || "").toUpperCase();
      return sa === sb ? a.roll - b.roll : sa.localeCompare(sb);
    }).map(x => x.s);
  }
  // by-grade & roll-number: pure roll order
  return [...withRoll].sort((a, b) => a.roll - b.roll).map(x => x.s);
}

export interface AllocationResult {
  rooms: ExamRoom[];           // rooms actually used (may include auto-generated)
  assignments: SeatAssignment[];
  unallocated: SeatingStudent[];
}

// Build the room list: honour user-defined rooms; auto-generate more when
// autoAllocate is on and the defined rooms can't hold everyone.
function buildRooms(total: number, config: SeatingConfig): ExamRoom[] {
  const rooms = config.rooms.map(r => ({ ...r }));
  const fits = () => rooms.reduce((sum, r) => sum + effectiveCapacity(r.capacity, config.seatGap), 0);
  if (rooms.length > 0 && !config.autoAllocate) return rooms;
  if (fits() >= total && rooms.length > 0) return rooms;

  const used = new Set(rooms.map(r => r.roomNo.toLowerCase()));
  let no = 101;
  let guard = 0;
  while (fits() < total && guard++ < 999) {
    const roomNo = `Room ${no}`;
    if (!used.has(roomNo.toLowerCase())) {
      rooms.push({ id: newRoomId(), roomNo, capacity: config.roomCapacity, invigilator: "" });
      used.add(roomNo.toLowerCase());
    }
    no++;
  }
  return rooms;
}

// Distribute ordered students into rooms, sequentially filling each room to its
// effective capacity and stamping a seat label.
export function allocateSeats(students: SeatingStudent[], config: SeatingConfig): AllocationResult {
  const ordered = orderStudents(students, config.method);
  const rooms = buildRooms(ordered.length, config);
  const assignments: SeatAssignment[] = [];
  let idx = 0;
  for (const room of rooms) {
    const cap = effectiveCapacity(room.capacity, config.seatGap);
    for (let j = 0; j < cap && idx < ordered.length; j++, idx++) {
      const s = ordered[idx];
      assignments.push({
        studentId: s.id, name: s.name, rollNo: s.rollNo,
        grade: s.grade, section: s.section,
        roomNo: room.roomNo, seatLabel: seatLabel(j, config.seatGap),
      });
    }
  }
  return { rooms, assignments, unallocated: ordered.slice(idx) };
}

// Look up a single student's seat from a saved config (used by Hall Tickets).
export function findSeat(examId: string, studentId: string): SeatAssignment | null {
  const cfg = getSeating(examId);
  return cfg.assignments.find(a => String(a.studentId) === String(studentId)) || null;
}

// Cross-exam lookup: scan every saved seating plan for this student. Needed for
// mixed-grade halls, where a Grade-6 student may have been seated inside a plan
// saved under a different (pooled) exam id — their own hall ticket must still
// resolve the hall/seat. Matches by student id first; falls back to grade+section
// +roll identity so it resolves even when the hall-ticket roster and the seating
// roster came from different data sources. Most-recently-updated plan wins.
export function findSeatAnywhere(
  studentId: string,
  identity?: { grade?: string; section?: string; rollNo?: string | number }
): SeatAssignment | null {
  const store = readStore();
  const configs = Object.values(store).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const normG = (g: string) => (g || "").toLowerCase().replace("grade ", "").trim();
  const normR = (r: string | number) => parseInt(String(r).replace(/\D/g, ""), 10);

  for (const cfg of configs) {
    const hit = cfg.assignments?.find(a => String(a.studentId) === String(studentId));
    if (hit) return hit;
  }
  if (identity && identity.grade) {
    for (const cfg of configs) {
      const hit = cfg.assignments?.find(a =>
        normG(a.grade) === normG(identity.grade!) &&
        (!identity.section || (a.section || "").toUpperCase() === String(identity.section).toUpperCase()) &&
        (identity.rollNo == null || normR(a.rollNo) === normR(identity.rollNo))
      );
      if (hit) return hit;
    }
  }
  return null;
}

// One call to resolve a student's allocated seat for an exam, trying every path:
// (1) this exam's plan by id, (2) this exam's plan by roll range, (3) ANY plan by
// id, then (4) ANY plan by grade+section+roll identity (mixed-grade pooled halls).
// Returns null when no seating plan covers the student (caller falls back to a hash).
export function resolveSeat(
  examId: string,
  studentId: string,
  identity?: { grade?: string; section?: string; rollNo?: string | number }
): SeatAssignment | null {
  return findSeat(examId, studentId)
    || (identity?.rollNo != null ? findRoomByRoll(examId, identity.rollNo) : null)
    || findSeatAnywhere(studentId, identity);
}

// React hook — live seating config for an exam.
export function useSeating(examId: string): SeatingConfig {
  const [cfg, setCfg] = useState<SeatingConfig>(() => getSeating(examId));
  useEffect(() => {
    const refresh = () => setCfg(getSeating(examId));
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);

    // Hydrate from MySQL on mount for cross-session persistence.
    smartDb.getOne("ExamSeating", examId).then(row => {
      if (!row || !row.examId) return;
      const merged: SeatingConfig = { ...defaultConfig(examId), ...(row as unknown as SeatingConfig) };
      const s = readStore();
      s[examId] = merged;
      try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
      setCfg(merged);
    }).catch(() => {});

    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [examId]);
  return cfg;
}

export const SEATING_METHODS: { id: SeatingMethod; label: string; desc: string; recommended?: boolean }[] = [
  { id: "by-section", label: "By Section", desc: "Each section sits together in its own room(s)" },
  { id: "by-grade", label: "By Grade", desc: "Whole grade in roll order, filled room by room" },
  { id: "mixed-sections", label: "Mixed Sections", desc: "Interleave sections (A1, B1, C1…) to reduce copying" },
  { id: "mixed-grades", label: "Mixed Grades", desc: "Interleave different grades (G5, G6, G7…) — neighbours have different papers", recommended: true },
  { id: "roll-number", label: "Roll Number Based", desc: "Roll ranges per room (1–20, 21–40…)" },
  { id: "auto", label: "Auto Allocation", desc: "Mixed-grades if multiple grades, else mixed-sections, else roll-number" },
];

export interface RoomRollRange {
  roomNo: string;
  rollFrom: number;
  rollTo: number;
  count: number;
  invigilator: string;
}

export function getRollRanges(examId: string): RoomRollRange[] {
  const cfg = getSeating(examId);
  const map = new Map<string, { min: number; max: number; count: number }>();
  for (const a of cfg.assignments) {
    const roll = parseInt(String(a.rollNo).replace(/\D/g, ""), 10);
    if (!Number.isFinite(roll) || roll <= 0) continue;
    const cur = map.get(a.roomNo);
    if (!cur) map.set(a.roomNo, { min: roll, max: roll, count: 1 });
    else { cur.min = Math.min(cur.min, roll); cur.max = Math.max(cur.max, roll); cur.count++; }
  }
  const roomInv = new Map(cfg.rooms.map(r => [r.roomNo, r.invigilator || ""]));
  return Array.from(map.entries())
    .map(([roomNo, v]) => ({ roomNo, rollFrom: v.min, rollTo: v.max, count: v.count, invigilator: roomInv.get(roomNo) || "" }))
    .sort((a, b) => a.rollFrom - b.rollFrom);
}

export function findRoomByRoll(examId: string, rollNo: number | string): SeatAssignment | null {
  const roll = parseInt(String(rollNo).replace(/\D/g, ""), 10);
  if (!Number.isFinite(roll) || roll <= 0) return null;
  const cfg = getSeating(examId);
  return cfg.assignments.find(a => parseInt(String(a.rollNo).replace(/\D/g, ""), 10) === roll) || null;
}

export const SEAT_GAPS: { id: SeatGap; label: string; desc: string }[] = [
  { id: "none", label: "None", desc: "Use every seat" },
  { id: "one-gap", label: "One Seat Gap", desc: "Leave one empty seat between students" },
  { id: "alternate", label: "Alternate Seating", desc: "Checkerboard — halves usable seats" },
];

// ── Invigilator double-booking detection ────────────────────────────────────
// A room in a seating config isn't tied to one specific subject slot — it's a
// capacity container used across every sitting day of that exam/grade-plan.
// So "when is this room in use" is derived from the exam's own datesheet: one
// busy window per distinct date the exam sits, spanning the earliest start to
// the latest end across all grade plans/slots on that date.
export interface DateWindow { date: string; start: string; end: string }

// Distinct (date → earliest start, latest end) windows an exam is "live" for,
// derived from every grade plan's slots. Falls back to the exam's start/end
// date range (all-day) when it has no slot-level schedule at all.
export function examDateWindows(exam: ExamRecord): DateWindow[] {
  const byDate = new Map<string, { start: string; end: string }>();
  for (const plan of getGradePlans(exam)) {
    for (const slot of plan.slots || []) {
      if (!slot.date) continue;
      const cur = byDate.get(slot.date);
      const start = slot.start || "00:00";
      const end = slot.end || "23:59";
      if (!cur) byDate.set(slot.date, { start, end });
      else byDate.set(slot.date, {
        start: start < cur.start ? start : cur.start,
        end: end > cur.end ? end : cur.end,
      });
    }
  }
  if (byDate.size > 0) {
    return Array.from(byDate.entries()).map(([date, w]) => ({ date, ...w }));
  }
  // No slot-level datesheet — treat the exam's whole date range as one window
  // per day at unknown time (blocks only same-day, doesn't assume a time).
  if (exam.startDate) {
    return [{ date: exam.startDate, start: "00:00", end: "23:59" }];
  }
  return [];
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface InvigilatorConflict {
  examId: string;
  examName: string;
  roomNo: string;
  date: string;
  start: string;
  end: string;
}

// Does `invigilator` already have a conflicting assignment on another room,
// for a DIFFERENT exam (or the same exam under a different id in the seating
// store) whose date+time window overlaps `windows`? `excludeExamId` is the
// exam currently being edited so its own (still-unsaved) rooms aren't
// compared against themselves.
export function findInvigilatorConflicts(
  invigilator: string,
  windows: DateWindow[],
  excludeExamId: string,
  excludeRoomId: string,
  allSeatingConfigs: SeatingConfig[],
  examsById: Map<string, ExamRecord>
): InvigilatorConflict[] {
  const name = (invigilator || "").trim();
  if (!name || windows.length === 0) return [];
  const conflicts: InvigilatorConflict[] = [];

  for (const otherCfg of allSeatingConfigs) {
    const otherExam = examsById.get(otherCfg.examId);
    if (!otherExam) continue;
    const otherWindows = otherExam.id === excludeExamId ? windows : examDateWindows(otherExam);
    if (otherWindows.length === 0) continue;

    for (const room of otherCfg.rooms) {
      if (otherCfg.examId === excludeExamId && room.id === excludeRoomId) continue;
      if ((room.invigilator || "").trim() !== name) continue;

      for (const w of windows) {
        for (const ow of otherWindows) {
          if (w.date !== ow.date) continue;
          if (!timesOverlap(w.start, w.end, ow.start, ow.end)) continue;
          conflicts.push({
            examId: otherCfg.examId,
            examName: otherExam.name,
            roomNo: room.roomNo,
            date: ow.date,
            start: ow.start,
            end: ow.end,
          });
        }
      }
    }
  }
  return conflicts;
}
