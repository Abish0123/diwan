import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the external boundaries (DB/email/audit) that reportCardStore.ts
// touches so we test the real store/approval logic without network/DB side effects.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/emailService", () => ({
  sendPlainEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { smartDb } from "@/lib/localDb";
import { sendPlainEmail } from "@/lib/emailService";
import { logAudit } from "@/lib/auditLog";
import {
  reportCardId,
  saveReportCard,
  saveReportCards,
  submitReportCard,
  verifyReportCard,
  approveReportCard,
  publishReportCard,
  reopenReportCard,
  transitionMany,
  getAllReportCards,
  getReportCard,
  regenerateReportCard,
  regenerateReportCards,
  getLatestPublished,
  notifyReportCard,
  notifyManyReportCards,
  getPrincipalName,
  ApprovalError,
  APPROVAL_CHAIN,
  type ReportCardRecord,
  type ApprovalActor,
} from "./reportCardStore";

function makeRecord(overrides: Partial<ReportCardRecord> = {}): ReportCardRecord {
  return {
    id: reportCardId("S1", "2026", "Term 1"),
    studentId: "S1",
    name: "Alice",
    grade: "Grade 6",
    section: "A",
    term: "Term 1",
    year: "2026",
    subjects: [{ subject: "Math", obtained: 80, max: 100, pct: 80, letter: "A" }],
    overallPct: 80,
    overallGrade: "A",
    attendancePct: 95,
    classTeacherRemark: "",
    principalRemark: "",
    status: "draft",
    approvalStage: 0,
    publishedToStudents: false,
    publishedToParents: false,
    teacherName: "Mr. X",
    principalName: "",
    generatedAt: "",
    ...overrides,
  };
}

