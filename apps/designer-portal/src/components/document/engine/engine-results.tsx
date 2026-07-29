'use client';

/**
 * The Engine's answer (R38) — shared by ⌘K and the Library librarian. An ask
 * returns PAPER RESULT-LINES: each a real piece from the designer's own shelves
 * (the catalog = their taught eye — Designer-Taught Intelligence, never "AI"),
 * carrying one act: Place → [document]. The ask does not persist; only the
 * placement does (with a "via the Engine" mark). While the Engine reads, the
 * R35 Strata sweep stands in for a spinner.
 *
 * Aesthete Wave 3C: the ask now runs through the `aesthete-ask` edge function
 * (design §3.2 #14) — ask-text embedding + vector kNN unioned with the FTS
 * seam, RLS-transitive across the designer's three layers, ranked by RRF,
 * with matched-on chips. Nothing about the ask persists server-side either
 * (match_events logs latency + result count only, by shape — R31/R38).
 *
 * Degradation (§12.1 rung 2): when the inference worker can't answer inside
 * its 1.5 s budget the fn returns FTS-only results with { degraded: true } and
 * this surface says "the Engine is resting" — quietly, results still shown.
 * When the fn itself is unreachable (not deployed / network), the old
 * cross-layer keyword search stands in client-side under the same resting
 * line, so the librarian never goes silent.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useCrossLayerSearch,
  useEngineAsk,
  useProjects,
  type EngineAskMatchSource,
} from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { usePlaceInDocument } from '@/hooks/use-place-in-document';
import { DocumentAction } from '../document-action';

export interface InDocument {
  projectId: string;
  projectName: string;
}

/** One paper result-line — the LayerProductRow display subset, plus the
 *  Engine's matched-on chips when the line came from an ask. */
interface EnginePiece {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  price_trade: number | null;
  images: string[] | null;
  category: string | null;
  layer: string;
  matched_on?: EngineAskMatchSource[];
}

const RESULT_LIMIT = 6;

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
  const ask = useEngineAsk({ ask: query, limit: RESULT_LIMIT });
  // Client-side stand-in ONLY when the ask fn itself is unreachable — the
  // server already degrades to FTS on a resting worker (items still arrive).
  const fallback = useCrossLayerSearch({ query, enabled: ask.isError });
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
    if (inDocument)
      return [{ id: inDocument.projectId, name: inDocument.projectName }];
    const rows = (projects ?? []) as Array<Record<string, unknown>>;
    return rows
      .filter((p) => p.status === 'active')
      .slice(0, 5)
      .map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? 'Untitled',
      }));
  }, [inDocument, projects]);

  const targetId = inDocument?.projectId ?? pickedId;
  const targetName =
    inDocument?.projectName ??
    targets.find((t) => t.id === targetId)?.name ??
    'the document';

  const pieces = useMemo<EnginePiece[]>(() => {
    // The Engine's answer arrives ranked — keep its order.
    if (ask.data) return ask.data.items.slice(0, RESULT_LIMIT);
    if (ask.isError && fallback.data) {
      // Keyword stand-in: proven first (studio), then the marketplace
      // (catalog), then raw captures — the pre-3C ordering.
      const d = fallback.data;
      return [
        ...d.byLayer.studio,
        ...d.byLayer.catalog,
        ...d.byLayer.personal,
      ].slice(0, RESULT_LIMIT);
    }
    return [];
  }, [ask.data, ask.isError, fallback.data]);

  // Resting = the worker missed its budget (server says so) OR the fn itself
  // was unreachable (client fell back to keyword search).
  const resting = ask.data?.degraded === true || ask.isError;
  const isLoading = ask.isLoading || (ask.isError && fallback.isLoading);

  const doPlace = async (piece: EnginePiece) => {
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
      setPlaceError(
        'Could not place into that document — you may not be its lead designer.',
      );
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

  const restingNote = resting ? (
    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-80">
      the Engine is resting — keyword results for now
    </p>
  ) : null;

  if (pieces.length === 0) {
    return (
      <div className="py-5">
        {restingNote}
        <p className="font-heading text-[13px] italic text-[var(--text-muted)]">
          Nothing on your shelves answers that yet — teach more, and the Engine
          sees more.
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {restingNote}

      {/* Place target — the held document, or a quiet picker (R38 Place →). */}
      {!inDocument && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Place into
          </span>
          {targets.length === 0 ? (
            <span className="text-[11px] italic text-[var(--text-muted)]">
              no open project to place into
            </span>
          ) : (
            targets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPickedId(t.id)}
                className={`min-h-11 min-w-11 rounded-[12px] border px-2.5 py-1 text-[0.66rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
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
        {pieces.map((piece, index) => {
          const placed = placedIds.has(piece.id);
          const img = piece.images?.[0] ?? null;
          return (
            <li
              key={piece.id}
              className="flex items-center gap-3 rounded-[6px] border border-[var(--doc-ink-border)] bg-white px-2.5 py-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[var(--doc-sheet-2)]">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
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
                  {piece.brand ?? piece.layer} ·{' '}
                  {LAYER_NOTE[piece.layer] ?? piece.layer}
                  {matchNote(piece.matched_on)}
                </span>
              </span>
              {placed ? (
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-sage)]">
                  placed ✓
                </span>
              ) : (
                <DocumentAction
                  actionKey="place-engine-result"
                  surfaceKey="engine"
                  regionKey={`result-${index + 1}`}
                  variant="primary"
                  disabled={!targetId || place.isPending}
                  loading={place.isPending}
                  loadingLabel="Placing…"
                  onClick={() => void doPlace(piece)}
                  trailing="→"
                >
                  Place
                </DocumentAction>
              )}
            </li>
          );
        })}
      </ul>

      {placeError && (
        <p className="mt-2 text-[11px] text-[var(--color-terracotta)]">
          {placeError}
        </p>
      )}

      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] opacity-70">
        The Engine · every ask teaches your eye · Designer-Taught Intelligence
      </p>
    </div>
  );
}

/** Matched-on chip copy (copy law: never "AI"; the vector leg is the Engine's
 *  own read, the FTS leg is a plain keyword match). */
function matchNote(matchedOn?: EngineAskMatchSource[]): string {
  if (!matchedOn || matchedOn.length === 0) return '';
  return matchedOn.includes('vector')
    ? ' · the Engine’s read'
    : ' · keyword match';
}

const LAYER_NOTE: Record<string, string> = {
  personal: 'My Library',
  studio: 'Studio',
  catalog: 'Patina Catalog',
};
