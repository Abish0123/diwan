import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useLearningUniverse } from "@/hooks/useLearningUniverse";
import {
  LearningUniverseContext,
  type LearningUniverseContextType,
} from "@/contexts/LearningUniverseContextDefinition";

// useLearningUniverse is a thin useContext(LearningUniverseContext) wrapper that
// throws a descriptive error when rendered outside a LearningUniverseProvider,
// and otherwise returns the context value untouched. We test both branches
// plus that the full real shape (derived getters, CRUD actions) passes through
// unmodified.

function makeContextValue(
  overrides: Partial<LearningUniverseContextType> = {}
): LearningUniverseContextType {
  return {
    missions: [],
    attempts: [],
    transactions: [],
    shopItems: [],
    inventory: [],
    houses: [],
    memberships: [],
    housePointsLedger: [],
    loading: false,
    getWalletBalance: () => 0,
    getStudentXp: () => 0,
    getHouseStandings: () => [],
    getStudentHouse: () => undefined,
    hasPassedMission: () => false,
    createMission: async () => undefined,
    updateMission: async () => {},
    deleteMission: async () => {},
    submitMissionAttempt: async () => ({
      id: "a1",
      missionId: "m1",
      studentId: "s1",
      score: 0,
      passed: false,
      answers: [],
      attemptedAt: new Date().toISOString(),
    } as unknown as LearningUniverseContextType["attempts"][number]),
    awardOlympicsCompletion: async () => {},
    assignHouseIfMissing: async () => {},
    purchaseShopItem: async () => ({ ok: true }),
    equipInventoryItem: async () => {},
    ...overrides,
  };
}

describe("useLearningUniverse", () => {
  it("throws a descriptive error when rendered outside a LearningUniverseProvider", () => {
    // Suppress the expected React error-boundary console noise for this render.
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => renderHook(() => useLearningUniverse())).toThrow(
      "useLearningUniverse must be used within a LearningUniverseProvider"
    );

    consoleErrorSpy.mockRestore();
  });

  it("returns the exact context value provided by the nearest LearningUniverseContext.Provider", () => {
    const houseA = { id: "house-1", name: "Falcon", color: "#ff0000" } as unknown as LearningUniverseContextType["houses"][number];
    const value = makeContextValue({
      loading: true,
      houses: [houseA],
      getWalletBalance: (studentId: string) => (studentId === "s1" ? 42 : 0),
    });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(LearningUniverseContext.Provider, { value, children });

    const { result } = renderHook(() => useLearningUniverse(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.houses).toEqual([houseA]);
    expect(result.current.getWalletBalance("s1")).toBe(42);
    expect(result.current.getWalletBalance("other")).toBe(0);
    // Identity is preserved, not cloned/wrapped.
    expect(result.current).toBe(value);
  });

  it("re-renders with the new value when the provider value changes", () => {
    const first = makeContextValue({ loading: true });
    const second = makeContextValue({ loading: false, missions: [{ id: "m1" } as unknown as LearningUniverseContextType["missions"][number]] });

    let currentValue = first;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(LearningUniverseContext.Provider, { value: currentValue, children });

    const { result, rerender } = renderHook(() => useLearningUniverse(), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.missions).toEqual([]);

    currentValue = second;
    rerender();

    expect(result.current.loading).toBe(false);
    expect(result.current.missions).toEqual([{ id: "m1" }]);
  });

  it("exposes real business-logic derived getters and async actions untouched", async () => {
    const passed = new Set(["s1:m1"]);
    const value = makeContextValue({
      hasPassedMission: (missionId, studentId) =>
        passed.has(`${studentId}:${missionId}`),
      purchaseShopItem: async (studentId, shopItemId) =>
        studentId === "rich"
          ? { ok: true }
          : { ok: false, error: "insufficient funds" },
    });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(LearningUniverseContext.Provider, { value, children });

    const { result } = renderHook(() => useLearningUniverse(), { wrapper });

    expect(result.current.hasPassedMission("m1", "s1")).toBe(true);
    expect(result.current.hasPassedMission("m2", "s1")).toBe(false);

    await expect(
      result.current.purchaseShopItem("poor", "item1")
    ).resolves.toEqual({ ok: false, error: "insufficient funds" });
    await expect(
      result.current.purchaseShopItem("rich", "item1")
    ).resolves.toEqual({ ok: true });
  });
});
