import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the external boundaries (DB/email/repositories) that examStore.ts
// touches so we test the real store logic without network/DB side effects.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/emailService", () => ({
  sendPlainEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/repositories/StudentRepository", () => ({
  studentRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/repositories/UserRepository", () => ({
  userRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/repositories/SubjectAssignmentRepository", () => ({
  subjectAssignmentRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));

import {
  getExams,
  setExams,
  addExam,
  updateExam,
  deleteExam,
  setGradePublished,
  nextExamId,
  normalizeSection,
  matchesSection,
  seatNumber,
  recordToDatesheet,
  summarizeSlots,
  getGradePlans,
  examGrades,
  planForGrade,
  isForwardStatusTransition,
  STATUS_ORDER,
  loadExamSettings,
  EXAM_SETTINGS_LS_KEY,
  type ExamRecord,
  type ExamSlot,
  type GradePlan,
} from "./examStore";

function makeSlot(overrides: Partial<ExamSlot> = {}): ExamSlot {
  return {
    subject: "Mathematics",
    date: "2026-08-01",
    start: "09:00",
    end: "11:00",
    invigilator: "Mr. Ali",
    room: "R1",
    ...overrides,
  };
}

function makeExam(overrides: Partial<ExamRecord> = {}): ExamRecord {
  return {
    id: "EXM-000001",
    name: "Mid Term - 1",
    type: "Unit Test",
    grade: "Grade 6",
    section: "A",
    sections: ["A"],
    subjects: "1 Subject",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    appeared: 0,
    total: 0,
    status: "Scheduled",
    slots: [makeSlot()],
    published: false,
    gradePlans: [],
    mode: "Offline",
    venue: "",
    room: "",
    invigilator: "",
    durationMin: 120,
    maxMarks: 100,
    passingMarks: 40,
    publishedToTeachers: true,
    publishedToStudents: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("getExams / setExams / addExam / deleteExam (localStorage-backed CRUD)", () => {
  it("returns an empty array when nothing has been stored", () => {
    expect(getExams()).toEqual([]);
  });

  it("persists and reads back exams added via addExam", () => {
    const exam = makeExam();
    addExam(exam);
    const all = getExams();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("EXM-000001");
    expect(all[0].name).toBe("Mid Term - 1");
  });

  it("addExam prepends new exams (most recent first)", () => {
    addExam(makeExam({ id: "EXM-1" }));
    addExam(makeExam({ id: "EXM-2" }));
    const all = getExams();
    expect(all.map(e => e.id)).toEqual(["EXM-2", "EXM-1"]);
  });

  it("setExams replaces the entire list", () => {
    addExam(makeExam({ id: "EXM-1" }));
    setExams([makeExam({ id: "EXM-9" })]);
    expect(getExams().map(e => e.id)).toEqual(["EXM-9"]);
  });

  it("deleteExam removes the matching record only", () => {
    addExam(makeExam({ id: "EXM-1" }));
    addExam(makeExam({ id: "EXM-2" }));
    deleteExam("EXM-1");
    expect(getExams().map(e => e.id)).toEqual(["EXM-2"]);
  });

  it("updateExam patches fields on the matching record and leaves others untouched", () => {
    addExam(makeExam({ id: "EXM-1", name: "Old Name" }));
    updateExam("EXM-1", { name: "New Name" });
    const all = getExams();
    expect(all[0].name).toBe("New Name");
    expect(all[0].id).toBe("EXM-1");
  });

  it("updateExam on a non-existent id does not throw and does not add a record", () => {
    addExam(makeExam({ id: "EXM-1" }));
    expect(() => updateExam("NOPE", { name: "x" })).not.toThrow();
    expect(getExams()).toHaveLength(1);
  });
});

describe("normalize() back-fill behavior (exercised through getExams)", () => {
  it("defaults missing optional fields for legacy/raw records written directly to localStorage", () => {
    localStorage.setItem("sd_exams_version", "4");
    localStorage.setItem("sd_exams", JSON.stringify([{ id: "LEGACY-1" }]));
    const [exam] = getExams();
    expect(exam.name).toBe("");
    expect(exam.type).toBe("Unit Test");
    expect(exam.status).toBe("Scheduled");
    expect(exam.mode).toBe("Offline");
    expect(exam.durationMin).toBe(120);
    expect(exam.maxMarks).toBe(100);
    expect(exam.passingMarks).toBe(40);
    // Legacy/seed records default to visible unless explicitly set false.
    expect(exam.publishedToTeachers).toBe(true);
    expect(exam.publishedToStudents).toBe(true);
    expect(exam.slots).toEqual([]);
    expect(exam.sections).toEqual([]);
  });

  it("derives `published` from status === 'Published' when not explicitly set", () => {
    localStorage.setItem("sd_exams_version", "4");
    localStorage.setItem("sd_exams", JSON.stringify([{ id: "LEGACY-2", status: "Published" }]));
    const [exam] = getExams();
    expect(exam.published).toBe(true);
  });

  it("back-fills legacy singular fields from gradePlans[0] when gradePlans is present", () => {
    localStorage.setItem("sd_exams_version", "4");
    const plan: Partial<GradePlan> = {
      grade: "Grade 7", section: "B", sections: ["B"], subjects: "2 Subjects",
      startDate: "2026-09-01", endDate: "2026-09-02", appeared: 5, total: 10,
      slots: [makeSlot()],
    };
    localStorage.setItem("sd_exams", JSON.stringify([{ id: "MG-1", gradePlans: [plan] }]));
    const [exam] = getExams();
    expect(exam.grade).toBe("Grade 7");
    expect(exam.section).toBe("B");
    expect(exam.subjects).toBe("2 Subjects");
    expect(exam.startDate).toBe("2026-09-01");
    expect(exam.appeared).toBe(5);
    expect(exam.total).toBe(10);
  });

  it("sums appeared/total across all grade plans when gradePlans has multiple entries", () => {
    localStorage.setItem("sd_exams_version", "4");
    const plans: Partial<GradePlan>[] = [
      { grade: "Grade 7", appeared: 5, total: 10, slots: [] },
      { grade: "Grade 8", appeared: 3, total: 8, slots: [] },
    ];
    localStorage.setItem("sd_exams", JSON.stringify([{ id: "MG-2", gradePlans: plans }]));
    const [exam] = getExams();
    expect(exam.appeared).toBe(8);
    expect(exam.total).toBe(18);
  });

  it("clears old data when the store version marker changes", () => {
    localStorage.setItem("sd_exams_version", "3");
    localStorage.setItem("sd_exams", JSON.stringify([{ id: "OLD-1" }]));
    expect(getExams()).toEqual([]);
    expect(localStorage.getItem("sd_exams_version")).toBe("4");
  });

  it("returns an empty array (not a throw) when localStorage contains invalid JSON", () => {
    localStorage.setItem("sd_exams_version", "4");
    localStorage.setItem("sd_exams", "{not valid json");
    expect(getExams()).toEqual([]);
  });

  it("returns an empty array when the stored value is valid JSON but not an array", () => {
    localStorage.setItem("sd_exams_version", "4");
    localStorage.setItem("sd_exams", JSON.stringify({ not: "an array" }));
    expect(getExams()).toEqual([]);
  });
});

describe("getGradePlans / examGrades / planForGrade", () => {
  it("synthesizes a single-entry plan array from legacy singular fields when gradePlans is empty", () => {
    const exam = makeExam({ gradePlans: [], grade: "Grade 5", section: "C" });
    const plans = getGradePlans(exam);
    expect(plans).toHaveLength(1);
    expect(plans[0].grade).toBe("Grade 5");
    expect(plans[0].section).toBe("C");
  });

  it("returns the real gradePlans array when present", () => {
    const gp: GradePlan = {
      grade: "Grade 9", section: "A", sections: ["A"], subjects: "1 Subject",
      startDate: "2026-08-01", endDate: "2026-08-01", appeared: 0, total: 0, slots: [],
    };
    const exam = makeExam({ gradePlans: [gp] });
    expect(getGradePlans(exam)).toEqual([gp]);
  });

  it("examGrades lists every grade across plans, dropping falsy entries", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 9", section: "A", sections: [], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
      { grade: "", section: "A", sections: [], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
      { grade: "Grade 10", section: "A", sections: [], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
    ];
    expect(examGrades(makeExam({ gradePlans: plans }))).toEqual(["Grade 9", "Grade 10"]);
  });

  it("planForGrade finds the plan matching a normalized grade (ignoring 'Grade '/'Year ' prefix)", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 9", section: "A", sections: [], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
    ];
    const exam = makeExam({ gradePlans: plans });
    expect(planForGrade(exam, "9")?.grade).toBe("Grade 9");
    expect(planForGrade(exam, "Grade 9")?.grade).toBe("Grade 9");
    expect(planForGrade(exam, "Year 9")?.grade).toBe("Grade 9");
    expect(planForGrade(exam, "Grade 10")).toBeUndefined();
  });
});

