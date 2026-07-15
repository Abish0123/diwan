import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * webServer block starts both servers before any test runs:
 *   1. Express API server (port 3001) — serves /api/* routes
 *   2. Vite dev server  (port 3000) — serves the React app + proxies /api to 3001
 *
 * Tests run only against Chromium in this project. The `storageState` path
 * is written by tests/setup/auth.setup.ts (the "setup" project) and then
 * re-used by every authenticated spec so each test starts already logged in.
 */

export const STORAGE_STATE = 'tests/setup/.auth/admin.json';

export default defineConfig({
  testDir: './tests',
  /* Run each test file in sequence inside a file; files run in parallel */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['line'],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    /* Capture a trace + screenshot on first retry so failures are debuggable */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Consistent viewport across all tests */
    viewport: { width: 1280, height: 720 },
    /* Always run in English so text assertions are deterministic */
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    /* ── 1. Auth setup — runs once, writes storageState ───────────────── */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* ── 2. Authenticated specs — depend on setup ─────────────────────── */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth\.spec\.ts/,
    },

    /* ── 3. Auth spec — runs without storageState (tests the login UI) ── */
    {
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: [],
    },
  ],

  /* Start both servers before any test. reuseExistingServer:true lets the
     suite run when the dev server is already up (e.g. during development). */
  webServer: [
    {
      /* Express API server on port 3001 */
      command: 'cross-env PORT=3001 DB_HOST="" DATABASE_URL="" tsx server.ts',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      /* Vite dev server on port 3000 (proxies /api → 3001) */
      command: 'vite',
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
