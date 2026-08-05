'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  createBrowserClient,
  normalizeAuthError,
  useChallengeMfa,
  useEnrollMfa,
  useVerifyMfaEnrollment,
} from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { adminAuthDestination, hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

interface VerifiedFactor {
  id: string;
  friendlyName: string;
}

type FactorMode = 'checking' | 'challenge' | 'enroll' | 'unavailable';

function MfaEnrollContent() {
  const searchParams = useSearchParams();
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const [supabase] = useState(() => createBrowserClient());
  const enroll = useEnrollMfa();
  const verifyEnrollment = useVerifyMfaEnrollment();
  const challengeExisting = useChallengeMfa();
  const [factorMode, setFactorMode] = useState<FactorMode>('checking');
  const [verifiedFactors, setVerifiedFactors] = useState<VerifiedFactor[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enrollmentAttempt, setEnrollmentAttempt] = useState(0);
  const [success, setSuccess] = useState(false);
  const factorsRun = useRef<ReturnType<typeof supabase.auth.mfa.listFactors> | null>(null);
  const enrollmentStarted = useRef(false);
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
    // listFactors is reused across Strict Mode replay. Starting enrollment
    // before this result would let an AAL1 session bypass an existing factor.
    factorsRun.current ??= supabase.auth.mfa.listFactors();
    void factorsRun.current
      .then(({ data, error: listError }) => {
        if (!active) return;
        if (listError) throw listError;
        const factors = data.totp
          .filter((factor) => factor.status === 'verified')
          .map((factor) => ({
            id: factor.id,
            friendlyName: factor.friendly_name || 'Authenticator app',
          }));
        if (factors.length > 0) {
          setVerifiedFactors(factors);
          setFactorId(factors[0].id);
          setFactorMode('challenge');
        } else {
          setFactorMode('enroll');
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError(normalizeAuthError(cause, 'session').message);
        setFactorMode('unavailable');
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (factorMode !== 'enroll' || enrollmentStarted.current) return;
    enrollmentStarted.current = true;
    enroll.mutate(
      { friendlyName: 'Admin Portal Authenticator' },
      {
        onSuccess: (data) => {
          setFactorId(data.factorId);
          setQrCode(data.qrCode);
          setSecret(data.secret);
          setError(null);
        },
        onError: (cause) => {
          setError(normalizeAuthError(cause).message);
        },
      },
    );
  }, [enroll, enrollmentAttempt, factorMode]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(hardRedirect, 500);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, success]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || code.length !== 6 || completed.current) return;
    setError(null);
    try {
      if (factorMode === 'challenge') {
        await challengeExisting.mutateAsync({ factorId, code });
      } else if (factorMode === 'enroll') {
        await verifyEnrollment.mutateAsync({ factorId, code });
      } else {
        return;
      }
    } catch (cause) {
      setCode('');
      setError(normalizeAuthError(cause, 'invalid_code').message);
      return;
    }

    try {
      const [{ data: session }, { data: assurance }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!session.session || assurance?.currentLevel !== 'aal2') {
        throw new Error('MFA session was not confirmed');
      }
      completed.current = true;
      setSuccess(true);
    } catch (cause) {
      setError(normalizeAuthError(cause, 'session').message);
    }
  };

  if (success) {
    return (
      <AdminAuthShell>
        <PortalAuthSuccess
          title="Authenticator confirmed."
          description="This session now has the additional verification Patina Operations requires."
          destinationLabel="Continue to Patina Operations"
          destinationHref={destination}
          onContinue={hardRedirect}
        />
      </AdminAuthShell>
    );
  }

  if (factorMode === 'checking') {
    return (
      <AdminAuthShell>
        <PortalAuthNotice title="Checking account security">
          Looking for an authenticator already trusted by this account.
        </PortalAuthNotice>
      </AdminAuthShell>
    );
  }

  if (factorMode === 'unavailable') {
    return (
      <AdminAuthShell>
        <div className="space-y-5">
          <PortalAuthNotice tone="error" title="We couldn’t check your account security">
            {error ?? 'Sign out and try again. Contact Patina if the problem continues.'}
          </PortalAuthNotice>
          <Link
            href="/auth/signout"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Sign out and try again
          </Link>
        </div>
      </AdminAuthShell>
    );
  }

  const isChallenge = factorMode === 'challenge';
  const verifying = challengeExisting.isPending || verifyEnrollment.isPending;

  return (
    <AdminAuthShell>
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
            Account security
          </p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
            {isChallenge ? 'Confirm it’s you.' : 'Add an authenticator.'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#4f554f]">
            {isChallenge
              ? 'Enter the six-digit code from an authenticator already trusted by this account.'
              : 'Patina Operations requires a second check. Scan this code with your authenticator app, then enter its six-digit code.'}
          </p>
        </div>

        {error && (
          <PortalAuthNotice
            id="mfa-error"
            tone="error"
            title={
              !isChallenge && !factorId
                ? 'We couldn’t prepare an authenticator.'
                : 'That code needs another try.'
            }
          >
            {error}
          </PortalAuthNotice>
        )}

        {!isChallenge && !factorId && error && !enroll.isPending && (
          <button
            type="button"
            onClick={() => {
              enrollmentStarted.current = false;
              setError(null);
              setEnrollmentAttempt((attempt) => attempt + 1);
            }}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Try preparing it again
          </button>
        )}

        {isChallenge && verifiedFactors.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Choose an authenticator</legend>
            {verifiedFactors.map((factor) => (
              <button
                key={factor.id}
                type="button"
                aria-pressed={factorId === factor.id}
                onClick={() => {
                  setFactorId(factor.id);
                  setCode('');
                  setError(null);
                }}
                className="flex min-h-12 w-full items-center border border-[#6d726b] bg-white px-3 text-left text-sm font-semibold aria-pressed:border-[#252a25] aria-pressed:bg-[#f3f0e8] focus:outline-none focus:ring-2 focus:ring-[#252a25]"
              >
                {factor.friendlyName}
              </button>
            ))}
          </fieldset>
        )}

        {!isChallenge && enroll.isPending && (
          <PortalAuthNotice title="Preparing your authenticator">
            Making a private enrollment code.
          </PortalAuthNotice>
        )}

        {!isChallenge && qrCode && (
          <div className="border border-[#6d726b] bg-[#f3f0e8] p-5 text-center">
            {/* Supabase supplies the enrollment QR as a data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt="Authenticator enrollment QR code"
              className="mx-auto h-48 w-48 border border-[#6d726b] bg-white"
            />
            {secret && (
              <details className="mt-4 text-left text-sm">
                <summary className="min-h-11 cursor-pointer py-3 underline underline-offset-4">
                  Enter the setup key instead
                </summary>
                <code className="block break-all border border-[#6d726b] bg-white p-3 font-mono text-xs">
                  {secret}
                </code>
              </details>
            )}
          </div>
        )}

        {factorId && (
          <form className="space-y-4" onSubmit={handleVerify}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="mfa-code">
                Six-digit code
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'mfa-error' : undefined}
                className="h-12 w-full border border-[#6d726b] bg-white px-3 text-center font-mono text-lg tracking-[0.35em] outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
                disabled={verifying}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
            >
              {verifying ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
        )}
      </div>
    </AdminAuthShell>
  );
}

export default function MfaEnrollPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening account security">
            Getting verification ready.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <MfaEnrollContent />
    </Suspense>
  );
}
