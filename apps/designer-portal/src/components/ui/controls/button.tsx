'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Canonical portal button.
 *
 * User-locked design decisions:
 *   primary CTA  = clay fill (--accent-primary) with light text
 *   secondary    = outline
 *   ghost        = text-only
 *   danger       = terracotta
 *
 * This is a drop-in superset of the legacy catalog-ui `PortalButton`
 * (which accepted variant 'primary' | 'secondary' | 'ghost', className,
 * asChild, and standard button props). `PortalButton` is re-exported below
 * as an alias for migration compatibility.
 *
 * Note on `asChild`: implemented with React.cloneElement rather than
 * @radix-ui/react-slot, because react-slot is not a direct dependency of
 * the designer-portal and is not hoisted to a resolvable location. The
 * task forbids adding new dependencies, so cloneElement on a single child
 * is the simplest working approach. It merges className and forwards the
 * remaining props onto the child element.
 */
export const buttonVariants = cva(
  'type-btn-text inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent-primary)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)]',
        secondary:
          'bg-transparent border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
        ghost:
          'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        danger:
          'bg-[var(--color-terracotta)] text-[var(--bg-primary)] hover:opacity-90',
      },
      size: {
        sm: 'px-4 py-[0.45rem] text-[0.78rem]',
        md: 'px-[1.6rem] py-[0.7rem]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Render the single child element instead of a <button>, merging classes
   * and forwarding props (e.g. for next/link <a> wrapping). When `asChild`
   * is true, `loading` is ignored (the child is responsible for its own
   * loading affordance).
   */
  asChild?: boolean;
  /**
   * Shows a spinner, disables the button, and sets aria-busy. Only honored
   * when not `asChild`.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      type,
      ...props
    },
    ref
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      if (React.isValidElement(children)) {
        // loading is intentionally ignored in asChild mode — the child owns
        // its own loading affordance. Remaining props (onClick, etc.) are
        // forwarded onto the child, mirroring radix Slot behavior; the
        // forwarded `ref` is attached to the child so callers can still reach
        // the rendered element (e.g. an anchor).
        const child = children as React.ReactElement<{
          className?: string;
          onClick?: React.MouseEventHandler<HTMLElement>;
        }>;
        // cloneElement (unlike radix Slot) doesn't compose event handlers —
        // merge onClick explicitly so a handler on the child is never
        // silently replaced by one on the Button (or vice versa).
        const childOnClick = child.props.onClick;
        const outerOnClick = props.onClick as
          | React.MouseEventHandler<HTMLElement>
          | undefined;
        const mergedOnClick =
          outerOnClick && childOnClick
            ? (e: React.MouseEvent<HTMLElement>) => {
                outerOnClick(e);
                childOnClick(e);
              }
            : (outerOnClick ?? childOnClick);
        return React.cloneElement(child, {
          ...props,
          onClick: mergedOnClick,
          // className precedence (deliberate): caller className > child
          // className > variant classes (cn merges left→right, later wins).
          className: cn(
            buttonVariants({ variant, size }),
            child.props.className,
            className
          ),
          ref,
        } as React.Attributes & { className?: string; ref?: React.Ref<unknown> });
      }

      // asChild was requested but children isn't a single valid element.
      // Log in dev and fall back to the normal <button> render below.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error(
          'Button: `asChild` requires a single valid React element as its child. ' +
            'Falling back to a native <button>.'
        );
      }
    }

    return (
      <button
        ref={ref}
        // Default to type="button" so a ghost "Cancel" inside a <form> never
        // implicitly submits it; a caller's explicit `type` always wins.
        type={type ?? 'button'}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

/** Migration alias — legacy call sites import `PortalButton`. */
export const PortalButton = Button;

export { Button };
