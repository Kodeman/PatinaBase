import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClientPortalLogin } from '../ClientPortalLogin';
import { replaceAuthDestination } from '@/lib/auth-redirect';

const sendOtp = jest.fn();
const verifyOtp = jest.fn();
const signInWithPassword = jest.fn();
const signInWithOAuth = jest.fn();
const getSession = jest.fn();
const usePortalQrAuth = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { signInWithPassword, signInWithOAuth, getSession },
  }),
  isOAuthProviderEnabled: () => true,
  useSendEmailOtp: () => ({ mutateAsync: sendOtp, isPending: false }),
  useVerifyOtp: () => ({ mutateAsync: verifyOtp, isPending: false }),
  usePortalQrAuth: (options: unknown) => usePortalQrAuth(options),
}));
jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: jest.fn() },
}));
jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

const pendingQr = {
  state: 'idle',
  qrUrl: null,
  secondsRemaining: 0,
  failure: null,
  start: jest.fn(),
  regenerate: jest.fn(),
};

describe('ClientPortalLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePortalQrAuth.mockReturnValue(pendingQr);
    sendOtp.mockResolvedValue(undefined);
    verifyOtp.mockResolvedValue({ session: { access_token: 'otp' } });
    signInWithPassword.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({
      data: { session: { access_token: 'session' } },
      error: null,
    });
  });

  it('keeps QR lazy and presents email, QR, Apple, then password in order', () => {
    render(<ClientPortalLogin />);
    expect(usePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    const email = screen.getByRole('button', { name: /one-time code/i });
    const qr = screen.getByRole('button', { name: /use a qr code/i });
    const apple = screen.getByRole('button', { name: /continue with apple/i });
    const password = screen.getByRole('button', {
      name: /email and password/i,
    });
    expect(
      email.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      qr.compareDocumentPosition(apple) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      apple.compareDocumentPosition(password) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(qr);
    expect(usePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it('sends an existing-account OTP inline and confirms a session before redirecting', async () => {
    jest.useFakeTimers();
    render(<ClientPortalLogin callbackUrl="/projects/p1?tab=orders" />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: ' client@example.com ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /one-time code/i }));
    await screen.findByText('Check your inbox.');
    expect(sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'client@example.com' }),
    );
    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(screen.getByText('You’re signed in.')).toBeInTheDocument();
    jest.advanceTimersByTime(500);
    expect(replaceAuthDestination).toHaveBeenCalledWith(
      '/projects/p1?tab=orders',
    );
    jest.useRealTimers();
  });

  it('keeps password controlled and confirms its session before success', async () => {
    render(<ClientPortalLogin />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'client@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /email and password/i }),
    );
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'client@example.com',
        password: 'secret-password',
      }),
    );
    expect(getSession).toHaveBeenCalled();
    expect(await screen.findByText('You’re signed in.')).toBeInTheDocument();
  });

  it.each([
    ['denied', 'Request declined'],
    ['expired', 'That code has expired.'],
  ])('renders a distinct %s QR state', (state, message) => {
    usePortalQrAuth.mockReturnValue({ ...pendingQr, state });
    render(<ClientPortalLogin />);
    fireEvent.click(screen.getByRole('button', { name: /use a qr code/i }));
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
