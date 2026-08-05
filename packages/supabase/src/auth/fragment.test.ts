import { describe, expect, it, vi } from 'vitest';
import { consumeAuthCallbackFragment } from './fragment';

function browserParts(hash: string) {
  const replaceState = vi.fn();
  return {
    location: {
      hash,
      pathname: '/auth/callback',
      search: '?type=recovery&callbackUrl=%2Fauth%2Freset-password',
    },
    history: { state: { navigation: 1 }, replaceState },
    replaceState,
  };
}

describe('consumeAuthCallbackFragment', () => {
  it('returns a one-time recovery token and scrubs it from browser history', () => {
    const browser = browserParts(
      '#token_hash=one-time-secret&type=recovery',
    );

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toEqual({
      recoveryTokenHash: 'one-time-secret',
      isRecovery: true,
      legacyRecovery: false,
      oauthError: null,
    });
    expect(browser.replaceState).toHaveBeenCalledWith(
      { navigation: 1 },
      '',
      '/auth/callback?type=recovery&callbackUrl=%2Fauth%2Freset-password',
    );
  });

  it('preserves an empty recovery token so verification fails closed', () => {
    const browser = browserParts('#token_hash=&type=recovery');

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toMatchObject({ recoveryTokenHash: '', isRecovery: true });
    expect(browser.replaceState).toHaveBeenCalledTimes(1);
  });

  it('scrubs and fails closed when a malformed token fragment omits its type', () => {
    const browser = browserParts('#token_hash=still-sensitive');

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toMatchObject({
      recoveryTokenHash: 'still-sensitive',
      isRecovery: true,
    });
    expect(browser.replaceState).toHaveBeenCalledTimes(1);
  });

  it('marks a recovery fragment without a token for fail-closed verification', () => {
    const browser = browserParts('#type=recovery');

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toMatchObject({ recoveryTokenHash: '', isRecovery: true });
    expect(browser.replaceState).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['#error=access_denied&error_description=raw-provider-secret', 'access_denied'],
    [
      '#error_code=server_error&error_description=raw-provider-secret',
      'server_error',
    ],
  ])(
    'returns only a provider code from %s and scrubs the raw description',
    (hash, code) => {
      const browser = browserParts(hash);

      expect(
        consumeAuthCallbackFragment(browser.location, browser.history),
      ).toEqual({ isRecovery: false, legacyRecovery: false, oauthError: code });
      expect(browser.replaceState).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves successful OAuth token fragments for supabase-js to consume', () => {
    const browser = browserParts(
      '#access_token=provider-token&refresh_token=provider-refresh',
    );

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toEqual({
      isRecovery: false,
      legacyRecovery: false,
      oauthError: null,
    });
    expect(browser.replaceState).not.toHaveBeenCalled();
  });

  it('leaves legacy implicit recovery tokens for supabase-js', () => {
    const browser = browserParts(
      '#access_token=legacy-access&refresh_token=legacy-refresh&type=recovery',
    );

    expect(
      consumeAuthCallbackFragment(browser.location, browser.history),
    ).toEqual({
      isRecovery: true,
      legacyRecovery: true,
      oauthError: null,
    });
    expect(browser.replaceState).not.toHaveBeenCalled();
  });
});
