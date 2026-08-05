'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  buildAuthCallbackUrl,
  buildVerifyOtpPath,
  createBrowserClient,
  isOAuthProviderEnabled,
  normalizeAuthError,
  usePortalQrAuth,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import {
  DevAccountsPanel,
  PortalAuthNotice,
  PortalLogin,
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
  const [qrExpanded, setQrExpanded] = useState(false);
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
  const qr = usePortalQrAuth({
    baseUrl: QR_AUTH_BASE_URL,
    enabled:
      qrExpanded &&
      phase === 'email' &&
      !passwordExpanded &&
      !sendOtp.isPending &&
      !passwordSubmitting &&
      !devSubmitting,
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
    if (qr.state === 'authenticated') finish('qr');
  }, [finish, qr.state]);

  const sendCode = useCallback(async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    cancelQr();
    setQrExpanded(false);
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
    setQrExpanded(false);
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
    setQrExpanded(false);
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
      setQrExpanded(false);
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
            : qrExpanded
              ? qr.state === 'expired'
                ? 'qr-expired'
                : 'qr'
              : 'email';

  const qrCode =
    qr.state === 'denied' ? (
      <div role="status" className="space-y-3 text-sm text-[#4f554f]">
        <p className="font-semibold text-[#252a25]">
          That request was declined.
        </p>
        <button
          type="button"
          className="min-h-11 underline underline-offset-4"
          onClick={() => void qr.regenerate()}
        >
          Make a new QR code
        </button>
      </div>
    ) : qr.state === 'error' ? (
      <div role="alert" className="space-y-3 text-sm text-[#4f554f]">
        <p>{qr.failure?.message ?? 'We could not prepare a QR code.'}</p>
        <button
          type="button"
          className="min-h-11 underline underline-offset-4"
          onClick={() => void qr.regenerate()}
        >
          Try QR again
        </button>
      </div>
    ) : qr.qrUrl ? (
      <QRCodeSVG
        value={qr.qrUrl}
        size={144}
        level="M"
        bgColor="transparent"
        fgColor="#252a25"
      />
    ) : undefined;

  const qrDescription =
    qr.state === 'loading'
      ? 'Preparing a private code for your phone.'
      : qr.state === 'verifying'
        ? 'Your phone approved this code. Confirming your session now.'
        : qr.state === 'denied'
          ? 'No session was opened. You can make a new code or use email.'
          : qr.state === 'error'
            ? 'Use email while the QR connection is unavailable.'
            : qr.state === 'pending'
              ? `Scan with the Patina app. Expires in ${qr.secondsRemaining}s.`
              : 'Use your signed-in phone to scan this code.';
  const isAuthSubmitting =
    sendOtp.isPending ||
    verifyOtp.isPending ||
    passwordSubmitting ||
    devSubmitting ||
    phase === 'apple-pending' ||
    qr.state === 'verifying';

  return (
    <AdminAuthShell>
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
        qrCode={qrCode}
        qrDescription={qrDescription}
        onOpenQr={() => {
          setQrExpanded(true);
          setError(null);
        }}
        onCloseQr={() => {
          cancelQr();
          setQrExpanded(false);
        }}
        onRefreshQr={() => void qr.regenerate()}
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
          if (expanded) {
            cancelQr();
            setQrExpanded(false);
          }
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
