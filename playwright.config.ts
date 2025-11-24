import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Import the reporter from the SDK (using relative path since we are in the same repo)
// In a real project, this would be: import CISnapshotReporter from '@ci-snapshot/sdk/dist/playwright';
import CISnapshotReporter from './sdk/dist/playwright';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html'],
    // Register our custom reporter
    [path.resolve(__dirname, 'sdk/dist/playwright.js'), {
      apiKey: 'sk_test_demo_key_12345', // Use the test key we created
      apiUrl: 'http://localhost:3000'
    }]
  ],
  use: {
    trace: 'on-first-retry',
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
