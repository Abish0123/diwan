import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external boundaries ────────────────────────────────────────────────
// smartDb performs network calls (write-through to MySQL) — stub it out.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn(() => Promise.resolve({})),
    getOne: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
  },
}));

// examStore's getGradePlans is a small pure helper; reimplement it faithfully
// here so we don't have to pull in examStore's much heavier dependency tree
// (repositories, email service, etc.) just to test seatingStore's own logic.
vi.mock("@/lib/examStore", () => ({
  getGradePlans: (exam: any) => {
    if (exam.gradePlans && exam.gradePlans.length > 0) return exam.gradePlans;
    return [{
      grade: exam.grade, section: exam.section, sections: exam.sections,
      subjects: exam.subjects, startDate: exam.startDate, endDate: exam.endDate,
      appeared: exam.appeared, total: exam.total, slots: exam.slots,
    }];
  },
}));

import {
  defaultConfig,
  getSeating,
  saveSeating,
  examStructureSnapshot,
  isSeatingStale,
  effectiveCapacity,
  orderStudents,
  allocateSeats,
  findSeat,
  findSeatAnywhere,
  resolveSeat,
  getRollRanges,
  findRoomByRoll,
  examDateWindows,
  findInvigilatorConflicts,
  newRoomId,
  type SeatingConfig,
  type SeatingStudent,
  type ExamRoom,
} from "./seatingStore";
import type { ExamRecord } from "@/lib/examStore";

function student(id: string, name: string, rollNo: string, grade: string, section: string): SeatingStudent {
  return { id, name, rollNo, grade, section };
}

