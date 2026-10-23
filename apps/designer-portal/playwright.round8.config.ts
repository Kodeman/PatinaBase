import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import base from './playwright.config';

if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname !== '127.0.0.1') {
  throw new Error('Round-8 e2e requires NEXT_PUBLIC_SUPABASE_URL on 127.0.0.1.');
}
for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`Round-8 e2e requires ${key} from the local environment.`);
}

const port = process.env.PLAYWRIGHT_DESIGNER_PORT ?? '3420';
const baseURL = `http://localhost:${port}`;
// Keep generated evidence outside the checkout; later ticket owners can set
// PLAYWRIGHT_OUTPUT_DIR to their own dispatch evidence directory.
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR ??
  '/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1814';

export default defineConfig({
  ...base,
  testDir: './e2e/round8',
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/round8/global-setup.ts',
  outputDir: path.join(evidence, 'test-results'),
  reporter: [['list'], ['html', { outputFolder: path.join(evidence, 'html-report'), open: 'never' }]],
  use: { ...base.use, baseURL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `pnpm exec next dev --webpack -p ${port}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE: 'live',
      NEXT_PUBLIC_FLAG_OVERRIDES: 'designer-paper-round8:true,one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true',
    },
  },
});
