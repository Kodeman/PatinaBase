'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { AuthForm, type AuthFormField, Alert, Button, DevAccountsPanel } from '@patina/design-system';
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
  OAuthCreateAccount: {
    title: 'Account Creation Failed',
    description: 'Could not create your account. Please contact support if this continues.',
  },
  OAuthAccountNotLinked: {
    title: 'Account Not Linked',
    description: 'This account is not linked to any existing user. Please contact your administrator.',
  },
  SessionExpired: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
  },
  SessionRequired: {
    title: 'Authentication Required',
    description: 'Please sign in to access this page.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
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
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const registered = searchParams.get('registered');
  const reset = searchParams.get('reset');

  const supabase = createBrowserClient();

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [devAuthError, setDevAuthError] = useState<string | null>(null);

  // Check if OIDC is configured
  const hasOIDC = !!(
    process.env.NEXT_PUBLIC_OIDC_ISSUER &&
    process.env.NEXT_PUBLIC_OIDC_CLIENT_ID
  );

  // Get dev accounts for designer portal
  const devAccounts = getAccountsForPortal('designer');

  const fields: AuthFormField[] = [
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'you@example.com',
      required: true,
      autoComplete: 'email',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'Enter your password',
      required: true,
      autoComplete: 'current-password',
    },
  ];

  const safeRedirect = (url: string) => {
    // Prevent open redirect: only allow relative paths
    if (url.startsWith('/') && !url.startsWith('//')) {
      window.location.href = url;
    } else {
      window.location.href = '/';
    }
  };

  const handleOIDCSignIn = async () => {
    setIsLoading(true);
    // OIDC is no longer supported; use Supabase credentials sign-in instead
    setFormError('Single sign-on is not configured. Please use email and password.');
    setIsLoading(false);
  };

  const handleCredentialsSignIn = async (data: Record<string, string>) => {
    setIsLoading(true);
    setFormError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        setFormError('Invalid email or password');
        setIsLoading(false);
      } else {
        safeRedirect(callbackUrl);
      }
    } catch (err) {
      console.error('[Credentials SignIn] Exception:', err);
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
      console.error('[Dev Login] Exception:', err);
      setDevAuthError('An error occurred during sign in');
      setIsLoading(false);
    }
  };

  const errorConfig = error ? ERROR_MESSAGES[error] || ERROR_MESSAGES.Default : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          {/* Success Messages */}
          {registered === 'true' && (
            <div className="mb-6">
              <Alert
                variant="success"
                title="Account Created"
                description="Your account has been created successfully. Please sign in to continue."
              />
            </div>
          )}

          {reset === 'success' && (
            <div className="mb-6">
              <Alert
                variant="success"
                title="Password Reset"
                description="Your password has been reset successfully. Please sign in with your new password."
              />
            </div>
          )}

          {reset === 'requested' && (
            <div className="mb-6">
              <Alert
                variant="info"
                title="Reset Link Sent"
                description="Check your email for the password reset link."
              />
            </div>
          )}

          {/* Error Messages */}
          {errorConfig && (
            <div className="mb-6">
              <Alert
                variant="error"
                title={errorConfig.title}
                description={errorConfig.description}
                closable
              />
            </div>
          )}

          {/* OIDC Sign In */}
          {hasOIDC ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 text-primary mb-4">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-full w-full"
                  >
                    <path
                      d="M12 2L2 7L12 12L22 7L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 17L12 22L22 17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 12L12 17L22 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-foreground">Patina Designer Portal</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in to access your account
                </p>
              </div>

              <Button
                onClick={handleOIDCSignIn}
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in with OCI Identity Domains'}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By signing in, you agree to our{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </p>
            </div>
          ) : (
            /* Development Credentials Sign In */
            <>
              <AuthForm
                title="Patina Designer Portal"
                description="Sign in to access your account"
                fields={fields}
                submitText={isLoading ? 'Signing in...' : 'Sign In'}
                isLoading={isLoading}
                error={formError || undefined}
                onSubmit={handleCredentialsSignIn}
                footer={
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        href="/auth/forgot-password"
                        className="text-primary font-medium hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                      Don't have an account?{' '}
                      <Link href="/auth/signup" className="text-primary font-medium hover:underline">
                        Sign up
                      </Link>
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                      By signing in, you agree to our{' '}
                      <Link href="/terms" className="text-primary hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" className="text-primary hover:underline">
                        Privacy Policy
                      </Link>
                    </p>
                  </div>
                }
              />

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
            </>
          )}
        </div>

        {/* Help Text */}
        <div className="rounded-lg bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Need help signing in?{' '}
            <Link href="/support" className="text-primary font-medium hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-primary mb-4 animate-pulse">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-full w-full"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Patina Designer Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoadingFallback />}>
      <SignInContent />
    </Suspense>
  );
}
