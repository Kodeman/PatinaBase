'use client'

import { useEffect, useState, useRef, type RefObject } from 'react'

export interface ScrollProgress {
  scrollY: number
  scrollPercentage: number
  direction: 'up' | 'down' | 'idle'
  velocity: number
}

export interface UseScrollProgressOptions {
  container?: RefObject<HTMLElement>
  throttle?: number
}

/**
 * Hook to track scroll progress with velocity and direction
 *
 * @example
 * ```tsx
 * const { scrollPercentage, direction, velocity } = useScrollProgress()
 * ```
 */
export function useScrollProgress(options: UseScrollProgressOptions = {}): ScrollProgress {
  const { container, throttle = 16 } = options // ~60fps

  const [progress, setProgress] = useState<ScrollProgress>({
    scrollY: 0,
    scrollPercentage: 0,
    direction: 'idle',
    velocity: 0,
  })

  // Use refs for mutable tracking values to avoid re-creating the callback
  const lastScrollYRef = useRef(0)
  const lastTimestampRef = useRef(Date.now())

  useEffect(() => {
    const element = container?.current
    const scrollElement = element || window

    let rafId: number | null = null
    let lastCall = 0

    const handleScroll = () => {
      const el = container?.current || document.documentElement
      const scrollY = container?.current ? el.scrollTop : window.scrollY

      const scrollHeight = el.scrollHeight - el.clientHeight
      const scrollPercentage = scrollHeight > 0 ? (scrollY / scrollHeight) * 100 : 0

      // Calculate velocity (pixels per ms)
      const now = Date.now()
      const timeDelta = now - lastTimestampRef.current
      const scrollDelta = scrollY - lastScrollYRef.current
      const velocity = timeDelta > 0 ? Math.abs(scrollDelta / timeDelta) : 0

      // Determine direction
      let direction: 'up' | 'down' | 'idle' = 'idle'
      if (scrollDelta > 1) direction = 'down'
      else if (scrollDelta < -1) direction = 'up'

      setProgress({
        scrollY,
        scrollPercentage,
        direction,
        velocity,
      })

      lastScrollYRef.current = scrollY
      lastTimestampRef.current = now
    }

    const throttledScroll = () => {
      const now = Date.now()
      if (now - lastCall >= throttle) {
        handleScroll()
        lastCall = now
      }
      rafId = requestAnimationFrame(throttledScroll)
    }

    const startThrottledScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(throttledScroll)
      }
    }

    const stopThrottledScroll = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }

    scrollElement.addEventListener('scroll', startThrottledScroll, { passive: true })

    // Initialize
    handleScroll()

    return () => {
      scrollElement.removeEventListener('scroll', startThrottledScroll)
      stopThrottledScroll()
    }
  }, [container, throttle])

  return progress
}
