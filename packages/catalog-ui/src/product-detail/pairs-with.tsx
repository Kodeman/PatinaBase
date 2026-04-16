'use client';

import { useState, useCallback } from 'react';
import { useProductEdit } from './product-edit-context';

export interface PairsWithRelation {
  id: string;
  relationType: 'pairs_with' | 'alternative' | 'never_with' | string;
  relatedProductId: string;
  relatedProduct?: {
    id: string;
    name: string;
    brand?: string;
    price?: number;
    images?: string[];
  };
}

export interface PairsWithSearchResult {
  id: string;
  name: string;
  brand?: string;
  images?: string[];
}

interface PairsWithProps {
  relations?: PairsWithRelation[];
  isLoading?: boolean;
  onAddRelation?: (relatedProductId: string) => void | Promise<void>;
  onRemoveRelation?: (relation: PairsWithRelation) => void | Promise<void>;
  onSearch?: (query: string) => void;
  searchResults?: PairsWithSearchResult[];
}

const relationLabels: Record<string, string> = {
  pairs_with: '✦ Complementary style',
  alternative: '↔ Alternative option',
  never_with: '✕ Avoid pairing',
};

export function PairsWith({
  relations = [],
  isLoading = false,
  onAddRelation,
  onRemoveRelation,
  onSearch,
  searchResults = [],
}: PairsWithProps) {
  const { mode, draft } = useProductEdit();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const pairsWithRelations = relations.filter((r) => r.relationType === 'pairs_with');

  const handleQueryChange = useCallback(
    (v: string) => {
      setSearchQuery(v);
      onSearch?.(v);
    },
    [onSearch]
  );

  if (pairsWithRelations.length === 0 && mode === 'present') return null;

  return (
    <div className="mb-8">
      <div className="mb-2 flex flex-col gap-1 py-4">
        <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
        <div className="h-[1.5px] w-12 rounded-sm bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-9 rounded-sm bg-[var(--accent-primary)] opacity-35" />
      </div>

      <h3 className="mb-2 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
        Pairs Beautifully With
      </h3>
      <p className="mb-4 font-body text-[0.82rem] text-[var(--text-muted)]">
        Products chosen by our designers to complement this piece.
      </p>

      {isLoading ? (
        <div className="py-4 text-center">
          <span className="type-meta animate-pulse">Loading pairings...</span>
        </div>
      ) : pairsWithRelations.length > 0 ? (
        <div>
          {pairsWithRelations.map((relation) => {
            const rp = relation.relatedProduct;
            if (!rp) return null;
            const coverImg = rp.images?.[0];

            return (
              <div
                key={relation.id}
                className="group grid grid-cols-[80px_1fr] items-center gap-3 border-b border-[rgba(229,226,221,0.4)] py-3.5 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <div className="h-[60px] w-[80px] overflow-hidden rounded bg-[var(--color-pearl)]">
                  {coverImg ? (
                    <img src={coverImg} alt={rp.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-body text-[0.85rem] font-medium text-[var(--text-primary)]">
                      {rp.name}
                    </div>
                    {rp.brand && (
                      <div className="font-body text-[0.72rem] italic text-[var(--color-aged-oak)]">
                        {rp.brand}
                      </div>
                    )}
                    {rp.price && (
                      <div className="mt-0.5 font-heading text-[0.88rem] font-semibold text-[var(--text-primary)]">
                        ${rp.price.toLocaleString()}
                      </div>
                    )}
                    <div className="mt-0.5 font-mono text-[0.52rem] uppercase tracking-[0.04em] text-[var(--color-sage)]">
                      {relationLabels[relation.relationType] || relation.relationType}
                    </div>
                  </div>

                  {mode === 'edit' && onRemoveRelation && (
                    <button
                      onClick={() => onRemoveRelation(relation)}
                      className="cursor-pointer border-none bg-transparent font-mono text-[0.55rem] uppercase tracking-[0.04em] text-[var(--color-terracotta)] opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-4 font-body text-[0.85rem] italic text-[var(--text-muted)]">
          {mode === 'edit'
            ? 'No pairings yet. Search your catalog to add companion products.'
            : 'Related products will appear here as the catalog grows.'}
        </p>
      )}

      {mode === 'edit' && onAddRelation && (
        <div className="relative mt-4">
          {!showSearch ? (
            <button
              onClick={() => setShowSearch(true)}
              className="cursor-pointer rounded border border-dashed border-[var(--color-pearl)] bg-transparent px-4 py-2.5 font-body text-[0.82rem] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            >
              + Add Companion Product
            </button>
          ) : (
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search catalog by name or maker..."
                className="w-full max-w-md rounded-sm border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
              />

              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-w-md rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg">
                  {searchResults.map((product) => {
                    const alreadyAdded = relations.some((r) => r.relatedProductId === product.id);
                    return (
                      <button
                        key={product.id}
                        disabled={alreadyAdded || product.id === draft.id}
                        onClick={() => {
                          void onAddRelation(product.id);
                          setSearchQuery('');
                          setShowSearch(false);
                        }}
                        className={`flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${
                          alreadyAdded ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-[var(--color-pearl)]">
                          {product.images?.[0] && (
                            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div>
                          <div className="font-body text-[0.82rem] font-medium text-[var(--text-primary)]">
                            {product.name}
                          </div>
                          <div className="font-body text-[0.7rem] text-[var(--text-muted)]">
                            {product.brand} {alreadyAdded && '(already added)'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="mt-2 cursor-pointer border-none bg-transparent font-body text-[0.75rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
