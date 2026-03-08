'use client';

import { useEffect, useRef, useCallback, useState } from 'react'

export interface UseIntersectionAnimationOptions {
  /** Threshold percentage (0-1) at which to trigger animation */
  threshold?: number
  /** Root margin for observer (e.g., '-50px 0px -50px 0px') */
  rootMargin?: string
  /** Only animate once (don't re-animate on scroll back up) */
  once?: boolean
  /** Stagger delay between consecutive items (ms) */
  staggerDelay?: number
}

export interface UseIntersectionAnimationReturn {
  /** Observe an element for animation */
  observeElement: (id: string, element: HTMLElement | null) => void
  /** Check if element is visible/animated */
  isVisible: (id: string) => boolean
  /** Get stagger delay for element */
  getStaggerDelay: (id: string) => number
  /** Get animation classes for element (deprecated - use getAnimationStyle instead) */
  getAnimationClasses: (id: string) => string
  /** Get inline animation styles - USE THIS for working animations! */
  getAnimationStyle: (id: string) => React.CSSProperties
}

/**
 * useIntersectionAnimation - Card entrance animation hook
 *
 * Implements scroll-triggered animations using Intersection Observer.
 * Follows ClientScroll.md specifications:
 * - Triggers at 25% visibility
 * - One-time animation (persists on scroll-up)
 * - 300ms duration with ease-out
 * - Stagger support for consecutive cards
 *
 * @example
 * ```tsx
 * const animation = useIntersectionAnimation({ threshold: 0.25, once: true })
 *
 * return (
 *   <div
 *     ref={(el) => animation.observeElement(id, el)}
 *     className={animation.getAnimationClasses(id)}
 *     style={{ transitionDelay: `${animation.getStaggerDelay(id)}ms` }}
 *   >
 *     Card content
 *   </div>
 * )
 * ```
 */
export function useIntersectionAnimation(
  options: UseIntersectionAnimationOptions = {}
): UseIntersectionAnimationReturn {
  const {
    threshold = 0.25,
    rootMargin = '-50px 0px -50px 0px',
    once = true,
    staggerDelay = 100,
  } = options

  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const observersRef = useRef<Map<string, IntersectionObserver>>(new Map())
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map())
  const orderRef = useRef<string[]>([])

  // DEBUG: Log hook initialization
  useEffect(() => {
    console.log('[useIntersectionAnimation] Hook initialized with options:', {
      threshold,
      rootMargin,
      once,
      staggerDelay
    })
  }, [])

  const observeElement = useCallback(
    (id: string, element: HTMLElement | null) => {
      console.log('[observeElement] Called for:', id, 'element:', element?.tagName)

      // Clean up existing observer
      const existingObserver = observersRef.current.get(id)
      if (existingObserver) {
        const existingElement = elementsRef.current.get(id)
        if (existingElement) {
          existingObserver.unobserve(existingElement)
        }
        existingObserver.disconnect()
        observersRef.current.delete(id)
      }

      if (!element) {
        elementsRef.current.delete(id)
        console.log('[observeElement] No element provided, cleaning up:', id)
        return
      }

      // Store element reference
      elementsRef.current.set(id, element)

      // Track order for stagger calculation
      if (!orderRef.current.includes(id)) {
        orderRef.current.push(id)
      }
      console.log('[observeElement] Current order:', orderRef.current)

      // Create new Intersection Observer
      const observer = new IntersectionObserver(
        (entries) => {
          console.log('[IntersectionObserver] Callback fired for:', id, 'entries:', entries.length)
          entries.forEach((entry) => {
            console.log('[IntersectionObserver] Entry:', {
              id,
              isIntersecting: entry.isIntersecting,
              intersectionRatio: entry.intersectionRatio,
              boundingClientRect: entry.boundingClientRect
            })

            if (entry.isIntersecting) {
              console.log('[IntersectionObserver] Element entering viewport:', id)

              // CRITICAL: Use double RAF to force browser reflow
              // This ensures the initial hidden state is painted before transitioning to visible
              // First RAF: Browser paints current state (hidden)
              // Second RAF: Browser applies visible state, triggering CSS transition
              requestAnimationFrame(() => {
                console.log('[RAF 1] First RAF for:', id)
                requestAnimationFrame(() => {
                  console.log('[RAF 2] Second RAF - setting visible:', id)
                  // Mark as visible
                  setVisibleIds((prev) => {
                    const next = new Set(prev).add(id)
                    console.log('[setState] Updating visibleIds. New size:', next.size, 'IDs:', Array.from(next))
                    return next
                  })

                  // If one-time, unobserve after animation
                  if (once) {
                    observer.unobserve(entry.target)
                    observersRef.current.delete(id)
                    console.log('[IntersectionObserver] Unobserved (once mode):', id)
                  }
                })
              })
            } else if (!once) {
              console.log('[IntersectionObserver] Element leaving viewport:', id)
              // If not one-time, remove visibility on exit
              setVisibleIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
              })
            }
          })
        },
        {
          threshold,
          rootMargin,
        }
      )

      console.log('[observeElement] Starting observation for:', id)
      observer.observe(element)
      observersRef.current.set(id, observer)
    },
    [threshold, rootMargin, once]
  )

  const isVisible = useCallback(
    (id: string): boolean => {
      return visibleIds.has(id)
    },
    [visibleIds]
  )

  const getStaggerDelay = useCallback(
    (id: string): number => {
      const index = orderRef.current.indexOf(id)
      return index >= 0 ? index * staggerDelay : 0
    },
    [staggerDelay]
  )

  const getAnimationClasses = useCallback(
    (id: string): string => {
      const visible = visibleIds.has(id)

      // Base transition classes
      const baseClasses = 'transition-all duration-300 ease-out'

      const classes = !visible
        ? `${baseClasses} opacity-0 scale-95 translate-y-5`
        : `${baseClasses} opacity-100 scale-100 translate-y-0`

      console.log('[getAnimationClasses]', id, 'visible:', visible, 'classes:', classes)

      return classes
    },
    [visibleIds]
  )

  // WORKING METHOD: Use inline styles instead of className
  // CSS transitions work on property value changes, not className swaps
  // Apple-like spring: cubic-bezier(0.16, 1, 0.3, 1) + longer duration
  const getAnimationStyle = useCallback(
    (id: string): React.CSSProperties => {
      const visible = visibleIds.has(id)
      const index = orderRef.current.indexOf(id)
      const delay = index >= 0 ? index * staggerDelay : 0

      // Apple-like spring easing curve
      const baseStyle: React.CSSProperties = {
        transition: `opacity 600ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 800ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }

      if (!visible) {
        // Initial hidden state
        console.log('[getAnimationStyle]', id, 'HIDDEN state')
        return {
          ...baseStyle,
          opacity: 0,
          transform: 'scale(0.92) translateY(30px)',
        }
      } else {
        // Visible state
        console.log('[getAnimationStyle]', id, 'VISIBLE state')
        return {
          ...baseStyle,
          opacity: 1,
          transform: 'scale(1) translateY(0)',
        }
      }
    },
    [visibleIds, staggerDelay]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      observersRef.current.forEach((observer, id) => {
        const element = elementsRef.current.get(id)
        if (element) {
          observer.unobserve(element)
        }
        observer.disconnect()
      })
      observersRef.current.clear()
      elementsRef.current.clear()
    }
  }, [])

  return {
    observeElement,
    isVisible,
    getStaggerDelay,
    getAnimationClasses,
    getAnimationStyle, // NEW: Use this for working animations!
  }
}
