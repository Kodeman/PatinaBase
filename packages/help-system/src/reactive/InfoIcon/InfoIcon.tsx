'use client'

import { useEffect, useMemo } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Tooltip } from '../Tooltip'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'

// Local cn() — mirrors @patina/design-system/utils/cn so this package does not
// depend on @patina/design-system's built dist for vitest/tsup. Both clsx and
// tailwind-merge are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// ─── Component contract (spec §4.2) ───────────────────────────────────────────

export interface InfoIconProps {
  /** Surface key from the help-system registry (must match SURFACE_KEY_REGEX). */
  surfaceKey: string
  /** Pixel size of the circular glyph. Default 14. */
  size?: number
  /** Additional Tailwind classes merged onto the trigger button. */
  className?: string
  /** Optional fallback body if CMS returns null. If both are absent the icon
   *  renders without any tooltip wrapper (silent absence). */
  fallback?: string
  /** Explicit aria-label override. Defaults to "More information". */
  ariaLabel?: string
}

/**
 * <InfoIcon /> — Reactive-layer affordance (spec §4.2). A small "?" glyph that
 * opens a Sanity-backed tooltip on hover or focus. Use for general questions
 * ("what does this number mean?"); use `<StrataInfoIcon />` for Patina-specific
 * concepts.
 *
 * Wraps the trigger in the canonical `<Tooltip />` (C1) so CMS fetch, fallback
 * resolution, portal rendering, and analytics (`help.tooltip.shown` /
 * `help.tooltip.dismissed`) flow through a single code path. Passes
 * `trigger="info_icon"` so PostHog can distinguish InfoIcon opens from generic
 * Tooltip usage and from StrataInfoIcon opens for the same surface key.
 *
 * Behavior:
 *   - 14px circular glyph (default), Pearl border, Aged Oak text, Clay on hover
 *   - Hover delay 200ms, grace 100ms (per spec §12 — owned by canonical Tooltip)
 *   - `prefers-reduced-motion` respected via motion-safe:* (owned by C1)
 *   - Keyboard: focus shows tooltip, Escape closes (owned by Radix via C1)
 *
 * Graceful degradation (spec §13.4) — also owned by canonical Tooltip:
 *   1. CMS hit  → tooltip body uses Sanity copy
 *   2. CMS miss + fallback prop → tooltip body uses fallback
 *   3. CMS miss + no fallback   → glyph renders without a tooltip wrapper
 */
export function InfoIcon({
  surfaceKey,
  size = 14,
  className,
  fallback,
  ariaLabel = 'More information',
}: InfoIconProps) {
  // Dev-mode surface-key sanity check. Never throws.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] InfoIcon surfaceKey="${surfaceKey}" does not match SURFACE_KEY_REGEX. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  // The trigger glyph itself. Uses inline width/height so the icon is stable
  // across loading states and does not depend on Tailwind arbitrary classes
  // for the px-precise sizing called out by spec (14px circle).
  const glyph = useMemo(
    () => (
      <span
        aria-hidden
        className="inline-flex items-center justify-center"
        style={{
          fontFamily: 'var(--font-inter, Inter, sans-serif)',
          fontSize: `${Math.max(8, Math.round(size * 0.7))}px`,
          lineHeight: 1,
        }}
      >
        ?
      </span>
    ),
    [size],
  )

  const triggerClasses = cn(
    // Layout
    'inline-flex items-center justify-center rounded-full border align-middle',
    // Tokens (Pearl border + Aged Oak text approximations from design-system)
    'border-input text-muted-foreground',
    // Interactive states — Clay (terracotta accent) on hover
    'hover:text-help-clay hover:border-help-clay',
    'transition-colors duration-150',
    // Focus visibility (keyboard a11y)
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    // Caller-provided
    className,
  )

  return (
    <Tooltip surfaceKey={surfaceKey} fallback={fallback} trigger="info_icon">
      <button
        type="button"
        aria-label={ariaLabel}
        className={triggerClasses}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          padding: 0,
          background: 'transparent',
          cursor: 'help',
        }}
      >
        {glyph}
      </button>
    </Tooltip>
  )
}
