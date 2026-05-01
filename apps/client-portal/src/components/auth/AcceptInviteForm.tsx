'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createBrowserClient } from '@patina/supabase';

interface AcceptInviteFormProps {
  email: string;
  token: string;
}

export function AcceptInviteForm({ email, token }: AcceptInviteFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createBrowserClient() as any;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      const msg = signUpError.message ?? 'Sign up failed';
      // If user exists, sign them in instead so we can complete the accept flow.
      if (/already (registered|exists)/i.test(msg)) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setSubmitting(false);
          setError(
            'An account already exists for this email. Please sign in instead.',
          );
          return;
        }
      } else {
        setSubmitting(false);
        setError(msg);
        return;
      }
    }

    // Mark invite accepted
    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const code = data?.error ?? `http_${res.status}`;
        setSubmitting(false);
        setError(`Couldn’t finalize invitation (${code}). Please contact your designer.`);
        return;
      }
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Network error.');
      return;
    }

    router.push('/projects');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="accept-invite-form">
      <div>
        <label htmlFor="invite-email" className="block type-meta">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          readOnly
          className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-muted)]"
        />
      </div>
      <div>
        <label htmlFor="invite-password" className="block type-meta">
          Set a password
        </label>
        <input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="invite-confirm" className="block type-meta">
          Confirm password
        </label>
        <input
          id="invite-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
        />
      </div>
      {error ? (
        <p className="type-meta-small text-patina-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        data-testid="accept-invite-submit"
      >
        {submitting ? 'Setting up…' : 'Create account & accept'}
      </button>
    </form>
  );
}
