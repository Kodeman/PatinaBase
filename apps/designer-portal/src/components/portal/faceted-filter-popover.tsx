'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, FilterPill } from '@/components/ui/controls';

export interface Facet {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface FacetSelections {
  [facetKey: string]: string[];
}

interface FacetedFilterPopoverProps {
  facets: Facet[];
  value: FacetSelections;
  onChange: (next: FacetSelections) => void;
}

export function FacetedFilterPopover({ facets, value, onChange }: FacetedFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const totalActive = Object.values(value).reduce((sum, vals) => sum + vals.length, 0);

  const toggle = (facetKey: string, optionValue: string) => {
    const current = value[facetKey] ?? [];
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    onChange({ ...value, [facetKey]: next });
  };

  const reset = () => onChange({});

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className={totalActive > 0 ? 'bg-[var(--bg-hover)]' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Filters
        {totalActive > 0 && (
          <span
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.62rem] leading-none"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
          >
            {totalActive}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[320px] rounded-md border bg-[var(--bg-surface)] p-4 shadow-lg"
          style={{ borderColor: 'var(--border-default)' }}
          role="dialog"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="type-label">Filters</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={totalActive === 0}
            >
              Reset
            </Button>
          </div>

          {facets.map((facet) => (
            <div key={facet.key} className="mb-3 last:mb-0">
              <div
                className="mb-1.5"
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                }}
              >
                {facet.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facet.options.map((opt) => {
                  const active = (value[facet.key] ?? []).includes(opt.value);
                  return (
                    <FilterPill
                      key={opt.value}
                      active={active}
                      onClick={() => toggle(facet.key, opt.value)}
                    >
                      {opt.label}
                    </FilterPill>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
