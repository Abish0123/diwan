import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

const MOBILE_BREAKPOINT = 768;

function setInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

function makeMatchMedia() {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: window.innerWidth < MOBILE_BREAKPOINT,
    media: `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_event: string, cb: () => void) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };
  return { mql, listeners };
}

describe("useIsMobile", () => {
  let matchMediaSpy: ReturnType<typeof vi.fn>;
  let currentMql: ReturnType<typeof makeMatchMedia>;

  beforeEach(() => {
    currentMql = makeMatchMedia();
    matchMediaSpy = vi.fn().mockImplementation(() => currentMql.mql);
    window.matchMedia = matchMediaSpy as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false (desktop) when innerWidth is at/above the breakpoint", () => {
    setInnerWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true (mobile) when innerWidth is below the breakpoint", () => {
    setInnerWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("boundary: exactly at MOBILE_BREAKPOINT (768) is NOT mobile", () => {
    setInnerWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("boundary: one pixel below breakpoint (767) IS mobile", () => {
    setInnerWidth(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("registers a matchMedia change listener with the correct query on mount", () => {
    setInnerWidth(1024);
    renderHook(() => useIsMobile());
    expect(matchMediaSpy).toHaveBeenCalledWith(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    );
    expect(currentMql.mql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("updates isMobile when the media query change event fires and width crossed the breakpoint", () => {
    setInnerWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setInnerWidth(400);
      currentMql.listeners.forEach((cb) => cb());
    });

    expect(result.current).toBe(true);
  });

  it("updates isMobile back to false when width returns above the breakpoint", () => {
    setInnerWidth(400);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => {
      setInnerWidth(1200);
      currentMql.listeners.forEach((cb) => cb());
    });

    expect(result.current).toBe(false);
  });

  it("removes the change listener on unmount", () => {
    setInnerWidth(1024);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(currentMql.mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("coerces the initial undefined state to a boolean (false) via !!isMobile", () => {
    // Before the effect runs, internal state is `undefined`; the hook must
    // still return a real boolean (`false`), never `undefined`, even
    // synchronously on first render.
    setInnerWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });
});
