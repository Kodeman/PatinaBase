'use client';

interface ThresholdChromeGateProps {
  pathname: string;
  children: React.ReactNode;
}

/** `/` and a bare `/projects/[id]` — the two routes that render the house. */
const HOUSE_ROUTES = /^\/$|^\/projects\/[^/]+$/;

/**
 * Drops the global header on the two routes that render the Threshold. The
 * house is a chrome-less page: it carries its own way to the client's
 * details, its own way out, and — for a client with more than one project —
 * its own way to her other houses, so nothing above it is load-bearing.
 *
 * Every other route still gets the header, which is what keeps a nested page
 * (`/projects/[id]/scope-change/req-1`, `/account`) navigable.
 */
export function ThresholdChromeGate({ pathname, children }: ThresholdChromeGateProps) {
  if (HOUSE_ROUTES.test(pathname)) {
    return null;
  }

  return <>{children}</>;
}
