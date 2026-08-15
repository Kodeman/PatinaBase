import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { SUPABASE_ANON_KEY: 'workerd-test-publishable-key' },
      },
    }),
  ],
  test: {
    globals: true,
    include: ['test/workerd/**/*.test.ts'],
  },
});
