import { describe, it, expect } from "vitest";
import { generateConflictFreeSchedule, type SubjectAssignment } from "./aiTimetableGenerator";

function countTeacherConflicts(grids: Record<string, ReturnType<typeof generateConflictFreeSchedule>["grids"][string]>) {
  // For every day+period across every generated class, no teacher should
  // appear more than once — this is the scheduler's core correctness
  // guarantee, so it's asserted directly rather than trusting the
  // implementation's own bookkeeping.
  const busy = new Map<string, Set<string>>();
  let conflicts = 0;
  Object.values(grids).forEach((grid) => {
    grid.forEach((row, period) => row.forEach((cell, day) => {
      if (!cell) return;
      const key = `${day}-${period}`;
      const set = busy.get(key) || new Set<string>();
      if (set.has(cell.teacher)) conflicts++;
      set.add(cell.teacher);
      busy.set(key, set);
    }));
  });
  return conflicts;
}

describe("generateConflictFreeSchedule", () => {
  it("never double-books a teacher across two different classes at the same day+period", () => {
    const assignments: SubjectAssignment[] = [
      { grade: "Grade 5", section: "A", subject: "Mathematics", teacherName: "Mr. Khan" },
      { grade: "Grade 5", section: "A", subject: "Science", teacherName: "Ms. Rao" },
      { grade: "Grade 5", section: "B", subject: "Mathematics", teacherName: "Mr. Khan" }, // same teacher, different class
      { grade: "Grade 5", section: "B", subject: "English", teacherName: "Ms. Ali" },
    ];
    const { grids } = generateConflictFreeSchedule(
      [{ grade: "Grade 5", section: "A" }, { grade: "Grade 5", section: "B" }],
      assignments
    );
    expect(countTeacherConflicts(grids)).toBe(0);
  });

  it("respects pre-existing teacher commitments from classes not being regenerated", () => {
    const assignments: SubjectAssignment[] = [
      { grade: "Grade 6", section: "A", subject: "Mathematics", teacherName: "Mr. Khan" },
    ];
    // Mr. Khan is already committed to every single day+period elsewhere.
    const existingBusy = new Map<string, Set<string>>();
    for (let period = 0; period < 5; period++) {
      for (let day = 0; day < 6; day++) {
        existingBusy.set(`${day}-${period}`, new Set(["Mr. Khan"]));
      }
    }
    const { grids, warnings } = generateConflictFreeSchedule(
      [{ grade: "Grade 6", section: "A" }],
      assignments,
      existingBusy
    );
    // Every period must be left free (null) rather than double-booking Mr. Khan.
    const grid = grids["Grade 6-A"];
    const filledCount = grid.flat().filter((c) => c !== null).length;
    expect(filledCount).toBe(0);
    expect(warnings.some((w) => w.includes("Grade 6-A"))).toBe(true);
  });

  it("reports a class with no subject assignments instead of fabricating a schedule", () => {
    const { grids, warnings } = generateConflictFreeSchedule(
      [{ grade: "Grade 9", section: "Z" }],
      []
    );
    expect(grids["Grade 9-Z"].flat().every((c) => c === null)).toBe(true);
    expect(warnings.some((w) => w.includes("Grade 9-Z"))).toBe(true);
  });

  it("distributes real subjects across the week rather than leaving them unused", () => {
    const assignments: SubjectAssignment[] = [
      { grade: "Grade 4", section: "A", subject: "Mathematics", teacherName: "Mr. A" },
      { grade: "Grade 4", section: "A", subject: "Science", teacherName: "Ms. B" },
      { grade: "Grade 4", section: "A", subject: "English", teacherName: "Ms. C" },
    ];
    const { grids } = generateConflictFreeSchedule([{ grade: "Grade 4", section: "A" }], assignments);
    const subjectsUsed = new Set(grids["Grade 4-A"].flat().filter(Boolean).map((c) => c!.subject));
    expect(subjectsUsed.size).toBe(3);
  });
});
