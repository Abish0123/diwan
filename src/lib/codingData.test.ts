import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import {
  CODING_TESTS,
  CODING_QUESTIONS,
  CODING_ATTEMPTS,
  QUESTION_BANKS,
  ASSESSMENT_ASSIGNMENTS,
  SEED_QUESTIONS,
  SEED_TESTS,
  EXAM_QUESTIONS,
  EXAM_TESTS,
  ensureCodingSeed,
  ensureExamSeed,
  getTests,
  getQuestions,
  getAttempts,
  getBanks,
  getAssignments,
  getEnrolledStudents,
  getRealClasses,
} from "./codingData";

describe("table name constants", () => {
  it("exposes the expected table names", () => {
    expect(CODING_TESTS).toBe("coding_tests");
    expect(CODING_QUESTIONS).toBe("coding_questions");
    expect(CODING_ATTEMPTS).toBe("coding_attempts");
    expect(QUESTION_BANKS).toBe("question_banks");
    expect(ASSESSMENT_ASSIGNMENTS).toBe("assessment_assignments");
  });
});

describe("simple getters", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.create).mockReset();
  });

  it("getTests reads from CODING_TESTS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "t1" }]);
    const result = await getTests();
    expect(smartDb.getAll).toHaveBeenCalledWith(CODING_TESTS);
    expect(result).toEqual([{ id: "t1" }]);
  });

  it("getQuestions reads from CODING_QUESTIONS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "q1" }]);
    const result = await getQuestions();
    expect(smartDb.getAll).toHaveBeenCalledWith(CODING_QUESTIONS);
    expect(result).toEqual([{ id: "q1" }]);
  });

  it("getAttempts reads from CODING_ATTEMPTS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "a1" }]);
    const result = await getAttempts();
    expect(smartDb.getAll).toHaveBeenCalledWith(CODING_ATTEMPTS);
    expect(result).toEqual([{ id: "a1" }]);
  });

  it("getBanks reads from QUESTION_BANKS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "b1" }]);
    const result = await getBanks();
    expect(smartDb.getAll).toHaveBeenCalledWith(QUESTION_BANKS);
    expect(result).toEqual([{ id: "b1" }]);
  });

  it("getAssignments reads from ASSESSMENT_ASSIGNMENTS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "as1" }]);
    const result = await getAssignments();
    expect(smartDb.getAll).toHaveBeenCalledWith(ASSESSMENT_ASSIGNMENTS);
    expect(result).toEqual([{ id: "as1" }]);
  });

  it("getEnrolledStudents reads from the students table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "s1" }]);
    const result = await getEnrolledStudents();
    expect(smartDb.getAll).toHaveBeenCalledWith("students");
    expect(result).toEqual([{ id: "s1" }]);
  });
});

describe("seed data shape", () => {
  it("SEED_QUESTIONS contains 3 well-formed questions with all 5 languages and starter code", () => {
    expect(SEED_QUESTIONS).toHaveLength(3);
    for (const q of SEED_QUESTIONS) {
      expect(q.languages).toEqual(["javascript", "python", "java", "cpp", "csharp"]);
      expect(q.starterCode.javascript).toContain(q.functionName);
      expect(q.starterCode.python).toContain(q.functionName);
      expect(q.testCases.length).toBeGreaterThan(0);
    }
  });

  it("SEED_TESTS reference question ids that exist in SEED_QUESTIONS", () => {
    const seedIds = new Set(SEED_QUESTIONS.map((q) => q.id));
    for (const t of SEED_TESTS) {
      for (const qid of t.questionIds) {
        expect(seedIds.has(qid)).toBe(true);
      }
    }
  });

  it("EXAM_TESTS reference question ids that all exist in EXAM_QUESTIONS", () => {
    const examIds = new Set(EXAM_QUESTIONS.map((q) => q.id));
    for (const t of EXAM_TESTS) {
      for (const qid of t.questionIds) {
        expect(examIds.has(qid)).toBe(true);
      }
    }
  });

  it("EXAM_QUESTIONS ids are all unique", () => {
    const ids = EXAM_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ensureCodingSeed", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
  });

  it("seeds both questions and tests when both tables are empty", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === CODING_TESTS) return [];
      if (table === CODING_QUESTIONS) return [];
      return [];
    });

    await ensureCodingSeed();

    const createdQuestionIds = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_QUESTIONS)
      .map((c) => c[2]);
    const createdTestIds = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_TESTS)
      .map((c) => c[2]);

    for (const q of SEED_QUESTIONS) expect(createdQuestionIds).toContain(q.id);
    for (const t of SEED_TESTS) expect(createdTestIds).toContain(t.id);
  });

  it("does not reseed questions when questions table already has data", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === CODING_QUESTIONS) return [{ id: "Q-SQUARE" }];
      if (table === CODING_TESTS) return [{ id: "TEST-PLACEMENT-1" }];
      return [];
    });

    await ensureCodingSeed();

    const seedQuestionCreates = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_QUESTIONS && SEED_QUESTIONS.some((q) => q.id === c[2]));
    const seedTestCreates = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_TESTS && SEED_TESTS.some((t) => t.id === c[2]));
    expect(seedQuestionCreates).toHaveLength(0);
    expect(seedTestCreates).toHaveLength(0);
  });

  it("swallows errors and logs instead of throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(smartDb.getAll).mockRejectedValue(new Error("db down"));

    await expect(ensureCodingSeed()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("Coding seed failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("always invokes exam-seed upsert logic even when core tables are already seeded", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === CODING_QUESTIONS) return [{ id: "Q-SQUARE" }];
      if (table === CODING_TESTS) return [{ id: "TEST-PLACEMENT-1" }];
      return [];
    });

    await ensureCodingSeed();

    const examQuestionCreates = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_QUESTIONS && EXAM_QUESTIONS.some((q) => q.id === c[2]));
    expect(examQuestionCreates.length).toBe(EXAM_QUESTIONS.length);
  });
});

