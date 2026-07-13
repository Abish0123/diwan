// Vitest global setup — vitest.config.ts already pointed at this file, but it
// never existed, so the "test" configuration was inert (no test files could
// safely rely on jest-dom matchers, and any component test would have
// silently run without them).
import "@testing-library/jest-dom/vitest";

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
