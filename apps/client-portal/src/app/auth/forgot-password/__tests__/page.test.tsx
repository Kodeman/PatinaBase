import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForgotPasswordPage from '../page';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const resetPassword = jest.fn();
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { resetPasswordForEmail: resetPassword },
  }),
}));

describe('ForgotPasswordPage', () => {
  it('uses the same non-enumerating success response when the request fails', async () => {
    resetPassword.mockRejectedValueOnce(new Error('user not found'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
    await waitFor(() =>
      expect(screen.getByText(/If an account exists/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });

  it('sends a Supabase recovery callback that retains the safe destination', async () => {
    resetPassword.mockResolvedValueOnce({ error: null });
    window.history.replaceState(
      null,
      '',
      '/auth/forgot-password?callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders',
    );
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'client@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalled());
    const [, options] = resetPassword.mock.calls.at(-1)!;
    const callback = new URL(options.redirectTo);
    expect(callback.searchParams.get('type')).toBe('recovery');
    const resetPath = callback.searchParams.get('callbackUrl')!;
    expect(new URL(resetPath, window.location.origin).searchParams.get('callbackUrl'))
      .toBe('/projects/p1?tab=orders');
  });

  it('shows a friendly retry instead of claiming a rate-limited email was sent', async () => {
    resetPassword.mockResolvedValueOnce({
      error: { status: 429, message: 'rate limit exceeded' },
    });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'client@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));

    expect(await screen.findByText(/Too many attempts/)).toBeVisible();
    expect(screen.queryByText(/Check your inbox/)).not.toBeInTheDocument();
  });
});
