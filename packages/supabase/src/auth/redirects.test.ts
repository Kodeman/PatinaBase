import { describe, expect, it } from 'vitest';
import {
  buildAuthCallbackUrl,
  buildSignInPath,
  buildVerifyOtpPath,
  safeAuthReturnPath,
} from './redirects';

describe('safeAuthReturnPath', () => {
  it('preserves an internal pathname, query, and fragment', () => {
    const path = '/projects/project-1?view=orders&session_id=cs_1#details';
    expect(safeAuthReturnPath(path, '/desk')).toBe(path);
  });

  it.each([
    'https://evil.test/phish',
    'javascript:alert(1)',
    '//evil.test/phish',
    '/\\evil.test/phish',
    '/%5cevil.test/phish',
    '/%2f%2fevil.test/phish',
    '/%252f%252fevil.test/phish',
    '/projects/%E0%A4%A',
    '/projects\u0000/admin',
  ])('rejects unsafe return target %s', (unsafe) => {
    expect(safeAuthReturnPath(unsafe, '/desk')).toBe('/desk');
  });

  it('fails closed when both the target and fallback are unsafe', () => {
    expect(safeAuthReturnPath('//evil.test', 'https://evil.test')).toBe('/');
  });
});
describe('auth URL builders', () => {
  const destination = '/projects/project-1?tab=orders&filter=open';

  it('carries the complete destination through a callback URL', () => {
    const callback = new URL(
      buildAuthCallbackUrl('https://client.patina.cloud', destination),
    );
    expect(callback.origin).toBe('https://client.patina.cloud');
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('callbackUrl')).toBe(destination);
  });

  it('encodes email and destination through OTP verification', () => {
    const path = new URL(
      buildVerifyOtpPath('hello+client@patina.com', destination),
      'https://client.patina.cloud',
    );
    expect(path.pathname).toBe('/auth/verify-otp');
    expect(path.searchParams.get('email')).toBe('hello+client@patina.com');
    expect(path.searchParams.get('callbackUrl')).toBe(destination);
  });

  it('carries a stable failure code through sign-in retry', () => {
    const path = new URL(
      buildSignInPath(destination, 'oauth'),
      'https://client.patina.cloud',
    );
    expect(path.searchParams.get('error')).toBe('oauth');
    expect(path.searchParams.get('callbackUrl')).toBe(destination);
  });

  it('sanitizes unsafe targets in every builder', () => {
    expect(
      new URL(buildAuthCallbackUrl('https://patina.test', '//evil.test')).searchParams.get(
        'callbackUrl',
      ),
    ).toBe('/');
    expect(
      new URL(
        buildVerifyOtpPath('client@patina.com', '/%5cevil.test'),
        'https://patina.test',
      ).searchParams.get('callbackUrl'),
    ).toBe('/');
    expect(
      new URL(buildSignInPath('https://evil.test'), 'https://patina.test').searchParams.get(
        'callbackUrl',
      ),
    ).toBe('/');
  });
});
