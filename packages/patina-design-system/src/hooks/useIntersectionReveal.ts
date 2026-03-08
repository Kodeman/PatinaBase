'use client'

import { useEffect, useState, useRef, type MutableRefObject } from 'react'

export type RevealTriggerPoint = 'early' | 'standard' | 'late' | 'center'

export interface UseIntersectionRevealOptions {
  triggerPoint?: RevealTriggerPoint
  threshold?: number | number[]
  rootMargin?: string
  triggerOnce?: boolean
  disabled?: boolean
}

const TRIGGER_THRESHOLDS: Record<RevealTriggerPoint, number> = {
  early: 0.1,    // 10% visible
  standard: 0.3, // 30% visible
  late: 0.5,     // 50% visible
  center: 0.7,   // 70% visible
}

/**
 * Hook to detect when an element enters the viewport for reveal animations
 *
 * @example
 * ```tsx
 * const [ref, isVisible] = useIntersectionReveal<HTMLDivElement>({
 *   triggerPoint: 'standard',
 *   triggerOnce: true
 * })
 *
 * return (
 *   <div ref={ref} className={isVisible ? 'animate-fadeIn' : 'opacity-0'}>
 *     Content
 *   </div>
 * )
 * ```
 */
export function useIntersectionReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseIntersectionRevealOptions = {}
): [MutableRefObject<T | null>, boolean, IntersectionObserverEntry | null] {
  const {
    triggerPoint = 'standard',
    threshold,
    rootMargin = '0px',
    triggerOnce = true,
    disabled = false,
  } = options

  const ref = useRef<T>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || disabled) return

    // If already visible and triggerOnce is true, don't observe
    if (isVisible && triggerOnce) return

    const observerThreshold = threshold ?? TRIGGER_THRESHOLDS[triggerPoint]

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        setEntry(entry)

        if (entry.isIntersecting) {
          setIsVisible(true)

          // Unobserve if triggerOnce
          if (triggerOnce) {
            observer.unobserve(element)
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      {
        threshold: observerThreshold,
        rootMargin,
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [triggerPoint, threshold, rootMargin, triggerOnce, disabled, isVisible])

  return [ref, isVisible, entry]
}
