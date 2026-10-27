'use client';

/**
 * The Library's single entrance for finding and asking. One controlled query
 * feeds exact cross-layer shelf matches while the designer types; submitting
 * that same query asks the existing Engine. No thread or hidden second field.
 */

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { EngineResults } from '@/components/document/engine/engine-results';
import { DocumentAction } from '../../document-action';
import { FieldSearch } from './field-search';

export function LibrarianBar({
  onPlaced,
  query: controlledQuery,
  onQueryChange,
}: {
  onPlaced?: (pieceName: string, whereName: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const placementContext = useSearchParams();
  const [localQuery, setLocalQuery] = useState('');
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [asking, setAsking] = useState<string | null>(null);

  const ask = (event?: FormEvent) => {
    event?.preventDefault();
    const next = query.trim();
    if (!next) return;
    setQuery(next);
    setAsking(next);
  };

  return (
    <div className="library-search">
      <form
        role="search"
        aria-label="Search the resource library or ask a sourcing question"
        onSubmit={ask}
      >
        {/* US-28 S10c: the field never yields its width to the act beside it.
            It holds at least 240px and the act wraps beneath at 390, so the
            query is never clipped to a letter. */}
        <div className="library-search-row">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (asking) setAsking(null);
            }}
            aria-label="Find a product or ask a sourcing question"
            aria-describedby="library-omnibox-hint"
            placeholder="Product, maker, SKU or a sourcing question"
            data-library-omnibox
            className="library-search-field"
          />
          <DocumentAction
            actionKey="ask-library"
            surfaceKey="library"
            regionKey="library-omnibox"
            variant="tertiary"
            type="submit"
            trailing="→"
            disabled={!query.trim()}
          >
            Ask a sourcing question
          </DocumentAction>
        </div>
        <p id="library-omnibox-hint" className="t-body-sm library-search-note">
          Exact matches update as you type. Enter asks the Library; try
          “white oak console under 72 inches.”
        </p>
      </form>

      <FieldSearch query={query} />

      {asking && (
        <section
          aria-labelledby="library-engine-results"
          data-library-engine-results
          className="library-engine-results"
        >
          <h2 id="library-engine-results" className="eb">
            Sourcing answer
          </h2>
          <EngineResults query={asking} inDocument={null} placementContext={placementContext} onPlaced={onPlaced} />
        </section>
      )}
    </div>
  );
}
