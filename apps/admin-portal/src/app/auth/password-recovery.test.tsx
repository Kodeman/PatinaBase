import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForgotPasswordPage from './forgot-password/page';
import ResetPasswordPage from './reset-password/page';

const mockResetPasswordForEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetSession = jest.fn();
const mockHardNavigate = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
    },
  }),
  normalizeAuthError: () => ({
    kind: 'unknown',
    message: 'We could not complete that request just now. Please try again.',
  }),
}));

jest.mock('@/lib/auth-navigation', () => ({
  ...jest.requireActual('@/lib/auth-navigation'),
  hardNavigate: (...args: unknown[]) => mockHardNavigate(...args),
}));

describe('Admin password recovery', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams(
      'callbackUrl=%2Forders%3Fstate%3Dlate%26sort%3Dage',
    );
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: 'admin' } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin' } } },
      error: null,
    });
    mockHardNavigate.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('uses Supabase password recovery and routes its callback through reset', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ops@patina.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your inbox.');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'ops@patina.com',
      expect.objectContaining({
        redirectTo: expect.stringMatching(
          /\/auth\/callback\?.*callbackUrl=.*reset-password.*type=recovery/,
        ),
      }),
    );
  });

  it('does not reveal whether an account exists', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'unknown@patina.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText(/If that email belongs to a Patina account/);
  });

  it('requires a recovery session before showing the reset form', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    render(<ResetPasswordPage />);

    await screen.findByText('That reset link is no longer ready.');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('updates the password, confirms the session, shows success, then hard-navigates', async () => {
    render(<ResetPasswordPage />);
    await screen.findByLabelText('New password');
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await screen.findByText('Your password is updated.');
    expect(mockUpdateUser).toHaveBeenCalledWith({
      password: 'correct-horse-battery-staple',
    });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('link', { name: 'Continue to Patina Operations' }),
    );
    expect(mockHardNavigate).toHaveBeenCalledTimes(1);
    expect(mockHardNavigate).toHaveBeenCalledWith(
      '/orders?state=late&sort=age',
    );
  });

  it('keeps raw provider errors out of recovery UI', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: new Error('SMTP host smtp-secret.internal refused password'),
    });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ops@patina.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.queryByText(/smtp-secret/i)).not.toBeInTheDocument();
  });
});
