import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    // scripts/smoke.ts is a MANUAL live-stack integration script — never a test.
    exclude: ['node_modules', 'dist', 'scripts'],
  },
});
