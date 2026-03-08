'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface SwipeGestureOptions {
  onSwipe?: (direction: SwipeDirection) => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number // Minimum distance for swipe
  enabled?: boolean
}

/**
 * Hook to detect swipe gestures on touch devices
 *
 * @example
 * ```tsx
 * const ref = useSwipeGesture<HTMLDivElement>({
 *   onSwipeLeft: () => console.log('Swiped left'),
 *   onSwipeRight: () => console.log('Swiped right'),
 *   threshold: 50
 * })
 *
 * return <div ref={ref}>Swipeable content</div>
 * ```
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  options: SwipeGestureOptions = {}
): MutableRefObject<T | null> {
  const {
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    enabled = true,
  } = options

  const ref = useRef<T>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndX = useRef(0)
  const touchEndY = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.changedTouches[0].screenX
      touchStartY.current = e.changedTouches[0].screenY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX.current = e.changedTouches[0].screenX
      touchEndY.current = e.changedTouches[0].screenY

      handleSwipe()
    }

    const handleSwipe = () => {
      const deltaX = touchEndX.current - touchStartX.current
      const deltaY = touchEndY.current - touchStartY.current

      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      // Determine if horizontal or vertical swipe
      if (absDeltaX > absDeltaY) {
        // Horizontal swipe
        if (absDeltaX > threshold) {
          const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left'
          onSwipe?.(direction)

          if (direction === 'left') {
            onSwipeLeft?.()
          } else {
            onSwipeRight?.()
          }
        }
      } else {
        // Vertical swipe
        if (absDeltaY > threshold) {
          const direction: SwipeDirection = deltaY > 0 ? 'down' : 'up'
          onSwipe?.(direction)

          if (direction === 'up') {
            onSwipeUp?.()
          } else {
            onSwipeDown?.()
          }
        }
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [
    enabled,
    threshold,
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  ])

  return ref
}
