'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createBrowserClient,
  useSendEmailOtp,
  useVerifyOtp,
} from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalLogin,
} from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';
import {
  buildAuthCallbackUrl,
  buildSignInPath,
  confirmBrowserSession,
  replaceAuthDestination,
  resolveAuthReturnPath,
} from '@/lib/auth-redirect';
import { authEvents } from '@/lib/analytics/events';

function VerifyOtpContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const destination = resolveAuthReturnPath(searchParams.get('callbackUrl'));
  const signInPath = buildSignInPath(destination);
  const [supabase] = useState(() => createBrowserClient());
  const verifyOtp = useVerifyOtp();
  const sendEmailOtp = useSendEmailOtp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendInSeconds, setResendInSeconds] = useState(60);
  const [success, setSuccess] = useState(false);
  const redirectingRef = useRef(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResendInSeconds((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendInSeconds]);

  useEffect(() => {
    if (!success || redirectingRef.current) return;
    redirectingRef.current = true;
    const timer = window.setTimeout(
      () => replaceAuthDestination(destination),
      450,
    );
    return () => {
      window.clearTimeout(timer);
      redirectingRef.current = false;
    };
  }, [destination, success]);

  if (!email) {
    return (
      <ClientAuthShell>
        <div className="space-y-5">
          <PortalAuthNotice tone="error" title="We need your email">
            Start again so we know which account should receive the code.
          </PortalAuthNotice>
          <a
            href={signInPath}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Return to sign in
          </a>
        </div>
      </ClientAuthShell>
    );
  }

  const handleVerify = async (nextCode: string) => {
    if (nextCode.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setError(null);
    try {
      await verifyOtp.mutateAsync({ email, token: nextCode, type: 'email' });
      await confirmBrowserSession(supabase);
      authEvents.login('magic-link');
      setSuccess(true);
    } catch (verifyError) {
      setCode('');
      setError(normalizeAuthError(verifyError, 'invalid_code').message);
      verifyingRef.current = false;
    }
  };

  const handleResend = async () => {
    if (resendInSeconds > 0 || sendEmailOtp.isPending) return;
    setError(null);
    try {
      await sendEmailOtp.mutateAsync({
        email,
        redirectTo: buildAuthCallbackUrl(window.location.origin, destination),
      });
      setResendInSeconds(60);
    } catch (sendError) {
      setError(normalizeAuthError(sendError).message);
    }
  };

  return (
    <ClientAuthShell>
      <PortalLogin
        state={success ? 'success' : 'code'}
        email={email}
        onEmailChange={() => undefined}
        onSendCode={() => undefined}
        code={code}
        onCodeChange={setCode}
        onVerifyCode={(value) => void handleVerify(value)}
        resendInSeconds={resendInSeconds}
        onResendCode={() => void handleResend()}
        onChangeMethod={() => window.location.assign(signInPath)}
        error={error}
        destinationHref={destination}
        onContinue={() => {
          if (redirectingRef.current) return;
          redirectingRef.current = true;
          replaceAuthDestination(destination);
        }}
        isSubmitting={verifyingRef.current || sendEmailOtp.isPending}
      />
    </ClientAuthShell>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <p role="status">Preparing verification…</p>
        </ClientAuthShell>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
