'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { VariantEditor } from '@/components/catalog/variant-editor';

interface VariantsPanelProps {
  productId: string;
  defaultOpen?: boolean;
}

export function VariantsPanel({ productId, defaultOpen = false }: VariantsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
          <span className="font-heading text-[1.1rem] font-normal text-[var(--text-primary)]">
            Variants
          </span>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Admin
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)] p-4">
          <VariantEditor productId={productId} />
        </div>
      )}
    </div>
  );
}
