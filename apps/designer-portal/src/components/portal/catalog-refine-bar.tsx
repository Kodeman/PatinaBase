'use client';

import { useState } from 'react';
import { StrataMark } from './strata-mark';

interface CatalogRefineBarProps {
  styleFilter: string;
  onStyleChange: (style: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  styleOptions: string[];
  categoryOptions: string[];
}

export function CatalogRefineBar({
  styleFilter,
  onStyleChange,
  categoryFilter,
  onCategoryChange,
  styleOptions,
  categoryOptions,
}: CatalogRefineBarProps) {
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters =
    (styleFilter && styleFilter !== 'All Styles') ||
    (categoryFilter && categoryFilter !== 'All');

  const activeSummary = [
    styleFilter !== 'All Styles' ? styleFilter : null,
    categoryFilter !== 'All' ? categoryFilter : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mb-4">
      {/* Toggle row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent type-meta text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <span
          className="inline-block text-[0.6rem] transition-transform"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transitionDuration: 'var(--duration-fast)',
          }}
        >
          ▸
        </span>
        Refine
        {hasActiveFilters && !expanded && (
          <span className="ml-1 text-[var(--text-primary)]">{activeSummary}</span>
        )}
        {hasActiveFilters && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onStyleChange('All Styles');
              onCategoryChange('All');
            }}
            className="ml-1 cursor-pointer text-[0.6rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Clear
          </span>
        )}
      </button>

      {/* Expanded filter section */}
      {expanded && (
        <div className="mt-3">
          <StrataMark variant="micro" />
          <div className="flex flex-col gap-3 py-3">
            {/* Style filters */}
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="type-meta-small text-[var(--text-subtle)] w-16 shrink-0">Style</span>
              <div className="flex flex-wrap gap-3">
                {styleOptions.map((style) => (
                  <button
                    key={style}
                    onClick={() => onStyleChange(style)}
                    className={`cursor-pointer border-0 bg-transparent type-meta transition-colors ${
                      styleFilter === style
                        ? 'text-[var(--text-primary)] underline underline-offset-4 decoration-[var(--accent-primary)]'
                        : 'text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]'
                    }`}
                    style={{ transitionDuration: 'var(--duration-fast)' }}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="type-meta-small text-[var(--text-subtle)] w-16 shrink-0">Category</span>
              <div className="flex flex-wrap gap-3">
                {categoryOptions.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => onCategoryChange(cat)}
                    className={`cursor-pointer border-0 bg-transparent type-meta transition-colors ${
                      categoryFilter === cat
                        ? 'text-[var(--text-primary)] underline underline-offset-4 decoration-[var(--accent-primary)]'
                        : 'text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]'
                    }`}
                    style={{ transitionDuration: 'var(--duration-fast)' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <StrataMark variant="micro" />
        </div>
      )}
    </div>
  );
}
