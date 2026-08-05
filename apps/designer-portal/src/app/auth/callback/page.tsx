'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildSignInPath, createBrowserClient, finalizeAuthCallback } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { DesignerAuthShell } from '../auth-shell';
import { callbackDestination } from '../auth-journey';

function CallbackContent() {
  const searchParams = useSearchParams();
  const callbackRun = useRef<{
    key: string;
    promise: ReturnType<typeof finalizeAuthCallback>;
  } | null>(null);
  const [result, setResult] = useState<'working' | 'success' | 'failed'>('working');
  const [error, setError] = useState<string | null>(null);
  const destination = callbackDestination({ callbackUrl: searchParams.get('callbackUrl'), next: searchParams.get('next'), type: searchParams.get('type') });
  const code = searchParams.get('code');
  const callbackKey = code ?? 'fragment-or-existing-session';

  useEffect(() => {
    let active = true;
    if (!callbackRun.current || callbackRun.current.key !== callbackKey) {
      callbackRun.current = {
        key: callbackKey,
        // Reuse this single exchange across React Strict Mode's effect replay;
        // a PKCE code can only be exchanged once.
        promise: finalizeAuthCallback({ supabase: createBrowserClient(), code }),
      };
    }
    void callbackRun.current.promise
      .then((callback) => {
        if (!active) return;
        if (callback.status === 'failed') { setError(callback.failure.message); setResult('failed'); return; }
        setResult('success');
      })
      .catch(() => { if (active) { setError('We could not finish opening your session. Please try again.'); setResult('failed'); } });
    return () => {
      active = false;
    };
  }, [callbackKey, code]);

  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(() => window.location.replace(destination), 350);
    return () => window.clearTimeout(timer);
  }, [destination, result]);

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
            title={result === 'failed' ? 'Sign-in needs another try.' : 'Completing sign in'}
          >
            {error ?? 'Confirming your secure session.'}
          </PortalAuthNotice>
          {result === 'failed' && (
            <a
              href={buildSignInPath(destination, 'oauth')}
              className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[#6d726b] underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#252a25]"
            >
              Try sign in again
            </a>
          )}
        </div>
      )}
    </DesignerAuthShell>
  );
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<DesignerAuthShell><PortalAuthNotice title="Completing sign in">Loading your secure callback.</PortalAuthNotice></DesignerAuthShell>}><CallbackContent /></Suspense>;
}
