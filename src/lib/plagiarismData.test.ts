import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import {
  PROJECT_REPORTS,
  REPOSITORY_DOCS,
  SUBMISSION_ASSIGNMENTS,
  PLAGIARISM_POLICY,
  DEFAULT_POLICY,
  ensurePlagiarismSeed,
  getReports,
  getRepository,
  getAssignments,
  getPolicy,
  savePolicy,
  addToRepository,
} from "./plagiarismData";
import { ProjectReport, PlagiarismPolicy } from "@/types/plagiarism";

describe("table name constants", () => {
  it("exposes the expected table names", () => {
    expect(PROJECT_REPORTS).toBe("project_reports");
    expect(REPOSITORY_DOCS).toBe("repository_documents");
    expect(SUBMISSION_ASSIGNMENTS).toBe("submission_assignments");
    expect(PLAGIARISM_POLICY).toBe("plagiarism_policy");
  });
});

describe("DEFAULT_POLICY", () => {
  it("has the expected default thresholds", () => {
    expect(DEFAULT_POLICY).toEqual({
      id: "global",
      autoApproveBelow: 15,
      manualReviewBelow: 30,
      aiLowBelow: 20,
      aiReviewBelow: 50,
      maxFileSizeMb: 50,
    });
  });
});

describe("simple getters", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.getOne).mockReset();
    vi.mocked(smartDb.create).mockReset();
  });

  it("getReports reads from PROJECT_REPORTS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "r1" }]);
    const result = await getReports();
    expect(smartDb.getAll).toHaveBeenCalledWith(PROJECT_REPORTS);
    expect(result).toEqual([{ id: "r1" }]);
  });

  it("getRepository reads from REPOSITORY_DOCS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "d1" }]);
    const result = await getRepository();
    expect(smartDb.getAll).toHaveBeenCalledWith(REPOSITORY_DOCS);
    expect(result).toEqual([{ id: "d1" }]);
  });

  it("getAssignments reads from SUBMISSION_ASSIGNMENTS table", async () => {
    vi.mocked(smartDb.getAll).mockResolvedValue([{ id: "a1" }]);
    const result = await getAssignments();
    expect(smartDb.getAll).toHaveBeenCalledWith(SUBMISSION_ASSIGNMENTS);
    expect(result).toEqual([{ id: "a1" }]);
  });
});

describe("getPolicy", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getOne).mockReset();
  });

  it("returns the default policy merged with a stored partial override", async () => {
    vi.mocked(smartDb.getOne).mockResolvedValue({ id: "global", autoApproveBelow: 10 } as never);
    const result = await getPolicy();
    expect(smartDb.getOne).toHaveBeenCalledWith(PLAGIARISM_POLICY, "global");
    expect(result).toEqual({ ...DEFAULT_POLICY, autoApproveBelow: 10 });
  });

  it("returns a copy of DEFAULT_POLICY when nothing is stored", async () => {
    vi.mocked(smartDb.getOne).mockResolvedValue(null as never);
    const result = await getPolicy();
    expect(result).toEqual(DEFAULT_POLICY);
    expect(result).not.toBe(DEFAULT_POLICY);
  });

  it("returns a copy of DEFAULT_POLICY when the read throws", async () => {
    vi.mocked(smartDb.getOne).mockRejectedValue(new Error("db down"));
    const result = await getPolicy();
    expect(result).toEqual(DEFAULT_POLICY);
  });
});

describe("savePolicy", () => {
  beforeEach(() => {
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
  });

  it("persists the policy under the fixed 'global' id with an updatedAt timestamp", async () => {
    const policy: PlagiarismPolicy = { ...DEFAULT_POLICY, autoApproveBelow: 5 };
    await savePolicy(policy);
    expect(smartDb.create).toHaveBeenCalledTimes(1);
    const [table, payload, id] = vi.mocked(smartDb.create).mock.calls[0];
    expect(table).toBe(PLAGIARISM_POLICY);
    expect(id).toBe("global");
    expect(payload).toMatchObject({ id: "global", autoApproveBelow: 5 });
    expect(typeof (payload as { updatedAt: string }).updatedAt).toBe("string");
  });

  it("forces the id to 'global' even if a different id is passed in", async () => {
    const policy = { ...DEFAULT_POLICY, id: "not-global" } as PlagiarismPolicy;
    await savePolicy(policy);
    const [, payload, id] = vi.mocked(smartDb.create).mock.calls[0];
    expect(id).toBe("global");
    expect((payload as { id: string }).id).toBe("global");
  });
});

