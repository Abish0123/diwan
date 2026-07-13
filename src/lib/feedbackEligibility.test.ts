import { describe, it, expect, vi } from "vitest";
import { rateableTeachersFrom, getRateableTeachersForStudent } from "./feedbackEligibility";
import { SubjectAssignment } from "@/repositories/SubjectAssignmentRepository";

function cls(grade: string, sectionOrName: { section?: string; name?: string }, teacher: string) {
  return { grade, teacher, ...sectionOrName };
}

function assignment(overrides: Partial<SubjectAssignment>): SubjectAssignment {
  return {
    id: overrides.id || "a1",
    grade: overrides.grade ?? "Grade 5",
    section: overrides.section ?? "B",
    subject: overrides.subject ?? "Math",
    teacherName: overrides.teacherName ?? "Mr. Smith",
    teacherEmail: overrides.teacherEmail,
  };
}

describe("rateableTeachersFrom", () => {
  it("returns empty array when grade is missing", () => {
    const result = rateableTeachersFrom(undefined, "B", "student", [], []);
    expect(result).toEqual([]);
  });

  it("returns empty array when grade is an empty string", () => {
    const result = rateableTeachersFrom("", "B", "student", [cls("Grade 5", { section: "B" }, "Ms. Rao")], []);
    expect(result).toEqual([]);
  });

  it("student audience: includes class teacher plus subject teachers", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [
      assignment({ teacherName: "Mr. Smith", subject: "Math" }),
      assignment({ id: "a2", teacherName: "Mrs. Jane", subject: "English" }),
    ];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, assignments);
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math" },
      { teacherName: "Mrs. Jane", templateKey: "student_subject_teacher", subject: "English" },
    ]);
  });

  it("student audience: dedupes a subject teacher who teaches multiple subjects into one entry with joined subjects", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [
      assignment({ id: "a1", teacherName: "Mr. Smith", subject: "Math" }),
      assignment({ id: "a2", teacherName: "Mr. Smith", subject: "Science" }),
    ];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, assignments);
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math, Science" },
    ]);
  });

  it("student audience: omits class teacher entry when class has no teacher assigned", () => {
    const classes = [cls("Grade 5", { section: "B" }, "")];
    const assignments = [assignment({ teacherName: "Mr. Smith", subject: "Math" })];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, assignments);
    expect(result).toEqual([
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("student audience: omits class teacher entry when no matching class exists", () => {
    const assignments = [assignment({ teacherName: "Mr. Smith", subject: "Math" })];
    const result = rateableTeachersFrom("Grade 5", "B", "student", [], assignments);
    expect(result).toEqual([
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("student audience: filters out assignments with no teacherName", () => {
    const assignments = [assignment({ teacherName: "" })];
    const result = rateableTeachersFrom("Grade 5", "B", "student", [], assignments);
    expect(result).toEqual([]);
  });

  it("student audience: excludes assignments for a different grade or section", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [
      assignment({ grade: "Grade 6", section: "B", teacherName: "Wrong Grade" }),
      assignment({ grade: "Grade 5", section: "A", teacherName: "Wrong Section" }),
      assignment({ grade: "Grade 5", section: "B", teacherName: "Right One", subject: "Math" }),
    ];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, assignments);
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Right One", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("student audience: does not merge a subject teacher who is also the class teacher into a duplicate subject-teacher row", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [assignment({ teacherName: "Ms. Rao", subject: "Math" })];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, assignments);
    // Class teacher entry appears once (student_class_teacher), and the
    // subject-teacher loop separately adds a student_subject_teacher entry
    // for the same person since dedup there only checks templateKey ===
    // "student_subject_teacher", not the class-teacher entry.
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Ms. Rao", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("parent audience: returns one generic parent_teacher template per teacher, class teacher first", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [
      assignment({ teacherName: "Mr. Smith", subject: "Math" }),
      assignment({ id: "a2", teacherName: "Mrs. Jane", subject: "English" }),
    ];
    const result = rateableTeachersFrom("Grade 5", "B", "parent", classes, assignments);
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "parent_teacher" },
      { teacherName: "Mr. Smith", templateKey: "parent_teacher", subject: "Math" },
      { teacherName: "Mrs. Jane", templateKey: "parent_teacher", subject: "English" },
    ]);
  });

  it("parent audience: skips a subject teacher who is the same person as the class teacher (dedup by lowercased name)", () => {
    const classes = [cls("Grade 5", { section: "B" }, "Ms. Rao")];
    const assignments = [assignment({ teacherName: "ms. rao", subject: "Math" })];
    const result = rateableTeachersFrom("Grade 5", "B", "parent", classes, assignments);
    expect(result).toEqual([{ teacherName: "Ms. Rao", templateKey: "parent_teacher" }]);
  });

  it("parent audience: joins multiple subjects for the same subject teacher into a single entry", () => {
    const assignments = [
      assignment({ id: "a1", teacherName: "Mr. Smith", subject: "Math" }),
      assignment({ id: "a2", teacherName: "Mr. Smith", subject: "Science" }),
    ];
    const result = rateableTeachersFrom("Grade 5", "B", "parent", [], assignments);
    expect(result).toEqual([
      { teacherName: "Mr. Smith", templateKey: "parent_teacher", subject: "Math, Science" },
    ]);
  });

  it("resolves class teacher via canonGrade/canonSection normalization ('grade 5' vs 'Grade 5', bare '5' vs '5')", () => {
    const classes = [cls("5", { section: "B" }, "Ms. Rao")];
    const result = rateableTeachersFrom("Grade 5", "SECTION B", "student", classes, []);
    expect(result).toEqual([{ teacherName: "Ms. Rao", templateKey: "student_class_teacher" }]);
  });

  it("resolves a Class row's section from its name field when the section field is blank", () => {
    const classes = [{ grade: "Grade 3", name: "Grade 3 Section A", teacher: "Mr. Lee" }];
    const result = rateableTeachersFrom("Grade 3", "A", "student", classes, []);
    expect(result).toEqual([{ teacherName: "Mr. Lee", templateKey: "student_class_teacher" }]);
  });

  it("matches on grade alone when section is undefined (canonSection('') === '')", () => {
    const classes = [cls("Grade 5", { section: "" }, "Ms. Rao")];
    const result = rateableTeachersFrom("Grade 5", undefined, "student", classes, []);
    expect(result).toEqual([{ teacherName: "Ms. Rao", templateKey: "student_class_teacher" }]);
  });

  it("trims whitespace around the class teacher's name", () => {
    const classes = [cls("Grade 5", { section: "B" }, "  Ms. Rao  ")];
    const result = rateableTeachersFrom("Grade 5", "B", "student", classes, []);
    expect(result).toEqual([{ teacherName: "Ms. Rao", templateKey: "student_class_teacher" }]);
  });

  it("handles an empty classes array and empty assignments array without throwing", () => {
    expect(rateableTeachersFrom("Grade 5", "B", "student", [], [])).toEqual([]);
    expect(rateableTeachersFrom("Grade 5", "B", "parent", [], [])).toEqual([]);
  });
});

