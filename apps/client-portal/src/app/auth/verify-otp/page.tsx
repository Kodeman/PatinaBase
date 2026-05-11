'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSendMagicLink, useVerifyOtp } from '@patina/supabase';
import { Alert, Button, Input } from '@patina/design-system';
import Link from 'next/link';

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
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-lg bg-card p-8 shadow-lg border">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground">Missing email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We need to know which email to verify. Please start over from sign in.
              </p>
            </div>
            <Link
              href="/auth/signin"
              className="block w-full text-center text-sm text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </div>
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
      router.replace('/');
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              Enter your sign-in code
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a 6-digit code to <strong className="text-foreground">{email}</strong>
            </p>
          </div>

          {formError && (
            <div id="otp-error" className="mb-4" role="alert">
              <Alert variant="error" title="Verification failed" description={formError} />
            </div>
          )}

          {resendSuccess && (
            <div className="mb-4" role="status">
              <Alert
                variant="success"
                title="Code sent"
                description="A new code was sent to your inbox."
              />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="otp-code" className="sr-only">
              6-digit sign-in code
            </label>
            <Input
              id="otp-code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={token}
              onChange={(e) =>
                setToken(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'otp-error' : undefined}
              disabled={verifyOtp.isPending}
              state={formError ? 'error' : 'default'}
              size="lg"
              className="text-center font-mono text-lg tracking-[0.5em]"
              required
            />

            <Button
              type="submit"
              size="lg"
              disabled={token.length !== 6 || verifyOtp.isPending}
              className="mt-6 w-full"
            >
              {verifyOtp.isPending ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </form>

          {/* Resend */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resendMagicLink.isPending}
              className="text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
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
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <Link
              href="/auth/signin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifyOtpLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Verify code</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
          </div>
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
