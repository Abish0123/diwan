import { test, expect } from '@playwright/test';

/**
 * Attendance page E2E — runs WITH storageState.
 *
 * Covers:
 *  - Page renders with tabs (Students / Staff)
 *  - Student attendance tab is active by default
 *  - Rows are shown (mock student data)
 *  - Staff tab switches the view
 *  - Date picker is present
 *  - Download button is present
 */

test.describe('Attendance page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/attendance');
    await expect(page).not.toHaveURL(/\/login/);
    // Wait for content to load
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  });

  test('renders the Attendance page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /attendance/i }).first()).toBeVisible();
  });

  test('shows Student and Staff tab options', async ({ page }) => {
    // The Attendance page has tabs: "Students" and "Staff"
    await expect(page.getByRole('tab', { name: /students/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('tab', { name: /staff/i })).toBeVisible({ timeout: 8_000 });
  });

  test('student attendance tab shows a list of students', async ({ page }) => {
    // The student tab is active by default — a table or list of student rows should show
    const studentTab = page.getByRole('tab', { name: /students/i });
    await studentTab.click();
    await page.waitForTimeout(600);

    // At least one row or card should appear
    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      await expect(rows.first()).toBeVisible();
    } else {
      // Some layouts render attendance as cards/list items instead of a table
      const items = page.locator('[class*="attendance"], [data-testid*="student"]');
      await expect(items.first()).toBeVisible({ timeout: 6_000 });
    }
  });

  test('clicking the Staff tab switches the attendance view', async ({ page }) => {
    const staffTab = page.getByRole('tab', { name: /staff/i });
    await staffTab.click();
    await page.waitForTimeout(600);

    // The tab should now be active / selected
    await expect(staffTab).toHaveAttribute('data-state', 'active');
  });

  test('a date selector is visible on the attendance page', async ({ page }) => {
    // The attendance page always shows a date — either a <input type="date">
    // or a button-based date picker
    const datePicker = page.locator('input[type="date"], button[aria-label*="date"], button[aria-label*="Date"]').first();
    await expect(datePicker).toBeVisible({ timeout: 8_000 });
  });

  test('Download/Export button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /download|export/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
