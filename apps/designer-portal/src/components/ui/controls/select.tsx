'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Renders error-state border + ring (--color-error). */
  invalid?: boolean;
  /** className applied to the wrapping <span> (e.g. width control). */
  wrapperClassName?: string;
}

const base =
  'flex w-full appearance-none rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] pl-3 pr-8 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-50';

const invalidClass =
  'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]';

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, invalid = false, style, children, ...props }, ref) => {
    return (
      <span className={cn('relative inline-flex w-full items-center', wrapperClassName)}>
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(base, invalid && invalidClass, className)}
          style={{ fontFamily: 'var(--font-body)', ...style }}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-[var(--text-muted)]"
          aria-hidden="true"
        />
      </span>
    );
  }
);
Select.displayName = 'Select';

export { Select };
