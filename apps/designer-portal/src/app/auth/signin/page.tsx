'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { AuthForm, type AuthFormField, Alert, DevAccountsPanel } from '@patina/design-system';
import { getAccountsForPortal } from '@patina/types';
import Link from 'next/link';
import { QRLoginDisplay } from '@/components/auth/QRLoginDisplay';
import { StrataMark } from '@/components/portal/strata-mark';

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
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

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
    if (url.startsWith('/') && !url.startsWith('//')) {
      window.location.href = url;
    } else {
      window.location.href = '/';
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    setFormError(null);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          ...(provider === 'apple'
            ? { queryParams: { response_mode: 'fragment' } }
            : {}),
        },
      });

      if (oauthError) {
        setFormError(oauthError.message || `Failed to sign in with ${provider}`);
        setOauthLoading(null);
      }
    } catch (err) {
      console.error(`[OAuth SignIn] ${provider} exception:`, err);
      setFormError(`An error occurred during ${provider} sign in`);
      setOauthLoading(null);
    }
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
    <div className="min-h-screen px-6 py-20 md:py-32">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <h1 className="type-section-head mb-2 animate-text-reveal">Sign In</h1>
        <p className="type-meta mb-10 animate-section-enter">Patina Designer Portal</p>

        {/* Status Messages */}
        {registered === 'true' && (
          <div className="mb-8">
            <Alert
              variant="success"
              title="Account Created"
              description="Your account has been created successfully. Please sign in to continue."
            />
          </div>
        )}

        {reset === 'success' && (
          <div className="mb-8">
            <Alert
              variant="success"
              title="Password Reset"
              description="Your password has been reset successfully. Please sign in with your new password."
            />
          </div>
        )}

        {reset === 'requested' && (
          <div className="mb-8">
            <Alert
              variant="info"
              title="Reset Link Sent"
              description="Check your email for the password reset link."
            />
          </div>
        )}

        {errorConfig && (
          <div className="mb-8">
            <Alert
              variant="error"
              title={errorConfig.title}
              description={errorConfig.description}
              closable
            />
          </div>
        )}

        {/* QR Code */}
        <div className="mb-4">
          <p className="type-meta mb-4">Quick Access</p>
          <QRLoginDisplay redirectTo={callbackUrl} />
        </div>

        {/* Strata divider */}
        <StrataMark variant="mini" />
        <p className="type-meta mb-6">Or continue with</p>

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={isLoading || !!oauthLoading}
            className="type-btn-text flex items-center justify-center gap-2 py-3 px-4 border border-patina-pearl rounded-[3px] text-patina-charcoal hover:border-patina-clay transition-colors disabled:opacity-50"
          >
            {oauthLoading === 'google' ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Google
          </button>

          <button
            onClick={() => handleOAuthSignIn('apple')}
            disabled={isLoading || !!oauthLoading}
            className="type-btn-text flex items-center justify-center gap-2 py-3 px-4 border border-patina-pearl rounded-[3px] text-patina-charcoal hover:border-patina-clay transition-colors disabled:opacity-50"
          >
            {oauthLoading === 'apple' ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
            )}
            Apple
          </button>
        </div>

        {/* Expandable Email/Password */}
        <div className="mt-6">
          <button
            onClick={() => setShowEmailForm(!showEmailForm)}
            className="type-meta w-full flex items-center justify-center gap-2 py-3 hover:text-patina-clay transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Sign in with email
            <svg className={`h-3 w-3 transition-transform ${showEmailForm ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {showEmailForm && (
            <div className="mt-4">
              <AuthForm
                title=""
                fields={fields}
                submitText={isLoading ? 'Signing in...' : 'Sign In'}
                isLoading={isLoading}
                error={formError || undefined}
                onSubmit={handleCredentialsSignIn}
              />
            </div>
          )}
        </div>

        {/* Footer Links */}
        <div className="mt-10 space-y-4">
          <StrataMark variant="micro" />
          <div className="flex items-center justify-between">
            <Link
              href="/auth/forgot-password"
              className="type-body-small text-patina-clay hover:text-patina-aged-oak transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <p className="type-body-small text-center">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-patina-clay hover:text-patina-aged-oak transition-colors">
              Sign up
            </Link>
          </p>
          <p className="type-meta-small text-center">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="text-patina-clay hover:text-patina-aged-oak transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-patina-clay hover:text-patina-aged-oak transition-colors">
              Privacy Policy
            </Link>
          </p>
        </div>

        {/* Dev Accounts Panel */}
        {process.env.NODE_ENV === 'development' && (
          <DevAccountsPanel
            accounts={devAccounts}
            onLogin={handleDevLogin}
            isLoading={isLoading}
            error={devAuthError}
            defaultCollapsed={true}
          />
        )}

        {/* Help Text */}
        <div className="mt-12 text-center">
          <p className="type-body-small">
            Need help signing in?{' '}
            <Link href="/support" className="text-patina-clay hover:text-patina-aged-oak transition-colors">
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
    <div className="min-h-screen px-6 py-20 md:py-32">
      <div className="mx-auto max-w-md">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-patina-pearl rounded mb-2" />
          <div className="h-4 w-48 bg-patina-pearl/60 rounded mb-10" />
          <div className="h-[280px] w-full bg-patina-pearl/30 rounded" />
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
