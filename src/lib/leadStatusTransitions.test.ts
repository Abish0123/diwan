import { describe, it, expect } from "vitest";
import { describeLeadTransition, LEAD_STAGE_ORDER } from "./leadStatusTransitions";

describe("describeLeadTransition", () => {
  it("classifies an adjacent forward move with no skipped stages", () => {
    const info = describeLeadTransition("Doc Verification", "School Fee");
    expect(info.direction).toBe("forward");
    expect(info.skippedStages).toEqual([]);
  });

  it("classifies a multi-stage forward jump and lists exactly the skipped stages", () => {
    const info = describeLeadTransition("Enquiry", "Enrolled");
    expect(info.direction).toBe("forward");
    expect(info.skippedStages).toEqual([
      "Form Sent", "Form Submitted", "Payment Done", "Exam",
      "Interview", "Doc Verification", "School Fee", "Section Allocation",
    ]);
  });

  it("classifies a backward move without ever populating skippedStages", () => {
    const info = describeLeadTransition("Enrolled", "Enquiry");
    expect(info.direction).toBe("backward");
    expect(info.skippedStages).toEqual([]);
  });

  it("classifies a no-op move to the same stage as 'same'", () => {
    const info = describeLeadTransition("Interview", "Interview");
    expect(info.direction).toBe("same");
  });

  it("classifies as 'unknown' when there is no previous status, rather than guessing", () => {
    const info = describeLeadTransition(undefined, "Enquiry");
    expect(info.direction).toBe("unknown");
  });

  it("covers every real stage in LEAD_STAGE_ORDER exactly once", () => {
    expect(LEAD_STAGE_ORDER).toHaveLength(10);
    expect(new Set(LEAD_STAGE_ORDER).size).toBe(10);
  });
});
