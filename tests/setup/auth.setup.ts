import { test as setup } from '@playwright/test';
import { STORAGE_STATE } from '../../playwright.config';

/**
 * Auth setup — runs once before all authenticated specs.
 *
 * Navigates to the login page, selects the Staff portal (which auto-fills
 * the demo credentials teacher@studentdiwan.com / demo1234), submits the
 * form, waits for the dashboard, then saves the browser's storage state
 * (cookies + localStorage) so every authenticated test starts already
 * signed in without repeating the full login flow.
 *
 * Demo accounts used:
 *   Staff:   teacher@studentdiwan.com  / demo1234
 *   Student: student@studentdiwan.com  / demo1234
 *   Parent:  parent@studentdiwan.com   / demo1234
 *
 * For admin-level operations that need full permissions (DELETE, settings)
 * the server also accepts:
 *   admin@eduerp.com / admin123   (SQLite preview mock account)
 */
setup('authenticate as admin and save storage state', async ({ page }) => {
  await page.goto('/');

  // The login page starts on the portal selection step.
  // Click the Staff Portal card — selectPortal() fills in the demo credentials.
  await page.getByText('Staff Portal').click();

  // Wait for the email field (login form step) to appear.
  await page.getByLabel('Email or Login ID').waitFor({ state: 'visible' });

  // Clear and fill admin credentials so the saved session has admin-level access.
  await page.getByLabel('Email or Login ID').fill('admin@eduerp.com');
  await page.getByLabel('Password').fill('admin123');

  // Submit
  await page.getByRole('button', { name: /sign in to/i }).click();

  // Wait until we have left the login page — the dashboard (or home route)
  // must be visible before we save state.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 20_000,
  });

  // Persist browser state (sessionStorage token lives here).
  await page.context().storageState({ path: STORAGE_STATE });
});
