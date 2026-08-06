/**
 * Jest configuration for @patina/client-portal
 * React/Next.js environment with jsdom
 */

const nextJest = require('next/jest')

// Provide the path to your Next.js app to load next.config.js and .env files
const createJestConfig = nextJest({
  dir: './',
})

/** @type {import('jest').Config} */
const customJestConfig = {
  displayName: '@patina/client-portal',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom',

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@patina/design-system$': '<rootDir>/../../packages/patina-design-system/src',
    '^@patina/design-system/(.*)$':
      '<rootDir>/../../packages/patina-design-system/src/components/$1',
    // Subpath imports (e.g. `@patina/supabase/server`) must resolve into
    // that package's src/<subpath> — this has to come before the bare
    // catch-all below, which would otherwise swallow the whole
    // "supabase/server" tail as the package name and 404.
    '^@patina/([^/]+)/(.*)$': '<rootDir>/../../packages/$1/src/$2',
    '^@patina/(.*)$': '<rootDir>/../../packages/$1/src',
  },

  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/*.spec.{ts,tsx}',
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
  ],

  // Test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/tests/e2e/',
    '/tests/*.spec.ts',  // Playwright tests
  ],

  // Build outputs copy the whole workspace (packages/*/package.json and all)
  // into this app's tree. testPathIgnorePatterns keeps Jest from RUNNING
  // anything in there, but the haste map still SCANS it, finds three
  // package.json files all naming `@patina/types`, and throws a duplicate-
  // manifest error out of any module that imports one — which is every
  // component test in this app once a portal build has been run locally.
  // modulePathIgnorePatterns is the knob that feeds the haste map's own
  // ignore pattern, so the artifacts stop existing as far as resolution is
  // concerned. Both dirs are gitignored, rebuildable output.
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/.open-next/',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/app/layout.tsx',
    '!src/app/page.tsx',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      lines: 70,
      branches: 60,
      functions: 70,
      statements: 70,
    },
  },

  // Test timeout
  testTimeout: 10000,

  // Clear mocks
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
}

module.exports = createJestConfig(customJestConfig)
