import { test, expect } from '@playwright/test';

// Covers the real admin login path end-to-end against the live backend
// (POST /api/session/login) — previously the only E2E spec in this repo
// covered the Teacher Panel's staff/OTP flow; nothing exercised the
// email+password admin path or its failure case.
test.describe('Admin Login', () => {
  test('signs in with valid credentials and reaches the admin dashboard', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Admin Sign-in').click();

    // "Admin Sign-in" auto-fills real demo credentials and jumps straight to
    // the login form (no OTP step for this portal).
    await expect(page.getByLabel('Email or Login ID')).toHaveValue('educationleadershipexpo@gmail.com');

    await page.getByRole('button', { name: /Sign in to/ }).click();

    // A real session token comes back and the app navigates off the login page.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
    await expect(page).not.toHaveURL(/\/login/);

    // Sidebar (only rendered once authenticated) should be visible.
    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('rejects a login attempt for an email with no account at all', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Admin Sign-in').click();

    await page.getByLabel('Email or Login ID').fill('no-such-user-xyz-123@example.com');
    await page.getByLabel('Password').fill('whatever');
    await page.getByRole('button', { name: /Sign in to/ }).click();

    // Server rejects unknown accounts (server.ts /api/session/login) — must
    // not silently log the user in as some fallback identity.
    await expect(page.getByText(/user not found/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/(login)?$/);
  });
});
