import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  [
    'relative w-full rounded-sm border p-3 text-[0.82rem]',
    '[&>svg~*]:pl-7 [&>svg+div]:translate-y-[-1px]',
    '[&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3.5 [&>svg]:h-4 [&>svg]:w-4',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-body)] [&>svg]:text-[var(--text-muted)]',
        info:
          'border-l-[3px] border-l-[var(--color-info)] border-y-[var(--border-subtle)] border-r-[var(--border-subtle)] bg-[rgba(139,156,173,0.06)] text-[var(--text-body)] [&>svg]:text-[var(--color-info)]',
        success:
          'border-l-[3px] border-l-[var(--color-success)] border-y-[var(--border-subtle)] border-r-[var(--border-subtle)] bg-[rgba(122,155,118,0.06)] text-[var(--text-body)] [&>svg]:text-[var(--color-success)]',
        warning:
          'border-l-[3px] border-l-[var(--color-warning)] border-y-[var(--border-subtle)] border-r-[var(--border-subtle)] bg-[rgba(212,165,116,0.08)] text-[var(--text-body)] [&>svg]:text-[var(--color-warning)]',
        destructive:
          'border-l-[3px] border-l-[var(--color-error)] border-y-[var(--border-subtle)] border-r-[var(--border-subtle)] bg-[rgba(199,123,110,0.06)] text-[var(--color-error)] [&>svg]:text-[var(--color-error)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    style={{ fontFamily: 'var(--font-body)' }}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none text-[var(--text-primary)]', className)}
    style={{ fontFamily: 'var(--font-body)' }}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-[0.82rem] [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
