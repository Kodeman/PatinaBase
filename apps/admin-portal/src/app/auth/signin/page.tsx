'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildAuthCallbackUrl,
  buildVerifyOtpPath,
  createBrowserClient,
  isOAuthProviderEnabled,
  normalizeAuthError,
  useAmbientQrAuth,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import {
  DevAccountsPanel,
  PortalAuthNotice,
  PortalLogin,
  useMediaQuery,
  type PortalAuthQrProps,
  type PortalLoginState,
} from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';
import { authEvents } from '@/lib/analytics/events';
import { adminAuthDestination, hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

const QR_AUTH_BASE_URL = process.env.NEXT_PUBLIC_QR_AUTH_URL || '';

const QUERY_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin:
    'Apple sign in could not be opened. Try again, or use a code by email.',
  OAuthCallback:
    'That sign-in did not finish. Try again, or use a code by email.',
  SessionExpired: 'Your session has ended. Sign in again to keep working.',
  SessionRequired: 'Sign in to open that part of Patina Operations.',
  AccessDenied: 'This account does not have access to Patina Operations.',
};

function sessionPresent(session: unknown): boolean {
  return Boolean(session && typeof session === 'object');
}

function SignInContent() {
  const searchParams = useSearchParams();
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyOtp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<
    'email' | 'code' | 'password' | 'apple-pending' | 'success'
  >('email');
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const queryError = searchParams.get('error');
    return queryError
      ? (QUERY_ERROR_MESSAGES[queryError] ??
          'Sign-in needs another try. Please begin again.')
      : null;
  });
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);
  const completed = useRef(false);
  const redirected = useRef(false);
  // On a window too small in either dimension the badge is never even mounted
  // by the shell, but the media query gate keeps the transport from starting
  // there too — an always-on QR must not cost a generate call on a viewport
  // that never renders it. This string is the JS twin of the badge's own
  // arbitrary media variant; the two must be changed together.
  const qrEligible = useMediaQuery('(min-width: 1024px) and (min-height: 760px)');
  const qrEnabled =
    qrEligible &&
    phase === 'email' &&
    !passwordExpanded &&
    !sendOtp.isPending &&
    !passwordSubmitting &&
    !devSubmitting;
  const qr = useAmbientQrAuth({
    baseUrl: QR_AUTH_BASE_URL,
    enabled: qrEnabled,
  });
  const cancelQr = qr.cancel;

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirected.current) return;
      redirected.current = true;
      hardNavigate(destination);
    },
    [destination],
  );

  const finish = useCallback((method: string) => {
    if (completed.current) return;
    completed.current = true;
    authEvents.login(method);
    setPhase('success');
  }, []);

  useEffect(() => {
    if (phase !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 350);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, phase]);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendInSeconds((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [resendInSeconds]);

  useEffect(() => {
    if (qr.qrState === 'authenticated') finish('qr');
  }, [finish, qr.qrState]);

  const sendCode = useCallback(async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    cancelQr();
    setError(null);
    try {
      await sendOtp.mutateAsync({
        email: normalizedEmail,
        redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
      });
      setCode('');
      setResendInSeconds(60);
      setPhase('code');
      window.history.replaceState(
        null,
        '',
        buildVerifyOtpPath(normalizedEmail, destination),
      );
    } catch (cause) {
      setError(normalizeAuthError(cause).message);
    }
  }, [cancelQr, destination, email, sendOtp]);

  const verifyCode = useCallback(
    async (value: string) => {
      if (value.length !== 6 || completed.current) return;
      cancelQr();
      setError(null);
      try {
        const result = await verifyOtp.mutateAsync({
          email: email.trim(),
          token: value,
          type: 'email',
        });
        const current = await createBrowserClient().auth.getSession();
        if (!sessionPresent(result.session) && !current.data.session) {
          throw new Error('No session after code verification');
        }
        finish('email-otp');
      } catch (cause) {
        setCode('');
        setError(normalizeAuthError(cause, 'invalid_code').message);
      }
    },
    [cancelQr, email, finish, verifyOtp],
  );

  const signInWithPassword = useCallback(async () => {
    if (!email.trim() || !password) return;
    cancelQr();
    setError(null);
    setPasswordSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      if (signInError) throw signInError;
      const current = await supabase.auth.getSession();
      if (!data.session && !current.data.session) {
        throw new Error('No session after password sign in');
      }
      finish('credentials');
    } catch (cause) {
      setError(normalizeAuthError(cause, 'invalid_credentials').message);
    } finally {
      setPasswordSubmitting(false);
    }
  }, [cancelQr, email, finish, password]);

  const signInWithApple = useCallback(async () => {
    cancelQr();
    setError(null);
    setPhase('apple-pending');
    try {
      const { error: oauthError } =
        await createBrowserClient().auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: buildAuthCallbackUrl(
              window.location.origin,
              destination,
            ),
            queryParams: { response_mode: 'fragment' },
          },
        });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setPhase('email');
      setError(normalizeAuthError(cause, 'oauth').message);
    }
  }, [cancelQr, destination]);

  const handleDevLogin = useCallback(
    async (devEmail: string, devPassword: string) => {
      cancelQr();
      setDevSubmitting(true);
      setDevAuthError(null);
      try {
        const supabase = createBrowserClient();
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: devEmail,
            password: devPassword,
          });
        if (signInError) throw signInError;
        const current = await supabase.auth.getSession();
        if (!data.session && !current.data.session) {
          throw new Error('No session after development sign in');
        }
        finish('dev');
      } catch {
        setDevAuthError(
          'That development account could not be opened. Check the local setup and try again.',
        );
      } finally {
        setDevSubmitting(false);
      }
    },
    [cancelQr, finish],
  );

  const loginState: PortalLoginState =
    phase === 'success'
      ? 'success'
      : phase === 'code'
        ? 'code'
        : phase === 'password'
          ? 'password'
          : phase === 'apple-pending'
            ? 'apple-pending'
            : 'email';

  // The old right-pane disclosure's states relocate to the badge's own
  // caption. Everything else (loading/refreshing/resting/expired-renewing)
  // reads its default copy straight off `qr.phase`.
  const qrStatusMessage =
    qr.qrState === 'verifying' || qr.qrState === 'authenticated'
      ? 'Approved — signing you in…'
      : qr.qrState === 'denied'
        ? 'That request was declined.'
        : undefined;

  const isAuthSubmitting =
    sendOtp.isPending ||
    verifyOtp.isPending ||
    passwordSubmitting ||
    devSubmitting ||
    phase === 'apple-pending' ||
    qr.qrState === 'verifying';

  /**
   * Shown whenever the transport is doing something or still holds a code —
   * identical in all three portals, so a password toggle cannot make the badge
   * pop in and out. `url` is passed through as-is: null means "no code yet",
   * which the badge draws as a placeholder rather than a QR of the empty
   * string. `onWake` is withheld inside the rate-limit backoff so the badge
   * never offers a tap that would be swallowed.
   */
  const qrBadge: PortalAuthQrProps | undefined =
    qrEligible && (qr.qrState !== 'idle' || qr.qrUrl !== null)
      ? {
          url: qr.qrUrl,
          secondsRemaining: qr.secondsRemaining,
          totalSeconds: qr.totalSeconds,
          phase: qr.phase,
          statusMessage: qrStatusMessage,
          onWake: qr.wakeAvailable ? qr.wake : undefined,
        }
      : undefined;

  return (
    <AdminAuthShell qr={qrBadge}>
      <PortalLogin
        state={loginState}
        email={email}
        onEmailChange={(value) => {
          setEmail(value);
          setError(null);
        }}
        onSendCode={sendCode}
        code={code}
        onCodeChange={(value) => {
          setCode(value);
          setError(null);
        }}
        onVerifyCode={verifyCode}
        resendInSeconds={resendInSeconds}
        onResendCode={sendCode}
        error={error}
        isSubmitting={isAuthSubmitting}
        oauthActions={[
          {
            id: 'apple',
            label: 'Continue with Apple',
            available: isOAuthProviderEnabled('apple'),
            pending: phase === 'apple-pending',
            onSelect: signInWithApple,
          },
        ]}
        password={password}
        onPasswordChange={(value) => {
          setPassword(value);
          setError(null);
        }}
        onPasswordSignIn={signInWithPassword}
        passwordExpanded={passwordExpanded}
        onPasswordExpandedChange={(expanded) => {
          setPasswordExpanded(expanded);
          if (expanded) cancelQr();
          setPhase(expanded ? 'password' : 'email');
          setError(null);
        }}
        onForgotPassword={() => {
          cancelQr();
          window.location.assign(
            `/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`,
          );
        }}
        onChangeMethod={() => {
          setPhase('email');
          setCode('');
          setError(null);
        }}
        onContinue={hardRedirect}
        destinationHref={destination}
      />
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6">
          <DevAccountsPanel
            accounts={getAccountsForPortal('admin')}
            onLogin={handleDevLogin}
            isLoading={isAuthSubmitting}
            error={devAuthError}
            defaultCollapsed
          />
        </div>
      )}
    </AdminAuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening Patina Operations">
            Getting the sign-in page ready.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
