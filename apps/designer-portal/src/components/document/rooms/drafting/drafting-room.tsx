'use client';

/**
 * The Drafting Room (R42 / R43) — the anti-wizard for authoring a proposal.
 * A new RoomShell tenant that clones the Composing Page's pattern (R40): a
 * detailed process rendered as a paper artifact that BUILDS ITSELF. The eight
 * facets of a proposal — Rooms · FF&E · Palette · Boards · Phases · Exclusions
 * · Payments · Terms — fill in ANY order, each hosting the PROVEN legacy
 * scope-builder editor (all proposalId-addressed and self-persisting). The
 * proposal is always a real draft; there is no Save button gate, no tab strip,
 * no stepper, no "Step N of 8".
 *
 * The Strata Mark (R35) is the ONLY progress indicator there is. The three
 * movements map to the three lines, and the state reads Outline → Drafting →
 * Ready to send off the same fill (drafting-progress.ts):
 *   · line 1 — SCOPE      (the rooms + what fills them)
 *   · line 2 — THE OFFER  (phases, exclusions, payments, terms)
 *   · line 3 — THE VISION (palette + boards)
 *
 * R43: the right rail mirrors what the CLIENT's copy carries as the designer
 * composes (ProposalPreviewRail — "Sarah's copy"). Two-column on min-[980px].
 *
 * A Room — full-bleed paper, zero shadows (D4); reuses RoomShell's physics.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createBrowserClient,
  useProposal,
  useScopeBuilderSummary,
  useUpdateProposalItem,
  type ProposalItemType,
} from '@patina/supabase';
import { RoomShell } from '../room-shell';
import { StrataMark } from '../../strata-mark';
import { FacetSection } from './facet-section';
import { ProposalPreviewRail } from '../../drafting/proposal-mirror';
import {
  draftingFill,
  draftingPct,
  draftingStateLabel,
  draftingGaps,
  type DraftingFacets,
} from '@/lib/document/drafting-progress';

// The eight legacy editors — proven, proposalId-addressed, self-persisting.
import { RoomsInScope } from '@/components/portal/scope-builder/rooms-in-scope';
import { FFEScheduleBuilder } from '@/components/portal/scope-builder/ffe-schedule-builder';
import { PaletteBuilder } from '@/components/portal/scope-builder/palette-builder';
import { BoardsBuilder } from '@/components/portal/scope-builder/boards-builder';
import { PhaseBuilder } from '@/components/portal/scope-builder/phase-builder';
import { ExclusionsList } from '@/components/portal/scope-builder/exclusions-list';
import { PaymentMilestonesBuilder } from '@/components/portal/scope-builder/payment-milestones-builder';
import { ChangeOrderTermsEditor } from '@/components/portal/scope-builder/change-order-terms-editor';

const STATE_TONE: Record<string, { color: string; bg: string }> = {
  Outline: { color: 'var(--color-aged-oak)', bg: 'transparent' },
  Drafting: { color: '#b89a2e', bg: 'transparent' },
  'Ready to send': { color: 'var(--color-sage)', bg: 'rgba(168,181,160,0.12)' },
};

const MOVEMENT = {
  scope: 'var(--color-mocha)',
  offer: 'var(--color-clay)',
  vision: 'var(--color-dusty-blue)',
};

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * The facets read — the ONLY thing the room reads itself (the legacy editors own
 * their own reads/writes). One client-grain query layer feeds the done/summary
 * of each facet and the Strata Mark; it mirrors the proposal-mirror's grain so
 * "what's written" agrees with "what the client sees". Refetches on focus so the
 * mark fills as the editors persist below.
 */
interface FacetRead {
  facets: DraftingFacets;
  summary: {
    rooms: number;
    ffe: number;
    palettes: number;
    boards: number;
    phases: number;
    exclusions: number;
    payments: number;
    swatches: number;
    coTerms: boolean;
  };
  items: Array<{ id: string; name: string; item_type: ProposalItemType | null; scope_room_id: string | null }>;
}

