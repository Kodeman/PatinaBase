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
// Generated evidence defaults to the checkout's ignored test-results/ tree
// (.gitignore `test-results/`); a ticket owner points PLAYWRIGHT_OUTPUT_DIR
// at its own dispatch evidence directory.
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(__dirname, 'test-results/round8');
// WP-01.5 — the renderer override is inlined at compile time, so the legacy
// paper is a separate, sequential run: ROUND8_RENDERER=off compiles the same
// server with the renderer off and runs only the `@renderer-off` tests; the
// default run excludes them. Every test runs in exactly one mode.
const rendererOff = process.env.ROUND8_RENDERER === 'off';
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  ...base,
  testDir: './e2e/round8',
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/round8/global-setup.ts',
  globalTeardown: './e2e/round8/global-teardown.ts',
  outputDir: path.join(evidence, 'test-results'),
  reporter: [['list'], ['html', { outputFolder: path.join(evidence, 'html-report'), open: 'never' }]],
  use: { ...base.use, baseURL },
  projects: rendererOff
    ? [{ name: 'chromium-legacy', grep: /@renderer-off/, use: desktop }]
    : [
        { name: 'chromium', grepInvert: /@renderer-off/, use: desktop },
        { name: 'webkit-iphone', grepInvert: /@renderer-off/, use: { ...devices['iPhone 14'] } },
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
      NEXT_PUBLIC_FLAG_OVERRIDES: `designer-paper-round8:${rendererOff ? 'false' : 'true'},one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true`,
    },
  },
});
