import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const headingVariants = cva('font-bold tracking-tight', {
  variants: {
    variant: {
      display: 'font-extrabold',
      headline: 'font-bold',
      title: 'font-semibold',
      subtitle: 'font-medium',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
      '7xl': 'text-7xl',
      '8xl': 'text-8xl',
      '9xl': 'text-9xl',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
      extrabold: 'font-extrabold',
      black: 'font-black',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
    },
  },
  defaultVariants: {
    variant: 'headline',
    align: 'left',
  },
})

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  /**
   * The semantic heading level (h1-h6)
   * @default 'h2'
   */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

/**
 * Heading component for displaying headings with semantic HTML and consistent styling
 *
 * @example
 * ```tsx
 * // Page title
 * <Heading as="h1" variant="display" size="5xl">
 *   Welcome to Patina
 * </Heading>
 *
 * // Section heading
 * <Heading as="h2" variant="headline" size="3xl">
 *   Featured Products
 * </Heading>
 *
 * // Subsection heading
 * <Heading as="h3" variant="title" size="xl">
 *   Product Details
 * </Heading>
 *
 * // Small heading
 * <Heading as="h4" variant="subtitle" size="lg">
 *   Specifications
 * </Heading>
 * ```
 */
const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  (
    {
      className,
      variant,
      size,
      weight,
      align,
      as: Component = 'h2',
      ...props
    },
    ref
  ) => {
    // Default sizes based on heading level if size is not provided
    const defaultSizes = {
      h1: '4xl',
      h2: '3xl',
      h3: '2xl',
      h4: 'xl',
      h5: 'lg',
      h6: 'md',
    } as const

    const headingSize = size || defaultSizes[Component]

    return (
      <Component
        ref={ref}
        className={cn(
          headingVariants({
            variant,
            size: headingSize as any,
            weight,
            align,
            className,
          })
        )}
        {...props}
      />
    )
  }
)

Heading.displayName = 'Heading'

export { Heading, headingVariants }
