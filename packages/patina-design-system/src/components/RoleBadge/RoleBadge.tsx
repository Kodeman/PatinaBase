import * as React from 'react'
import { Shield, Crown, Paintbrush, Factory, User } from 'lucide-react'
import { Badge, type BadgeProps } from '../Badge'
import { cn } from '../../utils/cn'

/**
 * Standard user role types in the Patina platform
 */
export type UserRole = 'admin' | 'designer' | 'manufacturer' | 'customer' | string

/**
 * Role configuration with display properties
 */
interface RoleConfig {
  label: string
  color: NonNullable<BadgeProps['color']>
  icon: React.ReactNode
}

/**
 * Get role configuration for display
 */
function getRoleConfig(role: UserRole, showIcon: boolean): RoleConfig {
  const iconSize = 'h-3 w-3'

  const roleConfigs: Record<string, RoleConfig> = {
    admin: {
      label: 'Admin',
      color: 'error',
      icon: showIcon ? <Crown className={iconSize} /> : null,
    },
    designer: {
      label: 'Designer',
      color: 'primary',
      icon: showIcon ? <Paintbrush className={iconSize} /> : null,
    },
    manufacturer: {
      label: 'Manufacturer',
      color: 'info',
      icon: showIcon ? <Factory className={iconSize} /> : null,
    },
    customer: {
      label: 'Customer',
      color: 'neutral',
      icon: showIcon ? <User className={iconSize} /> : null,
    },
  }

  const normalizedRole = role?.toLowerCase() || ''
  const config = roleConfigs[normalizedRole]

  if (config) return config

  // Fallback for unknown roles - capitalize first letter
  return {
    label: role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : 'User',
    color: 'neutral',
    icon: showIcon ? <Shield className={iconSize} /> : null,
  }
}

export interface RoleBadgeProps extends Omit<BadgeProps, 'color' | 'icon'> {
  /**
   * The user role to display
   */
  role: UserRole

  /**
   * Whether to show the role-specific icon
   * @default true
   */
  showIcon?: boolean

  /**
   * Custom label to override the default role label
   */
  label?: string
}

/**
 * RoleBadge component for displaying user roles with semantic colors and icons.
 *
 * Maps roles to appropriate colors:
 * - admin: red (elevated privileges)
 * - designer: primary (brand color)
 * - manufacturer: blue (partner)
 * - customer: gray (standard user)
 *
 * @example
 * ```tsx
 * <RoleBadge role="admin" />
 * <RoleBadge role="designer" variant="outline" />
 * <RoleBadge role="manufacturer" showIcon={false} />
 * <RoleBadge role="custom-role" label="VIP" />
 * ```
 */
const RoleBadge = React.forwardRef<HTMLSpanElement, RoleBadgeProps>(
  (
    {
      role,
      showIcon = true,
      label: customLabel,
      variant = 'subtle',
      size = 'sm',
      className,
      ...props
    },
    ref
  ) => {
    const config = getRoleConfig(role, showIcon)
    const displayLabel = customLabel || config.label

    return (
      <Badge
        ref={ref}
        variant={variant}
        color={config.color}
        size={size}
        icon={config.icon}
        className={cn('font-medium', className)}
        {...props}
      >
        {displayLabel}
      </Badge>
    )
  }
)
RoleBadge.displayName = 'RoleBadge'

export { RoleBadge }
