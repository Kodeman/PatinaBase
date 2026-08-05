'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildSignInPath, createBrowserClient, finalizeAuthCallback } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { DesignerAuthShell } from '../auth-shell';
import { callbackDestination } from '../auth-journey';

function CallbackContent() {
  const searchParams = useSearchParams();
  const handled = useRef(false);
  const [result, setResult] = useState<'working' | 'success' | 'failed'>('working');
  const [error, setError] = useState<string | null>(null);
  const destination = callbackDestination({ callbackUrl: searchParams.get('callbackUrl'), next: searchParams.get('next'), type: searchParams.get('type') });

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const controller = new AbortController();
    void finalizeAuthCallback({ supabase: createBrowserClient(), code: searchParams.get('code'), signal: controller.signal })
      .then((callback) => {
        if (controller.signal.aborted) return;
        if (callback.status === 'failed') { setError(callback.failure.message); setResult('failed'); return; }
        setResult('success');
      })
      .catch((cause) => { if (!controller.signal.aborted) { setError('We could not finish opening your session. Please try again.'); setResult('failed'); } });
    return () => controller.abort();
  }, [searchParams]);

  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(() => window.location.replace(destination), 350);
    return () => window.clearTimeout(timer);
  }, [destination, result]);

  useEffect(() => {
    if (result !== 'failed') return;
    const timer = window.setTimeout(() => window.location.replace(buildSignInPath(destination, 'oauth')), 900);
    return () => window.clearTimeout(timer);
  }, [destination, result]);

  return <DesignerAuthShell>{result === 'success' ? <PortalAuthSuccess destinationHref={destination} onContinue={() => window.location.replace(destination)} /> : <PortalAuthNotice tone={result === 'failed' ? 'error' : 'info'} title={result === 'failed' ? 'Sign-in needs another try.' : 'Completing sign in'}>{error ?? 'Confirming your secure session.'}</PortalAuthNotice>}</DesignerAuthShell>;
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<DesignerAuthShell><PortalAuthNotice title="Completing sign in">Loading your secure callback.</PortalAuthNotice></DesignerAuthShell>}><CallbackContent /></Suspense>;
}
