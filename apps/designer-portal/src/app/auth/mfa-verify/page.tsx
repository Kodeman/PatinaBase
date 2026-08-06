'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useMfaFactors,
  useChallengeMfa,
} from '@patina/supabase';
import { Smartphone } from 'lucide-react';
import { safeInternalPath } from '@/lib/safe-internal-path';
import { createBrowserClient, normalizeAuthError } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { DesignerAuthShell } from '../auth-shell';

/**
 * Warm paper vocabulary, shared with the rest of the auth family: white field
 * on aged-oak `#8B7355`, mocha `#5C4A3C` focus, small-caps label, and the
 * portal's own accent seam on the field's bottom edge — 38% at rest, the full
 * measure while you are working in it. The seam is decorative only; focus is
 * still mocha, so the two markers never share a pixel.
 */
const SEAM =
  "relative after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-[38%] after:bg-[var(--portal-auth-accent)] after:transition-[width] after:duration-[320ms] after:ease-[cubic-bezier(0.25,1,0.5,1)] after:content-[''] focus-within:after:w-full motion-reduce:after:transition-none";
const LABEL =
  'block text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]';
const INPUT =
  'h-12 w-full border bg-white px-3 text-base text-[#2C2926] outline-none transition-colors placeholder:text-[#7A6A5B] focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const CTA =
  'h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const CTA_OUTLINE =
  'flex h-12 w-full items-center justify-center border border-[#8B7355] px-4 text-sm font-semibold text-[#2C2926] transition-colors hover:border-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none';
const QUIET_LINK =
  'inline-flex min-h-11 items-center text-sm text-[#65594E] underline decoration-[#8B7355] underline-offset-4 transition-colors hover:text-[#2C2926] hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none';
const GILDED_RULE =
  'h-px bg-[linear-gradient(90deg,rgba(196,162,101,0.8)_0%,rgba(139,115,85,0.3)_52%,rgba(139,115,85,0)_100%)]';

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Same guard the middleware ran when it minted this callbackUrl
  // (@/lib/safe-internal-path): off-origin, protocol-relative, and
  // backslash-smuggled targets all land on /desk instead.
  const callbackUrl = safeInternalPath(searchParams.get('callbackUrl'));

  const { factors, isLoading } = useMfaFactors();
  const challengeMfa = useChallengeMfa();

  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');

  // Auto-select if there's only one factor
  useEffect(() => {
    if (verifiedFactors.length === 1 && !selectedFactorId) {
      setSelectedFactorId(verifiedFactors[0].id);
    }
  }, [verifiedFactors, selectedFactorId]);

  // Focus code input when factor is selected
  useEffect(() => {
    if (selectedFactorId && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [selectedFactorId]);

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  };

  const handleVerify = async () => {
    if (!selectedFactorId || code.length !== 6) return;
    setError(null);

    try {
      await challengeMfa.mutateAsync({
        factorId: selectedFactorId,
        code,
      });
      const { data } = await createBrowserClient().auth.getSession();
      if (!data.session) throw new Error('No session after verification');
      setSuccess(true);
    } catch (err) {
      setError(normalizeAuthError(err, 'invalid_code').message);
      setCode('');
      codeInputRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => window.location.replace(callbackUrl), 350);
    return () => window.clearTimeout(timer);
  }, [callbackUrl, success]);

  if (isLoading) {
    return (
      <DesignerAuthShell>
        <p className="text-sm text-[#65594E]">Loading...</p>
      </DesignerAuthShell>
    );
  }

  if (verifiedFactors.length === 0) {
    return (
      <DesignerAuthShell>
        <div className="space-y-5">
          <PortalAuthNotice tone="error">
            No two-factor authentication methods found. Please contact support.
          </PortalAuthNotice>
          <button
            type="button"
            className={CTA_OUTLINE}
            onClick={() => router.push('/auth/signin')}
          >
            Back to Sign In
          </button>
        </div>
      </DesignerAuthShell>
    );
  }

  return (
    <DesignerAuthShell>
      <div className="space-y-5">
        {success ? <PortalAuthSuccess destinationHref={callbackUrl} onContinue={() => window.location.replace(callbackUrl)} /> : <>
        <div>
          <h2 className="font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
            Two-Factor Verification
          </h2>
          <div aria-hidden="true" className={`mt-3.5 ${GILDED_RULE}`} />
          <p className="mt-3 text-sm leading-6 text-[#65594E]">
            Enter the verification code from your authenticator app to continue.
          </p>
        </div>

        {error && <PortalAuthNotice id="designer-mfa-error" tone="error">{error}</PortalAuthNotice>}

        {/* Factor selection (only shown when multiple factors exist) */}
        {verifiedFactors.length > 1 && (
          <fieldset className="space-y-2">
            <legend className={LABEL}>
              Select authenticator
            </legend>
            <div className="space-y-2">
              {verifiedFactors.map((factor) => (
                <button
                  key={factor.id}
                  type="button"
                  aria-pressed={selectedFactorId === factor.id}
                  onClick={() => {
                    setSelectedFactorId(factor.id);
                    setCode('');
                    setError(null);
                  }}
                  className={`flex w-full items-center gap-3 border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none ${
                    selectedFactorId === factor.id
                      ? 'border-[#5C4A3C] bg-[#EFE9DD]'
                      : 'border-[#8B7355] bg-white hover:border-[#2C2926]'
                  }`}
                >
                  <Smartphone aria-hidden="true" className="h-5 w-5 text-[#65594E]" />
                  <span className="text-sm font-semibold text-[#2C2926]">
                    {factor.friendlyName || 'Authenticator App'}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Code input */}
        {selectedFactorId && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="designer-mfa-code" className={LABEL}>
                Verification Code
              </label>
              <div className={SEAM}>
                <input
                  id="designer-mfa-code"
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6) {
                      handleVerify();
                    }
                  }}
                  className={`${INPUT} font-mono text-lg tracking-[0.5em] ${error ? 'border-[#9C3D31]' : 'border-[#8B7355]'}`}
                  placeholder="000000"
                  maxLength={6}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'designer-mfa-error' : undefined}
                />
              </div>
            </div>

            <button
              type="button"
              className={CTA}
              onClick={handleVerify}
              disabled={code.length !== 6 || challengeMfa.isPending}
            >
              {challengeMfa.isPending ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        )}

        <div>
          <button
            type="button"
            className={QUIET_LINK}
            onClick={() => router.push('/auth/signin')}
          >
            Cancel and sign in with a different account
          </button>
        </div>
        </>}
      </div>
    </DesignerAuthShell>
  );
}

export default function MfaVerifyPage() {
  return (
    <Suspense
      fallback={
        <DesignerAuthShell>
          <p className="text-sm text-[#65594E]">Loading...</p>
        </DesignerAuthShell>
      }
    >
      <MfaVerifyContent />
    </Suspense>
  );
}
