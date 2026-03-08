'use client'

import { useState, useCallback } from 'react'

export interface UseModalReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setIsOpen: (isOpen: boolean) => void
}

/**
 * Hook for managing modal state
 *
 * @param defaultOpen - Initial open state (default: false)
 * @returns Object with isOpen state and control functions
 *
 * @example
 * ```tsx
 * const modal = useModal()
 *
 * <Modal open={modal.isOpen} onOpenChange={modal.setIsOpen}>
 *   ...
 * </Modal>
 * ```
 */
export function useModal(defaultOpen: boolean = false): UseModalReturn {
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
