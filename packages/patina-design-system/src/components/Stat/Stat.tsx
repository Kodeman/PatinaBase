import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const statVariants = cva(
  'flex flex-col gap-1 p-4 rounded-lg border bg-card text-card-foreground',
  {
    variants: {
      variant: {
        default: 'border-border',
        outline: 'border-2',
        filled: 'bg-muted border-transparent',
      },
      size: {
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface StatProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof statVariants> {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  description?: string
}

/**
 * Stat component for displaying statistics and metrics
 *
 * @example
 * ```tsx
 * <Stat
 *   label="Total Revenue"
 *   value="$45,231"
 *   trend={{ value: 12.5, isPositive: true }}
 *   description="vs last month"
 * />
 * ```
 */
const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  (
    {
      className,
      variant,
      size,
      label,
      value,
      icon,
      trend,
      description,
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn(statVariants({ variant, size, className }))} {...props}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon && (
            <div className="inline-flex shrink-0 text-muted-foreground">{icon}</div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{value}</span>
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              )}
            >
              {trend.isPositive ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>

        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    )
  }
)
Stat.displayName = 'Stat'

const StatGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}
    {...props}
  />
))
StatGroup.displayName = 'StatGroup'

export { Stat, StatGroup }
