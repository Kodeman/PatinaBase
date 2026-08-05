'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient, normalizeAuthError } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { authEvents } from '@/lib/analytics/events';
import { hardNavigate } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

export default function AdminSignOutPage() {
  const [state, setState] = useState<'working' | 'success' | 'failed'>(
    'working',
  );
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const redirected = useRef(false);

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirected.current) return;
      redirected.current = true;
      hardNavigate('/auth/signin');
    },
    [],
  );

  useEffect(() => {
    const currentAttempt = ++attempt.current;
    let active = true;
    const signOut = async () => {
      try {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // The Supabase session remains authoritative; continue clearing it.
        }
        const supabase = createBrowserClient();
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        const { data } = await supabase.auth.getSession();
        if (data.session) throw new Error('Session remained after sign out');
        if (!active || attempt.current !== currentAttempt) return;
        authEvents.logout();
        setState('success');
      } catch (cause) {
        if (!active || attempt.current !== currentAttempt) return;
        setError(normalizeAuthError(cause, 'session').message);
        setState('failed');
      }
    };
    void signOut();
    return () => {
      active = false;
      if (attempt.current === currentAttempt) attempt.current += 1;
    };
  }, []);

  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(hardRedirect, 350);
    return () => window.clearTimeout(timer);
  }, [hardRedirect, state]);

  return (
    <AdminAuthShell>
      {state === 'success' ? (
        <PortalAuthSuccess
          title="You’re signed out."
          description="This Patina Operations session is closed."
          destinationLabel="Return to sign in"
          destinationHref="/auth/signin"
          onContinue={hardRedirect}
        />
      ) : (
        <PortalAuthNotice
          tone={state === 'failed' ? 'error' : 'info'}
          title={
            state === 'failed' ? 'Sign-out needs another try.' : 'Signing out'
          }
        >
          {error ?? 'Closing this Patina Operations session.'}
          {state === 'failed' && (
            <p className="mt-3">
              <Link
                className="font-semibold underline underline-offset-4"
                href="/auth/signout"
              >
                Try signing out again
              </Link>
            </p>
          )}
        </PortalAuthNotice>
      )}
    </AdminAuthShell>
  );
}
