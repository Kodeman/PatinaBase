'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import { PortalAuthNotice } from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';
import {
  buildRecoveryCallbackUrl,
  resolveAuthReturnPath,
} from '@/lib/auth-redirect';

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const destination = resolveAuthReturnPath(searchParams?.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: resetError } =
        await createBrowserClient().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: buildRecoveryCallbackUrl(
            window.location.origin,
            destination,
          ),
        });
      if (resetError) throw resetError;
      setSent(true);
    } catch (cause) {
      const failure = normalizeAuthError(cause);
      // Provider/account responses remain deliberately non-enumerating. A
      // local network failure is safe and useful to distinguish for retry.
      if (['network', 'rate_limit', 'service'].includes(failure.kind)) {
        setError(failure.message);
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const signInPath = `/auth/signin?callbackUrl=${encodeURIComponent(destination)}`;

  return (
    <ClientAuthShell
      title="Reset your password."
      description="We’ll send a secure recovery link if the address belongs to a Patina account."
    >
      {sent ? (
        <div className="space-y-5">
          <PortalAuthNotice tone="success" title="Check your inbox">
            If an account exists for that email, a password reset link is on its
            way.
          </PortalAuthNotice>
          <a
            href={signInPath}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Return to sign in
          </a>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
              Password recovery
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
              Where should we send it?
            </h2>
          </div>
          {error && (
            <PortalAuthNotice
              id="client-recovery-error"
              tone="error"
              title="We couldn’t send that link"
            >
              {error}
            </PortalAuthNotice>
          )}
          <div className="space-y-2">
            <label htmlFor="recovery-email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'client-recovery-error' : undefined}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 text-base outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {submitting ? 'Sending recovery link…' : 'Send recovery link'}
          </button>
          <a
            href={signInPath}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Back to sign in
          </a>
        </form>
      )}
    </ClientAuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <PortalAuthNotice title="Opening password recovery">
            Getting the secure form ready.
          </PortalAuthNotice>
        </ClientAuthShell>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
