import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClientPortalLogin } from '../ClientPortalLogin';
import { replaceAuthDestination } from '@/lib/auth-redirect';

const sendOtp = jest.fn();
const verifyOtp = jest.fn();
const signInWithPassword = jest.fn();
const signInWithOAuth = jest.fn();
const getSession = jest.fn();
const useAmbientQrAuth = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { signInWithPassword, signInWithOAuth, getSession },
  }),
  isOAuthProviderEnabled: () => true,
  useSendEmailOtp: () => ({ mutateAsync: sendOtp, isPending: false }),
  useVerifyOtp: () => ({ mutateAsync: verifyOtp, isPending: false }),
  useAmbientQrAuth: (options: unknown) => useAmbientQrAuth(options),
}));
jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: jest.fn() },
}));
jest.mock('@/lib/auth-redirect', () => {
  const actual = jest.requireActual('@/lib/auth-redirect');
  return { ...actual, replaceAuthDestination: jest.fn() };
});

// What useAmbientQrAuth reports while disabled (below `lg`, mid-password,
// mid-submit) — the component treats this as "not shown".
const idleQr = {
  phase: 'refreshing' as const,
  qrState: 'idle' as const,
  qrUrl: null,
  secondsRemaining: 0,
  totalSeconds: 0,
  failure: null,
  wakeAvailable: true,
  wake: jest.fn(),
  cancel: jest.fn(),
};

function mockViewport(matches: boolean) {
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

describe('ClientPortalLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewport(false); // jsdom's honest default: no matched media query.
    useAmbientQrAuth.mockReturnValue(idleQr);
    sendOtp.mockResolvedValue(undefined);
    verifyOtp.mockResolvedValue({ session: { access_token: 'otp' } });
    signInWithPassword.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({
      data: { session: { access_token: 'session' } },
      error: null,
    });
  });

  it('presents email, Apple, then password in order, with no QR disclosure', () => {
    render(<ClientPortalLogin />);
    const email = screen.getByRole('button', { name: /one-time code/i });
    const apple = screen.getByRole('button', { name: /continue with apple/i });
    const password = screen.getByRole('button', {
      name: /email and password/i,
    });
    expect(
      email.compareDocumentPosition(apple) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      apple.compareDocumentPosition(password) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /use a qr code/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the ambient QR lazy: disabled and unrendered under jsdom’s default viewport', () => {
    render(<ClientPortalLogin />);
    expect(useAmbientQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    // qrState 'idle' is treated as "not shown" — the badge never mounts, so
    // no request is even eligible to fire for a viewport that can't see it.
    expect(screen.queryByTestId('portal-auth-qr')).not.toBeInTheDocument();
  });

  it('disables the ambient QR while the password panel is open, even on desktop', () => {
    mockViewport(true);
    render(<ClientPortalLogin />);
    expect(useAmbientQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /email and password/i }),
    );
    expect(useAmbientQrAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
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
    ['denied', 'That request was declined.'],
    ['expired', 'Tap for a fresh code'],
  ] as const)(
    'renders the %s ambient QR caption directly — no disclosure to click open',
    (qrState, message) => {
      mockViewport(true);
      useAmbientQrAuth.mockReturnValue({
        ...idleQr,
        phase: 'resting',
        qrState,
        qrUrl: 'patina://auth?token=abc',
      });
      render(<ClientPortalLogin />);
      expect(screen.getByTestId('portal-auth-qr')).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  it('keeps the tap affordance under a declined status message', () => {
    mockViewport(true);
    useAmbientQrAuth.mockReturnValue({
      ...idleQr,
      phase: 'resting',
      qrState: 'denied',
      qrUrl: 'patina://auth?token=abc',
    });
    render(<ClientPortalLogin />);
    // The message replaces the countdown, never the way back to a fresh code.
    expect(screen.getByText('That request was declined.')).toBeInTheDocument();
    expect(screen.getByText('Tap for a fresh code')).toBeInTheDocument();
    expect(screen.getByTestId('portal-auth-qr').tagName).toBe('BUTTON');
  });

  it('drops the button while a rate-limited generate is backing off', () => {
    mockViewport(true);
    useAmbientQrAuth.mockReturnValue({
      ...idleQr,
      phase: 'error',
      qrState: 'error',
      qrUrl: null,
      wakeAvailable: false,
    });
    render(<ClientPortalLogin />);
    expect(screen.getByTestId('portal-auth-qr').tagName).toBe('DIV');
    expect(
      screen.getByText('QR is resting. It will retry in a moment.'),
    ).toBeInTheDocument();
  });

  it('draws a placeholder — not a code of the empty string — before the first generate', () => {
    mockViewport(true);
    useAmbientQrAuth.mockReturnValue({
      ...idleQr,
      phase: 'refreshing',
      qrState: 'loading',
      qrUrl: null,
    });
    render(<ClientPortalLogin />);
    const modules = Array.from(
      screen
        .getByTestId('portal-auth-qr-matrix')
        .querySelectorAll('circle[fill="#E5E2DD"]'),
    );
    expect(modules).toHaveLength(0);
    expect(screen.getByText('Making a fresh code…')).toBeInTheDocument();
  });

  it('surfaces an approved QR as a status message and signs the session in', async () => {
    mockViewport(true);
    useAmbientQrAuth.mockReturnValue({
      ...idleQr,
      phase: 'live',
      qrState: 'authenticated',
      qrUrl: 'patina://auth?token=abc',
      secondsRemaining: 120,
      totalSeconds: 300,
    });
    render(<ClientPortalLogin />);
    expect(screen.getByText('Approved — signing you in…')).toBeInTheDocument();
    expect(await screen.findByText('You’re signed in.')).toBeInTheDocument();
  });
});
