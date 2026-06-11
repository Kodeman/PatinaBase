'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

/**
 * Pilot gate for all Document surfaces (spec v1.1 §12.1 / DECISIONS I1).
 * Fail-closed: renders nothing while the flag resolves, redirects to the
 * old portal when it resolves off. Old zones are untouched (D7).
 */
export function DocumentGate({ children }: { children: React.ReactNode }) {
  const { value: enabled, isLoading } = useFeatureFlag('the-document-pilot');
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !enabled) router.replace('/portal');
  }, [isLoading, enabled, router]);

  if (!enabled) return null;
  return <>{children}</>;
}
