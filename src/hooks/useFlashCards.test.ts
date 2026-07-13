import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFlashCards } from "./useFlashCards";
import {
  FlashCardContext,
  FlashCardContextType,
} from "../contexts/FlashCardContextDefinition";

describe("useFlashCards", () => {
  it("throws when used outside a FlashCardProvider", () => {
    // Suppress the expected React error log from renderHook throwing.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useFlashCards())).toThrow(
      "useFlashCards must be used within a FlashCardProvider"
    );
    consoleSpy.mockRestore();
  });

  it("returns the context value when rendered within a FlashCardContext.Provider", () => {
    const value: FlashCardContextType = {
      sets: [
        {
          id: "set-1",
          title: "Algebra Basics",
          subject: "Math",
          grade: "Grade 8",
          cards: [],
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        } as unknown as FlashCardContextType["sets"][number],
      ],
      assignedSets: [],
      aiGeneratedSets: [],
      analytics: [],
      addSet: vi.fn(),
      updateSet: vi.fn(),
      deleteSet: vi.fn(),
      assignSet: vi.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(FlashCardContext.Provider, { value }, children);

    const { result } = renderHook(() => useFlashCards(), { wrapper });

    expect(result.current.sets).toHaveLength(1);
    expect(result.current.sets[0].title).toBe("Algebra Basics");
    expect(result.current.assignedSets).toEqual([]);
    expect(result.current.aiGeneratedSets).toEqual([]);
    expect(result.current.analytics).toEqual([]);
    expect(typeof result.current.addSet).toBe("function");
    expect(typeof result.current.updateSet).toBe("function");
    expect(typeof result.current.deleteSet).toBe("function");
    expect(typeof result.current.assignSet).toBe("function");
  });

  it("exposes the same function references passed via context value (no wrapping/mutation)", () => {
    const addSet = vi.fn();
    const updateSet = vi.fn();
    const deleteSet = vi.fn();
    const assignSet = vi.fn();

    const value: FlashCardContextType = {
      sets: [],
      assignedSets: [],
      aiGeneratedSets: [],
      analytics: [],
      addSet,
      updateSet,
      deleteSet,
      assignSet,
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(FlashCardContext.Provider, { value }, children);

    const { result } = renderHook(() => useFlashCards(), { wrapper });

    result.current.addSet({} as never);
    result.current.updateSet("id", {});
    result.current.deleteSet("id");
    result.current.assignSet("id", ["a", "b"]);

    expect(addSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith("id", {});
    expect(deleteSet).toHaveBeenCalledWith("id");
    expect(assignSet).toHaveBeenCalledWith("id", ["a", "b"]);
  });
});