function exam(overrides: Partial<ExamRecord> = {}): ExamRecord {
  return {
    id: "EXM-1", name: "Mid Term", type: "Mid-Term", grade: "Grade 6", section: "All Sections",
    sections: ["A", "B"], subjects: "5 Subjects", startDate: "2026-07-01", endDate: "2026-07-05",
    appeared: 0, total: 0, status: "Scheduled", slots: [], published: false, gradePlans: [],
    mode: "Offline", venue: "", room: "",
    ...overrides,
  } as unknown as ExamRecord;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("defaultConfig", () => {
  it("returns a sensible default configuration for a given examId", () => {
    const cfg = defaultConfig("EXM-1");
    expect(cfg).toEqual({
      examId: "EXM-1",
      method: "auto",
      roomCapacity: 25,
      seatGap: "none",
      autoAllocate: true,
      rooms: [],
      assignments: [],
      updatedAt: "",
    });
  });
});

describe("getSeating / saveSeating", () => {
  it("returns the default config when nothing has been saved for the examId", () => {
    const cfg = getSeating("EXM-NEW");
    expect(cfg.examId).toBe("EXM-NEW");
    expect(cfg.assignments).toEqual([]);
  });

  it("persists a saved config and merges it over the defaults on read", () => {
    const cfg: SeatingConfig = { ...defaultConfig("EXM-1"), method: "mixed-grades", roomCapacity: 30 };
    saveSeating(cfg);
    const read = getSeating("EXM-1");
    expect(read.method).toBe("mixed-grades");
    expect(read.roomCapacity).toBe(30);
    expect(read.updatedAt).not.toBe("");
  });

  it("stores the exam structure snapshot when an exam is passed to saveSeating", () => {
    const cfg: SeatingConfig = { ...defaultConfig("EXM-1") };
    saveSeating(cfg, exam());
    const read = getSeating("EXM-1");
    expect(read.examSnapshot).toBe(examStructureSnapshot(exam()));
  });

  it("keeps distinct exams independent in the store", () => {
    saveSeating({ ...defaultConfig("EXM-1"), method: "by-grade" });
    saveSeating({ ...defaultConfig("EXM-2"), method: "roll-number" });
    expect(getSeating("EXM-1").method).toBe("by-grade");
    expect(getSeating("EXM-2").method).toBe("roll-number");
  });
});

describe("examStructureSnapshot / isSeatingStale", () => {
  it("produces identical snapshots for exams with the same grade/section structure", () => {
    const a = exam({ gradePlans: [{ grade: "Grade 6", section: "All Sections", sections: ["A", "B"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] }] });
    const b = exam({ gradePlans: [{ grade: "Grade 6", section: "All Sections", sections: ["A", "B"], subjects: "different", startDate: "2027-01-01", endDate: "", appeared: 5, total: 5, slots: [] }] });
    expect(examStructureSnapshot(a)).toBe(examStructureSnapshot(b));
  });

  it("is never stale when there are no assignments yet (not generated)", () => {
    const cfg = defaultConfig("EXM-1");
    expect(isSeatingStale(cfg, exam())).toBe(false);
  });

  it("is stale when the exam's grade/section structure changed since the snapshot", () => {
    const originalExam = exam({ sections: ["A", "B"] });
    const cfg: SeatingConfig = {
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "s1", name: "A", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
      examSnapshot: examStructureSnapshot(originalExam),
    };
    const changedExam = exam({ sections: ["A", "B", "C"] });
    expect(isSeatingStale(cfg, changedExam)).toBe(true);
  });

  it("is not stale when the structure snapshot still matches and roster is unchanged", () => {
    const e = exam({ sections: ["A", "B"] });
    const roster: SeatingStudent[] = [student("s1", "Ali", "1", "Grade 6", "A")];
    const cfg: SeatingConfig = {
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "s1", name: "Ali", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
      examSnapshot: examStructureSnapshot(e),
    };
    expect(isSeatingStale(cfg, e, roster)).toBe(false);
  });

  it("is stale when the current roster has a new, unseated student", () => {
    const e = exam();
    const cfg: SeatingConfig = {
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "s1", name: "Ali", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
      examSnapshot: examStructureSnapshot(e),
    };
    const roster: SeatingStudent[] = [student("s1", "Ali", "1", "Grade 6", "A"), student("s2", "Sara", "2", "Grade 6", "A")];
    expect(isSeatingStale(cfg, e, roster)).toBe(true);
  });

  it("is stale when a previously-seated student is no longer in the roster", () => {
    const e = exam();
    const cfg: SeatingConfig = {
      ...defaultConfig("EXM-1"),
      assignments: [
        { studentId: "s1", name: "Ali", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" },
        { studentId: "s2", name: "Sara", rollNo: "2", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "02" },
      ],
      examSnapshot: examStructureSnapshot(e),
    };
    const roster: SeatingStudent[] = [student("s1", "Ali", "1", "Grade 6", "A")];
    expect(isSeatingStale(cfg, e, roster)).toBe(true);
  });
});

describe("effectiveCapacity", () => {
  it("returns the full capacity when there is no seat gap", () => {
    expect(effectiveCapacity(30, "none")).toBe(30);
  });
  it("roughly halves capacity (rounded up) for one-gap seating", () => {
    expect(effectiveCapacity(30, "one-gap")).toBe(15);
    expect(effectiveCapacity(25, "one-gap")).toBe(13);
  });
  it("roughly halves capacity (rounded up) for alternate seating", () => {
    expect(effectiveCapacity(25, "alternate")).toBe(13);
  });
  it("never returns less than 1 seat even for tiny rooms", () => {
    expect(effectiveCapacity(1, "one-gap")).toBe(1);
    expect(effectiveCapacity(0, "one-gap")).toBe(1);
  });
});

describe("orderStudents", () => {
  const students = [
    student("1", "A1", "3", "Grade 6", "A"),
    student("2", "B1", "1", "Grade 6", "B"),
    student("3", "A2", "1", "Grade 6", "A"),
    student("4", "B2", "2", "Grade 6", "B"),
  ];

  it("roll-number: sorts purely by roll number across sections", () => {
    const ordered = orderStudents(students, "roll-number");
    expect(ordered.map(s => s.rollNo)).toEqual(["1", "1", "2", "3"]);
  });

  it("by-grade: sorts purely by roll number (same as roll-number for a single grade)", () => {
    const ordered = orderStudents(students, "by-grade");
    expect(ordered.map(s => s.rollNo)).toEqual(["1", "1", "2", "3"]);
  });

  it("by-section: groups by section (alphabetical), then roll within section", () => {
    const ordered = orderStudents(students, "by-section");
    expect(ordered.map(s => s.name)).toEqual(["A2", "A1", "B1", "B2"]);
  });

  it("mixed-sections: round-robins across sections, sorted by roll within each", () => {
    const ordered = orderStudents(students, "mixed-sections");
    // section A sorted by roll: A2(1), A1(3); section B sorted by roll: B1(1), B2(2)
    expect(ordered.map(s => s.name)).toEqual(["A2", "B1", "A1", "B2"]);
  });

  it("mixed-grades: round-robins across grades", () => {
    const multiGrade = [
      student("1", "G5-1", "1", "Grade 5", "A"),
      student("2", "G5-2", "2", "Grade 5", "A"),
      student("3", "G6-1", "1", "Grade 6", "A"),
    ];
    const ordered = orderStudents(multiGrade, "mixed-grades");
    expect(ordered.map(s => s.name)).toEqual(["G5-1", "G6-1", "G5-2"]);
  });

  it("auto: picks mixed-grades when multiple grades are present", () => {
    const multiGrade = [
      student("1", "G5-1", "1", "Grade 5", "A"),
      student("2", "G6-1", "1", "Grade 6", "A"),
    ];
    expect(orderStudents(multiGrade, "auto")).toEqual(orderStudents(multiGrade, "mixed-grades"));
  });

  it("auto: picks mixed-sections when a single grade has multiple sections", () => {
    expect(orderStudents(students, "auto")).toEqual(orderStudents(students, "mixed-sections"));
  });

  it("auto: falls back to roll-number when there is one grade and one section", () => {
    const single = [student("1", "X1", "2", "Grade 6", "A"), student("2", "X2", "1", "Grade 6", "A")];
    expect(orderStudents(single, "auto")).toEqual(orderStudents(single, "roll-number"));
  });

  it("falls back to a synthetic roll (index+1) when rollNo has no digits", () => {
    const noRoll = [student("1", "First", "abc", "Grade 6", "A"), student("2", "Second", "xyz", "Grade 6", "A")];
    const ordered = orderStudents(noRoll, "roll-number");
    // rollNum fallback uses (index_at_map_time + 1); original array order preserved as fallback roll 1,2
    expect(ordered.map(s => s.name)).toEqual(["First", "Second"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(orderStudents([], "auto")).toEqual([]);
  });
});

describe("allocateSeats", () => {
  it("fills user-defined rooms in order up to their effective capacity", () => {
    const students = [
      student("1", "S1", "1", "Grade 6", "A"),
      student("2", "S2", "2", "Grade 6", "A"),
      student("3", "S3", "3", "Grade 6", "A"),
    ];
    const rooms: ExamRoom[] = [{ id: "r1", roomNo: "Room 101", capacity: 2, invigilator: "Mr. X" }];
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms, autoAllocate: true, roomCapacity: 25 };
    const result = allocateSeats(students, config);
    expect(result.assignments).toHaveLength(3);
    expect(result.assignments[0]).toMatchObject({ studentId: "1", roomNo: "Room 101", seatLabel: "01" });
    expect(result.assignments[1]).toMatchObject({ studentId: "2", roomNo: "Room 101", seatLabel: "02" });
    // 3rd student spills into an auto-generated room since Room 101 only holds 2
    expect(result.assignments[2].roomNo).not.toBe("Room 101");
    expect(result.unallocated).toEqual([]);
  });

  it("does not auto-generate extra rooms when autoAllocate is false, leaving overflow unallocated", () => {
    const students = [
      student("1", "S1", "1", "Grade 6", "A"),
      student("2", "S2", "2", "Grade 6", "A"),
      student("3", "S3", "3", "Grade 6", "A"),
    ];
    const rooms: ExamRoom[] = [{ id: "r1", roomNo: "Room 101", capacity: 2, invigilator: "" }];
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms, autoAllocate: false };
    const result = allocateSeats(students, config);
    expect(result.rooms).toHaveLength(1);
    expect(result.assignments).toHaveLength(2);
    expect(result.unallocated).toHaveLength(1);
    expect(result.unallocated[0].name).toBe("S3");
  });

  it("auto-generates rooms from scratch when none are defined", () => {
    const students = Array.from({ length: 30 }, (_, i) => student(String(i), `S${i}`, String(i + 1), "Grade 6", "A"));
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms: [], autoAllocate: true, roomCapacity: 25 };
    const result = allocateSeats(students, config);
    expect(result.assignments).toHaveLength(30);
    expect(result.unallocated).toEqual([]);
    // 25 in first auto room, 5 in the second
    const roomNos = new Set(result.assignments.map(a => a.roomNo));
    expect(roomNos.size).toBe(2);
  });

  it("applies seat-gap seat labels correctly (one-gap => odd-numbered labels)", () => {
    const students = [student("1", "S1", "1", "Grade 6", "A"), student("2", "S2", "2", "Grade 6", "A")];
    const rooms: ExamRoom[] = [{ id: "r1", roomNo: "Room 101", capacity: 10, invigilator: "" }];
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms, seatGap: "one-gap", autoAllocate: false };
    const result = allocateSeats(students, config);
    expect(result.assignments.map(a => a.seatLabel)).toEqual(["01", "03"]);
  });

  // KNOWN BUG: buildRooms()'s "!config.autoAllocate" short-circuit only applies
  // when `rooms.length > 0` (some rooms are already user-defined). When NO rooms
  // are defined at all, it falls through to the auto-generation loop regardless
  // of autoAllocate, so a student is still seated even with autoAllocate:false.
  // Documenting actual behavior rather than the seemingly-intended "no rooms,
  // no auto-allocate => nobody seated".
  it("still auto-generates a room and seats the student when no rooms are defined, even with autoAllocate false", () => {
    const students = [student("1", "S1", "1", "Grade 6", "A")];
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms: [], autoAllocate: false };
    const result = allocateSeats(students, config);
    expect(result.rooms).toHaveLength(1);
    expect(result.assignments).toHaveLength(1);
    expect(result.unallocated).toEqual([]);
  });

  it("handles an empty student list gracefully", () => {
    const config: SeatingConfig = { ...defaultConfig("EXM-1"), rooms: [], autoAllocate: true };
    const result = allocateSeats([], config);
    expect(result.assignments).toEqual([]);
    expect(result.unallocated).toEqual([]);
    expect(result.rooms).toEqual([]);
  });
});

