import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm',
    'text-[0.78rem] font-medium tracking-[0.01em]',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]',
        destructive: 'bg-[var(--color-error)] text-white hover:bg-[#B06B5E]',
        outline:
          'border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]',
        secondary:
          'bg-[var(--color-pearl)] text-[var(--text-primary)] hover:bg-[#DAD6D0]',
        ghost:
          'text-[var(--text-body)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        link: 'text-[var(--accent-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-[0.72rem]',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, style, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ fontFamily: 'var(--font-body)', ...style }}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
