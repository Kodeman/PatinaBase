import { describe, expect, it } from 'vitest';
import { AuthFlowError, normalizeAuthError, normalizeOAuthCallbackError } from './errors';

describe('normalizeAuthError', () => {
  it.each([
    [{ code: 'otp_expired', message: 'raw token detail' }, 'invalid_code'],
    [new Error('Invalid login credentials'), 'invalid_credentials'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ status: 429, message: 'too many requests' }, 'rate_limit'],
    [{ status: 503, message: 'upstream unavailable' }, 'service'],
    [{ code: 'weak_password' }, 'weak_password'],
    [{ code: 'same_password' }, 'same_password'],
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
      message: 'That sign-in didn\'t finish. Try again, or use a code by email.',
      retryable: true,
    });
  });

  it('uses recovery-link language for an invalid recovery credential', () => {
    expect(
      normalizeAuthError(
        { code: 'otp_expired', message: 'raw recovery token detail' },
        'invalid_recovery',
      ),
    ).toEqual({
      kind: 'invalid_recovery',
      message:
        'That password-reset link has expired or was already used. Request a new link and try again.',
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

describe('normalizeOAuthCallbackError', () => {
  it('maps provider cancellation without exposing callback text', () => {
    expect(normalizeOAuthCallbackError('access_denied')).toMatchObject({
      kind: 'cancelled',
      message: 'Sign-in was cancelled. Please try again when you are ready.',
    });
    expect(normalizeOAuthCallbackError('provider_secret_123')).toMatchObject({
      kind: 'oauth',
    });
    expect(normalizeOAuthCallbackError(null)).toBeNull();
  });
});
