'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import { normalizeAuthError } from '@patina/supabase/auth';
import {
  PortalAuthNotice,
  PortalAuthSuccess,
} from '@patina/design-system/PortalAuth';
import {
  CLIENT_AUTH_DESTINATION,
  confirmBrowserSession,
  replaceAuthDestination,
} from '@/lib/auth-redirect';

interface AcceptInviteFormProps {
  email: string;
  token: string;
}

export function AcceptInviteForm({ email, token }: AcceptInviteFormProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectingRef = useRef(false);

  const hardRedirect = useCallback(
    (event?: React.MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      replaceAuthDestination(CLIENT_AUTH_DESTINATION);
    },
    [],
  );

  useEffect(() => {
    if (!accepted) return;
    const timer = window.setTimeout(hardRedirect, 650);
    return () => {
      window.clearTimeout(timer);
    };
  }, [accepted, hardRedirect]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserClient();

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        if (/already (registered|exists)/i.test(signUpError.message ?? '')) {
          const { error: signInError } = await supabase.auth.signInWithPassword(
            { email, password },
          );
          if (signInError) throw signInError;
        } else {
          throw signUpError;
        }
      }

      await confirmBrowserSession(supabase);
      const response = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Your sign-in could not be confirmed. Sign in again, then reopen the invitation.'
            : 'We couldn’t finish accepting this invitation. Ask your designer to resend it, or contact Patina.',
        );
        return;
      }
      await confirmBrowserSession(supabase);
      setAccepted(true);
    } catch (acceptError) {
      setError(normalizeAuthError(acceptError).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (accepted) {
    return (
      <PortalAuthSuccess
        title="Your invitation is accepted."
        description="We’re opening your projects now."
        destinationHref={CLIENT_AUTH_DESTINATION}
        onContinue={hardRedirect}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="accept-invite-form"
    >
      <div>
        <label htmlFor="invite-email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          readOnly
          className="mt-2 h-12 w-full border border-[#8B7355] bg-[#f3f0e8] px-3 text-sm text-[#65594E]"
        />
      </div>
      <div>
        <label htmlFor="invite-password" className="text-sm font-medium">
          Set a password
        </label>
        <input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 h-12 w-full border border-[#8B7355] bg-white px-3 outline-none focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C]"
        />
      </div>
      <div>
        <label htmlFor="invite-confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="invite-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="mt-2 h-12 w-full border border-[#8B7355] bg-white px-3 outline-none focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C]"
        />
      </div>
      {error ? (
        <PortalAuthNotice
          tone="error"
          title="We couldn’t accept the invitation"
        >
          {error}
        </PortalAuthNotice>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#2C2926] motion-reduce:transition-none disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2"
        data-testid="accept-invite-submit"
      >
        {submitting ? 'Setting up…' : 'Create account and accept'}
      </button>
    </form>
  );
}
