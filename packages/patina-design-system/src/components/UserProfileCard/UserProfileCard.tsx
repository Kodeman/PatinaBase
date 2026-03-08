'use client'

import * as React from 'react'
import { Avatar, type AvatarProps } from '../Avatar'
import { RoleBadge } from '../RoleBadge'
import { type UserPresenceStatus } from '../UserStatusMenu'
import { cn } from '../../utils/cn'

/**
 * User data for the profile card
 */
export interface UserProfileCardUser {
  /** User display name */
  name?: string
  /** User email address */
  email?: string
  /** Avatar image URL */
  avatar?: string
  /** Assigned roles */
  roles?: string[]
}

export interface UserProfileCardProps {
  /**
   * User data to display
   */
  user: UserProfileCardUser

  /**
   * Current presence status
   * @default 'online'
   */
  status?: UserPresenceStatus

  /**
   * Whether the sidebar is collapsed
   * When collapsed, only the avatar is shown
   * @default false
   */
  collapsed?: boolean

  /**
   * Click handler for the card
   * If provided, the card will be clickable
   */
  onClick?: () => void

  /**
   * Whether to show the role badge
   * @default true
   */
  showRole?: boolean

  /**
   * Whether to show the status text label
   * @default true
   */
  showStatusLabel?: boolean

  /**
   * Avatar size
   * @default 'sm'
   */
  avatarSize?: AvatarProps['size']

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Get status label and color
 */
function getStatusDisplay(status: UserPresenceStatus): { label: string; color: string } {
  const statusMap: Record<UserPresenceStatus, { label: string; color: string }> = {
    online: { label: 'Online', color: 'text-green-600' },
    offline: { label: 'Offline', color: 'text-gray-500' },
    busy: { label: 'Busy', color: 'text-red-600' },
    away: { label: 'Away', color: 'text-yellow-600' },
  }
  return statusMap[status] || statusMap.offline
}

/**
 * UserProfileCard component for displaying user information in a sidebar.
 * Supports collapsed state for compact layouts.
 *
 * @example
 * ```tsx
 * <UserProfileCard
 *   user={{ name: "John Doe", email: "john@example.com", roles: ["designer"] }}
 *   status="online"
 *   collapsed={false}
 *   onClick={() => router.push('/profile')}
 * />
 * ```
 */
const UserProfileCard = React.forwardRef<HTMLDivElement, UserProfileCardProps>(
  (
    {
      user,
      status = 'online',
      collapsed = false,
      onClick,
      showRole = true,
      showStatusLabel = true,
      avatarSize = 'sm',
      className,
    },
    ref
  ) => {
    const displayName = user.name || user.email || 'User'
    const displayRole = user.roles?.[0]
    const statusDisplay = getStatusDisplay(status)

    const cardContent = (
      <>
        <Avatar
          src={user.avatar}
          name={displayName}
          status={status}
          size={avatarSize}
        />
        {!collapsed && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-sm font-medium truncate text-sidebar-foreground">
              {displayName}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
              {showStatusLabel && (
                <span className={cn('font-medium', statusDisplay.color)}>
                  {statusDisplay.label}
                </span>
              )}
              {showStatusLabel && showRole && displayRole && (
                <span className="text-sidebar-foreground/40">•</span>
              )}
              {showRole && displayRole && (
                <span className="capitalize truncate">{displayRole}</span>
              )}
            </div>
          </div>
        )}
      </>
    )

    const baseClassName = cn(
      'flex items-center gap-3 p-3 border-t border-sidebar-border',
      onClick && 'cursor-pointer hover:bg-sidebar-accent transition-colors rounded-lg',
      collapsed && 'justify-center p-2',
      className
    )

    if (onClick) {
      return (
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          className={baseClassName}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClick()
            }
          }}
        >
          {cardContent}
        </div>
      )
    }

    return (
      <div ref={ref} className={baseClassName}>
        {cardContent}
      </div>
    )
  }
)
UserProfileCard.displayName = 'UserProfileCard'

export { UserProfileCard }
