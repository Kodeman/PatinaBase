import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignInPage from './page';

const sendEmailOtpMutateAsync = jest.fn();
const verifyOtpMutateAsync = jest.fn();
const getSession = jest.fn();
const authVerifyOtp = jest.fn();
const functionsInvoke = jest.fn();
const authLogin = jest.fn();

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@patina/supabase', () => ({
  buildAuthCallbackUrl: jest.requireActual('@patina/supabase/auth')
    .buildAuthCallbackUrl,
  buildVerifyOtpPath: jest.requireActual('@patina/supabase/auth')
    .buildVerifyOtpPath,
  safeAuthReturnPath: jest.requireActual('@patina/supabase/auth')
    .safeAuthReturnPath,
  normalizeAuthError: jest.requireActual('@patina/supabase/auth')
    .normalizeAuthError,
  isOAuthProviderEnabled: () => false,
  createBrowserClient: () => ({
    auth: {
      getSession,
      verifyOtp: authVerifyOtp,
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
    functions: { invoke: functionsInvoke },
  }),
  useSendEmailOtp: () => ({
    mutateAsync: sendEmailOtpMutateAsync,
    isPending: false,
  }),
  useVerifyOtp: () => ({ mutateAsync: verifyOtpMutateAsync, isPending: false }),
  useAmbientQrAuth: () => ({
    qrState: 'idle',
    qrUrl: null,
    secondsRemaining: 0,
    totalSeconds: 0,
    phase: 'idle',
    wakeAvailable: false,
    wake: jest.fn(),
    cancel: jest.fn(),
  }),
}));

jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: (...args: unknown[]) => authLogin(...args) },
}));

async function fillEmail(email = 'jamie@example.com') {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: email },
  });
}

async function sendCode() {
  await fillEmail();
  fireEvent.click(
    screen.getByRole('button', { name: 'Email me a one-time code' }),
  );
  await screen.findByLabelText('Six-digit code');
}

function enterCode(code = '123456') {
  fireEvent.change(screen.getByLabelText('Six-digit code'), {
    target: { value: code },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  getSession.mockResolvedValue({ data: { session: null } });
  sendEmailOtpMutateAsync.mockResolvedValue(undefined);
});

describe('Designer signin — own inline OTP entry, normal path', () => {
  it('signs in on a correct code without ever touching the test-account fallback', async () => {
    verifyOtpMutateAsync.mockResolvedValue({ session: { access_token: 'tok' } });
    render(<SignInPage />);

    await sendCode();
    enterCode();

    await waitFor(() => expect(authLogin).toHaveBeenCalledWith('email-otp'));
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});

describe('Designer signin — test-account fallback (regression: signin has its own inline code entry, verify-otp/page.tsx is a separate route)', () => {
  it('tries test-account-login only after the normal verifyOtp call on THIS page has failed', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: { token_hash: 'th-1' },
      error: null,
    });
    authVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'fallback-tok' } },
      error: null,
    });
    render(<SignInPage />);

    await sendCode();
    enterCode('654321');

    await waitFor(() =>
      expect(functionsInvoke).toHaveBeenCalledWith('test-account-login', {
        body: { email: 'jamie@example.com', code: '654321' },
      }),
    );
    expect(verifyOtpMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('completes sign-in via the magiclink token_hash when the fallback succeeds', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: { token_hash: 'th-1' },
      error: null,
    });
    authVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'fallback-tok' } },
      error: null,
    });
    render(<SignInPage />);

    await sendCode();
    enterCode();

    await waitFor(() => expect(authLogin).toHaveBeenCalledWith('email-otp'));
    expect(authVerifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'th-1',
    });
  });

  it('falls through to the ordinary invalid-code error when both the real check and the fallback reject', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'not_allowed' },
    });
    render(<SignInPage />);

    await sendCode();
    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
    expect(authLogin).not.toHaveBeenCalled();
  });

  it('never logs the submitted code', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'not_allowed' },
    });
    render(<SignInPage />);

    await sendCode();
    enterCode('998877');
    await screen.findByText(/expired or isn.t correct/i);

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => String(v))
      .join(' ');
    expect(allLoggedText).not.toContain('998877');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
