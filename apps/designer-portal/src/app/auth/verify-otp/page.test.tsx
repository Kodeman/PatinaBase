import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VerifyOtpPage from './page';

const verifyOtpMutateAsync = jest.fn();
const sendEmailOtpMutateAsync = jest.fn();
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
  safeAuthReturnPath: jest.requireActual('@patina/supabase/auth')
    .safeAuthReturnPath,
  normalizeAuthError: jest.requireActual('@patina/supabase/auth')
    .normalizeAuthError,
  createBrowserClient: () => ({
    auth: { getSession, verifyOtp: authVerifyOtp },
    functions: { invoke: functionsInvoke },
  }),
  useSendEmailOtp: () => ({
    mutateAsync: sendEmailOtpMutateAsync,
    isPending: false,
  }),
  useVerifyOtp: () => ({ mutateAsync: verifyOtpMutateAsync, isPending: false }),
}));

jest.mock('@/lib/analytics/events', () => ({
  authEvents: { login: (...args: unknown[]) => authLogin(...args) },
}));

function enterCode(code = '123456') {
  fireEvent.change(screen.getByLabelText('Six-digit code'), {
    target: { value: code },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams({ email: 'jamie@example.com' });
  getSession.mockResolvedValue({ data: { session: null } });
});

describe('Designer verify-otp — normal path', () => {
  it('signs in on a correct code without ever touching the test-account fallback', async () => {
    verifyOtpMutateAsync.mockResolvedValue({ session: { access_token: 'tok' } });
    render(<VerifyOtpPage />);

    enterCode();

    await waitFor(() => expect(authLogin).toHaveBeenCalledWith('email-otp'));
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it('shows the ordinary invalid-code error when both the real check and the fallback reject', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'not_allowed' },
    });
    render(<VerifyOtpPage />);

    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
    expect(authLogin).not.toHaveBeenCalled();
  });
});

describe('Designer verify-otp — test-account fallback', () => {
  it('tries test-account-login only after the normal verifyOtp call has failed', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: { token_hash: 'th-1' },
      error: null,
    });
    authVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'fallback-tok' } },
      error: null,
    });
    render(<VerifyOtpPage />);

    enterCode('654321');

    await waitFor(() =>
      expect(functionsInvoke).toHaveBeenCalledWith('test-account-login', {
        body: { email: 'jamie@example.com', code: '654321' },
      }),
    );
    // Called only once the real verifyOtp attempt already rejected.
    expect(verifyOtpMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('completes sign-in via token_hash when the fallback succeeds, with no visible error', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: { token_hash: 'th-1' },
      error: null,
    });
    authVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'fallback-tok' } },
      error: null,
    });
    render(<VerifyOtpPage />);

    enterCode();

    await waitFor(() => expect(authLogin).toHaveBeenCalledWith('email-otp'));
    expect(authVerifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'th-1',
    });
    expect(
      screen.queryByText(/expired or isn.t correct/i),
    ).not.toBeInTheDocument();
  });

  it('falls through to the ordinary invalid-code error on a 403 (not allowlisted / wrong code)', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'not_allowed', status: 403 },
    });
    render(<VerifyOtpPage />);

    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
    expect(authVerifyOtp).not.toHaveBeenCalled();
    expect(authLogin).not.toHaveBeenCalled();
  });

  it('falls through to the ordinary invalid-code error on a 429 (rate-limited)', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'rate_limited', status: 429 },
    });
    render(<VerifyOtpPage />);

    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
    expect(authLogin).not.toHaveBeenCalled();
  });

  it('falls through to the ordinary error when the fallback returns no token_hash', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockResolvedValue({ data: {}, error: null });
    render(<VerifyOtpPage />);

    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
    expect(authVerifyOtp).not.toHaveBeenCalled();
  });

  it('falls through to the ordinary error when the fallback network call itself throws', async () => {
    verifyOtpMutateAsync.mockRejectedValue(new Error('invalid_code'));
    functionsInvoke.mockRejectedValue(new TypeError('network down'));
    render(<VerifyOtpPage />);

    enterCode();

    expect(
      await screen.findByText(/expired or isn.t correct/i),
    ).toBeInTheDocument();
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
    render(<VerifyOtpPage />);

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