describe("ensureExamSeed", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
  });

  it("upserts only exam questions/tests not already present", async () => {
    const firstExamQ = EXAM_QUESTIONS[0].id;
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === CODING_QUESTIONS) return [{ id: firstExamQ }];
      if (table === CODING_TESTS) return [];
      return [];
    });

    await ensureExamSeed();

    const createdIds = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_QUESTIONS)
      .map((c) => c[2]);
    expect(createdIds).not.toContain(firstExamQ);
    expect(createdIds).toContain(EXAM_QUESTIONS[1].id);
    expect(createdIds).toHaveLength(EXAM_QUESTIONS.length - 1);
  });

  it("creates nothing when every exam question/test id already exists", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === CODING_QUESTIONS) return EXAM_QUESTIONS.map((q) => ({ id: q.id }));
      if (table === CODING_TESTS) return EXAM_TESTS.map((t) => ({ id: t.id }));
      return [];
    });

    await ensureExamSeed();
    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("treats a null/undefined getAll result as an empty list (creates everything)", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue(undefined as never);

    await ensureExamSeed();

    const createdQuestionIds = vi
      .mocked(smartDb.create)
      .mock.calls.filter((c) => c[0] === CODING_QUESTIONS)
      .map((c) => c[2]);
    expect(createdQuestionIds).toHaveLength(EXAM_QUESTIONS.length);
  });

  it("swallows errors and logs instead of throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(smartDb.getAll).mockRejectedValue(new Error("db down"));

    await expect(ensureExamSeed()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("Exam seed failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("getRealClasses", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
  });

  it("groups students by normalized grade-section key and counts them", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([
      { grade: "Grade 5", section: "Section B" },
      { grade: "Grade 5", section: "Section B" },
      { grade: "Grade 5", section: "A" },
    ]);

    const result = await getRealClasses();
    expect(result).toEqual([
      { id: "5-A", grade: "5", section: "A", studentCount: 1 },
      { id: "5-B", grade: "5", section: "B", studentCount: 2 },
    ]);
  });

  it("skips students with missing grade or section", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([
      { grade: "Grade 5", section: "" },
      { grade: "", section: "Section B" },
      { grade: "Grade 6", section: "Section C" },
    ]);

    const result = await getRealClasses();
    expect(result).toEqual([{ id: "6-C", grade: "6", section: "C", studentCount: 1 }]);
  });

  it("returns an empty array when there are no enrolled students", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([]);
    const result = await getRealClasses();
    expect(result).toEqual([]);
  });

  it("sorts numerically by grade then alphabetically by section", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([
      { grade: "Grade 10", section: "Section A" },
      { grade: "Grade 2", section: "Section B" },
      { grade: "Grade 2", section: "Section A" },
    ]);

    const result = await getRealClasses();
    expect(result.map((c) => c.id)).toEqual(["2-A", "2-B", "10-A"]);
  });

  it("normalizes section case to uppercase regardless of input casing", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ grade: "Grade 3", section: "section b" }]);
    const result = await getRealClasses();
    expect(result[0].section).toBe("B");
  });
});
