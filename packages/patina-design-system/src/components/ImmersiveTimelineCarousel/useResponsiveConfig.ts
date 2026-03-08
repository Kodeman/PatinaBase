'use client';

import { useState, useEffect, useMemo } from 'react'

export interface TimelineConfig {
  scaleRange: [number, number, number] // [entrance, center, exit]
  cardWidth: string
  cardSpacing: number // vh
  magnetRange: number // px
  enableKeyboard: boolean
}

const DESKTOP_CONFIG: TimelineConfig = {
  scaleRange: [0.5, 1.0, 0.8],
  cardWidth: 'min(900px, 90vw)',
  cardSpacing: 90, // vh, leave neighbors slightly visible
  magnetRange: 150,
  enableKeyboard: true,
}

const TABLET_CONFIG: TimelineConfig = {
  scaleRange: [0.65, 1.0, 0.85],
  cardWidth: '90vw',
  cardSpacing: 90, // vh
  magnetRange: 100,
  enableKeyboard: true,
}

const MOBILE_CONFIG: TimelineConfig = {
  scaleRange: [0.8, 1.0, 0.9],
  cardWidth: '95vw',
  cardSpacing: 88, // vh
  magnetRange: 80,
  enableKeyboard: false,
}

/**
 * Hook to get responsive configuration for timeline
 *
 * Returns appropriate config based on screen size:
 * - Desktop (1024px+): Dramatic 3D depth
 * - Tablet (768-1023px): Reduced depth
 * - Mobile (<768px): Subtle depth
 *
 * Updates on window resize and avoids hydration mismatches by using
 * useState + useEffect pattern.
 */
export function useResponsiveConfig(): TimelineConfig {
  const [config, setConfig] = useState<TimelineConfig>(DESKTOP_CONFIG)

  useEffect(() => {
    const updateConfig = () => {
      const width = window.innerWidth

      if (width < 768) {
        setConfig(MOBILE_CONFIG)
      } else if (width < 1024) {
        setConfig(TABLET_CONFIG)
      } else {
        setConfig(DESKTOP_CONFIG)
      }
    }

    // Set initial config based on actual window size
    updateConfig()

    // Update config on window resize for true responsiveness
    window.addEventListener('resize', updateConfig)
    return () => window.removeEventListener('resize', updateConfig)
  }, [])

  return config
}

/**
 * Hook to detect if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    return mediaQuery.matches
  }, [])
}