describe("findSeat / findSeatAnywhere / resolveSeat", () => {
  it("findSeat returns null when the exam has no saved seating", () => {
    expect(findSeat("EXM-NONE", "s1")).toBeNull();
  });

  it("findSeat returns the assignment for a seated student", () => {
    const cfg: SeatingConfig = {
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "s1", name: "Ali", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
    };
    saveSeating(cfg);
    const found = findSeat("EXM-1", "s1");
    expect(found).toMatchObject({ roomNo: "Room 101", seatLabel: "01" });
  });

  it("findSeatAnywhere finds a student seated under a different examId, preferring the most recently updated plan", async () => {
    saveSeating({
      ...defaultConfig("EXM-OLD"),
      assignments: [{ studentId: "s9", name: "Old", rollNo: "9", grade: "Grade 6", section: "A", roomNo: "Room A", seatLabel: "01" }],
    });
    // ensure a later timestamp
    await new Promise(r => setTimeout(r, 2));
    saveSeating({
      ...defaultConfig("EXM-NEW"),
      assignments: [{ studentId: "s9", name: "New", rollNo: "9", grade: "Grade 6", section: "A", roomNo: "Room B", seatLabel: "02" }],
    });
    const found = findSeatAnywhere("s9");
    expect(found?.roomNo).toBe("Room B");
  });

  it("findSeatAnywhere falls back to grade+section+roll identity when studentId doesn't match", () => {
    saveSeating({
      ...defaultConfig("EXM-POOL"),
      assignments: [{ studentId: "other-id", name: "Sam", rollNo: "12", grade: "Grade 6", section: "A", roomNo: "Room C", seatLabel: "05" }],
    });
    const found = findSeatAnywhere("does-not-exist", { grade: "Grade 6", section: "A", rollNo: "12" });
    expect(found).toMatchObject({ roomNo: "Room C", seatLabel: "05" });
  });

  it("findSeatAnywhere returns null when nothing matches by id or identity", () => {
    expect(findSeatAnywhere("nobody", { grade: "Grade 9", section: "Z", rollNo: "999" })).toBeNull();
  });

  it("resolveSeat resolves via findSeat first when the exam's own plan has the student", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "s1", name: "Ali", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
    });
    expect(resolveSeat("EXM-1", "s1")?.roomNo).toBe("Room 101");
  });

  it("resolveSeat falls back to findRoomByRoll then findSeatAnywhere when direct id lookup fails", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "other", name: "Ali", rollNo: "7", grade: "Grade 6", section: "A", roomNo: "Room 202", seatLabel: "03" }],
    });
    const found = resolveSeat("EXM-1", "missing-id", { rollNo: "7" });
    expect(found?.roomNo).toBe("Room 202");
  });

  it("resolveSeat returns null when no path resolves the student", () => {
    expect(resolveSeat("EXM-NONE", "nobody")).toBeNull();
  });
});

