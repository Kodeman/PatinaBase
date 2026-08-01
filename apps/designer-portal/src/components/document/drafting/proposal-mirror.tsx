'use client';

/**
 * The proposal-grain client mirror (R43 · R86) — "Sarah's copy": the live
 * preview of what the CLIENT's copy of a *draft proposal* carries, rendered
 * while the designer composes. A draft proposal has no project yet, so this is a
 * projection keyed off the proposal.
 *
 * R86 — "the portal copy is canonical, tier-governed." The mirror renders the
 * SAME shared blocks the client portal renders (LineItemsBlock,
 * PaymentScheduleBlock, ScopeRoomsBlock, ExclusionsBlock, TimelinePhasesBlock
 * from @patina/design-system), GATED by the proposal's `client_visibility_tier`
 * through the ONE shared law — `proposalTierVisibility` (@patina/utils) — that
 * the client render also obeys. Preview IS truth: what shows here is exactly
 * what the client sees at the chosen tier, and the two cannot drift (the R86
 * contract test pins the shared gate; a source contract pins that both surfaces
 * import it).
 *
 * R43 lines still held: `tbd` placeholder pieces (studio scaffolding) never
 * reach the client copy, the projection selects NO trade/cost/markup/margin
 * column (those the client sees at no tier), and it is read-only by construction
 * (no insert/update/delete/upsert/rpc). The tier SETTER lives beside the preview
 * and writes through useUpdateProposal — a mutation, but the preview render
 * itself stays a pure projection.
 *
 * Zero shadows (D4).
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assessProposalPaymentSchedule,
  createBrowserClient,
  useUpdateProposal,
} from '@patina/supabase';
import {
  proposalTierVisibility,
  type ClientVisibilityTier,
} from '@patina/utils';
import {
  LineItemsBlock,
  PaymentScheduleBlock,
  ScopeRoomsBlock,
  ExclusionsBlock,
  TimelinePhasesBlock,
  BoardComposition,
} from '@patina/design-system';

const getSupabase = () => createBrowserClient() as any;

type AnyRow = any;

export function useProposalMirrorData(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-mirror', proposalId],
    enabled: !!proposalId,
    // "The client's copy · LIVE": this bespoke read spans many child tables that
    // the facet editors mutate through their own keys (which don't invalidate
    // this one), so a gentle focused-only poll keeps the preview in step as the
    // designer composes — a piece flipped to TBD drops out here within a tick,
    // an exclusion / price / tier change reflows immediately.
    refetchOnWindowFocus: true,
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    queryFn: async () => {
      const supabase = getSupabase();
      const [
        { data: proposal, error: proposalError },
        { data: rooms, error: roomsError },
        { data: rawPieces, error: piecesError },
        { data: palettes, error: palettesError },
        { data: exclusions, error: exclusionsError },
        { data: milestones, error: milestonesError },
        { data: phases, error: phasesError },
        { data: boardsRaw, error: boardsError },
      ] = await Promise.all([
        // The rolled-up investment number is proposals.total_amount, plus the
        // tier that governs the whole render (R86). NO trade/cost/margin column.
        supabase
          .from('proposals')
          .select('title, total_amount, client_visibility_tier')
          .eq('id', proposalId)
          .single(),
        // Rooms in scope — name + type + the client-facing per-room budget
        // (shown only at 'full' via the tier gate; never a trade/cost column).
        supabase
          .from('proposal_scope_rooms')
          .select('id, name, room_type, budget_cents, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        // Pieces — name / room / category + the client-facing SELL figures the
        // itemized block renders (line_total_cents + allowance range). We select
        // NO trade cost, markup, or margin column — those the client sees at no
        // tier. `tbd` placeholders are filtered out below (R43).
        supabase
          .from('proposal_items')
          .select(
            'id, name, category, ffe_category, scope_room_id, item_type, position, quantity, unit_price, line_total_cents, budget_min_cents, budget_max_cents',
          )
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true }),
        // Palette — swatch NAMES + COLORS only.
        supabase
          .from('proposal_palettes')
          .select(
            'id, name, sort_order, swatches:palette_swatches(id, name, hex, sort_order)',
          )
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('proposal_exclusions')
          .select('id, description, category, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        // Payment schedule — label / percentage / amount / trigger (client-facing).
        supabase
          .from('proposal_payment_milestones')
          .select(
            'label, percentage, amount_cents, trigger_condition, sort_order',
          )
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        // Timeline phases — name + duration only.
        supabase
          .from('proposal_phases')
          .select('name, duration_weeks, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        // Mood boards — the SAME render the client copy carries (no tier gate;
        // boards aren't tier-gated). Items inlined + z-ordered for BoardComposition.
        // status='active' mirrors useBoardsWithItems so this preview never shows
        // an archived board the client's copy would hide (00264 — preview is truth).
        supabase
          .from('proposal_boards')
          .select(
            'id, name, canvas_width, canvas_height, background_color, sort_order, proposal_board_items(*)',
          )
          .eq('proposal_id', proposalId)
          .eq('status', 'active')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .order('z_index', {
            ascending: true,
            referencedTable: 'proposal_board_items',
          }),
      ]);

      const readError = [
        proposalError,
        roomsError,
        piecesError,
        palettesError,
        exclusionsError,
        milestonesError,
        phasesError,
        boardsError,
      ].find(Boolean);
      if (readError) throw readError;

      const roomNameById = new Map<string, string>(
        ((rooms ?? []) as AnyRow[]).map((r) => [r.id, r.name]),
      );

      // The client never sees a `tbd` placeholder piece (R43) — filter them from
      // both the itemized list and the name list at the projection.
      const nonTbd = ((rawPieces ?? []) as AnyRow[]).filter(
        (p) => p.item_type !== 'tbd',
      );

      // The itemized LineItemsBlock shape (client-facing sell figures only).
      const lineItems = nonTbd.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        item_type: (p.item_type ?? undefined) as string | undefined,
        quantity: (p.quantity ?? 1) as number,
        unit_price: (p.unit_price ?? 0) as number,
        line_total_cents: (p.line_total_cents ?? 0) as number,
        budget_min_cents: (p.budget_min_cents ?? null) as number | null,
        budget_max_cents: (p.budget_max_cents ?? null) as number | null,
      }));

      const pieces = nonTbd.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.ffe_category || p.category || null,
        room: p.scope_room_id
          ? (roomNameById.get(p.scope_room_id) ?? null)
          : null,
      }));

      const palette = ((palettes ?? []) as AnyRow[]).map((pal) => ({
        id: pal.id,
        name: pal.name,
        swatches: ((pal.swatches ?? []) as AnyRow[])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((s) => ({
            id: s.id,
            name: s.name as string | null,
            hex: s.hex as string,
          })),
      }));

      // Boards → the shared BoardComposition shape (items inlined, z-ordered).
      const boards = ((boardsRaw ?? []) as AnyRow[]).map((b) => ({
        id: b.id as string,
        name: b.name as string,
        canvas_width: b.canvas_width as number,
        canvas_height: b.canvas_height as number,
        background_color: b.background_color as string,
        items: (b.proposal_board_items ?? []) as AnyRow[],
      }));

      const totalCents = (proposal as AnyRow)?.total_amount ?? 0;
      const paymentSchedule = assessProposalPaymentSchedule(
        (milestones ?? []) as AnyRow[],
        totalCents,
      );

      return {
        proposal,
        tier: ((proposal as AnyRow)?.client_visibility_tier ??
          'milestone') as ClientVisibilityTier,
        rooms: (rooms ?? []) as AnyRow[],
        lineItems,
        pieces,
        palette,
        exclusions: (exclusions ?? []) as AnyRow[],
        // Canonical client payload: percentage + the current signed total own
        // the amounts. Stored projections are reconciled by the send preflight.
        milestones: paymentSchedule.milestones,
        paymentSchedule,
        phases: (phases ?? []) as AnyRow[],
        boards,
        totalCents,
      };
    },
  });
}

function MirrorSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

const TIER_LABEL: Record<ClientVisibilityTier, string> = {
  full: 'Full',
  milestone: 'Milestones',
  curated: 'Curated',
};

/**
 * The tier setter (R86) — the designer chooses the visibility tier and the
 * preview (and the client's copy) reflow to it in lockstep. Writes through
 * useUpdateProposal (client_visibility_tier); failures render inline (R83).
 */
