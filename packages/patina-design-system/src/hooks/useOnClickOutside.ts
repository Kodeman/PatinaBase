'use client'

import { useEffect, RefObject } from 'react'

/**
 * Hook for detecting clicks outside of a component
 *
 * @param ref - React ref of the element
 * @param handler - Callback function to execute on outside click
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null)
 * useOnClickOutside(ref, () => setIsOpen(false))
 *
 * return <div ref={ref}>Content</div>
 * ```
 */
export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref?.current
      if (!el || el.contains(event.target as Node)) {
        return
      }

      handler(event)
    }

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)

    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}
