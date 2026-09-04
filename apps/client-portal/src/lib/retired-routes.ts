/**
 * The old client portal's route tree, folded onto the one project page.
 *
 * Every authenticated destination the portal used to have is now a section of
 * the Threshold. This module is the single map from an old path to the anchor
 * it lands on; `middleware.ts` turns a match into a 308 so mail, SMS, cron and
 * Universal Links that were sent months ago still arrive at the right place.
 *
 * 308 (not 307/302) on purpose: these paths are gone for good, and a permanent
 * redirect lets the browser and any intermediary stop asking.
 *
 * Two rules the map obeys:
 *  - Carry the project id when the old URL had one; otherwise target `/`, which
 *    resolves to the client's active project.
 *  - Carry the entity id as a query param when the Threshold reads one. Only
 *    `invoice` does today (the letterbox's `?invoice=` contract, shared with
 *    `create-checkout-session`); `?order=` already rides the original query.
 */

export type ThresholdAnchor =
  | 'doorstep'
  | 'door'
  | 'letterbox'
  | 'ledger'
  | 'mat-papers'
  | 'road'
  | 'note'
  | 'mat';

export interface RetiredRouteTarget {
  /** `/` (the active project) or `/projects/<id>`. */
  path: string;
  /** The Threshold section id, without the `#`. `null` for `/projects` → `/`. */
  anchor: ThresholdAnchor | null;
  /** Extra query params to merge onto the original ones. */
  params?: Record<string, string>;
}

/** Exact-match old top-level routes. */
const EXACT: Record<string, ThresholdAnchor | null> = {
  '/today': 'doorstep',
  '/decisions': 'doorstep',
  '/reviews': 'doorstep',
  '/scans': 'doorstep',
  '/proposals': 'door',
  '/invoices': 'letterbox',
  '/budget': 'ledger',
  '/documents': 'mat-papers',
  '/orders': 'road',
  '/messages': 'note',
  '/inbox': 'note',
  '/account': 'mat',
  '/preferences': 'mat',
  '/projects': null,
};

/**
 * Ids reach this map straight off the request path. Anything that is not a
 * plain id segment is refused rather than interpolated into a Location header.
 */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * The old path → where it lands now, or `null` when the path is still served.
 *
 * Not mapped on purpose:
 *  - `/preferences/unsubscribe` — a public outcome page, kept (and made public
 *    in the middleware, which used to bounce signed-out recipients to sign-in).
 *  - `/invoices/<id>/print` — the printable invoice has no in-page equivalent.
 */
export function retiredRouteTarget(pathname: string): RetiredRouteTarget | null {
  const path = stripTrailingSlash(pathname);

  if (path in EXACT) {
    return { path: '/', anchor: EXACT[path] };
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const [head, second, third] = segments;

  switch (head) {
    // `/decisions/<id>` — the decision is answered on the doorstep.
    case 'decisions':
      return segments.length === 2 ? { path: '/', anchor: 'doorstep' } : null;

    // `/proposals/<id>` and `/proposals/<id>/sign` — signing happens at the door.
    case 'proposals':
      if (segments.length === 2) return { path: '/', anchor: 'door' };
      if (segments.length === 3 && third === 'sign') {
        return { path: '/', anchor: 'door' };
      }
      return null;

    // `/invoices/<id>` — the letterbox reads `?invoice=` to name which one.
    // `/invoices/<id>/print` keeps its own page.
    case 'invoices':
      if (segments.length !== 2) return null;
      return {
        path: '/',
        anchor: 'letterbox',
        ...(ID_SEGMENT.test(second) ? { params: { invoice: second } } : {}),
      };

    // `/messages/<threadId>` never had a page; the note is where the studio's
    // words live now.
    case 'messages':
      return { path: '/', anchor: 'note' };

    // `/scans/<scanId>`: a scan id is not a room id, so there is nothing to
    // resolve `#room-<roomId>` from without a round trip. The doorstep is the
    // agreed fallback.
    case 'scans':
      return { path: '/', anchor: 'doorstep' };

    // `/settings/notifications` and anything else under it.
    case 'settings':
      return { path: '/', anchor: 'mat' };

    // `/preferences/unsubscribe` stays; nothing else under /preferences does.
    case 'preferences':
      return second === 'unsubscribe' ? null : { path: '/', anchor: 'mat' };

    // `/projects/<id>/reviews[/<editionId>]` — the only old URLs that carried
    // a project id, so they are the only ones that keep their house.
    case 'projects': {
      if (segments.length < 3 || third !== 'reviews') return null;
      const projectPath = ID_SEGMENT.test(second) ? `/projects/${second}` : '/';
      return { path: projectPath, anchor: 'doorstep' };
    }

    default:
      return null;
  }
}
