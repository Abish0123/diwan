import { describe, it, expect } from "vitest";
import {
  subjectsForGrade,
  findSubjectByCode,
  SEED_SUBJECTS,
  CURRICULUM_PRESETS,
  PRESET_CURRICULA,
  CURRICULUM_COLORS,
  Subject,
} from "./subjectRegistry";

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "SUBJ-1",
    code: "MAT101",
    name: "Mathematics",
    grades: ["Grade 6", "Grade 7"],
    status: "Active",
    ...overrides,
  };
}

describe("subjectsForGrade", () => {
  it("returns [] when grade is empty string", () => {
    const subjects = [makeSubject()];
    expect(subjectsForGrade(subjects, "")).toEqual([]);
  });

  it("returns [] when grade is undefined/falsy", () => {
    const subjects = [makeSubject()];
    // @ts-expect-error testing runtime guard against falsy input
    expect(subjectsForGrade(subjects, undefined)).toEqual([]);
  });

  it("filters out subjects not assigned to the given grade", () => {
    const subjects = [
      makeSubject({ code: "MAT101", grades: ["Grade 6"] }),
      makeSubject({ code: "ENG101", grades: ["Grade 9"] }),
    ];
    const result = subjectsForGrade(subjects, "Grade 6");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("MAT101");
  });

  it("filters out Inactive subjects even if grade matches", () => {
    const subjects = [
      makeSubject({ code: "MAT101", grades: ["Grade 6"], status: "Active" }),
      makeSubject({ code: "OLD101", grades: ["Grade 6"], status: "Inactive" }),
    ];
    const result = subjectsForGrade(subjects, "Grade 6");
    expect(result.map(s => s.code)).toEqual(["MAT101"]);
  });

  it("returns [] when no subjects match the grade", () => {
    const subjects = [makeSubject({ grades: ["Grade 9"] })];
    expect(subjectsForGrade(subjects, "Grade 1")).toEqual([]);
  });

  it("returns [] when given an empty subjects array", () => {
    expect(subjectsForGrade([], "Grade 6")).toEqual([]);
  });

  it("sorts matching subjects alphabetically by name", () => {
    const subjects = [
      makeSubject({ code: "SCI101", name: "Science", grades: ["Grade 6"] }),
      makeSubject({ code: "ART101", name: "Art", grades: ["Grade 6"] }),
      makeSubject({ code: "MAT101", name: "Mathematics", grades: ["Grade 6"] }),
    ];
    const result = subjectsForGrade(subjects, "Grade 6");
    expect(result.map(s => s.name)).toEqual(["Art", "Mathematics", "Science"]);
  });

  it("does not mutate the input subjects array order", () => {
    const subjects = [
      makeSubject({ code: "SCI101", name: "Science", grades: ["Grade 6"] }),
      makeSubject({ code: "ART101", name: "Art", grades: ["Grade 6"] }),
    ];
    const original = [...subjects];
    subjectsForGrade(subjects, "Grade 6");
    expect(subjects).toEqual(original);
  });

  it("includes a subject taught in multiple grades when queried by any one of them", () => {
    const subjects = [makeSubject({ grades: ["Grade 1", "Grade 6", "Grade 12"] })];
    expect(subjectsForGrade(subjects, "Grade 12")).toHaveLength(1);
  });
});

describe("findSubjectByCode", () => {
  it("finds the subject with a matching code", () => {
    const subjects = [
      makeSubject({ code: "MAT101" }),
      makeSubject({ code: "ENG101", name: "English" }),
    ];
    const result = findSubjectByCode(subjects, "ENG101");
    expect(result?.name).toBe("English");
  });

  it("returns undefined when no subject matches the code", () => {
    const subjects = [makeSubject({ code: "MAT101" })];
    expect(findSubjectByCode(subjects, "NOPE999")).toBeUndefined();
  });

  it("returns undefined for an empty subjects array", () => {
    expect(findSubjectByCode([], "MAT101")).toBeUndefined();
  });

  it("is case-sensitive on code matching", () => {
    const subjects = [makeSubject({ code: "MAT101" })];
    expect(findSubjectByCode(subjects, "mat101")).toBeUndefined();
  });

  it("returns the first match when duplicate codes exist", () => {
    const first = makeSubject({ code: "DUP101", name: "First" });
    const second = makeSubject({ code: "DUP101", name: "Second" });
    const result = findSubjectByCode([first, second], "DUP101");
    expect(result?.name).toBe("First");
  });
});

describe("SEED_SUBJECTS", () => {
  it("has unique subject codes", () => {
    const codes = SEED_SUBJECTS.map(s => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("marks every seed subject Active with a non-empty grades list", () => {
    for (const s of SEED_SUBJECTS) {
      expect(s.status).toBe("Active");
      expect(s.grades.length).toBeGreaterThan(0);
    }
  });

  it("includes core subjects taught across all school grades", () => {
    const english = SEED_SUBJECTS.find(s => s.code === "ENG101");
    expect(english?.grades).toContain("Grade 1");
    expect(english?.grades).toContain("Grade 12");
  });

  it("restricts secondary-only subjects (e.g. Physics) to Grade 9-12", () => {
    const physics = SEED_SUBJECTS.find(s => s.code === "PHY201");
    expect(physics?.grades).not.toContain("Grade 1");
    expect(physics?.grades).toEqual(
      expect.arrayContaining(["Grade 9", "Grade 10", "Grade 11", "Grade 12"])
    );
  });
});

describe("CURRICULUM_PRESETS", () => {
  it("every preset has at least one grade and one subject", () => {
    for (const preset of CURRICULUM_PRESETS) {
      expect(preset.grades.length).toBeGreaterThan(0);
      expect(preset.subjects.length).toBeGreaterThan(0);
    }
  });

  it("every preset subject has a non-empty code and name", () => {
    for (const preset of CURRICULUM_PRESETS) {
      for (const subj of preset.subjects) {
        expect(subj.code).toBeTruthy();
        expect(subj.name).toBeTruthy();
      }
    }
  });

  it("contains presets for all five supported curricula", () => {
    const curricula = new Set(CURRICULUM_PRESETS.map(p => p.curriculum));
    expect(curricula).toEqual(new Set(["CBSE", "British", "Qatar", "American", "IB"]));
  });
});

describe("PRESET_CURRICULA", () => {
  it("contains each curriculum exactly once, in first-seen order", () => {
    expect(PRESET_CURRICULA).toEqual(["CBSE", "British", "Qatar", "American", "IB"]);
  });
});

describe("CURRICULUM_COLORS", () => {
  it("has a color entry for every curriculum referenced in PRESET_CURRICULA", () => {
    for (const curriculum of PRESET_CURRICULA) {
      expect(CURRICULUM_COLORS[curriculum]).toBeDefined();
      expect(CURRICULUM_COLORS[curriculum].bg).toBeTruthy();
      expect(CURRICULUM_COLORS[curriculum].text).toBeTruthy();
      expect(CURRICULUM_COLORS[curriculum].border).toBeTruthy();
    }
  });
});
