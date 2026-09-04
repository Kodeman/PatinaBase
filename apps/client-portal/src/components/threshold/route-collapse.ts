/**
 * The Threshold folds the seven old top-level destinations into anchors on
 * the one project page. `ROUTE_COLLAPSE` names the anchor each old route
 * lands on; `collapsedHref` turns an exact match into the in-page href.
 *
 * Matching is exact-match only (a trailing slash is stripped first) — a
 * nested route under one of these prefixes (`/proposals/abc/sign`,
 * `/decisions/req-1`) keeps its own page and is never collapsed.
 */
export const ROUTE_COLLAPSE: Record<string, string> = {
  '/today': 'doorstep',
  '/decisions': 'doorstep',
  '/proposals': 'door',
  '/invoices': 'letterbox',
  '/budget': 'ledger',
  '/documents': 'mat-papers',
  '/orders': 'road',
  '/messages': 'note',
};

export function collapsedHref(pathname: string, projectId: string): string | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const anchor = ROUTE_COLLAPSE[normalized];
  return anchor ? `/projects/${projectId}#${anchor}` : null;
}
