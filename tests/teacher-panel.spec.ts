import { test, expect } from '@playwright/test';

test.describe('Teacher Panel UI & UX', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000/');
    
    // Select Staff Portal if we are on login screen
    const staffPortalBtn = page.getByText('Staff Portal');
    if (await staffPortalBtn.isVisible()) {
      await staffPortalBtn.click();
      
      // The demo credentials for teacher are populated automatically
      // Click 'Sign in to Staff Portal'
      await page.getByRole('button', { name: 'Sign in to Staff Portal' }).click();
      
      // Wait for OTP step and enter OTP: 123456
      await page.waitForSelector('input[id="otp-0"]');
      await page.fill('input[id="otp-0"]', '1');
      await page.fill('input[id="otp-1"]', '2');
      await page.fill('input[id="otp-2"]', '3');
      await page.fill('input[id="otp-3"]', '4');
      await page.fill('input[id="otp-4"]', '5');
      await page.fill('input[id="otp-5"]', '6');
      
      await page.getByRole('button', { name: 'Verify & Sign In' }).click();
      
      // Wait for navigation to dashboard
      await page.waitForURL('**/teacher/dashboard');
    }
  });

  test('Teacher Dashboard renders correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/teacher/dashboard');
    
    // Verify Dashboard headers
    await expect(page.getByText('Dashboard', { exact: false }).first()).toBeVisible();
    
    // Verify some metric cards are present
    await expect(page.getByText('Present Today')).toBeVisible();
    
    // Verify quick actions
    const takeAttendance = page.getByText('Take Attendance', { exact: true });
    await expect(takeAttendance).toBeVisible();
  });

  test('Teacher Attendance UI and UX flows', async ({ page }) => {
    await page.goto('http://localhost:3000/teacher/attendance');
    
    // Verify header
    await expect(page.getByText('Attendance', { exact: true }).first()).toBeVisible();
    
    // Wait for students to load
    await page.waitForTimeout(2000); 
  });

  test('Teacher Behavior & Assessments empty states and rendering', async ({ page }) => {
    await page.goto('http://localhost:3000/teacher/behavior');
    await expect(page.getByText('Behavior')).toBeVisible();
    
    await page.goto('http://localhost:3000/teacher/assessments');
    await expect(page.getByText('Assessments')).toBeVisible();
  });
  
  test('Teacher Assignments & Study Materials render properly', async ({ page }) => {
    await page.goto('http://localhost:3000/teacher/assignments');
    await expect(page.getByText('Assignments').first()).toBeVisible();
    
    await page.goto('http://localhost:3000/teacher/study-materials');
    await expect(page.getByText('Study Materials').first()).toBeVisible();
  });

});
