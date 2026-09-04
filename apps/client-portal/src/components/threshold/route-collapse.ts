/**
 * The Threshold folds the eight old top-level destinations (the seven
 * `nav-config.ts` routes plus the `/messages` corner link) plus `/projects`
 * into anchors on the house. `ROUTE_COLLAPSE` names the anchor each old route
 * lands on; `collapsedHref` turns an exact match into the in-page href.
 *
 * Sign-in lands on `/` directly (`CLIENT_AUTH_DESTINATION`), so this now
 * catches only what is genuinely stale: a bookmark, a link in an old email.
 *
 * Where that href points depends on how many houses the client keeps. A solo
 * client goes to her one project page; a client with several goes to `/`,
 * which opens on whichever house moved last. A client with none is left
 * where she is — there is no house to land in.
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

export function collapsedHref(pathname: string, projectIds: string[]): string | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const anchor = ROUTE_COLLAPSE[normalized];
  if (!anchor) return null;

  if (projectIds.length === 0) return null;
  if (projectIds.length === 1) return `/projects/${projectIds[0]}#${anchor}`;
  return `/#${anchor}`;
}
