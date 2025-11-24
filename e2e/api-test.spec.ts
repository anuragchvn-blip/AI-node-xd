import { test, expect } from '@playwright/test';

test.describe('API Error Tests', () => {
  test('should handle API endpoint correctly', async ({ page }) => {
    // Navigate to a page
    await page.goto('https://example.com');
    
    // Intentionally fail: try to find an element that doesn't exist
    const nonExistentButton = page.locator('button#payment-submit');
    await expect(nonExistentButton).toBeVisible({ timeout: 2000 });
  });

  test('should validate form submission', async ({ page }) => {
    await page.goto('https://example.com');
    
    // This will fail - trying to click a non-existent element
    await page.click('#checkout-button');
    
    // This assertion will never run because click fails
    await expect(page).toHaveURL(/success/);
  });
});
