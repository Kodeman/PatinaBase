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
 * Zero shadows (D4); the Desk's pearl-on-charcoal ink, never a card-in-a-card.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePeopleDirectory } from '@patina/supabase';
import { deriveNurtureQueue } from '@/lib/document/people-derivation';
import { deriveReconnectNeeds } from '@/lib/document/desk-derivation';
import { StrataMark } from '@/components/document/strata-mark';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(250,247,242,0.35)]">
      <StrataMark state="active" size="sm" />
      {children}
    </h2>
  );
}

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
      <SectionLabel>
        <span id="reconnect">Worth reconnecting</span>
      </SectionLabel>
      <ul className="space-y-2">
        {reconnects.map((r) => (
          <li key={`${r.role}:${r.personId}`}>
            <Link
              href="/people"
              data-reconnect-role={r.role}
              className="group flex items-baseline gap-2 text-[13px] leading-snug text-[rgba(250,247,242,0.55)] transition-colors hover:text-[var(--color-pearl)]"
            >
              <span className="font-heading italic text-[rgba(250,247,242,0.85)] group-hover:text-[var(--color-off-white)]">
                {r.name}
              </span>
              <span aria-hidden className="text-[rgba(250,247,242,0.3)]">
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