vi.mock("./localDb", () => ({
  smartDb: { getAll: vi.fn() },
}));
vi.mock("@/repositories/SubjectAssignmentRepository", () => ({
  subjectAssignmentRepository: { getAll: vi.fn() },
}));

describe("getRateableTeachersForStudent", () => {
  it("fetches classes and assignments and delegates to the pure core function", async () => {
    const { smartDb } = await import("./localDb");
    const { subjectAssignmentRepository } = await import("@/repositories/SubjectAssignmentRepository");
    (smartDb.getAll as any).mockResolvedValue([cls("Grade 5", { section: "B" }, "Ms. Rao")]);
    (subjectAssignmentRepository.getAll as any).mockResolvedValue([
      assignment({ teacherName: "Mr. Smith", subject: "Math" }),
    ]);

    const result = await getRateableTeachersForStudent("Grade 5", "B", "student");

    expect(smartDb.getAll).toHaveBeenCalledWith("Class", undefined);
    expect(subjectAssignmentRepository.getAll).toHaveBeenCalled();
    expect(result).toEqual([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("defaults audience to 'student' when not provided", async () => {
    const { smartDb } = await import("./localDb");
    const { subjectAssignmentRepository } = await import("@/repositories/SubjectAssignmentRepository");
    (smartDb.getAll as any).mockResolvedValue([]);
    (subjectAssignmentRepository.getAll as any).mockResolvedValue([
      assignment({ teacherName: "Mr. Smith", subject: "Math" }),
    ]);

    const result = await getRateableTeachersForStudent("Grade 5", "B");
    expect(result).toEqual([
      { teacherName: "Mr. Smith", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
  });

  it("returns empty array when grade is undefined, without needing valid data", async () => {
    const { smartDb } = await import("./localDb");
    const { subjectAssignmentRepository } = await import("@/repositories/SubjectAssignmentRepository");
    (smartDb.getAll as any).mockResolvedValue([]);
    (subjectAssignmentRepository.getAll as any).mockResolvedValue([]);

    const result = await getRateableTeachersForStudent(undefined, "B", "parent");
    expect(result).toEqual([]);
  });
});
