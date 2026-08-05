import {
  adminAuthDestination,
  buildRecoveryCallbackUrl,
  recoveryDestination,
  requestDestination,
} from '../auth-navigation';

describe('admin auth navigation', () => {
  it('keeps an internal pathname with its complete query', () => {
    expect(requestDestination('/orders', '?state=late&sort=age')).toBe(
      '/orders?state=late&sort=age',
    );
    expect(adminAuthDestination('/people?role=admin&page=2')).toBe(
      '/people?role=admin&page=2',
    );
  });

  it.each([
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '/%2f%2fattacker.example/steal',
    '/\\attacker.example/steal',
  ])('rejects an open-redirect target: %s', (target) => {
    expect(adminAuthDestination(target)).toBe('/dashboard');
  });

  it('forces recovery callbacks through the reset-password route', () => {
    expect(recoveryDestination('/orders?state=late')).toBe(
      '/auth/reset-password',
    );
    expect(recoveryDestination('//attacker.example')).toBe(
      '/auth/reset-password',
    );
    expect(
      recoveryDestination(
        '/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate',
      ),
    ).toBe('/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate');
  });

  it('builds a recovery callback that retains the final full destination', () => {
    const callback = new URL(
      buildRecoveryCallbackUrl(
        'https://admin.patina.cloud',
        '/orders?state=late&sort=age',
      ),
    );
    expect(callback.origin).toBe('https://admin.patina.cloud');
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('type')).toBe('recovery');
    expect(callback.searchParams.get('callbackUrl')).toBe(
      '/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate%26sort%3Dage',
    );
  });
});
