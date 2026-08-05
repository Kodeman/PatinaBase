import { act, render, screen, waitFor } from '@testing-library/react';
import AuthCallbackPage from '../page';
import { finalizeAuthCallback } from '@patina/supabase/auth';
import { replaceAuthDestination } from '@/lib/auth-redirect';

let params = new URLSearchParams();

jest.mock('next/navigation', () => ({ useSearchParams: () => params }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: {} }),
}));
jest.mock('@patina/supabase/auth', () => {
  const actual = jest.requireActual('@patina/supabase/auth');
  return { ...actual, finalizeAuthCallback: jest.fn() };
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
  });

  it('finalizes through the shared helper and preserves the full safe destination', async () => {
    jest.useFakeTimers();
    render(<AuthCallbackPage />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(finalizeAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'pkce' }),
    );
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
});
