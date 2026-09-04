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
 *  - Carry the entity id as a query param when the Threshold reads one:
 *    `?invoice=` (the letterbox's contract, shared with
 *    `create-checkout-session` and read by `Letterbox`), `?review=` (the
 *    selection edition the doorstep's ask opens on) and `?proposal=`;
 *    `?order=` already rides the original query.
 *  - `?invoice=` and `?proposal=` also decide WHICH house `/` opens: the
 *    front door resolves the instrument's own project before it falls back to
 *    the house that moved last (`lib/data/active-project.ts`), so mail about
 *    money or a signature cannot land in another house's room.
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

    // `/proposals/<id>` and `/proposals/<id>/sign` — signing happens at the
    // door. `?proposal=` names WHICH house's door: `/` on its own opens the
    // house that moved last, which for a multi-house client is the wrong one.
    case 'proposals': {
      const named =
        segments.length === 2 ||
        (segments.length === 3 && third === 'sign');
      if (!named) return null;
      return {
        path: '/',
        anchor: 'door',
        ...(ID_SEGMENT.test(second) ? { params: { proposal: second } } : {}),
      };
    }

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

    // `/projects/<id>/reviews[/<editionId>]` and
    // `/projects/<id>/scope-change/*` — the only old URLs that carried a
    // project id, so they are the only ones that keep their house.
    case 'projects': {
      // `/projects/<id>/scope-change[/new|/<changeId>]` — asking for and
      // reading a change of scope both happen on the doorstep now. Mapped
      // ahead of R2's deletion of those trees so the old addresses fold rather
      // than 404 the moment the pages go.
      if (segments.length >= 3 && third === 'scope-change') {
        return {
          path: ID_SEGMENT.test(second) ? `/projects/${second}` : '/',
          anchor: 'doorstep',
        };
      }
      if (segments.length < 3 || third !== 'reviews') return null;
      const projectPath = ID_SEGMENT.test(second) ? `/projects/${second}` : '/';
      // `/projects/<id>/reviews/<editionId>` — the edition id is the whole
      // point of the link: `project_review_editions` is studio-only by RLS, so
      // the emailed address is the ONLY way a client ever reaches an edition,
      // and `SelectionEditionAsk` reads it off `?review=`. Dropping it here
      // would land the mail on a doorstep that cannot show what it was sent
      // about.
      const editionId = segments[3];
      return {
        path: projectPath,
        anchor: 'doorstep',
        ...(segments.length === 4 && editionId && ID_SEGMENT.test(editionId)
          ? { params: { review: editionId } }
          : {}),
      };
    }

    default:
      return null;
  }
}
