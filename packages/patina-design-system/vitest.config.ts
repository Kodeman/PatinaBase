import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Prevent resource exhaustion with 60+ test files
    // Use limited parallelism instead of sequential to balance speed and memory
    pool: 'forks',
    poolOptions: {
      forks: {
        // Limit concurrent workers to prevent OOM (default would use all CPUs)
        maxForks: 2,
        minForks: 1,
      },
    },
    // Increase test timeout for complex component tests
    testTimeout: 10000,
    // Set a hookTimeout to prevent hanging tests
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.stories.tsx',
        '**/*.test.tsx',
        '**/*.spec.tsx',
        'vitest.setup.ts',
        'vitest.config.ts',
        'tailwind.config.ts',
        'postcss.config.mjs',
        'tsup.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
