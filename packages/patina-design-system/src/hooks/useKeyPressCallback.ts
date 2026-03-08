'use client'

import { useEffect, useCallback } from 'react'

export interface UseKeyPressCallbackOptions {
  enabled?: boolean
  preventDefault?: boolean
  target?: HTMLElement | Document
}

/**
 * Hook for executing a callback when a key is pressed
 *
 * @param targetKey - Key to detect
 * @param callback - Function to call when key is pressed
 * @param options - Optional configuration
 *
 * @example
 * ```tsx
 * useKeyPressCallback('Escape', () => closeModal(), { enabled: isOpen })
 * useKeyPressCallback('Enter', handleSubmit, { preventDefault: true })
 * ```
 */
export function useKeyPressCallback(
  targetKey: string,
  callback: (event: KeyboardEvent) => void,
  options: UseKeyPressCallbackOptions = {}
): void {
  const { enabled = true, preventDefault = false, target = typeof document !== 'undefined' ? document : undefined } = options

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return
      if (event.key !== targetKey) return

      if (preventDefault) {
        event.preventDefault()
      }

      callback(event)
    },
    [targetKey, callback, enabled, preventDefault]
  )

  useEffect(() => {
    if (!enabled || !target) return

    const element = target as EventTarget
    element.addEventListener('keydown', handleKeyDown as EventListener)

    return () => {
      element.removeEventListener('keydown', handleKeyDown as EventListener)
    }
  }, [handleKeyDown, enabled, target])
}
