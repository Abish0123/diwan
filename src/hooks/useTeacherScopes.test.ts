import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeacherScopes } from "./useTeacherScopes";

function mockFetchOnce(body: unknown, ok = true) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe("useTeacherScopes", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches from the subject_assignments endpoint on mount", async () => {
    mockFetchOnce([]);
    renderHook(() => useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/data/subject_assignments");
    });
  });

  it("starts with empty assignments and scopes containing only the homeroom before fetch resolves", () => {
    // Never-resolving fetch so we can inspect the pre-resolution state.
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    expect(result.current.assignments).toEqual([]);
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("unions homeroom with subject-teacher assignments matching the teacher's name (case/whitespace-insensitive)", async () => {
    mockFetchOnce([
      { teacherName: "  Jane Doe ", grade: "Grade 6", section: "a", subject: "Math" },
      { teacherName: "JANE DOE", grade: "Grade 7", section: "c", subject: "Science" },
      { teacherName: "Someone Else", grade: "Grade 8", section: "D", subject: "English" },
    ]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );

    await waitFor(() => expect(result.current.assignments.length).toBe(3));

    // scopes should include homeroom + both matching assignments, but not "Someone Else"'s class
    expect(result.current.scopes).toEqual(
      expect.arrayContaining([
        { grade: "Grade 5", section: "B" },
        { grade: "Grade 6", section: "A" },
        { grade: "Grade 7", section: "C" },
      ])
    );
    expect(result.current.scopes).toHaveLength(3);
    expect(
      result.current.scopes.some(s => s.grade === "Grade 8" && s.section === "D")
    ).toBe(false);
  });

  it("uppercases the section for every scope entry", async () => {
    mockFetchOnce([{ teacherName: "Jane Doe", grade: "Grade 6", section: "a", subject: "Math" }]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "b" })
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    expect(result.current.scopes.every(s => s.section === s.section.toUpperCase())).toBe(true);
    expect(result.current.scopes).toEqual(
      expect.arrayContaining([
        { grade: "Grade 5", section: "B" },
        { grade: "Grade 6", section: "A" },
      ])
    );
  });

  it("dedupes assignments that resolve to the same (grade, section) pair, including duplicates of the homeroom itself", async () => {
    mockFetchOnce([
      { teacherName: "Jane Doe", grade: "Grade 5", section: "B", subject: "Math" }, // same as homeroom
      { teacherName: "Jane Doe", grade: "Grade 5", section: "b", subject: "Science" }, // same, different case
      { teacherName: "Jane Doe", grade: "Grade 6", section: "C", subject: "English" },
    ]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(3));
    expect(result.current.scopes).toHaveLength(2);
    expect(result.current.scopes).toEqual(
      expect.arrayContaining([
        { grade: "Grade 5", section: "B" },
        { grade: "Grade 6", section: "C" },
      ])
    );
  });

  it("dedupes grade case-insensitively (Grade 5 vs grade 5 collapse to one entry)", async () => {
    mockFetchOnce([
      { teacherName: "Jane Doe", grade: "grade 5", section: "B", subject: "Math" },
    ]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    // Only the homeroom's casing survives since it was added first and the key already existed.
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("does not add scopes for assignments missing a grade or section", async () => {
    mockFetchOnce([
      { teacherName: "Jane Doe", grade: "", section: "C", subject: "Math" },
      { teacherName: "Jane Doe", grade: "Grade 9", section: "", subject: "Science" },
    ]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(2));
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("ignores assignments when myName is blank/whitespace-only, returning just the homeroom", async () => {
    mockFetchOnce([
      { teacherName: "Jane Doe", grade: "Grade 6", section: "A", subject: "Math" },
    ]);
    const { result } = renderHook(() => useTeacherScopes("   ", { grade: "Grade 5", section: "B" }));
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("filters out assignments belonging to other teachers", async () => {
    mockFetchOnce([
      { teacherName: "Other Teacher", grade: "Grade 6", section: "A", subject: "Math" },
    ]);
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("falls back to empty assignments when the fetched payload is not an array", async () => {
    mockFetchOnce({ not: "an array" });
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => {
      expect(result.current.assignments).toEqual([]);
    });
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("falls back to empty assignments when fetch rejects (network error)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => {
      expect(result.current.assignments).toEqual([]);
    });
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("falls back to empty assignments when response.json() rejects (invalid JSON)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error("bad json")),
    });
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "Grade 5", section: "B" })
    );
    await waitFor(() => {
      expect(result.current.assignments).toEqual([]);
    });
    expect(result.current.scopes).toEqual([{ grade: "Grade 5", section: "B" }]);
  });

  it("returns no scopes at all when homeroom is empty and no assignments match", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useTeacherScopes("Jane Doe", { grade: "", section: "" })
    );
    expect(result.current.scopes).toEqual([]);
  });

  it("recomputes scopes when myName changes across a rerender", async () => {
    mockFetchOnce([
      { teacherName: "Alice", grade: "Grade 6", section: "A", subject: "Math" },
      { teacherName: "Bob", grade: "Grade 7", section: "B", subject: "Science" },
    ]);
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useTeacherScopes(name, { grade: "Grade 5", section: "Z" }),
      { initialProps: { name: "Alice" } }
    );
    await waitFor(() => expect(result.current.assignments.length).toBe(2));
    expect(result.current.scopes).toEqual(
      expect.arrayContaining([
        { grade: "Grade 5", section: "Z" },
        { grade: "Grade 6", section: "A" },
      ])
    );
    expect(result.current.scopes).toHaveLength(2);

    rerender({ name: "Bob" });
    expect(result.current.scopes).toEqual(
      expect.arrayContaining([
        { grade: "Grade 5", section: "Z" },
        { grade: "Grade 7", section: "B" },
      ])
    );
    expect(result.current.scopes).toHaveLength(2);
  });
});