const teacher: ApprovalActor = { uid: "u1", name: "Ms. Rao", role: "class_teacher" };
const coordinator: ApprovalActor = { uid: "u2", name: "Mr. Iyer", role: "grade_coordinator" };
const principal: ApprovalActor = { uid: "u3", name: "Dr. Khan", role: "principal" };
const admin: ApprovalActor = { uid: "u4", name: "Admin", role: "admin" };
const student: ApprovalActor = { uid: "u5", name: "Student", role: "student" };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // reset the module-level fetch mock for getPrincipalName / notify calls
  (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

describe("reportCardId", () => {
  it("builds a deterministic composite key from studentId/year/term", () => {
    expect(reportCardId("S1", "2026", "Term 1")).toBe("S1::2026::Term 1");
  });
});

describe("saveReportCard / getReportCard / getAllReportCards", () => {
  it("persists a record and makes it retrievable by studentId/year/term", () => {
    const rec = makeRecord();
    saveReportCard(rec);
    const fetched = getReportCard("S1", "2026", "Term 1");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Alice");
  });

  it("returns null for a report card that doesn't exist", () => {
    expect(getReportCard("nope", "2026", "Term 1")).toBeNull();
  });

  it("getAllReportCards returns every saved record", () => {
    saveReportCard(makeRecord({ id: "a", studentId: "S1" }));
    saveReportCard(makeRecord({ id: "b", studentId: "S2" }));
    expect(getAllReportCards()).toHaveLength(2);
  });

  it("assigns a generatedAt stamp when none is provided", () => {
    const rec = makeRecord({ generatedAt: "" });
    saveReportCard(rec);
    const fetched = getReportCard("S1", "2026", "Term 1");
    expect(fetched?.generatedAt).toBeTruthy();
  });

  it("preserves an explicit generatedAt if already set", () => {
    const rec = makeRecord({ generatedAt: "custom-stamp" });
    saveReportCard(rec);
    const fetched = getReportCard("S1", "2026", "Term 1");
    expect(fetched?.generatedAt).toBe("custom-stamp");
  });

  it("write-through persists to smartDb", () => {
    saveReportCard(makeRecord());
    expect(smartDb.create).toHaveBeenCalledWith("ReportCard", expect.objectContaining({ studentId: "S1" }));
  });

  it("saveReportCards saves multiple records in one batch", () => {
    saveReportCards([
      makeRecord({ id: "a", studentId: "S1" }),
      makeRecord({ id: "b", studentId: "S2" }),
    ]);
    expect(getAllReportCards()).toHaveLength(2);
    expect(smartDb.create).toHaveBeenCalledTimes(2);
  });
});

describe("normalizePublishState invariant (applied on every save)", () => {
  it("forces status to published when publishedToStudents is true even if status says otherwise", () => {
    const rec = makeRecord({ status: "draft", publishedToStudents: true });
    saveReportCard(rec);
    expect(getReportCard("S1", "2026", "Term 1")?.status).toBe("published");
  });

  it("forces status to published when publishedToParents is true", () => {
    const rec = makeRecord({ status: "approved", publishedToParents: true });
    saveReportCard(rec);
    expect(getReportCard("S1", "2026", "Term 1")?.status).toBe("published");
  });

  it("keeps publish flags false when status is not published and flags are already false", () => {
    const rec = makeRecord({ status: "draft", publishedToStudents: false, publishedToParents: false });
    saveReportCard(rec);
    const fetched = getReportCard("S1", "2026", "Term 1")!;
    expect(fetched.status).toBe("draft");
    expect(fetched.publishedToStudents).toBe(false);
    expect(fetched.publishedToParents).toBe(false);
  });
});

describe("approval chain transitions", () => {
  it("submit moves draft -> submitted for an authorized role", async () => {
    saveReportCard(makeRecord({ status: "draft", approvalStage: 0 }));
    const updated = await submitReportCard(reportCardId("S1", "2026", "Term 1"), teacher);
    expect(updated.status).toBe("submitted");
    expect(updated.approvalStage).toBe(APPROVAL_CHAIN.indexOf("submitted"));
  });

  it("rejects submit from an unauthorized role", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    await expect(submitReportCard(reportCardId("S1", "2026", "Term 1"), student)).rejects.toThrow(ApprovalError);
  });

  it("rejects a transition attempted from the wrong current status", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    // verify expects "submitted", but record is still "draft"
    await expect(verifyReportCard(reportCardId("S1", "2026", "Term 1"), teacher)).rejects.toThrow(
      /Cannot verify a report card that is "draft"/
    );
  });

  it("throws when transitioning a report card id that doesn't exist", async () => {
    await expect(submitReportCard("does-not-exist", teacher)).rejects.toThrow(/not found/);
  });

  it("verify sets classTeacherRemark and advances submitted -> verified", async () => {
    saveReportCard(makeRecord({ status: "submitted", approvalStage: 1 }));
    const updated = await verifyReportCard(reportCardId("S1", "2026", "Term 1"), teacher, "Looks good");
    expect(updated.status).toBe("verified");
    expect(updated.classTeacherRemark).toBe("Looks good");
  });

  it("verify without a remark leaves classTeacherRemark untouched", async () => {
    saveReportCard(makeRecord({ status: "submitted", classTeacherRemark: "original" }));
    const updated = await verifyReportCard(reportCardId("S1", "2026", "Term 1"), teacher);
    expect(updated.classTeacherRemark).toBe("original");
  });

  it("approve sets principalRemark and advances verified -> approved", async () => {
    saveReportCard(makeRecord({ status: "verified" }));
    const updated = await approveReportCard(reportCardId("S1", "2026", "Term 1"), coordinator, "Approved by GC");
    expect(updated.status).toBe("approved");
    expect(updated.principalRemark).toBe("Approved by GC");
  });

  it("publish advances approved -> published and defaults both visibility flags true", async () => {
    saveReportCard(makeRecord({ status: "approved" }));
    const updated = await publishReportCard(reportCardId("S1", "2026", "Term 1"), principal);
    expect(updated.status).toBe("published");
    expect(updated.publishedToStudents).toBe(true);
    expect(updated.publishedToParents).toBe(true);
  });

  it("publish honors explicit toStudents/toParents overrides", async () => {
    saveReportCard(makeRecord({ status: "approved" }));
    const updated = await publishReportCard(reportCardId("S1", "2026", "Term 1"), principal, {
      toStudents: true,
      toParents: false,
    });
    expect(updated.publishedToStudents).toBe(true);
    expect(updated.publishedToParents).toBe(false);
  });

  // SECURITY/POLICY FINDING (not asserted as correct — see reportCardStore.ts:19-21
  // vs :34): the file's own header comment documents a deliberate
  // separation-of-duties control — "Admin is deliberately absent from the
  // 'who can approve marks' set ... an admin ... never edits or approves
  // academic marks themselves" — but ACTION_ROLES.approve actually includes
  // "admin", so an admin CAN currently approve marks, bypassing the
  // grade-coordinator/principal review chain the policy comment describes.
  // Left as a todo rather than a passing assertion so this doesn't get
  // silently codified as "working as intended" — needs a product decision:
  // either remove "admin"/"super_admin" from ACTION_ROLES.approve to match
  // the documented policy, or update the doc comment if the policy changed.
  it.todo("admin should NOT be able to approve marks per the documented separation-of-duties policy (currently CAN — see comment above)");

  it("admin can publish", async () => {
    saveReportCard(makeRecord({ status: "approved" }));
    const updated = await publishReportCard(reportCardId("S1", "2026", "Term 1"), admin);
    expect(updated.status).toBe("published");
  });

  it("non-publish actions always force publish flags to false regardless of prior state", async () => {
    saveReportCard(makeRecord({ status: "submitted", publishedToStudents: false, publishedToParents: false }));
    const updated = await verifyReportCard(reportCardId("S1", "2026", "Term 1"), teacher);
    expect(updated.publishedToStudents).toBe(false);
    expect(updated.publishedToParents).toBe(false);
  });

  it("reopen resets a published record back to draft stage 0", async () => {
    saveReportCard(makeRecord({ status: "published", approvalStage: 4, publishedToStudents: true, publishedToParents: true }));
    const updated = await reopenReportCard(reportCardId("S1", "2026", "Term 1"), coordinator);
    expect(updated.status).toBe("draft");
    expect(updated.approvalStage).toBe(0);
    expect(updated.publishedToStudents).toBe(false);
    expect(updated.publishedToParents).toBe(false);
  });

  it("reopen is rejected for a teacher (not in reopen's allowed roles)", async () => {
    saveReportCard(makeRecord({ status: "approved" }));
    await expect(reopenReportCard(reportCardId("S1", "2026", "Term 1"), teacher)).rejects.toThrow(ApprovalError);
  });

  it("logs an audit entry for every successful transition", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    await submitReportCard(reportCardId("S1", "2026", "Term 1"), teacher);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report_card_submit", entity: "ReportCard", status: "success" })
    );
  });

  it("write-through persists the transitioned record to smartDb", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    vi.clearAllMocks();
    await submitReportCard(reportCardId("S1", "2026", "Term 1"), teacher);
    expect(smartDb.create).toHaveBeenCalledWith("ReportCard", expect.objectContaining({ status: "submitted" }));
  });
});

