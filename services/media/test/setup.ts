/**
 * Test setup for Media Service
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/media_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.S3_BUCKET = 'test-bucket';
process.env.AWS_REGION = 'us-east-1';

// Global test timeout
jest.setTimeout(5000);

// Mock external services
// `@patina/events` is not (yet) a workspace package — no media source file
// imports it today — so this factory mock must be declared `virtual` or
// Jest's module resolver throws "Cannot find module" before it ever gets to
// use the factory. Kept (rather than deleted) since it's evidently meant to
// pre-empt a future event-publishing dependency.
jest.mock(
  '@patina/events',
  () => ({
    EventPublisher: jest.fn().mockImplementation(() => ({
      publish: jest.fn().mockResolvedValue(undefined),
    })),
  }),
  { virtual: true },
);

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

// Suppress console errors in tests unless explicitly needed
global.console.error = jest.fn();
global.console.warn = jest.fn();
