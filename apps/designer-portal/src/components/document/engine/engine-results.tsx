'use client';

/**
 * The Engine's answer (R38) — shared by ⌘K and the Library librarian. An ask
 * returns PAPER RESULT-LINES: each a real piece from the designer's own shelves
 * (the catalog = their taught eye — Designer-Taught Intelligence, never "AI"),
 * carrying one act: Place → [document]. The ask does not persist; only the
 * placement does (with a "via the Engine" mark). While the Engine reads, the
 * R35 Strata sweep stands in for a spinner.
 *
 * Placeable source: a non-persisting cross-layer catalog search. (The companion
 * edge backend persists conversation + its product extraction is stubbed, so it
 * is NOT used for the ask — see DECISIONS I30; LLM-curated ranking via a
 * non-persisting path is a follow-up.)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useCrossLayerSearch,
  useProjects,
  type LayerProductRow,
} from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { usePlaceInDocument } from '@/hooks/use-place-in-document';

export interface InDocument {
  projectId: string;
  projectName: string;
}

export function EngineResults({
  query,
  inDocument,
  onPlaced,
}: {
  query: string;
  /** The document in hand — when present, Place targets it directly. */
  inDocument?: InDocument | null;
  onPlaced?: (pieceName: string, whereName: string) => void;
}) {
  const { data, isLoading } = useCrossLayerSearch({ query });
  const place = usePlaceInDocument();
  const { data: projects } = useProjects();

  // The place target: the held document, or one the designer picks below.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [placeError, setPlaceError] = useState<string | null>(null);
  useEffect(() => {
    setPlacedIds(new Set());
    setPlaceError(null);
  }, [query]);

  const targets = useMemo(() => {
    if (inDocument) return [{ id: inDocument.projectId, name: inDocument.projectName }];
    const rows = (projects ?? []) as Array<Record<string, unknown>>;
    return rows
      .filter((p) => p.status === 'active')
      .slice(0, 5)
      .map((p) => ({ id: p.id as string, name: (p.name as string) ?? 'Untitled' }));
  }, [inDocument, projects]);

  const targetId = inDocument?.projectId ?? pickedId;
  const targetName =
    inDocument?.projectName ?? targets.find((t) => t.id === targetId)?.name ?? 'the document';

  // Proven first (studio), then the marketplace (catalog), then raw captures.
  const pieces = useMemo<LayerProductRow[]>(() => {
    if (!data) return [];
    return [...data.byLayer.studio, ...data.byLayer.catalog, ...data.byLayer.personal].slice(0, 6);
  }, [data]);

  const doPlace = async (piece: LayerProductRow) => {
    if (!targetId) return;
    setPlaceError(null);
    try {
      await place.mutateAsync({
        projectId: targetId,
        piece: {
          id: piece.id,
          name: piece.name,
          price_trade: piece.price_trade,
          price_retail: piece.price_retail,
        },
      });
      setPlacedIds((prev) => new Set(prev).add(piece.id));
      onPlaced?.(piece.name, targetName);
    } catch {
      // RLS rejects placement into a project you don't lead, and any other
      // insert failure — surface it instead of leaking an unhandled rejection.
      setPlaceError('Could not place into that document — you may not be its lead designer.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 py-5">
        <StrataSweep size="sm" label="The Engine is reading your shelves" />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
          reading your shelves…
        </span>
      </div>
    );
  }

  if (pieces.length === 0) {
    return (
      <p className="py-5 font-heading text-[13px] italic text-[var(--text-muted)]">
        Nothing on your shelves answers that yet — teach more, and the Engine sees more.
      </p>
    );
  }

  return (
    <div className="py-1">
      {/* Place target — the held document, or a quiet picker (R38 Place →). */}
      {!inDocument && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Place into
          </span>
          {targets.length === 0 ? (
            <span className="text-[11px] italic text-[var(--text-muted)]">no open project to place into</span>
          ) : (
            targets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPickedId(t.id)}
                className={`rounded-[12px] border px-2.5 py-1 text-[0.66rem] transition-colors ${
                  pickedId === t.id
                    ? 'border-[var(--color-clay)] bg-[var(--color-clay)] text-white'
                    : 'border-[var(--color-pearl)] bg-white text-[var(--text-body)] hover:border-[var(--color-clay)]'
                }`}
              >
                {t.name}
              </button>
            ))
          )}
        </div>
      )}

      <ul className="space-y-1.5">
        {pieces.map((piece) => {
          const placed = placedIds.has(piece.id);
          const img = piece.images?.[0] ?? null;
          return (
            <li
              key={piece.id}
              className="flex items-center gap-3 rounded-[6px] border border-[var(--doc-ink-border)] bg-white px-2.5 py-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[var(--doc-sheet-2)]">
                {img ? (
                  <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-50">
                    {piece.category ?? 'piece'}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-[var(--color-charcoal)]">
                  {piece.name}
                </span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                  {piece.brand ?? piece.layer} · {LAYER_NOTE[piece.layer]}
                </span>
              </span>
              {placed ? (
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-sage)]">
                  placed ✓
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!targetId || place.isPending}
                  onClick={() => void doPlace(piece)}
                  className="shrink-0 rounded-[4px] border border-[rgba(196,165,123,0.4)] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-clay)] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-clay)]"
                >
                  Place →
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {placeError && (
        <p className="mt-2 text-[11px] text-[var(--color-terracotta)]">{placeError}</p>
      )}

      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] opacity-70">
        The Engine · every ask teaches your eye · Designer-Taught Intelligence
      </p>
    </div>
  );
}

const LAYER_NOTE: Record<string, string> = {
  personal: 'My Library',
  studio: 'Studio',
  catalog: 'Patina Catalog',
};
