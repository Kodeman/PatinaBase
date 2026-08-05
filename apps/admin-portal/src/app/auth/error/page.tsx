'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PortalAuthNotice } from '@patina/design-system';
import { adminAuthDestination } from '@/lib/auth-navigation';
import { AdminAuthShell } from '../auth-shell';

const ERROR_DETAILS: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Patina Operations is not ready to sign in.',
    description:
      'Contact support@patina.com so we can check the portal configuration.',
  },
  AccessDenied: {
    title: 'This account cannot open Patina Operations.',
    description:
      'Administrator access is required. Contact support@patina.com if your role should be updated.',
  },
  InsufficientPermissions: {
    title: 'This work needs a different administrator role.',
    description:
      'Contact support@patina.com if you believe your permissions should be updated.',
  },
  Verification: {
    title: 'That verification link is no longer ready.',
    description: 'Return to sign in and request a new code.',
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') ?? '';
  const destination = adminAuthDestination(searchParams.get('callbackUrl'));
  const details = ERROR_DETAILS[error] ?? {
    title: 'Sign-in needs another try.',
    description:
      'Return to sign in, or contact support@patina.com if the problem continues.',
  };

  return (
    <AdminAuthShell>
      <div className="space-y-5">
        <PortalAuthNotice tone="error" title={details.title}>
          {details.description}
        </PortalAuthNotice>
        <Link
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          href={`/auth/signin?callbackUrl=${encodeURIComponent(destination)}`}
        >
          Return to sign in
        </Link>
      </div>
    </AdminAuthShell>
  );
}

export default function AdminAuthErrorPage() {
  return (
    <Suspense
      fallback={
        <AdminAuthShell>
          <PortalAuthNotice title="Opening sign-in help">
            Getting the page ready.
          </PortalAuthNotice>
        </AdminAuthShell>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
