'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient, normalizeAuthError } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { adminAuthDestination, hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const [sessionState, setSessionState] = useState<
    'checking' | 'ready' | 'missing'
  >('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    let active = true;
    void createBrowserClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        setSessionState(!sessionError && data.session ? 'ready' : 'missing');
      })
      .catch(() => {
        if (active) setSessionState('missing');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(hardRedirect, 500);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, success]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed.current) return;
    if (password.length < 12) {
      setError('Use at least 12 characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      setError('Those passwords do not match. Enter the same password twice.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      const current = await supabase.auth.getSession();
      if (!current.data.session)
        throw new Error('No session after password reset');
      completed.current = true;
      setSuccess(true);
    } catch (cause) {
      setError(normalizeAuthError(cause, 'session').message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionState === 'checking') {
    return (
      <AdminAuthShell>
        <PortalAuthNotice title="Checking your reset link">
          Confirming the secure recovery session.
        </PortalAuthNotice>
      </AdminAuthShell>
    );
  }

  if (sessionState === 'missing') {
    return (
      <AdminAuthShell>
        <PortalAuthNotice
          tone="error"
          title="That reset link is no longer ready."
        >
          Request a{' '}
          <Link
            className="font-semibold underline underline-offset-4"
            href={`/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`}
          >
            new password-reset link
          </Link>
          .
        </PortalAuthNotice>
      </AdminAuthShell>
    );
  }

  if (success) {
    return (
      <AdminAuthShell>
        <PortalAuthSuccess
          title="Your password is updated."
          description="Your secure session is ready. We’re taking you back to Patina Operations."
          destinationLabel="Continue to Patina Operations"
          destinationHref={destination}
          onContinue={hardRedirect}
        />
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell>
      <form className="space-y-5" onSubmit={submit}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#65594E]">
            Password recovery
          </p>
          <h2 className="mt-2 font-heading text-3xl tracking-[-0.03em]">
            Choose a new password.
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#65594E]">
            Use at least 12 characters. A longer, memorable phrase works well.
          </p>
        </div>
        {error && (
          <PortalAuthNotice
            id="reset-password-error"
            tone="error"
            title="Check your password."
          >
            {error}
          </PortalAuthNotice>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'reset-password-error' : undefined}
            className="h-12 w-full border border-[#8B7355] bg-white px-3 outline-none focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C]"
            disabled={submitting}
            minLength={12}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'reset-password-error' : undefined}
            className="h-12 w-full border border-[#8B7355] bg-white px-3 outline-none focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C]"
            disabled={submitting}
            minLength={12}
            required
          />
        </div>
        <button
          type="submit"
          disabled={!password || !confirmation || submitting}
          className="h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#2C2926] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2"
        >
          {submitting ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </AdminAuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening password recovery">
            Confirming your secure reset link.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
