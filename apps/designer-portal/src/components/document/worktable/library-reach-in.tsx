"use client";

/**
 * W3 3c — The Library Reach-In: one door for pieces.
 *
 * A piece used to enter the scheme through four doors (the Library route, the
 * picker modal, the spec-book route, the capture inbox). On the Speccing table
 * it enters through one: a quiet scored search line on the paper. Typing lays
 * a sheet OVER the paper (DocSheet — D1: the work beneath never unmounts) with
 * cross-layer library results; pressing a result adds it to the proposal's
 * FF&E scheme through the SAME creation path the Drafting Room's FF&E facet
 * uses — `buildProposalItemFromPick` → `useAddProposalItem` — so a reached-in
 * piece is indistinguishable from a picker-added one. The sheet stays open for
 * repeated adds (a designer specs several pieces in one reach); Esc puts the
 * sheet back and nothing else (DocSheet's Esc precedence).
 *
 * Deliberately NOT rebuilt here: the picker's configure step. An optioned
 * piece (variant/configured/custom) is taken "decide later" — the envelope
 * records `skipped: true` exactly as the picker's own skip does, and the
 * schedule line shows the debt downstream. Warn, never block.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Library } from "lucide-react";
import {
  useAddProposalItem,
  useCrossLayerSearch,
  type LayerProductLayer,
  type LayerProductRow,
} from "@patina/supabase";
import {
  reachInDocCodesKey,
  useReachInDocCodes,
} from "./use-reach-in-doc-codes";
import { DocSheet } from "../overlays/doc-sheet";
import { buildProposalItemFromPick } from "@/components/portal/scope-builder/build-proposal-item-from-pick";
import type { ProductPickResult } from "@/components/portal/proposals/product-picker-modal";
import { useDraftingFacetInvalidation } from "@/hooks/use-drafting-facet-invalidation";
import { proposalEvents } from "@/lib/analytics";
import { formatDollars } from "@/lib/currency-ui";
import { StrataSweep } from "@/components/ui/strata-sweep";

/** Characters typed before the sheet lays over the paper. */
const MIN_REACH_QUERY = 2;
/** Same quiet debounce the Library room's FieldSearch keeps. */
const SEARCH_DEBOUNCE_MS = 220;

const LAYER_NOTE: Record<LayerProductLayer, string> = {
  personal: "My Library",
  studio: "Studio",
  catalog: "Patina Catalog",
};
const LAYER_ORDER: LayerProductLayer[] = ["personal", "studio", "catalog"];

/**
 * A library row as the picker's library tab would emit it — denormalized so no
 * follow-up fetch is needed. The reach-in has no configure step (that ceremony
 * lives in the picker), so an optioned piece carries the picker's own
 * "decide later" debt instead of a resolved specification.
 */
function toPick(row: LayerProductRow): ProductPickResult {
  const optioned = row.configuration_mode !== "standard";
  return {
    productId: row.id,
    name: row.name,
    imageUrl: row.images?.[0] ?? null,
    priceCents: row.price_retail,
    priceTradeCents: row.price_trade,
    vendorName: row.brand ?? null,
    layer: row.layer,
    scopeRoomId: null,
    configurationMode: row.configuration_mode,
    configurationSummary: row.configuration_summary,
    configurationSkipped: optioned ? true : undefined,
  };
}

