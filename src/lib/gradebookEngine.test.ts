import { describe, it, expect } from "vitest";
import { letterFromPct, categorySource, computeStudentGradebook, discoverSubjects, type GradebookSources, type GradebookStudent } from "./gradebookEngine";
import type { GradebookBand } from "./curriculumConfig";

describe("letterFromPct", () => {
  it("maps percentage bands to letter grades", () => {
    expect(letterFromPct(95)).toBe("A+");
    expect(letterFromPct(90)).toBe("A+");
    expect(letterFromPct(85)).toBe("A");
    expect(letterFromPct(75)).toBe("B+");
    expect(letterFromPct(65)).toBe("B");
    expect(letterFromPct(55)).toBe("C");
    expect(letterFromPct(45)).toBe("D");
    expect(letterFromPct(10)).toBe("F");
  });
});

describe("categorySource", () => {
  it("routes exam-flagged categories to 'exam' regardless of name", () => {
    expect(categorySource({ name: "Mid-Term", count: 1, marks: 20, isExam: true })).toBe("exam");
  });

  it("infers 'assignment' from a homework/assignment-shaped name", () => {
    expect(categorySource({ name: "Assignments", count: null, marks: 20, isExam: false })).toBe("assignment");
    expect(categorySource({ name: "Homework", count: null, marks: 20, isExam: false })).toBe("assignment");
  });

  it("infers 'assessment' from a quiz/test-shaped name", () => {
    expect(categorySource({ name: "Class Test", count: null, marks: 20, isExam: false })).toBe("assessment");
    expect(categorySource({ name: "Weekly Quiz", count: null, marks: 20, isExam: false })).toBe("assessment");
  });

  it("falls back to 'pending' for categories with no automated feed", () => {
    expect(categorySource({ name: "Participation", count: null, marks: 10, isExam: false })).toBe("pending");
    expect(categorySource({ name: "Projects", count: null, marks: 10, isExam: false })).toBe("pending");
  });
});

const STUDENT: GradebookStudent = { id: "s1", name: "Amina", grade: "Grade 5", section: "A" };

const BAND: GradebookBand = {
  label: "Test Band",
  grades: ["5"],
  totalMarks: 100,
  categories: [
    { name: "Assignments", count: null, marks: 40, isExam: false },
    { name: "Assessments", count: null, marks: 60, isExam: false },
  ],
};

function emptySources(): GradebookSources {
  return { assignments: [], submissions: [], assessments: [], attempts: [], exams: [], examMarks: {} };
}

describe("computeStudentGradebook", () => {
  it("reports no data at all for a subject with zero real records", () => {
    const gb = computeStudentGradebook(STUDENT, BAND, emptySources(), ["Mathematics"]);
    expect(gb.overallPercentage).toBe(0);
    expect(gb.overallLetter).toBe("—");
    const math = gb.subjects.find(s => s.subject === "Mathematics")!;
    expect(math.hasData).toBe(false);
  });

  it("computes a weighted percentage from real assignment + assessment marks", () => {
    const src = emptySources();
    src.assignments = [{ id: "a1", subject: "Mathematics", grade: "Grade 5", section: "A", totalMarks: 100 }];
    src.submissions = [{ assignmentId: "a1", studentId: "s1", marks: 80, status: "graded" }];
    src.assessments = [{ id: "q1", subject: "Mathematics", grade: "Grade 5", section: "A", totalMarks: 100 }];
    src.attempts = [{ assessmentId: "q1", studentId: "s1", score: 60, status: "submitted" }];

    const gb = computeStudentGradebook(STUDENT, BAND, src, ["Mathematics"]);
    const math = gb.subjects.find(s => s.subject === "Mathematics")!;
    expect(math.hasData).toBe(true);
    // Assignments: 80% of 40 marks = 32. Assessments: 60% of 60 marks = 36. Total 68/100.
    expect(math.percentage).toBeCloseTo(68, 5);
    expect(math.letter).toBe("B");
    expect(gb.overallPercentage).toBeCloseTo(68, 5);
  });

  it("normalizes by present weight when only one of two components has data", () => {
    const src = emptySources();
    src.assignments = [{ id: "a1", subject: "Mathematics", grade: "Grade 5", section: "A", totalMarks: 100 }];
    src.submissions = [{ assignmentId: "a1", studentId: "s1", marks: 90, status: "graded" }];
    // No assessment data at all — only the 40-mark Assignments component has data.

    const gb = computeStudentGradebook(STUDENT, BAND, src, ["Mathematics"]);
    const math = gb.subjects.find(s => s.subject === "Mathematics")!;
    // presentWeight = 40, obtainedWeighted = 36 (90% of 40) -> 36/40 * 100 = 90%
    expect(math.percentage).toBeCloseTo(90, 5);
  });

  it("ignores another student's marks in the same subject", () => {
    const src = emptySources();
    src.assignments = [{ id: "a1", subject: "Mathematics", grade: "Grade 5", section: "A", totalMarks: 100 }];
    src.submissions = [{ assignmentId: "a1", studentId: "someone-else", marks: 100, status: "graded" }];

    const gb = computeStudentGradebook(STUDENT, BAND, src, ["Mathematics"]);
    const math = gb.subjects.find(s => s.subject === "Mathematics")!;
    expect(math.hasData).toBe(false);
  });

  it("ignores an assignment scoped to a different grade/section", () => {
    const src = emptySources();
    src.assignments = [{ id: "a1", subject: "Mathematics", grade: "Grade 6", section: "A", totalMarks: 100 }];
    src.submissions = [{ assignmentId: "a1", studentId: "s1", marks: 100, status: "graded" }];

    const gb = computeStudentGradebook(STUDENT, BAND, src, ["Mathematics"]);
    const math = gb.subjects.find(s => s.subject === "Mathematics")!;
    expect(math.hasData).toBe(false);
  });
});

describe("discoverSubjects", () => {
  it("finds subjects from assignments and assessments scoped to the student's class", () => {
    const src = emptySources();
    src.assignments = [{ subject: "English", grade: "Grade 5", section: "A" }];
    src.assessments = [{ subject: "Science", grade: "Grade 5", section: "A" }];
    // Wrong section — should not appear.
    src.assignments.push({ subject: "History", grade: "Grade 5", section: "B" });

    expect(discoverSubjects(STUDENT, src)).toEqual(["English", "Science"]);
  });
});
