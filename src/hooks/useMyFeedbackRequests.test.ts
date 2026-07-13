import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the external boundaries: smartDb (Appraisal cycles + FeedbackSubmission
// rows) and getRateableTeachersForStudent (the teacher-eligibility resolver).
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/feedbackEligibility", () => ({
  getRateableTeachersForStudent: vi.fn().mockResolvedValue([]),
}));

import { smartDb } from "@/lib/localDb";
import { getRateableTeachersForStudent } from "@/lib/feedbackEligibility";
import { useMyFeedbackRequests } from "./useMyFeedbackRequests";

const mockGetAll = smartDb.getAll as unknown as ReturnType<typeof vi.fn>;
const mockGetRateable = getRateableTeachersForStudent as unknown as ReturnType<typeof vi.fn>;

function setupDb(appraisalRows: any[], submissions: any[]) {
  mockGetAll.mockImplementation((entity: string) => {
    if (entity === "Appraisal") return Promise.resolve(appraisalRows);
    if (entity === "FeedbackSubmission") return Promise.resolve(submissions);
    return Promise.resolve([]);
  });
}

const activeCycle = { id: "cycle-2026", type: "cycle", startedAt: "2026-01-01T00:00:00Z" };
const olderCycle = { id: "cycle-2025", type: "cycle", startedAt: "2025-01-01T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockGetRateable.mockResolvedValue([]);
});

describe("useMyFeedbackRequests", () => {
  it("starts in a loading state and returns no targets before data loads", () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.targets).toEqual([]);
  });

  it("short-circuits (no loading, empty targets) when uid is missing", async () => {
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: undefined, studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("short-circuits when studentId is missing", async () => {
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: undefined, grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("short-circuits when grade is missing", async () => {
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: undefined, section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("returns no targets when there is no active appraisal cycle", async () => {
    setupDb([], []); // no cycle rows at all
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
  });

  it("ignores non-cycle Appraisal rows when picking the active cycle", async () => {
    setupDb([{ id: "scorecard-1", type: "scorecard", startedAt: "2026-05-01" }], []);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
  });

  it("picks the most-recently-started cycle when multiple cycles exist", async () => {
    setupDb([olderCycle, activeCycle], []);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0].cycleId).toBe(activeCycle.id);
  });

  it("builds pending targets from rateable teachers with a deterministic submissionId", async () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Mr. Iyer", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toHaveLength(2);
    expect(result.current.targets[0]).toMatchObject({
      teacherName: "Ms. Rao",
      templateKey: "student_class_teacher",
      cycleId: "cycle-2026",
      submissionId: "fbsub-student_class_teacher-ms-rao-cycle-2026-s1-u1",
    });
    expect(result.current.targets[1]).toMatchObject({
      teacherName: "Mr. Iyer",
      templateKey: "student_subject_teacher",
      subject: "Math",
      submissionId: "fbsub-student_subject_teacher-mr-iyer-cycle-2026-s1-u1",
    });
  });

  it("filters out teachers the student already submitted feedback for", async () => {
    setupDb([activeCycle], [
      { id: "fbsub-student_class_teacher-ms-rao-cycle-2026-s1-u1" },
    ]);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
      { teacherName: "Mr. Iyer", templateKey: "student_subject_teacher", subject: "Math" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0].teacherName).toBe("Mr. Iyer");
  });

  it("returns empty targets and stops loading when a data call throws", async () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([]);
  });

  it("passes role through to getRateableTeachersForStudent (parent vs student)", async () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockResolvedValue([]);
    renderHook(() =>
      useMyFeedbackRequests({ role: "parent", uid: "u1", studentId: "s1", grade: "Grade 6", section: "B" })
    );
    await waitFor(() => expect(mockGetRateable).toHaveBeenCalledWith("Grade 6", "B", "parent"));
  });

  it("re-fetches data when refresh() is called", async () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
    ]);
    const { result } = renderHook(() =>
      useMyFeedbackRequests({ role: "student", uid: "u1", studentId: "s1", grade: "Grade 6", section: "A" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toHaveLength(1);

    // Now the student submits feedback for that teacher; a refresh should
    // pick up the updated FeedbackSubmission rows.
    setupDb([activeCycle], [
      { id: "fbsub-student_class_teacher-ms-rao-cycle-2026-s1-u1" },
    ]);
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.targets).toHaveLength(0));
    expect(mockGetAll).toHaveBeenCalled();
  });

  it("clears targets and re-derives from scratch when required inputs change", async () => {
    setupDb([activeCycle], []);
    mockGetRateable.mockResolvedValue([
      { teacherName: "Ms. Rao", templateKey: "student_class_teacher" },
    ]);
    const { result, rerender } = renderHook(
      (props: { uid: string | undefined }) =>
        useMyFeedbackRequests({ role: "student", uid: props.uid, studentId: "s1", grade: "Grade 6", section: "A" }),
      { initialProps: { uid: "u1" } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toHaveLength(1);

    rerender({ uid: undefined });
    await waitFor(() => expect(result.current.targets).toEqual([]));
    expect(result.current.loading).toBe(false);
  });
});
