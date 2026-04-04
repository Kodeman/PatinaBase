'use client'

import * as React from 'react'
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
  Loader2,
  Circle,
  Moon,
  MinusCircle,
  EyeOff,
} from 'lucide-react'
import { Avatar, type AvatarProps } from '../Avatar'
import { RoleBadge } from '../RoleBadge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../DropdownMenu'
import { cn } from '../../utils/cn'

/**
 * User presence status type
 */
export type UserPresenceStatus = 'online' | 'offline' | 'busy' | 'away'

/**
 * User data for the status menu
 */
export interface UserStatusMenuUser {
  /** User display name */
  name?: string | null
  /** User email address */
  email?: string | null
  /** Avatar image URL */
  image?: string | null
  /** Assigned roles */
  roles?: string[]
}

/**
 * Menu item configuration
 */
export interface UserStatusMenuItem {
  /** Display label */
  label: string
  /** Optional icon */
  icon?: React.ReactNode
  /** Navigation path (if href is provided, onClick is ignored) */
  href?: string
  /** Click handler */
  onClick?: () => void
  /** Destructive styling (e.g., for sign out) */
  variant?: 'default' | 'destructive'
  /** Disable the item */
  disabled?: boolean
}

export interface UserStatusMenuProps {
  /**
   * User data to display
   */
  user: UserStatusMenuUser

  /**
   * Current presence status
   * @default 'online'
   */
  status?: UserPresenceStatus

  /**
   * Callback when status is changed by user
   */
  onStatusChange?: (status: UserPresenceStatus) => void

  /**
   * Additional menu items to display
   * Default items (Profile, Settings) are always shown
   */
  menuItems?: UserStatusMenuItem[]

  /**
   * Sign out handler
   */
  onSignOut?: () => Promise<void>

  /**
   * Whether sign out is in progress
   */
  isSigningOut?: boolean

  /**
   * Whether to show the status selector submenu
   * @default true
   */
  showStatusSelector?: boolean

  /**
   * Avatar size
   * @default 'sm'
   */
  avatarSize?: AvatarProps['size']

  /**
   * Dropdown alignment
   * @default 'end'
   */
  align?: 'start' | 'center' | 'end'

  /**
   * Custom class name for the trigger button
   */
  className?: string

  /**
   * Custom class name for the dropdown content
   */
  contentClassName?: string

  /**
   * Base path prefix for default menu item hrefs (Profile, Settings).
   * e.g. '/portal' results in '/portal/profile' and '/portal/settings'
   * @default ''
   */
  basePath?: string
}

/**
 * Status options for the status selector
 */
const STATUS_OPTIONS: Array<{
  value: UserPresenceStatus
  label: string
  icon: React.ReactNode
  description: string
}> = [
  {
    value: 'online',
    label: 'Online',
    icon: <Circle className="h-3 w-3 fill-green-500 text-green-500" />,
    description: 'Available',
  },
  {
    value: 'away',
    label: 'Away',
    icon: <Moon className="h-3 w-3 text-yellow-500" />,
    description: 'Away',
  },
  {
    value: 'busy',
    label: 'Busy',
    icon: <MinusCircle className="h-3 w-3 text-red-500" />,
    description: 'Do not disturb',
  },
  {
    value: 'offline',
    label: 'Appear Offline',
    icon: <EyeOff className="h-3 w-3 text-gray-400" />,
    description: 'Hidden',
  },
]

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * UserStatusMenu component for displaying logged-in user information
 * with a dropdown menu for profile, settings, status, and sign out.
 *
 * @example
 * ```tsx
 * <UserStatusMenu
 *   user={{ name: "John Doe", email: "john@example.com", roles: ["designer"] }}
 *   status="online"
 *   onStatusChange={(status) => console.log(status)}
 *   onSignOut={async () => { await signOut() }}
 * />
 * ```
 */
const UserStatusMenu = React.forwardRef<HTMLButtonElement, UserStatusMenuProps>(
  (
    {
      user,
      status = 'online',
      onStatusChange,
      menuItems = [],
      onSignOut,
      isSigningOut = false,
      showStatusSelector = true,
      avatarSize = 'sm',
      align = 'end',
      className,
      contentClassName,
      basePath = '',
    },
    ref
  ) => {
    const displayName = user.name || user.email || 'User'
    const displayRole = user.roles?.[0]
    const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0]

    const handleSignOut = React.useCallback(async () => {
      if (onSignOut && !isSigningOut) {
        await onSignOut()
      }
    }, [onSignOut, isSigningOut])

    // Default menu items
    const defaultItems: UserStatusMenuItem[] = [
      {
        label: 'Profile',
        icon: <User className="h-4 w-4" />,
        href: `${basePath}/profile`,
      },
      {
        label: 'Settings',
        icon: <Settings className="h-4 w-4" />,
        href: `${basePath}/settings`,
      },
    ]

    // Combine default and custom items
    const allItems = [...defaultItems, ...menuItems]

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={ref}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
              'transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              className
            )}
            disabled={isSigningOut}
          >
            <Avatar
              src={user.image ?? undefined}
              name={displayName}
              status={status}
              size={avatarSize}
            />
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              {displayRole && (
                <div className="text-xs text-muted-foreground capitalize">{displayRole}</div>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align={align} className={cn('w-56', contentClassName)}>
          {/* User info header */}
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1.5">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              {displayRole && (
                <RoleBadge role={displayRole} size="sm" className="mt-1.5 w-fit" />
              )}
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {/* Status selector */}
          {showStatusSelector && onStatusChange && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span className="flex items-center gap-2">
                    {currentStatus.icon}
                    <span>{currentStatus.label}</span>
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={status}
                    onValueChange={(value) => onStatusChange(value as UserPresenceStatus)}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="flex items-center gap-2"
                      >
                        {option.icon}
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Menu items */}
          {allItems.map((item, index) => (
            <DropdownMenuItem
              key={`${item.label}-${index}`}
              disabled={item.disabled || isSigningOut}
              className={cn(
                item.variant === 'destructive' &&
                  'text-destructive focus:bg-destructive/10 focus:text-destructive'
              )}
              onClick={item.onClick}
              asChild={!!item.href}
            >
              {item.href ? (
                <a href={item.href} className="flex items-center">
                  {item.icon && <span className="mr-2">{item.icon}</span>}
                  {item.label}
                </a>
              ) : (
                <>
                  {item.icon && <span className="mr-2">{item.icon}</span>}
                  {item.label}
                </>
              )}
            </DropdownMenuItem>
          ))}

          {/* Sign out */}
          {onSignOut && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                {isSigningOut ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </>
                )}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
)
UserStatusMenu.displayName = 'UserStatusMenu'

export { UserStatusMenu }
