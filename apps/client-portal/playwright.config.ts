import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Self-boots :3002 for the share/board specs, but reuses an already-running
  // dev server when one is up (the usual local case).
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
