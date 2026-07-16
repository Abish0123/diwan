import { test, expect } from '@playwright/test';

/**
 * Navigation E2E — runs WITH storageState (the 'chromium' project).
 *
 * Tests that key sidebar links work and land on the correct pages once
 * the user is already authenticated. Also verifies the top-bar renders
 * and the layout structure is present.
 */

test.describe('Authenticated navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the authenticated dashboard to fully render
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  });

  test('landing on / renders the main dashboard layout', async ({ page }) => {
    // AppLayout renders a sidebar and a content area
    await expect(page.locator('nav').first()).toBeVisible();
    // The page title should NOT be the login portal screen
    await expect(page.getByText('Staff Portal')).not.toBeVisible();
  });

  test('clicking Students link navigates to /students', async ({ page }) => {
    await page.getByRole('link', { name: /students/i }).first().click();
    await expect(page).toHaveURL(/\/students/, { timeout: 8_000 });
    // Students page renders a search input
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('clicking Attendance link navigates to /attendance', async ({ page }) => {
    await page.getByRole('link', { name: /attendance/i }).first().click();
    await expect(page).toHaveURL(/\/attendance/, { timeout: 8_000 });
  });

  test('clicking Staff link navigates to /staff', async ({ page }) => {
    await page.getByRole('link', { name: /^staff$/i }).first().click();
    await expect(page).toHaveURL(/\/staff/, { timeout: 8_000 });
  });

  test('direct navigation to /students works without redirect', async ({ page }) => {
    await page.goto('/students');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/students/);
  });

  test('direct navigation to /attendance works without redirect', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/attendance/);
  });

  test('direct navigation to /staff works without redirect', async ({ page }) => {
    await page.goto('/staff');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/staff/);
  });

  test('navigating to a non-existent route shows 404 page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await expect(page.getByRole('heading', { name: /404|page not found/i })).toBeVisible({ timeout: 8_000 });
  });

  test('404 page Back to Dashboard link returns to /', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await page.getByRole('link', { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL('/', { timeout: 8_000 });
  });
});
