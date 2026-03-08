'use client';

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Hook for magnetic scroll snap behavior
 *
 * Implements hybrid scroll snapping:
 * - CSS scroll-snap for baseline behavior
 * - JavaScript enhancement for "magnetic" zones
 *
 * @param snapPoints - Array of scroll positions to snap to
 * @param magnetRange - Distance in pixels for magnetic attraction (default: 150)
 * @param velocityThreshold - Max velocity (px/s) to trigger snap (default: 50)
 */
export function useScrollSnap(
  snapPoints: number[],
  magnetRange: number = 150,
  velocityThreshold: number = 50
) {
  const [velocity, setVelocity] = useState(0)
  const lastScrollY = useRef(0)
  const lastTimestamp = useRef(Date.now())
  const isSnapping = useRef(false)
  const snapAnimation = useRef<number | null>(null)
  const scrollEndTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartY = useRef(0)
  const touchTriggeredSnap = useRef(false)

  const animateScrollTo = useCallback((target: number) => {
    if (typeof window === 'undefined') return

    if (snapAnimation.current) {
      cancelAnimationFrame(snapAnimation.current)
      snapAnimation.current = null
    }

    const start = window.scrollY
    const distance = target - start

    if (Math.abs(distance) < 1) {
      window.scrollTo({ top: target })
      isSnapping.current = false
      return
    }

    const duration = Math.min(900, Math.max(300, Math.abs(distance) * 0.5))
    const startTime = performance.now()
    isSnapping.current = true

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      window.scrollTo({ top: start + distance * eased })

      if (progress < 1) {
        snapAnimation.current = requestAnimationFrame(step)
      } else {
        isSnapping.current = false
        snapAnimation.current = null
      }
    }

    snapAnimation.current = requestAnimationFrame(step)
  }, [])

  const getClosestIndex = useCallback(
    (value: number) => {
      if (snapPoints.length === 0) return 0
      let closestIndex = 0
      let minDistance = Number.POSITIVE_INFINITY

      snapPoints.forEach((point, index) => {
        const distance = Math.abs(point - value)
        if (distance < minDistance) {
          minDistance = distance
          closestIndex = index
        }
      })

      return closestIndex
    },
    [snapPoints]
  )

  const snapToIndex = useCallback(
    (index: number) => {
      if (snapPoints.length === 0) return
      const clampedIndex = Math.min(Math.max(index, 0), snapPoints.length - 1)
      const target = snapPoints[clampedIndex]
      if (typeof target !== 'number') return
      animateScrollTo(target)
    },
    [snapPoints, animateScrollTo]
  )

  const maybeSnap = useCallback(
    (force: boolean = false) => {
      if (typeof window === 'undefined' || snapPoints.length === 0) return

      const currentY = window.scrollY
      const maxSnap = snapPoints[snapPoints.length - 1]
      const minSnap = snapPoints[0]
      const clampedCurrent = Math.min(Math.max(currentY, 0), maxSnap)
      const range = force ? Number.POSITIVE_INFINITY : magnetRange
      const nearestSnap = findNearestSnapPoint(clampedCurrent, snapPoints, range)

      if (nearestSnap === null) return

      const target = Math.min(Math.max(nearestSnap, minSnap), maxSnap)
      if (Math.abs(target - currentY) <= 2) return

      animateScrollTo(target)
    },
    [snapPoints, magnetRange, animateScrollTo]
  )

  const queueDirectionalSnap = useCallback(
    (direction: 1 | -1) => {
      if (typeof window === 'undefined' || snapPoints.length === 0) return false
      if (isSnapping.current) return false

      const currentIndex = getClosestIndex(window.scrollY)
      const targetIndex = currentIndex + direction

      if (targetIndex < 0 || targetIndex >= snapPoints.length) return false
      snapToIndex(targetIndex)
      return true
    },
    [getClosestIndex, snapToIndex]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleScroll = () => {
      if (isSnapping.current) return

      const now = Date.now()
      const currentY = window.scrollY
      const deltaY = currentY - lastScrollY.current
      const deltaTime = now - lastTimestamp.current

      // Calculate velocity (px/s)
      const currentVelocity = Math.abs(deltaY / deltaTime) * 1000
      setVelocity(currentVelocity)

      // If velocity drops below threshold, check for nearby snap points
      if (currentVelocity < velocityThreshold) {
        maybeSnap()
      }

      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current)
      }
      scrollEndTimeout.current = setTimeout(() => {
        maybeSnap(true)
      }, 120)

      lastScrollY.current = currentY
      lastTimestamp.current = now
    }

    // Throttle scroll handler for performance
    let rafId: number
    const throttledHandleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(handleScroll)
    }

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 1) return

      const direction = event.deltaY > 0 ? 1 : -1
      const handled = queueDirectionalSnap(direction as 1 | -1)

      if (handled) {
        event.preventDefault()
      }
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      touchStartY.current = event.touches[0]?.clientY ?? 0
      touchTriggeredSnap.current = false
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      if (touchTriggeredSnap.current) {
        event.preventDefault()
        return
      }

      const currentY = event.touches[0]?.clientY ?? touchStartY.current
      const delta = touchStartY.current - currentY

      if (Math.abs(delta) < 25) {
        return
      }

      const handled = queueDirectionalSnap(delta > 0 ? 1 : -1)
      if (handled) {
        touchTriggeredSnap.current = true
        event.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      if (!touchTriggeredSnap.current) {
        maybeSnap(true)
      }
      touchTriggeredSnap.current = false
    }

    window.addEventListener('scroll', throttledHandleScroll, { passive: true })
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('scroll', throttledHandleScroll)
      if (rafId) cancelAnimationFrame(rafId)
      if (scrollEndTimeout.current) clearTimeout(scrollEndTimeout.current)
      if (snapAnimation.current) cancelAnimationFrame(snapAnimation.current)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [snapPoints, magnetRange, velocityThreshold, maybeSnap, queueDirectionalSnap])

  return velocity
}

/**
 * Find the nearest snap point within the magnetic range
 */
function findNearestSnapPoint(
  currentScroll: number,
  snapPoints: number[],
  magnetRange: number
): number | null {
  let nearest: number | null = null
  let minDistance = magnetRange

  for (const point of snapPoints) {
    const distance = Math.abs(point - currentScroll)

    if (distance < minDistance) {
      minDistance = distance
      nearest = point
    }
  }

  return nearest
}