describe("isForwardStatusTransition", () => {
  it("allows moving forward through the lifecycle", () => {
    expect(isForwardStatusTransition("Scheduled", "Ongoing")).toBe(true);
    expect(isForwardStatusTransition("Ongoing", "Completed")).toBe(true);
    expect(isForwardStatusTransition("Completed", "Published")).toBe(true);
  });

  it("allows staying on the same status", () => {
    expect(isForwardStatusTransition("Ongoing", "Ongoing")).toBe(true);
  });

  it("disallows moving backward", () => {
    expect(isForwardStatusTransition("Published", "Scheduled")).toBe(false);
    expect(isForwardStatusTransition("Completed", "Ongoing")).toBe(false);
  });

  it("treats an unrecognized status as always-forward (fail-open)", () => {
    expect(isForwardStatusTransition("Scheduled", "Bogus" as any)).toBe(true);
    expect(isForwardStatusTransition("Bogus" as any, "Scheduled")).toBe(true);
  });

  it("STATUS_ORDER is the canonical forward lifecycle", () => {
    expect(STATUS_ORDER).toEqual(["Scheduled", "Ongoing", "Completed", "Published"]);
  });
});

describe("normalizeSection", () => {
  it("lowercases and trims plain section letters", () => {
    expect(normalizeSection(" B ")).toBe("b");
  });

  it("strips a leading 'Section'/'Sec' prefix", () => {
    expect(normalizeSection("Section B")).toBe("b");
    expect(normalizeSection("Sec. B")).toBe("b");
    expect(normalizeSection("sec b")).toBe("b");
  });

  it("returns an empty string for empty/undefined input", () => {
    expect(normalizeSection("")).toBe("");
    expect(normalizeSection(undefined as unknown as string)).toBe("");
  });

  it("normalizes 'All Sections' to lowercase for equality checks", () => {
    expect(normalizeSection("All Sections")).toBe("all sections");
  });
});

