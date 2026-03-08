'use client'

import { useState, useCallback } from 'react'

export interface UseDisclosureReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Hook for managing open/close state of components like modals, dropdowns, etc.
 *
 * @param initialState - Initial open/closed state (default: false)
 * @returns Object with isOpen state and control functions
 *
 * @example
 * ```tsx
 * const { isOpen, open, close, toggle } = useDisclosure()
 * ```
 */
export function useDisclosure(initialState: boolean = false): UseDisclosureReturn {
  const [isOpen, setIsOpen] = useState(initialState)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  return {
    isOpen,
    open,
    close,
    toggle,
  }
}
