'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. Two populations, nothing
 * else: the needs-your-hand stack (actionable engagements, one need line
 * each) and the in-motion chips (quiet, capped, never a feed). No metric
 * tiles, no badges, no dashboard furniture.
 */

import { useEffect, useState } from 'react';
import { useProfile } from '@patina/supabase';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { firstNameOf } from '@/lib/document/account-identity';
import { openCommandBar, captureLeadPending } from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { FolderCard } from '@/components/document/folder-card';
import { InMotionChip } from '@/components/document/in-motion-chip';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { DeskReconnect } from '@/components/document/desk-reconnect';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';

export default function DeskPage() {
  const { data, isLoading, isError } = useDeskEngagements();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const hydrated = useHydrated();
  const [captureOpen, setCaptureOpen] = useState(false);

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

  // ⌘K's "Capture a lead" action dispatches this — open the sheet from there
  // too, so the front door is reachable by command as well as by the CTA. When
  // the command was run from another surface, the event fired before this
  // listener existed; the pending flag carries the intent across the route.
  useEffect(() => {
    if (captureLeadPending.value) {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    }
    const onOpen = () => {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    };
    window.addEventListener('document:open-capture-lead', onOpen);
    return () => window.removeEventListener('document:open-capture-lead', onOpen);
  }, []);

  // Time-derived greeting + date are client-only — server vs client timezone
  // would otherwise mismatch on hydration. useHydrated keeps SSR and the first
  // client render identical ('Hello' / blank date), then fills in after mount.
  const now = new Date();
  const greetingWord = !hydrated
    ? 'Hello'
    : now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  const dateLabel = hydrated
    ? `${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now)} · ${new Intl.DateTimeFormat(
        'en-US',
        { month: 'long', day: 'numeric' },
      ).format(now)}`.toUpperCase()
    : '';
  const name = profile?.display_name || profile?.full_name || user?.name || null;
  const firstName = firstNameOf(name);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14">
      <header className="mb-12 flex items-baseline justify-between gap-4">
        <div>
          {/* The signature move: greeting in Playfair, the first name in
              Playfair italic, Aged Oak. Kept modest so the folios lead. */}
          <h1 className="font-heading text-[1.7rem] font-normal text-[var(--text-primary)]">
            {greetingWord}, <span className="italic text-[var(--text-muted)]">{firstName}</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-muted)]">
            {dateLabel || ' '}
          </p>
        </div>
        <div className="flex items-baseline gap-5">
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ＋ Capture a lead
          </button>
          <button
            type="button"
            onClick={openCommandBar}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Find anything{' '}
            <kbd className="rounded-[3px] border border-[var(--border-default)] px-1 py-px font-mono">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      <section aria-labelledby="needs-your-hand">
        <SectionEyebrow count={data?.folders.length}>
          <span id="needs-your-hand">Needs your hand</span>
        </SectionEyebrow>

        {isLoading && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2" aria-hidden>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="mt-[26px] h-32 rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--bg-surface)]"
              />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-[13px] text-[var(--text-body)]">
            The desk could not be read. Refresh, or check your connection.
          </p>
        )}

        {data && data.folders.length === 0 && (
          <p className="font-heading text-[15px] italic text-[var(--text-muted)]">
            Nothing needs your hand. The work is in motion.
          </p>
        )}

        {data && data.folders.length > 0 && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
            {data.folders.map((folder) => (
              <FolderCard key={folder.row.engagement_id} folder={folder} />
            ))}
          </div>
        )}
      </section>

      {data && data.chips.length > 0 && (
        <section aria-labelledby="in-motion" className="mt-14">
          <SectionEyebrow count={data.chips.length}>
            <span id="in-motion">In motion</span>
          </SectionEyebrow>
          <ul className="space-y-2.5">
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

      {/* The capture front door (G1 · R62) — an overlay over the Desk, never a
          route; the Desk beneath does not unmount (D1). */}
      <CaptureLeadSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </main>
  );
}