function TierInstrument({
  proposalId,
  tier,
}: {
  proposalId: string;
  tier: ClientVisibilityTier;
}) {
  const update = useUpdateProposal({ errorSurface: 'inline' });
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const choose = (next: ClientVisibilityTier) => {
    if (next === tier || update.isPending) return;
    setFeedback('saving');
    setFeedbackError(null);
    update.mutate(
      { proposalId, updates: { client_visibility_tier: next } },
      {
        onSuccess: async () => {
          // Reflow the preview immediately rather than waiting for its poll tick.
          await qc.invalidateQueries({
            queryKey: ['proposal-mirror', proposalId],
          });
          setFeedback('saved');
        },
        onError: (error) => {
          setFeedback('error');
          setFeedbackError(
            error instanceof Error
              ? error.message
              : 'Could not update the client view.',
          );
        },
      },
    );
  };

  return (
    <div className="mb-5">
      <p className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        What the client sees
      </p>
      <div className="flex flex-wrap gap-1">
        {(['full', 'milestone', 'curated'] as ClientVisibilityTier[]).map(
          (t) => {
            const active = t === tier;
            return (
              <button
                key={t}
                type="button"
                onClick={() => choose(t)}
                disabled={update.isPending}
                aria-pressed={active}
                className={`group inline-flex min-h-11 min-w-11 items-center justify-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-50 motion-reduce:transition-none ${
                  active
                    ? 'text-[var(--color-charcoal)]'
                    : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
                }`}
              >
                <span
                  className={`da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 ${
                    active ? 'da-score-on' : ''
                  }`}
                >
                  {TIER_LABEL[t]}
                </span>
              </button>
            );
          },
        )}
      </div>
      <div className="min-h-4" aria-live="polite">
        {feedback === 'saving' && (
          <p role="status" className="font-mono text-[8.5px] text-[var(--text-muted)]">
            Updating client preview…
          </p>
        )}
        {feedback === 'saved' && (
          <p role="status" className="font-mono text-[8.5px] text-[var(--color-sage)]">
            Client preview updated
          </p>
        )}
        {feedback === 'error' && (
          <p role="alert" className="font-mono text-[8.5px] text-[var(--color-terracotta)]">
            {feedbackError ?? 'Could not update the client preview.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProposalPreviewRail({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName?: string;
}) {
  const { data } = useProposalMirrorData(proposalId);

  if (!data) {
    return (
      <p className="text-[12px] italic text-[var(--text-muted)]">
        Composing {clientName ? `${clientName}'s` : 'their'} copy…
      </p>
    );
  }

  // The ONE shared law both this preview and the client's copy obey (R86).
  const gate = proposalTierVisibility(data.tier);
  const hasPalette = data.palette.some((p) => p.swatches.length > 0);

  return (
    <div
      className="mx-auto max-w-[680px]"
      data-testid="proposal-preview-rail"
      aria-label={
        clientName ? `What ${clientName} sees` : 'What the client sees'
      }
    >
      <TierInstrument proposalId={proposalId} tier={data.tier} />

      <h1 className="font-heading text-[1.35rem] font-medium text-[var(--color-charcoal)]">
        {data.proposal?.title ?? 'Your proposal'}
      </h1>
      <p className="mb-6 mt-1 text-[11px] text-[var(--text-muted)]">
        {clientName ? `Prepared for ${clientName}` : 'Prepared for you'}
      </p>

      {/* In scope — names + types always (scope shape survives every tier); the
          per-room budget column shows only at the tier that reveals it. */}
      {data.rooms.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>In scope</MirrorSectionLabel>
          {gate.roomBudgets ? (
            <ScopeRoomsBlock
              rooms={(data.rooms as AnyRow[]).map((r) => ({
                name: r.name,
                room_type: r.room_type,
                budget_cents: r.budget_cents ?? 0,
              }))}
            />
          ) : (
            (data.rooms as AnyRow[]).map((r) => (
              <div
                key={r.id}
                className="flex items-baseline justify-between border-b border-dashed border-[var(--color-pearl)] py-1.5"
              >
                <span className="text-[12px] text-[var(--color-charcoal)]">
                  {r.name}
                </span>
                {r.room_type && (
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {r.room_type}
                  </span>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {hasPalette && (
        <section className="mb-6">
          <MirrorSectionLabel>Palette</MirrorSectionLabel>
          {data.palette
            .filter((pal) => pal.swatches.length > 0)
            .map((pal) => (
              <div key={pal.id} className="mb-3 last:mb-0">
                {pal.name && (
                  <p className="mb-1 text-[10.5px] text-[var(--text-muted)]">
                    {pal.name}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {pal.swatches.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 rounded-full border border-[var(--color-pearl)]"
                        style={{ backgroundColor: s.hex }}
                      />
                      <span className="text-[11px] text-[var(--color-charcoal)]">
                        {s.name ?? s.hex}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Mood boards — the SAME BoardComposition the client copy renders,
          placed where the client places it: after the visual/palette story,
          before the money. Boards aren't tier-gated, so no gate here. */}
      {data.boards.some((b) => b.items.length > 0) && (
        <section className="mb-6">
          <MirrorSectionLabel>Mood boards</MirrorSectionLabel>
          {data.boards
            .filter((b) => b.items.length > 0)
            .map((b) => (
              <BoardComposition
                key={b.id}
                board={b}
                className="mb-4 last:mb-0"
              />
            ))}
        </section>
      )}

      {/* Investment — the SAME LineItemsBlock the client renders. Itemized at
          'full'; at 'milestone'/'curated' the gate hands it no items, so it
          renders the single rolled-up Total row (preview = truth). */}
      <section className="mb-6">
        <MirrorSectionLabel>Investment</MirrorSectionLabel>
        <LineItemsBlock
          items={gate.lineItems ? data.lineItems : []}
          totalCents={data.totalCents}
        />
      </section>

      {gate.paymentSchedule && data.milestones.length > 0 && (
        <section className="mb-6">
          <PaymentScheduleBlock
            milestones={(data.milestones as AnyRow[]).map((m) => ({
              label: m.label,
              percentage: m.percentage,
              amount_cents: m.amount_cents,
              trigger_condition: m.trigger_condition,
            }))}
            totalCents={data.totalCents}
          />
        </section>
      )}

      {gate.timeline && data.phases.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>Timeline</MirrorSectionLabel>
          <TimelinePhasesBlock
            phases={(data.phases as AnyRow[]).map((p) => ({
              name: p.name,
              duration_weeks: p.duration_weeks,
            }))}
          />
        </section>
      )}

      {gate.exclusions && data.exclusions.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>Not included</MirrorSectionLabel>
          <ExclusionsBlock
            exclusions={(data.exclusions as AnyRow[]).map((e) => ({
              description: e.description,
              category: e.category,
            }))}
          />
        </section>
      )}
    </div>
  );
}
