import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// RC-2 consumer journey, client legs (SQ-2337). Opt-in: only
// apps/designer-portal/e2e/round8/run-consumer-journey.mjs runs this config,
// one tagged leg at a time, against the owned stack it started and proved.
for (const key of ['RC2_OWNED_DB_PORT', 'RC2_OWNED_API_PORT', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
  if (!process.env[key]) throw new Error(`Consumer journey: ${key} is unset; run run-consumer-journey.mjs.`);
}
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (api.hostname !== '127.0.0.1' || api.port !== process.env.RC2_OWNED_API_PORT || api.port === '54321') {
  throw new Error('Consumer journey: NEXT_PUBLIC_SUPABASE_URL is not the owned local API.');
}

const port = process.env.PLAYWRIGHT_CLIENT_PORT ?? '3202';
const baseURL = `http://localhost:${port}`;
const evidence = process.env.PLAYWRIGHT_EVIDENCE_DIR ?? path.join(__dirname, 'test-results/consumer-journey');

export default defineConfig({
  testDir: './tests',
  testMatch: /round8-consumer-journey\.journey\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(evidence, 'results'),
  reporter: [['list'], ['html', { outputFolder: path.join(evidence, 'report'), open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev --webpack -p ${port}`,
    url: `${baseURL}/auth/signin`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: api.origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      SUPABASE_URL: api.origin,
      SUPABASE_INTERNAL_URL: api.origin,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
});