describe("transitionMany", () => {
  it("processes each id independently, splitting into succeeded and failed", async () => {
    saveReportCard(makeRecord({ id: "ok1", studentId: "S1", status: "draft" }));
    saveReportCard(makeRecord({ id: "ok2", studentId: "S2", status: "draft" }));
    saveReportCard(makeRecord({ id: "bad", studentId: "S3", status: "submitted" })); // wrong status for submit

    const result = await transitionMany(["ok1", "ok2", "bad", "missing"], "submit", teacher);
    expect(result.succeeded).toEqual(["ok1", "ok2"]);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.find(f => f.id === "bad")?.error).toMatch(/Cannot submit/);
    expect(result.failed.find(f => f.id === "missing")?.error).toMatch(/not found/);
  });

  it("returns empty succeeded/failed for an empty id list", async () => {
    const result = await transitionMany([], "submit", teacher);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});

describe("regenerateReportCard / regenerateReportCards", () => {
  it("saves the fresh record as-is when no prior record exists", () => {
    const fresh = makeRecord({ overallPct: 90 });
    const result = regenerateReportCard(fresh);
    expect(result.overallPct).toBe(90);
    expect(result.status).toBe("draft");
  });

  it("preserves human-decision fields (status/approvalStage/remarks/publish flags) from the existing record", () => {
    saveReportCard(makeRecord({
      status: "approved",
      approvalStage: 3,
      classTeacherRemark: "Great progress",
      principalRemark: "Well done",
      publishedToStudents: false,
      publishedToParents: false,
    }));
    const fresh = makeRecord({ overallPct: 88, overallGrade: "A+", status: "draft", approvalStage: 0 });
    const result = regenerateReportCard(fresh);
    expect(result.overallPct).toBe(88);
    expect(result.overallGrade).toBe("A+");
    expect(result.status).toBe("approved");
    expect(result.approvalStage).toBe(3);
    expect(result.classTeacherRemark).toBe("Great progress");
    expect(result.principalRemark).toBe("Well done");
  });

  it("always refreshes generatedAt on regenerate", () => {
    saveReportCard(makeRecord({ generatedAt: "old-stamp" }));
    const result = regenerateReportCard(makeRecord({ generatedAt: "" }));
    expect(result.generatedAt).not.toBe("old-stamp");
    expect(result.generatedAt).toBeTruthy();
  });

  it("regenerateReportCards processes a batch and preserves fields per-record", () => {
    saveReportCard(makeRecord({ id: "a", studentId: "S1", status: "verified", approvalStage: 2 }));
    saveReportCard(makeRecord({ id: "b", studentId: "S2", status: "draft", approvalStage: 0 }));
    const out = regenerateReportCards([
      makeRecord({ id: "a", studentId: "S1", overallPct: 70, status: "draft", approvalStage: 0 }),
      makeRecord({ id: "b", studentId: "S2", overallPct: 60, status: "draft", approvalStage: 0 }),
    ]);
    expect(out.find(r => r.id === "a")?.status).toBe("verified");
    expect(out.find(r => r.id === "a")?.approvalStage).toBe(2);
    expect(out.find(r => r.id === "b")?.status).toBe("draft");
  });
});

describe("getLatestPublished", () => {
  it("returns null when the student has no published report cards", () => {
    saveReportCard(makeRecord({ status: "draft", publishedToStudents: false }));
    expect(getLatestPublished("S1")).toBeNull();
  });

  it("ignores published records not shared with students (publishedToStudents false)", () => {
    saveReportCard(makeRecord({ status: "published", publishedToStudents: false, publishedToParents: true }));
    expect(getLatestPublished("S1")).toBeNull();
  });

  it("returns the most recent published record by generatedAt", () => {
    saveReportCard(makeRecord({ id: "old", status: "published", publishedToStudents: true, generatedAt: "1000" }));
    saveReportCard(makeRecord({ id: "new", status: "published", publishedToStudents: true, generatedAt: "2000" }));
    expect(getLatestPublished("S1")?.id).toBe("new");
  });

  it("only considers records for the requested studentId (string-coerced comparison)", () => {
    saveReportCard(makeRecord({ id: "mine", studentId: "S1", status: "published", publishedToStudents: true }));
    saveReportCard(makeRecord({ id: "other", studentId: "S2", status: "published", publishedToStudents: true }));
    expect(getLatestPublished("S1")?.id).toBe("mine");
  });
});

describe("notifyReportCard / notifyManyReportCards", () => {
  it("throws when the report card id doesn't exist", async () => {
    await expect(notifyReportCard("missing")).rejects.toThrow(/not found/);
  });

  it("resolves without throwing for an existing (even unpublished) record", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    await expect(notifyReportCard(reportCardId("S1", "2026", "Term 1"))).resolves.toBeUndefined();
  });

  it("notifyManyReportCards silently skips ids that don't exist and no-ops on an empty match set", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    await expect(notifyManyReportCards(["missing-1", "missing-2"])).resolves.toBeUndefined();
  });

  it("notifyManyReportCards resolves for a mix of existing/missing ids", async () => {
    saveReportCard(makeRecord({ status: "draft" }));
    await expect(notifyManyReportCards([reportCardId("S1", "2026", "Term 1"), "missing"])).resolves.toBeUndefined();
  });

  it("sends student + parent notifications/emails when publishing to both", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/students")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: "S1", email: "student@example.com", fatherEmail: "dad@example.com", fatherName: "Mr. Dad" }],
        });
      }
      if (String(url).includes("/subject_assignments")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ grade: "Grade 6", section: "A", teacherName: "Ms. Rao", teacherEmail: "rao@example.com" }],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    saveReportCard(makeRecord({ status: "published", publishedToStudents: true, publishedToParents: true }));
    await notifyReportCard(reportCardId("S1", "2026", "Term 1"));

    expect(sendPlainEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "student@example.com" }));
    expect(sendPlainEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "dad@example.com" }));
    expect(sendPlainEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "rao@example.com" }));
  });

  it("does not send any email when the record is not published to anyone", async () => {
    saveReportCard(makeRecord({ status: "draft", publishedToStudents: false, publishedToParents: false }));
    await notifyReportCard(reportCardId("S1", "2026", "Term 1"));
    expect(sendPlainEmail).not.toHaveBeenCalled();
  });
});

describe("getPrincipalName", () => {
  it("returns empty string when no Principal is found in staff data", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] });
    const name = await getPrincipalName();
    expect(name).toBe("");
  });
});
