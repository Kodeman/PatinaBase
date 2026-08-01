'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/ui/controls';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-[var(--doc-shell-floating-bottom,1.5rem)] left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-x-auto overscroll-x-contain rounded-md border bg-[var(--bg-surface)] px-4 py-2 shadow-lg"
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
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
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
    <Button
      variant={variant === 'danger' ? 'danger' : 'secondary'}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
