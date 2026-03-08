import * as React from 'react'
import { icons, LucideProps } from 'lucide-react'
import { cn } from '../../utils/cn'

export type IconName = keyof typeof icons

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /**
   * Name of the icon from lucide-react
   */
  name: IconName
  /**
   * Size of the icon
   * @default 24
   */
  size?: number | string
  /**
   * Color of the icon
   */
  color?: string
  /**
   * Stroke width of the icon
   * @default 2
   */
  strokeWidth?: number | string
  /**
   * Additional CSS classes
   */
  className?: string
}

/**
 * Icon component wrapper for lucide-react icons
 * Provides a unified interface for using icons throughout the design system
 *
 * @example
 * ```tsx
 * <Icon name="Heart" size={24} color="red" />
 * <Icon name="ChevronDown" size="1.5rem" strokeWidth={3} />
 * ```
 */
export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ name, size = 24, color, strokeWidth = 2, className, ...props }, ref) => {
    const LucideIcon = icons[name]

    if (!LucideIcon) {
      console.warn(`Icon "${name}" not found in lucide-react`)
      return null
    }

    return (
      <LucideIcon
        ref={ref}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={cn(className)}
        {...props}
      />
    )
  }
)

Icon.displayName = 'Icon'

/**
 * Custom SVG Icon component for icons not in lucide-react
 */
export interface CustomIconProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Size of the icon
   * @default 24
   */
  size?: number | string
  /**
   * Additional CSS classes
   */
  className?: string
  children: React.ReactNode
}

export const CustomIcon = React.forwardRef<SVGSVGElement, CustomIconProps>(
  ({ size = 24, className, children, viewBox = '0 0 24 24', ...props }, ref) => {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(className)}
        {...props}
      >
        {children}
      </svg>
    )
  }
)

CustomIcon.displayName = 'CustomIcon'

/**
 * Icon Registry for custom brand icons
 */
type CustomIconRegistry = Record<string, React.ComponentType<CustomIconProps>>

const customIconRegistry: CustomIconRegistry = {}

/**
 * Register a custom icon
 */
export const registerIcon = (name: string, component: React.ComponentType<CustomIconProps>) => {
  customIconRegistry[name] = component
}

/**
 * Get a custom icon from the registry
 */
export const getCustomIcon = (name: string): React.ComponentType<CustomIconProps> | undefined => {
  return customIconRegistry[name]
}

/**
 * Check if a custom icon exists in the registry
 */
export const hasCustomIcon = (name: string): boolean => {
  return name in customIconRegistry
}
