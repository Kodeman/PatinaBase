'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1',
  {
    variants: {
      variant: {
        ghost:
          'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        secondary:
          'border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      },
      size: {
        sm: 'h-8 w-8',
        md: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Required accessible label — applied as both aria-label and title. */
  label: string;
  /**
   * Render the single child element instead of a <button>, merging classes
   * and forwarding props. aria-label/title are forwarded onto the child.
   */
  asChild?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant, size, label, asChild = false, children, type, ...props },
    ref
  ) => {
    if (asChild) {
      if (React.isValidElement(children)) {
        const child = children as React.ReactElement<{ className?: string }>;
        return React.cloneElement(child, {
          // className precedence (deliberate): caller className > child
          // className > variant classes (cn merges left→right, later wins).
          className: cn(
            iconButtonVariants({ variant, size }),
            child.props.className,
            className
          ),
          'aria-label': label,
          title: label,
          ...props,
          // Forward the ref onto the child so callers can reach the element.
          ref,
        } as React.Attributes & {
          className?: string;
          'aria-label'?: string;
          title?: string;
          ref?: React.Ref<unknown>;
        });
      }

      // asChild was requested but children isn't a single valid element.
      // Log in dev and fall back to the normal <button> render below.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error(
          'IconButton: `asChild` requires a single valid React element as its child. ' +
            'Falling back to a native <button>.'
        );
      }
    }

    return (
      <button
        ref={ref}
        // Default to type="button"; a caller's explicit `type` always wins.
        type={type ?? 'button'}
        className={cn(iconButtonVariants({ variant, size }), className)}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

export { IconButton };
