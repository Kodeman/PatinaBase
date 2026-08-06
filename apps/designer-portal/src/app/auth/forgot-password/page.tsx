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
              <p className={EYEBROW}>
                Password recovery
              </p>
              <h2 className="mt-2 font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
                Reset your password.
              </h2>
              <div aria-hidden="true" className={`mt-3.5 ${GILDED_RULE}`} />
              <p className="mt-3 text-sm leading-6 text-[#65594E]">
                We’ll email a private reset link to the address on your Patina account.
              </p>
            </div>

            {error && (
              <PortalAuthNotice tone="error" title="We couldn’t send that link.">
                {error}
              </PortalAuthNotice>
            )}

            <div className="space-y-2">
              <label className={LABEL} htmlFor="designer-recovery-email">
                Email address
              </label>
              <div className={SEAM}>
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
                  className={INPUT}
                  placeholder="you@studio.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!email.trim() || isLoading}
              className={CTA}
            >
              {isLoading ? 'Sending reset link…' : 'Email me a reset link'}
            </button>
          </form>
        )}

        <Link href={signInHref} className={BACK_LINK}>
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
