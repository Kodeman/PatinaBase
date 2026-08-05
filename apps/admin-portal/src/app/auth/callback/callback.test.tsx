import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import AuthCallbackPage from './page';

const mockFinalizeAuthCallback = jest.fn();
const mockHardNavigate = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: {} }),
  finalizeAuthCallback: (...args: unknown[]) =>
    mockFinalizeAuthCallback(...args),
}));

jest.mock('@/lib/auth-navigation', () => ({
  ...jest.requireActual('@/lib/auth-navigation'),
  hardNavigate: (...args: unknown[]) => mockHardNavigate(...args),
}));

describe('Admin auth callback', () => {
  beforeEach(() => {
    mockFinalizeAuthCallback.mockResolvedValue({
      status: 'authenticated',
      session: { user: { id: 'admin' } },
      method: 'pkce',
    });
    mockHardNavigate.mockReset();
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
    expect(mockFinalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'pkce-code',
        signal: expect.any(AbortSignal),
      }),
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
