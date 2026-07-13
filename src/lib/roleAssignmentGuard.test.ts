import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { checkClassTeacherAssignment, checkGradeCoordinatorAssignment } from "./roleAssignmentGuard";

function setUsers(users: any[]) {
  (smartDb.getAll as any).mockResolvedValue(users);
}

beforeEach(() => {
  (smartDb.getAll as any).mockClear();
});

describe("checkClassTeacherAssignment", () => {
  it("returns null immediately when email, grade, or section is missing (no DB call)", async () => {
    const result = await checkClassTeacherAssignment("", "Grade 5", "B");
    expect(result).toBeNull();
    expect(smartDb.getAll).not.toHaveBeenCalled();
  });

  it("returns null when grade is missing", async () => {
    const result = await checkClassTeacherAssignment("t@x.com", "", "B");
    expect(result).toBeNull();
  });

  it("returns null when section is missing", async () => {
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "");
    expect(result).toBeNull();
  });

  it("returns null when no conflicting teacher exists and self has no prior assignment", async () => {
    setUsers([
      { email: "t@x.com", name: "Teacher T" },
      { email: "other@x.com", assignedGrade: "Grade 6", assignedSection: "A" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).toBeNull();
  });

  it("detects a conflict when another teacher already holds that grade+section (assignedGrade/assignedSection fields)", async () => {
    setUsers([
      { email: "t@x.com", name: "Teacher T" },
      { email: "other@x.com", name: "Ms. Rao", assignedGrade: "Grade 5", assignedSection: "B" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Ms. Rao");
    expect(result!.message).toContain("Grade 5");
    expect(result!.message).toContain("Section B");
  });

  it("detects a conflict via the classSection string form (e.g. 'Grade 5-B')", async () => {
    setUsers([
      { email: "t@x.com", name: "Teacher T" },
      { email: "other@x.com", name: "Mr. Singh", classSection: "Grade 5-B" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Mr. Singh");
  });

  it("falls back to displayName then email when conflicting user has no name", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", displayName: "Display Name", assignedGrade: "Grade 5", assignedSection: "B" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result!.message).toContain("Display Name");

    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", assignedGrade: "Grade 5", assignedSection: "B" },
    ]);
    const result2 = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result2!.message).toContain("other@x.com");
  });

  it("is case-insensitive and whitespace-tolerant on grade/section matching", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", name: "Ms. Rao", assignedGrade: "grade   5", assignedSection: "b" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).not.toBeNull();
  });

  it("does not flag the same email (by case-insensitive match) as a conflict with itself", async () => {
    setUsers([
      { email: "T@X.com", assignedGrade: "Grade 5", assignedSection: "B" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B", false);
    expect(result).toBeNull();
  });

  describe("checkSelf behavior", () => {
    it("when checkSelf=true, flags the teacher already having a DIFFERENT class assignment", async () => {
      setUsers([
        { email: "t@x.com", name: "Teacher T", assignedGrade: "Grade 4", assignedSection: "A" },
      ]);
      const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B", true);
      expect(result).not.toBeNull();
      expect(result!.message).toContain("Grade 4");
      expect(result!.message).toContain("Section A");
    });

    it("when checkSelf=true, does NOT flag if the requested assignment equals the current one (no-op reassignment)", async () => {
      setUsers([
        { email: "t@x.com", name: "Teacher T", assignedGrade: "Grade 5", assignedSection: "B" },
      ]);
      const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B", true);
      expect(result).toBeNull();
    });

    it("when checkSelf=false, allows moving the same teacher from one class to another", async () => {
      setUsers([
        { email: "t@x.com", name: "Teacher T", assignedGrade: "Grade 4", assignedSection: "A" },
      ]);
      const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B", false);
      expect(result).toBeNull();
    });

    it("defaults checkSelf to true when omitted", async () => {
      setUsers([
        { email: "t@x.com", name: "Teacher T", assignedGrade: "Grade 4", assignedSection: "A" },
      ]);
      const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
      expect(result).not.toBeNull();
    });
  });

  it("returns null when smartDb.getAll resolves to a falsy value", async () => {
    (smartDb.getAll as any).mockResolvedValue(null);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).toBeNull();
  });

  it("ignores users whose classSection string does not match the expected pattern", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", name: "Odd Case", classSection: "not-a-valid-format!!" },
    ]);
    const result = await checkClassTeacherAssignment("t@x.com", "Grade 5", "B");
    expect(result).toBeNull();
  });
});

describe("checkGradeCoordinatorAssignment", () => {
  it("returns null immediately when email or grade is missing (no DB call)", async () => {
    const result = await checkGradeCoordinatorAssignment("", "Grade 5");
    expect(result).toBeNull();
    expect(smartDb.getAll).not.toHaveBeenCalled();

    const result2 = await checkGradeCoordinatorAssignment("t@x.com", "");
    expect(result2).toBeNull();
  });

  it("returns null when no one else coordinates that grade", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", coordinatorGrade: "Grade 6" },
    ]);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5");
    expect(result).toBeNull();
  });

  it("detects a conflict when another staff member already coordinates the grade", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", name: "Mr. Ali", coordinatorGrade: "Grade 5" },
    ]);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Mr. Ali");
    expect(result!.message).toContain("Grade 5");
  });

  it("is case-insensitive and whitespace-tolerant on grade matching", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", name: "Mr. Ali", coordinatorGrade: "grade  5" },
    ]);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5");
    expect(result).not.toBeNull();
  });

  it("falls back to displayName then email when conflicting user has no name", async () => {
    setUsers([
      { email: "t@x.com" },
      { email: "other@x.com", coordinatorGrade: "Grade 5" },
    ]);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5");
    expect(result!.message).toContain("other@x.com");
  });

  describe("checkSelf behavior", () => {
    it("when checkSelf=true, flags the staff member already coordinating a DIFFERENT grade", async () => {
      setUsers([
        { email: "t@x.com", coordinatorGrade: "Grade 4" },
      ]);
      const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5", true);
      expect(result).not.toBeNull();
      expect(result!.message).toContain("Grade 4");
    });

    it("when checkSelf=true, does NOT flag if requested grade equals current coordinatorGrade", async () => {
      setUsers([
        { email: "t@x.com", coordinatorGrade: "Grade 5" },
      ]);
      const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5", true);
      expect(result).toBeNull();
    });

    it("when checkSelf=false, allows moving the same staff member from one grade to another", async () => {
      setUsers([
        { email: "t@x.com", coordinatorGrade: "Grade 4" },
      ]);
      const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5", false);
      expect(result).toBeNull();
    });
  });

  it("does not flag the same email as a conflict with itself in the cross-user scan", async () => {
    setUsers([
      { email: "T@X.com", coordinatorGrade: "Grade 5" },
    ]);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5", false);
    expect(result).toBeNull();
  });

  it("returns null when smartDb.getAll resolves to a falsy value", async () => {
    (smartDb.getAll as any).mockResolvedValue(undefined);
    const result = await checkGradeCoordinatorAssignment("t@x.com", "Grade 5");
    expect(result).toBeNull();
  });
});
