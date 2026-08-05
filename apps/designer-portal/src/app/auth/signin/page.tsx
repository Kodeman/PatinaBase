'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { DevAccountsPanel, PortalAuthNotice, PortalLogin, type PortalLoginState } from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';
import { authEvents } from '@/lib/analytics/events';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';
import { confirmedSession, designerDestination, qrPresentation, shouldActivateQr } from '../auth-journey';

function SignInContent() {
  const searchParams = useSearchParams();
  const destination = designerDestination(searchParams.get('callbackUrl'));
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyOtp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'email' | 'code' | 'password' | 'apple-pending' | 'success'>('email');
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);
  const navigated = useRef(false);
  const qr = usePortalQrAuth({ baseUrl: '', enabled: shouldActivateQr(qrExpanded) });

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
    if (qr.state === 'authenticated') finish('qr');
  }, [finish, qr.state]);

  const sendCode = useCallback(async () => {
    if (!email.trim()) return;
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
  }, [destination, email, sendOtp]);

  const verifyCode = useCallback(async (value: string) => {
    if (value.length !== 6) return;
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
      setCode('');
      setError(normalizeAuthError(cause, 'invalid_code').message);
    }
  }, [email, finish, verifyOtp]);

  const signInWithPassword = useCallback(async () => {
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
  }, [email, finish, password]);

  const signInWithApple = useCallback(async () => {
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
  }, [destination]);

  const handleDevLogin = useCallback(async (devEmail: string, devPassword: string) => {
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
    }
  }, [finish]);

  const qrState: PortalLoginState = phase === 'success'
    ? 'success'
    : phase === 'code'
      ? 'code'
      : phase === 'password'
        ? 'password'
        : phase === 'apple-pending'
          ? 'apple-pending'
          : qrExpanded && (qr.state === 'expired' || qr.state === 'denied')
            ? 'qr-expired'
            : 'email';
  const qrView = qrPresentation(qr.state, qr.secondsRemaining, qr.failure?.message);
  const visibleError = error || (qr.state === 'denied'
    ? 'This QR code was declined. Refresh it for a new code, or use email instead.'
    : qr.state === 'error'
      ? qr.failure?.message ?? 'We could not prepare a QR code. Refresh it or use email instead.'
      : null);

  return (
    <DesignerAuthShell>
      <PortalLogin
        state={qrState}
        email={email}
        onEmailChange={(value) => { setEmail(value); setError(null); }}
        onSendCode={sendCode}
        code={code}
        onCodeChange={setCode}
        onVerifyCode={verifyCode}
        resendInSeconds={resendInSeconds}
        onResendCode={sendCode}
        error={visibleError}
        isSubmitting={sendOtp.isPending || verifyOtp.isPending || passwordSubmitting}
        qrCode={qr.qrUrl ? <QRCodeSVG value={qr.qrUrl} size={144} level="M" bgColor="transparent" fgColor="#252a25" /> : undefined}
        qrDescription={qrView.description}
        onOpenQr={() => { setQrExpanded(true); setError(null); }}
        onCloseQr={() => setQrExpanded(false)}
        onRefreshQr={() => void qr.regenerate()}
        oauthActions={[{ id: 'apple', label: 'Continue with Apple', available: isOAuthProviderEnabled('apple'), pending: phase === 'apple-pending', onSelect: signInWithApple }]}
        password={password}
        onPasswordChange={(value) => { setPassword(value); setError(null); }}
        onPasswordSignIn={signInWithPassword}
        passwordExpanded={passwordExpanded}
        onPasswordExpandedChange={(expanded) => { setPasswordExpanded(expanded); setPhase(expanded ? 'password' : 'email'); setError(null); }}
        onForgotPassword={() => { window.location.assign(`/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`); }}
        onChangeMethod={() => { setPhase('email'); setCode(''); setError(null); }}
        onContinue={() => window.location.replace(destination)}
        destinationHref={destination}
      />
      <div className="mt-6 space-y-3 text-center text-sm text-[#4f554f]">
        <p><Link className="underline underline-offset-4" href={`/auth/signup?callbackUrl=${encodeURIComponent(destination)}`}>Need an account? Ask to join your studio.</Link></p>
        {process.env.NODE_ENV === 'development' && <DevAccountsPanel accounts={getAccountsForPortal('designer')} onLogin={handleDevLogin} isLoading={passwordSubmitting} error={devAuthError} defaultCollapsed />}
      </div>
    </DesignerAuthShell>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<DesignerAuthShell><PortalAuthNotice title="Opening your studio">Getting the sign-in page ready.</PortalAuthNotice></DesignerAuthShell>}><SignInContent /></Suspense>;
}
