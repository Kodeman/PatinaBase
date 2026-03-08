'use client'

import { useState, useCallback } from 'react'

export interface UseDrawerReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setIsOpen: (isOpen: boolean) => void
}

/**
 * Hook for managing drawer state
 *
 * @param defaultOpen - Initial open state (default: false)
 * @returns Object with isOpen state and control functions
 *
 * @example
 * ```tsx
 * const drawer = useDrawer()
 *
 * <Drawer open={drawer.isOpen} onOpenChange={drawer.setIsOpen}>
 *   ...
 * </Drawer>
 * ```
 */
export function useDrawer(defaultOpen: boolean = false): UseDrawerReturn {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
  }
}
