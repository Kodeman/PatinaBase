import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/mood-board',
  testMatch: '**/*.visual.pw.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:6006',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 1800 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @patina/design-system storybook --ci --no-open',
    cwd: '../..',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
