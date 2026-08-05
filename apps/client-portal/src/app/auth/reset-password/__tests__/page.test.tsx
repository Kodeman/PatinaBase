import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import ResetPasswordPage from '../page';
import { replaceAuthDestination } from '@/lib/auth-redirect';

const getSession = jest.fn();
const updatePassword = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: { getSession } }),
  useUpdatePassword: () => ({ mutateAsync: updatePassword, isPending: false }),
}));
jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: 'recovery' } },
      error: null,
    });
    updatePassword.mockResolvedValue(undefined);
    searchParams = new URLSearchParams();
  });

  it('validates, updates through Supabase, reconfirms the session, and hard redirects', async () => {
    searchParams = new URLSearchParams(
      'callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders',
    );
    jest.useFakeTimers();
    render(<ResetPasswordPage />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updatePassword).toHaveBeenCalledWith({ password: 'StrongPass1' });
    expect(getSession).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Your password is updated.')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(replaceAuthDestination).toHaveBeenCalledWith(
      '/projects/p1?tab=orders',
    );
    jest.useRealTimers();
  });

  it('rejects an expired recovery session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<ResetPasswordPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/recovery link isn’t ready/i),
      ).toBeInTheDocument(),
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('explains a reused password without mislabeling it as a session failure', async () => {
    updatePassword.mockRejectedValueOnce({ code: 'same_password' });
    render(<ResetPasswordPage />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText(/have not used/)).toBeVisible();
    expect(screen.queryByText(/session/i)).not.toBeInTheDocument();
  });
});
