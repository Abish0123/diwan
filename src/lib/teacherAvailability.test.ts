import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetOne = vi.fn();
const mockGetAll = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => mockGetOne(...args),
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

import {
  DAYS_OF_WEEK,
  DEFAULT_SLOT_DURATION_MINUTES,
  SLOT_DURATION_OPTIONS,
  emptyAvailability,
  getTeacherAvailability,
  getAllTeacherAvailability,
  getTeacherAvailabilityByName,
  saveTeacherAvailability,
  expandToSlots,
  dayOfWeekFor,
  computeAvailableSlots,
  TeacherAvailability,
} from "./teacherAvailability";

beforeEach(() => {
  mockGetOne.mockReset();
  mockGetAll.mockReset();
  mockCreate.mockReset();
});

describe("emptyAvailability", () => {
  it("creates a row with one empty DayAvailability per day of the week, in order", () => {
    const result = emptyAvailability("t1", "Ms. Rao");
    expect(result.weeklySlots.map((d) => d.day)).toEqual(DAYS_OF_WEEK);
    expect(result.weeklySlots.every((d) => d.slots.length === 0)).toBe(true);
  });

  it("sets id = teacherId, empty blockedDates, and the default slot duration", () => {
    const result = emptyAvailability("t1", "Ms. Rao");
    expect(result.id).toBe("t1");
    expect(result.teacherId).toBe("t1");
    expect(result.teacherName).toBe("Ms. Rao");
    expect(result.blockedDates).toEqual([]);
    expect(result.slotDurationMinutes).toBe(DEFAULT_SLOT_DURATION_MINUTES);
  });
});

describe("constants", () => {
  it("exposes 7 days starting Monday and ending Sunday", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
    expect(DAYS_OF_WEEK[0]).toBe("Monday");
    expect(DAYS_OF_WEEK[6]).toBe("Sunday");
  });

  it("exposes the slot duration options including the default", () => {
    expect(SLOT_DURATION_OPTIONS).toContain(DEFAULT_SLOT_DURATION_MINUTES);
    expect(SLOT_DURATION_OPTIONS).toEqual([15, 20, 30, 45, 60]);
  });
});

describe("getTeacherAvailability", () => {
  it("returns the row from smartDb when found", async () => {
    const row = emptyAvailability("t1", "Ms. Rao");
    mockGetOne.mockResolvedValue(row);
    const result = await getTeacherAvailability("t1");
    expect(mockGetOne).toHaveBeenCalledWith("TeacherAvailability", "t1");
    expect(result).toEqual(row);
  });

  it("returns null when smartDb has no row for the teacher", async () => {
    mockGetOne.mockResolvedValue(undefined);
    const result = await getTeacherAvailability("missing");
    expect(result).toBeNull();
  });
});

describe("getAllTeacherAvailability", () => {
  it("returns the rows from smartDb", async () => {
    const rows = [emptyAvailability("t1", "A"), emptyAvailability("t2", "B")];
    mockGetAll.mockResolvedValue(rows);
    const result = await getAllTeacherAvailability();
    expect(result).toEqual(rows);
  });

  it("returns an empty array when smartDb resolves falsy", async () => {
    mockGetAll.mockResolvedValue(null);
    const result = await getAllTeacherAvailability();
    expect(result).toEqual([]);
  });
});

describe("getTeacherAvailabilityByName", () => {
  it("finds a match ignoring case and surrounding whitespace", async () => {
    const row = emptyAvailability("t1", "Ms. Rao");
    mockGetAll.mockResolvedValue([row]);
    const result = await getTeacherAvailabilityByName("  ms. rao  ");
    expect(result).toEqual(row);
  });

  it("returns null when no teacher matches the given name", async () => {
    const row = emptyAvailability("t1", "Ms. Rao");
    mockGetAll.mockResolvedValue([row]);
    const result = await getTeacherAvailabilityByName("Mr. Khan");
    expect(result).toBeNull();
  });

  it("treats a missing teacherName field on a row as an empty string (no crash)", async () => {
    const row = { ...emptyAvailability("t1", ""), teacherName: undefined as unknown as string };
    mockGetAll.mockResolvedValue([row]);
    const result = await getTeacherAvailabilityByName("");
    expect(result).toEqual(row);
  });
});

