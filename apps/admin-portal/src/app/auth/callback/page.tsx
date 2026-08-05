'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  consumeAuthCallbackFragment,
  createBrowserClient,
  finalizeAuthCallback,
  normalizeOAuthCallbackError,
  recoveryFinalReturnPath,
} from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import {
  adminAuthDestination,
  hardNavigate,
  recoveryDestination,
} from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

function CallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const callbackUrl =
    searchParams.get('callbackUrl') || searchParams.get('next');
  const queryRecovery = searchParams.get('type') === 'recovery';
  const providerError =
    searchParams.get('error') ?? searchParams.get('error_code');
  const queryDestination = queryRecovery
    ? recoveryDestination(callbackUrl)
    : adminAuthDestination(callbackUrl);
  const [isRecovery, setIsRecovery] = useState(queryRecovery);
  const [destination, setDestination] = useState(queryDestination);
  const [result, setResult] = useState<'working' | 'success' | 'failed'>(
    'working',
  );
  const [message, setMessage] = useState<string | null>(null);
  const callbackRun = useRef<{
    key: string;
    promise: ReturnType<typeof finalizeAuthCallback>;
  } | null>(null);
  const callbackFragment = useRef<
    ReturnType<typeof consumeAuthCallbackFragment> | undefined
  >(undefined);
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
    callbackFragment.current ??= consumeAuthCallbackFragment();
    const fragment = callbackFragment.current;
    const recovery = queryRecovery || fragment.isRecovery;
    const resolvedDestination = recovery
      ? recoveryDestination(callbackUrl)
      : adminAuthDestination(callbackUrl);
    setIsRecovery(recovery);
    setDestination(resolvedDestination);

    const providerFailure = normalizeOAuthCallbackError(
      fragment.oauthError ?? providerError,
    );
    if (providerFailure) {
      setMessage(providerFailure.message);
      setResult('failed');
      return;
    }

    let active = true;
    const recoveryTokenHash = fragment.recoveryTokenHash;
    const callbackKey =
      recoveryTokenHash !== undefined
        ? `recovery:${recoveryTokenHash}`
        : fragment.legacyRecovery
          ? 'legacy-recovery-fragment'
          : code ?? 'fragment-or-existing-session';
    if (!callbackRun.current || callbackRun.current.key !== callbackKey) {
      callbackRun.current = {
        key: callbackKey,
        // PKCE codes are single-use. Share one exchange across React Strict
        // Mode's effect replay instead of aborting and racing a second call.
        promise: finalizeAuthCallback({
          supabase: createBrowserClient(),
          code,
          recovery,
          recoveryTokenHash,
          legacyRecoveryFragment: fragment.legacyRecovery,
        }),
      };
    }

    void callbackRun.current.promise
      .then((callback) => {
        if (!active) return;
        if (callback.status === 'failed') {
          setMessage(callback.failure.message);
          setResult('failed');
          return;
        }
        setResult('success');
      })
      .catch(() => {
        if (!active) return;
        setMessage(
          'We could not finish opening your session. Please try again.',
        );
        setResult('failed');
      });

    return () => {
      active = false;
    };
  }, [callbackUrl, code, providerError, queryRecovery]);

  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 350);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, result]);

  const recoveryReturnDestination = recoveryFinalReturnPath(
    destination,
    adminAuthDestination(null),
  );

  return (
    <AdminAuthShell>
      {result === 'success' ? (
        <PortalAuthSuccess
          title={isRecovery ? 'Your secure reset is ready.' : undefined}
          description={
            isRecovery
              ? 'We’re taking you to choose a new password now.'
              : undefined
          }
          destinationLabel={isRecovery ? 'Choose a new password' : undefined}
          destinationHref={destination}
          onContinue={hardRedirect}
        />
      ) : (
        <PortalAuthNotice
          tone={result === 'failed' ? 'error' : 'info'}
          title={
            result === 'failed'
              ? isRecovery
                ? 'That reset link needs another try.'
                : 'Sign-in needs another try.'
              : 'Completing sign in'
          }
        >
          {message ?? 'Confirming your secure session.'}
          {result === 'failed' && (
            <p className="mt-3">
              <Link
                className="font-semibold underline underline-offset-4"
                href={
                  isRecovery
                    ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(recoveryReturnDestination)}`
                    : `/auth/signin?callbackUrl=${encodeURIComponent(adminAuthDestination(callbackUrl))}`
                }
              >
                {isRecovery ? 'Request a new reset link' : 'Return to sign in'}
              </Link>
            </p>
          )}
        </PortalAuthNotice>
      )}
    </AdminAuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Completing sign in">
            Loading your secure callback.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
