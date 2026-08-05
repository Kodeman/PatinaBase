import { describe, expect, it } from 'vitest';
import { AuthFlowError, normalizeAuthError } from './errors';

describe('normalizeAuthError', () => {
  it.each([
    [{ code: 'otp_expired', message: 'raw token detail' }, 'invalid_code'],
    [new Error('Invalid login credentials'), 'invalid_credentials'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ message: 'access_denied by provider' }, 'access_denied'],
    [new Error('request timed out'), 'timeout'],
  ] as const)('maps SDK errors to a stable friendly failure', (error, kind) => {
    const result = normalizeAuthError(error);
    expect(result.kind).toBe(kind);
    expect(result.message).not.toContain('raw token detail');
    expect(result.message).not.toContain('Invalid login credentials');
  });

  it('uses the requested flow fallback without exposing unknown SDK text', () => {
    const result = normalizeAuthError(
      new Error('provider_secret_error_123'),
      'oauth',
    );
    expect(result).toEqual({
      kind: 'oauth',
      message: 'Apple sign-in didn\'t finish. Try again, or use a code by email.',
      retryable: true,
    });
  });

  it('round-trips an already sanitized AuthFlowError', () => {
    const wrapped = new AuthFlowError(new Error('Failed to fetch'));
    expect(wrapped.message).toBe(
      'We couldn\'t reach Patina just now. Check your connection and try again.',
    );
    expect(normalizeAuthError(wrapped)).toBe(wrapped.failure);
  });
});
