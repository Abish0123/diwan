import { describe, it, expect } from "vitest";
import { canonGrade, canonSection, studentGrade, studentSection, matchesGradeSection, classSection } from "./studentGradeSection";

describe("canonGrade", () => {
  it("strips the 'Grade' prefix and normalizes case/whitespace", () => {
    expect(canonGrade("Grade 5")).toBe("5");
    expect(canonGrade("grade 5")).toBe("5");
    expect(canonGrade("  Grade   5  ")).toBe("5");
  });

  it("leaves named early-years grades untouched (just normalized)", () => {
    expect(canonGrade("KG1")).toBe("kg1");
    expect(canonGrade("Pre-KG")).toBe("pre-kg");
  });

  it("treats a bare number the same as a Grade-prefixed one", () => {
    expect(canonGrade("5")).toBe(canonGrade("Grade 5"));
  });

  it("handles undefined/empty input without throwing", () => {
    expect(canonGrade(undefined)).toBe("");
    expect(canonGrade("")).toBe("");
  });
});

describe("canonSection", () => {
  it("strips a 'Section' prefix and uppercases", () => {
    expect(canonSection("Section B")).toBe("B");
    expect(canonSection("b")).toBe("B");
    expect(canonSection(" B ")).toBe("B");
  });
});

describe("studentGrade / studentSection — classId fallback", () => {
  it("prefers the explicit grade/section field when present", () => {
    const s = { grade: "Grade 3", section: "A", classId: "Grade 9-Z" };
    expect(studentGrade(s)).toBe("Grade 3");
    expect(studentSection(s)).toBe("A");
  });

  it("falls back to parsing classId when grade/section are blank", () => {
    const s = { classId: "Grade 1-A" };
    expect(studentGrade(s)).toBe("Grade 1");
    expect(studentSection(s)).toBe("A");
  });

  it("returns empty string when neither field nor classId is present", () => {
    expect(studentGrade({})).toBe("");
    expect(studentSection({})).toBe("");
  });
});

describe("matchesGradeSection", () => {
  it("matches grade+section regardless of representation differences", () => {
    const student = { grade: "5", section: "b" };
    expect(matchesGradeSection(student, "Grade 5", "B")).toBe(true);
    expect(matchesGradeSection(student, "Grade 5", "Section B")).toBe(true);
  });

  it("does not match a different section", () => {
    const student = { grade: "Grade 5", section: "A" };
    expect(matchesGradeSection(student, "Grade 5", "B")).toBe(false);
  });

  it("matches on grade alone when no section is passed", () => {
    const student = { grade: "Grade 5", section: "A" };
    expect(matchesGradeSection(student, "Grade 5", "")).toBe(true);
  });

  it("does not match a different grade even with the same section", () => {
    const student = { grade: "Grade 5", section: "A" };
    expect(matchesGradeSection(student, "Grade 6", "A")).toBe(false);
  });
});

describe("classSection", () => {
  it("prefers the explicit section field", () => {
    expect(classSection({ section: "B", name: "Grade 5 Section A" })).toBe("B");
  });

  it("parses the section out of a 'Section X' suffix in name", () => {
    expect(classSection({ name: "Grade 5 Section C" })).toBe("C");
  });

  it("parses the section out of a '-X' suffix in name", () => {
    expect(classSection({ name: "Grade 5-D" })).toBe("D");
  });

  it("returns empty string when no section can be determined", () => {
    expect(classSection({ name: "Grade 5" })).toBe("");
  });
});
