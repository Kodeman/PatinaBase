'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm, type AuthFormField } from '@patina/design-system';
import Link from 'next/link';
import { normalizeAuthError } from '@patina/supabase';
import { DesignerAuthShell } from '../auth-shell';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fields: AuthFormField[] = [
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'you@example.com',
      required: true,
      autoComplete: 'email',
    },
  ];

  const handleSubmit = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if we're in development mode
      const isDevelopment = process.env.NODE_ENV === 'development';
      const hasOIDC = !!(
        process.env.NEXT_PUBLIC_OIDC_ISSUER &&
        process.env.NEXT_PUBLIC_OIDC_CLIENT_ID
      );

      if (isDevelopment && !hasOIDC) {
        // Development mode - simulate password reset
        setSuccess(
          'Password reset email sent! Check your inbox for further instructions. (Development Mode)'
        );

        // Redirect to sign in page after 3 seconds
        setTimeout(() => {
          router.push('/auth/signin?reset=requested');
        }, 3000);
      } else {
        // Production mode - call password reset API
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to send reset email');
        }

        setSuccess('Password reset email sent! Check your inbox for further instructions.');

        // Redirect to sign in page after 3 seconds
        setTimeout(() => {
          router.push('/auth/signin?reset=requested');
        }, 3000);
      }
    } catch (err) {
      setError(normalizeAuthError(err, 'unknown').message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DesignerAuthShell>
      <div className="w-full">
      <div className="w-full max-w-md">
        <div className="border border-[#6d726b] bg-white p-6">
          <AuthForm
            title="Reset Your Password"
            description="Enter your email address and we'll send you a link to reset your password"
            fields={fields}
            submitText="Send Reset Link"
            isLoading={isLoading}
            error={error || undefined}
            success={success || undefined}
            onSubmit={handleSubmit}
            footer={
              <div className="space-y-2 text-center">
                <Link
                  href="/auth/signin"
                  className="block text-sm text-primary font-medium hover:underline"
                >
                  Back to Sign In
                </Link>
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link href="/auth/signup" className="text-primary hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>
            }
          />
        </div>

        {/* Help Text */}
        <div className="mt-6 border border-[#6d726b] bg-[#f3f0e8] p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Need immediate help?{' '}
            <Link href="/support" className="text-primary font-medium hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
      </div>
    </DesignerAuthShell>
  );
}
