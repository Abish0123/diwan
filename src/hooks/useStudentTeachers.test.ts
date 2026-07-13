import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

import { useStudentTeachers } from "./useStudentTeachers";

describe("useStudentTeachers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading=false and blank fields immediately when student is null/undefined", () => {
    const { result } = renderHook(() => useStudentTeachers(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.classTeacher).toBe("");
    expect(result.current.gradeCoordinator).toBe("");
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("returns loading=false and blank fields when the student has no resolvable grade", () => {
    const { result } = renderHook(() => useStudentTeachers({}));

    expect(result.current.loading).toBe(false);
    expect(result.current.classTeacher).toBe("");
    expect(result.current.gradeCoordinator).toBe("");
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("starts loading and resolves classTeacher + gradeCoordinator for a matching grade+section", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([
          { grade: "Grade 5", section: "B", teacher: "Ms. Johnson" },
          { grade: "Grade 5", section: "A", teacher: "Mr. Smith" },
        ]);
      }
      if (entity === "GradeCoordinator") {
        return Promise.resolve([{ grade: "Grade 5", name: "Dr. Adams" }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 5", section: "B" }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAllMock).toHaveBeenCalledWith("Class", undefined);
    expect(getAllMock).toHaveBeenCalledWith("GradeCoordinator", undefined);
    expect(result.current.classTeacher).toBe("Ms. Johnson");
    expect(result.current.gradeCoordinator).toBe("Dr. Adams");
  });

  it("canonicalizes grade/section formats so 'Grade 5'/'5' and 'B'/'Section B' match", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([{ grade: "5", section: "Section B", teacher: "Ms. Johnson" }]);
      }
      if (entity === "GradeCoordinator") {
        return Promise.resolve([{ grade: "grade 5", name: "Dr. Adams" }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 5", section: "B" }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classTeacher).toBe("Ms. Johnson");
    expect(result.current.gradeCoordinator).toBe("Dr. Adams");
  });

  it("falls back to parsing classId for grade/section when grade/section fields are blank", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([{ grade: "Grade 3", section: "A", teacher: "Mrs. Lee" }]);
      }
      if (entity === "GradeCoordinator") {
        return Promise.resolve([{ grade: "Grade 3", name: "Mr. Khan" }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ classId: "Grade 3-A" }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAllMock).toHaveBeenCalled();
    expect(result.current.classTeacher).toBe("Mrs. Lee");
    expect(result.current.gradeCoordinator).toBe("Mr. Khan");
  });

  it("derives the Class section from `name` when the Class row has no explicit section field", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([{ grade: "Grade 4", name: "Grade 4 Section C", teacher: "Ms. Rivera" }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 4", section: "C" }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classTeacher).toBe("Ms. Rivera");
  });

  it("trims whitespace from resolved teacher/coordinator names", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([{ grade: "Grade 2", section: "A", teacher: "  Mr. Park  " }]);
      }
      if (entity === "GradeCoordinator") {
        return Promise.resolve([{ grade: "Grade 2", name: "  Ms. Diaz  " }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 2", section: "A" }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classTeacher).toBe("Mr. Park");
    expect(result.current.gradeCoordinator).toBe("Ms. Diaz");
  });

  it("returns blank classTeacher/gradeCoordinator when no Class/GradeCoordinator row matches", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([{ grade: "Grade 9", section: "A", teacher: "Mr. Other" }]);
      }
      if (entity === "GradeCoordinator") {
        return Promise.resolve([{ grade: "Grade 9", name: "Someone Else" }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 1", section: "A" }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classTeacher).toBe("");
    expect(result.current.gradeCoordinator).toBe("");
  });

  it("clears state and stops loading if smartDb.getAll rejects", async () => {
    getAllMock.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useStudentTeachers({ grade: "Grade 5", section: "B" }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classTeacher).toBe("");
    expect(result.current.gradeCoordinator).toBe("");
  });

  it("re-fetches when grade or section changes on rerender", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") {
        return Promise.resolve([
          { grade: "Grade 5", section: "A", teacher: "Mr. Smith" },
          { grade: "Grade 6", section: "A", teacher: "Ms. Nolan" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result, rerender } = renderHook(
      ({ grade, section }) => useStudentTeachers({ grade, section }),
      { initialProps: { grade: "Grade 5", section: "A" } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.classTeacher).toBe("Mr. Smith");

    rerender({ grade: "Grade 6", section: "A" });

    await waitFor(() => expect(result.current.classTeacher).toBe("Ms. Nolan"));
  });
});
