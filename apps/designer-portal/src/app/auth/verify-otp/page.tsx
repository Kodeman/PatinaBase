'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSendMagicLink, useVerifyOtp } from '@patina/supabase';
import Link from 'next/link';
import { StrataMark } from '@/components/portal/strata-mark';
import { Button } from '@/components/ui/controls';
import { authEvents } from '@/lib/analytics/events';

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const verifyOtp = useVerifyOtp();
  const resendMagicLink = useSendMagicLink();

  const [token, setToken] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!email) {
    return (
      <div className="min-h-screen px-6 py-20 md:py-32">
        <div className="mx-auto max-w-md">
          <h1 className="type-section-head mb-2">Missing email</h1>
          <p className="type-meta mb-10">
            We need to know which email to verify. Please start over from sign in.
          </p>
          <Link
            href="/auth/signin"
            className="type-body-small text-patina-clay hover:text-patina-aged-oak transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6) return;
    setFormError(null);
    setResendSuccess(false);

    try {
      await verifyOtp.mutateAsync({ email, token, type: 'email' });
      authEvents.login('magic-link');
      router.replace('/desk');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid code. Please try again.';
      setFormError(message);
      setToken('');
      inputRef.current?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendMagicLink.isPending) return;
    setFormError(null);
    setResendSuccess(false);

    try {
      await resendMagicLink.mutateAsync({ email });
      setResendSuccess(true);
      setResendCooldown(60);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not resend code. Please try again.';
      setFormError(message);
    }
  };

  return (
    <div className="min-h-screen px-6 py-20 md:py-32">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <h1 className="type-section-head mb-2 animate-text-reveal">
          Enter your sign-in code
        </h1>
        <p className="type-meta mb-10 animate-section-enter">
          We sent a 6-digit code to <strong className="text-patina-charcoal">{email}</strong>
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="otp-code" className="sr-only">
            6-digit sign-in code
          </label>
          <input
            id="otp-code"
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? 'otp-error' : undefined}
            disabled={verifyOtp.isPending}
            className="w-full text-center font-mono text-2xl tracking-[0.5em] py-4 px-4 border border-patina-pearl rounded-[3px] text-patina-charcoal bg-transparent focus:outline-none focus:border-patina-clay transition-colors disabled:opacity-50"
            required
          />

          {formError && (
            <div
              id="otp-error"
              role="alert"
              className="type-body-small mt-4 text-destructive"
            >
              {formError}
            </div>
          )}

          {resendSuccess && (
            <div role="status" className="type-body-small mt-4 text-patina-clay">
              A new code was sent to your inbox.
            </div>
          )}

          <Button
            type="submit"
            className="mt-6 w-full"
            disabled={token.length !== 6}
            loading={verifyOtp.isPending}
          >
            {verifyOtp.isPending ? 'Verifying...' : 'Verify'}
          </Button>
        </form>

        {/* Resend */}
        <div className="mt-8 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResend}
            disabled={resendCooldown > 0 || resendMagicLink.isPending}
            aria-label={
              resendCooldown > 0
                ? `Resend code available in ${resendCooldown} seconds`
                : 'Resend code'
            }
          >
            {resendMagicLink.isPending
              ? 'Sending new code...'
              : resendCooldown > 0
                ? `Didn't get the code? Resend in ${resendCooldown}s`
                : 'Resend code'}
          </Button>
        </div>

        {/* Footer Links */}
        <div className="mt-10 space-y-4">
          <StrataMark variant="micro" />
          <p className="type-body-small text-center">
            <Link
              href="/auth/signin"
              className="text-patina-clay hover:text-patina-aged-oak transition-colors"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function VerifyOtpLoadingFallback() {
  return (
    <div className="min-h-screen px-6 py-20 md:py-32">
      <div className="mx-auto max-w-md">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-patina-pearl rounded mb-2" />
          <div className="h-4 w-64 bg-patina-pearl/60 rounded mb-10" />
          <div className="h-14 w-full bg-patina-pearl/30 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<VerifyOtpLoadingFallback />}>
      <VerifyOtpContent />
    </Suspense>
  );
}
