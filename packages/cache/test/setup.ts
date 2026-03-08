/**
 * Jest setup file for cache package tests
 * Sets up mocks and test environment
 */

// Suppress console errors in tests unless explicitly testing them
global.console = {
  ...console,
  error: jest.fn(),
  log: jest.fn(),
};

// Set test timeout
jest.setTimeout(5000);
