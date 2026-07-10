import { describe, it, expect } from "vitest";
import { resolveBranchScope, BRANCH_SCOPED_ENTITIES } from "./branchAuthorization";

describe("resolveBranchScope", () => {
  it("full-access role with no requested branch sees everything (null = unrestricted)", () => {
    expect(resolveBranchScope({ isFullAccess: true })).toBeNull();
  });

  it("full-access role honors an explicit requested branch (BranchContext's 'view as' UX)", () => {
    expect(resolveBranchScope({ isFullAccess: true, requestedBranchId: "branch-2" })).toBe("branch-2");
  });

  it("non-full-access role is locked to its assigned branch regardless of what it requests", () => {
    expect(resolveBranchScope({
      isFullAccess: false, assignedBranchId: "branch-2", requestedBranchId: "branch-3",
    })).toBe("branch-2");
  });

  it("non-full-access role with no assigned branch defaults to 'main', not unrestricted", () => {
    expect(resolveBranchScope({ isFullAccess: false })).toBe("main");
  });

  it("non-full-access role cannot escape scoping by simply omitting assignedBranchId and requesting a branch", () => {
    // A compromised client could send ?branchId=some-other-branch even with
    // no real assignment — this must still resolve to "main", never to
    // whatever the client asked for.
    expect(resolveBranchScope({ isFullAccess: false, requestedBranchId: "some-other-branch" })).toBe("main");
  });
});

describe("BRANCH_SCOPED_ENTITIES", () => {
  it("includes the core roster/academic entities", () => {
    expect(BRANCH_SCOPED_ENTITIES.has("students")).toBe(true);
    expect(BRANCH_SCOPED_ENTITIES.has("staff")).toBe(true);
    expect(BRANCH_SCOPED_ENTITIES.has("invoices")).toBe(true);
  });

  it("excludes entities never branch-scoped (system config, notifications log itself)", () => {
    expect(BRANCH_SCOPED_ENTITIES.has("notifications")).toBe(false);
    expect(BRANCH_SCOPED_ENTITIES.has("users")).toBe(false);
  });
});
