'use client';

import { type ReactNode } from 'react';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-md border bg-[var(--bg-surface)] px-4 py-2 shadow-lg"
      style={{ borderColor: 'var(--border-default)' }}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3">
        <span className="type-meta text-[var(--text-primary)]">
          {count} selected
        </span>
        <span className="h-4 w-px" style={{ background: 'var(--border-default)' }} />
        {children}
        <span className="h-4 w-px" style={{ background: 'var(--border-default)' }} />
        <button
          type="button"
          onClick={onClear}
          className="text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

interface BulkActionButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'default' | 'danger';
}

export function BulkActionButton({ onClick, children, variant = 'default' }: BulkActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[3px] border px-3 py-1.5 text-[0.8rem] transition-colors"
      style={{
        borderColor: 'var(--border-default)',
        color: variant === 'danger' ? 'var(--color-terracotta, #D4A090)' : 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {children}
    </button>
  );
}
