import {
  buildAuthCallbackUrl,
  buildRecoveryCallbackUrl,
  buildSignInPath,
  buildVerifyOtpPath,
  confirmBrowserSession,
  replaceAuthDestination,
  resolveAuthReturnPath,
  resolveRecoveryPath,
} from '../auth-redirect';

describe('client auth return continuity', () => {
  const destination = '/invoices/invoice-1?checkout=success&session_id=cs_1';

  it('preserves the complete same-origin pathname and query', () => {
    expect(resolveAuthReturnPath(destination)).toBe(destination);
    expect(
      new URL(
        buildAuthCallbackUrl('https://client.patina.test', destination),
      ).searchParams.get('callbackUrl'),
    ).toBe(destination);
    expect(
      new URL(
        buildVerifyOtpPath('client@example.com', destination),
        'https://client.patina.test',
      ).searchParams.get('callbackUrl'),
    ).toBe(destination);
    expect(
      new URL(
        buildSignInPath(destination),
        'https://client.patina.test',
      ).searchParams.get('callbackUrl'),
    ).toBe(destination);
  });

  it('fails closed to the projects home for external and protocol-relative targets', () => {
    for (const unsafe of [
      'https://evil.test/phish',
      '//evil.test/phish',
      '/\\evil.test',
    ]) {
      expect(resolveAuthReturnPath(unsafe)).toBe('/projects');
      expect(
        new URL(
          buildAuthCallbackUrl(
            'https://client.patina.test',
            resolveAuthReturnPath(unsafe),
          ),
        ).searchParams.get('callbackUrl'),
      ).toBe('/projects');
    }
  });

  it('carries a callback through an OAuth error retry without discarding it', () => {
    const retry = new URL(
      buildSignInPath(destination, 'OAuthCallback'),
      'https://client.test',
    );
    expect(retry.searchParams.get('error')).toBe('OAuthCallback');
    expect(retry.searchParams.get('callbackUrl')).toBe(destination);
  });

  it('forces recovery through reset while preserving the final safe destination', () => {
    const callback = new URL(
      buildRecoveryCallbackUrl('https://client.patina.test', destination),
    );
    expect(callback.searchParams.get('type')).toBe('recovery');
    const resetPath = callback.searchParams.get('callbackUrl');
    expect(resolveRecoveryPath(resetPath)).toBe(resetPath);
    expect(
      new URL(resetPath!, 'https://client.patina.test').searchParams.get(
        'callbackUrl',
      ),
    ).toBe(destination);
    expect(resolveRecoveryPath(destination)).toBe('/auth/reset-password');
    expect(resolveRecoveryPath('//evil.test')).toBe('/auth/reset-password');
  });

  it('requires a persisted browser session before auth success', async () => {
    await expect(
      confirmBrowserSession({
        auth: {
          getSession: jest
            .fn()
            .mockResolvedValue({ data: { session: null }, error: null }),
        },
      }),
    ).rejects.toThrow('finish opening your Patina session');

    await expect(
      confirmBrowserSession({
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { access_token: 'token' } },
            error: null,
          }),
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('hard-replaces only to a sanitized destination', () => {
    const replace = jest.fn();
    replaceAuthDestination('//evil.test', { replace });
    expect(replace).toHaveBeenCalledWith('/projects');
  });
});
