'use client';

interface ThresholdChromeGateProps {
  pathname: string;
  children: React.ReactNode;
}

/** `/` and a bare `/projects/[id]` — the two routes that render the house. */
const HOUSE_ROUTES = /^\/$|^\/projects\/[^/]+$/;

/**
 * Drops the global header on the two routes that render the Threshold, for
 * any project count. The house is a chrome-less page: it carries its own way
 * to the client's details, its own way out, and — for a client with more than
 * one project — its own way to her other houses, so nothing above it is
 * load-bearing.
 *
 * A client with NO house gets the empty state on `/`, and the header is
 * dropped for her too: every destination it offers (`/today`, `/decisions`,
 * `/proposals`, `/invoices`, `/budget`, `/documents`, `/orders`, `/projects`,
 * `/messages`, `/scans`, `/reviews`, `/account`, `/settings/notifications`)
 * is now a retired route that 308s straight back to `/`, so leaving it up
 * gives her a ring of dead links rather than navigation.
 * `ProjectsEmptyState` carries the mat's two acts instead.
 *
 * Every other route still gets the header, which is what keeps a nested page
 * (`/invoices/[id]/print`, `/preferences/unsubscribe`) navigable.
 */
export function ThresholdChromeGate({
  pathname,
  children,
}: ThresholdChromeGateProps) {
  if (HOUSE_ROUTES.test(pathname)) {
    return null;
  }

  return <>{children}</>;
}
