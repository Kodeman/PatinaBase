'use client';

/**
 * The proposal-grain client mirror (R43) — "Sarah's copy": the live preview
 * of what the CLIENT's copy of a *draft proposal* carries, rendered while the
 * designer composes. The project-grain mirror (../client-mirror.tsx) keys off a
 * project; a draft proposal has no project yet, so this is a NEW projection
 * keyed off the proposal.
 *
 * This component is the enforceable projection (the R26 precedent, held by a CI
 * test — proposal-mirror-contract.test.ts). It renders ONLY client-safe grain:
 *   • the rooms in scope (names + room type);
 *   • the palette as swatch NAMES and COLORS only;
 *   • the pieces by NAME / ROOM / CATEGORY only — never a unit price, sell
 *     price, line total, budget range, markup, or margin — and never a `tbd`
 *     placeholder piece (those are studio-side scaffolding the client must not
 *     see);
 *   • the exclusions (what's not included);
 *   • and ONE rolled-up investment total — the proposal total — and nothing
 *     else money-shaped.
 *
 * It selects ONLY client-safe columns at the query layer (defence in depth: the
 * forbidden columns never enter the component's data at all) and calls NO write
 * method. Read-only by construction. Reuses the client-mirror section/divider
 * grammar; zero shadows (D4).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';

const getSupabase = () => createBrowserClient() as any;

type AnyRow = any;

export function useProposalMirrorData(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-mirror', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [
        { data: proposal },
        { data: rooms },
        { data: rawPieces },
        { data: palettes },
        { data: exclusions },
      ] = await Promise.all([
        // The one rolled-up investment number is proposals.total_amount. We
        // select NO trade/cost/margin column off the proposal row.
        supabase
          .from('proposals')
          .select('title, total_amount')
          .eq('id', proposalId)
          .single(),
        // Rooms in scope — name + type only (per-room budget stays studio-side).
        supabase
          .from('proposal_scope_rooms')
          .select('id, name, room_type, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        // Pieces — NAME / ROOM / CATEGORY ONLY. We never select any pricing,
        // cost, per-line total, budget-range, markup, or margin column — those
        // forbidden columns simply never enter the projection. `tbd`
        // placeholders are filtered out below.
        supabase
          .from('proposal_items')
          .select('id, name, category, ffe_category, scope_room_id, item_type, position')
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true }),
        // Palette — swatch NAMES + COLORS only (the swatch select carries hex +
        // name, nothing else identifying a vendor or cost).
        supabase
          .from('proposal_palettes')
          .select('id, name, sort_order, swatches:palette_swatches(id, name, hex, sort_order)')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('proposal_exclusions')
          .select('id, description, category, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
      ]);

      const roomNameById = new Map<string, string>(
        ((rooms ?? []) as AnyRow[]).map((r) => [r.id, r.name]),
      );

      // The client never sees a `tbd` placeholder piece — those are the
      // studio's own "to be decided" scaffolding. Filter them at the projection.
      const pieces = ((rawPieces ?? []) as AnyRow[])
        .filter((p) => p.item_type !== 'tbd')
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.ffe_category || p.category || null,
          room: p.scope_room_id ? roomNameById.get(p.scope_room_id) ?? null : null,
        }));

      const palette = ((palettes ?? []) as AnyRow[]).map((pal) => ({
        id: pal.id,
        name: pal.name,
        swatches: ((pal.swatches ?? []) as AnyRow[])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((s) => ({ id: s.id, name: s.name as string | null, hex: s.hex as string })),
      }));

      return {
        proposal,
        rooms: (rooms ?? []) as AnyRow[],
        pieces,
        palette,
        exclusions: (exclusions ?? []) as AnyRow[],
        // The single client-facing money figure.
        totalCents: (proposal as AnyRow)?.total_amount ?? 0,
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

  const hasPalette = data.palette.some((p) => p.swatches.length > 0);

  return (
    <div
      className="mx-auto max-w-[680px]"
      data-testid="proposal-preview-rail"
      aria-label={clientName ? `What ${clientName} sees` : 'What the client sees'}
    >
      <h1 className="font-heading text-[1.35rem] font-medium text-[var(--color-charcoal)]">
        {data.proposal?.title ?? 'Your proposal'}
      </h1>
      <p className="mb-6 mt-1 text-[11px] text-[var(--text-muted)]">
        {clientName ? `Prepared for ${clientName}` : 'Prepared for you'}
      </p>

      {data.rooms.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>In scope</MirrorSectionLabel>
          {(data.rooms as AnyRow[]).map((r) => (
            <div
              key={r.id}
              className="flex items-baseline justify-between border-b border-dashed border-[var(--color-pearl)] py-1.5"
            >
              <span className="text-[12px] text-[var(--color-charcoal)]">{r.name}</span>
              {r.room_type && (
                <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {r.room_type}
                </span>
              )}
            </div>
          ))}
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
                  <p className="mb-1 text-[10.5px] text-[var(--text-muted)]">{pal.name}</p>
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

      {data.pieces.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>Pieces</MirrorSectionLabel>
          {data.pieces.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-dashed border-[var(--color-pearl)] py-1.5"
            >
              <span className="text-[12px] text-[var(--color-charcoal)]">
                {p.name}
                {p.room && (
                  <span className="ml-2 text-[10.5px] text-[var(--text-muted)]">{p.room}</span>
                )}
              </span>
              {p.category && (
                <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {p.category}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {data.exclusions.length > 0 && (
        <section className="mb-6">
          <MirrorSectionLabel>Not included</MirrorSectionLabel>
          {(data.exclusions as AnyRow[]).map((e) => (
            <p
              key={e.id}
              className="border-b border-dashed border-[var(--color-pearl)] py-1.5 text-[11.5px] text-[var(--color-charcoal)]"
            >
              {e.description}
              {e.category && (
                <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {e.category}
                </span>
              )}
            </p>
          ))}
        </section>
      )}

      {/* The single rolled-up investment line — the proposal total, nothing
          itemized, no margin or trade figure. */}
      <section className="mt-8 border-t border-[var(--color-charcoal)] pt-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Investment
          </span>
          <span className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
            {fmtUsd(data.totalCents)}
          </span>
        </div>
      </section>
    </div>
  );
}
