import { test, expect } from '@playwright/test';

test.describe('CI Snapshot System E2E', () => {
  
  test('should pass a simple health check', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
  });

  // This test is DESIGNED TO FAIL to demonstrate the reporting system
  test('should fail and trigger AI analysis', async ({ page }) => {
    console.log('⚠️  Running intentional failure test...');
    
    // Navigate to a non-existent page or assert something wrong
    await page.goto('http://localhost:3000/health');
    
    // Intentional failure: expecting text that doesn't exist
    // This simulates a UI change breaking a test
    await expect(page.getByText('This text does not exist')).toBeVisible({ timeout: 1000 });
  });

});
