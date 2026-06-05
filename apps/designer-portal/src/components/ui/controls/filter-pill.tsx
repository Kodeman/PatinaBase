'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FilterPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Optional trailing count rendered in a mono span. */
  count?: number;
}

const base =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.72rem] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1';

const inactive =
  'border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]';

const activeClass =
  'border-[var(--accent-primary)] bg-[var(--bg-hover)] text-[var(--text-primary)]';

const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ className, active = false, count, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active}
        className={cn(base, active ? activeClass : inactive, className)}
        {...props}
      >
        {children}
        {count != null && (
          <span
            className="tabular-nums"
            style={{ fontFamily: 'var(--font-meta)' }}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
);
FilterPill.displayName = 'FilterPill';

export { FilterPill };
