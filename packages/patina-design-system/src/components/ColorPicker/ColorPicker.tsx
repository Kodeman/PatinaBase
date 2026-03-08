'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../../utils/cn'
import { Input } from '../Input'
import { Button } from '../Button'
import { Label } from '../Label'

export interface ColorPickerProps {
  /**
   * Current color value (HEX format)
   */
  color?: string
  /**
   * Callback when color changes
   */
  onColorChange?: (color: string) => void
  /**
   * Format to display/return color
   */
  format?: 'hex' | 'rgb' | 'hsl'
  /**
   * Show preset color swatches
   */
  showPresets?: boolean
  /**
   * Preset colors array
   */
  presets?: string[]
  /**
   * Custom trigger class
   */
  triggerClassName?: string
  /**
   * Disabled state
   */
  disabled?: boolean
  /**
   * Show format tabs
   */
  showFormatTabs?: boolean
}

const DEFAULT_PRESETS = [
  '#000000', '#FFFFFF', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#F43F5E', '#FB7185', '#FBBF24', '#34D399', '#60A5FA', '#818CF8', '#A78BFA',
]

/**
 * ColorPicker component with HEX, RGB, and HSL support
 *
 * @example
 * ```tsx
 * <ColorPicker
 *   color="#3B82F6"
 *   onColorChange={(color) => setColor(color)}
 *   showPresets
 *   format="hex"
 * />
 * ```
 */
export const ColorPicker = React.forwardRef<HTMLButtonElement, ColorPickerProps>(
  (
    {
      color = '#000000',
      onColorChange,
      format = 'hex',
      showPresets = true,
      presets = DEFAULT_PRESETS,
      triggerClassName,
      disabled = false,
      showFormatTabs = false,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const [currentColor, setCurrentColor] = React.useState(color)
    const [currentFormat, setCurrentFormat] = React.useState<'hex' | 'rgb' | 'hsl'>(format)

    React.useEffect(() => {
      setCurrentColor(color)
    }, [color])

    const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 }
    }

    const rgbToHex = (r: number, g: number, b: number): string => {
      return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
    }

    const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
      const { r, g, b } = hexToRgb(hex)
      const rNorm = r / 255
      const gNorm = g / 255
      const bNorm = b / 255

      const max = Math.max(rNorm, gNorm, bNorm)
      const min = Math.min(rNorm, gNorm, bNorm)
      let h = 0
      let s = 0
      const l = (max + min) / 2

      if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

        switch (max) {
          case rNorm:
            h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
            break
          case gNorm:
            h = ((bNorm - rNorm) / d + 2) / 6
            break
          case bNorm:
            h = ((rNorm - gNorm) / d + 4) / 6
            break
        }
      }

      return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
      }
    }

    const handleColorChange = (newColor: string) => {
      setCurrentColor(newColor)
      onColorChange?.(newColor)
    }

    const formatColor = (hex: string): string => {
      switch (currentFormat) {
        case 'rgb': {
          const { r, g, b } = hexToRgb(hex)
          return `rgb(${r}, ${g}, ${b})`
        }
        case 'hsl': {
          const { h, s, l } = hexToHsl(hex)
          return `hsl(${h}, ${s}%, ${l}%)`
        }
        default:
          return hex
      }
    }

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              triggerClassName
            )}
          >
            <div
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: currentColor }}
            />
            <span className="text-sm font-mono">{formatColor(currentColor)}</span>
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            className="w-64 p-4 bg-popover rounded-md border shadow-md z-50"
          >
            <div className="space-y-4">
              {showFormatTabs && (
                <div className="flex gap-1 p-1 bg-muted rounded-md">
                  {(['hex', 'rgb', 'hsl'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setCurrentFormat(fmt)}
                      className={cn(
                        'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
                        currentFormat === fmt
                          ? 'bg-background shadow-sm'
                          : 'hover:bg-background/50'
                      )}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>Color Picker</Label>
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-full h-32 cursor-pointer rounded border border-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Hex Value</Label>
                <Input
                  type="text"
                  value={currentColor}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      handleColorChange(value)
                    }
                  }}
                  placeholder="#000000"
                  size="sm"
                />
              </div>

              {showPresets && (
                <div className="space-y-2">
                  <Label>Presets</Label>
                  <div className="grid grid-cols-8 gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleColorChange(preset)}
                        className={cn(
                          'h-8 w-8 rounded border-2 transition-all hover:scale-110',
                          currentColor === preset
                            ? 'border-primary ring-2 ring-ring ring-offset-2'
                            : 'border-border'
                        )}
                        style={{ backgroundColor: preset }}
                        aria-label={`Select color ${preset}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    onColorChange?.(currentColor)
                    setOpen(false)
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
)

ColorPicker.displayName = 'ColorPicker'
