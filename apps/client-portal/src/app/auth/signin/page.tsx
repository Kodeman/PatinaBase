'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClientPortalLogin } from '@/components/auth/ClientPortalLogin';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';

function SignInContent() {
  const searchParams = useSearchParams();
  return (
    <ClientPortalLogin
      callbackUrl={searchParams.get('callbackUrl')}
      initialError={searchParams.get('error')}
    />
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <ClientAuthShell>
          <p role="status">Preparing sign in…</p>
        </ClientAuthShell>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
