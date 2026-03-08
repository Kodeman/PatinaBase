/**
 * Jest configuration for Orders Service
 */

const baseConfig = require('../../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '.',
  displayName: 'orders-service',
  coverageDirectory: '<rootDir>/coverage',
};
