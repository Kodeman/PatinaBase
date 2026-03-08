import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const dividerVariants = cva('', {
  variants: {
    orientation: {
      horizontal: 'w-full border-t',
      vertical: 'h-full border-l',
    },
    variant: {
      solid: 'border-solid',
      dashed: 'border-dashed',
      dotted: 'border-dotted',
    },
    thickness: {
      thin: '',
      medium: '',
      thick: '',
    },
    spacing: {
      none: '',
      sm: '',
      md: '',
      lg: '',
    },
  },
  compoundVariants: [
    {
      orientation: 'horizontal',
      thickness: 'thin',
      class: 'border-t',
    },
    {
      orientation: 'horizontal',
      thickness: 'medium',
      class: 'border-t-2',
    },
    {
      orientation: 'horizontal',
      thickness: 'thick',
      class: 'border-t-4',
    },
    {
      orientation: 'vertical',
      thickness: 'thin',
      class: 'border-l',
    },
    {
      orientation: 'vertical',
      thickness: 'medium',
      class: 'border-l-2',
    },
    {
      orientation: 'vertical',
      thickness: 'thick',
      class: 'border-l-4',
    },
    {
      orientation: 'horizontal',
      spacing: 'sm',
      class: 'my-2',
    },
    {
      orientation: 'horizontal',
      spacing: 'md',
      class: 'my-4',
    },
    {
      orientation: 'horizontal',
      spacing: 'lg',
      class: 'my-6',
    },
    {
      orientation: 'vertical',
      spacing: 'sm',
      class: 'mx-2',
    },
    {
      orientation: 'vertical',
      spacing: 'md',
      class: 'mx-4',
    },
    {
      orientation: 'vertical',
      spacing: 'lg',
      class: 'mx-6',
    },
  ],
  defaultVariants: {
    orientation: 'horizontal',
    variant: 'solid',
    thickness: 'thin',
    spacing: 'none',
  },
})

export interface DividerProps
  extends React.HTMLAttributes<HTMLHRElement>,
    VariantProps<typeof dividerVariants> {
  /**
   * Label to display in the middle of the divider
   */
  label?: React.ReactNode

  /**
   * Position of the label
   */
  labelPosition?: 'left' | 'center' | 'right'
}

/**
 * Divider component for visually separating content
 *
 * @example
 * ```tsx
 * // Basic horizontal divider
 * <Divider />
 *
 * // Vertical divider
 * <Divider orientation="vertical" />
 *
 * // Dashed divider with spacing
 * <Divider variant="dashed" spacing="md" />
 *
 * // Divider with label
 * <Divider label="OR" />
 * ```
 */
const Divider = React.forwardRef<HTMLHRElement, DividerProps>(
  (
    {
      className,
      orientation,
      variant,
      thickness,
      spacing,
      label,
      labelPosition = 'center',
      ...props
    },
    ref
  ) => {
    if (label && orientation === 'horizontal') {
      const labelAlignClass = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end',
      }[labelPosition]

      return (
        <div
          className={cn('flex items-center', labelAlignClass, spacing && `my-${spacing}`, className)}
          role="separator"
          aria-orientation={orientation}
        >
          {labelPosition !== 'left' && (
            <hr
              className={cn(
                dividerVariants({
                  orientation,
                  variant,
                  thickness,
                  spacing: 'none',
                })
              )}
            />
          )}
          <span className="px-3 text-sm text-muted-foreground whitespace-nowrap">
            {label}
          </span>
          {labelPosition !== 'right' && (
            <hr
              className={cn(
                dividerVariants({
                  orientation,
                  variant,
                  thickness,
                  spacing: 'none',
                })
              )}
            />
          )}
        </div>
      )
    }

    return (
      <hr
        ref={ref}
        className={cn(
          dividerVariants({ orientation, variant, thickness, spacing, className })
        )}
        role="separator"
        aria-orientation={orientation || undefined}
        {...props}
      />
    )
  }
)

Divider.displayName = 'Divider'

export { Divider, dividerVariants }
