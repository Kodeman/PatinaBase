import * as React from 'react'
import { cn } from '../../utils/cn'

export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Aspect ratio (width / height)
   * Common ratios: 16/9, 4/3, 1/1, 21/9
   * @example 16/9, 4/3, 1
   */
  ratio?: number

  /**
   * Render as a different HTML element
   */
  as?: React.ElementType
}

/**
 * AspectRatio component for maintaining consistent aspect ratios
 *
 * @example
 * ```tsx
 * // 16:9 aspect ratio (video)
 * <AspectRatio ratio={16 / 9}>
 *   <img src="video-thumbnail.jpg" alt="Video" />
 * </AspectRatio>
 *
 * // 1:1 aspect ratio (square)
 * <AspectRatio ratio={1}>
 *   <img src="profile.jpg" alt="Profile" />
 * </AspectRatio>
 *
 * // 4:3 aspect ratio
 * <AspectRatio ratio={4 / 3}>
 *   <iframe src="https://example.com" />
 * </AspectRatio>
 * ```
 */
const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ className, ratio = 16 / 9, as: Component = 'div', children, style, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn('relative w-full', className)}
        style={{
          paddingBottom: `${100 / ratio}%`,
          ...style,
        }}
        {...props}
      >
        <div className="absolute inset-0">{children}</div>
      </Component>
    )
  }
)

AspectRatio.displayName = 'AspectRatio'

export { AspectRatio }
