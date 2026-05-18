import * as React from 'react'
import { cn } from '../../utils/cn'

export interface StrataMarkProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Size of the icon in pixels.
   * @default 14
   */
  size?: number | string
  /**
   * CSS color value. Defaults to `currentColor` so the icon inherits
   * its parent's text color via CSS.
   * @default 'currentColor'
   */
  color?: string
  /**
   * Additional CSS class names.
   */
  className?: string
}

/**
 * StrataMark — the Patina brand icon.
 *
 * Three descending horizontal lines representing momentum and structure
 * (spec Section 4.2: "the three-line horizontal motif"). The top line is
 * the widest, the middle is medium, and the bottom is the narrowest,
 * creating a visual cascade from left to right.
 *
 * @example
 * ```tsx
 * // Default size and inherited color
 * <StrataMark />
 *
 * // Custom size
 * <StrataMark size={24} />
 *
 * // Custom color
 * <StrataMark color="oklch(0.618 0.0778 65.5444)" />
 *
 * // Via CSS (preferred)
 * <StrataMark className="text-primary" />
 * ```
 */
export const StrataMark = React.forwardRef<SVGSVGElement, StrataMarkProps>(
  (
    {
      size = 14,
      color = 'currentColor',
      className,
      'aria-label': ariaLabel,
      'aria-hidden': ariaHidden,
      role,
      ...props
    },
    ref
  ) => {
    // Accessibility: if no aria-label is provided, default to aria-hidden so
    // screen readers skip the decorative icon. Callers that want the icon to
    // be announced must pass aria-label explicitly.
    const a11yProps =
      ariaLabel != null
        ? { role: role ?? 'img', 'aria-label': ariaLabel }
        : { role: role ?? 'img', 'aria-hidden': ariaHidden ?? true }

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(className)}
        {...a11yProps}
        {...props}
      >
        {/* Top line — widest (full width) */}
        <line
          x1="1"
          y1="3.5"
          x2="13"
          y2="3.5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Middle line — medium (three-quarters width) */}
        <line
          x1="1"
          y1="7"
          x2="10"
          y2="7"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Bottom line — narrowest (half width) */}
        <line
          x1="1"
          y1="10.5"
          x2="7"
          y2="10.5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
)

StrataMark.displayName = 'StrataMark'
