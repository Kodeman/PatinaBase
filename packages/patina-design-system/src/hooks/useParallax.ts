'use client'

import { useEffect, useState, useCallback, RefObject } from 'react'

export interface ParallaxOffset {
  x: number
  y: number
}

export interface UseParallaxOptions {
  speed?: number // 0.5 = half speed, 2.0 = double speed
  container?: RefObject<HTMLElement>
  disabled?: boolean
  direction?: 'vertical' | 'horizontal' | 'both'
}

/**
 * Hook to create parallax scrolling effects
 *
 * @example
 * ```tsx
 * const offset = useParallax({ speed: 0.5 })
 *
 * return (
 *   <div style={{ transform: `translateY(${offset.y}px)` }}>
 *     Parallax content
 *   </div>
 * )
 * ```
 */
export function useParallax(options: UseParallaxOptions = {}): ParallaxOffset {
  const {
    speed = 1.0,
    container,
    disabled = false,
    direction = 'vertical',
  } = options

  const [offset, setOffset] = useState<ParallaxOffset>({ x: 0, y: 0 })

  const handleScroll = useCallback(() => {
    if (disabled) return

    const element = container?.current || document.documentElement
    const scrollY = container?.current ? element.scrollTop : window.scrollY
    const scrollX = container?.current ? element.scrollLeft : window.scrollX

    // Calculate parallax offset based on speed
    // Speed < 1 = slower than scroll (background effect)
    // Speed > 1 = faster than scroll (foreground effect)
    const parallaxFactor = 1 - speed

    setOffset({
      x: direction !== 'vertical' ? scrollX * parallaxFactor : 0,
      y: direction !== 'horizontal' ? scrollY * parallaxFactor : 0,
    })
  }, [speed, container, disabled, direction])

  useEffect(() => {
    if (disabled) return

    const element = container?.current
    const scrollElement = element || window

    let rafId: number | null = null

    const onScroll = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(handleScroll)
    }

    scrollElement.addEventListener('scroll', onScroll, { passive: true })

    // Initialize
    handleScroll()

    return () => {
      scrollElement.removeEventListener('scroll', onScroll)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [container, handleScroll, disabled])

  return offset
}
