/**
 * Jest configuration for Types Package
 */

const baseConfig = require('../../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '.',
  displayName: 'types-package',
  coverageDirectory: '<rootDir>/coverage',
  // No setup file needed for types validation
  setupFilesAfterEnv: [],
  // Types are compile-time only, tests verify TypeScript compilation and type safety
  testEnvironment: 'node',
};
