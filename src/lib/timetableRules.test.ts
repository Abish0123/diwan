import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_TIMETABLE_RULES,
  loadTimetableRules,
  saveTimetableRules,
  getTeacherLimit,
  findAssignedTeacher,
  subjectsAssignedFor,
  subjectsAssignedForGrade,
  subjectsAssignedForGradeSections,
  isTeacherAssignedForSubject,
  subjectsAssignedToTeacher,
  isTeacherAssignedToSubject,
  SubjectAssignment,
} from "./timetableRules";

const getOneMock = vi.fn();
const createMock = vi.fn().mockResolvedValue({});
vi.mock("./localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => getOneMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

describe("loadTimetableRules", () => {
  beforeEach(() => {
    getOneMock.mockReset();
    createMock.mockClear();
  });

  it("returns the defaults merged with the stored row when a row exists", async () => {
    getOneMock.mockResolvedValueOnce({ Teacher: 8 });
    const rules = await loadTimetableRules();
    expect(rules).toEqual({ ...DEFAULT_TIMETABLE_RULES, Teacher: 8 });
    expect(getOneMock).toHaveBeenCalledWith("TimetableRules", "global");
  });

  it("returns a copy of the defaults when no row is stored", async () => {
    getOneMock.mockResolvedValueOnce(undefined);
    const rules = await loadTimetableRules();
    expect(rules).toEqual(DEFAULT_TIMETABLE_RULES);
    expect(rules).not.toBe(DEFAULT_TIMETABLE_RULES);
  });

  it("falls back to the defaults when the underlying store throws", async () => {
    getOneMock.mockRejectedValueOnce(new Error("db down"));
    const rules = await loadTimetableRules();
    expect(rules).toEqual(DEFAULT_TIMETABLE_RULES);
  });
});

describe("saveTimetableRules", () => {
  beforeEach(() => createMock.mockClear());

  it("persists the rules under the 'global' id", async () => {
    const rules = { ...DEFAULT_TIMETABLE_RULES, Teacher: 9 };
    await saveTimetableRules(rules);
    expect(createMock).toHaveBeenCalledWith("TimetableRules", rules, "global");
  });
});

describe("getTeacherLimit", () => {
  it("returns the Teacher limit for an empty/falsy role", () => {
    expect(getTeacherLimit("")).toBe(DEFAULT_TIMETABLE_RULES["Teacher"]);
  });

  it("returns the Principal limit for 'Principal'", () => {
    expect(getTeacherLimit("Principal")).toBe(DEFAULT_TIMETABLE_RULES["Principal"]);
  });

  it("returns the Principal limit for 'Vice Principal'", () => {
    expect(getTeacherLimit("Vice Principal")).toBe(DEFAULT_TIMETABLE_RULES["Principal"]);
  });

  it("returns the Grade Coordinator limit", () => {
    expect(getTeacherLimit("Grade Coordinator")).toBe(DEFAULT_TIMETABLE_RULES["Grade Coordinator"]);
  });

  it("returns the HOD limit for any role starting with 'HOD'", () => {
    expect(getTeacherLimit("HOD")).toBe(DEFAULT_TIMETABLE_RULES["HOD"]);
    expect(getTeacherLimit("HOD - Science")).toBe(DEFAULT_TIMETABLE_RULES["HOD"]);
  });

  it("returns the Class Teacher limit", () => {
    expect(getTeacherLimit("Class Teacher")).toBe(DEFAULT_TIMETABLE_RULES["Class Teacher"]);
  });

  it("falls back to the Teacher limit for an unrecognized role", () => {
    expect(getTeacherLimit("Lab Assistant")).toBe(DEFAULT_TIMETABLE_RULES["Teacher"]);
  });

  it("trims whitespace before matching the role", () => {
    expect(getTeacherLimit("  Principal  ")).toBe(DEFAULT_TIMETABLE_RULES["Principal"]);
  });

  it("uses custom rules when provided instead of the defaults", () => {
    const customRules = { ...DEFAULT_TIMETABLE_RULES, Teacher: 2, Principal: 1 };
    expect(getTeacherLimit("Teacher", customRules)).toBe(2);
    expect(getTeacherLimit("Principal", customRules)).toBe(1);
  });

  it("uses the custom rules' HOD value for HOD-prefixed roles", () => {
    const customRules = { ...DEFAULT_TIMETABLE_RULES, HOD: 7 };
    expect(getTeacherLimit("HOD - Math", customRules)).toBe(7);
  });
});

const assignments: SubjectAssignment[] = [
  { grade: "Grade 5", section: "A", subject: "Math", teacherName: "Ms. Rao" },
  { grade: "Grade 5", section: "A", subject: "Science", teacherName: "Mr. Khan" },
  { grade: "Grade 5", section: "B", subject: "Math", teacherName: "Mr. Khan" },
  { grade: "Grade 6", section: "A", subject: "Math", teacherName: "Ms. Rao" },
];

describe("findAssignedTeacher", () => {
  it("finds the teacher assigned to a subject for a grade+section", () => {
    expect(findAssignedTeacher(assignments, "Grade 5", "A", "Math")).toBe("Ms. Rao");
  });

  it("is case-insensitive for grade and subject, and case/whitespace-insensitive for section", () => {
    expect(findAssignedTeacher(assignments, "grade 5", " a ", "math")).toBe("Ms. Rao");
  });

  it("returns null when there is no match", () => {
    expect(findAssignedTeacher(assignments, "Grade 5", "C", "Math")).toBeNull();
  });

  it("returns null for an empty assignments array", () => {
    expect(findAssignedTeacher([], "Grade 5", "A", "Math")).toBeNull();
  });
});

describe("subjectsAssignedFor", () => {
  it("returns the unique subjects assigned for a grade+section", () => {
    expect(subjectsAssignedFor(assignments, "Grade 5", "A").sort()).toEqual(["Math", "Science"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(subjectsAssignedFor(assignments, "Grade 9", "A")).toEqual([]);
  });

  it("does not include entries with an empty subject", () => {
    const withEmpty: SubjectAssignment[] = [
      { grade: "Grade 5", section: "A", subject: "", teacherName: "X" },
    ];
    expect(subjectsAssignedFor(withEmpty, "Grade 5", "A")).toEqual([]);
  });
});

describe("subjectsAssignedForGrade", () => {
  it("returns the union of subjects across all sections of the grade, sorted", () => {
    expect(subjectsAssignedForGrade(assignments, "Grade 5")).toEqual(["Math", "Science"]);
  });

  it("returns an empty array for a grade with no assignments", () => {
    expect(subjectsAssignedForGrade(assignments, "Grade 12")).toEqual([]);
  });
});

describe("subjectsAssignedForGradeSections", () => {
  it("falls back to the grade-wide union when sections is empty", () => {
    expect(subjectsAssignedForGradeSections(assignments, "Grade 5", [])).toEqual(["Math", "Science"]);
  });

  it("restricts to the union across only the given sections", () => {
    expect(subjectsAssignedForGradeSections(assignments, "Grade 5", ["A"])).toEqual(["Math", "Science"]);
    expect(subjectsAssignedForGradeSections(assignments, "Grade 5", ["B"])).toEqual(["Math"]);
  });

  it("returns an empty array when none of the given sections match", () => {
    expect(subjectsAssignedForGradeSections(assignments, "Grade 5", ["Z"])).toEqual([]);
  });
});

describe("isTeacherAssignedForSubject", () => {
  it("returns true when the teacher teaches the subject in any of the given sections", () => {
    expect(isTeacherAssignedForSubject(assignments, "Mr. Khan", "Grade 5", "Math", ["B"])).toBe(true);
  });

  it("returns false when the teacher does not teach that subject in the given sections", () => {
    expect(isTeacherAssignedForSubject(assignments, "Mr. Khan", "Grade 5", "Math", ["A"])).toBe(false);
  });

  it("checks across all sections of the grade when sections is empty", () => {
    expect(isTeacherAssignedForSubject(assignments, "Mr. Khan", "Grade 5", "Math", [])).toBe(true);
  });

  it("returns false for an empty/falsy teacherName", () => {
    expect(isTeacherAssignedForSubject(assignments, "", "Grade 5", "Math", [])).toBe(false);
  });

  it("returns false for an empty/falsy subject", () => {
    expect(isTeacherAssignedForSubject(assignments, "Ms. Rao", "Grade 5", "", [])).toBe(false);
  });

  it("is case-insensitive on teacherName, grade and subject", () => {
    expect(isTeacherAssignedForSubject(assignments, "ms. rao", "grade 5", "math", ["a"])).toBe(true);
  });
});

describe("subjectsAssignedToTeacher", () => {
  it("returns the unique subjects a teacher teaches for a grade+section", () => {
    expect(subjectsAssignedToTeacher(assignments, "Ms. Rao", "Grade 5", "A")).toEqual(["Math"]);
  });

  it("returns an empty array when the teacher has no assignments there", () => {
    expect(subjectsAssignedToTeacher(assignments, "Ms. Rao", "Grade 5", "B")).toEqual([]);
  });
});

describe("isTeacherAssignedToSubject", () => {
  it("returns true for an exact grade+section+subject+teacher match", () => {
    expect(isTeacherAssignedToSubject(assignments, "Ms. Rao", "Grade 5", "A", "Math")).toBe(true);
  });

  it("returns false when the teacher is assigned to that subject in a different section", () => {
    expect(isTeacherAssignedToSubject(assignments, "Mr. Khan", "Grade 5", "A", "Math")).toBe(false);
  });

  it("returns false when there is no assignment at all", () => {
    expect(isTeacherAssignedToSubject(assignments, "Nobody", "Grade 5", "A", "Math")).toBe(false);
  });
});
