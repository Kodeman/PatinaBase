'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DevAccountsPanel } from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  OAuthSignin: {
    title: 'OAuth Sign-In Error',
    description: 'There was an error initiating the OAuth sign-in process. Please try again.',
  },
  OAuthCallback: {
    title: 'OAuth Callback Error',
    description: 'There was an error handling the OAuth callback. Please try signing in again.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have administrator permissions to access this portal.',
  },
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please contact support.',
  },
  Default: {
    title: 'Authentication Failed',
    description: 'An unexpected error occurred. Please try again.',
  },
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  const supabase = createBrowserClient();

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Check if OIDC is configured
  const hasOIDC = !!(
    process.env.NEXT_PUBLIC_OIDC_ISSUER &&
    process.env.NEXT_PUBLIC_OIDC_CLIENT_ID
  );

  // Get dev accounts for admin portal
  const devAccounts = getAccountsForPortal('admin');

  const handleOIDCSignIn = async () => {
    setIsLoading(true);
    // OIDC is no longer supported; use Supabase credentials sign-in instead
    setFormError('Single sign-on is not configured. Please use email and password.');
    setIsLoading(false);
  };

  const safeRedirect = (url: string) => {
    // Prevent open redirect: only allow relative paths
    if (url.startsWith('/') && !url.startsWith('//')) {
      window.location.href = url;
    } else {
      window.location.href = '/dashboard';
    }
  };

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setFormError('Invalid email or password');
        setIsLoading(false);
      } else {
        safeRedirect(callbackUrl);
      }
    } catch (err) {
      console.error('[Admin Credentials SignIn] Exception:', err);
      setFormError('An error occurred during sign in');
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (email: string, password: string) => {
    setDevAuthError(null);
    setFormError(null);
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
      console.error('[Admin Dev Login] Exception:', err);
      setDevAuthError('An error occurred during sign in');
      setIsLoading(false);
    }
  };

  const errorConfig = error ? ERROR_MESSAGES[error] || ERROR_MESSAGES.Default : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          {errorConfig && (
            <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">{errorConfig.title}</h3>
              <p className="text-sm text-muted-foreground">{errorConfig.description}</p>
            </div>
          )}

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">Admin Portal</h1>
            <p className="text-muted-foreground mt-2">Sign in to access the admin dashboard</p>
          </div>

          {hasOIDC && (
            <div className="mb-6">
              <Button
                onClick={handleOIDCSignIn}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Signing in...' : 'Sign in with OCI Identity Domains'}
              </Button>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleCredentialsSignIn} className="space-y-4">
            {formError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@patina.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
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
        </div>

        <div className="rounded-lg bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Need admin access? <Link href={"/support" as any} className="text-primary font-medium hover:underline">Contact System Administrator</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminSignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
