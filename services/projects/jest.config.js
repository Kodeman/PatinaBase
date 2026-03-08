/**
 * Jest configuration for Projects Service
 */

const baseConfig = require('../../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '.',
  displayName: 'projects-service',
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.spec.json',
      isolatedModules: false,
    }],
  },
};
