import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import AuthCallbackPage from './page';

const mockFinalizeAuthCallback = jest.fn();
const mockConsumeAuthCallbackFragment = jest.fn();
const mockHardNavigate = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: {} }),
  consumeAuthCallbackFragment: () => mockConsumeAuthCallbackFragment(),
  finalizeAuthCallback: (...args: unknown[]) =>
    mockFinalizeAuthCallback(...args),
  normalizeOAuthCallbackError: jest.requireActual('@patina/supabase/auth')
    .normalizeOAuthCallbackError,
  recoveryFinalReturnPath: jest.requireActual('@patina/supabase/auth')
    .recoveryFinalReturnPath,
}));

jest.mock('@/lib/auth-navigation', () => ({
  ...jest.requireActual('@/lib/auth-navigation'),
  hardNavigate: (...args: unknown[]) => mockHardNavigate(...args),
}));

describe('Admin auth callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsumeAuthCallbackFragment.mockReturnValue({
      isRecovery: false,
      oauthError: null,
    });
    mockFinalizeAuthCallback.mockResolvedValue({
      status: 'authenticated',
      session: { user: { id: 'admin' } },
      method: 'pkce',
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('finalizes auth and retains the complete internal query', async () => {
    mockSearchParams = new URLSearchParams(
      'code=pkce-code&callbackUrl=%2Forders%3Fstate%3Dlate%26sort%3Dage',
    );
    render(
      <StrictMode>
        <AuthCallbackPage />
      </StrictMode>,
    );

    await screen.findByText('You’re signed in.');
    expect(mockFinalizeAuthCallback).toHaveBeenCalledTimes(1);
    expect(mockFinalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'pkce-code' }),
    );
    const fallback = screen.getByRole('link', {
      name: 'Continue to your portal',
    });
    expect(fallback).toHaveAttribute('href', '/orders?state=late&sort=age');
    fireEvent.click(fallback);
    expect(mockHardNavigate).toHaveBeenCalledWith(
      '/orders?state=late&sort=age',
    );
  });

  it('rejects an external callback destination', async () => {
    mockSearchParams = new URLSearchParams(
      'code=pkce-code&callbackUrl=https%3A%2F%2Fattacker.example%2Fsteal',
    );
    render(<AuthCallbackPage />);

    const fallback = await screen.findByRole('link', {
      name: 'Continue to your portal',
    });
    expect(fallback).toHaveAttribute('href', '/dashboard');
  });

  it('always sends recovery callbacks to the reset form', async () => {
    mockSearchParams = new URLSearchParams(
      'type=recovery&code=recovery-code&callbackUrl=%2Forders%3Fstate%3Dlate',
    );
    render(<AuthCallbackPage />);

    const fallback = await screen.findByRole('link', {
      name: 'Choose a new password',
    });
    expect(fallback).toHaveAttribute('href', '/auth/reset-password');
  });

  it('verifies one fragment recovery token once in Strict Mode', async () => {
    mockSearchParams = new URLSearchParams(
      'callbackUrl=%2Forders%3Fstate%3Dlate',
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

    const fallback = await screen.findByRole('link', {
      name: 'Choose a new password',
    });
    expect(fallback).toHaveAttribute('href', '/auth/reset-password');
    expect(mockConsumeAuthCallbackFragment).toHaveBeenCalledTimes(1);
    expect(mockFinalizeAuthCallback).toHaveBeenCalledTimes(1);
    expect(mockFinalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        recovery: true,
        recoveryTokenHash: 'one-time-token',
      }),
    );
  });

  it('handles a provider error from the fragment without exposing its description', async () => {
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

  it('offers a new reset link with an unsafe final destination removed', async () => {
    mockSearchParams = new URLSearchParams({
      type: 'recovery',
      callbackUrl:
        '/auth/reset-password?callbackUrl=https%3A%2F%2Fevil.test%2Fsteal',
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
      '/auth/forgot-password?callbackUrl=%2Fdashboard',
    );
  });

  it('renders only friendly callback failures', async () => {
    mockSearchParams = new URLSearchParams('code=bad-code');
    mockFinalizeAuthCallback.mockResolvedValue({
      status: 'failed',
      failure: {
        kind: 'oauth',
        message:
          'That sign-in did not finish. Try again, or use a code by email.',
      },
    });
    render(<AuthCallbackPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.getByText(/That sign-in did not finish/)).toBeVisible();
    expect(screen.queryByText(/bad-code/)).not.toBeInTheDocument();
  });
});
