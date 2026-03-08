'use client'

import { useState, useEffect } from 'react'

/**
 * Hook for detecting key presses
 *
 * @param targetKey - Key to detect
 * @returns Boolean indicating if the key is pressed
 *
 * @example
 * ```tsx
 * const escapePressed = useKeyPress('Escape')
 * const enterPressed = useKeyPress('Enter')
 *
 * useEffect(() => {
 *   if (escapePressed) {
 *     closeModal()
 *   }
 * }, [escapePressed])
 * ```
 */
export function useKeyPress(targetKey: string): boolean {
  const [keyPressed, setKeyPressed] = useState(false)

  useEffect(() => {
    const downHandler = ({ key }: KeyboardEvent) => {
      if (key === targetKey) {
        setKeyPressed(true)
      }
    }

    const upHandler = ({ key }: KeyboardEvent) => {
      if (key === targetKey) {
        setKeyPressed(false)
      }
    }

    window.addEventListener('keydown', downHandler)
    window.addEventListener('keyup', upHandler)

    return () => {
      window.removeEventListener('keydown', downHandler)
      window.removeEventListener('keyup', upHandler)
    }
  }, [targetKey])

  return keyPressed
}
