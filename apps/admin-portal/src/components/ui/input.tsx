import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2',
          'text-[0.85rem] text-[var(--text-primary)]',
          'placeholder:text-[var(--text-muted)]',
          'transition-colors',
          'hover:border-[var(--accent-primary)]',
          'focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className
        )}
        style={{ fontFamily: 'var(--font-body)', ...style }}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
