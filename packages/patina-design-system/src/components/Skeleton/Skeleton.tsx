import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const skeletonVariants = cva('bg-muted', {
  variants: {
    variant: {
      text: 'h-4 w-full rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-md',
    },
    animation: {
      pulse: 'animate-pulse',
      wave: 'animate-shimmer bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%]',
      none: '',
    },
  },
  defaultVariants: {
    variant: 'text',
    animation: 'pulse',
  },
})

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /**
   * Width of the skeleton
   */
  width?: string | number

  /**
   * Height of the skeleton
   */
  height?: string | number

  /**
   * Whether skeleton is visible
   */
  show?: boolean
}

/**
 * Skeleton component for loading states
 *
 * @example
 * ```tsx
 * <Skeleton variant="text" />
 * <Skeleton variant="circular" width={40} height={40} />
 * <Skeleton variant="rectangular" width="100%" height={200} />
 * <Skeleton animation="wave" />
 * ```
 */
const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'text',
      animation = 'pulse',
      width,
      height,
      show = true,
      style,
      ...props
    },
    ref
  ) => {
    if (!show) return null

    const customStyle: React.CSSProperties = {
      ...style,
      ...(width && {
        width: typeof width === 'number' ? `${width}px` : width,
      }),
      ...(height && {
        height: typeof height === 'number' ? `${height}px` : height,
      }),
    }

    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading"
        className={cn(skeletonVariants({ variant, animation }), className)}
        style={customStyle}
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    )
  }
)
Skeleton.displayName = 'Skeleton'

/**
 * Pre-configured skeleton for avatar
 */
const SkeletonAvatar = React.forwardRef<HTMLDivElement, Omit<SkeletonProps, 'variant'>>(
  ({ className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="circular"
      width={40}
      height={40}
      className={className}
      {...props}
    />
  )
)
SkeletonAvatar.displayName = 'SkeletonAvatar'

/**
 * Pre-configured skeleton for text line
 */
const SkeletonText = React.forwardRef<HTMLDivElement, Omit<SkeletonProps, 'variant'>>(
  ({ className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="text"
      className={className}
      {...props}
    />
  )
)
SkeletonText.displayName = 'SkeletonText'

/**
 * Pre-configured skeleton for card
 */
const SkeletonCard = React.forwardRef<HTMLDivElement, Omit<SkeletonProps, 'variant'>>(
  ({ className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="rectangular"
      className={cn('h-48 w-full', className)}
      {...props}
    />
  )
)
SkeletonCard.displayName = 'SkeletonCard'

export { Skeleton, SkeletonAvatar, SkeletonText, SkeletonCard, skeletonVariants }
