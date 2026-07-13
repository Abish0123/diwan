import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeAttempt, normalizeLegacySubmission, getAllAttempts } from "./assessmentAttempts";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";

describe("normalizeAttempt", () => {
  it("normalizes a fully-populated canonical row", () => {
    const result = normalizeAttempt({
      id: 1,
      assessmentId: "a1",
      studentId: "s1",
      status: "submitted",
      score: 85,
      submittedAt: "2026-07-10T00:00:00.000Z",
      isMarked: true,
    });
    expect(result).toMatchObject({
      id: "1",
      assessmentId: "a1",
      studentId: "s1",
      status: "submitted",
      score: 85,
      submittedAt: "2026-07-10T00:00:00.000Z",
      isMarked: true,
    });
  });

  it("coerces score to a number when it's a numeric string", () => {
    const result = normalizeAttempt({ id: "x", assessmentId: "a1", studentId: "s1", score: "72" });
    expect(result.score).toBe(72);
    expect(typeof result.score).toBe("number");
  });

  it("falls back to snake_case field names when camelCase absent", () => {
    const result = normalizeAttempt({ id: 1, assessment_id: "a2", student_id: "s2", score: null });
    expect(result.assessmentId).toBe("a2");
    expect(result.studentId).toBe("s2");
  });

  it("defaults id/assessmentId/studentId to empty string when missing", () => {
    const result = normalizeAttempt({});
    expect(result.id).toBe("");
    expect(result.assessmentId).toBe("");
    expect(result.studentId).toBe("");
  });

  it("treats null/undefined score as null (not marked) when isMarked absent", () => {
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1", score: null });
    expect(result.score).toBeNull();
    expect(result.isMarked).toBe(false);
  });

  it("derives isMarked true when score is present even if isMarked flag absent", () => {
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1", score: 0 });
    expect(result.score).toBe(0);
    expect(result.isMarked).toBe(true);
  });

  it("status is submitted when status field is 'submitted'", () => {
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1", status: "submitted" });
    expect(result.status).toBe("submitted");
  });

  it("status is submitted when submittedAt is truthy even if status field says otherwise", () => {
    const result = normalizeAttempt({
      id: 1,
      assessmentId: "a1",
      studentId: "s1",
      status: "in_progress",
      submittedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(result.status).toBe("submitted");
  });

  it("status defaults to in_progress when neither status nor submittedAt indicate submission", () => {
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1" });
    expect(result.status).toBe("in_progress");
  });

  it("respects an explicit isMarked:false even when score is present", () => {
    // isMarked uses `row.isMarked ?? row.is_marked ?? score != null`, so an explicit
    // false is honored via ?? (false is not null/undefined).
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1", score: 90, isMarked: false });
    expect(result.isMarked).toBe(false);
  });

  it("preserves extra fields via spread", () => {
    const result = normalizeAttempt({ id: 1, assessmentId: "a1", studentId: "s1", studentName: "Amina" });
    expect(result.studentName).toBe("Amina");
  });
});

describe("normalizeLegacySubmission", () => {
  it("normalizes a fully-populated legacy row", () => {
    const result = normalizeLegacySubmission({
      id: 5,
      assessment_id: "a1",
      student_id: "s1",
      marks_obtained: 60,
      is_marked: true,
      submitted_at: "2026-07-09T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      id: "5",
      assessmentId: "a1",
      studentId: "s1",
      score: 60,
      isMarked: true,
      submittedAt: "2026-07-09T00:00:00.000Z",
      status: "submitted",
      legacy: true,
    });
  });

  it("falls back to camelCase field names when snake_case absent", () => {
    const result = normalizeLegacySubmission({
      id: 1,
      assessmentId: "a2",
      studentId: "s2",
      marksObtained: 40,
      isMarked: true,
      submittedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(result.assessmentId).toBe("a2");
    expect(result.studentId).toBe("s2");
    expect(result.score).toBe(40);
  });

  it("marks status submitted when score is present even without is_marked/submitted flags", () => {
    const result = normalizeLegacySubmission({ id: 1, assessment_id: "a1", student_id: "s1", marks_obtained: 55 });
    expect(result.status).toBe("submitted");
    expect(result.isMarked).toBe(true);
  });

  it("marks status submitted when the 'submitted' flag is true, regardless of grading", () => {
    const result = normalizeLegacySubmission({
      id: 1,
      assessment_id: "a1",
      student_id: "s1",
      submitted: true,
    });
    expect(result.status).toBe("submitted");
    expect(result.isMarked).toBe(false);
    expect(result.score).toBeNull();
  });

  it("status is in_progress when neither graded nor submitted", () => {
    const result = normalizeLegacySubmission({ id: 1, assessment_id: "a1", student_id: "s1" });
    expect(result.status).toBe("in_progress");
    expect(result.score).toBeNull();
    expect(result.isMarked).toBe(false);
  });

  it("always sets legacy: true", () => {
    const result = normalizeLegacySubmission({ id: 1, assessment_id: "a1", student_id: "s1" });
    expect(result.legacy).toBe(true);
  });

  it("defaults id/assessmentId/studentId to empty string when missing", () => {
    const result = normalizeLegacySubmission({});
    expect(result.id).toBe("");
    expect(result.assessmentId).toBe("");
    expect(result.studentId).toBe("");
  });
});

describe("getAllAttempts", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
  });

  it("merges canonical and legacy rows when no overlap exists", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === "assessment_attempts") {
        return [{ id: 1, assessmentId: "a1", studentId: "s1", status: "submitted", score: 90 }];
      }
      if (table === "assessment_submissions") {
        return [{ id: 2, assessment_id: "a2", student_id: "s2", marks_obtained: 70 }];
      }
      return [];
    });

    const result = await getAllAttempts();
    expect(result).toHaveLength(2);
    const canonicalRow = result.find(r => r.assessmentId === "a1");
    expect(canonicalRow).toMatchObject({ studentId: "s1", score: 90 });
    expect(canonicalRow!.legacy).toBeUndefined();
    expect(result.find(r => r.assessmentId === "a2")).toMatchObject({ studentId: "s2", score: 70, legacy: true });
  });

  it("prefers the canonical row over a legacy row for the same student+assessment pair", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === "assessment_attempts") {
        return [{ id: 1, assessmentId: "a1", studentId: "s1", status: "submitted", score: 99 }];
      }
      if (table === "assessment_submissions") {
        return [{ id: 2, assessment_id: "a1", student_id: "s1", marks_obtained: 10 }];
      }
      return [];
    });

    const result = await getAllAttempts();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ score: 99 });
    expect(result[0].legacy).toBeUndefined();
  });

  it("returns an empty array when both tables are empty", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([]);
    const result = await getAllAttempts();
    expect(result).toEqual([]);
  });

  it("falls back to an empty array when a table read rejects", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === "assessment_attempts") throw new Error("db down");
      return [{ id: 1, assessment_id: "a1", student_id: "s1", marks_obtained: 5 }];
    });

    const result = await getAllAttempts();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assessmentId: "a1", legacy: true });
  });
});
