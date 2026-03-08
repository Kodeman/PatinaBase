'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { AuthForm, type AuthFormField } from '@patina/design-system';
import Link from 'next/link';

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const supabase = createBrowserClient();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fields: AuthFormField[] = [
    {
      name: 'name',
      label: 'Full Name',
      type: 'text',
      placeholder: 'John Doe',
      required: true,
      autoComplete: 'name',
    },
    {
      name: 'company',
      label: 'Company/Studio Name',
      type: 'text',
      placeholder: 'Your Design Studio',
      required: true,
      autoComplete: 'organization',
    },
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'you@example.com',
      required: true,
      autoComplete: 'email',
    },
    {
      name: 'phone',
      label: 'Phone Number',
      type: 'tel',
      placeholder: '+1 (555) 000-0000',
      required: false,
      autoComplete: 'tel',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'Create a strong password',
      required: true,
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      label: 'Confirm Password',
      type: 'password',
      placeholder: 'Confirm your password',
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

      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            company: data.company,
            phone: data.phone,
          },
        },
      });

      if (authError) {
        throw new Error(authError.message || 'Registration failed');
      }

      setSuccess('Account created successfully! Please check your email to verify your account.');

      // Redirect to sign in page after 2 seconds
      setTimeout(() => {
        router.push('/auth/signin?registered=true');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <AuthForm
            title="Create Designer Account"
            description="Join Patina to start creating beautiful spaces"
            fields={fields}
            submitText="Create Account"
            isLoading={isLoading}
            error={error || undefined}
            success={success || undefined}
            onSubmit={handleSubmit}
            footer={
              <div className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">
                  By creating an account, you agree to our{' '}
                  <Link href="/terms" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link href="/auth/signin" className="text-primary font-medium hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            }
          />
        </div>

        {/* Development Mode Notice */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-center">
            <p className="text-xs text-yellow-800">
              <strong>Development Mode:</strong> Account will be created automatically
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SignUpLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
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
            <h1 className="text-2xl font-bold text-foreground">Create Designer Account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpLoadingFallback />}>
      <SignUpContent />
    </Suspense>
  );
}
