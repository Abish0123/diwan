import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GradebookBand } from "@/lib/curriculumConfig";

// Mock the external DB boundary this hook touches.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

// useAuth is a different hook consumed by useGradebookStructure — mock it so
// we control `user` without pulling in the real AuthContext/Firebase stack.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useGradebookStructure } from "./useGradebookStructure";

const mockedUseAuth = vi.mocked(useAuth);

const band: GradebookBand = {
  label: "Primary (Grade 1 – 6)",
  grades: ["Grade 1", "Grade 2"],
  categories: [
    { name: "Homework", count: 10, marks: 20, isExam: false },
    { name: "Final Exam", count: 1, marks: 80, isExam: true },
  ],
  totalMarks: 100,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useGradebookStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { uid: "teacher-1" } } as any);
  });

  it("is disabled (no query, no loading) when band is null", async () => {
    const { result } = renderHook(() => useGradebookStructure("qatar", null), {
      wrapper: makeWrapper(),
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.isCustomized).toBe(false);
    expect(result.current.effectiveCategories).toEqual([]);
    expect(smartDb.getOne).not.toHaveBeenCalled();
  });

  it("falls back to the curriculum band's default categories when there is no override row", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isCustomized).toBe(false);
    expect(result.current.effectiveCategories).toEqual(band.categories);
    expect(smartDb.getOne).toHaveBeenCalledWith(
      "GradebookStructure",
      "qatar-primary-grade-1-6"
    );
  });

  it("falls back to defaults when the override row exists but has no categories field", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "qatar-primary-grade-1-6" });

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isCustomized).toBe(false);
    expect(result.current.effectiveCategories).toEqual(band.categories);
  });

  it("uses the school's override categories (normalized) when a customized row exists", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "qatar-primary-grade-1-6",
      categories: [
        { name: "  Quizzes  ", count: "5", marks: "30", isExam: false },
        { name: "", count: null, marks: 70, isExam: true },
      ],
    });

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isCustomized).toBe(true);
    expect(result.current.effectiveCategories).toEqual([
      { name: "Quizzes", count: 5, marks: 30, isExam: false },
      { name: "Untitled", count: null, marks: 70, isExam: true },
    ]);
  });

  it("computes a distinct structureId per band label so different bands don't collide", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    const secondaryBand: GradebookBand = {
      ...band,
      label: "Secondary (Grade 7 – 12)",
    };

    renderHook(() => useGradebookStructure("british", secondaryBand), {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(smartDb.getOne).toHaveBeenCalledWith(
        "GradebookStructure",
        "british-secondary-grade-7-12"
      )
    );
  });

  it("saveStructure normalizes categories, persists via smartDb.update, and updates cache to mark customized", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    (smartDb.update as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isCustomized).toBe(false);

    await act(async () => {
      await result.current.saveStructure([
        { name: "Projects", count: 3, marks: 40, isExam: false },
      ] as any);
    });

    expect(smartDb.update).toHaveBeenCalledWith(
      "GradebookStructure",
      "qatar-primary-grade-1-6",
      expect.objectContaining({
        id: "qatar-primary-grade-1-6",
        curriculumId: "qatar",
        bandLabel: band.label,
        uid: "teacher-1",
        categories: [{ name: "Projects", count: 3, marks: 40, isExam: false }],
      })
    );
    expect(smartDb.create).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.isCustomized).toBe(true));
    expect(result.current.effectiveCategories).toEqual([
      { name: "Projects", count: 3, marks: 40, isExam: false },
    ]);
  });

  it("saveStructure falls back to smartDb.create when update rejects (row doesn't exist yet)", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    (smartDb.update as any).mockRejectedValue(new Error("no such row"));
    (smartDb.create as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveStructure([
        { name: "Labs", count: 2, marks: 25, isExam: false },
      ] as any);
    });

    expect(smartDb.update).toHaveBeenCalled();
    expect(smartDb.create).toHaveBeenCalledWith(
      "GradebookStructure",
      expect.objectContaining({ categories: [{ name: "Labs", count: 2, marks: 25, isExam: false }] }),
      "qatar-primary-grade-1-6"
    );
  });

  it("saveStructure uses 'admin' as uid fallback when there is no authenticated user", async () => {
    mockedUseAuth.mockReturnValue({ user: null } as any);
    (smartDb.getOne as any).mockResolvedValue(null);
    (smartDb.update as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveStructure([]);
    });

    expect(smartDb.update).toHaveBeenCalledWith(
      "GradebookStructure",
      "qatar-primary-grade-1-6",
      expect.objectContaining({ uid: "admin" })
    );
  });

  it("saveStructure is a no-op when band is null", async () => {
    const { result } = renderHook(() => useGradebookStructure("qatar", null), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.saveStructure([{ name: "X", count: 1, marks: 10, isExam: false }]);
    });

    expect(smartDb.update).not.toHaveBeenCalled();
    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("resetToDefault deletes the override row and reverts effectiveCategories to the band defaults", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "qatar-primary-grade-1-6",
      categories: [{ name: "Custom", count: 1, marks: 100, isExam: true }],
    });
    (smartDb.delete as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isCustomized).toBe(true));

    await act(async () => {
      await result.current.resetToDefault();
    });

    expect(smartDb.delete).toHaveBeenCalledWith("GradebookStructure", "qatar-primary-grade-1-6");
    await waitFor(() => expect(result.current.isCustomized).toBe(false));
    expect(result.current.effectiveCategories).toEqual(band.categories);
  });

  it("resetToDefault swallows delete errors instead of throwing", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "qatar-primary-grade-1-6",
      categories: [{ name: "Custom", count: 1, marks: 100, isExam: true }],
    });
    (smartDb.delete as any).mockRejectedValue(new Error("row missing"));

    const { result } = renderHook(() => useGradebookStructure("qatar", band), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isCustomized).toBe(true));

    await expect(
      act(async () => {
        await result.current.resetToDefault();
      })
    ).resolves.toBeUndefined();

    await waitFor(() => expect(result.current.isCustomized).toBe(false));
  });

  it("resetToDefault is a no-op when band is null", async () => {
    const { result } = renderHook(() => useGradebookStructure("qatar", null), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.resetToDefault();
    });

    expect(smartDb.delete).not.toHaveBeenCalled();
  });
});
