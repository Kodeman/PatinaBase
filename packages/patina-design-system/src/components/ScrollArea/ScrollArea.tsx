import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const scrollAreaVariants = cva('relative overflow-hidden', {
  variants: {
    size: {
      sm: 'max-h-64',
      md: 'max-h-96',
      lg: 'max-h-[32rem]',
      full: 'h-full',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const scrollBarVariants = cva(
  'flex touch-none select-none transition-colors',
  {
    variants: {
      orientation: {
        vertical: 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        horizontal: 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      },
      variant: {
        default: '',
        minimal: 'w-1.5 h-1.5',
      },
    },
    defaultVariants: {
      orientation: 'vertical',
      variant: 'default',
    },
  }
)

const scrollBarThumbVariants = cva(
  'relative flex-1 rounded-full transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted-foreground/50 hover:bg-muted-foreground/70',
        minimal: 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>,
    VariantProps<typeof scrollAreaVariants> {
  /**
   * Orientation of the scroll area
   * @default 'vertical'
   */
  orientation?: 'vertical' | 'horizontal' | 'both'
  /**
   * Scrollbar variant
   * @default 'default'
   */
  scrollbarVariant?: 'default' | 'minimal'
}

/**
 * ScrollArea component for creating custom-styled scrollable areas
 *
 * Built on Radix UI Scroll Area with Patina design tokens
 *
 * @example
 * ```tsx
 * <ScrollArea size="lg" orientation="vertical">
 *   <div className="p-4">
 *     <p>Long content here...</p>
 *   </div>
 * </ScrollArea>
 * ```
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    {
      className,
      children,
      size,
      orientation = 'vertical',
      scrollbarVariant = 'default',
      ...props
    },
    ref
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn(scrollAreaVariants({ size, className }))}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && (
        <ScrollBar orientation="vertical" variant={scrollbarVariant} />
      )}
      {(orientation === 'horizontal' || orientation === 'both') && (
        <ScrollBar orientation="horizontal" variant={scrollbarVariant} />
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

export interface ScrollBarProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
      'orientation'
    >,
    VariantProps<typeof scrollBarVariants> {
  orientation?: 'vertical' | 'horizontal'
}

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ScrollBarProps
>(({ className, orientation = 'vertical', variant, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(scrollBarVariants({ orientation, variant, className }))}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn(scrollBarThumbVariants({ variant }))}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
