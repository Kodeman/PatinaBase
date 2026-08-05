'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient, normalizeAuthError } from '@patina/supabase';
import { PortalAuthNotice } from '@patina/design-system';
import {
  adminAuthDestination,
  buildRecoveryCallbackUrl,
} from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: resetError } =
        await createBrowserClient().auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: buildRecoveryCallbackUrl(
              window.location.origin,
              destination,
            ),
          },
        );
      if (resetError) throw resetError;
      setSent(true);
    } catch (cause) {
      setError(normalizeAuthError(cause).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminAuthShell>
      {sent ? (
        <div className="space-y-5">
          <PortalAuthNotice tone="success" title="Check your inbox.">
            If that email belongs to a Patina account, a secure password-reset
            link is on its way.
          </PortalAuthNotice>
          <Link
            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            href={`/auth/signin?callbackUrl=${encodeURIComponent(destination)}`}
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
              Password recovery
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
              Reset your password.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#4f554f]">
              We’ll email a secure reset link to the address on your Patina
              account.
            </p>
          </div>
          {error && (
            <PortalAuthNotice
              id="forgot-password-error"
              tone="error"
              title="That did not send."
            >
              {error}
            </PortalAuthNotice>
          )}
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="forgot-password-email"
            >
              Email address
            </label>
            <input
              id="forgot-password-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'forgot-password-error' : undefined}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 text-base outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
              disabled={submitting}
              required
            />
          </div>
          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {submitting ? 'Sending reset link…' : 'Send reset link'}
          </button>
          <Link
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            href={`/auth/signin?callbackUrl=${encodeURIComponent(destination)}`}
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AdminAuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening password recovery">
            Getting the secure form ready.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
