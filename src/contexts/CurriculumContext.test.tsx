import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// Mock the external DB boundary that useCurriculum's loadCurriculumId touches.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { DEFAULT_CURRICULUM_ID, getCurriculum, getPeriodLabels } from "@/lib/curriculumConfig";
import { saveCurriculumId, _curriculumListeners } from "@/hooks/useCurriculum";
import {
  CurriculumProvider,
  useCurriculumContext,
  useGrades,
  useTerms,
} from "./CurriculumContext";

// Small test consumer that surfaces context values as text/data-attributes
// so assertions can read real derived values, not just "did it render".
function Consumer() {
  const ctx = useCurriculumContext();
  const grades = useGrades();
  const terms = useTerms();
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="curriculumId">{ctx.curriculumId}</span>
      <span data-testid="curriculumName">{ctx.curriculum.name}</span>
      <span data-testid="gradesCount">{grades.length}</span>
      <span data-testid="firstGrade">{grades[0]}</span>
      <span data-testid="terms">{terms.join(",")}</span>
      <span data-testid="ctxGradesMatch">{String(grades === ctx.grades)}</span>
      <span data-testid="ctxTermsMatch">{String(terms === ctx.terms)}</span>
    </div>
  );
}

async function resetCacheTo(id: string) {
  await act(async () => {
    await saveCurriculumId(id as any);
  });
}

describe("CurriculumContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _curriculumListeners.clear();
  });

  it("provides the default qatar curriculum's grades/terms before smartDb resolves, then loads the real id", async () => {
    let resolveGetOne: (v: any) => void = () => {};
    (smartDb.getOne as any).mockImplementation(
      () => new Promise((resolve) => { resolveGetOne = resolve; })
    );

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    // Before the async load resolves, curriculumId is still the default.
    expect(screen.getByTestId("curriculumId").textContent).toBe(DEFAULT_CURRICULUM_ID);
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await act(async () => {
      resolveGetOne({ id: "active_curriculum", curriculumId: "british" });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("curriculumId").textContent).toBe("british");
    expect(screen.getByTestId("curriculumName").textContent).toBe("British / Cambridge");

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("derives grades and terms matching the real curriculum config (qatar defaults)", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: DEFAULT_CURRICULUM_ID });

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    const qatar = getCurriculum(DEFAULT_CURRICULUM_ID);
    expect(screen.getByTestId("gradesCount").textContent).toBe(String(qatar.grades.length));
    expect(screen.getByTestId("firstGrade").textContent).toBe(qatar.grades[0]);
    expect(screen.getByTestId("terms").textContent).toBe(getPeriodLabels(qatar).join(","));
    // Qatar is a 3-term curriculum.
    expect(screen.getByTestId("terms").textContent).toBe("Term 1,Term 2,Term 3");
  });

  it("switches grades/terms when curriculum changes to a 2-semester curriculum (american)", async () => {
    (smartDb.update as any).mockResolvedValue(undefined);
    // The module-level cache from useCurriculum persists across tests in this
    // file, so explicitly warm it to "american" before mounting the provider
    // (mirrors the pattern used in useCurriculum.test.ts).
    await resetCacheTo("american");

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("curriculumId").textContent).toBe("american");
    const american = getCurriculum("american");
    expect(screen.getByTestId("firstGrade").textContent).toBe(american.grades[0]);
    expect(screen.getByTestId("terms").textContent).toBe("Semester 1,Semester 2");

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("reacts to saveCurriculumId (external listener notification) by refreshing curriculumId, grades, and terms", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: DEFAULT_CURRICULUM_ID });
    (smartDb.update as any).mockResolvedValue(undefined);

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("curriculumId").textContent).toBe(DEFAULT_CURRICULUM_ID);

    await act(async () => {
      await saveCurriculumId("ib");
    });

    await waitFor(() => expect(screen.getByTestId("curriculumId").textContent).toBe("ib"));
    expect(screen.getByTestId("curriculumName").textContent).toBe("IB Curriculum");
    expect(screen.getByTestId("terms").textContent).toBe("Semester 1,Semester 2");

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("falls back to DEFAULT_CURRICULUM_ID when smartDb.getOne rejects", async () => {
    (smartDb.getOne as any).mockRejectedValue(new Error("db down"));

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("curriculumId").textContent).toBe(DEFAULT_CURRICULUM_ID);
    expect(screen.getByTestId("curriculumName").textContent).toBe(getCurriculum(DEFAULT_CURRICULUM_ID).name);
  });

  it("useGrades/useTerms return referentially the same arrays exposed on the context value (memoized)", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: DEFAULT_CURRICULUM_ID });

    render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("ctxGradesMatch").textContent).toBe("true");
    expect(screen.getByTestId("ctxTermsMatch").textContent).toBe("true");
  });

  it("useCurriculumContext used without a Provider falls back to the default context value (qatar, loading=true)", () => {
    function Bare() {
      const ctx = useCurriculumContext();
      return (
        <div>
          <span data-testid="bareLoading">{String(ctx.loading)}</span>
          <span data-testid="bareCurriculumId">{ctx.curriculumId}</span>
        </div>
      );
    }
    render(<Bare />);
    expect(screen.getByTestId("bareLoading").textContent).toBe("true");
    expect(screen.getByTestId("bareCurriculumId").textContent).toBe(DEFAULT_CURRICULUM_ID);
  });

  it("unmounting the provider removes its listener from _curriculumListeners", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: DEFAULT_CURRICULUM_ID });

    const { unmount } = render(
      <CurriculumProvider>
        <Consumer />
      </CurriculumProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(_curriculumListeners.size).toBeGreaterThan(0);

    unmount();
    expect(_curriculumListeners.size).toBe(0);
  });
});
