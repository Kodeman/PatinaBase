'use client';

import { useState } from 'react';
import { useResetPassword } from '@patina/supabase';
import { PortalAuthNotice } from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';

export default function ForgotPasswordPage() {
  const resetPassword = useResetPassword();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await resetPassword.mutateAsync({ email: email.trim() });
    } catch {
      // Keep the same response for known and unknown addresses.
    }
    setSent(true);
  };

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
            href="/auth/signin"
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
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 text-base outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
            />
          </div>
          <button
            type="submit"
            disabled={!email.trim() || resetPassword.isPending}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {resetPassword.isPending
              ? 'Sending recovery link…'
              : 'Send recovery link'}
          </button>
          <a
            href="/auth/signin"
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Back to sign in
          </a>
        </form>
      )}
    </ClientAuthShell>
  );
}
