import { describe, it, expect } from "vitest";
import { advanceChain, rejectChain } from "./approvalChain";
import { ApprovalStep } from "@/types";

function chain(...labels: string[]): ApprovalStep[] {
  return labels.map((label) => ({ roleId: label.toLowerCase(), label, status: "Pending" as const }));
}

describe("advanceChain", () => {
  it("marks the current step Approved and advances to the next step when more remain", () => {
    const result = advanceChain(chain("Teacher", "Principal"), 0, "Ms. Rao", "looks fine", "2026-07-12T00:00:00.000Z");
    expect(result.updatedChain[0]).toMatchObject({ status: "Approved", actedBy: "Ms. Rao", remark: "looks fine" });
    expect(result.updatedChain[1]).toMatchObject({ status: "Pending" });
    expect(result.nextStepIdx).toBe(1);
    expect(result.isLastStep).toBe(false);
    expect(result.overallStatus).toBe("Pending");
  });

  it("flips overall status to Approved when the approved step is the last one in the chain", () => {
    const result = advanceChain(chain("Teacher", "Principal"), 1, "Dr. Khan", "", "2026-07-12T00:00:00.000Z");
    expect(result.updatedChain[1]).toMatchObject({ status: "Approved" });
    expect(result.isLastStep).toBe(true);
    expect(result.overallStatus).toBe("Approved");
  });

  it("leaves every step other than stepIdx untouched", () => {
    const original = chain("Teacher", "Coordinator", "Principal");
    const result = advanceChain(original, 1, "Coord", "", "2026-07-12T00:00:00.000Z");
    expect(result.updatedChain[0]).toEqual(original[0]);
    expect(result.updatedChain[2]).toEqual(original[2]);
  });

  it("does not mutate the input chain array (pure function)", () => {
    const original = chain("Teacher", "Principal");
    const snapshot = JSON.parse(JSON.stringify(original));
    advanceChain(original, 0, "Someone", "", "2026-07-12T00:00:00.000Z");
    expect(original).toEqual(snapshot);
  });
});

describe("rejectChain", () => {
  it("marks the current step Rejected without touching other steps", () => {
    const original = chain("Teacher", "Principal");
    const result = rejectChain(original, 0, "Ms. Rao", "not eligible", "2026-07-12T00:00:00.000Z");
    expect(result.updatedChain[0]).toMatchObject({ status: "Rejected", actedBy: "Ms. Rao", remark: "not eligible" });
    expect(result.updatedChain[1]).toMatchObject({ status: "Pending" });
  });

  it("does not mutate the input chain array (pure function)", () => {
    const original = chain("Teacher", "Principal");
    const snapshot = JSON.parse(JSON.stringify(original));
    rejectChain(original, 0, "Someone", "", "2026-07-12T00:00:00.000Z");
    expect(original).toEqual(snapshot);
  });
});
