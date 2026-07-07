/**
 * Jest configuration for @patina/utils package.
 *
 * Self-contained: this package previously required a repo-root `jest.config.cjs`
 * base that does not exist in the tree (the require threw before any test could
 * run), so the inline ts-jest config below is the whole config.
 */

// The date suite asserts UTC calendar math; pin the test process TZ so it is
// deterministic regardless of the developer/CI machine's local zone.
process.env.TZ = 'UTC';

/** @type {import('jest').Config} */
module.exports = {
  displayName: '@patina/utils',
  rootDir: '.',
  testEnvironment: 'node',

  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
  ],

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowJs: true,
      },
    }],
  },

  testTimeout: 5000,
};
