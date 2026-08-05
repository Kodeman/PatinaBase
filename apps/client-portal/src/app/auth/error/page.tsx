'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalAuthNotice } from '@patina/design-system/PortalAuth';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Sign in is temporarily unavailable',
    description: 'Please try again in a moment or contact Patina support.',
  },
  AccessDenied: {
    title: 'This account cannot open the client portal',
    description:
      'Try another account or ask your designer to confirm your invitation.',
  },
  Verification: {
    title: 'That verification link has expired',
    description: 'Return to sign in to request a new code.',
  },
  Default: {
    title: 'Sign in didn’t finish',
    description: 'Return to sign in and try again.',
  },
};

function AuthErrorContent() {
  const errorType = useSearchParams().get('error') || 'Default';
  const error = ERROR_MESSAGES[errorType] ?? ERROR_MESSAGES.Default;

  return (
    <ClientAuthShell>
      <div className="space-y-5">
        <PortalAuthNotice tone="error" title={error.title}>
          {error.description}
        </PortalAuthNotice>
        <div className="flex flex-col items-start gap-2 text-sm">
          <a
            href="/auth/signin"
            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          >
            Try signing in again
          </a>
          <a
            href="/projects"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Go to your projects
          </a>
        </div>
      </div>
    </ClientAuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <p role="status">Loading…</p>
        </ClientAuthShell>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
