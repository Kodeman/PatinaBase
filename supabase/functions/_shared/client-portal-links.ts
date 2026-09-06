/**
 * Client-portal deep links, after the route retirement.
 *
 * The client portal's authenticated surface is one page per project — the
 * Threshold — and every old destination is a section of it. Mail, SMS and cron
 * links must therefore name a project and an anchor, not a route. This module
 * is the one place that shape is written, so a template never has to guess.
 *
 * `/` is a legitimate target: it resolves to the client's active project. Use
 * it whenever the producing row has no project to name.
 *
 * Two families of address deliberately do NOT come through here:
 *  - `/invoices/<id>`, `/proposals/<id>`, `/decisions/<id>` — claimed by the
 *    Patina iOS app's `applinks:` entitlement, so a client with the app
 *    installed opens the native screen. The portal's middleware 308s them onto
 *    the right anchor for everyone else. Keep sending those.
 *  - token surfaces (`/field/<t>`, `/rfq/<t>`, `/share/<t>`, `/plans/<t>`,
 *    `/evidence/<t>`, `/pay/<t>` (the invoice link, `_shared/invoice-links.ts`),
 *    `/auth/invite/<t>`, `/piece/<id>`, `/api/unsubscribe`) — untouched by the
 *    retirement.
 */

/** The Threshold section ids an old route can land on. */
export type ThresholdAnchor =
  | "doorstep"
  | "door"
  | "letterbox"
  | "ledger"
  | "mat-papers"
  | "road"
  | "note"
  | "mat"
  /**
   * One standing ask, by its decision id — the element id the doorstep's
   * `ApprovalAsk` already draws. An answered decision leaves the fragment
   * unresolved and the client lands at the top of the page, which is the
   * doorstep.
   */
  | `approval-${string}`;

/** Ids are interpolated into a link a stranger will click — refuse the odd ones. */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * An absolute link to a section of a client's project page.
 *
 * @param baseUrl   CLIENT_PORTAL_URL (trailing slash tolerated).
 * @param projectId The project the row belongs to, or null for "her active one".
 * @param anchor    The Threshold section.
 * @param params    Query params the section reads (e.g. `{ invoice: id }`).
 */
export function clientProjectLink(
  baseUrl: string,
  projectId: string | null | undefined,
  anchor: ThresholdAnchor,
  params: Record<string, string> = {},
): string {
  const origin = baseUrl.replace(/\/$/, "");
  const path = projectId && ID_SEGMENT.test(projectId)
    ? `/projects/${projectId}`
    : "/";
  const entries = Object.entries(params).filter(([, v]) => v !== "");
  const query = entries.length
    ? `?${
      entries
        .map(([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
        )
        .join("&")
    }`
    : "";
  // Fragment last: a URL's hash always follows its query, and the page reads
  // both — the params name the row, the anchor names the section.
  return `${origin}${path}${query}#${anchor}`;
}

/**
 * The same target as a `notification_log.metadata.deep_link` — portal-relative,
 * because the digest re-absolutizes it against CLIENT_PORTAL_URL.
 */
export function clientProjectDeepLink(
  projectId: string | null | undefined,
  anchor: ThresholdAnchor,
  params: Record<string, string> = {},
): string {
  return clientProjectLink("", projectId, anchor, params);
}

/**
 * The address of one approval, as mail must write it: `/decisions/<id>`.
 *
 * Deliberately NOT a Threshold anchor link. The iOS app claims `/decisions/*`
 * through its `applinks:` entitlement, so a homeowner with the app installed
 * opens the native approval; everyone else is 308'd by the portal middleware
 * onto `/?decision=<id>#approval-<id>` (`retired-routes.ts`), which is the same
 * section a hand-written anchor would have named — but anchors are declared
 * mutable and cached for an hour, and a Universal Link is not.
 *
 * The fold carries the id as a param as well as an anchor, and the front door
 * resolves the approval's own house from it, so a homeowner with two projects
 * is not put on the doorstep of the one that merely moved last.
 *
 * An id that is not a plain segment is refused rather than interpolated: the
 * caller gets the doorstep instead of a forged path.
 */
export function clientDecisionLink(
  baseUrl: string,
  decisionId: string | null | undefined,
): string {
  if (!decisionId || !ID_SEGMENT.test(decisionId)) {
    return clientProjectLink(baseUrl, null, "doorstep");
  }
  return `${baseUrl.replace(/\/$/, "")}/decisions/${decisionId}`;
}
