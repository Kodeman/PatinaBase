import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import AuthCallbackPage from '../page';
import {
  consumeAuthCallbackFragment,
  finalizeAuthCallback,
} from '@patina/supabase/auth';
import { replaceAuthDestination } from '@/lib/auth-redirect';

let params = new URLSearchParams();

jest.mock('next/navigation', () => ({ useSearchParams: () => params }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: {} }),
}));
jest.mock('@patina/supabase/auth', () => {
  const actual = jest.requireActual('@patina/supabase/auth');
  return {
    ...actual,
    consumeAuthCallbackFragment: jest.fn(),
    finalizeAuthCallback: jest.fn(),
  };
});
jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

describe('client auth callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params = new URLSearchParams(
      'code=pkce&callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders%26view%3Dcompact',
    );
    (finalizeAuthCallback as jest.Mock).mockResolvedValue({
      status: 'authenticated',
      session: { access_token: 'token' },
      method: 'pkce',
    });
    (consumeAuthCallbackFragment as jest.Mock).mockReturnValue({
      isRecovery: false,
      oauthError: null,
    });
  });

  it('finalizes through the shared helper and preserves the full safe destination', async () => {
    jest.useFakeTimers();
    render(
      <StrictMode>
        <AuthCallbackPage />
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(finalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'pkce' }),
    );
    expect(finalizeAuthCallback).toHaveBeenCalledTimes(1);
    expect(screen.getByText('You’re signed in.')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(replaceAuthDestination).toHaveBeenCalledWith(
      '/projects/p1?tab=orders&view=compact',
    );
    jest.useRealTimers();
  });

  it('forces recovery callbacks to the password reset screen', async () => {
    params = new URLSearchParams(
      'type=recovery&callbackUrl=https%3A%2F%2Fevil.test',
    );
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(screen.getByText('You’re signed in.')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /continue to your portal/i }),
    ).toHaveAttribute('href', '/auth/reset-password');
  });

  it('uses one fragment recovery token once across Strict Mode replay', async () => {
    params = new URLSearchParams('callbackUrl=%2Fprojects%2Fp1');
    (consumeAuthCallbackFragment as jest.Mock).mockReturnValue({
      recoveryTokenHash: 'one-time-token',
      isRecovery: true,
      oauthError: null,
    });
    render(
      <StrictMode>
        <AuthCallbackPage />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByText('You’re signed in.')).toBeInTheDocument(),
    );
    expect(consumeAuthCallbackFragment).toHaveBeenCalledTimes(1);
    expect(finalizeAuthCallback).toHaveBeenCalledTimes(1);
    expect(finalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        recovery: true,
        recoveryTokenHash: 'one-time-token',
      }),
    );
    expect(
      screen.getByRole('link', { name: /continue to your portal/i }),
    ).toHaveAttribute('href', '/auth/reset-password');
  });

  it('normalizes provider errors returned in a URL fragment', async () => {
    params = new URLSearchParams();
    (consumeAuthCallbackFragment as jest.Mock).mockReturnValue({
      isRecovery: false,
      oauthError: 'access_denied',
    });
    render(<AuthCallbackPage />);

    expect(await screen.findByText(/Sign-in was cancelled/)).toBeVisible();
    expect(screen.queryByText(/raw-provider-detail/)).not.toBeInTheDocument();
    expect(finalizeAuthCallback).not.toHaveBeenCalled();
  });

  it('offers a new reset link that retains the sanitized final destination', async () => {
    params = new URLSearchParams({
      type: 'recovery',
      callbackUrl:
        '/auth/reset-password?callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders',
    });
    (finalizeAuthCallback as jest.Mock).mockResolvedValue({
      status: 'failed',
      failure: {
        kind: 'invalid_recovery',
        message:
          'That password-reset link has expired or was already used. Request a new link and try again.',
      },
    });
    render(<AuthCallbackPage />);

    expect(
      await screen.findByText(/password-reset link has expired/i),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }),
    ).toHaveAttribute(
      'href',
      '/auth/forgot-password?callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders',
    );
  });

  it('shows provider cancellation immediately without starting callback polling', async () => {
    params = new URLSearchParams(
      'error=access_denied&error_description=raw-provider-detail',
    );
    render(<AuthCallbackPage />);

    expect(await screen.findByText(/Sign-in was cancelled/)).toBeVisible();
    expect(screen.queryByText(/raw-provider-detail/)).not.toBeInTheDocument();
    expect(finalizeAuthCallback).not.toHaveBeenCalled();
  });
});
