import * as React from 'react'
import { cn } from '../../utils/cn'
import { Avatar, type AvatarProps } from '../Avatar'

export interface AvatarGroupProps extends React.ComponentPropsWithoutRef<'div'> {
  max?: number
  spacing?: 'tight' | 'normal' | 'loose'
  size?: AvatarProps['size']
  shape?: AvatarProps['shape']
  children: React.ReactNode
}

const spacingMap = {
  tight: '-space-x-1',
  normal: '-space-x-2',
  loose: '-space-x-3',
}

/**
 * AvatarGroup component for displaying multiple avatars in an overlapping stack
 *
 * @example
 * ```tsx
 * <AvatarGroup max={3}>
 *   <Avatar name="John Doe" />
 *   <Avatar name="Jane Smith" />
 *   <Avatar name="Bob Johnson" />
 *   <Avatar name="Alice Williams" />
 * </AvatarGroup>
 * ```
 */
const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  (
    {
      max = 3,
      spacing = 'normal',
      size = 'md',
      shape,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const childArray = React.Children.toArray(children)
    const displayChildren = max ? childArray.slice(0, max) : childArray
    const overflowCount = max ? Math.max(childArray.length - max, 0) : 0

    return (
      <div
        ref={ref}
        className={cn('flex items-center', spacingMap[spacing], className)}
        {...props}
      >
        {displayChildren.map((child, index) => {
          if (!React.isValidElement(child)) return null

          const childElement = child as React.ReactElement<AvatarProps>
          return (
            <div
              key={index}
              className="relative ring-2 ring-background rounded-full"
              style={{ zIndex: displayChildren.length - index }}
            >
              {React.cloneElement(childElement, {
                size: childElement.props.size || size,
                shape: childElement.props.shape || shape,
              })}
            </div>
          )
        })}

        {overflowCount > 0 && (
          <div
            className="relative ring-2 ring-background rounded-full"
            style={{ zIndex: 0 }}
          >
            <Avatar
              name={`+${overflowCount}`}
              size={size}
              shape={shape}
              className="bg-muted text-muted-foreground"
            />
          </div>
        )}
      </div>
    )
  }
)
AvatarGroup.displayName = 'AvatarGroup'

export { AvatarGroup }
