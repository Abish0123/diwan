import { test, expect } from '@playwright/test';

/**
 * Not-Found (404) page E2E — runs WITH storageState.
 *
 * The NotFound component is rendered by the catch-all <Route path="*">
 * in App.tsx. Covers:
 *  - 404 heading and descriptive text visible
 *  - "Back to Dashboard" link navigates to /
 *  - Multiple unknown paths all show the 404 page
 */

test.describe('404 / Not-Found page', () => {
  test('shows a 404 heading for an unknown route', async ({ page }) => {
    await page.goto('/this-page-definitely-does-not-exist');
    await expect(
      page.getByRole('heading', { name: /404|page not found|not found/i })
    ).toBeVisible({ timeout: 8_000 });
  });

  test('shows descriptive helper text on the 404 screen', async ({ page }) => {
    await page.goto('/another-nonexistent-route/nested');
    // NotFound renders "The page you're looking for doesn't exist" or similar
    await expect(
      page.getByText(/doesn't exist|could not be found|not found/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test('"Back to Dashboard" link navigates to /', async ({ page }) => {
    await page.goto('/nonexistent-xyz-abc');
    await page.getByRole('link', { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL('/', { timeout: 8_000 });
  });

  test('returns 404 UI for deeply nested unknown paths', async ({ page }) => {
    await page.goto('/settings/nope/not/a/real/route');
    await expect(
      page.getByRole('heading', { name: /404|page not found|not found/i })
    ).toBeVisible({ timeout: 8_000 });
  });
});
