'use client';

/**
 * People on the Desk (R53 / Track D) — the quiet reconnect surface.
 *
 * A dormant high-trust tie is a need, but the softest kind: the act is "reach
 * out", not "pick up a document". So it is a SEPARATE Desk population, derived
 * over the unified directory (people_directory) rather than document_state —
 * the engagement folders + in-motion chips (partitionDesk) are never touched.
 *
 * The strongest few "reconnect now" ties from the People Room's own nurture
 * queue (deriveNurtureQueue → deriveReconnectNeeds) surface here, below the
 * in-motion chips, each linking into the People Room (/people), where its Engine
 * nudge + the Nurture view carry the full ranked list and the reach-out act.
 * (Deep-linking straight to the Nurture view is a follow-up: people-room.tsx —
 * Track A's, frozen — does not yet read a `?view=` param.)
 *
 * Zero shadows (D4); quiet Aged Oak ink on the light Desk, never a
 * card-in-a-card.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePeopleDirectory } from '@patina/supabase';
import { deriveNurtureQueue } from '@/lib/document/people-derivation';
import { deriveReconnectNeeds } from '@/lib/document/desk-derivation';
import { SectionEyebrow } from '@/components/document/section-eyebrow';

export function DeskReconnect() {
  // R53: the reconnect surface reads the whole directory once (per-designer,
  // small) and ranks it with the People Room's nurture queue — single-source
  // ranking. Never fails the Desk: while loading or empty, it renders nothing.
  const { data } = usePeopleDirectory({ role: 'all' });
  const now = useMemo(() => new Date(), []);

  const reconnects = useMemo(() => {
    if (!data) return [];
    return deriveReconnectNeeds(deriveNurtureQueue(data, now), now);
  }, [data, now]);

  if (reconnects.length === 0) return null;

  return (
    <section aria-labelledby="reconnect" className="mt-14">
      <SectionEyebrow count={reconnects.length}>
        <span id="reconnect">Worth reconnecting</span>
      </SectionEyebrow>
      <ul className="space-y-2">
        {reconnects.map((r) => (
          <li key={`${r.role}:${r.personId}`}>
            <Link
              href="/people"
              data-reconnect-role={r.role}
              className="group flex items-baseline gap-2 text-[13px] leading-snug text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]"
            >
              <span className="font-heading italic text-[var(--text-primary)]">{r.name}</span>
              <span aria-hidden className="text-[var(--text-subtle)]">
                —
              </span>
              <span>{r.reason}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