describe("matchesSection", () => {
  it("matches when grade and section both align", () => {
    const exam = makeExam({ grade: "Grade 6", section: "A", sections: ["A"], gradePlans: [] });
    expect(matchesSection(exam, "Grade 6", "A")).toBe(true);
  });

  it("does not match a different grade", () => {
    const exam = makeExam({ grade: "Grade 6", section: "A", gradePlans: [] });
    expect(matchesSection(exam, "Grade 7", "A")).toBe(false);
  });

  it("does not match a different section when the plan is section-specific", () => {
    const exam = makeExam({ grade: "Grade 6", section: "A", gradePlans: [] });
    expect(matchesSection(exam, "Grade 6", "B")).toBe(false);
  });

  it("an 'All Sections' plan matches every section of its grade", () => {
    const exam = makeExam({ grade: "Grade 6", section: "All Sections", gradePlans: [] });
    expect(matchesSection(exam, "Grade 6", "A")).toBe(true);
    expect(matchesSection(exam, "Grade 6", "Z")).toBe(true);
  });

  it("an empty/undefined section argument matches regardless of the plan's section", () => {
    const exam = makeExam({ grade: "Grade 6", section: "A", gradePlans: [] });
    expect(matchesSection(exam, "Grade 6", "")).toBe(true);
  });

  it("matches across multiple grade plans (multi-grade exam)", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 6", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
      { grade: "Grade 7", section: "B", sections: ["B"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [] },
    ];
    const exam = makeExam({ gradePlans: plans });
    expect(matchesSection(exam, "Grade 7", "B")).toBe(true);
    expect(matchesSection(exam, "Grade 7", "A")).toBe(false);
  });
});

describe("seatNumber", () => {
  it("is deterministic for the same exam/student pair", () => {
    const a = seatNumber("EXM-1", "STU-1");
    const b = seatNumber("EXM-1", "STU-1");
    expect(a).toBe(b);
  });

  it("produces a row/column in the expected format and ranges", () => {
    const seat = seatNumber("EXM-1", "STU-1");
    expect(seat).toMatch(/^R[1-8]-\d{2}$/);
  });

  it("differs for different students on the same exam (not guaranteed unique, but typically differs)", () => {
    const a = seatNumber("EXM-1", "STU-1");
    const b = seatNumber("EXM-1", "STU-2");
    expect(a).not.toBe(b);
  });
});

describe("recordToDatesheet", () => {
  it("maps the relevant fields off an ExamRecord", () => {
    const exam = makeExam({ id: "EXM-5", name: "Finals", slots: [makeSlot()], published: true });
    const sheet = recordToDatesheet(exam);
    expect(sheet).toEqual({ id: "EXM-5", title: "Finals", slots: exam.slots, published: true });
  });
});

