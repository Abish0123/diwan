import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useActiveSubjectAssignment } from "@/hooks/useActiveSubject";
import { useAuth } from "@/hooks/useAuth";
import type { SubjectAssignment } from "@/hooks/useMySubjects";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function makeSubjects(): SubjectAssignment[] {
  return [
    { id: "a1", grade: "Grade 5", section: "B", subject: "Math", teacherName: "Jane Doe", createdAt: "2026-01-01" },
    { id: "a2", grade: "Grade 5", section: "C", subject: "Science", teacherName: "Jane Doe", createdAt: "2026-01-01" },
    { id: "a3", grade: "Grade 6", section: "A", subject: "Math", teacherName: "Jane Doe", createdAt: "2026-01-01" },
  ];
}

describe("useActiveSubjectAssignment", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedUseAuth.mockReturnValue({ user: { email: "teacher@school.test" } } as any);
  });

  it("starts with null active subject before subjects load", () => {
    const { result } = renderHook(() => useActiveSubjectAssignment([]));
    const [activeSubject] = result.current;
    expect(activeSubject).toBeNull();
  });

  it("defaults to the first subject once subjects load with no saved selection", async () => {
    const subjects = makeSubjects();
    const { result, rerender } = renderHook(
      ({ subs }) => useActiveSubjectAssignment(subs),
      { initialProps: { subs: [] as SubjectAssignment[] } }
    );

    expect(result.current[0]).toBeNull();

    rerender({ subs: subjects });

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });
    expect(result.current[0]?.id).toBe("a1");
  });

  it("restores the previously saved selection from sessionStorage on mount", async () => {
    sessionStorage.setItem("sd_active_subject_teacher@school.test", "a2");
    const subjects = makeSubjects();

    const { result } = renderHook(() => useActiveSubjectAssignment(subjects));

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a2");
    });
  });

  it("falls back to the first subject if the saved id no longer exists in mySubjects", async () => {
    sessionStorage.setItem("sd_active_subject_teacher@school.test", "does-not-exist");
    const subjects = makeSubjects();

    const { result } = renderHook(() => useActiveSubjectAssignment(subjects));

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });
    expect(result.current[0]?.id).toBe("a1");
  });

  it("setActiveSubject updates state and persists the choice to sessionStorage", async () => {
    const subjects = makeSubjects();
    const { result } = renderHook(() => useActiveSubjectAssignment(subjects));

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });

    act(() => {
      result.current[1](subjects[2]);
    });

    expect(result.current[0]?.id).toBe("a3");
    expect(sessionStorage.getItem("sd_active_subject_teacher@school.test")).toBe("a3");
  });

  it("keeps the current selection across rerenders when it is still present in mySubjects", async () => {
    const subjects = makeSubjects();
    const { result, rerender } = renderHook(
      ({ subs }) => useActiveSubjectAssignment(subs),
      { initialProps: { subs: subjects } }
    );

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });

    act(() => {
      result.current[1](subjects[1]);
    });
    expect(result.current[0]?.id).toBe("a2");

    // Re-render with the same subjects (e.g. a fresh array reference from a refetch)
    rerender({ subs: [...subjects] });

    // Selection should be preserved, not reset back to mySubjects[0]
    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a2");
    });
  });

  it("resets to the first subject if the currently active subject is removed from mySubjects", async () => {
    const subjects = makeSubjects();
    const { result, rerender } = renderHook(
      ({ subs }) => useActiveSubjectAssignment(subs),
      { initialProps: { subs: subjects } }
    );

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });

    act(() => {
      result.current[1](subjects[2]); // select "a3"
    });
    expect(result.current[0]?.id).toBe("a3");

    // Now a3 is no longer in the list (e.g. teacher's assignment was removed)
    const remaining = subjects.filter(s => s.id !== "a3");
    rerender({ subs: remaining });

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });
  });

  it("scopes the sessionStorage key per-user email", async () => {
    const subjects = makeSubjects();
    const { result } = renderHook(() => useActiveSubjectAssignment(subjects));

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });

    act(() => {
      result.current[1](subjects[1]);
    });

    expect(sessionStorage.getItem("sd_active_subject_teacher@school.test")).toBe("a2");
    expect(sessionStorage.getItem("sd_active_subject_anon")).toBeNull();
  });

  it("falls back to 'anon' key when there is no authenticated user", async () => {
    mockedUseAuth.mockReturnValue({ user: null } as any);
    const subjects = makeSubjects();
    const { result } = renderHook(() => useActiveSubjectAssignment(subjects));

    await waitFor(() => {
      expect(result.current[0]?.id).toBe("a1");
    });

    act(() => {
      result.current[1](subjects[0]);
    });

    expect(sessionStorage.getItem("sd_active_subject_anon")).toBe("a1");
  });

  it("does nothing when mySubjects is empty even if a saved selection exists", () => {
    sessionStorage.setItem("sd_active_subject_teacher@school.test", "a1");
    const { result } = renderHook(() => useActiveSubjectAssignment([]));
    expect(result.current[0]).toBeNull();
  });
});
