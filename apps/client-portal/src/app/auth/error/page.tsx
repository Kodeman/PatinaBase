'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@patina/design-system';

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please contact support.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
  },
  Verification: {
    title: 'Verification Error',
    description: 'The verification link is invalid or has expired.',
  },
  Default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try again.',
  },
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const errorType = searchParams.get('error') || 'Default';

  const errorInfo = errorMessages[errorType] || errorMessages.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="font-[var(--font-playfair)] text-3xl text-[var(--color-text)]">
            {errorInfo.title}
          </h1>
          <p className="text-lg text-[var(--color-muted)]">
            {errorInfo.description}
          </p>
        </div>

        {errorType !== 'Default' && (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium">Error Type</p>
            <p className="mt-1 font-mono text-xs">{errorType}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/auth/signin">
            <Button variant="default" size="lg">
              Try signing in again
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" size="lg">
              Go home
            </Button>
          </Link>
        </div>

        <div className="text-sm text-[var(--color-muted)]">
          <p>
            Need help?{' '}
            <a
              href="mailto:support@patina.cloud"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
