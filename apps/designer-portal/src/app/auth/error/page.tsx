'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ShieldAlert, Lock } from 'lucide-react';
import { Button } from '@patina/design-system';

const ERROR_CONFIGS: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please contact your system administrator.',
    icon: <AlertCircle className="h-12 w-12 text-red-500" />,
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have the required permissions to access this resource. Please contact your administrator if you believe this is an error.',
    icon: <Lock className="h-12 w-12 text-red-500" />,
  },
  InsufficientPermissions: {
    title: 'Insufficient Permissions',
    description: 'You do not have the required permissions to access this resource.',
    icon: <ShieldAlert className="h-12 w-12 text-amber-500" />,
  },
  Verification: {
    title: 'Verification Required',
    description: 'Your account needs to be verified before you can access the designer portal.',
    icon: <AlertCircle className="h-12 w-12 text-blue-500" />,
  },
  SessionExpired: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
    icon: <AlertCircle className="h-12 w-12 text-amber-500" />,
  },
  Default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try signing in again.',
    icon: <AlertCircle className="h-12 w-12 text-red-500" />,
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const errorConfig = ERROR_CONFIGS[error] || ERROR_CONFIGS.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="rounded-lg bg-white p-8 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
              {errorConfig.icon}
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">
              {errorConfig.title}
            </h1>
            <p className="mt-4 text-sm text-gray-600">
              {errorConfig.description}
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <Link href="/auth/signin" className="block">
              <Button className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </Link>

            {error === 'InsufficientPermissions' && (
              <Link href="/projects" className="block">
                <Button variant="outline" className="w-full" size="lg">
                  Go to Projects
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-blue-100 p-4 text-center">
          <p className="text-sm text-blue-800">
            Need help?{' '}
            <a href="mailto:support@patina.com" className="font-medium underline hover:text-blue-600">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
