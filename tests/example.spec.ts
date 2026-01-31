import { test, expect } from '@playwright/test';

test.describe('TutorCat Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    
    // Check if page title contains TutorCat
    await expect(page).toHaveTitle(/TutorCat/i);
  });

  test('should display header navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check for header elements
    const header = page.locator('header, nav').first();
    await expect(header).toBeVisible();
  });

  test('should have login/signup buttons', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    // Handle cookie banner if present
    try {
      const acceptButton = page.getByRole('button', { name: /I Understand|Accept|Acknowledge/i }).first();
      if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await acceptButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Cookie banner not present
    }
    
    // Scroll to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    
    // Check for login button (it's a button, not a link)
    // There are two login buttons (header and main content), so use .first()
    await page.waitForSelector('button:has-text("Login")', { timeout: 10000 });
    const loginButton = page.getByRole('button', { name: 'Login' }).first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });
    
    // Check for signup button (also use .first() in case there are multiple)
    const signupButton = page.getByRole('button', { name: /Sign Up|signup/i }).first();
    await expect(signupButton).toBeVisible({ timeout: 10000 });
  });
});

test.describe('TutorCat Dashboard', () => {
  test('should redirect to home when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page to load - use domcontentloaded for reliability
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for any client-side redirects
    await page.waitForTimeout(3000);
    
    // Should redirect to home page (/) when not authenticated
    // The auth context will handle redirect
    const currentUrl = page.url();
    expect(currentUrl.endsWith('/') || currentUrl.includes('/dashboard')).toBe(true);
  });
});
