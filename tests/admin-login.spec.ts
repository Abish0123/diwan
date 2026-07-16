import { test, expect } from '@playwright/test';
import { selectPortal, fillLoginForm } from './helpers/login';

/**
 * Admin login E2E — legacy spec updated to current UI selectors.
 *
 * The "Admin Sign-in" portal card was replaced by the three-portal
 * selection screen (Staff / Student / Parent). Admin credentials
 * are entered manually after selecting the Staff portal.
 *
 * This spec runs in the 'auth' Playwright project (no storageState).
 */
test.describe('Admin Login', () => {
  test('signs in with valid credentials and reaches the admin dashboard', async ({ page }) => {
    await page.goto('/');

    // Select Staff portal — the login form appears with demo credentials
    await selectPortal(page, 'Staff Portal');

    // Override demo credentials with real admin account
    await fillLoginForm(page, 'admin@eduerp.com', 'admin123');

    await page.getByRole('button', { name: /sign in to/i }).click();

    // A real session token comes back and the app navigates off /login
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);

    // Sidebar (only rendered once authenticated) should be visible
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('rejects a login attempt for an email with no account at all', async ({ page }) => {
    await page.goto('/');
    await selectPortal(page, 'Staff Portal');

    await fillLoginForm(page, 'no-such-user-xyz-123@example.com', 'whatever');
    await page.getByRole('button', { name: /sign in to/i }).click();

    // Server rejects unknown accounts — must not silently log the user in
    await expect(page.getByText(/user not found/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/(login)?$/);
  });
});
