import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  user: null as { email?: string; displayName?: string; name?: string } | null,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user }),
}));

const studentsMock = vi.hoisted(() => ({
  students: [] as any[],
  loading: false,
}));
vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => ({ students: studentsMock.students, loading: studentsMock.loading }),
}));

const getOneMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getOne: (...args: unknown[]) => getOneMock(...args) },
}));

import { useTeacherClass } from "./useTeacherClass";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useTeacherClass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
    studentsMock.students = [];
    studentsMock.loading = false;
    getOneMock.mockResolvedValue(null);
  });

  it("falls back to DEFAULT_CLASS and reports isDefaultFallback while the record is loading (no user)", () => {
    authMock.user = null;

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    // No user.email means the query is disabled, so rec stays undefined.
    expect(result.current.assignment).toEqual({
      grade: "Grade 3",
      section: "B",
      classId: "ihix7893xc",
      className: "Grade 3 Section B",
      room: "205",
      subject: "Mathematics",
      teacherName: "Mr. Rizwan Ahmed",
    });
    // rec is undefined (never fetched) -> isDefaultFallback is false per hook logic
    expect(result.current.isDefaultFallback).toBe(false);
    expect(result.current.recLoading).toBe(false);
    expect(getOneMock).not.toHaveBeenCalled();
  });

  it("uses assignedGrade/assignedSection fields when present on the teacher record", async () => {
    authMock.user = { email: "teacher@school.test", displayName: "Ms. Priya Nair" };
    getOneMock.mockResolvedValue({
      email: "teacher@school.test",
      assignedGrade: "Grade 5",
      assignedSection: "C",
      assignedClassId: "class-5c-id",
      assignedClassName: "Grade 5 Section C (Custom)",
      room: "301",
      subject: "Science",
    });

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(getOneMock).toHaveBeenCalledWith("User", "teacher@school.test");
    expect(result.current.assignment).toEqual({
      grade: "Grade 5",
      section: "C",
      classId: "class-5c-id",
      className: "Grade 5 Section C (Custom)",
      room: "301",
      subject: "Science",
      teacherName: "Ms. Priya Nair",
    });
    expect(result.current.isDefaultFallback).toBe(false);
  });

  it("parses the real classSection field (e.g. 'Grade 1-A') when assignedGrade/assignedSection are absent", async () => {
    authMock.user = { email: "teacher2@school.test", displayName: "Mr. Sami Khan" };
    getOneMock.mockResolvedValue({
      email: "teacher2@school.test",
      classSection: "Grade 1-A",
      classId: "class-1a-id",
      room: "110",
      subject: "English",
    });

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.assignment).toEqual({
      grade: "Grade 1",
      section: "A",
      classId: "class-1a-id",
      className: "Grade 1-A",
      room: "110",
      subject: "English",
      teacherName: "Mr. Sami Khan",
    });
    expect(result.current.isDefaultFallback).toBe(false);
  });

  it("parses a space-separated classSection like 'Grade 2 B'", async () => {
    authMock.user = { email: "teacher3@school.test", displayName: "Ms. Dana" };
    getOneMock.mockResolvedValue({
      email: "teacher3@school.test",
      classSection: "Grade 2 B",
    });

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.assignment.grade).toBe("Grade 2");
    expect(result.current.assignment.section).toBe("B");
    // room/subject/classId fall back to DEFAULT_CLASS values when absent on the record
    expect(result.current.assignment.room).toBe(DEFAULT_ROOM);
    expect(result.current.assignment.subject).toBe(DEFAULT_SUBJECT);
    expect(result.current.assignment.classId).toBe(DEFAULT_CLASS_ID);
  });

  it("falls back to DEFAULT_CLASS and sets isDefaultFallback=true when the record has no homeroom data", async () => {
    authMock.user = { email: "unassigned@school.test", displayName: "Ms. Unassigned" };
    getOneMock.mockResolvedValue({ email: "unassigned@school.test" }); // no assignedGrade/classSection

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.assignment.grade).toBe("Grade 3");
    expect(result.current.assignment.section).toBe("B");
    expect(result.current.assignment.classId).toBe("ihix7893xc");
    // teacherName still comes from auth's displayName, not DEFAULT_CLASS
    expect(result.current.assignment.teacherName).toBe("Ms. Unassigned");
    expect(result.current.isDefaultFallback).toBe(true);
  });

  // KNOWN BUG: isDefaultFallback's early guard is `if (!r) return false;`, which
  // was meant to distinguish "still loading" (rec undefined) from "confirmed no
  // homeroom data". But smartDb.getOne's own .catch(() => null) means a genuine
  // fetch FAILURE also resolves rec to null — falsy, same as "still loading" —
  // so a teacher whose record lookup errored out is silently treated as NOT a
  // default-fallback (isDefaultFallback stays false) even though assignment has
  // in fact fallen all the way through to DEFAULT_CLASS. Callers relying on
  // isDefaultFallback to show an honest "not assigned" banner would show
  // nothing here, silently presenting DEFAULT_CLASS's Grade 3-B roster as if it
  // were real. Documenting current behavior, not asserting it's correct.
  it("falls back to DEFAULT_CLASS assignment but reports isDefaultFallback=false when the record fetch fails (getOne rejects)", async () => {
    authMock.user = { email: "broken@school.test" };
    getOneMock.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    // .catch(() => null) swallows the error, so rec resolves to null, which is
    // falsy and hits the "still loading" branch of isDefaultFallback's guard.
    expect(result.current.isDefaultFallback).toBe(false);
    expect(result.current.assignment.grade).toBe("Grade 3");
  });

  it("uses the DEFAULT_CLASS teacherName only when auth has no displayName/name and the record has none either", async () => {
    authMock.user = { email: "noname@school.test" };
    getOneMock.mockResolvedValue({ email: "noname@school.test" });

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.assignment.teacherName).toBe("Mr. Rizwan Ahmed");
  });

  it("prefers the record's displayName/name over DEFAULT_CLASS teacherName when auth provides no name", async () => {
    authMock.user = { email: "recname@school.test" }; // no displayName/name on auth user
    getOneMock.mockResolvedValue({ email: "recname@school.test", displayName: "Ms. Recorded Name" });

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.assignment.teacherName).toBe("Ms. Recorded Name");
  });

  it("filters classStudents to only students matching the resolved grade+section", async () => {
    authMock.user = { email: "t@school.test" };
    getOneMock.mockResolvedValue({
      email: "t@school.test",
      assignedGrade: "Grade 5",
      assignedSection: "B",
    });
    studentsMock.students = [
      { id: "s1", name: "In Class", grade: "Grade 5", section: "B" },
      { id: "s2", name: "Wrong Section", grade: "Grade 5", section: "A" },
      { id: "s3", name: "Wrong Grade", grade: "Grade 6", section: "B" },
      { id: "s4", name: "Classid Fallback", classId: "Grade 5-B" },
    ];

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    const names = result.current.classStudents.map((s: any) => s.name).sort();
    expect(names).toEqual(["Classid Fallback", "In Class"]);
  });

  it("passes through the students-context loading flag as `loading`, independent of recLoading", () => {
    authMock.user = null;
    studentsMock.loading = true;

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
  });

  it("returns an empty classStudents list when there are no students at all", async () => {
    authMock.user = { email: "t2@school.test" };
    getOneMock.mockResolvedValue(null);
    studentsMock.students = [];

    const { result } = renderHook(() => useTeacherClass(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.recLoading).toBe(false));

    expect(result.current.classStudents).toEqual([]);
  });
});

const DEFAULT_ROOM = "205";
const DEFAULT_SUBJECT = "Mathematics";
const DEFAULT_CLASS_ID = "ihix7893xc";