describe("getRollRanges", () => {
  it("computes min/max roll and count per room, sorted by rollFrom", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      rooms: [{ id: "r1", roomNo: "Room 101", capacity: 25, invigilator: "Ms. Fatima" }],
      assignments: [
        { studentId: "1", name: "A", rollNo: "5", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" },
        { studentId: "2", name: "B", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "02" },
        { studentId: "3", name: "C", rollNo: "10", grade: "Grade 6", section: "B", roomNo: "Room 202", seatLabel: "01" },
      ],
    });
    const ranges = getRollRanges("EXM-1");
    expect(ranges).toEqual([
      { roomNo: "Room 101", rollFrom: 1, rollTo: 5, count: 2, invigilator: "Ms. Fatima" },
      { roomNo: "Room 202", rollFrom: 10, rollTo: 10, count: 1, invigilator: "" },
    ]);
  });

  it("ignores assignments with a non-numeric or zero roll number", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      assignments: [
        { studentId: "1", name: "A", rollNo: "abc", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" },
        { studentId: "2", name: "B", rollNo: "0", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "02" },
      ],
    });
    expect(getRollRanges("EXM-1")).toEqual([]);
  });

  it("returns an empty array when nothing has been seated", () => {
    expect(getRollRanges("EXM-EMPTY")).toEqual([]);
  });
});