describe("saveTeacherAvailability", () => {
  it("persists via smartDb.create keyed by id, stamping updatedAt", async () => {
    const row = emptyAvailability("t1", "Ms. Rao");
    await saveTeacherAvailability(row);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [entity, payload, key] = mockCreate.mock.calls[0];
    expect(entity).toBe("TeacherAvailability");
    expect(key).toBe("t1");
    expect(payload.teacherId).toBe("t1");
    expect(typeof payload.updatedAt).toBe("string");
    expect(() => new Date(payload.updatedAt).toISOString()).not.toThrow();
  });
});

describe("expandToSlots", () => {
  it("expands a one-hour block into 15-minute starts by default", () => {
    const result = expandToSlots({ start: "15:00", end: "16:00" });
    expect(result).toEqual(["3:00 PM", "3:15 PM", "3:30 PM", "3:45 PM"]);
  });

  it("respects a custom increment", () => {
    const result = expandToSlots({ start: "09:00", end: "10:00" }, 30);
    expect(result).toEqual(["9:00 AM", "9:30 AM"]);
  });

  it("returns an empty array when the range is shorter than the increment", () => {
    const result = expandToSlots({ start: "09:00", end: "09:10" }, 15);
    expect(result).toEqual([]);
  });

  it("returns an empty array when start equals end", () => {
    const result = expandToSlots({ start: "09:00", end: "09:00" });
    expect(result).toEqual([]);
  });

  it("formats midnight as 12:00 AM and noon as 12:00 PM", () => {
    const midnight = expandToSlots({ start: "00:00", end: "00:15" });
    expect(midnight).toEqual(["12:00 AM"]);
    const noon = expandToSlots({ start: "12:00", end: "12:15" });
    expect(noon).toEqual(["12:00 PM"]);
  });

  it("formats a late-afternoon block correctly (e.g. 23:00-23:15 as 11:00 PM)", () => {
    const result = expandToSlots({ start: "23:00", end: "23:15" });
    expect(result).toEqual(["11:00 PM"]);
  });
});

describe("dayOfWeekFor", () => {
  it("returns the correct day name for a known date", () => {
    // 2026-07-13 is a Monday
    expect(dayOfWeekFor("2026-07-13")).toBe("Monday");
  });

  it("correctly identifies a Sunday", () => {
    // 2026-07-12 is a Sunday
    expect(dayOfWeekFor("2026-07-12")).toBe("Sunday");
  });
});

describe("computeAvailableSlots", () => {
  const baseAvailability: TeacherAvailability = {
    id: "t1",
    teacherId: "t1",
    teacherName: "Ms. Rao",
    weeklySlots: [
      { day: "Monday", slots: [{ start: "15:00", end: "16:00" }] },
      { day: "Tuesday", slots: [] },
    ],
    blockedDates: ["2026-07-20"],
  };

  it("returns an empty array when availability is null", () => {
    expect(computeAvailableSlots(null, "2026-07-13", [])).toEqual([]);
  });

  it("returns an empty array when the date is in blockedDates", () => {
    // 2026-07-20 is a Monday and would otherwise have slots
    expect(computeAvailableSlots(baseAvailability, "2026-07-20", [])).toEqual([]);
  });

  it("returns an empty array when there is no configured day for that weekday", () => {
    // Wednesday has no entry in weeklySlots at all
    expect(computeAvailableSlots(baseAvailability, "2026-07-15", [])).toEqual([]);
  });

  it("returns an empty array when the day config exists but has zero slots", () => {
    // 2026-07-14 is a Tuesday, configured with an empty slots array
    expect(computeAvailableSlots(baseAvailability, "2026-07-14", [])).toEqual([]);
  });

  it("returns the expanded slots for a valid, unblocked day with no bookings", () => {
    const result = computeAvailableSlots(baseAvailability, "2026-07-13", []);
    expect(result).toEqual(["3:00 PM", "3:15 PM", "3:30 PM", "3:45 PM"]);
  });

  it("filters out times that are already booked", () => {
    const result = computeAvailableSlots(baseAvailability, "2026-07-13", ["3:15 PM", "3:45 PM"]);
    expect(result).toEqual(["3:00 PM", "3:30 PM"]);
  });

  it("supports a custom increment", () => {
    const result = computeAvailableSlots(baseAvailability, "2026-07-13", [], 30);
    expect(result).toEqual(["3:00 PM", "3:30 PM"]);
  });
});
