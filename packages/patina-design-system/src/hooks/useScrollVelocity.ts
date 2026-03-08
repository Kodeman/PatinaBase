'use client'

import { useEffect, useState, useCallback, RefObject } from 'react'

export type ScrollSpeed = 'slow' | 'normal' | 'fast'

export interface ScrollVelocityState {
  velocity: number
  speed: ScrollSpeed
  isScrolling: boolean
}

export interface UseScrollVelocityOptions {
  container?: RefObject<HTMLElement>
  slowThreshold?: number
  fastThreshold?: number
  idleTimeout?: number
}

/**
 * Hook to track scroll velocity and categorize scroll speed
 * Useful for applying different animation effects based on scroll speed
 *
 * @example
 * ```tsx
 * const { velocity, speed, isScrolling } = useScrollVelocity({
 *   slowThreshold: 50,
 *   fastThreshold: 200
 * })
 *
 * // Apply motion blur on fast scrolling
 * const motionBlur = speed === 'fast' ? 'blur(2px)' : 'none'
 * ```
 */
export function useScrollVelocity(
  options: UseScrollVelocityOptions = {}
): ScrollVelocityState {
  const {
    container,
    slowThreshold = 50,
    fastThreshold = 200,
    idleTimeout = 150,
  } = options

  const [state, setState] = useState<ScrollVelocityState>({
    velocity: 0,
    speed: 'normal',
    isScrolling: false,
  })

  const [lastScrollY, setLastScrollY] = useState(0)
  const [lastTimestamp, setLastTimestamp] = useState(Date.now())
  const [idleTimer, setIdleTimer] = useState<number | null>(null)

  const calculateSpeed = useCallback(
    (velocity: number): ScrollSpeed => {
      if (velocity < slowThreshold) return 'slow'
      if (velocity > fastThreshold) return 'fast'
      return 'normal'
    },
    [slowThreshold, fastThreshold]
  )

  const handleScroll = useCallback(() => {
    const element = container?.current || document.documentElement
    const scrollY = container?.current ? element.scrollTop : window.scrollY

    const now = Date.now()
    const timeDelta = now - lastTimestamp
    const scrollDelta = Math.abs(scrollY - lastScrollY)

    // Calculate velocity in pixels per millisecond
    const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0
    const speed = calculateSpeed(velocity)

    setState({
      velocity,
      speed,
      isScrolling: true,
    })

    setLastScrollY(scrollY)
    setLastTimestamp(now)

    // Clear existing idle timer
    if (idleTimer) {
      window.clearTimeout(idleTimer)
    }

    // Set new idle timer
    const timer = window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        velocity: 0,
        isScrolling: false,
      }))
    }, idleTimeout)

    setIdleTimer(timer)
  }, [container, lastScrollY, lastTimestamp, idleTimer, idleTimeout, calculateSpeed])

  useEffect(() => {
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

    return () => {
      scrollElement.removeEventListener('scroll', onScroll)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      if (idleTimer) {
        window.clearTimeout(idleTimer)
      }
    }
  }, [container, handleScroll, idleTimer])

  return state
}
