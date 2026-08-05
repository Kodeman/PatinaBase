'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  createBrowserClient,
  normalizeAuthError,
  safeAuthReturnPath,
} from '@patina/supabase';
import {
  PortalAuthNotice,
  PortalAuthSuccess,
} from '@patina/design-system';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';

type SessionStatus = 'checking' | 'ready' | 'invalid';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const destination = safeAuthReturnPath(
    searchParams.get('callbackUrl'),
    DESIGNER_AUTH_DESTINATION,
  );
  const [supabase] = useState(() => createBrowserClient());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSessionStatus(sessionError || !data.session ? 'invalid' : 'ready');
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(
      () => window.location.replace(destination),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [destination, success]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Use at least eight characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      setError('Those passwords don’t match yet. Re-enter them and try again.');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error('No session after password reset');
      }
      setSuccess(true);
    } catch (cause) {
      setError(normalizeAuthError(cause, 'session').message);
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionStatus === 'checking') {
    return (
      <DesignerAuthShell>
        <PortalAuthNotice title="Checking your reset link">
          Confirming that this private link is still valid.
        </PortalAuthNotice>
      </DesignerAuthShell>
    );
  }

  if (sessionStatus === 'invalid') {
    return (
      <DesignerAuthShell>
        <div className="space-y-5">
          <PortalAuthNotice tone="error" title="That reset link has expired.">
            Request a new link and use the latest email from Patina.
          </PortalAuthNotice>
          <Link
            href={`/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[#6d726b] underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
          >
            Request a new reset link
          </Link>
        </div>
      </DesignerAuthShell>
    );
  }

  return (
    <DesignerAuthShell>
      {success ? (
        <PortalAuthSuccess
          title="Your password is updated."
          description="Your secure session is ready. We’re taking you back to your studio."
          destinationLabel="Continue to your studio"
          destinationHref={destination}
          onContinue={() => window.location.replace(destination)}
        />
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
              Password recovery
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
              Choose a new password.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#4f554f]">
              Use at least eight characters. A longer, unique phrase is easiest to remember and safest to keep.
            </p>
          </div>

          {error && (
            <PortalAuthNotice tone="error" title="Let’s try that again.">
              {error}
            </PortalAuthNotice>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="designer-new-password">
              New password
            </label>
            <input
              id="designer-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="designer-confirm-password">
              Confirm new password
            </label>
            <input
              id="designer-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError(null);
              }}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={!password || !confirmation || isLoading}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white hover:bg-[#343b34] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {isLoading ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      )}
    </DesignerAuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <DesignerAuthShell>
          <PortalAuthNotice title="Checking your reset link">
            Confirming that this private link is still valid.
          </PortalAuthNotice>
        </DesignerAuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
