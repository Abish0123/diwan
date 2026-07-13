import { describe, it, expect } from "vitest";
import {
  CURRICULA,
  CURRICULUM_LIST,
  DEFAULT_CURRICULUM_ID,
  getCurriculum,
  getBandForGrade,
  getPeriodLabels,
  getDefaultSubjectsForGrade,
  type CurriculumId,
} from "./curriculumConfig";

const ALL_IDS: CurriculumId[] = [
  'british', 'american', 'ib', 'cbse', 'qatar',
  'srilankan', 'pakistani', 'lebanese', 'egyptian', 'palestinian', 'sudanese',
];

describe("CURRICULA registry", () => {
  it("contains exactly the 11 documented curricula", () => {
    expect(Object.keys(CURRICULA).sort()).toEqual([...ALL_IDS].sort());
  });

  it("each curriculum's id field matches its registry key", () => {
    for (const [key, config] of Object.entries(CURRICULA)) {
      expect(config.id).toBe(key);
    }
  });

  it("CURRICULUM_LIST contains the same configs as Object.values(CURRICULA)", () => {
    expect(CURRICULUM_LIST).toEqual(Object.values(CURRICULA));
    expect(CURRICULUM_LIST.length).toBe(11);
  });

  it("DEFAULT_CURRICULUM_ID is qatar", () => {
    expect(DEFAULT_CURRICULUM_ID).toBe('qatar');
  });
});

describe("curriculum data integrity", () => {
  it.each(ALL_IDS)("%s: annualStructure weights sum to 100 and length matches periods", (id) => {
    const c = CURRICULA[id];
    const sum = c.annualStructure.weights.reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    expect(c.annualStructure.weights.length).toBe(c.annualStructure.periods);
  });

  it.each(ALL_IDS)("%s: every gradebook band's categories sum to totalMarks (100)", (id) => {
    const c = CURRICULA[id];
    for (const band of c.gradebookBands) {
      const sum = band.categories.reduce((a, cat) => a + cat.marks, 0);
      expect(sum).toBe(band.totalMarks);
    }
  });

  it.each(ALL_IDS)("%s: every grade appears in at least one gradebook band", (id) => {
    const c = CURRICULA[id];
    const bandedGrades = new Set(c.gradebookBands.flatMap(b => b.grades));
    for (const grade of c.grades) {
      expect(bandedGrades.has(grade)).toBe(true);
    }
  });

  it.each(ALL_IDS)("%s: every grade appears in at least one subject band", (id) => {
    const c = CURRICULA[id];
    const bandedGrades = new Set(c.subjectBands.flatMap(b => b.grades));
    for (const grade of c.grades) {
      expect(bandedGrades.has(grade)).toBe(true);
    }
  });

  it.each(ALL_IDS)("%s: earlyYears + primary + middle + secondary grades are all in grades list", (id) => {
    const c = CURRICULA[id];
    const allBanded = [...c.earlyYears, ...c.primary, ...c.middle, ...c.secondary];
    for (const grade of allBanded) {
      expect(c.grades).toContain(grade);
    }
  });
});

describe("getCurriculum", () => {
  it("returns the matching curriculum for a valid id", () => {
    expect(getCurriculum('british').id).toBe('british');
    expect(getCurriculum('cbse').id).toBe('cbse');
  });

  it("falls back to the default curriculum for an unknown id", () => {
    expect(getCurriculum('nonexistent')).toBe(CURRICULA[DEFAULT_CURRICULUM_ID]);
  });

  it("falls back to the default curriculum for an empty string", () => {
    expect(getCurriculum('')).toBe(CURRICULA[DEFAULT_CURRICULUM_ID]);
  });
});

describe("getBandForGrade", () => {
  it("returns the correct band for a grade present in the curriculum", () => {
    const qatar = CURRICULA.qatar;
    const band = getBandForGrade(qatar, 'Grade 3');
    expect(band?.label).toBe('Primary (Grade 1 – 6)');
  });

  it("returns the correct band for a boundary grade at the edge of a band", () => {
    const qatar = CURRICULA.qatar;
    const band = getBandForGrade(qatar, 'Grade 9');
    expect(band?.label).toBe('Middle School (Grade 7 – 9)');
  });

  it("returns null when the grade doesn't belong to any band", () => {
    const qatar = CURRICULA.qatar;
    expect(getBandForGrade(qatar, 'Grade 99')).toBeNull();
  });

  it("returns null for an empty-string grade", () => {
    const qatar = CURRICULA.qatar;
    expect(getBandForGrade(qatar, '')).toBeNull();
  });
});

describe("getPeriodLabels", () => {
  it("generates 3 term labels for a 3-term curriculum", () => {
    expect(getPeriodLabels(CURRICULA.qatar)).toEqual(['Term 1', 'Term 2', 'Term 3']);
  });

  it("generates 2 semester labels for a 2-semester curriculum", () => {
    expect(getPeriodLabels(CURRICULA.american)).toEqual(['Semester 1', 'Semester 2']);
  });

  it("generates 2 term labels for a 2-term curriculum", () => {
    expect(getPeriodLabels(CURRICULA.cbse)).toEqual(['Term 1', 'Term 2']);
  });
});

describe("getDefaultSubjectsForGrade", () => {
  it("returns the subject list for a grade present in a subject band", () => {
    const subjects = getDefaultSubjectsForGrade(CURRICULA.qatar, 'Grade 2');
    expect(subjects).toEqual(['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education']);
  });

  it("returns an empty array when the grade isn't in any subject band", () => {
    expect(getDefaultSubjectsForGrade(CURRICULA.qatar, 'Grade 99')).toEqual([]);
  });

  it("returns an empty array for an empty-string grade", () => {
    expect(getDefaultSubjectsForGrade(CURRICULA.qatar, '')).toEqual([]);
  });

  it("returns the science-stream default for CBSE Grade 11-12 (elective ambiguity documented in source)", () => {
    const subjects = getDefaultSubjectsForGrade(CURRICULA.cbse, 'Grade 11');
    expect(subjects).toContain('Physics');
    expect(subjects).toContain('Biology / Computer Science');
  });
});
