import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/pushNotifications", () => ({
  pushNotify: vi.fn(),
}));

import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";
import {
  submissionKey,
  getSubmission,
  getAllSubmissions,
  getPrincipalName,
  submitToClassTeacher,
  classTeacherApprove,
  classTeacherReturn,
  gradeCoordinatorApprove,
  principalApprove,
  overrideKey,
  getOverridesFor,
  saveMarkOverride,
  GradebookSubmission,
} from "./gradebookApproval";

const mockGetOne = smartDb.getOne as unknown as ReturnType<typeof vi.fn>;
const mockGetAll = smartDb.getAll as unknown as ReturnType<typeof vi.fn>;
const mockCreate = smartDb.create as unknown as ReturnType<typeof vi.fn>;
const mockPushNotify = pushNotify as unknown as ReturnType<typeof vi.fn>;

function baseSub(overrides: Partial<GradebookSubmission> = {}): GradebookSubmission {
  return {
    id: submissionKey("Grade 5", "B", "Math", "Term 1"),
    grade: "Grade 5",
    section: "B",
    subject: "Math",
    term: "Term 1",
    status: "Submitted to Class Teacher",
    subjectTeacherName: "Mr. Ali",
    history: [{ at: "2026-01-01T00:00:00.000Z", by: "Mr. Ali", action: "Submitted to Class Teacher" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submissionKey", () => {
  it("joins grade/section/subject/term with pipes", () => {
    expect(submissionKey("Grade 5", "B", "Math", "Term 1")).toBe("Grade 5|B|Math|Term 1");
  });
});

describe("overrideKey", () => {
  it("joins studentId/subject/columnKey/term with pipes", () => {
    expect(overrideKey("stu-1", "Math", "quiz1", "Term 1")).toBe("stu-1|Math|quiz1|Term 1");
  });
});

describe("getSubmission", () => {
  it("returns the row from smartDb.getOne when found", async () => {
    const sub = baseSub();
    mockGetOne.mockResolvedValue(sub);
    const result = await getSubmission("Grade 5", "B", "Math", "Term 1");
    expect(mockGetOne).toHaveBeenCalledWith("GradebookSubmission", "Grade 5|B|Math|Term 1");
    expect(result).toEqual(sub);
  });

  it("returns null when smartDb.getOne resolves falsy", async () => {
    mockGetOne.mockResolvedValue(undefined);
    const result = await getSubmission("Grade 5", "B", "Math", "Term 1");
    expect(result).toBeNull();
  });
});

describe("getAllSubmissions", () => {
  it("returns the rows array when present", async () => {
    const rows = [baseSub()];
    mockGetAll.mockResolvedValue(rows);
    const result = await getAllSubmissions();
    expect(mockGetAll).toHaveBeenCalledWith("GradebookSubmission", undefined);
    expect(result).toEqual(rows);
  });

  it("returns an empty array when smartDb.getAll resolves falsy", async () => {
    mockGetAll.mockResolvedValue(null);
    const result = await getAllSubmissions();
    expect(result).toEqual([]);
  });
});

describe("getPrincipalName", () => {
  it("returns the name of the user with role 'principal'", async () => {
    mockGetAll.mockResolvedValue([
      { role: "teacher", name: "Ms. Rao" },
      { role: "principal", name: "Dr. Khan" },
    ]);
    const result = await getPrincipalName();
    expect(result).toBe("Dr. Khan");
  });

  it("falls back to displayName when name is absent", async () => {
    mockGetAll.mockResolvedValue([{ role: "principal", displayName: "Dr. Khan Display" }]);
    const result = await getPrincipalName();
    expect(result).toBe("Dr. Khan Display");
  });

  it("returns an empty string when no principal exists", async () => {
    mockGetAll.mockResolvedValue([{ role: "teacher", name: "Ms. Rao" }]);
    const result = await getPrincipalName();
    expect(result).toBe("");
  });

  it("returns an empty string when smartDb.getAll resolves falsy", async () => {
    mockGetAll.mockResolvedValue(null);
    const result = await getPrincipalName();
    expect(result).toBe("");
  });
});

describe("submitToClassTeacher", () => {
  it("creates a new submission with status Submitted to Class Teacher and a fresh history entry", async () => {
    mockGetOne.mockResolvedValue(undefined);
    const result = await submitToClassTeacher({
      grade: "Grade 5", section: "B", subject: "Math", term: "Term 1",
      subjectTeacherName: "Mr. Ali", classTeacherName: "Ms. Rao",
    });

    expect(result.status).toBe("Submitted to Class Teacher");
    expect(result.id).toBe("Grade 5|B|Math|Term 1");
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({ by: "Mr. Ali", action: "Submitted to Class Teacher" });
    expect(result.createdAt).toBeTruthy();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [entity, data, id] = mockCreate.mock.calls[0];
    expect(entity).toBe("GradebookSubmission");
    expect(id).toBe("Grade 5|B|Math|Term 1");
    expect(data.status).toBe("Submitted to Class Teacher");

    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceRole: "staff",
        recipientName: "Ms. Rao",
        category: "gradebook",
        entity: "GradebookSubmission",
      })
    );
  });

  it("preserves existing history and gradeCoordinatorName and createdAt when re-submitting after a return", async () => {
    const existing = baseSub({
      status: "Returned to Subject Teacher",
      gradeCoordinatorName: "Ms. Coord",
      createdAt: "2025-12-01T00:00:00.000Z",
      history: [{ at: "2025-12-01T00:00:00.000Z", by: "Mr. Ali", action: "Submitted to Class Teacher" }],
    });
    mockGetOne.mockResolvedValue(existing);

    const result = await submitToClassTeacher({
      grade: "Grade 5", section: "B", subject: "Math", term: "Term 1",
      subjectTeacherName: "Mr. Ali", classTeacherName: "Ms. Rao",
    });

    expect(result.status).toBe("Submitted to Class Teacher");
    expect(result.gradeCoordinatorName).toBe("Ms. Coord");
    expect(result.createdAt).toBe("2025-12-01T00:00:00.000Z");
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toEqual(existing.history[0]);
    expect(result.history[1]).toMatchObject({ by: "Mr. Ali", action: "Submitted to Class Teacher" });
  });
});