describe("findRoomByRoll", () => {
  it("finds the assignment matching a numeric roll number", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "1", name: "A", rollNo: "042", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
    });
    expect(findRoomByRoll("EXM-1", 42)).toMatchObject({ roomNo: "Room 101" });
    expect(findRoomByRoll("EXM-1", "42")).toMatchObject({ roomNo: "Room 101" });
  });

  it("returns null for an invalid (non-numeric or zero) roll number", () => {
    expect(findRoomByRoll("EXM-1", "abc")).toBeNull();
    expect(findRoomByRoll("EXM-1", 0)).toBeNull();
    expect(findRoomByRoll("EXM-1", -5)).toBeNull();
  });

  it("returns null when no assignment matches the roll number", () => {
    saveSeating({
      ...defaultConfig("EXM-1"),
      assignments: [{ studentId: "1", name: "A", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 101", seatLabel: "01" }],
    });
    expect(findRoomByRoll("EXM-1", 99)).toBeNull();
  });
});

describe("examDateWindows", () => {
  it("derives one window per distinct date from grade-plan slots, spanning earliest start to latest end", () => {
    const e = exam({
      gradePlans: [{
        grade: "Grade 6", section: "All Sections", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0,
        slots: [
          { subject: "Math", date: "2026-07-10", start: "09:00", end: "10:30", invigilator: "", room: "" },
          { subject: "Science", date: "2026-07-10", start: "11:00", end: "12:00", invigilator: "", room: "" },
          { subject: "English", date: "2026-07-11", start: "09:00", end: "10:00", invigilator: "", room: "" },
        ],
      }],
    });
    const windows = examDateWindows(e);
    expect(windows).toEqual([
      { date: "2026-07-10", start: "09:00", end: "12:00" },
      { date: "2026-07-11", start: "09:00", end: "10:00" },
    ]);
  });

  it("falls back to the exam's startDate as an all-day window when there is no slot-level datesheet", () => {
    const e = exam({ gradePlans: [], slots: [], startDate: "2026-08-01" });
    expect(examDateWindows(e)).toEqual([{ date: "2026-08-01", start: "00:00", end: "23:59" }]);
  });

  it("returns an empty array when there are no slots and no startDate", () => {
    const e = exam({ gradePlans: [], slots: [], startDate: "" });
    expect(examDateWindows(e)).toEqual([]);
  });

  it("ignores slots with no date", () => {
    const e = exam({
      gradePlans: [{
        grade: "Grade 6", section: "All Sections", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0,
        slots: [{ subject: "Math", date: "", start: "09:00", end: "10:00", invigilator: "", room: "" }],
      }],
      startDate: "2026-09-01",
    });
    // no valid slot dates -> falls back to exam startDate
    expect(examDateWindows(e)).toEqual([{ date: "2026-09-01", start: "00:00", end: "23:59" }]);
  });
});

