import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSweepProgress } from "./useSweepProgress";

describe("useSweepProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 initially when ready is false", () => {
    const { result } = renderHook(() => useSweepProgress(1000, false));
    expect(result.current).toBe(0);
  });

  it("does not start progressing when ready is false", () => {
    const { result } = renderHook(() => useSweepProgress(1000, false));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(0);
  });

  it("starts at 0 and progresses toward 1 once ready", () => {
    const { result } = renderHook(() => useSweepProgress(1000, true));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(16);
    });
    // After first tick, progress should be > 0 but still small (eased cubic).
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(1);
  });

  it("reaches 1 once elapsed time exceeds durationMs (eased cubic ease-out)", () => {
    const { result } = renderHook(() => useSweepProgress(200, true));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe(1);
  });

  it("applies a cubic ease-out curve, not a linear ramp", () => {
    const duration = 1000;
    const { result } = renderHook(() => useSweepProgress(duration, true));

    // Advance to roughly the midpoint of the duration.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Linear progress at the midpoint would be ~0.5. The eased cubic
    // ease-out (1 - (1-p)^3) evaluated at p=0.5 is 0.875, i.e. well ahead
    // of linear — confirming the easing curve is applied, not raw p.
    expect(result.current).toBeGreaterThan(0.5);
    expect(result.current).toBeCloseTo(0.875, 1);
  });

  it("stops updating once progress reaches 1 (no further timers scheduled)", () => {
    const { result } = renderHook(() => useSweepProgress(100, true));

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(1);

    const pendingTimersBefore = vi.getTimerCount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Progress remains 1 and no lingering timer keeps rescheduling forever.
    expect(result.current).toBe(1);
    expect(vi.getTimerCount()).toBe(pendingTimersBefore);
  });

  it("resets progress to 0 and restarts when durationMs changes while ready", () => {
    const { result, rerender } = renderHook(
      ({ duration }) => useSweepProgress(duration, true),
      { initialProps: { duration: 1000 } },
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeGreaterThan(0);

    rerender({ duration: 2000 });
    // Effect re-runs synchronously on rerender (cleanup + re-init), resetting
    // progress back to 0 before the next tick fires.
    expect(result.current).toBe(0);
  });

  it("resets progress to 0 and restarts when ready toggles from true to false to true", () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useSweepProgress(200, ready),
      { initialProps: { ready: true } },
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(1);

    rerender({ ready: false });
    // Effect cleanup runs (clearing the timer), but progress state itself
    // is not reset when ready flips to false — only re-initialized to 0
    // the next time the effect body runs (ready becomes true again).
    expect(result.current).toBe(1);

    rerender({ ready: true });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(1);
  });

  it("clears the pending timer on unmount (cleanup)", () => {
    const { unmount } = renderHook(() => useSweepProgress(1000, true));
    const clearSpy = vi.spyOn(global, "clearTimeout");
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("caps progress at exactly 1 even with very short durations", () => {
    const { result } = renderHook(() => useSweepProgress(1, true));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(1);
  });
});
