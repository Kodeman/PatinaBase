'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { AuthForm, type AuthFormField, Alert } from '@patina/design-system';
import Link from 'next/link';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const supabase = createBrowserClient();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(true);

  useEffect(() => {
    // Validate token on mount
    if (!token) {
      setTokenValid(false);
      setError('Invalid or missing reset token');
    }
  }, [token]);

  const fields: AuthFormField[] = [
    {
      name: 'password',
      label: 'New Password',
      type: 'password',
      placeholder: 'Create a strong password',
      required: true,
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      label: 'Confirm Password',
      type: 'password',
      placeholder: 'Confirm your new password',
      required: true,
      autoComplete: 'new-password',
    },
  ];

  const handleSubmit = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate password match
      if (data.password !== data.confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }

      // Validate password strength
      if (data.password.length < 8) {
        setError('Password must be at least 8 characters long');
        setIsLoading(false);
        return;
      }

      // Use Supabase to update the user's password
      // The user arrives here after clicking the reset link in their email,
      // which sets up the Supabase session via the URL hash/token.
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to reset password');
      }

      setSuccess('Password reset successful! Redirecting to sign in...');

      // Sign out after password reset so user can sign in with new password
      await supabase.auth.signOut();

      // Redirect to sign in page after 2 seconds
      setTimeout(() => {
        router.push('/auth/signin?reset=success');
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An error occurred. Please try again later.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!tokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-lg bg-card p-8 shadow-lg border">
            <div className="text-center mb-6">
              <div className="mx-auto h-12 w-12 text-destructive mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground">Invalid Reset Link</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This password reset link is invalid or has expired.
              </p>
            </div>

            <Alert variant="error" title="Error" description={error || 'Invalid reset token'} />

            <div className="mt-6 space-y-2">
              <Link
                href="/auth/forgot-password"
                className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Request New Reset Link
              </Link>
              <Link
                href="/auth/signin"
                className="block w-full text-center text-sm text-primary hover:underline"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <AuthForm
            title="Set New Password"
            description="Enter your new password below"
            fields={fields}
            submitText="Reset Password"
            isLoading={isLoading}
            error={error || undefined}
            success={success || undefined}
            onSubmit={handleSubmit}
            footer={
              <div className="text-center">
                <Link
                  href="/auth/signin"
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Back to Sign In
                </Link>
              </div>
            }
          />
        </div>

        {/* Password Requirements */}
        <div className="mt-4 rounded-lg bg-muted p-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Password Requirements:</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• At least 8 characters long</li>
            <li>• Mix of uppercase and lowercase letters (recommended)</li>
            <li>• Include numbers and special characters (recommended)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-primary mb-4 animate-pulse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
