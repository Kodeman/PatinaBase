'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Icon } from '../Icon'

const colorSwatchVariants = cva(
  'inline-flex items-center justify-center rounded transition-all cursor-pointer',
  {
    variants: {
      size: {
        sm: 'h-6 w-6',
        md: 'h-8 w-8',
        lg: 'h-10 w-10',
        xl: 'h-12 w-12',
      },
      variant: {
        default: 'border-2',
        rounded: 'rounded-full border-2',
        square: 'rounded-none border-2',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
)

export interface ColorSwatchProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof colorSwatchVariants> {
  /**
   * Color value (hex, rgb, hsl, or named color)
   */
  color: string
  /**
   * Color name/label
   */
  label?: string
  /**
   * Whether the swatch is selected
   */
  selected?: boolean
  /**
   * Show check icon when selected
   * @default true
   */
  showCheckIcon?: boolean
  /**
   * Tooltip text
   */
  tooltip?: string
}

/**
 * ColorSwatch component for displaying and selecting colors
 * Essential for designer portal color selection
 *
 * @example
 * ```tsx
 * <ColorSwatch color="#FF5733" label="Coral" selected />
 * <ColorSwatch color="rgb(255, 87, 51)" variant="rounded" />
 * ```
 */
export const ColorSwatch = React.forwardRef<HTMLButtonElement, ColorSwatchProps>(
  (
    {
      color,
      label,
      selected = false,
      showCheckIcon = true,
      tooltip,
      size,
      variant,
      className,
      ...props
    },
    ref
  ) => {
    const isLight = React.useMemo(() => {
      // Simple luminance check to determine if we should use dark or light check icon
      const hex = color.replace('#', '')
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16)
        const g = parseInt(hex[1] + hex[1], 16)
        const b = parseInt(hex[2] + hex[2], 16)
        return (r * 299 + g * 587 + b * 114) / 1000 > 128
      } else if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16)
        const g = parseInt(hex.substring(2, 4), 16)
        const b = parseInt(hex.substring(4, 6), 16)
        return (r * 299 + g * 587 + b * 114) / 1000 > 128
      }
      return true
    }, [color])

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          colorSwatchVariants({ size, variant }),
          selected && 'ring-2 ring-primary ring-offset-2',
          'hover:scale-110 active:scale-95',
          className
        )}
        style={{ backgroundColor: color }}
        title={tooltip || label}
        aria-label={label || `Color ${color}`}
        {...props}
      >
        {selected && showCheckIcon && (
          <Icon
            name="Check"
            size={size === 'sm' ? 12 : size === 'md' ? 14 : size === 'lg' ? 16 : 20}
            className={cn(isLight ? 'text-gray-900' : 'text-white')}
          />
        )}
      </button>
    )
  }
)

ColorSwatch.displayName = 'ColorSwatch'

/**
 * ColorSwatchGroup component for multiple color selection
 */
export interface ColorSwatchGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Array of colors
   */
  colors: Array<{
    value: string
    label?: string
    id?: string
  }>
  /**
   * Selected color value(s)
   */
  value?: string | string[]
  /**
   * Callback when color is selected
   */
  onChange?: (value: string | string[]) => void
  /**
   * Allow multiple selection
   * @default false
   */
  multiple?: boolean
  /**
   * Size of swatches
   */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Variant of swatches
   */
  variant?: 'default' | 'rounded' | 'square'
  /**
   * Show labels below swatches
   * @default false
   */
  showLabels?: boolean
  /**
   * Gap between swatches
   * @default 2
   */
  gap?: number
}

export const ColorSwatchGroup = React.forwardRef<HTMLDivElement, ColorSwatchGroupProps>(
  (
    {
      colors,
      value,
      onChange,
      multiple = false,
      size = 'md',
      variant = 'default',
      showLabels = false,
      gap = 2,
      className,
      ...props
    },
    ref
  ) => {
    const handleSelect = (colorValue: string) => {
      if (!onChange) return

      if (multiple) {
        const currentValues = Array.isArray(value) ? value : value ? [value] : []
        const newValues = currentValues.includes(colorValue)
          ? currentValues.filter((v) => v !== colorValue)
          : [...currentValues, colorValue]
        onChange(newValues)
      } else {
        onChange(colorValue)
      }
    }

    const isSelected = (colorValue: string) => {
      if (Array.isArray(value)) {
        return value.includes(colorValue)
      }
      return value === colorValue
    }

    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-start', className)}
        style={{ gap: `${gap * 0.25}rem` }}
        {...props}
      >
        {colors.map((color, index) => (
          <div
            key={color.id || color.value || index}
            className={cn('flex flex-col items-center', showLabels && 'gap-1')}
          >
            <ColorSwatch
              color={color.value}
              label={color.label}
              selected={isSelected(color.value)}
              size={size}
              variant={variant}
              onClick={() => handleSelect(color.value)}
            />
            {showLabels && color.label && (
              <span className="text-xs text-muted-foreground text-center">
                {color.label}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }
)

ColorSwatchGroup.displayName = 'ColorSwatchGroup'

/**
 * ColorPicker component with predefined palette
 */
export interface ColorPaletteProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Color palette organized by category
   */
  palette: Record<string, Array<{ value: string; label?: string }>>
  /**
   * Selected color
   */
  value?: string
  /**
   * Callback when color is selected
   */
  onChange?: (value: string) => void
  /**
   * Size of swatches
   */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  palette,
  value,
  onChange,
  size = 'md',
  className,
  ...props
}) => {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {Object.entries(palette).map(([category, colors]) => (
        <div key={category}>
          <h4 className="text-sm font-medium mb-2 capitalize">{category}</h4>
          <ColorSwatchGroup
            colors={colors}
            value={value}
            onChange={onChange as any}
            size={size}
            gap={2}
          />
        </div>
      ))}
    </div>
  )
}

ColorPalette.displayName = 'ColorPalette'

/**
 * Utility function to convert color formats
 */
export const convertColor = {
  hexToRgb: (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null
  },

  rgbToHex: (r: number, g: number, b: number): string => {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
  },

  hexToHsl: (hex: string): { h: number; s: number; l: number } | null => {
    const rgb = convertColor.hexToRgb(hex)
    if (!rgb) return null

    const r = rgb.r / 255
    const g = rgb.g / 255
    const b = rgb.b / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6
          break
        case g:
          h = ((b - r) / d + 2) / 6
          break
        case b:
          h = ((r - g) / d + 4) / 6
          break
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    }
  },
}
