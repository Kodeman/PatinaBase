/**
 * Test setup for Orders Service
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/orders_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

// Global test timeout
jest.setTimeout(5000);

// Mock external services
jest.mock('@patina/events', () => ({
  EventPublisher: jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Suppress console errors in tests unless explicitly needed
global.console.error = jest.fn();
global.console.warn = jest.fn();
