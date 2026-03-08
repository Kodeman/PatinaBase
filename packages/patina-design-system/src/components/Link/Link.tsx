import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const linkVariants = cva(
  'inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'text-primary underline-offset-4 hover:underline',
        subtle: 'text-foreground hover:text-primary hover:underline underline-offset-4',
        ghost: 'hover:bg-accent hover:text-accent-foreground rounded-md px-2 py-1',
        underline: 'text-foreground underline underline-offset-4 hover:text-primary',
        unstyled: 'text-inherit',
      },
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
      },
      external: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      external: false,
    },
  }
)

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  /**
   * Use Radix Slot for composition
   */
  asChild?: boolean

  /**
   * Show external link icon
   */
  showExternalIcon?: boolean

  /**
   * Is this an external link? (will add rel and target attributes)
   */
  isExternal?: boolean
}

/**
 * Link component for navigation and external links
 *
 * @example
 * ```tsx
 * // Internal link
 * <Link href="/about">About Us</Link>
 *
 * // External link
 * <Link href="https://example.com" isExternal>
 *   Visit Example
 * </Link>
 *
 * // External link with icon
 * <Link href="https://example.com" isExternal showExternalIcon>
 *   Documentation
 * </Link>
 *
 * // Subtle variant
 * <Link variant="subtle" href="/contact">
 *   Contact
 * </Link>
 *
 * // Ghost variant
 * <Link variant="ghost" href="/settings">
 *   Settings
 * </Link>
 * ```
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      className,
      variant,
      size,
      external,
      asChild,
      showExternalIcon,
      isExternal,
      href,
      target,
      rel,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'a'

    // Determine if link is external
    const isExternalLink = isExternal || (href && (href.startsWith('http://') || href.startsWith('https://')))

    // Set appropriate attributes for external links
    const externalProps = isExternalLink
      ? {
          target: target || '_blank',
          rel: rel || 'noopener noreferrer',
        }
      : {}

    return (
      <Comp
        ref={ref}
        href={href}
        className={cn(
          linkVariants({
            variant,
            size,
            external: isExternalLink ? true : false,
            className,
          })
        )}
        {...externalProps}
        {...props}
      >
        {children}
        {showExternalIcon && isExternalLink && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="inline-block"
            aria-hidden="true"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        )}
      </Comp>
    )
  }
)

Link.displayName = 'Link'

export { Link, linkVariants }
