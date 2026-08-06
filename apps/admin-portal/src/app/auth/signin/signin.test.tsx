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
const mockWakeQr = jest.fn();
const mockCancelQr = jest.fn();
const mockHardNavigate = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockQr = {
  phase: 'refreshing' as 'live' | 'refreshing' | 'resting' | 'error',
  qrState: 'idle' as
    | 'idle'
    | 'loading'
    | 'pending'
    | 'verifying'
    | 'authenticated'
    | 'expired'
    | 'denied'
    | 'error',
  qrUrl: null as string | null,
  secondsRemaining: 0,
  totalSeconds: 0,
  failure: null as { message: string } | null,
};
/** False only while a rate-limited generate is inside its backoff window. */
let mockWakeAvailable = true;
const mockUseAmbientQrAuth = jest.fn(({ enabled }: { enabled: boolean }) => ({
  ...mockQr,
  wakeAvailable: mockWakeAvailable,
  wake: mockWakeQr,
  cancel: mockCancelQr,
  enabled,
}));

/** window.matchMedia has no jsdom implementation; every test controls it
 * explicitly so the ambient QR badge's viewport gate is deterministic. */
function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
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
  useAmbientQrAuth: (options: { enabled: boolean }) =>
    mockUseAmbientQrAuth(options),
  useSendEmailOtp: () => ({ mutateAsync: mockSendOtp, isPending: false }),
  useVerifyOtp: () => ({ mutateAsync: mockVerifyOtp, isPending: false }),
}));

describe('Admin sign in', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    mockWakeAvailable = true;
    mockSearchParams = new URLSearchParams(
      'callbackUrl=%2Forders%3Fstate%3Dlate%26page%3D2',
    );
    mockQr = {
      phase: 'refreshing',
      qrState: 'idle',
      qrUrl: null,
      secondsRemaining: 0,
      totalSeconds: 0,
      failure: null,
    };
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

  it('orders email OTP, Apple, then a collapsed password method, and keeps the QR transport off below the desktop breakpoint', () => {
    render(<SignInPage />);

    expect(
      screen.getByRole('button', { name: 'Email me a one-time code' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Use email and password instead' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    // The right-pane QR disclosure is gone entirely — the badge now lives in
    // the (desktop-only) brand pane.
    expect(
      screen.queryByRole('button', { name: 'Use a QR code' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-auth-qr')).not.toBeInTheDocument();
    expect(mockUseAmbientQrAuth).toHaveBeenLastCalledWith(
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

  it('shows the ambient QR badge at the desktop breakpoint and renders denied and expired captions distinctly', async () => {
    mockMatchMedia(true);
    mockQr = {
      phase: 'live',
      qrState: 'pending',
      qrUrl: 'patina://auth?session=abc123',
      secondsRemaining: 250,
      totalSeconds: 300,
      failure: null,
    };
    const view = render(<SignInPage />);
    await waitFor(() =>
      expect(mockUseAmbientQrAuth).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true }),
      ),
    );
    expect(screen.getByTestId('portal-auth-qr')).toBeVisible();

    mockQr = {
      phase: 'resting',
      qrState: 'denied',
      qrUrl: 'patina://auth?session=abc123',
      secondsRemaining: 0,
      totalSeconds: 300,
      failure: null,
    };
    view.rerender(<SignInPage />);
    // A decline explains itself AND keeps the way back — the status message
    // replaces the countdown, never the tap affordance.
    expect(screen.getByText('That request was declined.')).toBeVisible();
    expect(screen.getByText('Tap for a fresh code')).toBeVisible();
    expect(screen.getByTestId('portal-auth-qr').tagName).toBe('BUTTON');

    mockQr = {
      phase: 'resting',
      qrState: 'expired',
      qrUrl: 'patina://auth?session=abc123',
      secondsRemaining: 0,
      totalSeconds: 300,
      failure: null,
    };
    view.rerender(<SignInPage />);
    expect(screen.getByText('Tap for a fresh code')).toBeVisible();
    expect(
      screen.queryByText('That request was declined.'),
    ).not.toBeInTheDocument();
  });

  it('withholds the tap while a rate-limited generate is still backing off', () => {
    mockMatchMedia(true);
    mockWakeAvailable = false;
    mockQr = {
      phase: 'error',
      qrState: 'error',
      qrUrl: null,
      secondsRemaining: 0,
      totalSeconds: 0,
      failure: { message: 'Too many requests' },
    };
    render(<SignInPage />);
    const badge = screen.getByTestId('portal-auth-qr');
    expect(badge.tagName).toBe('DIV');
    expect(
      screen.getByText('QR is resting. It will retry in a moment.'),
    ).toBeVisible();
    expect(
      screen.queryByText('QR is unavailable. Tap to try again.'),
    ).not.toBeInTheDocument();
  });

  it('stops QR transport before another sign-in method can run', async () => {
    mockMatchMedia(true);
    render(<SignInPage />);
    await waitFor(() =>
      expect(mockUseAmbientQrAuth).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true }),
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use email and password instead' }),
    );
    expect(mockCancelQr).toHaveBeenCalled();
    expect(mockUseAmbientQrAuth).toHaveBeenLastCalledWith(
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
