import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

// StudentContext's own IO boundaries (mirrors the pattern used in
// src/contexts/StudentContext.test.tsx) — the provider's real dedup/scoping
// logic runs for real here, only its external dependencies are mocked.
const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
  isMockSession: true,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role, isMockSession: authMocks.isMockSession }),
}));

vi.mock("@/hooks/useParentChildren", () => ({
  useParentChildren: () => ({ children: [] }),
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ activeBranchId: null }),
}));

vi.mock("@/lib/firebase", () => ({
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
  isFirestoreWorking: false,
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getAllByEmail: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMocks }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { StudentProvider } from "@/contexts/StudentContext";
import { TotalStudentsChart } from "./TotalStudentsChart";

function renderChart() {
  return render(
    <MemoryRouter>
      <StudentProvider>
        <TotalStudentsChart />
      </StudentProvider>
    </MemoryRouter>
  );
}

describe("TotalStudentsChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smartDbMocks.getAll.mockResolvedValue([]);
    // The admin-role path in StudentContext subscribes via smartDb.watch("Student", ...)
    // rather than getAll — the mock must actually invoke the callback (as the real
    // live-query implementation does) or loading never flips to false.
    smartDbMocks.watch.mockImplementation((entity: string, _params: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") cb([]);
      return () => {};
    });
  });

  it("shows a loading state before the student roster resolves", () => {
    smartDbMocks.watch.mockImplementation(() => () => {}); // callback never invoked -> stays loading
    renderChart();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no enrolled students", async () => {
    renderChart();
    await waitFor(() => expect(screen.getByText("No students enrolled yet.")).toBeInTheDocument());
  });

  it("groups students by status and shows each status's count", async () => {
    smartDbMocks.watch.mockImplementation((entity: string, _params: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") {
        cb([
          { id: "s1", name: "A", status: "Active" },
          { id: "s2", name: "B", status: "Active" },
          { id: "s3", name: "C", status: "Graduated" },
        ]);
      }
      return () => {};
    });
    renderChart();
    await waitFor(() => expect(screen.getByText(/Active:/)).toBeInTheDocument());
    expect(screen.getByText(/Graduated:/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // total in the donut center
  });

  it("buckets a student with no status under 'Unspecified'", async () => {
    smartDbMocks.watch.mockImplementation((entity: string, _params: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") cb([{ id: "s1", name: "A" }]);
      return () => {};
    });
    renderChart();
    await waitFor(() => expect(screen.getByText(/Unspecified:/)).toBeInTheDocument());
  });

  it("navigates to /students when Details is clicked", async () => {
    smartDbMocks.watch.mockImplementation((entity: string, _params: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") cb([{ id: "s1", name: "A", status: "Active" }]);
      return () => {};
    });
    renderChart();
    await waitFor(() => expect(screen.getByText(/Active:/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Details"));
    expect(navigateMock).toHaveBeenCalledWith("/students");
  });
});
