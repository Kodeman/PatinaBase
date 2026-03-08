import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'leading-relaxed',
      caption: 'text-muted-foreground',
      overline: 'uppercase tracking-wider text-muted-foreground',
      label: 'font-medium',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
    },
    truncate: {
      true: 'truncate',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'body',
    size: 'md',
    weight: 'normal',
    align: 'left',
    truncate: false,
  },
})

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  /**
   * Render as a different HTML element
   * @default 'p'
   */
  as?: 'p' | 'span' | 'div' | 'label' | 'strong' | 'em' | 'small'

  /**
   * Use Radix Slot for composition
   */
  asChild?: boolean

  /**
   * Number of lines to clamp the text to (CSS line-clamp)
   */
  lineClamp?: 1 | 2 | 3 | 4 | 5 | 6
}

/**
 * Text component for displaying text content with consistent styling
 *
 * @example
 * ```tsx
 * // Body text
 * <Text>
 *   This is a paragraph of body text with comfortable line height.
 * </Text>
 *
 * // Caption text
 * <Text variant="caption" size="sm">
 *   Image caption or helper text
 * </Text>
 *
 * // Overline text
 * <Text variant="overline" size="xs">
 *   Section Label
 * </Text>
 *
 * // Truncated text
 * <Text truncate>
 *   This very long text will be truncated with an ellipsis...
 * </Text>
 *
 * // Line clamped text
 * <Text lineClamp={3}>
 *   This text will be clamped to 3 lines with an ellipsis at the end.
 * </Text>
 * ```
 */
const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    {
      className,
      variant,
      size,
      weight,
      align,
      truncate,
      lineClamp,
      as: Component = 'p',
      asChild,
      style,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : Component

    const lineClampStyles: React.CSSProperties = lineClamp
      ? {
          display: '-webkit-box',
          WebkitLineClamp: lineClamp,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          ...style,
        }
      : { ...style }

    return (
      <Comp
        ref={ref as any}
        className={cn(
          textVariants({ variant, size, weight, align, truncate, className })
        )}
        style={lineClampStyles}
        {...props}
      />
    )
  }
)

Text.displayName = 'Text'

export { Text, textVariants }
