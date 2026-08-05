import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import SignInPage from './page';

const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockGetSession = jest.fn();
const mockRegenerateQr = jest.fn();
const mockCancelQr = jest.fn();
const mockHardNavigate = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockQr = {
  state: 'idle',
  qrUrl: null as string | null,
  secondsRemaining: 0,
  failure: null as { message: string } | null,
};
const mockUsePortalQrAuth = jest.fn(({ enabled }: { enabled: boolean }) => ({
  ...mockQr,
  start: jest.fn(),
  regenerate: mockRegenerateQr,
  cancel: mockCancelQr,
  enabled,
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qr-code">{value}</div>
  ),
}));

jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: jest.fn() },
}));

jest.mock('@/lib/auth-navigation', () => ({
  ...jest.requireActual('@/lib/auth-navigation'),
  hardNavigate: (...args: unknown[]) => mockHardNavigate(...args),
}));

jest.mock('@patina/supabase', () => ({
  buildAuthCallbackUrl: (_origin: string, destination: string) =>
    `/auth/callback?callbackUrl=${encodeURIComponent(destination)}`,
  buildVerifyOtpPath: (email: string, destination: string) =>
    `/auth/verify-otp?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(destination)}`,
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
  isOAuthProviderEnabled: (provider: string) => provider === 'apple',
  normalizeAuthError: (_cause: unknown, fallback = 'unknown') => ({
    kind: fallback,
    message:
      fallback === 'invalid_code'
        ? 'That code has expired or is not correct.'
        : 'We could not sign you in just now.',
  }),
  usePortalQrAuth: (options: { enabled: boolean }) =>
    mockUsePortalQrAuth(options),
  useSendEmailOtp: () => ({ mutateAsync: mockSendOtp, isPending: false }),
  useVerifyOtp: () => ({ mutateAsync: mockVerifyOtp, isPending: false }),
}));

describe('Admin sign in', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams(
      'callbackUrl=%2Forders%3Fstate%3Dlate%26page%3D2',
    );
    mockQr = { state: 'idle', qrUrl: null, secondsRemaining: 0, failure: null };
    mockSendOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockResolvedValue({ session: { user: { id: 'admin' } } });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin' } } },
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { session: { user: { id: 'admin' } } },
      error: null,
    });
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    mockHardNavigate.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('orders email OTP, lazy QR, Apple, then a collapsed password method', () => {
    render(<SignInPage />);

    expect(
      screen.getByRole('button', { name: 'Email me a one-time code' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Use a QR code' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Use email and password instead' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(mockUsePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('opens the six-digit OTP step inline and confirms a session before hard navigation', async () => {
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ops@patina.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a one-time code' }),
    );

    await screen.findByText('Check your inbox.');
    expect(mockSendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ops@patina.com',
        redirectTo: expect.stringContaining(
          '%2Forders%3Fstate%3Dlate%26page%3D2',
        ),
      }),
    );
    expect(
      screen.getByRole('button', { name: /Resend in 60s/ }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    await screen.findByText('You’re signed in.');
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'ops@patina.com',
      token: '123456',
      type: 'email',
    });
    expect(mockGetSession).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('link', { name: 'Continue to your portal' }),
    );
    expect(mockHardNavigate).toHaveBeenCalledTimes(1);
    expect(mockHardNavigate).toHaveBeenCalledWith('/orders?state=late&page=2');
  });

  it('does not start QR transport until expanded and renders denied and expired states distinctly', async () => {
    const view = render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a QR code' }));
    expect(mockUsePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );

    mockQr = {
      state: 'denied',
      qrUrl: null,
      secondsRemaining: 0,
      failure: null,
    };
    view.rerender(<SignInPage />);
    expect(screen.getByText('That request was declined.')).toBeVisible();
    expect(
      screen.queryByText('That code has expired.'),
    ).not.toBeInTheDocument();

    mockQr = {
      state: 'expired',
      qrUrl: null,
      secondsRemaining: 0,
      failure: null,
    };
    view.rerender(<SignInPage />);
    expect(screen.getByText('That code has expired.')).toBeVisible();
  });

  it('stops QR transport before another sign-in method can run', () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a QR code' }));
    expect(mockUsePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use email and password instead' }),
    );
    expect(mockUsePortalQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('confirms the password session and does not redirect twice', async () => {
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ops@patina.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Use email and password instead' }),
    );
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText('You’re signed in.');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'ops@patina.com',
      password: 'correct-horse-battery-staple',
    });
    expect(mockGetSession).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('link', { name: 'Continue to your portal' }),
    );
    fireEvent.click(
      screen.getByRole('link', { name: 'Continue to your portal' }),
    );
    await act(async () => undefined);
    expect(mockHardNavigate).toHaveBeenCalledTimes(1);
  });
});
