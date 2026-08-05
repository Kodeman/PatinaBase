import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AcceptInviteForm } from '../AcceptInviteForm';
import { replaceAuthDestination } from '@/lib/auth-redirect';

const signUp = jest.fn();
const signInWithPassword = jest.fn();
const getSession = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { signUp, signInWithPassword, getSession },
  }),
}));

jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

describe('AcceptInviteForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signUp.mockResolvedValue({ data: {}, error: null });
    getSession.mockResolvedValue({
      data: { session: { access_token: 'session' } },
      error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  function completeForm() {
    fireEvent.change(screen.getByLabelText('Set a password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create account and accept' }),
    );
  }

  it('confirms the session, accepts the invite, and hard-replaces from the fallback', async () => {
    render(
      <AcceptInviteForm email="client@example.com" token="invite-token" />,
    );
    completeForm();

    const fallback = await screen.findByRole('link', {
      name: 'Continue to your portal',
    });
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/invite/accept',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'invite-token' }),
      }),
    );
    fireEvent.click(fallback);
    expect(replaceAuthDestination).toHaveBeenCalledWith('/projects');
  });

  it('gives an actionable invitation error instead of a session error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    render(
      <AcceptInviteForm email="client@example.com" token="invite-token" />,
    );
    completeForm();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ask your designer to resend it',
      ),
    );
    expect(screen.queryByText(/session/i)).not.toBeInTheDocument();
  });
});
