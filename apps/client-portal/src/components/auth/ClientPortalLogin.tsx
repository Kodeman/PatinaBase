'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBrowserClient,
  isOAuthProviderEnabled,
  useAmbientQrAuth,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import { useMediaQuery } from '@patina/design-system';
import {
  PortalLogin,
  type PortalAuthQrProps,
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
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [error, setError] = useState<string | null>(
    initialError
      ? (SIGN_IN_ERRORS[initialError] ?? SIGN_IN_ERRORS.oauth)
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const completingRef = useRef(false);
  const redirectingRef = useRef(false);

  // SSR-safe, defaults false: the ambient QR is hidden on a window too small in
  // either dimension by the badge's own CSS, but it must not be GENERATED there
  // either — an always-on QR costs a generate + a poll loop against the shared,
  // rate-limited endpoint on every page view. This string is the JS twin of the
  // badge's own arbitrary media variant; the two must be changed together.
  const qrEligible = useMediaQuery('(min-width: 1024px) and (min-height: 760px)');
  const qr = useAmbientQrAuth({
    baseUrl: QR_AUTH_BASE_URL,
    enabled:
      qrEligible &&
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
    if (qr.qrState === 'authenticated') void finishAuthenticated('qr');
  }, [finishAuthenticated, qr.qrState]);

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

  // The right-pane QR disclosure is gone — its states relocate onto the
  // ambient badge's caption. Everything else (live countdown, refreshing,
  // resting, error) is drawn straight from `qr.phase` by the badge itself.
  const qrStatusMessage =
    qr.qrState === 'verifying' || qr.qrState === 'authenticated'
      ? 'Approved — signing you in…'
      : qr.qrState === 'denied'
        ? 'That request was declined.'
        : undefined;

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
    <ClientAuthShell qr={qrBadge}>
      <PortalLogin
        state={state}
        email={email}
        onEmailChange={setEmail}
        onSendCode={() => void sendCode()}
        code={code}
        onCodeChange={setCode}
        onVerifyCode={(value) => void verifyCode(value)}
        resendInSeconds={resendInSeconds}
        onResendCode={() => void sendCode()}
        error={error}
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
          if (expanded) cancelQr();
          setPasswordExpanded(expanded);
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
          qr.qrState === 'verifying'
        }
      />
    </ClientAuthShell>
  );
}
