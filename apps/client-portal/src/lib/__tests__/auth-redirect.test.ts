import {
  buildAuthCallbackUrl,
  buildSignInPath,
  buildVerifyOtpPath,
  resolveAuthReturnPath,
} from '../auth-redirect';

describe('client auth return continuity', () => {
  const destination = '/invoices/invoice-1?checkout=success&session_id=cs_1';

  it('preserves the complete same-origin pathname and query', () => {
    expect(resolveAuthReturnPath(destination)).toBe(destination);
    expect(
      new URL(buildAuthCallbackUrl('https://client.patina.test', destination)).searchParams.get(
        'callbackUrl',
      ),
    ).toBe(destination);
    expect(
      new URL(
        buildVerifyOtpPath('client@example.com', destination),
        'https://client.patina.test',
      ).searchParams.get('callbackUrl'),
    ).toBe(destination);
    expect(
      new URL(buildSignInPath(destination), 'https://client.patina.test').searchParams.get(
        'callbackUrl',
      ),
    ).toBe(destination);
  });

  it('fails closed to the portal root for external and protocol-relative targets', () => {
    for (const unsafe of ['https://evil.test/phish', '//evil.test/phish', '/\\evil.test']) {
      expect(resolveAuthReturnPath(unsafe)).toBe('/');
      expect(
        new URL(buildAuthCallbackUrl('https://client.patina.test', unsafe)).searchParams.get(
          'callbackUrl',
        ),
      ).toBe('/');
    }
  });

  it('carries a callback through an OAuth error retry without discarding it', () => {
    const retry = new URL(buildSignInPath(destination, 'OAuthCallback'), 'https://client.test');
    expect(retry.searchParams.get('error')).toBe('OAuthCallback');
    expect(retry.searchParams.get('callbackUrl')).toBe(destination);
  });
});
