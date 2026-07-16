// Vitest global setup — vitest.config.ts already pointed at this file, but it
// never existed, so the "test" configuration was inert (no test files could
// safely rely on jest-dom matchers, and any component test would have
// silently run without them).
import "@testing-library/jest-dom/vitest";
// vitest-axe: the distributed extend-expect.js is empty in this version, so we
// register toHaveNoViolations manually via expect.extend().
import { expect } from "vitest";
import { toHaveNoViolations } from "vitest-axe/matchers";
expect.extend({ toHaveNoViolations });

// Radix UI primitives (DropdownMenu, Dialog, Popover, etc.) use ResizeObserver
// internally. jsdom doesn't ship it, so we provide a no-op polyfill.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Radix UI also calls matchMedia (used by some primitives for responsive behaviour).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// window.confirm is used by the admissions moveLead skip-stage guard.
// Default to true so tests that click "Advance" don't hang waiting for a dialog.
if (typeof window !== "undefined") {
  window.confirm = () => true;
}

// axe-core uses HTMLCanvasElement.getContext to detect icon ligatures.
// jsdom does not implement canvas, so we stub getContext to avoid noise in stderr.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}
