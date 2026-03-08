'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { Button, DevAccountsPanel } from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';

function SignInContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);

  const callbackUrl = searchParams.get('callbackUrl') || '/projects';
  const errorParam = searchParams.get('error');

  const supabase = createBrowserClient();

  const safeRedirect = (url: string) => {
    // Prevent open redirect: only allow relative paths
    if (url.startsWith('/') && !url.startsWith('//')) {
      window.location.href = url;
    } else {
      window.location.href = '/projects';
    }
  };

  // Get dev accounts for client portal
  const devAccounts = getAccountsForPortal('client');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Invalid email or password');
        setIsLoading(false);
      } else {
        safeRedirect(callbackUrl);
      }
    } catch (err) {
      console.error('[Client SignIn] Exception:', err);
      setError('Failed to sign in. Please check your credentials and try again.');
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (email: string, password: string) => {
    setDevAuthError(null);
    setError(null);
    setIsLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setDevAuthError('Login failed. Check that the user-management service is running.');
        setIsLoading(false);
      } else {
        safeRedirect(callbackUrl);
      }
    } catch (err) {
      console.error('[Client Dev Login] Exception:', err);
      setDevAuthError('An error occurred during sign in');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-[var(--font-playfair)] text-4xl text-[var(--color-text)]">
            Welcome to Patina
          </h1>
          <p className="mt-2 text-lg text-[var(--color-muted)]">
            Sign in to access your projects
          </p>
        </div>

        {(error || errorParam) && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Error</p>
            <p className="mt-1">{error || errorParam}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[var(--color-text)]"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-[var(--color-text)] placeholder-gray-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--color-text)]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-[var(--color-text)] placeholder-gray-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
                placeholder="Enter your password"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                disabled={isLoading}
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-sm text-[var(--color-muted)]"
              >
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <a
                href="/auth/forgot-password"
                className="font-medium text-[var(--color-accent)] hover:underline"
              >
                Forgot password?
              </a>
            </div>
          </div>

          <Button
            type="submit"
            variant="default"
            size="lg"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        {/* Dev Accounts Panel - Only visible in development */}
        {process.env.NODE_ENV === 'development' && (
          <DevAccountsPanel
            accounts={devAccounts}
            onLogin={handleDevLogin}
            isLoading={isLoading}
            error={devAuthError}
            defaultCollapsed={true}
          />
        )}

        <div className="text-center text-sm text-[var(--color-muted)]">
          <p>
            Don&rsquo;t have an account?{' '}
            <a
              href="/auth/signup"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              Contact your designer
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Loading...</h1>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
