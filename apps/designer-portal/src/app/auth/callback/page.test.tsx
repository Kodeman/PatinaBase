import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import AuthCallbackPage from './page';

const mockFinalizeAuthCallback = jest.fn();
const mockConsumeAuthCallbackFragment = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@patina/supabase', () => ({
  buildSignInPath: jest.requireActual('@patina/supabase/auth').buildSignInPath,
  safeAuthReturnPath: jest.requireActual('@patina/supabase/auth')
    .safeAuthReturnPath,
  consumeAuthCallbackFragment: () => mockConsumeAuthCallbackFragment(),
  createBrowserClient: () => ({ auth: {} }),
  finalizeAuthCallback: (...args: unknown[]) =>
    mockFinalizeAuthCallback(...args),
  normalizeOAuthCallbackError: jest.requireActual('@patina/supabase/auth')
    .normalizeOAuthCallbackError,
  recoveryFinalReturnPath: jest.requireActual('@patina/supabase/auth')
    .recoveryFinalReturnPath,
}));

describe('Designer auth callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('code=pkce');
    mockConsumeAuthCallbackFragment.mockReturnValue({
      isRecovery: false,
      oauthError: null,
    });
    mockFinalizeAuthCallback.mockResolvedValue({
      status: 'authenticated',
      session: { access_token: 'session' },
      method: 'pkce',
    });
  });

  it('uses one fragment recovery token once across Strict Mode replay', async () => {
    mockSearchParams = new URLSearchParams(
      'callbackUrl=%2Fdesk%3Fbook%3Dorders',
    );
    mockConsumeAuthCallbackFragment.mockReturnValue({
      recoveryTokenHash: 'one-time-token',
      isRecovery: true,
      oauthError: null,
    });
    render(
      <StrictMode>
        <AuthCallbackPage />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('link', { name: /continue to your portal/i }),
    ).toHaveAttribute('href', '/auth/reset-password');
    expect(mockConsumeAuthCallbackFragment).toHaveBeenCalledTimes(1);
    expect(mockFinalizeAuthCallback).toHaveBeenCalledTimes(1);
    expect(mockFinalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        recovery: true,
        recoveryTokenHash: 'one-time-token',
      }),
    );
  });

  it('normalizes an OAuth error fragment without exposing provider detail', async () => {
    mockSearchParams = new URLSearchParams();
    mockConsumeAuthCallbackFragment.mockReturnValue({
      isRecovery: false,
      oauthError: 'access_denied',
    });
    render(<AuthCallbackPage />);

    expect(await screen.findByText(/Sign-in was cancelled/)).toBeVisible();
    expect(screen.queryByText(/raw-provider-detail/)).not.toBeInTheDocument();
    expect(mockFinalizeAuthCallback).not.toHaveBeenCalled();
  });

  it('offers a new reset link with the sanitized final destination', async () => {
    mockSearchParams = new URLSearchParams({
      type: 'recovery',
      callbackUrl:
        '/auth/reset-password?callbackUrl=%2Fdesk%3Fbook%3Dorders',
    });
    mockFinalizeAuthCallback.mockResolvedValue({
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
      '/auth/forgot-password?callbackUrl=%2Fdesk%3Fbook%3Dorders',
    );
  });
});
