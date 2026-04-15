import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2',
          'text-[0.85rem] text-[var(--text-primary)]',
          'placeholder:text-[var(--text-muted)]',
          'transition-colors',
          'hover:border-[var(--accent-primary)]',
          'focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        style={{ fontFamily: 'var(--font-body)', ...style }}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
