'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient, useUpdatePassword } from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalAuthSuccess,
} from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';
import {
  confirmBrowserSession,
  replaceAuthDestination,
  resolveAuthReturnPath,
} from '@/lib/auth-redirect';

type RecoveryState = 'checking' | 'ready' | 'success' | 'invalid';

function passwordValidation(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return 'Include an uppercase letter, a lowercase letter, and a number.';
  }
  if (password !== confirmation) return 'The passwords don’t match.';
  return null;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const destination = resolveAuthReturnPath(searchParams?.get('callbackUrl'));
  const updatePassword = useUpdatePassword();
  const [state, setState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const redirectingRef = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(
    null,
  );

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      replaceAuthDestination(destination);
    },
    [destination],
  );

  useEffect(() => {
    let active = true;
    const supabase = createBrowserClient();
    supabaseRef.current = supabase;
    void confirmBrowserSession(supabase)
      .then(() => {
        if (active) setState('ready');
      })
      .catch(() => {
        if (active) setState('invalid');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 650);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hardRedirect, state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = passwordValidation(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      const supabase = supabaseRef.current;
      if (!supabase) throw new Error('Recovery session unavailable');
      await confirmBrowserSession(supabase);
      await updatePassword.mutateAsync({ password });
      await confirmBrowserSession(supabase);
      setState('success');
    } catch (updateError) {
      setError(normalizeAuthError(updateError, 'session').message);
    }
  };

  return (
    <ClientAuthShell
      title="Choose a new password."
      description="Set a strong password, then we’ll return you to Patina."
    >
      {state === 'checking' ? (
        <PortalAuthNotice title="Checking your recovery link">
          This will only take a moment…
        </PortalAuthNotice>
      ) : state === 'invalid' ? (
        <div className="space-y-5">
          <PortalAuthNotice tone="error" title="This recovery link isn’t ready">
            It may have expired or already been used. Request a fresh link to
            continue.
          </PortalAuthNotice>
          <a
            href={`/auth/forgot-password?callbackUrl=${encodeURIComponent(destination)}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Request another link
          </a>
        </div>
      ) : state === 'success' ? (
        <PortalAuthSuccess
          title="Your password is updated."
          description="We’re taking you to your projects now."
          destinationHref={destination}
          onContinue={hardRedirect}
        />
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f554f]">
              Password recovery
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">
              Make it memorable.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#4f554f]">
              Use 8 or more characters with upper and lowercase letters and a
              number.
            </p>
          </div>
          {error ? (
            <PortalAuthNotice id="client-reset-error" tone="error" title="Check your password">
              {error}
            </PortalAuthNotice>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'client-reset-error' : undefined}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'client-reset-error' : undefined}
              className="h-12 w-full border border-[#6d726b] bg-white px-3 outline-none focus:border-[#252a25] focus:ring-2 focus:ring-[#252a25]"
            />
          </div>
          <button
            type="submit"
            disabled={updatePassword.isPending}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {updatePassword.isPending
              ? 'Updating password…'
              : 'Update password'}
          </button>
        </form>
      )}
    </ClientAuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <PortalAuthNotice title="Checking your recovery link">
            Confirming the secure recovery session.
          </PortalAuthNotice>
        </ClientAuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
