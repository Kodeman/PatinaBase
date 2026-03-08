import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden rounded-full',
  {
    variants: {
      size: {
        xs: 'h-6 w-6',
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-12 w-12',
        xl: 'h-16 w-16',
        '2xl': 'h-20 w-20',
      },
      shape: {
        circle: 'rounded-full',
        square: 'rounded-md',
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  }
)

const avatarStatusVariants = cva(
  'absolute bottom-0 right-0 block rounded-full ring-2 ring-background',
  {
    variants: {
      status: {
        online: 'bg-green-500',
        offline: 'bg-gray-400',
        busy: 'bg-red-500',
        away: 'bg-yellow-500',
      },
      size: {
        xs: 'h-1.5 w-1.5',
        sm: 'h-2 w-2',
        md: 'h-2.5 w-2.5',
        lg: 'h-3 w-3',
        xl: 'h-3.5 w-3.5',
        '2xl': 'h-4 w-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  src?: string
  alt?: string
  name?: string
  status?: 'online' | 'offline' | 'busy' | 'away'
  fallbackDelay?: number
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar component for displaying user profile images
 *
 * @example
 * ```tsx
 * <Avatar src="/avatar.jpg" alt="John Doe" />
 * <Avatar name="John Doe" status="online" />
 * <Avatar name="JD" size="lg" shape="square" />
 * ```
 */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(
  (
    {
      className,
      src,
      alt,
      name,
      size,
      shape,
      status,
      fallbackDelay = 600,
      ...props
    },
    ref
  ) => {
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarVariants({ size, shape, className }))}
        {...props}
      >
        <AvatarPrimitive.Image
          src={src}
          alt={alt || name}
          className="aspect-square h-full w-full object-cover"
        />
        <AvatarPrimitive.Fallback
          delayMs={fallbackDelay}
          className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground"
        >
          {name ? getInitials(name) : '?'}
        </AvatarPrimitive.Fallback>

        {status && (
          <span
            className={cn(avatarStatusVariants({ status, size }))}
            aria-label={`Status: ${status}`}
          />
        )}
      </AvatarPrimitive.Root>
    )
  }
)
Avatar.displayName = 'Avatar'

export { Avatar, avatarVariants }
