'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputVariant = 'bordered' | 'underline';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  /** Renders error-state border + ring (--color-error). */
  invalid?: boolean;
}

const baseBordered =
  'flex w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-50';

const baseUnderline =
  'flex w-full border-0 border-b border-[var(--border-default)] bg-transparent rounded-none px-0 py-2 text-[0.85rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0 focus:border-[var(--accent-primary)] disabled:opacity-50';

const invalidBordered =
  'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]';

const invalidUnderline =
  'border-[var(--color-error)] focus:border-[var(--color-error)]';

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'bordered', invalid = false, style, ...props }, ref) => {
    const base = variant === 'underline' ? baseUnderline : baseBordered;
    const invalidClass = invalid
      ? variant === 'underline'
        ? invalidUnderline
        : invalidBordered
      : '';
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(base, invalidClass, className)}
        style={{ fontFamily: 'var(--font-body)', ...style }}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
