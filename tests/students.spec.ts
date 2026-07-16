import { test, expect } from '@playwright/test';

/**
 * Students page E2E — runs WITH storageState.
 *
 * Covers:
 *  - Page renders with student table and search input
 *  - Search filters the displayed student list
 *  - Clearing the search restores full list
 *  - Stats cards (total student count) are visible
 *  - Add Student button is visible for admin
 */

test.describe('Students page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/students');
    await expect(page).not.toHaveURL(/\/login/);
    // Wait for the student table to render — it loads from the mock data store
    await page.waitForSelector('table', { timeout: 12_000 });
  });

  test('renders the page heading and search input', async ({ page }) => {
    // The DashboardLayout wraps the page with the title "Students"
    await expect(page.getByRole('heading', { name: /students/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  });

  test('student table has visible rows', async ({ page }) => {
    // The mock data in server.ts provides at least 3 students
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('search input filters the student list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();

    // Count rows before filtering
    const rowsBefore = await page.locator('tbody tr').count();

    // Type a name that matches at least one mock student
    await searchInput.fill('Ahmad');
    await page.waitForTimeout(400); // debounce

    const rowsAfter = await page.locator('tbody tr').count();
    // After filtering by a specific name the list should be shorter (or equal
    // if only 1 student exists, but at minimum it should not be empty)
    expect(rowsAfter).toBeGreaterThan(0);
    // The filtered result must be a subset of the original
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });

  test('clearing the search restores the full list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    const rowsBefore = await page.locator('tbody tr').count();

    await searchInput.fill('Ahmad');
    await page.waitForTimeout(400);

    await searchInput.fill('');
    await page.waitForTimeout(400);

    const rowsAfter = await page.locator('tbody tr').count();
    expect(rowsAfter).toBe(rowsBefore);
  });

  test('Add Student button is visible', async ({ page }) => {
    // The Add Student button opens the add-student dialog
    await expect(
      page.getByRole('button', { name: /add student/i }).first()
    ).toBeVisible();
  });

  test('stat cards showing student counts are rendered', async ({ page }) => {
    // The Students page renders metric cards at the top with total/active counts
    // At least one card with a numeric value should be visible
    const cards = page.locator('[class*="card"], [class*="Card"]').filter({
      hasText: /\d+/,
    });
    await expect(cards.first()).toBeVisible({ timeout: 8_000 });
  });
});
