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

const EYEBROW =
  'font-mono text-[11px] uppercase tracking-[0.25em] text-[#65594E]';
const LABEL =
  'block text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]';
const SEAM =
  "relative after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-[38%] after:bg-[var(--portal-auth-accent)] after:transition-[width] after:duration-[320ms] after:ease-[cubic-bezier(0.25,1,0.5,1)] after:content-[''] focus-within:after:w-full motion-reduce:after:transition-none";
const INPUT =
  'h-12 w-full border border-[#8B7355] bg-white px-3 text-base text-[#2C2926] outline-none transition-colors placeholder:text-[#7A6A5B] focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const CTA =
  'h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const BACK_LINK =
  'inline-flex min-h-11 items-center text-sm font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none';
const GILDED_RULE =
  'h-px bg-[linear-gradient(90deg,rgba(196,162,101,0.8)_0%,rgba(139,115,85,0.3)_52%,rgba(139,115,85,0)_100%)]';

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
            className={BACK_LINK}
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
            <p className={EYEBROW}>
              Password recovery
            </p>
            <h2 className="mt-2 font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
              Choose a new password.
            </h2>
            <div aria-hidden="true" className={`mt-3.5 ${GILDED_RULE}`} />
            <p className="mt-3 text-sm leading-6 text-[#65594E]">
              Use at least eight characters. A longer, unique phrase is easiest to remember and safest to keep.
            </p>
          </div>

          {error && (
            <PortalAuthNotice tone="error" title="Let’s try that again.">
              {error}
            </PortalAuthNotice>
          )}

          <div className="space-y-2">
            <label className={LABEL} htmlFor="designer-new-password">
              New password
            </label>
            <div className={SEAM}>
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
                className={INPUT}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={LABEL} htmlFor="designer-confirm-password">
              Confirm new password
            </label>
            <div className={SEAM}>
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
                className={INPUT}
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!password || !confirmation || isLoading}
            className={CTA}
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
