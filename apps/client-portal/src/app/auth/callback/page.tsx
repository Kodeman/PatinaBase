'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import {
  consumeAuthCallbackFragment,
  finalizeAuthCallback,
  normalizeOAuthCallbackError,
  recoveryFinalReturnPath,
} from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalAuthSuccess,
} from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';
import {
  buildSignInPath,
  replaceAuthDestination,
  resolveAuthReturnPath,
  resolveRecoveryPath,
} from '@/lib/auth-redirect';

type CallbackState =
  | { status: 'working' }
  | { status: 'success'; destination: string }
  | {
      status: 'failed';
      message: string;
      retryPath: string;
      recovery: boolean;
    };

function CallbackContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<CallbackState>({ status: 'working' });
  const redirectingRef = useRef(false);
  const queryRecovery = searchParams.get('type') === 'recovery';
  const callbackUrl =
    searchParams.get('callbackUrl') ?? searchParams.get('next');
  const code = searchParams.get('code');
  const providerError =
    searchParams.get('error') ?? searchParams.get('error_code');
  const callbackRun = useRef<{
    key: string;
    promise: ReturnType<typeof finalizeAuthCallback>;
  } | null>(null);
  const callbackFragment = useRef<
    ReturnType<typeof consumeAuthCallbackFragment> | undefined
  >(undefined);

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirectingRef.current || state.status !== 'success') return;
      redirectingRef.current = true;
      replaceAuthDestination(state.destination);
    },
    [state],
  );

  useEffect(() => {
    callbackFragment.current ??= consumeAuthCallbackFragment();
    const fragment = callbackFragment.current;
    const recovery = queryRecovery || fragment.isRecovery;
    const resolvedDestination = recovery
      ? resolveRecoveryPath(callbackUrl)
      : resolveAuthReturnPath(callbackUrl);
    const recoveryReturnDestination = recoveryFinalReturnPath(
      resolvedDestination,
      resolveAuthReturnPath(null),
    );
    const retryPath = recovery
      ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(recoveryReturnDestination)}`
      : undefined;
    const providerFailure = normalizeOAuthCallbackError(
      fragment.oauthError ?? providerError,
    );
    if (providerFailure) {
      setState({
        status: 'failed',
        message: providerFailure.message,
        retryPath:
          retryPath ??
          buildSignInPath(resolvedDestination, providerFailure.kind),
        recovery,
      });
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
        // A PKCE code is single-use. Reuse one exchange when React Strict Mode
        // replays this effect instead of racing two callback requests.
        promise: finalizeAuthCallback({
          supabase: createBrowserClient(),
          code,
          recovery,
          recoveryTokenHash,
          legacyRecoveryFragment: fragment.legacyRecovery,
        }),
      };
    }

    void callbackRun.current.promise.then((result) => {
      if (!active) return;
      if (result.status === 'authenticated') {
        setState({ status: 'success', destination: resolvedDestination });
      } else {
        setState({
          status: 'failed',
          message: result.failure.message,
          retryPath:
            retryPath ??
            buildSignInPath(resolvedDestination, result.failure.kind),
          recovery,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [callbackUrl, code, providerError, queryRecovery]);

  useEffect(() => {
    if (state.status !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hardRedirect, state.status]);

  return (
    <ClientAuthShell>
      {state.status === 'working' ? (
        <PortalAuthNotice title="Finishing your sign in">
          Securely opening your client portal…
        </PortalAuthNotice>
      ) : state.status === 'success' ? (
        <PortalAuthSuccess
          destinationHref={state.destination}
          onContinue={hardRedirect}
        />
      ) : (
        <div className="space-y-5">
          <PortalAuthNotice
            tone="error"
            title={
              state.recovery
                ? 'That reset link needs another try'
                : 'Sign in didn’t finish'
            }
          >
            {state.message}
          </PortalAuthNotice>
          <a
            href={state.retryPath}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
          >
            {state.recovery ? 'Request a new reset link' : 'Return to sign in'}
          </a>
        </div>
      )}
    </ClientAuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <p role="status">Preparing sign in…</p>
        </ClientAuthShell>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
