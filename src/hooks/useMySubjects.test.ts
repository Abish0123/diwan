import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// useAuth — only `user.displayName`/`user.name` matters here.
const authMock = vi.hoisted(() => ({
  user: null as { displayName?: string; name?: string } | null,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user }),
}));

// fetch — the real external boundary (/api/data/subject_assignments).
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { useMySubjects } from "./useMySubjects";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) };
}

const ALL_ASSIGNMENTS = [
  { id: "1", grade: "5", section: "A", subject: "Math", teacherName: "Jane Doe", createdAt: "2026-01-01" },
  { id: "2", grade: "5", section: "B", subject: "Science", teacherName: "  JANE DOE  ", createdAt: "2026-01-02" },
  { id: "3", grade: "6", section: "A", subject: "English", teacherName: "John Smith", createdAt: "2026-01-03" },
];

describe("useMySubjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
  });

  it("starts in a loading state before the fetch resolves", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    authMock.user = { displayName: "Jane Doe" };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.assignments).toEqual([]);
    expect(result.current.allAssignments).toEqual([]);
  });

  it("fetches from /api/data/subject_assignments and exposes all assignments", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = null;

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith("/api/data/subject_assignments");
    expect(result.current.allAssignments).toEqual(ALL_ASSIGNMENTS);
  });

  it("filters `assignments` to rows whose teacherName matches the current user's displayName, case/whitespace-insensitively", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = { displayName: "jane doe" };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignments).toHaveLength(2);
    expect(result.current.assignments.map(a => a.id).sort()).toEqual(["1", "2"]);
  });

  it("falls back to user.name when displayName is absent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = { name: "John Smith" };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignments).toHaveLength(1);
    expect(result.current.assignments[0].id).toBe("3");
  });

  it("returns an empty `assignments` array (not all rows) when there is no authenticated user", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = null;

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignments).toEqual([]);
    // but the raw fetched rows are still exposed via allAssignments
    expect(result.current.allAssignments).toEqual(ALL_ASSIGNMENTS);
  });

  it("returns an empty `assignments` array when the user's name is blank/whitespace-only", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = { displayName: "   " };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignments).toEqual([]);
  });

  it("defaults allAssignments/assignments to [] when the API returns a non-array payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "not an array" }));
    authMock.user = { displayName: "Jane Doe" };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allAssignments).toEqual([]);
    expect(result.current.assignments).toEqual([]);
  });

  it("exposes `reload` (react-query's refetch) which re-invokes fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_ASSIGNMENTS));
    authMock.user = { displayName: "Jane Doe" };

    const { result } = renderHook(() => useMySubjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await result.current.reload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.assignments).toHaveLength(2);
  });
});
