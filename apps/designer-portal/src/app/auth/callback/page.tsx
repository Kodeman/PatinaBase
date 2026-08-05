'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildSignInPath,
  consumeAuthCallbackFragment,
  createBrowserClient,
  finalizeAuthCallback,
  normalizeOAuthCallbackError,
  recoveryFinalReturnPath,
} from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';
import { callbackDestination } from '../auth-journey';

function CallbackContent() {
  const searchParams = useSearchParams();
  const callbackRun = useRef<{
    key: string;
    promise: ReturnType<typeof finalizeAuthCallback>;
  } | null>(null);
  const callbackFragment = useRef<
    ReturnType<typeof consumeAuthCallbackFragment> | undefined
  >(undefined);
  const [result, setResult] = useState<'working' | 'success' | 'failed'>(
    'working',
  );
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = searchParams.get('callbackUrl');
  const next = searchParams.get('next');
  const queryType = searchParams.get('type');
  const queryDestination = callbackDestination({
    callbackUrl,
    next,
    type: queryType,
  });
  const [destination, setDestination] = useState(queryDestination);
  const [isRecovery, setIsRecovery] = useState(queryType === 'recovery');
  const code = searchParams.get('code');
  const providerError =
    searchParams.get('error') ?? searchParams.get('error_code');

  useEffect(() => {
    callbackFragment.current ??= consumeAuthCallbackFragment();
    const fragment = callbackFragment.current;
    const recovery = queryType === 'recovery' || fragment.isRecovery;
    const resolvedDestination = callbackDestination({
      callbackUrl,
      next,
      type: recovery ? 'recovery' : queryType,
    });
    setDestination(resolvedDestination);
    setIsRecovery(recovery);

    const providerFailure = normalizeOAuthCallbackError(
      fragment.oauthError ?? providerError,
    );
    if (providerFailure) {
      setError(providerFailure.message);
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
        // Reuse this single exchange across React Strict Mode's effect replay;
        // a PKCE code can only be exchanged once.
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
          setError(callback.failure.message);
          setResult('failed');
          return;
        }
        setResult('success');
      })
      .catch(() => {
        if (active) {
          setError(
            'We could not finish opening your session. Please try again.',
          );
          setResult('failed');
        }
      });
    return () => {
      active = false;
    };
  }, [callbackUrl, code, next, providerError, queryType]);

  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(
      () => window.location.replace(destination),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [destination, result]);

  const recoveryReturnDestination = recoveryFinalReturnPath(
    destination,
    DESIGNER_AUTH_DESTINATION,
  );
  const retryHref = isRecovery
    ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(recoveryReturnDestination)}`
    : buildSignInPath(destination, 'oauth');

  return (
    <DesignerAuthShell>
      {result === 'success' ? (
        <PortalAuthSuccess
          destinationHref={destination}
          onContinue={() => window.location.replace(destination)}
        />
      ) : (
        <div className="space-y-4">
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
            {error ?? 'Confirming your secure session.'}
          </PortalAuthNotice>
          {result === 'failed' && (
            <a
              href={retryHref}
              className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[#6d726b] underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
            >
              {isRecovery ? 'Request a new reset link' : 'Try sign in again'}
            </a>
          )}
        </div>
      )}
    </DesignerAuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <DesignerAuthShell>
          <PortalAuthNotice title="Completing sign in">
            Loading your secure callback.
          </PortalAuthNotice>
        </DesignerAuthShell>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