describe("summarizeSlots", () => {
  it("returns 'All Subjects' and empty dates for an empty slot list", () => {
    expect(summarizeSlots([])).toEqual({ startDate: "", endDate: "", subjects: "All Subjects" });
  });

  it("derives min/max date and singular subject count for one slot", () => {
    const result = summarizeSlots([makeSlot({ date: "2026-08-05" })]);
    expect(result).toEqual({ startDate: "2026-08-05", endDate: "2026-08-05", subjects: "1 Subject" });
  });

  it("derives sorted min/max date and pluralized subject count for multiple slots", () => {
    const slots = [
      makeSlot({ date: "2026-08-10" }),
      makeSlot({ date: "2026-08-01" }),
      makeSlot({ date: "2026-08-05" }),
    ];
    const result = summarizeSlots(slots);
    expect(result).toEqual({ startDate: "2026-08-01", endDate: "2026-08-10", subjects: "3 Subjects" });
  });

  it("filters out slots with a falsy/empty date before computing the range", () => {
    const slots = [makeSlot({ date: "" }), makeSlot({ date: "2026-08-05" })];
    const result = summarizeSlots(slots);
    expect(result.startDate).toBe("2026-08-05");
    expect(result.endDate).toBe("2026-08-05");
  });
});

describe("nextExamId", () => {
  it("uses the given prefix", () => {
    expect(nextExamId("ABC")).toMatch(/^ABC-\d{6}$/);
  });

  it("defaults to the 'EXM' prefix", () => {
    expect(nextExamId()).toMatch(/^EXM-\d{6}$/);
  });

  it("produces different ids on successive calls", () => {
    const a = nextExamId();
    const b = nextExamId();
    expect(a).not.toBe(b);
  });
});

describe("loadExamSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadExamSettings()).toEqual({
      gradingSystem: "cbse", passPercentage: "40", autoNotifyParents: true, showRankOnReportCards: true,
    });
  });

  it("merges stored partial settings over the defaults", () => {
    localStorage.setItem(EXAM_SETTINGS_LS_KEY, JSON.stringify({ passPercentage: "50" }));
    const settings = loadExamSettings();
    expect(settings.passPercentage).toBe("50");
    expect(settings.gradingSystem).toBe("cbse");
  });

  it("falls back to defaults on invalid JSON", () => {
    localStorage.setItem(EXAM_SETTINGS_LS_KEY, "{not json");
    expect(loadExamSettings()).toEqual({
      gradingSystem: "cbse", passPercentage: "40", autoNotifyParents: true, showRankOnReportCards: true,
    });
  });
});

describe("setGradePublished", () => {
  it("publishes only the targeted grade's plan, leaving other grades untouched", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 6", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [], publishedToStudents: false },
      { grade: "Grade 7", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [], publishedToStudents: false },
    ];
    addExam(makeExam({ id: "EXM-1", gradePlans: plans }));
    setGradePublished("EXM-1", "Grade 6", true);
    const [exam] = getExams();
    const g6 = exam.gradePlans.find(p => p.grade === "Grade 6");
    const g7 = exam.gradePlans.find(p => p.grade === "Grade 7");
    expect(g6?.publishedToStudents).toBe(true);
    expect(g7?.publishedToStudents).toBe(false);
  });

  it("does nothing when the exam id does not exist", () => {
    expect(() => setGradePublished("NOPE", "Grade 6", true)).not.toThrow();
    expect(getExams()).toEqual([]);
  });
});

describe("updateExam bulk publishedToStudents cascade", () => {
  // KNOWN BUG (documented in source comments at updateExam): a bare
  // `{ publishedToStudents: true }` patch is meant to apply to every grade
  // plan at once. The source works around a real prior bug by cascading the
  // value onto every grade plan unless the caller is already setting
  // gradePlans itself. This test documents the CURRENT (fixed) behavior:
  // all grade plans get the same publishedToStudents value cascaded in.
  it("cascades a bare publishedToStudents patch onto every grade plan", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 6", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [], publishedToStudents: false },
      { grade: "Grade 7", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [], publishedToStudents: false },
    ];
    addExam(makeExam({ id: "EXM-1", gradePlans: plans, publishedToStudents: false }));
    updateExam("EXM-1", { publishedToStudents: true });
    const [exam] = getExams();
    expect(exam.gradePlans.every(p => p.publishedToStudents === true)).toBe(true);
    expect(exam.publishedToStudents).toBe(true);
  });

  it("does not cascade when the caller is already setting gradePlans directly", () => {
    const plans: GradePlan[] = [
      { grade: "Grade 6", section: "A", sections: ["A"], subjects: "", startDate: "", endDate: "", appeared: 0, total: 0, slots: [], publishedToStudents: false },
    ];
    addExam(makeExam({ id: "EXM-1", gradePlans: plans, publishedToStudents: false }));
    const newPlans = plans.map(p => ({ ...p, publishedToStudents: true }));
    updateExam("EXM-1", { publishedToStudents: false, gradePlans: newPlans });
    const [exam] = getExams();
    // gradePlans patch wins as-is; the bare publishedToStudents in the same
    // patch is not cascaded over it because patch.gradePlans was set by the caller.
    expect(exam.gradePlans[0].publishedToStudents).toBe(true);
    expect(exam.publishedToStudents).toBe(false);
  });
});
