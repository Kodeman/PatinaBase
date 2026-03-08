/**
 * Jest configuration for @patina/utils package
 */

const baseConfig = require('../../jest.config.cjs');

module.exports = {
  ...baseConfig,
  displayName: '@patina/utils',
  rootDir: '.',
  testEnvironment: 'node',

  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],

  // Coverage thresholds (aiming for near 100%)
  coverageThreshold: {
    global: {
      lines: 95,
      branches: 90,
      functions: 95,
      statements: 95,
    },
  },

  // Don't need setup files for utils
  setupFilesAfterEnv: undefined,

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
      },
    }],
  },

  // Test timeout (2 seconds for unit tests)
  testTimeout: 2000,
};
