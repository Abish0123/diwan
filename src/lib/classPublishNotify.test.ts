import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifyClassPublish,
  notifyClassTeacherEvent,
  notifyParentsOfStudents,
  publishDueScheduledAssessments,
} from "./classPublishNotify";

const emitMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notificationBus", () => ({
  emitNotification: (...args: unknown[]) => emitMock(...args),
}));

const updateMock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/localDb", () => ({
  smartDb: { update: (...args: unknown[]) => updateMock(...args) },
}));

const getAllMock = vi.fn().mockResolvedValue([]);
vi.mock("@/repositories/StudentRepository", () => ({
  studentRepository: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const fetchMock = vi.fn();
(global as any).fetch = fetchMock;

function student(overrides: Partial<{ id: string; uid: string; name: string; email: string; grade: string; section: string }> = {}) {
  return {
    id: "S1",
    name: "Ali",
    email: "ali@school.com",
    grade: "Grade 5",
    section: "B",
    ...overrides,
  };
}

function okJson(rows: unknown[]) {
  return { ok: true, json: async () => rows };
}

describe("notifyClassPublish", () => {
  beforeEach(() => {
    emitMock.mockClear();
    getAllMock.mockClear().mockResolvedValue([]);
    fetchMock.mockReset().mockResolvedValue(okJson([]));
  });

  it("notifies matched student + parent, class teacher, and all leadership roles", async () => {
    getAllMock.mockResolvedValue([student()]);
    fetchMock.mockResolvedValue(okJson([{ name: "Mr. Khan", email: "khan@school.com" }]));

    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "assignment_published",
      title: "New HW", message: "Chapter 3 posted", sourceId: "A1",
    });

    // 1 student + 1 parent + 1 class teacher + 3 leadership roles = 6
    expect(emitMock).toHaveBeenCalledTimes(6);

    const studentCall = emitMock.mock.calls.find(([row]: any) => row.category === "student" && row.recipientUid);
    expect(studentCall[0]).toMatchObject({
      recipientUid: "ali@school.com", entity: "Assignment", type: "assignment_published",
      title: "New HW", message: "Chapter 3 posted", studentId: "S1",
    });

    const parentCall = emitMock.mock.calls.find(([row]: any) => row.audienceRole === "parent");
    expect(parentCall[0].message).toBe("Chapter 3 posted (Ali)");

    const teacherCall = emitMock.mock.calls.find(([row]: any) => row.category === "staff" && row.recipientUid);
    expect(teacherCall[0]).toMatchObject({ recipientUid: "khan@school.com", category: "staff" });

    const leadershipRoles = emitMock.mock.calls
      .filter(([row]: any) => row.audienceRole && row.audienceRole !== "parent")
      .map(([row]: any) => row.audienceRole);
    expect(leadershipRoles.sort()).toEqual(["academic_coordinator", "principal", "vice_principal"]);
  });

  it("builds deterministic ids from entity/sourceId/studentId so re-publishing doesn't duplicate", async () => {
    getAllMock.mockResolvedValue([student({ id: "S1" })]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "assignment_published",
      title: "t", message: "m", sourceId: "A1",
    });
    const studentCall = emitMock.mock.calls.find(([row]: any) => row.category === "student" && row.recipientUid);
    expect(studentCall[0].id).toBe("assignment-A1-s1-student");
    const parentCall = emitMock.mock.calls.find(([row]: any) => row.audienceRole === "parent");
    expect(parentCall[0].id).toBe("assignment-A1-s1-parent");
  });

  it("matches students by canonicalized grade (handles 'Grade 5' vs '5') and uppercased section", async () => {
    getAllMock.mockResolvedValue([
      student({ id: "S1", grade: "5", section: "b" }),
      student({ id: "S2", grade: "Grade 6", section: "B" }),
    ]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    const studentCalls = emitMock.mock.calls.filter(([row]: any) => row.category === "student" && row.recipientUid);
    expect(studentCalls).toHaveLength(1);
    expect(studentCalls[0][0].studentId).toBe("S1");
  });

  it("skips the per-student notification (but still sends parent) when the student has no email", async () => {
    getAllMock.mockResolvedValue([student({ id: "S1", email: "" })]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    const studentCalls = emitMock.mock.calls.filter(([row]: any) => row.category === "student" && row.recipientUid);
    expect(studentCalls).toHaveLength(0);
    const parentCalls = emitMock.mock.calls.filter(([row]: any) => row.audienceRole === "parent");
    expect(parentCalls).toHaveLength(1);
  });

  it("skips a student entirely when it has neither id nor uid", async () => {
    getAllMock.mockResolvedValue([student({ id: undefined as any, uid: undefined as any })]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    const studentOrParentCalls = emitMock.mock.calls.filter(
      ([row]: any) => row.category === "student"
    );
    expect(studentOrParentCalls).toHaveLength(0);
  });

  it("falls back to uid when id is missing", async () => {
    getAllMock.mockResolvedValue([student({ id: undefined as any, uid: "U9" })]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    const parentCall = emitMock.mock.calls.find(([row]: any) => row.audienceRole === "parent");
    expect(parentCall[0].studentId).toBe("U9");
  });

  it("uses 'your child' fallback in the parent message when the student has no name", async () => {
    getAllMock.mockResolvedValue([student({ name: "" })]);
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "Posted", sourceId: "A1",
    });
    const parentCall = emitMock.mock.calls.find(([row]: any) => row.audienceRole === "parent");
    expect(parentCall[0].message).toBe("Posted (your child)");
  });

  it("sends only leadership notifications when there are no matching students and no class teacher", async () => {
    getAllMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue(okJson([]));
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    expect(emitMock).toHaveBeenCalledTimes(3);
    expect(emitMock.mock.calls.every(([row]: any) => LEADERSHIP.includes(row.audienceRole))).toBe(true);
  });

  it("skips a class teacher row that has no email", async () => {
    getAllMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue(okJson([{ name: "No Email Teacher" }]));
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    expect(emitMock).toHaveBeenCalledTimes(3); // leadership only
  });

  it("swallows errors when studentRepository.getAll rejects (caught internally) and still notifies leadership", async () => {
    getAllMock.mockRejectedValue(new Error("db down"));
    fetchMock.mockResolvedValue(okJson([]));
    await expect(
      notifyClassPublish({
        grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
        title: "t", message: "m", sourceId: "A1",
      })
    ).resolves.toBeUndefined();
    expect(emitMock).toHaveBeenCalledTimes(3);
  });

  it("never throws even when fetch itself throws (findClassTeachers swallows it)", async () => {
    getAllMock.mockResolvedValue([]);
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      notifyClassPublish({
        grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
        title: "t", message: "m", sourceId: "A1",
      })
    ).resolves.toBeUndefined();
  });

  it("treats a non-ok fetch response as no class teachers found", async () => {
    getAllMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({ ok: false, json: async () => [{ name: "X", email: "x@x.com" }] });
    await notifyClassPublish({
      grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
      title: "t", message: "m", sourceId: "A1",
    });
    expect(emitMock).toHaveBeenCalledTimes(3); // leadership only, no class teacher
  });

  it("never throws even when emitNotification rejects", async () => {
    getAllMock.mockResolvedValue([student()]);
    emitMock.mockRejectedValueOnce(new Error("write failed"));
    await expect(
      notifyClassPublish({
        grade: "Grade 5", section: "B", entity: "Assignment", type: "t",
        title: "t", message: "m", sourceId: "A1",
      })
    ).resolves.toBeUndefined();
  });
});

const LEADERSHIP = ["academic_coordinator", "principal", "vice_principal"];

describe("notifyClassTeacherEvent", () => {
  beforeEach(() => {
    emitMock.mockClear();
    fetchMock.mockReset().mockResolvedValue(okJson([]));
  });

  it("notifies each real class teacher found for the section", async () => {
    fetchMock.mockResolvedValue(okJson([{ name: "Mr. Khan", email: "khan@school.com" }]));
    await notifyClassTeacherEvent({
      grade: "Grade 5", section: "B", entity: "Attendance", type: "attendance_submitted",
      title: "Attendance submitted", message: "Daily attendance ready", sourceId: "ATT-1",
    });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toMatchObject({
      id: "attendance-ATT-1-classteacher-khan-school-com",
      recipientUid: "khan@school.com", category: "staff", entity: "Attendance", type: "attendance_submitted",
    });
  });

  it("excludes a teacher matching excludeEmail (e.g. the submitting subject teacher)", async () => {
    fetchMock.mockResolvedValue(okJson([{ name: "Mr. Khan", email: "khan@school.com" }]));
    await notifyClassTeacherEvent({
      grade: "Grade 5", section: "B", entity: "Attendance", type: "t",
      title: "t", message: "m", sourceId: "ATT-1", excludeEmail: "khan@school.com",
    });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("skips teachers without an email", async () => {
    fetchMock.mockResolvedValue(okJson([{ name: "No Email" }]));
    await notifyClassTeacherEvent({
      grade: "Grade 5", section: "B", entity: "Attendance", type: "t",
      title: "t", message: "m", sourceId: "ATT-1",
    });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("does nothing (no throw) when no class teacher is found", async () => {
    fetchMock.mockResolvedValue(okJson([]));
    await expect(
      notifyClassTeacherEvent({
        grade: "Grade 5", section: "B", entity: "Attendance", type: "t",
        title: "t", message: "m", sourceId: "ATT-1",
      })
    ).resolves.toBeUndefined();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("swallows fetch failure without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      notifyClassTeacherEvent({
        grade: "Grade 5", section: "B", entity: "Attendance", type: "t",
        title: "t", message: "m", sourceId: "ATT-1",
      })
    ).resolves.toBeUndefined();
  });
});

describe("notifyParentsOfStudents", () => {
  beforeEach(() => emitMock.mockClear());

  it("emits one parent notification per student entry with its own pre-built message", async () => {
    await notifyParentsOfStudents(
      [
        { id: "S1", name: "Ali", message: "Ali was absent today" },
        { id: "S2", name: "Sara", message: "Sara arrived late" },
      ],
      { entity: "Attendance", type: "absence_alert", title: "Absence", sourceId: "ATT-1", grade: "Grade 5", section: "B" }
    );
    expect(emitMock).toHaveBeenCalledTimes(2);
    expect(emitMock.mock.calls[0][0]).toMatchObject({
      id: "attendance-ATT-1-s1-parent", audienceRole: "parent", studentId: "S1", message: "Ali was absent today",
    });
    expect(emitMock.mock.calls[1][0]).toMatchObject({
      id: "attendance-ATT-1-s2-parent", audienceRole: "parent", studentId: "S2", message: "Sara arrived late",
    });
  });

  it("resolves without emitting anything for an empty list", async () => {
    await notifyParentsOfStudents([], {
      entity: "Attendance", type: "t", title: "t", sourceId: "ATT-1", grade: "Grade 5", section: "B",
    });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("never throws even when emitNotification rejects", async () => {
    emitMock.mockRejectedValueOnce(new Error("fail"));
    await expect(
      notifyParentsOfStudents(
        [{ id: "S1", name: "Ali", message: "m" }],
        { entity: "Attendance", type: "t", title: "t", sourceId: "ATT-1", grade: "Grade 5", section: "B" }
      )
    ).resolves.toBeUndefined();
  });
});

describe("publishDueScheduledAssessments", () => {
  beforeEach(() => {
    emitMock.mockClear();
    updateMock.mockClear().mockResolvedValue({});
    getAllMock.mockClear().mockResolvedValue([]);
    fetchMock.mockReset().mockResolvedValue(okJson([]));
  });

  it("returns the same array reference contents (no due rows) when nothing is Upcoming", async () => {
    const rows = [{ id: "1", status: "Active", grade: "5", section: "A", title: "T", subject: "Math" }];
    const result = await publishDueScheduledAssessments(rows as any);
    expect(result).toBe(rows);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not flip an Upcoming row whose scheduledAt is in the future", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const rows = [{ id: "1", status: "Upcoming", scheduledAt: future, grade: "5", section: "A", title: "T", subject: "Math" }];
    const result = await publishDueScheduledAssessments(rows as any);
    expect(result[0].status).toBe("Upcoming");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("flips a due Upcoming row to Active, persists it, and fires class-publish notifications", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const rows = [{ id: "1", status: "Upcoming", scheduledAt: past, grade: "5", section: "A", title: "Quiz 1", subject: "Math", type: "Quiz", date: "2026-07-10" }];
    const result = await publishDueScheduledAssessments(rows as any);
    expect(result[0].status).toBe("Active");
    expect(updateMock).toHaveBeenCalledWith("assessments", "1", { status: "Active" });
    // notifyClassPublish fires only leadership notifications here since getAll/fetch return []
    expect(emitMock).toHaveBeenCalledTimes(3);
    const anyCall = emitMock.mock.calls[0][0];
    expect(anyCall.title).toBe("New Quiz: Quiz 1");
    expect(anyCall.message).toContain("Math quiz has been posted for Section A");
    expect(anyCall.message).toContain("2026-07-10");
  });

  it("does not mutate rows that are not due, only the due ones in the returned array", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const untouched = { id: "2", status: "Active", grade: "5", section: "A", title: "T2", subject: "Sci" };
    const due = { id: "1", status: "Upcoming", scheduledAt: past, grade: "5", section: "A", title: "T1", subject: "Math" };
    const rows = [untouched, due];
    const result = await publishDueScheduledAssessments(rows as any);
    expect(result[0]).toBe(untouched);
    expect(result[1]).not.toBe(due);
    expect(result[1].status).toBe("Active");
  });

  it("continues processing remaining due rows even if smartDb.update rejects for one (best-effort)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const rows = [
      { id: "1", status: "Upcoming", scheduledAt: past, grade: "5", section: "A", title: "T1", subject: "Math" },
      { id: "2", status: "Upcoming", scheduledAt: past, grade: "5", section: "A", title: "T2", subject: "Sci" },
    ];
    updateMock.mockRejectedValueOnce(new Error("db fail")).mockResolvedValueOnce({});
    await expect(publishDueScheduledAssessments(rows as any)).resolves.toBeDefined();
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it("uses generic 'Assessment' wording in title/message when type is absent", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const rows = [{ id: "1", status: "Upcoming", scheduledAt: past, grade: "5", section: "", title: "T1", subject: "Math" }];
    const result = await publishDueScheduledAssessments(rows as any);
    expect(result[0].status).toBe("Active");
    const call = emitMock.mock.calls.find((c: any) => c[0].title === "New Assessment: T1");
    expect(call).toBeTruthy();
    expect(call[0].message).toBe("Math assessment has been posted.");
  });
});
