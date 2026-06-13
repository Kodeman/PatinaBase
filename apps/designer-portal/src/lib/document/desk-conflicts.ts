/**
 * Desk conflict inputs (R28 / R22): the calendar's intelligence, promoted.
 *
 * Maps the delivery-conflict classifier's output onto the Desk's two tiers
 * per the R22 action test:
 *   COLLISION TIER (needs-your-hand folder) — an act exists today:
 *     · install collision (cross-project, same week) — she can't be in two
 *       homes at once: "Two installs collide — week of Jul 13"
 *     · late arrival (delivery lands after the install) — escalate or push
 *   DRIFT TIER (in-motion chip) — state carried, never a nag:
 *     · drift (delivery inside the 14-day staging buffer)
 *     · overlap (two deliveries within 7 days — a tight rotation, not a crisis)
 *
 * Pure presentation logic; classification itself lives in
 * lib/procurement/delivery-conflicts.ts (the Wave 2.1 client-side decision).
 */

import type { DeliveryEvent } from '@patina/supabase';
import {
  detectDeliveryConflicts,
  detectInstallCollisions,
  type DeliveryConflict,
} from '@/lib/procurement/delivery-conflicts';

export interface DeskConflictInput {
  /** Collision tier — becomes the folder's need line when it ranks. */
  collision: { text: string; label: string; date: string | null } | null;
  /** Drift tier — one quiet chip line. */
  drift: string | null;
}

const fmtDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const daysBetween = (a: string, b: string): number =>
  Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

function driftChip(c: DeliveryConflict): string {
  // eventA = install milestone, eventB = nearest delivery.
  const gap =
    c.eventA.event_date && c.eventB.event_date
      ? daysBetween(c.eventA.event_date, c.eventB.event_date)
      : null;
  return gap !== null ? `delivery ${gap}d before install` : 'delivery tight to install';
}

function overlapChip(c: DeliveryConflict): string {
  const gap =
    c.eventA.event_date && c.eventB.event_date
      ? daysBetween(c.eventA.event_date, c.eventB.event_date)
      : null;
  return gap !== null ? `two deliveries within ${gap}d` : 'two deliveries close together';
}

/** Per-project Desk inputs from one delivery_events feed. */
export function buildDeskConflicts(
  events: DeliveryEvent[],
): Map<string, DeskConflictInput> {
  const map = new Map<string, DeskConflictInput>();
  const ensure = (projectId: string): DeskConflictInput => {
    let input = map.get(projectId);
    if (!input) {
      input = { collision: null, drift: null };
      map.set(projectId, input);
    }
    return input;
  };

  // Cross-project install collisions outrank everything in the tier.
  for (const col of detectInstallCollisions(events)) {
    for (const projectId of col.projectIds) {
      const input = ensure(projectId);
      if (!input.collision) {
        input.collision = { text: col.message, label: 'COLLISION', date: col.weekOf };
      }
    }
  }

  for (const c of detectDeliveryConflicts(events)) {
    const input = ensure(c.projectId);
    if (c.type === 'late_arrival' && !input.collision) {
      const vendor = c.eventB.vendor_name ?? 'A delivery';
      const when = c.eventB.event_date ? ` ~${fmtDay(c.eventB.event_date)}` : '';
      input.collision = {
        text: `${vendor} lands after the install${when}`,
        label: 'LATE',
        date: c.eventB.event_date,
      };
    } else if (c.type === 'drift' && !input.drift) {
      input.drift = driftChip(c);
    } else if (c.type === 'overlap' && !input.drift) {
      input.drift = overlapChip(c);
    }
  }

  return map;
}
