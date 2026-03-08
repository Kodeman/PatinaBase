import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        solid: '',
        subtle: '',
        outline: 'border',
        dot: 'pl-0',
      },
      color: {
        primary: '',
        success: '',
        warning: '',
        error: '',
        info: '',
        neutral: '',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-sm',
        lg: 'px-3 py-1.5 text-base',
      },
    },
    compoundVariants: [
      // Solid variant colors
      {
        variant: 'solid',
        color: 'primary',
        className: 'bg-primary text-primary-foreground',
      },
      {
        variant: 'solid',
        color: 'success',
        className: 'bg-green-600 text-white',
      },
      {
        variant: 'solid',
        color: 'warning',
        className: 'bg-yellow-600 text-white',
      },
      {
        variant: 'solid',
        color: 'error',
        className: 'bg-red-600 text-white',
      },
      {
        variant: 'solid',
        color: 'info',
        className: 'bg-blue-600 text-white',
      },
      {
        variant: 'solid',
        color: 'neutral',
        className: 'bg-gray-600 text-white',
      },
      // Subtle variant colors
      {
        variant: 'subtle',
        color: 'primary',
        className: 'bg-primary/10 text-primary',
      },
      {
        variant: 'subtle',
        color: 'success',
        className: 'bg-green-100 text-green-800',
      },
      {
        variant: 'subtle',
        color: 'warning',
        className: 'bg-yellow-100 text-yellow-800',
      },
      {
        variant: 'subtle',
        color: 'error',
        className: 'bg-red-100 text-red-800',
      },
      {
        variant: 'subtle',
        color: 'info',
        className: 'bg-blue-100 text-blue-800',
      },
      {
        variant: 'subtle',
        color: 'neutral',
        className: 'bg-gray-100 text-gray-800',
      },
      // Outline variant colors
      {
        variant: 'outline',
        color: 'primary',
        className: 'border-primary text-primary',
      },
      {
        variant: 'outline',
        color: 'success',
        className: 'border-green-600 text-green-700',
      },
      {
        variant: 'outline',
        color: 'warning',
        className: 'border-yellow-600 text-yellow-700',
      },
      {
        variant: 'outline',
        color: 'error',
        className: 'border-red-600 text-red-700',
      },
      {
        variant: 'outline',
        color: 'info',
        className: 'border-blue-600 text-blue-700',
      },
      {
        variant: 'outline',
        color: 'neutral',
        className: 'border-gray-600 text-gray-700',
      },
      // Dot variant size adjustments
      {
        variant: 'dot',
        size: 'sm',
        className: 'pl-0',
      },
      {
        variant: 'dot',
        size: 'md',
        className: 'pl-0',
      },
      {
        variant: 'dot',
        size: 'lg',
        className: 'pl-0',
      },
    ],
    defaultVariants: {
      variant: 'solid',
      color: 'primary',
      size: 'md',
    },
  }
)

const dotVariants = cva('rounded-full', {
  variants: {
    color: {
      primary: 'bg-primary',
      success: 'bg-green-600',
      warning: 'bg-yellow-600',
      error: 'bg-red-600',
      info: 'bg-blue-600',
      neutral: 'bg-gray-600',
    },
    size: {
      sm: 'h-1.5 w-1.5 ml-1.5',
      md: 'h-2 w-2 ml-2',
      lg: 'h-2.5 w-2.5 ml-2.5',
    },
  },
  defaultVariants: {
    color: 'primary',
    size: 'md',
  },
})

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof badgeVariants> {
  /**
   * Icon to display in badge
   */
  icon?: React.ReactNode

  /**
   * Whether to show dot indicator
   */
  showDot?: boolean
}

/**
 * Badge component for labels, tags, and status indicators
 *
 * @example
 * ```tsx
 * <Badge variant="solid" color="success">Active</Badge>
 * <Badge variant="outline" color="warning">Pending</Badge>
 * <Badge variant="dot" color="error" showDot>Live</Badge>
 * ```
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'solid',
      color = 'primary',
      size = 'md',
      icon,
      showDot = false,
      children,
      ...props
    },
    ref
  ) => {
    const isDotVariant = variant === 'dot'

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, color, size }), className)}
        {...props}
      >
        {showDot && isDotVariant && (
          <span className={dotVariants({ color, size })} aria-hidden="true" />
        )}
        {icon && <span className="inline-flex">{icon}</span>}
        {children}
      </span>
    )
  }
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
