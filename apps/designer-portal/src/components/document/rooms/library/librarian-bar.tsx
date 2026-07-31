'use client';

/**
 * The Library's single entrance for finding and asking. One controlled query
 * feeds exact cross-layer shelf matches while the designer types; submitting
 * that same query asks the existing Engine. No thread or hidden second field.
 */

import { useState, type FormEvent } from 'react';
import { EngineResults } from '@/components/document/engine/engine-results';
import { DocumentAction } from '../../document-action';
import { FieldSearch } from './field-search';

export function LibrarianBar({
  onPlaced,
}: {
  onPlaced?: (pieceName: string, whereName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState<string | null>(null);

  const ask = (event?: FormEvent) => {
    event?.preventDefault();
    const next = query.trim();
    if (!next) return;
    setQuery(next);
    setAsking(next);
  };

  return (
    <div className="border-b border-[var(--doc-ink-border)] px-6 pb-8 pt-10 text-center sm:px-9">
      <h1 className="font-heading text-[2.1rem] font-normal leading-[1.08] text-[var(--color-charcoal)] min-[700px]:text-[2.5rem]">
        Find a piece—or <em className="italic text-[var(--color-charcoal)]">ask about one.</em>
      </h1>
      <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-relaxed text-[var(--color-charcoal)]">
        Known pieces surface immediately. Ask reads the same words across all three shelves.
      </p>

      <form
        role="search"
        aria-label="Find or ask the Library"
        onSubmit={ask}
        className="mx-auto mt-6 max-w-[680px]"
      >
        <div className="flex min-h-12 items-center rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-2 focus-within:border-[var(--color-clay)]">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center font-mono text-[14px] text-[var(--color-charcoal)]"
          >
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (asking) setAsking(null);
            }}
            aria-label="Find a piece or ask the Library"
            aria-describedby="library-omnibox-hint"
            placeholder="Piece, maker, SKU, category, or material question…"
            data-library-omnibox
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 py-2 text-left text-[16px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-body)]"
          />
          <DocumentAction
            actionKey="ask-library"
            surfaceKey="library"
            regionKey="library-omnibox"
            variant="secondary"
            type="submit"
            trailing="→"
            disabled={!query.trim()}
          >
            Ask
          </DocumentAction>
        </div>
        <p
          id="library-omnibox-hint"
          className="mt-2 text-left font-mono text-[12px] leading-relaxed text-[var(--color-charcoal)]"
        >
          Exact matches update as you type · Enter asks the Library · Try “white oak console under
          72 inches.”
        </p>
      </form>

      <FieldSearch query={query} />

      {asking && (
        <section
          aria-labelledby="library-engine-results"
          data-library-engine-results
          className="mx-auto mt-6 max-w-[680px] border-t border-[var(--doc-ink-border)] pt-4 text-left"
        >
          <h2
            id="library-engine-results"
            className="mb-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
          >
            Library answer
          </h2>
          <EngineResults query={asking} inDocument={null} onPlaced={onPlaced} />
        </section>
      )}
    </div>
  );
}
