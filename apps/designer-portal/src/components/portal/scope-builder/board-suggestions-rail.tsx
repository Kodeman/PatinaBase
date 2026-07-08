'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/controls';
import {
  useTaughtAlternatives,
  useLogSuggestionEvent,
  type AddBoardItemInput,
  type ProposalBoardItem,
  type TaughtAlternative,
} from '@patina/supabase';

/**
 * "More like this" rail (B6 — taught) for the board editor sidebar.
 *
 * Anchors on the LAST-ADDED product item on the board (highest created_at,
 * z_index as the tie-break) and surfaces alternatives ranked from the designer's
 * OWN corpus first — find_taught_alternatives boosts the personal, then studio,
 * layers ahead of the shared catalog, the same taught ranking the flagged-line
 * Alternatives band uses. Each shown / add / dismiss is logged as a
 * suggestion_event (context 'board_rail') — the Designer-Taught loop's receipts.
 * Each card's Add routes through the editor's shared add-item path (snapshot into
 * data, drop near canvas center, z = max+1).
 *
 * Degrades silently: no product items, RPC error, missing embeddings (the RPC
 * returns empty when the anchor has no embedding — common in local dev), or
 * every suggestion already on / dismissed from the board → renders nothing.
 */

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

interface BoardSuggestionsRailProps {
  items: ProposalBoardItem[];
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}

export function BoardSuggestionsRail({ items, onAdd }: BoardSuggestionsRailProps) {
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const logEvent = useLogSuggestionEvent();

  // Last-added product item on the board (created_at desc, z_index desc).
  const anchor = useMemo(() => {
    const productItems = items.filter((i) => i.type === 'product' && i.product_id);
    if (productItems.length === 0) return null;
    return [...productItems].sort((a, b) => {
      const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '');
      if (byCreated !== 0) return byCreated;
      return b.z_index - a.z_index;
    })[0];
  }, [items]);

  const boardId = anchor?.board_id ?? null;

  // Corpus-first taught alternatives. Hooks run unconditionally; the query
  // disables itself on '' and swallows missing-RPC / no-embedding into [].
  const { data: similar = [], isError } = useTaughtAlternatives(anchor?.product_id ?? '', 6);

  // Don't re-suggest products already on the board or dismissed this session.
  const onBoard = useMemo(
    () => new Set(items.map((i) => i.product_id).filter(Boolean)),
    [items],
  );
  const suggestions = useMemo(
    () => similar.filter((p) => !onBoard.has(p.id) && !dismissed.has(p.id)),
    [similar, onBoard, dismissed],
  );

  // Log the shown batch once per distinct product set — a training receipt.
  const shownKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (suggestions.length === 0 || !boardId) return;
    const key = suggestions.map((p) => p.id).join(',');
    if (shownKeyRef.current === key) return;
    shownKeyRef.current = key;
    logEvent.mutate(
      suggestions.map((p, i) => ({
        context: 'board_rail' as const,
        action: 'shown' as const,
        productId: p.id,
        boardId,
        rank: i,
      })),
    );
    // logEvent identity is stable; re-run only when the shown set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, boardId]);

  // Degrade silently — no rail without an anchor, on error, or when nothing is
  // left to show.
  if (!anchor || isError || suggestions.length === 0) return null;

  const add = (p: TaughtAlternative, rank: number) => {
    if (boardId) {
      logEvent.mutate({ context: 'board_rail', action: 'accepted', productId: p.id, boardId, rank });
    }
    onAdd({
      type: 'product',
      productId: p.id,
      imageUrl: p.images?.[0] ?? null,
      data: {
        name: p.name,
        price_cents: p.price_retail,
        image_url: p.images?.[0] ?? null,
      },
    });
  };

  const dismiss = (p: TaughtAlternative, rank: number) => {
    setDismissed((s) => new Set(s).add(p.id));
    if (boardId) {
      logEvent.mutate({ context: 'board_rail', action: 'dismissed', productId: p.id, boardId, rank });
    }
  };

  return (
    <div
      data-testid="board-suggestions-rail"
      className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between"
      >
        <span className="type-meta block text-[var(--accent-primary)]">More like this · from your library</span>
        <span aria-hidden className="text-xs text-[var(--text-muted)]">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {suggestions.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <div
                className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-[var(--border-default)] bg-[var(--bg-muted)]"
                aria-hidden={!p.images?.[0]}
              >
                {p.images?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={p.name}>
                  {p.name}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  {(p.layer === 'personal' || p.layer === 'studio') && (
                    <span className="type-meta text-[var(--accent-primary)]">
                      {p.layer === 'personal' ? 'Yours' : 'Studio'}
                    </span>
                  )}
                  {typeof p.price_retail === 'number' && <span>{formatDollars(p.price_retail)}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => add(p, i)}>
                Add
              </Button>
              <button
                type="button"
                aria-label={`Dismiss ${p.name}`}
                onClick={() => dismiss(p, i)}
                className="rounded-sm px-1.5 py-1 text-sm leading-none text-[var(--text-muted)] hover:text-[var(--text-default)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
