/**
 * Procurement workspace event taxonomy (Wave 3.4 / dossier §6).
 *
 * Five core exposure events gate the pilot dashboard:
 *   - procurement_zone_visited          (sub_view, conflicts_shown?)
 *   - procurement_po_created            (payment_pattern, total_cents, is_patina_catalog, vendor_id?)
 *   - procurement_inspection_logged     (outcome, has_photos)
 *   - procurement_qbo_exported          (row_count?, date_start, date_end, include_paid, include_outstanding)
 *   - procurement_damage_claim_created  (outcome)
 *
 * Wired into portal-side consumers (Order Assistant, Log Inspection Drawer,
 * QBO Export Modal, etc.) so the @patina/supabase hooks stay framework-free.
 * Each helper is a no-op when PostHog is not initialized.
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const procurementEvents = {
  /**
   * Fired on every navigation into a /portal/procurement/* sub-route.
   * `sub_view` is the first path segment after /portal/procurement (by-vendor,
   * by-status, calendar, receiving). `conflicts_shown` is calendar-only.
   */
  zoneVisited: (properties: { sub_view?: string; conflicts_shown?: number }) =>
    track('procurement_zone_visited', properties),

  /** Fired when useCreatePurchaseOrder's mutation succeeds. */
  poCreated: (properties: {
    payment_pattern: string;
    total_cents: number;
    is_patina_catalog: boolean;
    vendor_id?: string;
    project_id?: string;
  }) => track('procurement_po_created', properties),

  /**
   * Fired when a designer attempts to order FF&E items that are blocked by a
   * pending `blocks_procurement` client decision (Decision Framework
   * PT-D-2-T3-1). The order control refuses and surfaces a deep link to the
   * decision; this event measures how often the integrity gate fires.
   */
  orderBlocked: (properties: {
    blocked_item_count: number;
    vendor_id?: string;
    project_id?: string;
    is_patina_catalog?: boolean;
  }) => track('procurement_order_blocked', properties),

  /** Fired when useCreateReceivingInspection succeeds. */
  inspectionLogged: (properties: {
    outcome: string;
    has_photos: boolean;
  }) => track('procurement_inspection_logged', properties),

  /** Fired when the QBO export edge function returns a CSV (HTTP 200). */
  qboExported: (properties: {
    date_start: string;
    date_end: string;
    include_paid: boolean;
    include_outstanding: boolean;
    row_count?: number;
  }) => track('procurement_qbo_exported', properties),

  /**
   * Fired when a damage claim is created — auto-drafted inside
   * useCreateReceivingInspection when outcome != 'clean'. The portal-side
   * consumer fires this from the same onSuccess that fires inspectionLogged.
   */
  damageClaimCreated: (properties: { outcome: string }) =>
    track('procurement_damage_claim_created', properties),

  /**
   * Fired when a designer applies a facet on Procurement → By Status (W1-T5).
   * `facet` is the facet key ('project' | 'payment'). Fires on apply (an
   * option toggled on), not on clear/reset.
   */
  byStatusFilterApplied: (properties: { facet: string }) =>
    track('procurement_by_status_filter_applied', properties),

  /**
   * Fired when a designer manually picks a stage on an FF&E item (board card
   * dropdown or item drawer, W1-T7). `is_override` is true when the stage had
   * been system-set by the 00184 PO-sync triggers (item linked to a PO,
   * sitting in a PO-driven stage) and the designer picked a different stage —
   * the manual pick holds until the next PO transition re-ratchets it.
   */
  statusAdvanced: (properties: { from: string; to: string; is_override: boolean }) =>
    track('procurement_status_advanced', properties),

  // ────────────────────────────────────────────────────────────────────────
  // Future events (documented but not yet wired — see
  // docs/follow-ups/procurement-pilot-metrics.md):
  //   - procurement_conflict_acknowledged
  // ────────────────────────────────────────────────────────────────────────
};
