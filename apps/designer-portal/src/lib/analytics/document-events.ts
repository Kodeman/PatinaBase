/**
 * The Document — flip & week-one telemetry (R21). These events are the
 * instrument for the dissolve criterion and the week-one watch:
 *   · zoneFlight        — a visit to an old zone after the flip, carrying
 *                         from-route + the last document in hand. Replaces
 *                         the twice-missed Q14: the flight triggers name
 *                         themselves as data. Ranks the dissolve backlog.
 *   · deskRendered      — the Desk's composition on load (folder/chip counts
 *                         + need-line kinds), so the week-one watch can read
 *                         sent-unacknowledged frequency and overall noise.
 *   · logStripActed     — strip engagement (log vs discard, adjusted, idle).
 *
 * No-ops when PostHog is not initialized (the track() guard).
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

const LAST_DOC_KEY = 'patina:last-document-in-hand';

/** Stash the held document so a later zone flight can name where they left. */
export function rememberDocumentInHand(engagementId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (engagementId) window.localStorage.setItem(LAST_DOC_KEY, engagementId);
  } catch {
    /* private mode / storage disabled — telemetry is best-effort */
  }
}

function lastDocumentInHand(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_DOC_KEY);
  } catch {
    return null;
  }
}

export const documentEvents = {
  /** An old-zone route visited after the flip (R21 flight telemetry). */
  zoneFlight: (fromRoute: string) =>
    track('document_zone_flight', {
      from_route: fromRoute,
      last_document_in_hand: lastDocumentInHand(),
    }),

  /** The Desk's composition on render — week-one noise + need-kind mix. */
  deskRendered: (props: {
    folder_count: number;
    chip_count: number;
    need_kinds: Record<string, number>;
  }) => track('document_desk_rendered', props),

  /** Log-strip engagement (R20/D10): logged or discarded, adjusted, idle. */
  logStripActed: (props: { action: 'log' | 'discard'; adjusted: boolean; had_idle: boolean }) =>
    track('document_log_strip_acted', props),
};
