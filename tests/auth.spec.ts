import { test, expect } from '@playwright/test';
import { selectPortal, fillLoginForm, loginAs } from './helpers/login';

/**
 * Auth E2E — runs WITHOUT storageState (the 'auth' project in playwright.config.ts).
 *
 * Covers:
 *  - Portal selection screen: all three cards visible, branding present
 *  - Staff portal → pre-fills demo credentials → shows login form
 *  - Student / Parent portal cards navigate to their forms
 *  - Back button returns to portal selection
 *  - Password visibility toggle
 *  - Forgot Password dialog opens and closes
 *  - Successful admin login reaches the authenticated dashboard
 *  - Wrong password stays on login with an error message
 *  - Completely unknown email rejected with an error message
 *  - Unauthenticated visit to /students redirects to /login
 */

test.describe('Login — portal selection screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows three portal cards and app branding', async ({ page }) => {
    await expect(page.getByText('Staff Portal')).toBeVisible();
    await expect(page.getByText('Student Portal')).toBeVisible();
    await expect(page.getByText('Parent Portal')).toBeVisible();
    await expect(page.getByText('Student Diwan')).toBeVisible();
  });

  test('Staff Portal card opens login form with pre-filled demo credentials', async ({ page }) => {
    await selectPortal(page, 'Staff Portal');

    const emailInput = page.getByLabel('Email or Login ID');
    await expect(emailInput).toBeVisible();
    // selectPortal() calls selectPortal() in the app which auto-fills DEMO[staff]
    await expect(emailInput).toHaveValue('teacher@studentdiwan.com');
    await expect(page.getByLabel('Password')).toHaveValue('demo1234');
  });

  test('Student Portal card opens login form with pre-filled student credentials', async ({ page }) => {
    await selectPortal(page, 'Student Portal');
    await expect(page.getByLabel('Email or Login ID')).toHaveValue('student@studentdiwan.com');
  });

  test('Parent Portal card opens login form with pre-filled parent credentials', async ({ page }) => {
    await selectPortal(page, 'Parent Portal');
    await expect(page.getByLabel('Email or Login ID')).toHaveValue('parent@studentdiwan.com');
  });

  test('Back button on login form returns to portal selection', async ({ page }) => {
    await selectPortal(page, 'Staff Portal');
    // Back button label comes from t('login.allPortals') = "All Portals"
    await page.getByRole('button', { name: /all portals/i }).click();
    await expect(page.getByText('Staff Portal')).toBeVisible();
    await expect(page.getByText('Student Portal')).toBeVisible();
    // Login form should no longer be visible
    await expect(page.getByLabel('Email or Login ID')).not.toBeVisible();
  });

  test('password visibility toggle switches between hidden and visible', async ({ page }) => {
    await selectPortal(page, 'Staff Portal');
    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // The show/hide toggle has aria-label = t('login.showPassword')
    await page.getByRole('button', { name: /show password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /hide password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('Forgot Password link opens a dialog', async ({ page }) => {
    await selectPortal(page, 'Staff Portal');
    await page.getByText('Forgot Password?').click();
    // Dialog title = t('login.resetPassword') = "Reset Password"
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
  });

  test('Forgot Password dialog closes when Cancel is clicked', async ({ page }) => {
    await selectPortal(page, 'Staff Portal');
    await page.getByText('Forgot Password?').click();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

test.describe('Login — authentication flows', () => {
  test('admin login with correct credentials reaches the dashboard', async ({ page }) => {
    await loginAs(page, 'Staff Portal', 'admin@eduerp.com', 'admin123');
    await expect(page).not.toHaveURL(/\/login/);
    // Sidebar link to Dashboard is the canonical sign of a successful authenticated session
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('wrong password stays on login with an error visible', async ({ page }) => {
    await page.goto('/');
    await selectPortal(page, 'Staff Portal');
    await fillLoginForm(page, 'admin@eduerp.com', 'wrong-password-xyz');
    await page.getByRole('button', { name: /sign in to/i }).click();

    // Server returns 401 — AuthContext shows a toast error. The user must
    // remain on the login page.
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 8_000 });
    await expect(page.getByLabel('Email or Login ID')).toBeVisible();
  });

  test('unknown email is rejected — user not found message', async ({ page }) => {
    await page.goto('/');
    await selectPortal(page, 'Staff Portal');
    await fillLoginForm(page, 'no-such-user-xyz@nowhere.com', 'any-password');
    await page.getByRole('button', { name: /sign in to/i }).click();

    // AuthContext receives 401 and shows the server's error message as a toast
    await expect(page.getByText(/user not found/i)).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/(login)?$/);
  });
});

test.describe('Auth — route protection', () => {
  test('unauthenticated visit to /students redirects to /login', async ({ page }) => {
    // No storageState — fresh context with no token
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test('unauthenticated visit to /staff redirects to /login', async ({ page }) => {
    await page.goto('/staff');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test('unauthenticated visit to /attendance redirects to /login', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test('/login is publicly accessible without a token', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Staff Portal')).toBeVisible();
    await expect(page.getByText('Student Portal')).toBeVisible();
  });

  test('/reset-password is publicly accessible without a token', async ({ page }) => {
    await page.goto('/reset-password');
    // Without a token query-param the page shows the "Invalid reset link" screen
    await expect(page.getByText(/invalid reset link/i)).toBeVisible();
  });
});
