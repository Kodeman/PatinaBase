'use client';

interface ThresholdChromeGateProps {
  pathname: string;
  /** Whether this client has a house at all. */
  hasHouse: boolean;
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
 * A client with NO house is the exception. `/` renders her the empty state,
 * which has no mat under it, so dropping the header there would leave her a
 * page with no sign-out, no `/account` and no way anywhere — the exact trap
 * `mat.tsx` names as the reason "Leave the house" is mandatory.
 *
 * Every other route still gets the header, which is what keeps a nested page
 * (`/projects/[id]/scope-change/req-1`, `/account`) navigable.
 */
export function ThresholdChromeGate({
  pathname,
  hasHouse,
  children,
}: ThresholdChromeGateProps) {
  if (hasHouse && HOUSE_ROUTES.test(pathname)) {
    return null;
  }

  return <>{children}</>;
}
