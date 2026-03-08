'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { useParallax } from '../../hooks/useParallax'

export interface ParallaxLayerProps extends React.ComponentPropsWithoutRef<'div'> {
  speed?: number
  direction?: 'vertical' | 'horizontal' | 'both'
  disabled?: boolean
  children: React.ReactNode
}

/**
 * ParallaxLayer component for creating depth through parallax scrolling
 *
 * @example
 * ```tsx
 * <ParallaxLayer speed={0.5}>
 *   <img src="background.jpg" alt="Background" />
 * </ParallaxLayer>
 * ```
 */
export const ParallaxLayer = React.forwardRef<HTMLDivElement, ParallaxLayerProps>(
  ({ className, speed = 0.5, direction = 'vertical', disabled = false, children, style, ...props }, ref) => {
    const offset = useParallax({ speed, direction, disabled })

    const transform = React.useMemo(() => {
      if (disabled) return 'none'
      if (direction === 'vertical') return `translateY(${offset.y}px)`
      if (direction === 'horizontal') return `translateX(${offset.x}px)`
      return `translate(${offset.x}px, ${offset.y}px)`
    }, [offset, direction, disabled])

    return (
      <div
        ref={ref}
        className={cn('will-change-transform', className)}
        style={{
          ...style,
          transform,
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ParallaxLayer.displayName = 'ParallaxLayer'
