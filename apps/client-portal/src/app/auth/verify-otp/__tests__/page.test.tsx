import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VerifyOtpPage from '../page';
import { replaceAuthDestination } from '@/lib/auth-redirect';

const verifyOtp = jest.fn();
const sendEmailOtp = jest.fn();
const getSession = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(
      'email=client%40example.com&callbackUrl=%2Fprojects%2Fp1%3Ftab%3Dorders',
    ),
}));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ auth: { getSession } }),
  useVerifyOtp: () => ({ mutateAsync: verifyOtp, isPending: false }),
  useSendEmailOtp: () => ({ mutateAsync: sendEmailOtp, isPending: false }),
}));
jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: jest.fn() },
}));
jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

describe('VerifyOtpPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyOtp.mockResolvedValue({ session: { access_token: 'otp' } });
    getSession.mockResolvedValue({
      data: { session: { access_token: 'persisted' } },
      error: null,
    });
  });

  it('retains the deep-linked destination and confirms a real session', async () => {
    render(<VerifyOtpPage />);
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: 'client@example.com',
        token: '123456',
        type: 'email',
      }),
    );
    expect(getSession).toHaveBeenCalled();
    expect(await screen.findByText('You’re signed in.')).toBeInTheDocument();
    await waitFor(() =>
      expect(replaceAuthDestination).toHaveBeenCalledWith(
        '/projects/p1?tab=orders',
      ),
    );
  });
});
