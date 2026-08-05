'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  createBrowserClient,
  isOAuthProviderEnabled,
  usePortalQrAuth,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalLogin,
  type PortalLoginState,
} from '@patina/design-system/PortalAuth';
import {
  buildAuthCallbackUrl,
  confirmBrowserSession,
  replaceAuthDestination,
  resolveAuthReturnPath,
} from '@/lib/auth-redirect';
import { authEvents } from '@/lib/analytics/events';
import { ClientAuthShell } from './ClientAuthShell';

const QR_AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_QR_AUTH_URL || 'http://localhost:3000';

const SIGN_IN_ERRORS: Record<string, string> = {
  oauth: 'That sign-in didn’t finish. Try again, or use a code by email.',
  OAuthCallback:
    'That sign-in didn’t finish. Try again, or use a code by email.',
  SessionExpired: 'Your session expired. Sign in again to continue.',
  SessionRequired: 'Sign in to continue.',
  AccessDenied: 'This account does not have access to the client portal.',
};

interface ClientPortalLoginProps {
  callbackUrl?: string | null;
  initialError?: string | null;
}

export function ClientPortalLogin({
  callbackUrl,
  initialError,
}: ClientPortalLoginProps) {
  const destination = resolveAuthReturnPath(callbackUrl);
  const [supabase] = useState(() => createBrowserClient());
  const sendEmailOtp = useSendEmailOtp();
  const verifyOtp = useVerifyOtp();
  const [state, setState] = useState<PortalLoginState>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [error, setError] = useState<string | null>(
    initialError
      ? (SIGN_IN_ERRORS[initialError] ?? SIGN_IN_ERRORS.oauth)
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const completingRef = useRef(false);
  const redirectingRef = useRef(false);

  const qr = usePortalQrAuth({
    baseUrl: QR_AUTH_BASE_URL,
    enabled:
      qrExpanded &&
      state === 'email' &&
      !passwordExpanded &&
      !isSubmitting,
  });
  const cancelQr = qr.cancel;

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      replaceAuthDestination(destination);
    },
    [destination],
  );

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResendInSeconds((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendInSeconds]);

  const finishAuthenticated = useCallback(
    async (method: 'email-code' | 'password' | 'qr') => {
      if (completingRef.current) return;
      completingRef.current = true;
      try {
        await confirmBrowserSession(supabase);
        authEvents.login(method === 'email-code' ? 'magic-link' : method);
        setError(null);
        setState('success');
      } catch (sessionError) {
        setError(normalizeAuthError(sessionError, 'session').message);
        completingRef.current = false;
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (qr.state === 'authenticated') void finishAuthenticated('qr');
  }, [finishAuthenticated, qr.state]);

  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hardRedirect, state]);

  const sendCode = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    cancelQr();
    setQrExpanded(false);
    setIsSubmitting(true);
    setError(null);
    try {
      await sendEmailOtp.mutateAsync({
        email: normalizedEmail,
        redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
      });
      setEmail(normalizedEmail);
      setCode('');
      setResendInSeconds(60);
      setState('code');
    } catch (sendError) {
      setError(normalizeAuthError(sendError).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (nextCode: string) => {
    if (nextCode.length !== 6 || isSubmitting) return;
    cancelQr();
    setIsSubmitting(true);
    setError(null);
    try {
      await verifyOtp.mutateAsync({ email, token: nextCode, type: 'email' });
      await finishAuthenticated('email-code');
    } catch (verifyError) {
      setCode('');
      setError(normalizeAuthError(verifyError, 'invalid_code').message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithPassword = async () => {
    if (!email.trim() || !password) return;
    cancelQr();
    setQrExpanded(false);
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (passwordError) throw passwordError;
      await finishAuthenticated('password');
    } catch (passwordError) {
      setError(
        normalizeAuthError(passwordError, 'invalid_credentials').message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithApple = async () => {
    cancelQr();
    setQrExpanded(false);
    setState('apple-pending');
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
          queryParams: { response_mode: 'fragment' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setState('email');
      setError(normalizeAuthError(oauthError, 'oauth').message);
    }
  };

  let loginState = state;
  if (state !== 'code' && state !== 'apple-pending' && state !== 'success') {
    loginState = qrExpanded
      ? qr.state === 'expired'
        ? 'qr-expired'
        : 'qr'
      : 'email';
  }

  let qrCode: React.ReactNode;
  let qrDescription: string | undefined;
  if (qr.state === 'denied') {
    qrCode = (
      <div className="space-y-3">
        <PortalAuthNotice tone="error" title="Request declined">
          Approve a new request from a signed-in phone, or choose another
          sign-in method.
        </PortalAuthNotice>
        <button
          type="button"
          onClick={() => void qr.regenerate()}
          className="min-h-11 text-sm font-semibold underline underline-offset-4"
        >
          Make a new QR code
        </button>
      </div>
    );
    qrDescription = 'This QR request was declined.';
  } else if (qr.state === 'error') {
    qrCode = (
      <div className="space-y-3">
        <PortalAuthNotice tone="error" title="QR unavailable">
          {qr.failure?.message ?? 'We couldn’t prepare a QR code.'}
        </PortalAuthNotice>
        <button
          type="button"
          onClick={() => void qr.regenerate()}
          className="min-h-11 text-sm font-semibold underline underline-offset-4"
        >
          Try another QR code
        </button>
      </div>
    );
    qrDescription = 'Refresh the QR code, or sign in another way.';
  } else if (qr.qrUrl) {
    qrCode = (
      <QRCodeSVG
        value={qr.qrUrl}
        size={136}
        title="Client portal sign-in QR code"
      />
    );
    qrDescription =
      qr.state === 'verifying'
        ? 'Approved. Finishing your secure sign-in…'
        : qr.state === 'authenticated'
          ? 'Signed in. Opening your projects now…'
          : `Scan with your signed-in phone. Expires in ${qr.secondsRemaining} seconds.`;
  }

  return (
    <ClientAuthShell>
      <PortalLogin
        state={loginState}
        email={email}
        onEmailChange={setEmail}
        onSendCode={() => void sendCode()}
        code={code}
        onCodeChange={setCode}
        onVerifyCode={(value) => void verifyCode(value)}
        resendInSeconds={resendInSeconds}
        onResendCode={() => void sendCode()}
        error={error}
        qrCode={qrCode}
        qrDescription={qrDescription}
        onOpenQr={() => {
          setError(null);
          setQrExpanded(true);
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
            pending: state === 'apple-pending',
            onSelect: () => void signInWithApple(),
          },
        ]}
        password={password}
        onPasswordChange={setPassword}
        onPasswordSignIn={() => void signInWithPassword()}
        passwordExpanded={passwordExpanded}
        onPasswordExpandedChange={(expanded) => {
          setPasswordExpanded(expanded);
          if (expanded) {
            cancelQr();
            setQrExpanded(false);
          }
        }}
        onForgotPassword={() => {
          cancelQr();
          window.location.assign(
            `/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`,
          )
        }}
        onChangeMethod={() => {
          setCode('');
          setError(null);
          setState('email');
        }}
        onContinue={hardRedirect}
        destinationHref={destination}
        isSubmitting={
          isSubmitting ||
          state === 'apple-pending' ||
          qr.state === 'verifying'
        }
      />
    </ClientAuthShell>
  );
}
