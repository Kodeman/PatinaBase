import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Only the fixed public local demo key belongs in source. The matching LOCAL
// service key is supplied by the caller, never inherited from a prod env file.
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const evidence = process.env.PLAYWRIGHT_EVIDENCE_DIR;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  globalTimeout: 540000,
  outputDir: evidence ? path.join(evidence, 'results') : 'test-results',
  reporter: [['list'], ['html', {
    outputFolder: evidence ? path.join(evidence, 'report') : 'playwright-report',
    open: 'never',
  }]],
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /(house-issue|threshold)\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'edition', testMatch: /(house-issue|threshold)\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3002',
    // A reused server could have different source, credentials or flags.
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  },
});
