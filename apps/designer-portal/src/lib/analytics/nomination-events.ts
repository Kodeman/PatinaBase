/**
 * Nomination event taxonomy aligned with the engineering handoff §10.4.
 *
 *   nominate.modal.opened       (vendorId, signalStrength)
 *   nominate.modal.submitted    (vendorId, fitSignalsCount, hasNote)
 *   nominate.modal.cancelled    (vendorId, atStep)
 *   nominate.status_changed     (nominationId, fromStatus, toStatus)
 *   nominate.timeline.viewed    (nominationId, currentStatus)
 *   nominate.renominated        (vendorId, monthsSincePriorDecline)
 *
 * status_changed is intended to be emitted server-side eventually (the
 * trigger in migration 00158 has all the info), but for v1 we fire it
 * from the admin tool that drives transitions. Both paths are valid
 * sources — PostHog can dedupe by (nominationId, toStatus) when needed.
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const nominationEvents = {
  modalOpened: (properties: { vendorId: string; signalStrength: 'weak' | 'moderate' | 'strong' }) =>
    track('nominate.modal.opened', properties),

  modalSubmitted: (properties: {
    vendorId: string;
    fitSignalsCount: number;
    hasNote: boolean;
  }) => track('nominate.modal.submitted', properties),

  modalCancelled: (properties: {
    vendorId: string;
    atStep: 'pre_submit' | 'post_submit_timeline';
  }) => track('nominate.modal.cancelled', properties),

  statusChanged: (properties: {
    nominationId: string;
    fromStatus: string;
    toStatus: string;
  }) => track('nominate.status_changed', properties),

  timelineViewed: (properties: { nominationId: string; currentStatus: string }) =>
    track('nominate.timeline.viewed', properties),

  renominated: (properties: { vendorId: string; monthsSincePriorDecline: number }) =>
    track('nominate.renominated', properties),
};