function useFacetRead(proposalId: string) {
  return useQuery<FacetRead>({
    queryKey: ['drafting-facets', proposalId],
    enabled: !!proposalId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const [
        { data: rooms },
        { data: items },
        { data: palettes },
        { data: boards },
        { data: phases },
        { data: exclusions },
        { data: payments },
        { data: coTerms },
      ] = await Promise.all([
        supabase.from('proposal_scope_rooms').select('id').eq('proposal_id', proposalId),
        supabase
          .from('proposal_items')
          .select('id, name, item_type, scope_room_id, position')
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true }),
        supabase
          .from('proposal_palettes')
          .select('id, swatches:palette_swatches(id)')
          .eq('proposal_id', proposalId),
        supabase.from('proposal_boards').select('id, proposal_board_items(count)').eq('proposal_id', proposalId),
        supabase.from('proposal_phases').select('id').eq('proposal_id', proposalId),
        supabase.from('proposal_exclusions').select('id').eq('proposal_id', proposalId),
        supabase.from('proposal_payment_milestones').select('id').eq('proposal_id', proposalId),
        supabase.from('proposal_change_order_terms').select('process_description').eq('proposal_id', proposalId).maybeSingle(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const palRows = (palettes ?? []) as any[];
      const swatches = palRows.reduce((n: number, p: { swatches?: unknown[] }) => n + (p.swatches?.length ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boardRows = (boards ?? []) as any[];
      const boardsWithItems = boardRows.filter((b) => (b.proposal_board_items?.[0]?.count ?? 0) > 0).length;
      const coWritten = !!(coTerms as { process_description?: string } | null)?.process_description?.trim();

      const summary = {
        rooms: (rooms ?? []).length,
        ffe: (items ?? []).length,
        palettes: palRows.length,
        boards: boardsWithItems,
        phases: (phases ?? []).length,
        exclusions: (exclusions ?? []).length,
        payments: (payments ?? []).length,
        swatches,
        coTerms: coWritten,
      };

      const facets: DraftingFacets = {
        rooms: summary.rooms > 0,
        ffe: summary.ffe > 0,
        phases: summary.phases > 0,
        exclusions: summary.exclusions > 0,
        payments: summary.payments > 0,
        terms: summary.coTerms,
        palette: summary.swatches > 0,
        boards: summary.boards > 0,
      };

      return {
        facets,
        summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (items ?? []) as any[],
      };
    },
  });
}

// Cycle order for the FF&E type chip (R42): fixed → allowance → tbd → fixed.
const TYPE_ORDER: ProposalItemType[] = ['fixed', 'allowance', 'tbd'];
const TYPE_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  fixed: { label: 'Fixed', color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.10)' },
  allowance: { label: 'Allowance', color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.12)' },
  tbd: { label: 'TBD', color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.08)' },
};

export function DraftingRoom({ proposalId }: { proposalId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { data: summary } = useScopeBuilderSummary(proposalId);
  const { data: read } = useFacetRead(proposalId);
  const updateItem = useUpdateProposalItem();

  // Payments needs the running total (Σ FF&E estimate + Σ design fees), like the
  // legacy shell computed for the milestone allocator.
  const totalProjectCents = num(summary?.totalFFEEstimateCents) + num(summary?.totalDesignFeeCents);

  const facets = useMemo<DraftingFacets>(
    () =>
      read?.facets ?? {
        rooms: false,
        ffe: false,
        phases: false,
        exclusions: false,
        payments: false,
        terms: false,
        palette: false,
        boards: false,
      },
    [read],
  );

  const s = read?.summary;
  const fill = draftingFill(facets);
  const pct = draftingPct(fill);
  const state = draftingStateLabel(pct);
  const gaps = draftingGaps(facets);
  const tone = STATE_TONE[state];

  // One section open at first paint (Rooms — the natural start); everything is
  // reachable in any order. No required progression.
  const [open, setOpen] = useState<Set<string>>(new Set(['rooms']));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // The FF&E type-cycle chips read off the same facets query; cycling persists
  // via useUpdateProposalItem (which already recomputes line_total_cents).
  const cycleType = (id: string, current: ProposalItemType | null) => {
    const idx = TYPE_ORDER.indexOf((current ?? 'fixed') as ProposalItemType);
    const next = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length];
    void updateItem.mutateAsync({ itemId: id, proposalId, updates: { item_type: next } });
  };

  const title = proposal?.title ?? proposal?.client_name ?? 'A proposal';

  const guide =
    pct === 0
      ? 'Start anywhere — the rooms, the price, or the palette. Every facet saves itself; the proposal is a real draft from the first keystroke. ⌘K for the librarian.'
      : pct >= 100
        ? 'Fully drafted. Every facet is written — this proposal is ready to send to the client at full strength.'
        : `Coming together. Still open: ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''}. Fill them in any order.`;

  return (
    <RoomShell
      title="The Drafting Room"
      count={pct > 0 ? `${pct}% drafted` : undefined}
      backTo={`/portal/proposals/${proposalId}`}
      backLabel="the proposal"
    >
      <div className="mx-auto max-w-[1240px] px-6 sm:px-8">
        {/* ── The proposal taking shape — the Strata Mark is the ONLY progress ── */}
        <section className="sticky top-[57px] z-[5] border-b border-[var(--doc-ink-border)] bg-[var(--doc-paper)] pb-4 pt-6">
          <div className="flex items-center gap-5">
            {/* The ONE Strata Mark — three movements map to the three lines. */}
            <StrataMark size="lg" fill={fill} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[1.5rem] leading-tight text-[var(--color-charcoal)]">{title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="font-mono text-[0.6rem] tracking-[0.04em] text-[var(--color-aged-oak)]">
                  <b className="font-heading text-[0.95rem] text-[var(--color-charcoal)]">{pct}</b>% drafted
                </span>
                <span
                  className="rounded-[3px] border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]"
                  style={{ color: tone.color, borderColor: tone.color, background: tone.bg }}
                >
                  {state}
                </span>
                <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-70">
                  Scope · The Offer · The Vision
                </span>
              </div>
            </div>
          </div>
          {/* The librarian offers, never blocks (R40). */}
          <p className="mt-3 rounded-[7px] border border-[rgba(196,165,123,0.25)] bg-[rgba(196,165,123,0.06)] px-3 py-2 text-[0.72rem] text-[var(--color-mocha)]">
            {guide}
          </p>
        </section>

        {/* ── Two columns on min-[980px]: the facets · the client's copy ── */}
        <div className="grid gap-8 pt-6 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── The facets — eight, in order, no tab strip, no stepper. ── */}
          <div>
            {/* Movement 1 · Scope */}
            <MovementRule name="Scope" meta="Line 1 · the rooms & what fills them" hue={MOVEMENT.scope} />

            <FacetSection
              name="Rooms"
              accent={MOVEMENT.scope}
              done={facets.rooms}
              status={facets.rooms ? `${s?.rooms} room${s?.rooms === 1 ? '' : 's'} in scope` : 'not yet written'}
              open={open.has('rooms')}
              onToggle={() => toggle('rooms')}
            >
              <RoomsInScope proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="FF&E"
              accent={MOVEMENT.scope}
              done={facets.ffe}
              status={facets.ffe ? `${s?.ffe} piece${s?.ffe === 1 ? '' : 's'} scheduled` : 'no schedule yet'}
              open={open.has('ffe')}
              onToggle={() => toggle('ffe')}
            >
              {/* R42: tap-to-cycle the item type per piece (fixed → allowance →
                  tbd). The legacy editor has no inline type toggle, so this strip
                  exposes cycling without touching its internals. */}
              {read && read.items.length > 0 && (
                <div className="mb-4 rounded-[7px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-3 py-2.5">
                  <p className="mb-2 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                    Tap a type to cycle it · fixed → allowance → tbd
                  </p>
                  <div className="flex flex-col gap-1">
                    {read.items.map((it) => {
                      const t = (it.item_type ?? 'fixed') as ProposalItemType;
                      const chip = TYPE_CHIP[t];
                      return (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 border-b border-dashed border-[var(--color-pearl)] py-1 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-[0.78rem] text-[var(--color-charcoal)]">
                            {it.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => cycleType(it.id, it.item_type)}
                            disabled={updateItem.isPending}
                            aria-label={`Cycle ${it.name} type — currently ${chip.label}`}
                            className="shrink-0 rounded-[12px] border px-2.5 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.06em] transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ color: chip.color, borderColor: chip.color, background: chip.bg }}
                          >
                            {chip.label} ⟳
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <FFEScheduleBuilder proposalId={proposalId} />
            </FacetSection>

            {/* Movement 3 · The Vision (palette + boards) — placed before the
                offer so the page reads scope → vision → commerce, but the lines
                still map by facet, not by order. */}
            <MovementRule name="The Vision" meta="Line 3 · palette & boards" hue={MOVEMENT.vision} />

            <FacetSection
              name="Palette"
              accent={MOVEMENT.vision}
              done={facets.palette}
              status={
                facets.palette
                  ? `${s?.swatches} swatch${s?.swatches === 1 ? '' : 'es'}`
                  : s?.palettes
                    ? 'palette started · no swatches'
                    : 'no palette yet'
              }
              open={open.has('palette')}
              onToggle={() => toggle('palette')}
            >
              <PaletteBuilder proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Boards"
              accent={MOVEMENT.vision}
              done={facets.boards}
              status={facets.boards ? `${s?.boards} board${s?.boards === 1 ? '' : 's'} with pieces` : 'no boards yet'}
              open={open.has('boards')}
              onToggle={() => toggle('boards')}
            >
              <BoardsBuilder proposalId={proposalId} />
            </FacetSection>

            {/* Movement 2 · The Offer (commerce) */}
            <MovementRule name="The Offer" meta="Line 2 · phases, exclusions, payments, terms" hue={MOVEMENT.offer} />

            <FacetSection
              name="Phases"
              accent={MOVEMENT.offer}
              done={facets.phases}
              status={facets.phases ? `${s?.phases} phase${s?.phases === 1 ? '' : 's'} & fees` : 'no phases yet'}
              open={open.has('phases')}
              onToggle={() => toggle('phases')}
            >
              <PhaseBuilder proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Exclusions"
              accent={MOVEMENT.offer}
              done={facets.exclusions}
              status={facets.exclusions ? `${s?.exclusions} stated` : 'none stated'}
              open={open.has('exclusions')}
              onToggle={() => toggle('exclusions')}
            >
              <ExclusionsList proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Payments"
              accent={MOVEMENT.offer}
              done={facets.payments}
              status={facets.payments ? `${s?.payments} milestone${s?.payments === 1 ? '' : 's'}` : 'no schedule yet'}
              open={open.has('payments')}
              onToggle={() => toggle('payments')}
            >
              <PaymentMilestonesBuilder proposalId={proposalId} totalCents={totalProjectCents} />
            </FacetSection>

            <FacetSection
              name="Terms"
              accent={MOVEMENT.offer}
              done={facets.terms}
              status={facets.terms ? 'change-order terms written' : 'not yet written'}
              open={open.has('terms')}
              onToggle={() => toggle('terms')}
            >
              <ChangeOrderTermsEditor proposalId={proposalId} />
            </FacetSection>

            <p className="mx-auto mt-8 max-w-[620px] border-t border-[var(--doc-ink-border)] py-5 text-center text-[0.72rem] italic text-[var(--color-aged-oak)]">
              No Next. No Back. No Step 3 of 8. The facets fill in any order, each saves itself, and the proposal is
              a real, sendable draft at every percent. The Strata Mark is the only progress indicator there is.
            </p>
          </div>

          {/* ── The right rail — "Sarah's copy": what the client sees (R43). ── */}
          <aside className="hidden min-[980px]:block">
            <div className="sticky top-[150px]">
              <p className="mb-3 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                The client&apos;s copy · live
              </p>
              <div className="rounded-[10px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
                <ProposalPreviewRail proposalId={proposalId} clientName={proposal?.client_name ?? undefined} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </RoomShell>
  );
}

function MovementRule({ name, meta, hue }: { name: string; meta: string; hue: string }) {
  return (
    <section className="pb-1 pt-8 first:pt-2">
      <div className="mb-1 flex items-baseline gap-3">
        <span aria-hidden className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]" style={{ background: hue }} />
        <h2 className="font-heading text-[1.2rem] font-medium italic text-[var(--color-charcoal)]">{name}</h2>
        <span className="ml-auto font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          {meta}
        </span>
      </div>
      <div className="mb-4 h-px bg-[var(--doc-ink-border)]" />
    </section>
  );
}
