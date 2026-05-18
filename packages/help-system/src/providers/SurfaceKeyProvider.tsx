'use client'

import { createContext, useContext, useMemo, useEffect, useState, type ReactNode } from 'react'
import { isSurfaceKey, type SurfaceKey } from '../surfaceKeys'

interface SurfaceKeyContextValue {
  /**
   * The currently active surface key. May be a typed SurfaceKey from our registry,
   * OR an arbitrary string for surfaces that haven't been added to the registry yet
   * (graceful degradation during the migration phase).
   */
  currentSurfaceKey: SurfaceKey | string | null
  /** Set programmatically from a leaf component (e.g., when a wizard step changes) */
  setSurfaceKey: (key: SurfaceKey | string | null) => void
}

const SurfaceKeyContext = createContext<SurfaceKeyContextValue | undefined>(undefined)

export interface SurfaceKeyProviderProps {
  children: ReactNode
  /**
   * The surface key derived from the route. If consumer passes this, the provider
   * uses it as the initial value; subsequent calls to setSurfaceKey override it.
   *
   * Typical usage: portals derive this from Next.js usePathname() in their layout.
   */
  initialSurfaceKey?: SurfaceKey | string | null
}

export function SurfaceKeyProvider({ children, initialSurfaceKey = null }: SurfaceKeyProviderProps) {
  const [currentSurfaceKey, setSurfaceKey] = useState<SurfaceKey | string | null>(initialSurfaceKey)

  // If parent's initialSurfaceKey changes (e.g., route changes), follow it
  // unless a leaf has explicitly overridden via setSurfaceKey since.
  // For simplicity in this first version, always follow initialSurfaceKey.
  // (A future refinement could add a "manual override" flag.)
  useEffect(() => {
    setSurfaceKey(initialSurfaceKey)
  }, [initialSurfaceKey])

  const value = useMemo<SurfaceKeyContextValue>(
    () => ({ currentSurfaceKey, setSurfaceKey }),
    [currentSurfaceKey],
  )

  // In dev, warn if a non-conformant surface key is set so we catch typos early
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      currentSurfaceKey !== null &&
      !isSurfaceKey(currentSurfaceKey)
    ) {
      console.warn(
        `[help-system] currentSurfaceKey="${currentSurfaceKey}" does not match the surface-key regex. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [currentSurfaceKey])

  return <SurfaceKeyContext.Provider value={value}>{children}</SurfaceKeyContext.Provider>
}

/**
 * Read the current surface key from anywhere in the tree.
 * Returns null if no provider is mounted (graceful — components shouldn't crash).
 */
export function useSurfaceKey(): SurfaceKey | string | null {
  const ctx = useContext(SurfaceKeyContext)
  return ctx?.currentSurfaceKey ?? null
}

/**
 * Write the current surface key from a leaf component (e.g., wizard step changes).
 * Returns a no-op if no provider is mounted.
 */
export function useSetSurfaceKey(): (key: SurfaceKey | string | null) => void {
  const ctx = useContext(SurfaceKeyContext)
  return ctx?.setSurfaceKey ?? (() => {})
}
