'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/controls';
import {
  useSimilarProducts,
  type AddBoardItemInput,
  type ProposalBoardItem,
} from '@patina/supabase';

/**
 * "More like this" rail for the board editor sidebar.
 *
 * Anchors on the LAST-ADDED product item on the board (highest created_at,
 * z_index as the tie-break) and surfaces vector-similar catalog products via
 * useSimilarProducts → find_products_similar_to RPC. Each card's Add button
 * routes through the editor's shared add-item path (snapshot into data, drop
 * near canvas center, z = max+1) — the same shape the ProductPickerModal pick
 * produces.
 *
 * Degrades silently: no product items, RPC error, missing embeddings (the RPC
 * returns an empty set when the anchor has no embedding — common in local
 * dev), or every suggestion already on the board → renders nothing.
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

  // Hooks must run unconditionally; the query disables itself on ''.
  const { data: similar = [], isError } = useSimilarProducts(anchor?.product_id ?? '', 6);

  // Don't re-suggest products that are already on the board.
  const onBoard = useMemo(
    () => new Set(items.map((i) => i.product_id).filter(Boolean)),
    [items],
  );
  const suggestions = similar.filter((p) => !onBoard.has(p.id));

  // Degrade silently — no rail without an anchor, on error, or when the RPC
  // comes back empty (e.g. no embeddings in this environment).
  if (!anchor || isError || suggestions.length === 0) return null;

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
        <span className="type-meta block text-[var(--accent-primary)]">More like this</span>
        <span aria-hidden className="text-xs text-[var(--text-muted)]">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {suggestions.map((p) => (
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
                {typeof p.price_retail === 'number' && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDollars(p.price_retail)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onAdd({
                    type: 'product',
                    productId: p.id,
                    imageUrl: p.images?.[0] ?? null,
                    data: {
                      name: p.name,
                      price_cents: p.price_retail,
                      image_url: p.images?.[0] ?? null,
                    },
                  })
                }
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
