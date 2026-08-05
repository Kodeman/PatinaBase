'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { finalizeAuthCallback } from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalAuthSuccess,
} from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';
import {
  buildSignInPath,
  replaceAuthDestination,
  resolveAuthReturnPath,
} from '@/lib/auth-redirect';

type CallbackState =
  | { status: 'working' }
  | { status: 'success'; destination: string }
  | { status: 'failed'; message: string; retryPath: string };

function CallbackContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<CallbackState>({ status: 'working' });
  const redirectingRef = useRef(false);
  const recovery = searchParams.get('type') === 'recovery';
  const destination = recovery
    ? '/auth/reset-password'
    : resolveAuthReturnPath(
        searchParams.get('callbackUrl') ?? searchParams.get('next'),
      );

  useEffect(() => {
    const abortController = new AbortController();
    const supabase = createBrowserClient();

    void finalizeAuthCallback({
      supabase,
      code: searchParams.get('code'),
      signal: abortController.signal,
    }).then((result) => {
      if (abortController.signal.aborted) return;
      if (result.status === 'authenticated') {
        setState({ status: 'success', destination });
      } else {
        setState({
          status: 'failed',
          message: result.failure.message,
          retryPath: buildSignInPath(destination, result.failure.kind),
        });
      }
    });

    return () => abortController.abort();
  }, [destination, searchParams]);

  useEffect(() => {
    if (state.status !== 'success' || redirectingRef.current) return;
    redirectingRef.current = true;
    const timer = window.setTimeout(
      () => replaceAuthDestination(state.destination),
      450,
    );
    return () => {
      window.clearTimeout(timer);
      redirectingRef.current = false;
    };
  }, [state]);

  return (
    <ClientAuthShell>
      {state.status === 'working' ? (
        <PortalAuthNotice title="Finishing your sign in">
          Securely opening your client portal…
        </PortalAuthNotice>
      ) : state.status === 'success' ? (
        <PortalAuthSuccess
          destinationHref={state.destination}
          onContinue={() => {
            if (redirectingRef.current) return;
            redirectingRef.current = true;
            replaceAuthDestination(state.destination);
          }}
        />
      ) : (
        <div className="space-y-5">
          <PortalAuthNotice tone="error" title="Sign in didn’t finish">
            {state.message}
          </PortalAuthNotice>
          <a
            href={state.retryPath}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
          >
            Return to sign in
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
