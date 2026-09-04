'use client';

import { useFeatureFlag } from '@/hooks/use-feature-flag';

interface ThresholdChromeGateProps {
  pathname: string;
  /** Every project this client can open — the count, not the list. */
  projectCount: number;
  children: React.ReactNode;
}

const BARE_PROJECT_ROUTE = /^\/projects\/[^/]+$/;

/**
 * Drops the global header on a bare `/projects/[id]` route once the
 * `threshold` flag has resolved true — The Threshold is a chrome-less page.
 * Every other route, the loading state, and a multi-project client all
 * render `children` (the header) unchanged: fail-closed means the header
 * stays up while the flag is in flight, never the reverse, and a client with
 * two or more projects keeps the only project switcher there is — the
 * Threshold is one project's story, not a way back to the list.
 */
export function ThresholdChromeGate({
  pathname,
  projectCount,
  children,
}: ThresholdChromeGateProps) {
  const { value, isLoading } = useFeatureFlag('threshold');

  if (!isLoading && value && projectCount === 1 && BARE_PROJECT_ROUTE.test(pathname)) {
    return null;
  }

  return <>{children}</>;
}
