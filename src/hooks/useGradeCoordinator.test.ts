import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  user: null as { email: string } | null,
  role: null as string | null,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user, role: authMock.role }),
}));

const getOneMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getOne: (...args: unknown[]) => getOneMock(...args) },
}));

import { useGradeCoordinator } from "./useGradeCoordinator";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useGradeCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
    authMock.role = null;
    getOneMock.mockResolvedValue(undefined);
  });

  it("returns isGradeCoordinator=false and no assignedGrade for a non-coordinator role", async () => {
    authMock.user = { email: "teacher@school.test" };
    authMock.role = "class_teacher";

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    expect(result.current.isGradeCoordinator).toBe(false);
    expect(result.current.assignedGrade).toBeNull();
    expect(result.current.loading).toBe(false);
    // Query must never fire for a role that isn't grade_coordinator.
    expect(getOneMock).not.toHaveBeenCalled();
  });

  it("does not query and reports not-loading when there is no user, even for a grade_coordinator role", async () => {
    authMock.user = null;
    authMock.role = "grade_coordinator";

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    expect(result.current.isGradeCoordinator).toBe(true);
    expect(result.current.assignedGrade).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(getOneMock).not.toHaveBeenCalled();
  });

  it("resolves the assigned grade from the user's record for a grade_coordinator", async () => {
    authMock.user = { email: "coord@school.test" };
    authMock.role = "grade_coordinator";
    getOneMock.mockResolvedValue({ email: "coord@school.test", coordinatorGrade: "Grade 7" });

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getOneMock).toHaveBeenCalledWith("User", "coord@school.test");
    expect(result.current.assignedGrade).toBe("Grade 7");
    expect(result.current.isGradeCoordinator).toBe(true);
  });

  it("returns null assignedGrade (not a default) when the coordinator has no grade assigned yet", async () => {
    authMock.user = { email: "unassigned@school.test" };
    authMock.role = "grade_coordinator";
    getOneMock.mockResolvedValue({ email: "unassigned@school.test" }); // no coordinatorGrade field

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignedGrade).toBeNull();
  });

  it("returns null assignedGrade when the user record itself doesn't exist", async () => {
    authMock.user = { email: "ghost@school.test" };
    authMock.role = "grade_coordinator";
    getOneMock.mockResolvedValue(null); // smartDb.getOne resolves null for a missing record

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignedGrade).toBeNull();
  });

  it("resolves legacy 'coordinator' role alias to grade_coordinator and queries accordingly", async () => {
    authMock.user = { email: "legacy@school.test" };
    authMock.role = "coordinator"; // ALIASES maps this to grade_coordinator
    getOneMock.mockResolvedValue({ email: "legacy@school.test", coordinatorGrade: "Grade 3" });

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isGradeCoordinator).toBe(true);
    expect(getOneMock).toHaveBeenCalledWith("User", "legacy@school.test");
    expect(result.current.assignedGrade).toBe("Grade 3");
  });

  it("never exposes loading=true for non-coordinator roles even while a stray query would be pending", async () => {
    authMock.user = { email: "principal@school.test" };
    authMock.role = "principal";
    // Even if getOne were slow, loading must reflect the role gate, not query pendingness.
    getOneMock.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGradeCoordinator(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(false);
    expect(getOneMock).not.toHaveBeenCalled();
  });
});
