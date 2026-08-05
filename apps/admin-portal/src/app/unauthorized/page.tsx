'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient, normalizeAuthError } from '@patina/supabase';
import { PortalAuthNotice, PortalAuthSuccess } from '@patina/design-system';
import { AdminAuthShell } from '../auth/auth-shell';
import { hardNavigate } from '@/lib/auth-navigation';

export default function UnauthorizedPage() {
  const [state, setState] = useState<'denied' | 'signing-out' | 'success'>(
    'denied',
  );
  const [error, setError] = useState<string | null>(null);
  const redirected = useRef(false);

  const continueToSignIn = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirected.current) return;
      redirected.current = true;
      hardNavigate('/auth/signin');
    },
    [],
  );

  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(continueToSignIn, 350);
    return () => window.clearTimeout(timer);
  }, [continueToSignIn, state]);

  async function handleSignInWithDifferentAccount() {
    setState('signing-out');
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || data.session) {
        throw sessionError ?? new Error('Session remained after sign out');
      }
      setState('success');
    } catch (cause) {
      setError(normalizeAuthError(cause, 'session').message);
      setState('denied');
    }
  }

  return (
    <AdminAuthShell>
      {state === 'success' ? (
        <PortalAuthSuccess
          title="You’re signed out."
          description="Choose another account to open Patina Operations."
          destinationLabel="Return to sign in"
          destinationHref="/auth/signin"
          onContinue={continueToSignIn}
        />
      ) : (
        <div className="space-y-5">
          <PortalAuthNotice
            tone="error"
            title="This account can’t open Patina Operations."
          >
            Sign in with an administrator account, or contact support@patina.com
            if you think this access should be restored.
          </PortalAuthNotice>
          {error && (
            <PortalAuthNotice tone="error" title="Sign-out needs another try.">
              {error}
            </PortalAuthNotice>
          )}
          <button
            type="button"
            onClick={() => void handleSignInWithDifferentAccount()}
            disabled={state === 'signing-out'}
            className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#252a25] focus:ring-offset-2"
          >
            {state === 'signing-out'
              ? 'Signing out…'
              : 'Sign in with a different account'}
          </button>
        </div>
      )}
    </AdminAuthShell>
  );
}
