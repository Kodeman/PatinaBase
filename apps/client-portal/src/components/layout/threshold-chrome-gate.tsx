'use client';

import { useFeatureFlag } from '@/hooks/use-feature-flag';

interface ThresholdChromeGateProps {
  pathname: string;
  children: React.ReactNode;
}

const BARE_PROJECT_ROUTE = /^\/projects\/[^/]+$/;

/**
 * Drops the global header on a bare `/projects/[id]` route once the
 * `threshold` flag has resolved true — The Threshold is a chrome-less page.
 * Every other route, and the loading state itself, renders `children` (the
 * header) unchanged: fail-closed means the header stays up while the flag is
 * in flight, never the reverse.
 */
export function ThresholdChromeGate({ pathname, children }: ThresholdChromeGateProps) {
  const { value, isLoading } = useFeatureFlag('threshold');

  if (!isLoading && value && BARE_PROJECT_ROUTE.test(pathname)) {
    return null;
  }

  return <>{children}</>;
}
