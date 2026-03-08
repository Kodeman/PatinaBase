'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorDetails = () => {
    switch (error) {
      case 'Configuration':
        return {
          title: 'Configuration Error',
          description: 'There is a problem with the server configuration. Please contact the system administrator.',
        };
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          description: 'You do not have administrator permissions to access this portal.',
        };
      case 'Verification':
        return {
          title: 'Verification Failed',
          description: 'The verification token has expired or has already been used.',
        };
      default:
        return {
          title: 'Authentication Error',
          description: 'An error occurred during authentication. Please try again.',
        };
    }
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-lg bg-card p-8 shadow-lg border">
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 text-destructive mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{errorDetails.title}</h1>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-foreground">
            {errorDetails.description}
          </div>
          <div className="mt-6 space-y-2">
            <Link href="/auth/signin" className="block">
              <Button className="w-full" size="lg">Try Again</Button>
            </Link>
            {error === 'AccessDenied' && (
              <p className="text-center text-sm text-muted-foreground">
                If you believe you should have access, please contact your system administrator.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminAuthErrorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