describe("classTeacherApprove", () => {
  it("advances status to Submitted to Grade Coordinator and appends a history entry", async () => {
    const sub = baseSub();
    const result = await classTeacherApprove(sub, "Ms. Rao", "Ms. Coord");

    expect(result.status).toBe("Submitted to Grade Coordinator");
    expect(result.classTeacherName).toBe("Ms. Rao");
    expect(result.gradeCoordinatorName).toBe("Ms. Coord");
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toMatchObject({ by: "Ms. Rao", action: "Approved and escalated to Grade Coordinator" });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("notifies both the grade coordinator and the original subject teacher", async () => {
    const sub = baseSub();
    await classTeacherApprove(sub, "Ms. Rao", "Ms. Coord");

    expect(mockPushNotify).toHaveBeenCalledTimes(2);
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ recipientName: "Ms. Coord", title: "Gradebook Awaiting Final Approval" })
    );
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recipientName: "Mr. Ali", title: "Marks Approved by Class Teacher" })
    );
  });

  it("does not mutate the input submission (pure function)", async () => {
    const sub = baseSub();
    const snapshot = JSON.parse(JSON.stringify(sub));
    await classTeacherApprove(sub, "Ms. Rao", "Ms. Coord");
    expect(sub).toEqual(snapshot);
  });
});

describe("classTeacherReturn", () => {
  it("sets status to Returned to Subject Teacher with the return reason recorded", async () => {
    const sub = baseSub();
    const result = await classTeacherReturn(sub, "Ms. Rao", "Missing quiz 2 marks");

    expect(result.status).toBe("Returned to Subject Teacher");
    expect(result.returnReason).toBe("Missing quiz 2 marks");
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toMatchObject({
      by: "Ms. Rao",
      action: "Returned to Subject Teacher",
      note: "Missing quiz 2 marks",
    });
  });

  it("notifies only the subject teacher, including the reason in the message", async () => {
    const sub = baseSub();
    await classTeacherReturn(sub, "Ms. Rao", "Missing quiz 2 marks");

    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: "Mr. Ali",
        title: "Gradebook Returned for Corrections",
        message: expect.stringContaining("Missing quiz 2 marks"),
      })
    );
  });
});

