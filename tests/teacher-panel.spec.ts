import { test, expect } from '@playwright/test';

/**
 * Teacher Panel UI & UX E2E — runs WITH storageState (chromium project).
 *
 * The OTP authentication step was removed from the codebase; the login flow
 * now goes directly from portal selection → email/password → dashboard.
 * storageState from the setup project handles authentication, so the
 * beforeEach only navigates to the target route.
 *
 * Teacher-specific routes (/teacher/*) are protected by ProtectedRoute.
 * The admin storageState gives full access, so these tests verify the
 * teacher panel pages render correctly for an authenticated user.
 */

test.describe('Teacher Panel UI & UX', () => {
  test('Teacher Dashboard renders with a Dashboard heading', async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Dashboard', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Teacher Attendance page renders with an Attendance heading', async ({ page }) => {
    await page.goto('/teacher/attendance');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Attendance', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Teacher Behavior page renders', async ({ page }) => {
    await page.goto('/teacher/behavior');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Behavior', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Teacher Assessments page renders', async ({ page }) => {
    await page.goto('/teacher/assessments');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Assessments', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Teacher Assignments page renders', async ({ page }) => {
    await page.goto('/teacher/assignments');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Assignments', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Teacher Study Materials page renders', async ({ page }) => {
    await page.goto('/teacher/study-materials');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Study Materials', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });
});
