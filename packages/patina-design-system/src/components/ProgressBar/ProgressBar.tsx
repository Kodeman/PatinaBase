import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const progressVariants = cva('relative h-2 w-full overflow-hidden rounded-full bg-secondary', {
  variants: {
    size: {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
      xl: 'h-4',
    },
    variant: {
      default: '[&>div]:bg-primary',
      success: '[&>div]:bg-green-500',
      warning: '[&>div]:bg-yellow-500',
      error: '[&>div]:bg-red-500',
      info: '[&>div]:bg-blue-500',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'default',
  },
})

export interface ProgressBarProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  /**
   * Current progress value (0-100)
   */
  value?: number
  /**
   * Maximum value (default: 100)
   */
  max?: number
  /**
   * Show percentage label
   */
  showLabel?: boolean
  /**
   * Indeterminate/loading state
   */
  indeterminate?: boolean
}

/**
 * ProgressBar component for showing task completion
 *
 * @example
 * ```tsx
 * <ProgressBar value={60} />
 * <ProgressBar value={80} variant="success" showLabel />
 * <ProgressBar indeterminate variant="info" />
 * ```
 */
const ProgressBar = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressBarProps
>(
  (
    {
      className,
      value = 0,
      max = 100,
      size,
      variant,
      showLabel = false,
      indeterminate = false,
      ...props
    },
    ref
  ) => {
    const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0

    return (
      <div className="w-full space-y-1">
        <ProgressPrimitive.Root
          ref={ref}
          className={cn(progressVariants({ size, variant }), className)}
          value={indeterminate ? undefined : value}
          max={max}
          {...props}
        >
          <ProgressPrimitive.Indicator
            className={cn(
              'h-full w-full flex-1 transition-all duration-300',
              indeterminate &&
                'animate-pulse bg-gradient-to-r from-transparent via-primary to-transparent'
            )}
            style={{
              transform: indeterminate ? undefined : `translateX(-${100 - percentage}%)`,
            }}
          />
        </ProgressPrimitive.Root>
        {showLabel && !indeterminate && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(percentage)}%</span>
            <span>
              {value} / {max}
            </span>
          </div>
        )}
      </div>
    )
  }
)
ProgressBar.displayName = 'ProgressBar'

export { ProgressBar, progressVariants }
