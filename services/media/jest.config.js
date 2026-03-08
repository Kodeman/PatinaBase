/**
 * Jest configuration for Media Service
 */

const baseConfig = require('../../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '.',
  displayName: 'media-service',
  coverageDirectory: '<rootDir>/coverage',
};
