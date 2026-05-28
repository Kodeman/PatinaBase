'use client';

// SET-06 — Two-factor authentication (TOTP) management.
// Uses the Supabase MFA hooks from @patina/supabase:
//   useMfaFactors        — list enrolled factors + status
//   useEnrollMfa         — start enrollment (returns QR code + secret + recovery URI)
//   useVerifyMfaEnrollment — challenge + verify the 6-digit code to activate
//   useUnenrollMfa       — remove a factor
// Mirrors the verification pattern in app/auth/mfa-verify/page.tsx.

import { useState } from 'react';
import Link from 'next/link';
import {
  useMfaFactors,
  useEnrollMfa,
  useVerifyMfaEnrollment,
  useUnenrollMfa,
  type MfaFactor,
} from '@patina/supabase';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { StrataMark } from '@/components/portal/strata-mark';

interface EnrollState {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export default function SecurityPage() {
  const { factors, isLoading } = useMfaFactors();
  const enrollMfa = useEnrollMfa();
  const verifyEnrollment = useVerifyMfaEnrollment();
  const unenrollMfa = useUnenrollMfa();

  // Enrollment wizard state
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const hasMfa = verifiedFactors.length > 0;

  const handleStartEnroll = async () => {
    setError(null);
    setActivated(false);
    setCode('');
    try {
      const result = await enrollMfa.mutateAsync({
        friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
      });
      setEnroll(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start enrollment.');
    }
  };

  const handleVerify = async () => {
    if (!enroll || code.length !== 6) return;
    setError(null);
    try {
      await verifyEnrollment.mutateAsync({ factorId: enroll.factorId, code });
      setActivated(true);
      setEnroll(null);
      setCode('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid code. Please try again.'
      );
      setCode('');
    }
  };

  const handleCancelEnroll = async () => {
    // Unenroll the unverified factor so we don't leave a dangling enrollment.
    if (enroll) {
      try {
        await unenrollMfa.mutateAsync({ factorId: enroll.factorId });
      } catch {
        /* best-effort cleanup */
      }
    }
    setEnroll(null);
    setCode('');
    setError(null);
  };

  const handleUnenroll = async (factor: MfaFactor) => {
    setError(null);
    try {
      await unenrollMfa.mutateAsync({ factorId: factor.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove factor.');
    }
  };

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[{ label: 'Settings', href: '/portal/settings' }, { label: 'Security' }]}
      />

      <h1 className="type-section-head mb-2" style={{ fontSize: '1.5rem' }}>
        Two-factor authentication
      </h1>
      <p className="type-body mb-6 text-[0.85rem] text-[var(--text-muted)]">
        Add an extra layer of security with a time-based one-time code from an
        authenticator app (Google Authenticator, 1Password, Authy, etc.).
      </p>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {activated && (
        <div
          role="status"
          className="mb-5 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          Two-factor authentication is now enabled.
        </div>
      )}

      {/* ── Enrolled factors ─────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="type-meta mb-3">Status</h2>
        {hasMfa ? (
          <div className="flex flex-col gap-2">
            {verifiedFactors.map((factor) => (
              <div
                key={factor.id}
                className="flex items-center justify-between rounded-md border p-3"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <div>
                  <div className="type-label">
                    {factor.friendlyName || 'Authenticator app'}
                  </div>
                  <div className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
                    Enabled
                    {factor.createdAt
                      ? ` · added ${new Date(factor.createdAt).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
                <PortalButton
                  variant="ghost"
                  type="button"
                  onClick={() => handleUnenroll(factor)}
                  disabled={unenrollMfa.isPending}
                >
                  Remove
                </PortalButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="type-body text-[0.85rem] text-[var(--text-muted)]">
            Two-factor authentication is not enabled.
          </p>
        )}
      </section>

      <StrataMark variant="mini" />

      {/* ── Enrollment flow ──────────────────────────────────────────────── */}
      <section className="mt-6">
        {!enroll ? (
          <PortalButton
            variant="primary"
            type="button"
            onClick={handleStartEnroll}
            disabled={enrollMfa.isPending}
          >
            {enrollMfa.isPending
              ? 'Starting...'
              : hasMfa
                ? 'Add another authenticator'
                : 'Enable two-factor authentication'}
          </PortalButton>
        ) : (
          <div className="max-w-md">
            <h2 className="type-meta mb-3">Scan the QR code</h2>
            <p className="type-body mb-4 text-[0.82rem] text-[var(--text-muted)]">
              Scan this with your authenticator app, then enter the 6-digit code
              it shows to finish.
            </p>

            {enroll.qrCode && (
              // Supabase returns the TOTP QR as an SVG data URI.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={enroll.qrCode}
                alt="Two-factor authentication QR code"
                className="mb-4 h-44 w-44 rounded-md border bg-white p-2"
                style={{ borderColor: 'var(--border-default)' }}
              />
            )}

            <div className="mb-4">
              <div className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
                Or enter this secret manually
              </div>
              <code className="type-body mt-1 block break-all text-[0.8rem]">
                {enroll.secret}
              </code>
            </div>

            <label
              htmlFor="mfa-code"
              className="type-meta-small mb-1 block uppercase tracking-wider"
            >
              Verification code
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 6) handleVerify();
              }}
              placeholder="000000"
              maxLength={6}
              className="type-body mb-4 w-40 border-0 border-b border-[var(--border-default)] bg-transparent py-2 font-mono text-lg tracking-[0.4em] outline-none focus:border-[var(--accent-primary)]"
            />

            <div className="flex gap-3">
              <PortalButton
                variant="primary"
                type="button"
                onClick={handleVerify}
                disabled={code.length !== 6 || verifyEnrollment.isPending}
              >
                {verifyEnrollment.isPending ? 'Verifying...' : 'Verify & enable'}
              </PortalButton>
              <PortalButton
                variant="ghost"
                type="button"
                onClick={handleCancelEnroll}
                disabled={verifyEnrollment.isPending}
              >
                Cancel
              </PortalButton>
            </div>
          </div>
        )}
      </section>

      <div className="mt-10">
        <Link
          href="/portal/settings"
          className="type-btn-text text-[var(--accent-primary)] no-underline"
        >
          ← Back to settings
        </Link>
      </div>
    </div>
  );
}
