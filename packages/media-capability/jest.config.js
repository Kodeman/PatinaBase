/**
 * Jest configuration for @patina/media-capability.
 *
 * Self-contained — no repo-root jest.config.cjs base exists (see
 * packages/utils/jest.config.js for the same note). testEnvironment 'node'
 * relies on Node 20's global `crypto.subtle` (stable since Node 19) — no
 * jsdom, no polyfill, matching the runtime contract (Workers/Node20+/Deno).
 */

/** @type {import('jest').Config} */
module.exports = {
  displayName: '@patina/media-capability',
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

  testTimeout: 10000,
};
