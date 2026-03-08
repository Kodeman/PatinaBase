import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const blockquoteVariants = cva(
  'border-l-4 pl-4 italic my-4',
  {
    variants: {
      variant: {
        default: 'border-border text-foreground',
        primary: 'border-primary text-foreground',
        success: 'border-green-500 text-foreground',
        warning: 'border-yellow-500 text-foreground',
        error: 'border-red-500 text-foreground',
      },
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BlockquoteProps
  extends React.BlockquoteHTMLAttributes<HTMLQuoteElement>,
    VariantProps<typeof blockquoteVariants> {
  /**
   * Citation source (author, publication, etc.)
   */
  cite?: string

  /**
   * Show citation inline below the quote
   */
  showCite?: boolean
}

/**
 * Blockquote component for displaying quoted content
 *
 * @example
 * ```tsx
 * // Basic blockquote
 * <Blockquote>
 *   Design is not just what it looks like and feels like. Design is how it works.
 * </Blockquote>
 *
 * // With citation
 * <Blockquote cite="Steve Jobs" showCite>
 *   Innovation distinguishes between a leader and a follower.
 * </Blockquote>
 *
 * // Primary variant
 * <Blockquote variant="primary" size="lg">
 *   The only way to do great work is to love what you do.
 * </Blockquote>
 * ```
 */
const Blockquote = React.forwardRef<HTMLQuoteElement, BlockquoteProps>(
  (
    {
      className,
      variant,
      size,
      cite,
      showCite,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <figure className={className}>
        <blockquote
          ref={ref}
          className={cn(blockquoteVariants({ variant, size }))}
          {...(cite && !showCite && { cite })}
          {...props}
        >
          {children}
        </blockquote>
        {showCite && cite && (
          <figcaption className="mt-2 text-sm text-muted-foreground not-italic">
            — {cite}
          </figcaption>
        )}
      </figure>
    )
  }
)

Blockquote.displayName = 'Blockquote'

export { Blockquote, blockquoteVariants }
