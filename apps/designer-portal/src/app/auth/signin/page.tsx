'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
} from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';
import { authEvents } from '@/lib/analytics/events';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';
import { confirmedSession, designerDestination, designerSignInNotice, type DesignerLoginPhase } from '../auth-journey';
import { tryTestAccountFallback } from '../test-account-fallback';

/**
 * The brand pane only carries the badge on a window that is both wide enough
 * and tall enough for it — below either threshold nothing is generated either.
 * This string is the JS twin of the badge's own arbitrary media variant; the
 * two must be changed together.
 */
const QR_VIEWPORT = '(min-width: 1024px) and (min-height: 760px)';

function SignInContent() {
  const searchParams = useSearchParams();
  const destination = designerDestination(searchParams.get('callbackUrl'));
  const entryNotice = designerSignInNotice(
    searchParams.get('error'),
    searchParams.get('registered'),
  );
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyOtp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<DesignerLoginPhase>('email');
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);
  const navigated = useRef(false);
  /**
   * The viewport gate is folded into `enabled`, not just into CSS: below `lg`
   * the badge is never rendered AND the QR endpoints are never called, so a
   * phone visiting sign-in costs the shared rate limiter nothing. The hook is
   * SSR-safe (false until the effect runs), so the server renders no badge.
   */
  const qrEligible = useMediaQuery(QR_VIEWPORT);
  const qrEnabled =
    qrEligible &&
    phase === 'email' &&
    !passwordExpanded &&
    !sendOtp.isPending &&
    !passwordSubmitting;
  const qr = useAmbientQrAuth({ baseUrl: '', enabled: qrEnabled });
  const cancelQr = qr.cancel;

  const finish = useCallback((method: string) => {
    if (navigated.current) return;
    navigated.current = true;
    authEvents.login(method);
    setPhase('success');
  }, []);

  useEffect(() => {
    if (phase !== 'success' || !navigated.current) return;
    const timer = window.setTimeout(() => window.location.replace(destination), 350);
    return () => window.clearTimeout(timer);
  }, [destination, phase]);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setInterval(() => setResendInSeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendInSeconds]);

  useEffect(() => {
    if (qr.qrState === 'authenticated') finish('qr');
  }, [finish, qr.qrState]);

  const sendCode = useCallback(async () => {
    if (!email.trim()) return;
    cancelQr();
    setError(null);
    try {
      await sendOtp.mutateAsync({
        email: email.trim(),
        redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
      });
      setCode('');
      setResendInSeconds(60);
      setPhase('code');
      window.history.replaceState(null, '', buildVerifyOtpPath(email.trim(), destination));
    } catch (cause) {
      setError(normalizeAuthError(cause, 'unknown').message);
    }
  }, [cancelQr, destination, email, sendOtp]);

  const verifyCode = useCallback(async (value: string) => {
    if (value.length !== 6) return;
    cancelQr();
    setError(null);
    try {
      const result = await verifyOtp.mutateAsync({ email: email.trim(), token: value, type: 'email' });
      const supabase = createBrowserClient();
      const current = await supabase.auth.getSession();
      if (!confirmedSession(result?.session, current.data.session)) {
        throw new Error('No session after code verification');
      }
      finish('email-otp');
    } catch (cause) {
      if (await tryTestAccountFallback(email.trim(), value)) {
        finish('email-otp');
        return;
      }
      setCode('');
      setError(normalizeAuthError(cause, 'invalid_code').message);
    }
  }, [cancelQr, email, finish, verifyOtp]);

  const signInWithPassword = useCallback(async () => {
    cancelQr();
    setError(null);
    setPasswordSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      const current = await supabase.auth.getSession();
      if (!data.session && !current.data.session) throw new Error('No session after password sign in');
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
      const supabase = createBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
          queryParams: { response_mode: 'fragment' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setPhase('email');
      setError(normalizeAuthError(cause, 'oauth').message);
    }
  }, [cancelQr, destination]);

  const handleDevLogin = useCallback(async (devEmail: string, devPassword: string) => {
    cancelQr();
    setDevSubmitting(true);
    setDevAuthError(null);
    try {
      const supabase = createBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword });
      if (signInError) throw signInError;
      const current = await supabase.auth.getSession();
      if (!data.session && !current.data.session) throw new Error('No session after password sign in');
      finish('dev');
    } catch {
      setDevAuthError('That development account could not be opened. Check the local setup and try again.');
    } finally {
      setDevSubmitting(false);
    }
  }, [cancelQr, finish]);

  /**
   * The QR's own outcomes are told in the badge now, not as a form error: an
   * approval, a decline, and a failed generate all read in the brand pane, so
   * the paper side only ever carries what the person typed.
   */
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
  const visibleError = error;
  const isAuthSubmitting =
    sendOtp.isPending ||
    verifyOtp.isPending ||
    passwordSubmitting ||
    devSubmitting ||
    phase === 'apple-pending' ||
    qr.qrState === 'verifying';

  return (
    <DesignerAuthShell qr={qrBadge}>
      {entryNotice && (
        <PortalAuthNotice tone={entryNotice.tone} title={entryNotice.title} className="mb-5">
          {entryNotice.description}
        </PortalAuthNotice>
      )}
      <PortalLogin
        state={phase}
        email={email}
        onEmailChange={(value) => { setEmail(value); setError(null); }}
        onSendCode={sendCode}
        code={code}
        onCodeChange={setCode}
        onVerifyCode={verifyCode}
        resendInSeconds={resendInSeconds}
        onResendCode={sendCode}
        error={visibleError}
        isSubmitting={isAuthSubmitting}
        oauthActions={[{ id: 'apple', label: 'Continue with Apple', available: isOAuthProviderEnabled('apple'), pending: phase === 'apple-pending', onSelect: signInWithApple }]}
        password={password}
        onPasswordChange={(value) => { setPassword(value); setError(null); }}
        onPasswordSignIn={signInWithPassword}
        passwordExpanded={passwordExpanded}
        onPasswordExpandedChange={(expanded) => { setPasswordExpanded(expanded); if (expanded) cancelQr(); setPhase(expanded ? 'password' : 'email'); setError(null); }}
        onForgotPassword={() => { cancelQr(); window.location.assign(`/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`); }}
        onChangeMethod={() => { setPhase('email'); setCode(''); setError(null); }}
        onContinue={() => window.location.replace(destination)}
        destinationHref={destination}
      />
      <div className="mt-6 space-y-3 text-center text-sm text-[#65594E]">
        <p><Link className="underline underline-offset-4" href={`/auth/signup?callbackUrl=${encodeURIComponent(destination)}`}>Need an account? Ask to join your studio.</Link></p>
        {process.env.NODE_ENV === 'development' && <DevAccountsPanel accounts={getAccountsForPortal('designer')} onLogin={handleDevLogin} isLoading={isAuthSubmitting} error={devAuthError} defaultCollapsed />}
      </div>
    </DesignerAuthShell>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<DesignerAuthShell><PortalAuthNotice title="Opening your studio">Getting the sign-in page ready.</PortalAuthNotice></DesignerAuthShell>}><SignInContent /></Suspense>;
}
