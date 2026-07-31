'use client';

/**
 * In-motion line (spec §7, Desk light restyle): one quiet line for an
 * engagement progressing without the designer. Carries state, never
 * urgency-outlined (R22). A Golden Hour dot + the name in Playfair + the
 * Aged Oak detail — low-emphasis, never a chip-in-a-card. Tappable: it opens
 * the document (R22: the awareness tier is still a document), but never claims
 * "needs your hand."
 *
 * R106 §4 (the Arrival Arc): a chip may now carry its own `href` (the
 * discovery-scheduled/stale-slots states deep-link into the fold; the nudge
 * opens the thread) — defaults to the document when absent, so every pre-arc
 * chip is untouched. The `intro_nudge` state gets a "warmed" presentation:
 * the dot is already Golden Hour for every chip (the component's one existing
 * emphasis idiom), so warmth here is typographic only — the text steps up
 * from muted to body ink, zero new visual idiom.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import type { MotionChip } from '@/lib/document/desk-derivation';
import { documentEvents } from '@/lib/analytics/document-events';

export function InMotionChip({ chip }: { chip: MotionChip }) {
  const href = chip.href ?? `/doc/${chip.row.engagement_id}`;
  const warmed = chip.kind === 'intro_nudge';

  // R106 §5 (telemetry): fire once per ceremony per session, on first render
  // of the respective chip state — the dedup itself lives in
  // documentEvents (a module-level Set keyed by ceremony id), so a re-render
  // (the Desk's 60s re-sort) never double-fires.
  useEffect(() => {
    if (!chip.ceremonyId) return;
    if (chip.kind === 'intro_nudge') {
      documentEvents.nudgeFired({
        ceremony_id: chip.ceremonyId,
        lead_id: chip.row.lead_id,
      });
    } else if (chip.kind === 'slots_stale') {
      documentEvents.freshTimesRequested({
        ceremony_id: chip.ceremonyId,
        lead_id: chip.row.lead_id,
      });
    }
  }, [chip.ceremonyId, chip.kind, chip.row.lead_id]);

  return (
    <li>
      <Link
        href={href}
        // R45: `kind` is an optional style/telemetry hook. Default treatment is
        // kind-agnostic; the data attribute lets CSS or analytics key off it
        // without re-deriving from the (translatable) text.
        data-motion-kind={chip.kind}
        className="doc-type-body group flex min-h-11 items-center gap-2 transition-colors hover:text-[var(--text-primary)] motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full bg-[var(--color-golden-hour)]"
        />
        <span className="font-heading text-[16px] text-[var(--text-primary)]">
          {chip.row.title}
        </span>
        <span aria-hidden className="text-[var(--text-subtle)]">
          —
        </span>
        <span
          className={warmed ? 'font-medium text-[var(--text-body)]' : undefined}
        >
          {chip.text}
        </span>
      </Link>
    </li>
  );
}
