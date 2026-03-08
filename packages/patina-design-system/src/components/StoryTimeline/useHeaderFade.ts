'use client';

import { useEffect, useState, useCallback } from 'react'

export interface UseHeaderFadeOptions {
  /** Scroll range in pixels over which to fade (default: 200) */
  fadeRange?: number
  /** Enable dark background overlay */
  darkMode?: boolean
  /** Maximum dark overlay opacity (default: 0.7) */
  maxDarkOpacity?: number
}

export interface UseHeaderFadeReturn {
  /** Current header opacity (0-1) */
  opacity: number
  /** Current dark overlay opacity (0-maxDarkOpacity) */
  darkOpacity: number
  /** Apply these styles to header element */
  headerStyle: React.CSSProperties
  /** Apply these styles to dark overlay element */
  overlayStyle: React.CSSProperties
}

/**
 * useHeaderFade - Header fade-out animation on scroll
 *
 * Implements scroll-triggered header fade following ClientScroll.md:
 * - Fades from opacity 1 to 0 over scroll range (default 0-200px)
 * - Optional dark background overlay that increases with scroll
 * - Uses requestAnimationFrame for smooth performance
 *
 * @example
 * ```tsx
 * const headerFade = useHeaderFade({ fadeRange: 200, darkMode: true })
 *
 * return (
 *   <>
 *     <div style={headerFade.overlayStyle} className="fixed inset-0 pointer-events-none" />
 *     <header style={headerFade.headerStyle}>
 *       Header content
 *     </header>
 *   </>
 * )
 * ```
 */
export function useHeaderFade(
  options: UseHeaderFadeOptions = {}
): UseHeaderFadeReturn {
  const {
    fadeRange = 200,
    darkMode = true,
    maxDarkOpacity = 0.7,
  } = options

  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    let rafId: number | null = null
    let lastScrollY = window.scrollY

    const handleScroll = () => {
      if (rafId !== null) {
        return // Already scheduled
      }

      rafId = requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        if (currentScrollY !== lastScrollY) {
          setScrollY(currentScrollY)
          lastScrollY = currentScrollY
        }
        rafId = null
      })
    }

    // Initial value
    setScrollY(window.scrollY)

    // Listen to scroll with passive flag for performance
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Calculate opacity based on scroll position
  const opacity = Math.max(0, Math.min(1, 1 - scrollY / fadeRange))
  const darkOpacity = darkMode
    ? Math.min(maxDarkOpacity, (scrollY / fadeRange) * maxDarkOpacity)
    : 0

  // Header styles
  const headerStyle: React.CSSProperties = {
    opacity,
    transition: 'opacity 300ms ease-out',
  }

  // Dark overlay styles
  const overlayStyle: React.CSSProperties = {
    backgroundColor: `rgba(0, 0, 0, ${darkOpacity})`,
    transition: 'background-color 300ms ease-out',
    pointerEvents: 'none',
  }

  return {
    opacity,
    darkOpacity,
    headerStyle,
    overlayStyle,
  }
}