describe("findInvigilatorConflicts", () => {
  function makeCfg(examId: string, roomId: string, roomNo: string, invigilator: string): SeatingConfig {
    return {
      ...defaultConfig(examId),
      rooms: [{ id: roomId, roomNo, capacity: 25, invigilator }],
    };
  }

  it("returns no conflicts for an empty invigilator name or no windows", () => {
    const examsById = new Map<string, ExamRecord>([["E1", exam({ id: "E1" })]]);
    expect(findInvigilatorConflicts("", [{ date: "2026-07-10", start: "09:00", end: "10:00" }], "E1", "r1", [], examsById)).toEqual([]);
    expect(findInvigilatorConflicts("Ms. Rao", [], "E1", "r1", [], examsById)).toEqual([]);
  });

  it("detects a conflict when the same invigilator is booked in another exam's room with an overlapping window", () => {
    const examA = exam({ id: "E1", name: "Mid Term" });
    const examB = exam({ id: "E2", name: "Quiz 1", startDate: "2026-07-10", gradePlans: [{
      grade: "Grade 6", section: "All Sections", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0,
      slots: [{ subject: "X", date: "2026-07-10", start: "09:30", end: "10:30", invigilator: "", room: "" }],
    } as any] });
    const examsById = new Map<string, ExamRecord>([["E1", examA], ["E2", examB]]);
    const windows = [{ date: "2026-07-10", start: "09:00", end: "10:00" }];
    const otherCfg = makeCfg("E2", "r2", "Room 202", "Ms. Rao");
    const conflicts = findInvigilatorConflicts("Ms. Rao", windows, "E1", "r1", [otherCfg], examsById);
    expect(conflicts).toEqual([{ examId: "E2", examName: "Quiz 1", roomNo: "Room 202", date: "2026-07-10", start: "09:30", end: "10:30" }]);
  });

  it("does not flag a conflict when the windows don't overlap in time", () => {
    const examA = exam({ id: "E1" });
    const examB = exam({ id: "E2", gradePlans: [{
      grade: "Grade 6", section: "All Sections", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0,
      slots: [{ subject: "X", date: "2026-07-10", start: "11:00", end: "12:00", invigilator: "", room: "" }],
    } as any] });
    const examsById = new Map<string, ExamRecord>([["E1", examA], ["E2", examB]]);
    const windows = [{ date: "2026-07-10", start: "09:00", end: "10:00" }];
    const otherCfg = makeCfg("E2", "r2", "Room 202", "Ms. Rao");
    expect(findInvigilatorConflicts("Ms. Rao", windows, "E1", "r1", [otherCfg], examsById)).toEqual([]);
  });

  it("excludes the room currently being edited within the same exam", () => {
    const examA = exam({ id: "E1" });
    const examsById = new Map<string, ExamRecord>([["E1", examA]]);
    const windows = [{ date: "2026-07-10", start: "09:00", end: "10:00" }];
    const selfCfg = makeCfg("E1", "r1", "Room 101", "Ms. Rao");
    expect(findInvigilatorConflicts("Ms. Rao", windows, "E1", "r1", [selfCfg], examsById)).toEqual([]);
  });

  it("does not flag a conflict for a different invigilator in the same room/time", () => {
    const examA = exam({ id: "E1" });
    const examB = exam({ id: "E2", startDate: "2026-07-10" });
    const examsById = new Map<string, ExamRecord>([["E1", examA], ["E2", examB]]);
    const windows = [{ date: "2026-07-10", start: "09:00", end: "10:00" }];
    const otherCfg = makeCfg("E2", "r2", "Room 202", "Mr. Ahmed");
    expect(findInvigilatorConflicts("Ms. Rao", windows, "E1", "r1", [otherCfg], examsById)).toEqual([]);
  });

  it("skips seating configs whose exam id can't be resolved in examsById", () => {
    const examA = exam({ id: "E1" });
    const examsById = new Map<string, ExamRecord>([["E1", examA]]);
    const windows = [{ date: "2026-07-10", start: "09:00", end: "10:00" }];
    const orphanCfg = makeCfg("E-ORPHAN", "r2", "Room 202", "Ms. Rao");
    expect(findInvigilatorConflicts("Ms. Rao", windows, "E1", "r1", [orphanCfg], examsById)).toEqual([]);
  });
});

describe("newRoomId", () => {
  it("generates unique, non-empty room ids across multiple calls", () => {
    const ids = new Set(Array.from({ length: 5 }, () => newRoomId()));
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^ROOM-/);
  });
});