describe("gradeCoordinatorApprove", () => {
  it("advances status to Submitted to Principal and appends a history entry", async () => {
    const sub = baseSub({ status: "Submitted to Grade Coordinator" });
    const result = await gradeCoordinatorApprove(sub, "Ms. Coord", "Dr. Khan");

    expect(result.status).toBe("Submitted to Principal");
    expect(result.gradeCoordinatorName).toBe("Ms. Coord");
    expect(result.principalName).toBe("Dr. Khan");
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toMatchObject({ by: "Ms. Coord", action: "Approved and escalated to Principal" });
  });

  it("notifies both the principal and the original subject teacher", async () => {
    const sub = baseSub({ status: "Submitted to Grade Coordinator" });
    await gradeCoordinatorApprove(sub, "Ms. Coord", "Dr. Khan");

    expect(mockPushNotify).toHaveBeenCalledTimes(2);
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ recipientName: "Dr. Khan", title: "Gradebook Awaiting Final Approval" })
    );
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recipientName: "Mr. Ali", title: "Marks Approved by Grade Coordinator" })
    );
  });
});

describe("principalApprove", () => {
  it("sets status to Approved by Principal and appends a final-approval history entry", async () => {
    const sub = baseSub({
      status: "Submitted to Principal",
      classTeacherName: "Ms. Rao",
      gradeCoordinatorName: "Ms. Coord",
    });
    const result = await principalApprove(sub, "Dr. Khan");

    expect(result.status).toBe("Approved by Principal");
    expect(result.principalName).toBe("Dr. Khan");
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toMatchObject({ by: "Dr. Khan", action: "Final approval" });
  });

  it("notifies every distinct participant in the chain (subject teacher, class teacher, grade coordinator)", async () => {
    const sub = baseSub({
      status: "Submitted to Principal",
      classTeacherName: "Ms. Rao",
      gradeCoordinatorName: "Ms. Coord",
    });
    await principalApprove(sub, "Dr. Khan");

    expect(mockPushNotify).toHaveBeenCalledTimes(3);
    const recipients = mockPushNotify.mock.calls.map((call) => call[0].recipientName);
    expect(recipients).toEqual(["Mr. Ali", "Ms. Rao", "Ms. Coord"]);
  });

  it("skips notifying participants who were never assigned (falsy names filtered out)", async () => {
    const sub = baseSub({ status: "Submitted to Principal", classTeacherName: undefined, gradeCoordinatorName: undefined });
    await principalApprove(sub, "Dr. Khan");

    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(expect.objectContaining({ recipientName: "Mr. Ali" }));
  });
});

describe("getOverridesFor", () => {
  const overrides = [
    { id: "1", studentId: "s1", studentName: "A", grade: "Grade 5", section: "B", subject: "Math", term: "Term 1", columnKey: "q1", columnLabel: "Quiz 1", originalValue: 70, overrideValue: 80, reason: "recount", overriddenBy: "Mr. Ali" },
    { id: "2", studentId: "s2", studentName: "B", grade: "Grade 5", section: "A", subject: "Math", term: "Term 1", columnKey: "q1", columnLabel: "Quiz 1", originalValue: 60, overrideValue: 65, reason: "recount", overriddenBy: "Mr. Ali" },
    { id: "3", studentId: "s3", studentName: "C", grade: "Grade 6", section: "B", subject: "Math", term: "Term 1", columnKey: "q1", columnLabel: "Quiz 1", originalValue: 90, overrideValue: 90, reason: "recount", overriddenBy: "Mr. Ali" },
  ];

  it("filters overrides down to the exact grade/section/subject/term match", async () => {
    mockGetAll.mockResolvedValue(overrides);
    const result = await getOverridesFor("Grade 5", "B", "Math", "Term 1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns an empty array when nothing matches", async () => {
    mockGetAll.mockResolvedValue(overrides);
    const result = await getOverridesFor("Grade 9", "Z", "History", "Term 3");
    expect(result).toEqual([]);
  });

  it("returns an empty array when smartDb.getAll resolves falsy", async () => {
    mockGetAll.mockResolvedValue(null);
    const result = await getOverridesFor("Grade 5", "B", "Math", "Term 1");
    expect(result).toEqual([]);
  });
});

describe("saveMarkOverride", () => {
  it("persists the override via smartDb.create using its id and stamps createdAt", async () => {
    const override = {
      id: overrideKey("s1", "Math", "q1", "Term 1"),
      studentId: "s1", studentName: "A", grade: "Grade 5", section: "B", subject: "Math", term: "Term 1",
      columnKey: "q1", columnLabel: "Quiz 1", originalValue: 70, overrideValue: 85,
      reason: "re-marked", overriddenBy: "Mr. Ali",
    };
    await saveMarkOverride(override);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [entity, data, id] = mockCreate.mock.calls[0];
    expect(entity).toBe("MarkOverride");
    expect(id).toBe(override.id);
    expect(data.overrideValue).toBe(85);
    expect(data.createdAt).toBeTruthy();
  });
});
