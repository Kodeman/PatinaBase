'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createBrowserClient,
  normalizeAuthError,
  useEnrollMfa,
  useVerifyMfaEnrollment,
} from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { adminAuthDestination, hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

function MfaEnrollContent() {
  const searchParams = useSearchParams();
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const enroll = useEnrollMfa();
  const verify = useVerifyMfaEnrollment();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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
    if (enrollmentStarted.current) return;
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
  }, [enroll]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(hardRedirect, 500);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, success]);

  const handleVerify = (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || code.length !== 6 || completed.current) return;
    setError(null);
    verify.mutate(
      { factorId, code },
      {
        onSuccess: async () => {
          try {
            const supabase = createBrowserClient();
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
        },
        onError: (cause) => {
          setCode('');
          setError(normalizeAuthError(cause, 'invalid_code').message);
        },
      },
    );
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

  return (
    <AdminAuthShell>
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
            Account security
          </p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
            Add an authenticator.
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#4f554f]">
            Patina Operations requires a second check. Scan this code with your
            authenticator app, then enter its six-digit code.
          </p>
        </div>
        {error && (
          <PortalAuthNotice
            id="mfa-error"
            tone="error"
            title="That code needs another try."
          >
            {error}
          </PortalAuthNotice>
        )}
        {enroll.isPending && (
          <PortalAuthNotice title="Preparing your authenticator">
            Making a private enrollment code.
          </PortalAuthNotice>
        )}
        {qrCode && (
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
                disabled={verify.isPending}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={verify.isPending || code.length !== 6}
              className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
            >
              {verify.isPending ? 'Verifying…' : 'Verify and continue'}
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
            Getting enrollment ready.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <MfaEnrollContent />
    </Suspense>
  );
}
