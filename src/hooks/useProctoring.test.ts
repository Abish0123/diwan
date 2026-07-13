import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProctoring } from "./useProctoring";
import { ProctoringSettings, VIOLATION_WEIGHTS } from "@/types/coding";

function fireVisibilityHidden() {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
}
function resetVisibility() {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
}

function baseSettings(overrides: Partial<ProctoringSettings> = {}): ProctoringSettings {
  return {
    id: "global",
    cameraMonitoring: true,
    faceVerification: true,
    multipleFaceDetection: true,
    mobileDetection: true,
    audioMonitoring: true,
    tabSwitchingDetection: true,
    fullScreenMonitoring: true,
    weights: { ...VIOLATION_WEIGHTS },
    ...overrides,
  };
}

describe("useProctoring", () => {
  afterEach(() => {
    resetVisibility();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts with no violations, full integrity score, and Safe status", () => {
    const { result } = renderHook(() => useProctoring({ active: false, simulateAi: false }));
    expect(result.current.violations).toEqual([]);
    expect(result.current.integrityScore).toBe(100);
    expect(result.current.status).toBe("Safe");
  });

  it("does not attach browser listeners when inactive", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useProctoring({ active: false, simulateAi: false }));
    expect(addSpy).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("records a tab-switch violation on visibilitychange when active and tab detection enabled", () => {
    const onViolation = vi.fn();
    const { result } = renderHook(() =>
      useProctoring({ active: true, simulateAi: false, onViolation })
    );

    act(() => {
      fireVisibilityHidden();
    });

    expect(result.current.violations).toHaveLength(1);
    expect(result.current.violations[0].type).toBe("tab-switch");
    expect(result.current.violations[0].weight).toBe(VIOLATION_WEIGHTS["tab-switch"]);
    expect(result.current.violations[0].simulated).toBe(false);
    expect(onViolation).toHaveBeenCalledTimes(1);
    expect(onViolation.mock.calls[0][0].type).toBe("tab-switch");
  });

  it("records a window-blur violation on window blur", () => {
    const { result } = renderHook(() => useProctoring({ active: true, simulateAi: false }));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.violations).toHaveLength(1);
    expect(result.current.violations[0].type).toBe("window-blur");
  });

  it("records a fullscreen-exit violation when fullscreen is exited", () => {
    const { result } = renderHook(() => useProctoring({ active: true, simulateAi: false }));
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.violations).toHaveLength(1);
    expect(result.current.violations[0].type).toBe("fullscreen-exit");
  });

  it("records a copy-paste violation on paste, regardless of settings gating", () => {
    const settings = baseSettings({ tabSwitchingDetection: false, fullScreenMonitoring: false });
    const { result } = renderHook(() => useProctoring({ active: true, simulateAi: false, settings }));
    act(() => {
      window.dispatchEvent(new Event("paste"));
    });
    expect(result.current.violations).toHaveLength(1);
    expect(result.current.violations[0].type).toBe("copy-paste");
  });

  it("does not record tab-switch when tabSwitchingDetection is disabled in settings", () => {
    const settings = baseSettings({ tabSwitchingDetection: false });
    const { result } = renderHook(() =>
      useProctoring({ active: true, simulateAi: false, settings })
    );
    act(() => {
      fireVisibilityHidden();
    });
    expect(result.current.violations).toHaveLength(0);
  });

  it("does not record window-blur when tabSwitchingDetection is disabled (blur shares the tabOn gate)", () => {
    const settings = baseSettings({ tabSwitchingDetection: false });
    const { result } = renderHook(() =>
      useProctoring({ active: true, simulateAi: false, settings })
    );
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.violations).toHaveLength(0);
  });

  it("does not record fullscreen-exit when fullScreenMonitoring is disabled", () => {
    const settings = baseSettings({ fullScreenMonitoring: false });
    const { result } = renderHook(() =>
      useProctoring({ active: true, simulateAi: false, settings })
    );
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.violations).toHaveLength(0);
  });

  it("uses custom weight from settings.weights instead of the default VIOLATION_WEIGHTS", () => {
    const settings = baseSettings({ weights: { ...VIOLATION_WEIGHTS, "tab-switch": 999 } });
    const { result } = renderHook(() =>
      useProctoring({ active: true, simulateAi: false, settings })
    );
    act(() => {
      fireVisibilityHidden();
    });
    expect(result.current.violations[0].weight).toBe(999);
    expect(result.current.integrityScore).toBe(0); // clamped at 0, not negative
  });

  it("computes integrityScore as 100 minus total weight, and derives status from thresholds", () => {
    const { result } = renderHook(() => useProctoring({ active: true, simulateAi: false }));

    // tab-switch (10) + window-blur (5) = 15 -> score 85 -> Safe (>=85)
    act(() => {
      fireVisibilityHidden();
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.integrityScore).toBe(85);
    expect(result.current.status).toBe("Safe");

    // add fullscreen-exit (10) -> total 25 -> score 75 -> Warning (>=65, <85)
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.integrityScore).toBe(75);
    expect(result.current.status).toBe("Warning");
  });

  it("prepends new violations so the most recent one is first", () => {
    const { result } = renderHook(() => useProctoring({ active: true, simulateAi: false }));
    act(() => {
      fireVisibilityHidden();
    });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.violations.map((v) => v.type)).toEqual(["window-blur", "tab-switch"]);
  });

  it("record() exposed directly can add manual violations and setViolations can clear them", () => {
    const { result } = renderHook(() => useProctoring({ active: false, simulateAi: false }));
    act(() => {
      result.current.record("copy-paste", "manual test");
    });
    expect(result.current.violations).toHaveLength(1);
    expect(result.current.violations[0].detail).toBe("manual test");

    act(() => {
      result.current.setViolations([]);
    });
    expect(result.current.violations).toHaveLength(0);
    expect(result.current.integrityScore).toBe(100);
  });

  it("removes browser event listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useProctoring({ active: true, simulateAi: false }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });

  describe("simulated AI vision monitoring", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("does not schedule simulated events when simulateAi is false", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      renderHook(() => useProctoring({ active: true, simulateAi: false }));
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("emits a simulated violation on the 12s tick when Math.random rolls into the first bucket", () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.01); // within looking-away's 0.35 prob bucket
      const { result } = renderHook(() =>
        useProctoring({ active: true, simulateAi: true })
      );

      act(() => {
        vi.advanceTimersByTime(12000);
      });

      expect(result.current.violations).toHaveLength(1);
      expect(result.current.violations[0].type).toBe("looking-away");
      expect(result.current.violations[0].simulated).toBe(true);
      randomSpy.mockRestore();
    });

    it("emits no simulated violation when Math.random rolls above all cumulative probabilities", () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
      const { result } = renderHook(() =>
        useProctoring({ active: true, simulateAi: true })
      );
      act(() => {
        vi.advanceTimersByTime(12000);
      });
      expect(result.current.violations).toHaveLength(0);
      randomSpy.mockRestore();
    });

    it("excludes gated-off simulated categories from the probability pool", () => {
      // Only faceVerification is on; everything else off. Roll high enough that
      // it would have matched mobile-phone/multiple-faces/audio-voice if they were in the pool.
      const settings = baseSettings({
        faceVerification: true,
        mobileDetection: false,
        multipleFaceDetection: false,
        audioMonitoring: false,
      });
      // looking-away (0.35) + face-missing (0.18) = 0.53 total pool with only faceVerification on
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.6);
      const { result } = renderHook(() =>
        useProctoring({ active: true, simulateAi: true, settings })
      );
      act(() => {
        vi.advanceTimersByTime(12000);
      });
      expect(result.current.violations).toHaveLength(0);
      randomSpy.mockRestore();
    });

    it("does not schedule simulated monitoring when all AI categories are gated off", () => {
      const settings = baseSettings({
        faceVerification: false,
        mobileDetection: false,
        multipleFaceDetection: false,
        audioMonitoring: false,
      });
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      renderHook(() => useProctoring({ active: true, simulateAi: true, settings }));
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("clears the simulated-monitoring interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");
      const { unmount } = renderHook(() =>
        useProctoring({ active: true, simulateAi: true })
      );
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
