import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// RC-2 consumer journey, designer legs (SQ-2337). Opt-in: only
// e2e/round8/run-consumer-journey.mjs runs this config, one tagged leg at a
// time, against the owned stack it started and proved. There is no global
// setup or teardown: the journey fixture applies F01 once per journey, and
// round 8's F01 teardown would delete the journey's studio between legs.
for (const key of ['RC2_OWNED_DB_PORT', 'RC2_OWNED_API_PORT', 'RC2_OWNED_SERVER_ADDR', 'RC2_OWNED_SYSTEM_ID',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
  if (!process.env[key]) throw new Error(`Consumer journey: ${key} is unset; run e2e/round8/run-consumer-journey.mjs.`);
}
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (api.hostname !== '127.0.0.1' || api.port !== process.env.RC2_OWNED_API_PORT || api.port === '54321') {
  throw new Error('Consumer journey: NEXT_PUBLIC_SUPABASE_URL is not the owned local API.');
}
process.env.DESIGNER_E2E_EMAIL = 'f01-designer@test.invalid';
process.env.DESIGNER_E2E_PASSWORD = 'password123';

const port = process.env.PLAYWRIGHT_DESIGNER_PORT ?? '3200';
const baseURL = `http://localhost:${port}`;
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(__dirname, 'test-results/consumer-journey');

export default defineConfig({
  testDir: './e2e/round8',
  testMatch: /consumer-journey\.journey\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  outputDir: path.join(evidence, 'test-results'),
  reporter: [['list'], ['html', { outputFolder: path.join(evidence, 'html-report'), open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec next dev --webpack -p ${port}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: api.origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      SUPABASE_URL: api.origin,
      SUPABASE_INTERNAL_URL: api.origin,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE: 'live',
      NEXT_PUBLIC_FLAG_OVERRIDES: 'designer-paper-round8:true,one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true',
    },
  },
});
