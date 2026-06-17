'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. Two populations, nothing
 * else: the needs-your-hand stack (actionable engagements, one need line
 * each) and the in-motion chips (quiet, capped, never a feed). No metric
 * tiles, no badges, no dashboard furniture.
 */

import { useEffect } from 'react';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { openCommandBar } from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { FolderCard } from '@/components/document/folder-card';
import { InMotionChip } from '@/components/document/in-motion-chip';
import { StrataMark } from '@/components/document/strata-mark';
import { DeskReconnect } from '@/components/document/desk-reconnect';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(250,247,242,0.35)]">
      <StrataMark state="active" size="sm" />
      {children}
    </h2>
  );
}

export default function DeskPage() {
  const { data, isLoading, isError } = useDeskEngagements();

  // R21 week-one watch: the Desk's composition on each load (folder/chip
  // counts + need-line kinds) so noise — esp. sent-unacknowledged frequency
  // at the 1d threshold — reads off telemetry, not observation.
  const deskSig = data
    ? `${data.folders.length}:${data.chips.length}:${data.folders.map((f) => f.need.kind).sort().join(',')}`
    : null;
  useEffect(() => {
    if (!data) return;
    const need_kinds: Record<string, number> = {};
    for (const f of data.folders) need_kinds[f.need.kind] = (need_kinds[f.need.kind] ?? 0) + 1;
    documentEvents.deskRendered({
      folder_count: data.folders.length,
      chip_count: data.chips.length,
      need_kinds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskSig]);

  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-28 pt-14">
      <header className="mb-12 flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-[1.65rem] italic text-[var(--color-pearl)]">{today}</h1>
        <button
          type="button"
          onClick={openCommandBar}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--doc-desk-ink)] hover:text-[var(--color-clay)]"
        >
          Find anything{' '}
          <kbd className="rounded-[3px] border border-[var(--doc-desk-ink)] px-1 py-px font-mono">
            ⌘K
          </kbd>
        </button>
      </header>

      <section aria-labelledby="needs-your-hand">
        <SectionLabel>
          <span id="needs-your-hand">Needs your hand</span>
        </SectionLabel>

        {isLoading && (
          <div className="space-y-5" aria-hidden>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-24 rounded-[3px_6px_6px_6px] border border-[rgba(250,247,242,0.08)] bg-[rgba(250,247,242,0.04)]"
              />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-[13px] text-[rgba(250,247,242,0.55)]">
            The desk could not be read. Refresh, or check your connection.
          </p>
        )}

        {data && data.folders.length === 0 && (
          <p className="font-heading text-[15px] italic text-[rgba(250,247,242,0.5)]">
            Nothing needs your hand. The work is in motion.
          </p>
        )}

        {data && data.folders.length > 0 && (
          <div className="grid grid-cols-1 gap-x-8 gap-y-7 xl:grid-cols-2">
            {data.folders.map((folder) => (
              <FolderCard key={folder.row.engagement_id} folder={folder} />
            ))}
          </div>
        )}
      </section>

      {data && data.chips.length > 0 && (
        <section aria-labelledby="in-motion" className="mt-14">
          <SectionLabel>
            <span id="in-motion">In motion</span>
          </SectionLabel>
          <ul className="flex flex-wrap gap-x-2 gap-y-2">
            {data.chips.map((chip) => (
              <InMotionChip key={chip.row.engagement_id} chip={chip} />
            ))}
          </ul>
        </section>
      )}

      {/* R53 — People on the Desk: the quiet reconnect surface. Its own
          population over the unified directory; renders nothing when no tie is
          due, so it never adds noise to a clean Desk. */}
      <DeskReconnect />
    </main>
  );
}
