import { describe, it, expect } from "vitest";
import { templateIdFromCurriculum } from "./curriculumTypeMap";
import { CurriculumId } from "./curriculumConfig";

describe("templateIdFromCurriculum", () => {
  it("maps the five curricula with a dedicated report-card template 1:1", () => {
    expect(templateIdFromCurriculum("cbse")).toBe("cbse");
    expect(templateIdFromCurriculum("british")).toBe("british");
    expect(templateIdFromCurriculum("ib")).toBe("ib");
    expect(templateIdFromCurriculum("american")).toBe("american");
    expect(templateIdFromCurriculum("qatar")).toBe("qatar");
  });

  it("falls back to the honest 'custom' template for curricula with no dedicated template, rather than mislabeling with an unrelated board", () => {
    const noTemplateCurricula: CurriculumId[] = ["srilankan", "pakistani", "lebanese", "egyptian", "palestinian", "sudanese"];
    noTemplateCurricula.forEach((id) => {
      expect(templateIdFromCurriculum(id)).toBe("custom");
    });
  });
});
