import { Page } from '@playwright/test';

/**
 * Shared E2E login helpers.
 *
 * selectPortal   — clicks a portal card on the portal-selection step.
 * loginAs        — full login flow: portal → fill credentials → submit → wait for dashboard.
 * fillLoginForm  — fills email + password after a portal is already selected (does not submit).
 */

export type Portal = 'Staff Portal' | 'Student Portal' | 'Parent Portal';

/** Click a portal card and wait for the login form to appear. */
export async function selectPortal(page: Page, portal: Portal) {
  await page.getByText(portal).click();
  await page.getByLabel('Email or Login ID').waitFor({ state: 'visible' });
}

/** Fill login credentials (call after selectPortal). */
export async function fillLoginForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email or Login ID').fill(email);
  await page.getByLabel('Password').fill(password);
}

/** Full login flow → waits until URL is no longer /login. */
export async function loginAs(
  page: Page,
  portal: Portal,
  email: string,
  password: string,
  timeout = 20_000,
) {
  await page.goto('/');
  await selectPortal(page, portal);
  await fillLoginForm(page, email, password);
  await page.getByRole('button', { name: /sign in to/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout });
}
