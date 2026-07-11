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
import {
  openCommandBar,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { FolderCard } from '@/components/document/folder-card';
import { OpenRequestsStrip } from '@/components/document/open-requests-strip';
import { InMotionChip } from '@/components/document/in-motion-chip';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { DeskReconnect } from '@/components/document/desk-reconnect';
import { FieldDesk } from '@/components/document/field/field-desk';
import { DeskContents } from '@/components/document/desk-contents';
import { MarginNote } from '@/components/document/margin-note';
import {
  START_DESK_WALKTHROUGH_EVENT,
  useDeskWalkthroughOffer,
  useSuppressDeskFirstTouch,
} from '@/components/document/help/desk-walkthrough';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

export default function DeskPage() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.desk); // R89 — scope help to the Desk
  const { data, isLoading, isError } = useDeskEngagements();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const hydrated = useHydrated();
  const suppressFirstTouch = useSuppressDeskFirstTouch(); // R97 — hold the note during modal/tour
  const showWalkthroughOffer = useDeskWalkthroughOffer(); // R97 — existing-designer tour offer
  const [captureOpen, setCaptureOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);

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

  // R79 — same contract for ⌘K's "Open a project".
  useEffect(() => {
    if (openProjectPending.value) {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    }
    const onOpen = () => {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    };
    window.addEventListener('document:open-open-project', onOpen);
    return () => window.removeEventListener('document:open-open-project', onOpen);
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
  // The Desk greeting uses the real first name; with none resolved we greet
  // plainly ("Good morning.") rather than the old "Good morning, there".
  const firstName = name?.trim().split(/\s+/)[0] || null;

  // A quiet Desk (no folders, no chips) lets the Studio index rise to fill the
  // space — larger, and earlier in the composition — rather than sitting as
  // bottom front matter. Only known once the read resolves.
  const deskEmpty = !!data && data.folders.length === 0 && data.chips.length === 0;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14">
      <header className="mb-12 flex items-baseline justify-between gap-4">
        <div>
          {/* The signature move: greeting in Playfair, the first name in
              Playfair italic, Aged Oak. Kept modest so the folios lead. */}
          <h1 className="font-heading text-[1.7rem] font-normal text-[var(--text-primary)]">
            {firstName ? (
              <>
                {greetingWord},{' '}
                <span className="italic text-[var(--text-muted)]">{firstName}</span>
              </>
            ) : (
              <>{greetingWord}.</>
            )}
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-muted)]">
            {dateLabel || ' '}
          </p>
        </div>
        <div className="flex items-baseline gap-5">
          <button
            type="button"
            data-tour-anchor="desk-capture-lead"
            onClick={() => setCaptureOpen(true)}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ＋ Capture a lead
          </button>
          {/* R79 — the quiet secondary act beside capture: a project that
              skips the proposal (a repeat client, handshake work). */}
          <button
            type="button"
            onClick={() => setOpenProjectOpen(true)}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ＋ Open a project
          </button>
          <button
            type="button"
            data-tour-anchor="desk-find-anything"
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

      {/* R94 — the one first-touch note: what the Desk is, and the ⌘K move.
          Recedes forever on the first ⌘K open or the × (never a tour). R97 —
          held while the walkthrough modal/tour is on screen, and retired on tour
          completion (the tour teaches ⌘K itself). */}
      <MarginNote
        noteKey="desk-first-touch"
        commandBar
        suppressed={suppressFirstTouch}
        className="mb-10"
      >
        This is your Desk. Folders that need you gather here; the rest stays quiet.{' '}
        <span className="font-mono text-[12px] not-italic tracking-[0.02em] text-[var(--text-muted)]">
          ⌘K
        </span>{' '}
        finds anything by name — try “invoice”.
      </MarginNote>

      {/* R97 — existing designers (created before the ship date) get a quiet
          one-time offer instead of the auto-modal. The inline link starts the
          walkthrough; the note recedes on that same event (actionEvents) or the
          ×. The Desk Walkthrough gates eligibility; the primitive gates once-only. */}
      {showWalkthroughOffer && (
        <MarginNote
          noteKey="desk-walkthrough-offer"
          actionEvents={[START_DESK_WALKTHROUGH_EVENT]}
          className="mb-10"
        >
          New desk, same studio — your projects are all here as documents now.{' '}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(START_DESK_WALKTHROUGH_EVENT))}
            className="font-heading text-[15px] italic text-[var(--color-aged-oak)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            The walkthrough is six quick stops
          </button>{' '}
          if you&apos;d like the lay of it.
        </MarginNote>
      )}

      <section aria-labelledby="needs-your-hand" data-tour-anchor="desk-needs-your-hand">
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
          // R97 desk-folio anchor (empty-state placement) — exactly one of this
          // element and the first FolderCard exists post-load.
          <p
            data-tour-anchor="desk-folio"
            className="font-heading text-[15px] italic text-[var(--text-muted)]"
          >
            Nothing needs your hand. The work is in motion.
          </p>
        )}

        {data && data.folders.length > 0 && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
            {data.folders.map((folder, index) =>
              index === 0 ? (
                // R97 desk-folio anchor (first-folder placement) — a transparent
                // wrapper so the coachmark can point at the first real folder.
                <div key={folder.row.engagement_id} data-tour-anchor="desk-folio">
                  <FolderCard folder={folder} />
                </div>
              ) : (
                <FolderCard key={folder.row.engagement_id} folder={folder} />
              ),
            )}
          </div>
        )}
      </section>

      {/* Designer Handoff (Wave 1B) — the open request pool, between the
          needs-hand stack and in-motion. Its own population; renders nothing
          off-flag or when the pool is empty. */}
      <OpenRequestsStrip />

      {/* R95 — on a quiet Desk the Studio index rises here, at full weight, to
          fill the space the folders would occupy. */}
      {deskEmpty && <DeskContents prominent />}

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

      {/* Field Coordination — "In the field": needs-review text triage + the
          softer field need-lines (opt-ins owed, field tasks overdue). Its own
          populations over the SMS/field read models; when there is no field work
          it teaches in the pencil idiom rather than vanishing (R94). */}
      <FieldDesk />

      {/* R95 — the Studio Contents page: book-style front matter (Rooms /
          Ledgers / Begin), labels + doorways only. On a working Desk it sits
          here as quiet front matter after the field rollup; on a quiet Desk it
          has already risen above (deskEmpty), so it renders in exactly one place. */}
      {!deskEmpty && <DeskContents />}

      {/* The capture front door (G1 · R62) — an overlay over the Desk, never a
          route; the Desk beneath does not unmount (D1). */}
      <CaptureLeadSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />

      {/* R79 — the no-proposal front door: same overlay contract as capture. */}
      <OpenProjectSheet open={openProjectOpen} onClose={() => setOpenProjectOpen(false)} />
    </main>
  );
}
