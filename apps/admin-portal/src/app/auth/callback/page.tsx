'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient, finalizeAuthCallback } from '@patina/supabase';
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
  const isRecovery = searchParams.get('type') === 'recovery';
  const destination = isRecovery
    ? recoveryDestination(callbackUrl)
    : adminAuthDestination(callbackUrl);
  const [result, setResult] = useState<'working' | 'success' | 'failed'>(
    'working',
  );
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef(0);
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
    const currentAttempt = ++attempt.current;
    const controller = new AbortController();

    void finalizeAuthCallback({
      supabase: createBrowserClient(),
      code,
      signal: controller.signal,
    })
      .then((callback) => {
        if (controller.signal.aborted || attempt.current !== currentAttempt)
          return;
        if (callback.status === 'failed') {
          setMessage(callback.failure.message);
          setResult('failed');
          return;
        }
        setResult('success');
      })
      .catch(() => {
        if (controller.signal.aborted || attempt.current !== currentAttempt)
          return;
        setMessage(
          'We could not finish opening your session. Please try again.',
        );
        setResult('failed');
      });

    return () => {
      controller.abort();
      if (attempt.current === currentAttempt) attempt.current += 1;
    };
  }, [code]);

  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 350);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, result]);

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
              ? 'Sign-in needs another try.'
              : 'Completing sign in'
          }
        >
          {message ?? 'Confirming your secure session.'}
          {result === 'failed' && (
            <p className="mt-3">
              <Link
                className="font-semibold underline underline-offset-4"
                href={`/auth/signin?callbackUrl=${encodeURIComponent(adminAuthDestination(callbackUrl))}`}
              >
                Return to sign in
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
