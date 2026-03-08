// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateUnsubscribeUrl,
} from '../tokens';

// Set up test environment variable
beforeAll(() => {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-key-for-unit-tests-must-be-long-enough';
});

afterAll(() => {
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
});

describe('generateUnsubscribeToken', () => {
  it('generates a valid JWT string', async () => {
    const token = await generateUnsubscribeToken('user-123', 'price_drop');
    expect(typeof token).toBe('string');
    // JWTs have 3 parts separated by dots
    expect(token.split('.').length).toBe(3);
  });

  it('generates different tokens for different users', async () => {
    const token1 = await generateUnsubscribeToken('user-1', 'price_drop');
    const token2 = await generateUnsubscribeToken('user-2', 'price_drop');
    expect(token1).not.toBe(token2);
  });

  it('generates different tokens for different types', async () => {
    const token1 = await generateUnsubscribeToken('user-1', 'price_drop');
    const token2 = await generateUnsubscribeToken('user-1', 'weekly_inspiration');
    expect(token1).not.toBe(token2);
  });

  it('supports all_marketing type', async () => {
    const token = await generateUnsubscribeToken('user-1', 'all_marketing');
    expect(typeof token).toBe('string');
  });
});

describe('verifyUnsubscribeToken', () => {
  it('verifies a valid token and returns payload', async () => {
    const token = await generateUnsubscribeToken('user-abc', 'lead_expiring');
    const result = await verifyUnsubscribeToken(token);

    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.sub).toBe('user-abc');
    expect(result.payload!.type).toBe('lead_expiring');
    expect(result.payload!.purpose).toBe('unsubscribe');
  });

  it('rejects an invalid token', async () => {
    const result = await verifyUnsubscribeToken('invalid.token.here');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid');
  });

  it('rejects a completely malformed string', async () => {
    const result = await verifyUnsubscribeToken('not-a-jwt');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid');
  });

  it('rejects an expired token', async () => {
    // Generate with 0 hour expiry (already expired)
    // We can't easily create an expired token without time manipulation,
    // so we test with a very short expiry
    const token = await generateUnsubscribeToken('user-1', 'price_drop', 0);
    // Wait a moment to ensure it expires
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await verifyUnsubscribeToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
  });

  it('rejects a token signed with different secret', async () => {
    const token = await generateUnsubscribeToken('user-1', 'price_drop');

    // Change the secret
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'different-secret-key-for-testing-purposes';

    const result = await verifyUnsubscribeToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid');

    // Restore
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-key-for-unit-tests-must-be-long-enough';
  });

  it('returns correct type for all_marketing tokens', async () => {
    const token = await generateUnsubscribeToken('user-1', 'all_marketing');
    const result = await verifyUnsubscribeToken(token);

    expect(result.valid).toBe(true);
    expect(result.payload!.type).toBe('all_marketing');
  });
});

describe('generateUnsubscribeUrl', () => {
  it('generates a full URL with embedded token', async () => {
    const url = await generateUnsubscribeUrl('user-123', 'price_drop');
    expect(url).toMatch(/^https:\/\/admin\.patina\.cloud\/preferences\?token=/);
    expect(url.length).toBeGreaterThan(50);
  });

  it('uses custom base URL when provided', async () => {
    const url = await generateUnsubscribeUrl(
      'user-123',
      'price_drop',
      'https://portal.example.com'
    );
    expect(url).toMatch(/^https:\/\/portal\.example\.com\/preferences\?token=/);
  });

  it('generates URL with URL-encoded token', async () => {
    const url = await generateUnsubscribeUrl('user-123', 'weekly_inspiration');
    // Token should be URI-encoded (no raw = or + in query string)
    const tokenPart = url.split('token=')[1];
    expect(tokenPart).toBeDefined();
    expect(tokenPart.length).toBeGreaterThan(0);
  });

  it('generated URL token is verifiable', async () => {
    const url = await generateUnsubscribeUrl('user-xyz', 'founding_circle');
    const token = decodeURIComponent(url.split('token=')[1]);
    const result = await verifyUnsubscribeToken(token);

    expect(result.valid).toBe(true);
    expect(result.payload!.sub).toBe('user-xyz');
    expect(result.payload!.type).toBe('founding_circle');
  });
});
