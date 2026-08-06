const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  // Setup files to run BEFORE jest is initialized (canvas polyfill)
  setupFiles: ['<rootDir>/jest.polyfills.js'],

  // Setup files to run after jest is initialized
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Test environment - custom environment that prevents canvas loading
  testEnvironment: '<rootDir>/jest-environment-jsdom-no-canvas.js',
  testEnvironmentOptions: {
    customExportConditions: [''],
  },

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^canvas$': '<rootDir>/__mocks__/canvas.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
  },

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    '!src/app/**', // Exclude Next.js app directory (mainly page components)
    '!src/types/**', // Exclude type definitions
  ],

  // Coverage threshold (optional - can be adjusted)
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',  // E2E tests run with Playwright, not Jest
  ],

  // Jest's haste module map scans every package.json under rootDir looking
  // for `@providesModule`-style names, including build output. A stray
  // .next/standalone (next build) and .open-next (opennextjs-cloudflare
  // build) each vendor a full copy of every workspace package.json, so
  // without this the haste map sees duplicate `@patina/supabase` (etc.)
  // providers and every suite that jest.mock()s a workspace package fails
  // to even load. modulePathIgnorePatterns (unlike testPathIgnorePatterns)
  // is honored by the haste scanner itself.
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/.open-next/'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
