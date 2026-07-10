// Vitest global setup — vitest.config.ts already pointed at this file, but it
// never existed, so the "test" configuration was inert (no test files could
// safely rely on jest-dom matchers, and any component test would have
// silently run without them).
import "@testing-library/jest-dom/vitest";
