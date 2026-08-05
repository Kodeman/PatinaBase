'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  buildAuthCallbackUrl,
  createBrowserClient,
  normalizeAuthError,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import { PortalAuthNotice, PortalLogin } from '@patina/design-system';
import { authEvents } from '@/lib/analytics/events';
import { adminAuthDestination, hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

function VerifyOtpContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const verifyOtp = useVerifyOtp();
  const resendOtp = useSendEmailOtp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendInSeconds, setResendInSeconds] = useState(60);
  const [success, setSuccess] = useState(false);
  const completed = useRef(false);
  const redirected = useRef(false);

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirected.current) return;
      redirected.current = true;
      hardNavigate(destination);
    },
    [destination],
  );

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendInSeconds((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [resendInSeconds]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(hardRedirect, 350);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, success]);

  const verify = useCallback(
    async (value: string) => {
      if (!email || value.length !== 6 || completed.current) return;
      setError(null);
      try {
        const result = await verifyOtp.mutateAsync({
          email,
          token: value,
          type: 'email',
        });
        const current = await createBrowserClient().auth.getSession();
        if (!result.session && !current.data.session) {
          throw new Error('No session after code verification');
        }
        completed.current = true;
        authEvents.login('email-otp');
        setSuccess(true);
      } catch (cause) {
        setCode('');
        setError(normalizeAuthError(cause, 'invalid_code').message);
      }
    },
    [email, verifyOtp],
  );

  const resend = useCallback(async () => {
    if (!email || resendInSeconds > 0 || resendOtp.isPending) return;
    setError(null);
    try {
      await resendOtp.mutateAsync({
        email,
        redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
      });
      setResendInSeconds(60);
    } catch (cause) {
      setError(normalizeAuthError(cause).message);
    }
  }, [destination, email, resendInSeconds, resendOtp]);

  if (!email) {
    return (
      <AdminAuthShell>
        <PortalAuthNotice tone="error" title="We need your email address.">
          Start again from{' '}
          <Link
            className="font-semibold underline underline-offset-4"
            href={`/auth/signin?callbackUrl=${encodeURIComponent(destination)}`}
          >
            sign in
          </Link>{' '}
          so we know where to send your code.
        </PortalAuthNotice>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell>
      <PortalLogin
        state={success ? 'success' : 'code'}
        email={email}
        onEmailChange={() => undefined}
        onSendCode={() => undefined}
        code={code}
        onCodeChange={(value) => {
          setCode(value);
          setError(null);
        }}
        onVerifyCode={verify}
        resendInSeconds={resendInSeconds}
        onResendCode={resend}
        error={error}
        isSubmitting={verifyOtp.isPending || resendOtp.isPending}
        onChangeMethod={() => {
          window.location.assign(
            `/auth/signin?callbackUrl=${encodeURIComponent(destination)}`,
          );
        }}
        onContinue={hardRedirect}
        destinationHref={destination}
      />
    </AdminAuthShell>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening your code">
            Loading your sign-in code.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
