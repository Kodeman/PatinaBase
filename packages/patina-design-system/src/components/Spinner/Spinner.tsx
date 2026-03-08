import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const spinnerVariants = cva('inline-block animate-spin', {
  variants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    },
    color: {
      primary: 'text-primary',
      secondary: 'text-secondary',
      white: 'text-white',
      current: 'text-current',
    },
    speed: {
      slow: 'animate-spin-slow',
      normal: 'animate-spin',
      fast: 'animate-spin-fast',
    },
  },
  defaultVariants: {
    size: 'md',
    color: 'primary',
    speed: 'normal',
  },
})

const dotsVariants = cva('flex items-center justify-center gap-1', {
  variants: {
    size: {
      sm: 'gap-0.5',
      md: 'gap-1',
      lg: 'gap-1.5',
      xl: 'gap-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const dotVariants = cva('rounded-full animate-pulse', {
  variants: {
    size: {
      sm: 'h-1 w-1',
      md: 'h-1.5 w-1.5',
      lg: 'h-2 w-2',
      xl: 'h-3 w-3',
    },
    color: {
      primary: 'bg-primary',
      secondary: 'bg-secondary',
      white: 'bg-white',
      current: 'bg-current',
    },
  },
  defaultVariants: {
    size: 'md',
    color: 'primary',
  },
})

const barsVariants = cva('flex items-center justify-center gap-1', {
  variants: {
    size: {
      sm: 'gap-0.5',
      md: 'gap-1',
      lg: 'gap-1.5',
      xl: 'gap-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const barVariants = cva('rounded-sm animate-pulse', {
  variants: {
    size: {
      sm: 'h-3 w-0.5',
      md: 'h-4 w-1',
      lg: 'h-6 w-1.5',
      xl: 'h-8 w-2',
    },
    color: {
      primary: 'bg-primary',
      secondary: 'bg-secondary',
      white: 'bg-white',
      current: 'bg-current',
    },
  },
  defaultVariants: {
    size: 'md',
    color: 'primary',
  },
})

export interface SpinnerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof spinnerVariants> {
  /**
   * Spinner variant type
   */
  variant?: 'circular' | 'dots' | 'bars'

  /**
   * Accessibility label for screen readers
   */
  label?: string
}

/**
 * Spinner component for loading states
 *
 * @example
 * ```tsx
 * <Spinner />
 * <Spinner size="lg" color="primary" />
 * <Spinner variant="dots" />
 * <Spinner variant="bars" label="Loading content..." />
 * ```
 */
const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  (
    {
      className,
      size = 'md',
      color = 'primary',
      speed = 'normal',
      variant = 'circular',
      label = 'Loading...',
      ...props
    },
    ref
  ) => {
    if (variant === 'dots') {
      return (
        <div
          ref={ref}
          role="status"
          aria-label={label}
          className={cn(dotsVariants({ size }), className)}
          {...props}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                dotVariants({ size, color }),
                i === 1 && 'animation-delay-200',
                i === 2 && 'animation-delay-400'
              )}
            />
          ))}
          <span className="sr-only">{label}</span>
        </div>
      )
    }

    if (variant === 'bars') {
      return (
        <div
          ref={ref}
          role="status"
          aria-label={label}
          className={cn(barsVariants({ size }), className)}
          {...props}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                barVariants({ size, color }),
                i === 1 && 'animation-delay-200',
                i === 2 && 'animation-delay-400'
              )}
            />
          ))}
          <span className="sr-only">{label}</span>
        </div>
      )
    }

    // Circular variant (default)
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('inline-block', className)}
        {...props}
      >
        <svg
          className={spinnerVariants({ size, color, speed })}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="sr-only">{label}</span>
      </div>
    )
  }
)
Spinner.displayName = 'Spinner'

export { Spinner, spinnerVariants }