describe("addToRepository", () => {
  beforeEach(() => {
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
  });

  it("builds a repository document from the report and creates it with a REPO- prefixed id", async () => {
    const report: ProjectReport = {
      id: "RPT-123", studentId: "s1", studentName: "Jane Doe",
      title: "My Title", subject: "Capstone", department: "CS",
      semester: "6", guideName: "Dr. X", fileName: "f.pdf", fileType: "pdf", fileSizeKb: 100,
      status: "Approved", version: 1, text: "some report text",
      result: { overallSimilarity: 0, breakdown: { studentRepo: 0, internet: 0, research: 0 }, ai: { aiProbability: 0, sections: [] }, matches: [] },
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await addToRepository(report);

    expect(smartDb.create).toHaveBeenCalledTimes(1);
    const [table, doc, id] = vi.mocked(smartDb.create).mock.calls[0];
    expect(table).toBe(REPOSITORY_DOCS);
    expect(id).toBe("REPO-RPT-123");
    expect(doc).toMatchObject({
      id: "REPO-RPT-123",
      title: "My Title",
      studentName: "Jane Doe",
      department: "CS",
      text: "some report text",
    });
    expect((doc as { year: string }).year).toBe(new Date().getFullYear().toString());
  });
});

describe("ensurePlagiarismSeed", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.getOne).mockReset();
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
  });

  it("seeds repository, assignments, policy, and reports when all tables are empty", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === REPOSITORY_DOCS) return [];
      if (table === SUBMISSION_ASSIGNMENTS) return [];
      if (table === PROJECT_REPORTS) return [];
      return [];
    });
    vi.mocked(smartDb.getOne).mockResolvedValue(null as never);

    await ensurePlagiarismSeed();

    const createdRepoIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === REPOSITORY_DOCS).map((c) => c[2]);
    const createdAsgIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === SUBMISSION_ASSIGNMENTS).map((c) => c[2]);
    const createdReportIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PROJECT_REPORTS).map((c) => c[2]);
    const createdPolicyIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PLAGIARISM_POLICY).map((c) => c[2]);

    expect(createdRepoIds).toEqual(expect.arrayContaining(["REPO-1", "REPO-2", "REPO-3"]));
    expect(createdAsgIds).toEqual(expect.arrayContaining(["ASG-CAPSTONE", "ASG-INTERN"]));
    expect(createdReportIds).toEqual(expect.arrayContaining(["RPT-SEED-001", "RPT-SEED-002", "RPT-SEED-003"]));
    expect(createdPolicyIds).toContain("global");
  });

  it("does not reseed repository or assignments when they already have data", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === REPOSITORY_DOCS) return [{ id: "REPO-1" }];
      if (table === SUBMISSION_ASSIGNMENTS) return [{ id: "ASG-CAPSTONE" }];
      if (table === PROJECT_REPORTS) return [{ id: "RPT-SEED-001" }];
      return [];
    });
    vi.mocked(smartDb.getOne).mockResolvedValue({ id: "global" } as never);

    await ensurePlagiarismSeed();

    const repoCreates = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === REPOSITORY_DOCS);
    const asgCreates = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === SUBMISSION_ASSIGNMENTS);
    const reportCreates = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PROJECT_REPORTS);
    const policyCreates = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PLAGIARISM_POLICY);

    expect(repoCreates).toHaveLength(0);
    expect(asgCreates).toHaveLength(0);
    expect(reportCreates).toHaveLength(0);
    expect(policyCreates).toHaveLength(0);
  });

  it("seeds the policy only when none exists yet", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === REPOSITORY_DOCS) return [{ id: "REPO-1" }];
      if (table === SUBMISSION_ASSIGNMENTS) return [{ id: "ASG-CAPSTONE" }];
      if (table === PROJECT_REPORTS) return [{ id: "RPT-SEED-001" }];
      return [];
    });
    vi.mocked(smartDb.getOne).mockResolvedValue(null as never);

    await ensurePlagiarismSeed();

    const policyCreates = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PLAGIARISM_POLICY);
    expect(policyCreates).toHaveLength(1);
    expect(policyCreates[0][2]).toBe("global");
    expect(policyCreates[0][1]).toMatchObject(DEFAULT_POLICY);
  });

  it("swallows errors and logs instead of throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(smartDb.getAll).mockRejectedValue(new Error("db down"));
    vi.mocked(smartDb.getOne).mockResolvedValue(null as never);

    await expect(ensurePlagiarismSeed()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("Plagiarism seed failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("treats a null repo/assignment/report result as empty and reseeds", async () => {
    vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
      if (table === REPOSITORY_DOCS) return null as never;
      if (table === SUBMISSION_ASSIGNMENTS) return null as never;
      if (table === PROJECT_REPORTS) return null as never;
      return [];
    });
    vi.mocked(smartDb.getOne).mockResolvedValue({ id: "global" } as never);

    await ensurePlagiarismSeed();

    const createdRepoIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === REPOSITORY_DOCS).map((c) => c[2]);
    const createdAsgIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === SUBMISSION_ASSIGNMENTS).map((c) => c[2]);
    const createdReportIds = vi.mocked(smartDb.create).mock.calls.filter((c) => c[0] === PROJECT_REPORTS).map((c) => c[2]);

    expect(createdRepoIds).toEqual(expect.arrayContaining(["REPO-1", "REPO-2", "REPO-3"]));
    expect(createdAsgIds).toEqual(expect.arrayContaining(["ASG-CAPSTONE", "ASG-INTERN"]));
    expect(createdReportIds).toEqual(expect.arrayContaining(["RPT-SEED-001", "RPT-SEED-002", "RPT-SEED-003"]));
  });
});