export function LibraryReachIn({ proposalId }: { proposalId: string }) {
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  /** The quiet added-confirmation line; null until the first add. */
  const [status, setStatus] = useState<string | null>(null);
  /** Adds this reach — product id → count, for the "added" mark on a row. */
  const [addedCounts, setAddedCounts] = useState<Map<string, number>>(
    () => new Map(),
  );
  const sheetInputRef = useRef<HTMLInputElement | null>(null);

  const addItem = useAddProposalItem();
  const queryClient = useQueryClient();
  const refreshDraftingSummary = useDraftingFacetInvalidation(proposalId);
  // The taken doc codes, on the reach-in's OWN key (F1): the schedule query
  // hash is shared by two different projections and this surface co-mounts
  // both — see use-reach-in-doc-codes. handleAdd refreshes it after each add,
  // since no shared invalidation reaches this key.
  const { data: existingDocCodes = [] } = useReachInDocCodes(proposalId);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setDebounced("");
      return;
    }
    const timer = window.setTimeout(
      () => setDebounced(normalized),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError } = useCrossLayerSearch({
    query: debounced,
  });

  // DocSheet focuses its panel one frame after open; wait it out so the
  // designer's typing continues in the sheet's line without a click.
  useEffect(() => {
    if (!sheetOpen) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        sheetInputRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [sheetOpen]);

  const groups = useMemo(() => {
    if (!data) {
      return [] as Array<{ layer: LayerProductLayer; rows: LayerProductRow[] }>;
    }
    return LAYER_ORDER.map((layer) => ({
      layer,
      rows: data.byLayer[layer] ?? [],
    })).filter((group) => group.rows.length > 0);
  }, [data]);

  const searching = debounced.length > 0;

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length >= MIN_REACH_QUERY) setSheetOpen(true);
  };

  /** Esc / backdrop / put-back — the sheet goes back, the paper stays. */
  const closeSheet = () => {
    setSheetOpen(false);
    setQuery("");
    setStatus(null);
    setAddedCounts(new Map());
  };

  const handleAdd = (row: LayerProductRow) => {
    const line = buildProposalItemFromPick(toPick(row), {
      ffeCategorySlug: null,
      existingDocCodes,
    });
    return addItem
      .mutateAsync({ proposalId, ...line })
      .then(() => {
        proposalEvents.itemAdded({
          proposalId,
          itemType: "fixed",
          hasProduct: true,
          lineTotal: line.unitPrice,
        });
        setAddedCounts((prev) => {
          const next = new Map(prev);
          next.set(row.id, (next.get(row.id) ?? 0) + 1);
          return next;
        });
        setStatus(`${row.name} · added to the scheme`);
        // The taken-codes read lives on its own key (F1), outside every
        // shared invalidation prefix — refresh it here or the next suggested
        // doc code could collide with the line just added.
        void queryClient.invalidateQueries({
          queryKey: reachInDocCodesKey(proposalId),
        });
        return refreshDraftingSummary();
      })
      .catch(() => {
        setStatus(`${row.name} could not be added just now`);
      });
  };

  /** The scored search line — a rule under the words, never a box. */
  const lineClass =
    "flex min-h-11 w-full items-center gap-2 border-b border-[var(--doc-ink-border)] focus-within:border-[var(--color-clay)]";
  const inputClass =
    "min-h-11 w-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--color-quiet-ink)]";

  return (
    <div data-library-reach-in className="w-full">
      {/* While the sheet is laid the outer line is hidden from assistive
          tech and the tab order (F8) — one search field, not two with the
          same label. It keeps the live query as its value (F3): a keystroke
          landing here in the pre-focus window builds target.value from what
          is shown, so an emptied control would clobber the typed prefix. */}
      <div className={lineClass} aria-hidden={sheetOpen || undefined}>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[13px] text-[var(--color-quiet-ink)]"
        >
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Reach into the library"
          placeholder="Reach into the library…"
          data-testid="library-reach-in-line"
          tabIndex={sheetOpen ? -1 : undefined}
          className={inputClass}
        />
      </div>

      <DocSheet
        open={sheetOpen}
        onClose={closeSheet}
        title="The Library"
        icon={Library}
        pageLabel="Reach-in"
      >
        <div className={lineClass}>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[13px] text-[var(--color-quiet-ink)]"
          >
            ⌕
          </span>
          <input
            ref={sheetInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Reach into the library"
            placeholder="Reach into the library…"
            data-testid="library-reach-in-sheet-input"
            className={inputClass}
          />
        </div>

        {/* The quiet added-confirmation line — present from the start so the
            live region exists before its first announcement. */}
        <p
          role="status"
          data-testid="library-reach-in-status"
          className="mt-2 min-h-[18px] font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]"
        >
          {status}
        </p>

        <div aria-busy={isLoading || undefined} className="mt-3">
          {!searching && (
            <p className="py-3 font-heading text-[14px] italic text-[var(--color-quiet-ink)]">
              Keep typing — pieces surface as you reach.
            </p>
          )}

          {searching && isLoading && (
            <div className="flex items-center gap-2 py-3">
              <StrataSweep size="sm" label="Searching the shelves" />
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                Looking…
              </span>
            </div>
          )}

          {searching && isError && (
            <p className="py-3 text-[14px] italic text-[var(--color-charcoal)]">
              The shelves could not be searched just now.
            </p>
          )}

          {searching && !isLoading && !isError && groups.length === 0 && (
            <p className="py-3 font-heading text-[14px] italic text-[var(--color-charcoal)]">
              Nothing on the shelves matches &ldquo;{debounced}&rdquo;.
            </p>
          )}

          {searching &&
            !isLoading &&
            !isError &&
            groups.map((group) => (
              <div key={group.layer} className="mt-3">
                <div className="mb-1 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                  {LAYER_NOTE[group.layer]} · {group.rows.length}
                </div>
                <ul>
                  {group.rows.map((row) => {
                    const added = addedCounts.get(row.id) ?? 0;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => void handleAdd(row)}
                          disabled={addItem.isPending}
                          className="group flex min-h-11 w-full items-center gap-3 border-b border-[var(--doc-ink-border)] px-1 py-2 text-left transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-[var(--doc-sheet-2)]">
                            {row.images?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.images[0]}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]"
                              >
                                {row.name.slice(0, 1)}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-[var(--color-charcoal)] transition-colors group-hover:text-[var(--color-clay)]">
                              {row.name}
                            </span>
                            <span className="block truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
                              {row.brand ?? "—"}
                              {row.price_retail != null
                                ? ` · ${formatDollars(row.price_retail)}`
                                : ""}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
                            {added > 0
                              ? added === 1
                                ? "added · again ↳"
                                : `×${added} · again ↳`
                              : "add ↳"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      </DocSheet>
    </div>
  );
}
