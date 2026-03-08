/**
 * Jest configuration for @patina/cache package
 * Extends base configuration with cache-specific settings
 */

module.exports = {
  // Use ts-jest preset for TypeScript
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Root directory
  rootDir: '.',

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/index.ts', // Just re-exports
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80,
    },
  },

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    }],
  },

  // Test timeout (5 seconds for unit tests)
  testTimeout: 5000,

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Verbose output
  verbose: true,

  // Detect open handles and leaks
  detectOpenHandles: true,
  forceExit: true,

  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'ts'],

  // Reporters
  reporters: ['default'],
};
