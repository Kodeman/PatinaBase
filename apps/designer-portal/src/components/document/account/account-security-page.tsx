'use client';

/**
 * Account · Security — two-factor authentication (TOTP). The same Supabase MFA
 * hooks as the old /portal/settings/security page; charcoal re-skin of the
 * enroll → scan → verify wizard. The QR is a Supabase-returned SVG data URI.
 */

import { useState } from 'react';
import {
  useMfaFactors,
  useEnrollMfa,
  useVerifyMfaEnrollment,
  useUnenrollMfa,
  type MfaFactor,
} from '@patina/supabase';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { StrataMark } from '../strata-mark';

interface EnrollState {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export function AccountSecurityPage() {
  const { factors, isLoading } = useMfaFactors();
  const enrollMfa = useEnrollMfa();
  const verifyEnrollment = useVerifyMfaEnrollment();
  const unenrollMfa = useUnenrollMfa();

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
      setError(
        err instanceof Error ? err.message : 'Failed to start enrollment.',
      );
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
        err instanceof Error ? err.message : 'Invalid code. Please try again.',
      );
      setCode('');
    }
  };

  const handleCancelEnroll = async () => {
    if (enroll) {
      try {
        await unenrollMfa.mutateAsync({ factorId: enroll.factorId });
      } catch {
        /* best-effort cleanup of the dangling enrollment */
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

  if (isLoading) {
    return (
      <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
        Reading your factors…
      </p>
    );
  }

  return (
    <div className="pt-1">
      <p className="mb-5 text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
        Add a one-time code from an authenticator app (1Password, Google
        Authenticator, Authy) on top of your password.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-4 border-l-2 border-[var(--color-terracotta)] pl-3 text-[12px] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
      {activated && (
        <p
          role="status"
          className="mb-4 border-l-2 border-[var(--color-sage)] pl-3 text-[12px] text-[var(--color-sage)]"
        >
          Two-factor authentication is now enabled.
        </p>
      )}

      {/* Enrolled factors */}
      <h3 className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        Status
      </h3>
      {hasMfa ? (
        <ul className="mb-5">
          {verifiedFactors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between border-b border-[var(--color-pearl)] py-3"
            >
              <span>
                <span className="block text-[13px] text-[var(--color-charcoal)]">
                  {factor.friendlyName || 'Authenticator app'}
                </span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                  Enabled
                  {factor.createdAt
                    ? ` · added ${new Date(factor.createdAt).toLocaleDateString()}`
                    : ''}
                </span>
              </span>
              <DocumentAction
                actionKey="remove-authenticator"
                surfaceKey="account"
                regionKey="mfa-factor"
                variant="tertiary"
                onClick={() => handleUnenroll(factor)}
                disabled={unenrollMfa.isPending}
                className="text-[var(--color-terracotta-ink)]"
              >
                Remove
              </DocumentAction>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-[12px] text-[var(--color-aged-oak)]">
          Two-factor authentication is not enabled.
        </p>
      )}

      <div className="my-5">
        <StrataMark size="sm" />
      </div>

      {/* Enrollment wizard */}
      {!enroll ? (
        <DocumentAction
          actionKey="enable-two-factor"
          surfaceKey="account"
          regionKey="mfa-enrollment"
          variant="primary"
          onClick={handleStartEnroll}
          disabled={enrollMfa.isPending}
          loading={enrollMfa.isPending}
          loadingLabel="Starting…"
        >
          {hasMfa
            ? 'Add another authenticator'
            : 'Enable two-factor authentication'}
        </DocumentAction>
      ) : (
        <div className="max-w-md">
          <h3 className="mb-2 font-heading text-[15px] text-[var(--color-charcoal)]">
            Scan the QR code
          </h3>
          <p className="mb-4 text-[12px] text-[var(--color-aged-oak)]">
            Scan this with your authenticator app, then enter the 6-digit code
            it shows.
          </p>

          {enroll.qrCode && (
            // Supabase returns the TOTP QR as an SVG data URI.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enroll.qrCode}
              alt="Two-factor authentication QR code"
              className="mb-4 h-44 w-44 rounded-[6px] bg-white p-2"
            />
          )}

          <div className="mb-4">
            <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              Or enter this secret manually
            </span>
            <code className="mt-1 block break-all font-mono text-[12px] text-[var(--color-charcoal)]">
              {enroll.secret}
            </code>
          </div>

          <label
            htmlFor="account-mfa-code"
            className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
          >
            Verification code
          </label>
          <input
            id="account-mfa-code"
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
            className="mb-4 w-40 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 font-mono text-[18px] tracking-[0.4em] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]"
          />

          <DocumentActionGroup
            surfaceKey="account"
            regionKey="mfa-verification"
          >
            <DocumentAction
              actionKey="verify-two-factor"
              variant="primary"
              onClick={handleVerify}
              disabled={code.length !== 6 || verifyEnrollment.isPending}
              loading={verifyEnrollment.isPending}
              loadingLabel="Verifying…"
            >
              Verify &amp; enable
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-two-factor"
              variant="tertiary"
              onClick={handleCancelEnroll}
              disabled={verifyEnrollment.isPending}
            >
              Cancel
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </div>
  );
}
