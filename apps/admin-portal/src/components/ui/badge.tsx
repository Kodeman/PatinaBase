import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Editorial badge — thin rounded-sm tag with Patina palette.
 * Keeps the shadcn `Badge` + `badgeVariants` API surface for compatibility.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-[2px] font-mono text-[0.6rem] uppercase tracking-[0.06em] transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.1)] text-[var(--accent-primary)]',
        secondary:
          'border-[var(--border-default)] bg-transparent text-[var(--text-muted)]',
        destructive:
          'border-[var(--color-error)] bg-[rgba(199,123,110,0.1)] text-[var(--color-error)]',
        outline:
          'border-[var(--border-default)] bg-transparent text-[var(--text-body)]',
        success:
          'border-[var(--color-success)] bg-[rgba(122,155,118,0.1)] text-[var(--color-success)]',
        warning:
          'border-[var(--color-warning)] bg-[rgba(212,165,116,0.12)] text-[var(--color-warning)]',
        info:
          'border-[var(--color-info)] bg-[rgba(139,156,173,0.1)] text-[var(--color-info)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
