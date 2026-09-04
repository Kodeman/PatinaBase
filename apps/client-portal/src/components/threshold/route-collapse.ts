/**
 * The Threshold folds the eight old top-level destinations (the seven
 * `nav-config.ts` routes plus the `/messages` corner link) plus `/projects`
 * — where sign-in lands every client (`CLIENT_AUTH_DESTINATION`) — into
 * anchors on the one project page. `ROUTE_COLLAPSE` names the anchor each
 * old route lands on; `collapsedHref` turns an exact match into the in-page
 * href.
 *
 * Matching is exact-match only (a trailing slash is stripped first) — a
 * nested route under one of these prefixes (`/proposals/abc/sign`,
 * `/decisions/req-1`, and crucially the collapse destination
 * `/projects/<id>` itself) keeps its own page and is never collapsed.
 */

/**
 * The fixed set of Threshold section ids these old routes can collapse to —
 * a cross-lane contract: Lane 3's leaf components must put one of these ids
 * on the matching section root.
 */
export type ThresholdAnchor =
  | 'doorstep'
  | 'door'
  | 'letterbox'
  | 'ledger'
  | 'mat-papers'
  | 'road'
  | 'note';

export const ROUTE_COLLAPSE: Record<string, ThresholdAnchor> = {
  '/today': 'doorstep',
  '/decisions': 'doorstep',
  '/proposals': 'door',
  '/invoices': 'letterbox',
  '/budget': 'ledger',
  '/documents': 'mat-papers',
  '/orders': 'road',
  '/messages': 'note',
  '/projects': 'doorstep',
};

export function collapsedHref(pathname: string, projectId: string): string | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const anchor = ROUTE_COLLAPSE[normalized];
  return anchor ? `/projects/${projectId}#${anchor}` : null;
}
