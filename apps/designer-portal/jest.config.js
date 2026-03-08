const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Setup files to run BEFORE jest is initialized (canvas polyfill)
  setupFiles: ['<rootDir>/jest.polyfills.js'],

  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Test environment - custom environment that prevents canvas loading
  testEnvironment: '<rootDir>/jest-environment-jsdom-no-canvas.js',

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^canvas$': '<rootDir>/__mocks__/canvas.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@patina/design-system$': '<rootDir>/../../packages/patina-design-system/src',
    '^@patina/types$': '<rootDir>/../../packages/types/src',
    '^@patina/api-client$': '<rootDir>/../../packages/api-client/src',
    '^@patina/utils$': '<rootDir>/../../packages/utils/src',
  },

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/test-utils.{js,jsx,ts,tsx}',
  ],

  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/', // Ignore e2e tests (use Playwright)
  ],

  // Transform ignore patterns - allow ESM packages to be transformed
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@patina/|@dnd-kit/|@tanstack/|@auth/|lucide-react/|date-fns/))',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Clear mocks automatically between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
