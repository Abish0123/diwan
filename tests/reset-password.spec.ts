import { test, expect } from '@playwright/test';

/**
 * Reset Password page E2E — public route, no storageState needed.
 *
 * The reset-password page has two distinct states:
 *  1. No token in URL  → shows "Invalid reset link" screen
 *  2. Token present   → shows the new-password form
 *
 * We test state 1 directly. State 2 is tested with a dummy token (the
 * server will reject it, but the form must render and validate client-side).
 *
 * Covers:
 *  - Missing token renders the invalid-link screen
 *  - Invalid-link screen has a "Back to Login" button that navigates to /login
 *  - With a dummy token the form renders
 *  - Password too short triggers a toast error (client-side, no server call)
 *  - Mismatched passwords triggers a toast error (client-side, no server call)
 *  - Invalid token returns a server error message
 */

test.describe('Reset Password — missing token', () => {
  test('shows "Invalid reset link" when no token is in the URL', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /invalid reset link/i })).toBeVisible();
  });

  test('"Back to Login" on the invalid-link screen navigates to /login', async ({ page }) => {
    await page.goto('/reset-password');
    await page.getByRole('button', { name: /back to login/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

test.describe('Reset Password — password form', () => {
  const DUMMY_TOKEN = 'dummy-token-12345678';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/reset-password?token=${DUMMY_TOKEN}`);
    // Form must render — check for the New Password input
    await page.getByLabel(/new password/i).waitFor({ state: 'visible', timeout: 8_000 });
  });

  test('renders the new-password form with both password fields', async ({ page }) => {
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /reset password/i })).toBeVisible();
  });

  test('password shorter than 6 characters shows a toast error', async ({ page }) => {
    await page.getByLabel(/new password/i).fill('ab');
    await page.getByLabel(/confirm password/i).fill('ab');
    await page.getByRole('button', { name: /reset password/i }).click();

    // Toast error: "Password must be at least 6 characters."
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible({ timeout: 6_000 });
    // Must NOT navigate away — still on reset-password
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test('mismatched passwords shows a toast error', async ({ page }) => {
    await page.getByLabel(/new password/i).fill('password123');
    await page.getByLabel(/confirm password/i).fill('different456');
    await page.getByRole('button', { name: /reset password/i }).click();

    await expect(page.getByText(/don't match|do not match/i)).toBeVisible({ timeout: 6_000 });
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test('valid passwords with an invalid token shows a server error message', async ({ page }) => {
    await page.getByLabel(/new password/i).fill('newpassword123');
    await page.getByLabel(/confirm password/i).fill('newpassword123');
    await page.getByRole('button', { name: /reset password/i }).click();

    // Server rejects the dummy token — an error toast or inline message appears
    await expect(
      page.getByText(/invalid|expired|couldn't reset|invalid token/i)
    ).toBeVisible({ timeout: 10_000 });
    // Must stay on the form — success screen should NOT appear
    await expect(page.getByText(/password updated/i)).not.toBeVisible();
  });
});
