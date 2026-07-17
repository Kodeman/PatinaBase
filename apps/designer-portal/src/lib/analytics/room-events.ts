/**
 * Room View telemetry (Room View program, W3-T7; R107 §7 / I74c). Three
 * events instrument the room's two live projections (Plan + Orbit) and the
 * measure tool:
 *   - room_opened    — the Room View mounted. `source` is 'index' when
 *                      walked in from The Rooms roster (the generic
 *                      origin-stash door) or 'document' when arrived via a
 *                      Document scan door (`?from=document` — see
 *                      (document)/room/[id]/page.tsx's header). Fires ONCE
 *                      per mount (ref-guard) — a re-render, or the
 *                      `fromDocument` state resolving a beat later, must
 *                      never re-fire it.
 *   - mode_switched   — the Plan/Orbit mode-row was clicked (room-view.tsx's
 *                       `selectMode`). Walk is inert in v1 (aria-disabled)
 *                       and fires nothing.
 *   - measure_used    — the two-point measure tool completed a measurement
 *                       (use-measure's armed → point → complete path, the
 *                       SECOND point placed). Re-arming and completing again
 *                       fires again; a stray idle/complete-phase click does
 *                       not — the reducer treats it as a no-op, so there is
 *                       nothing to fire on.
 *
 * `room_id` is the family's carrier across every event, per I74c — true even
 * for the five events below, none of which are wired yet:
 *   - pin_created            (stage 2, reserved)
 *   - frame_saved            (reserved)
 *   - placement_started      (reserved)
 *   - clearance_flag_shown   (reserved)
 *   - clearance_overridden   (reserved)
 *
 * I74c (DECISIONS.md): "Telemetry names ship verbatim from the ruling
 * (`room_opened`, `mode_switched`, `measure_used` + 5 reserved) despite the
 * family-prefix convention preference [the `<family>_<verb>` shape
 * event-conventions.md asks new web events to follow] — names freeze on
 * ship, `room_id` is the family carrier." Do not rename these to a
 * `room_*`-prefixed shape to match the house convention — the ruling
 * overrides it for this family, and once shipped the names are locked
 * regardless (see docs/analytics/event-conventions.md § Naming is frozen
 * once shipped).
 *
 * No-ops when PostHog is not initialized (the track() guard) — mirrors
 * studio-events.ts / procurement-events.ts.
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const roomEvents = {
  /** Fired once per Room View mount (ref-guard at the call site,
   *  (document)/room/[id]/page.tsx). */
  roomOpened: (properties: { room_id: string; source: 'index' | 'document' }) =>
    track('room_opened', properties),

  /** Fired when the Plan/Orbit mode-row switches modes (room-view.tsx). */
  modeSwitched: (properties: { room_id: string; mode: 'plan' | 'orbit' }) =>
    track('mode_switched', properties),

  /** Fired when the two-point measure tool completes a measurement (the
   *  second point placed — armed/point → complete, use-measure.ts). */
  measureUsed: (properties: { room_id: string }) => track('measure_used', properties),
};
