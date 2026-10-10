"use client";

/**
 * US-21 T-25 — the inline Library search (a6, S3).
 *
 * One field on the sheet: `/` in Rough in and `FILL WITH A PRODUCT` in Spec
 * both open it. Typing lists a few Library pieces as
 * `Emtek Ribbon & Reed knob · satin brass`, then the door to the whole
 * Library, `Search the Library for "knob" →`. No price prints: both lenses
 * that mount it show no money (Q7/F10; T-55b, F18). Arrow keys move the
 * selection, Enter chooses. The host decides what a choice does (place the
 * product, or open T-29's fill preview), so this file writes nothing.
 *
 * Data: `useCrossLayerSearch`, the Library's own search (RLS-scoped to the
 * designer's personal, studio and catalog layers).
 */

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import {
  useCrossLayerSearch,
  type LayerProductLayer,
  type LayerProductRow,
} from "@patina/supabase";

/** Characters typed before the results list opens (as the Library reach-in). */
const MIN_QUERY = 2;
/** Same quiet debounce the Library reach-in keeps. */
const SEARCH_DEBOUNCE_MS = 220;
/** An inline list stays short; the last row opens the whole Library. */
export const INLINE_RESULT_LIMIT = 5;

const LAYER_ORDER: LayerProductLayer[] = ["personal", "studio", "catalog"];

/**
 * A Library row as the inline search reads it. `finish` is the products
 * column; it prints when the search row carries it.
 */
export type LibraryInlineResult = LayerProductRow & { finish?: string | null };

/** `name · finish`, with no price. A missing finish is left out. */
export function libraryResultLine(row: LibraryInlineResult): string {
  const parts = [row.name.trim()];
  const finish = row.finish?.trim();
  if (finish) parts.push(finish);
  return parts.join(" · ");
}

function resultCountSentence(count: number, query: string): string {
  if (count === 0) return `Nothing in the Library matches "${query}".`;
  return `${count} Library ${count === 1 ? "result" : "results"} for "${query}".`;
}

export interface LibraryInlineSearchProps {
  /** Enter, or a click, on a product row. */
  onChoose: (product: LibraryInlineResult) => void;
  /** Enter, or a click, on `Search the Library for "…" →`. */
  onSearchLibrary: (query: string) => void;
  /** The field's starting text, e.g. the line's name. */
  initialQuery?: string;
  /** The field's accessible name. */
  label?: string;
  autoFocus?: boolean;
}

export function LibraryInlineSearch({
  onChoose,
  onSearchLibrary,
  initialQuery = "",
  label = "Search the Library",
  autoFocus = false,
}: LibraryInlineSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(() => initialQuery.trim());
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const listId = `${baseId}-results`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

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

  const open = debounced.length >= MIN_QUERY;
  const { data, isLoading, isError } = useCrossLayerSearch({
    query: debounced,
    perLayerLimit: INLINE_RESULT_LIMIT,
    enabled: open,
  });

  const products = useMemo<LibraryInlineResult[]>(() => {
    if (!open || !data) return [];
    return LAYER_ORDER.flatMap((layer) => data.byLayer[layer] ?? []).slice(
      0,
      INLINE_RESULT_LIMIT,
    );
  }, [data, open]);

  // A new search starts at its first row, as a6 shows it.
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

  /** The products, then the door to the whole Library. */
  const optionCount = products.length + 1;
  const libraryIndex = products.length;
  const active = Math.min(activeIndex, optionCount - 1);

  const choose = (index: number) => {
    if (index === libraryIndex) onSearchLibrary(debounced);
    else onChoose(products[index]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      // Esc with text in the field clears it; an empty field lets Esc through
      // to the sheet (the Build room's return path).
      if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      }
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, optionCount - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  };

  const announcement = !open
    ? ""
    : isError
      ? "The Library could not be searched. Try again."
      : isLoading && !data
        ? ""
        : resultCountSentence(products.length, debounced);

  return (
    <div data-library-inline-search className="relative">
      <input
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(active) : undefined}
        value={query}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full border-0 border-b border-[var(--sheet-rule-strong)] bg-transparent px-0 py-2 text-[15px] leading-[1.5] text-[var(--sheet-ink)] placeholder:text-[var(--sheet-ink-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Library results"
          className="mt-1"
        >
          {products.map((row, index) => (
            <li
              key={row.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keep focus in the field; the click still chooses.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              className={`flex min-h-[44px] cursor-pointer items-center border-b border-l-2 border-b-[var(--sheet-rule)] pl-3 text-[14px] leading-[1.4] text-[var(--sheet-ink)] [font-variant-numeric:tabular-nums] hover:bg-[var(--sheet-row-hover)] ${
                index === active
                  ? "border-l-[var(--sheet-ink)]"
                  : "border-l-transparent"
              }`}
            >
              {libraryResultLine(row)}
            </li>
          ))}
          <li
            id={optionId(libraryIndex)}
            role="option"
            aria-selected={active === libraryIndex}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(libraryIndex)}
            onClick={() => choose(libraryIndex)}
            className={`flex min-h-[44px] cursor-pointer items-center border-l-2 pl-3 ${
              active === libraryIndex
                ? "border-l-[var(--sheet-ink)]"
                : "border-l-transparent"
            }`}
          >
            <span className="border-b border-[var(--sheet-ink)] font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[var(--sheet-ink)]">
              {`Search the Library for "${debounced}" →`}
            </span>
          </li>
        </ul>
      )}

      {/* The count is read aloud; it shows on the sheet only when nothing matched. */}
      <p
        role="status"
        aria-live="polite"
        className={
          open && products.length === 0 && announcement
            ? "mt-2 text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)]"
            : "sr-only"
        }
      >
        {announcement}
      </p>
    </div>
  );
}
