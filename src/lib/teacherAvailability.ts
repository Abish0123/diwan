// Teacher Availability — real weekly meeting-hours a teacher configures for
// themselves, consumed by both the teacher's own "Schedule Meeting" flow and
// the parent's PTM booking flow so nobody can pick a slot the teacher never
// actually opened up.
import { smartDb } from "@/lib/localDb";

export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface TimeRange {
  start: string; // "15:00"
  end: string;   // "16:00"
}

export interface DayAvailability {
  day: string;
  slots: TimeRange[];
}

export interface TeacherAvailability {
  id: string;          // = teacherId, one row per teacher
  teacherId: string;
  teacherName: string;
  weeklySlots: DayAvailability[];
  blockedDates: string[]; // ISO "YYYY-MM-DD"
  // Length of each bookable slot in minutes — how far apart the individual
  // start times are when a weekly block (e.g. 3:00 PM - 4:00 PM) is expanded
  // into pickable times for the parent. Defaults to 15 for teachers who
  // haven't set one yet.
  slotDurationMinutes?: number;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SLOT_DURATION_MINUTES = 15;
export const SLOT_DURATION_OPTIONS = [15, 20, 30, 45, 60];

export function emptyAvailability(teacherId: string, teacherName: string): TeacherAvailability {
  return {
    id: teacherId,
    teacherId,
    teacherName,
    weeklySlots: DAYS_OF_WEEK.map((day) => ({ day, slots: [] })),
    blockedDates: [],
    slotDurationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
  };
}

// Real availability is unscoped — a parent booking a meeting needs to read
// the teacher's rows regardless of which admin/teacher account created them.
export async function getTeacherAvailability(teacherId: string): Promise<TeacherAvailability | null> {
  const row = await smartDb.getOne<TeacherAvailability>("TeacherAvailability", teacherId);
  return row || null;
}

export async function getAllTeacherAvailability(): Promise<TeacherAvailability[]> {
  const rows = (await smartDb.getAll("TeacherAvailability", undefined)) as TeacherAvailability[];
  return rows || [];
}

// Class.teacher and subject_assignments.teacherName only ever store a plain
// name string, not a uid — this is the join path the parent-side booking
// flow has to use since it never sees the teacher's account id.
export async function getTeacherAvailabilityByName(teacherName: string): Promise<TeacherAvailability | null> {
  const all = await getAllTeacherAvailability();
  const target = teacherName.trim().toLowerCase();
  return all.find((a) => (a.teacherName || "").trim().toLowerCase() === target) || null;
}

export async function saveTeacherAvailability(availability: TeacherAvailability): Promise<void> {
  await smartDb.create("TeacherAvailability", { ...availability, updatedAt: new Date().toISOString() }, availability.id);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Expands a teacher's configured blocks (e.g. 3:00 PM – 4:00 PM) into
// individual bookable start times at a fixed increment — this is what lets
// the parent pick "3:00 PM", "3:15 PM", "3:30 PM"… instead of only being
// able to book the whole hour-long block at once.
export function expandToSlots(range: TimeRange, incrementMinutes = 15): string[] {
  const start = toMinutes(range.start);
  const end = toMinutes(range.end);
  const out: string[] = [];
  for (let t = start; t + incrementMinutes <= end; t += incrementMinutes) {
    out.push(fromMinutes(t));
  }
  return out;
}

export function dayOfWeekFor(dateStr: string): string {
  const idx = new Date(`${dateStr}T00:00:00`).getDay(); // 0=Sun..6=Sat
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx];
}

// Real bookable time slots for a teacher on a given date: their configured
// weekly blocks for that day-of-week, expanded to 15-min starts, minus the
// date being blocked entirely and minus times already booked by someone
// else (any PTMSession for this teacher/date whose status isn't Cancelled).
export function computeAvailableSlots(
  availability: TeacherAvailability | null,
  date: string,
  alreadyBookedTimes: string[],
  incrementMinutes = 15
): string[] {
  if (!availability) return [];
  if (availability.blockedDates.includes(date)) return [];
  const day = dayOfWeekFor(date);
  const dayConfig = availability.weeklySlots.find((d) => d.day === day);
  if (!dayConfig || dayConfig.slots.length === 0) return [];
  const all = dayConfig.slots.flatMap((r) => expandToSlots(r, incrementMinutes));
  const booked = new Set(alreadyBookedTimes);
  return all.filter((t) => !booked.has(t));
}
