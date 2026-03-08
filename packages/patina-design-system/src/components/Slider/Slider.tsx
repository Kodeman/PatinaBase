import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const sliderVariants = cva(
  'relative flex w-full touch-none select-none items-center',
  {
    variants: {
      orientation: {
        horizontal: 'h-2',
        vertical: 'flex-col h-full w-2',
      },
      size: {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      size: 'md',
    },
  }
)

export interface SliderProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, 'orientation'>,
    VariantProps<typeof sliderVariants> {
  /**
   * Show value label(s)
   */
  showValue?: boolean
  /**
   * Format function for displaying values
   */
  formatValue?: (value: number) => string
  /**
   * Show marks at specific values
   */
  marks?: Array<{ value: number; label?: string }>
}

/**
 * Slider component built with Radix UI primitives
 * Supports single value, range, and vertical orientation
 *
 * @example
 * ```tsx
 * // Single value slider
 * <Slider
 *   min={0}
 *   max={100}
 *   step={1}
 *   value={[50]}
 *   onValueChange={(value) => setValue(value[0])}
 *   showValue
 * />
 *
 * // Range slider
 * <Slider
 *   min={0}
 *   max={100}
 *   value={[25, 75]}
 *   onValueChange={setRange}
 * />
 * ```
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      orientation,
      size,
      showValue = false,
      formatValue = (val) => val.toString(),
      marks = [],
      ...props
    },
    ref
  ) => {
    const defaultValue = props.defaultValue || props.value || [0]
    const min = props.min ?? 0
    const max = props.max ?? 100

    return (
      <div className="relative w-full">
        <SliderPrimitive.Root
          ref={ref}
          className={cn(sliderVariants({ orientation, size, className }))}
          orientation={orientation || undefined}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-full w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          {(props.value || defaultValue).map((_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {showValue && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground whitespace-nowrap">
                  {formatValue((props.value || defaultValue)[index])}
                </span>
              )}
            </SliderPrimitive.Thumb>
          ))}
        </SliderPrimitive.Root>

        {marks.length > 0 && (
          <div className="relative mt-2 flex justify-between">
            {marks.map((mark, index) => {
              const position = ((mark.value - min) / (max - min)) * 100
              return (
                <div
                  key={index}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="h-2 w-0.5 bg-muted-foreground" />
                  {mark.label && (
                    <span className="mt-1 text-xs text-muted-foreground">
                      {mark.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

Slider.displayName = SliderPrimitive.Root.displayName

export { Slider, sliderVariants }
