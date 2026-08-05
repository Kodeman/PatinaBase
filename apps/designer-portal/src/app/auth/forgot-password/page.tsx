'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  createBrowserClient,
  normalizeAuthError,
  safeAuthReturnPath,
} from '@patina/supabase';
import { PortalAuthNotice } from '@patina/design-system';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const destination = safeAuthReturnPath(
    searchParams.get('callbackUrl'),
    DESIGNER_AUTH_DESTINATION,
  );
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);
    try {
      const resetPath = `/auth/reset-password?callbackUrl=${encodeURIComponent(destination)}`;
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('type', 'recovery');
      callback.searchParams.set('callbackUrl', resetPath);

      const { error: resetError } = await createBrowserClient().auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: callback.toString() },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (cause) {
      setError(normalizeAuthError(cause, 'unknown').message);
    } finally {
      setIsLoading(false);
    }
  };

  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(destination)}`;

  return (
    <DesignerAuthShell>
      <div className="space-y-5">
        {sent ? (
          <PortalAuthNotice tone="success" title="Check your inbox.">
            If an account belongs to that address, its password reset link is on the way. You can close this page safely.
          </PortalAuthNotice>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
                Password recovery
              </p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
                Reset your password.
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#4f554f]">
                We’ll email a private reset link to the address on your Patina account.
              </p>
            </div>

            {error && (
              <PortalAuthNotice tone="error" title="We couldn’t send that link.">
                {error}
              </PortalAuthNotice>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="designer-recovery-email">
                Email address
              </label>
              <input
                id="designer-recovery-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error) || undefined}
                className="h-12 w-full border border-[#6d726b] bg-white px-3 text-base outline-none placeholder:text-[#5b605a] focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
                placeholder="you@studio.com"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={!email.trim() || isLoading}
              className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white hover:bg-[#343b34] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
            >
              {isLoading ? 'Sending reset link…' : 'Email me a reset link'}
            </button>
          </form>
        )}

        <Link
          href={signInHref}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[#6d726b] underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
        >
          Back to sign in
        </Link>
      </div>
    </DesignerAuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <DesignerAuthShell>
          <PortalAuthNotice title="Opening password recovery">
            Getting your secure reset form ready.
          </PortalAuthNotice>
        </DesignerAuthShell>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
