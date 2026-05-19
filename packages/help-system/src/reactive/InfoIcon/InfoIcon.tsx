// TODO: After C1 Tooltip integration, swap inline Radix.Tooltip for the canonical <Tooltip surfaceKey={...}> wrapper
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { HelpContent } from '../../contentTypes'

// Local cn() — mirrors @patina/design-system/utils/cn so this package does not
// depend on @patina/design-system's built dist for vitest/tsup. Both clsx and
// tailwind-merge are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// ─── Telemetry plumbing (window-shimmed, never throws) ────────────────────────

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

function getPosthog(): PosthogLike | undefined {
  if (typeof window === 'undefined') return undefined
  const candidate = (window as unknown as { posthog?: unknown }).posthog
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as PosthogLike).capture === 'function'
  ) {
    return candidate as PosthogLike
  }
  return undefined
}

function safeCapture(event: string, properties: Record<string, unknown>): void {
  try {
    getPosthog()?.capture(event, properties)
  } catch {
    // Telemetry must never throw into the host app.
  }
}

// ─── Reduced motion ───────────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Modern + legacy listener API
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  return reduced
}

// ─── Type guard: tooltip-shaped (has a string body) content ────────────────────

type RenderableContent = Extract<HelpContent, { body: string }>
function hasRenderableBody(content: unknown): content is RenderableContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'body' in content &&
    typeof (content as { body: unknown }).body === 'string' &&
    (content as { body: string }).body.length > 0
  )
}

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
 * Content is fetched from Sanity via `useHelpContent(surfaceKey, 'tooltip')`.
 * Analytics fire via `window.posthog?.capture(...)` when present.
 *
 * Behavior:
 *   - 14px circular glyph (default), Pearl border, Aged Oak text, Clay on hover
 *   - Hover delay 200ms, grace 100ms (Radix defaults align with spec)
 *   - Tooltip body max-width 240px, 14px text
 *   - `prefers-reduced-motion` → no fade animation
 *   - Keyboard: focus shows tooltip, Escape closes it
 *
 * Graceful degradation chain (spec §13.4):
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

  const { data } = useHelpContent(surfaceKey, 'tooltip')

  // Effective body: CMS body > fallback. If neither, render the glyph alone.
  const cmsBody = hasRenderableBody(data) ? data.body : null
  const body = cmsBody ?? fallback ?? null

  const reduced = usePrefersReducedMotion()

  // The trigger glyph itself — same markup whether or not a tooltip wraps it.
  // Uses inline width/height so the icon is stable across loading states and
  // does not depend on Tailwind arbitrary classes for the px-precise sizing
  // called out by spec (14px circle).
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

  // If there is no body to show, render the icon as a static glyph with the
  // aria-label set. This preserves the visual affordance footprint while
  // explicitly avoiding an empty tooltip popover (spec §13.4 graceful absence).
  if (!body) {
    return (
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
    )
  }

  return (
    <InfoIconWithTooltip
      ariaLabel={ariaLabel}
      body={body}
      glyph={glyph}
      reduced={reduced}
      size={size}
      surfaceKey={surfaceKey}
      triggerClasses={triggerClasses}
    />
  )
}

// ─── Internal — wraps the glyph in a Radix tooltip when content is available ──

interface InfoIconWithTooltipProps {
  ariaLabel: string
  body: string
  glyph: React.ReactNode
  reduced: boolean
  size: number
  surfaceKey: string
  triggerClasses: string
}

function InfoIconWithTooltip({
  ariaLabel,
  body,
  glyph,
  reduced,
  size,
  surfaceKey,
  triggerClasses,
}: InfoIconWithTooltipProps) {
  // Track open lifecycle for analytics. shownAt → captured on open; on close
  // we compute duration_ms = now - shownAt and fire `help.tooltip.dismissed`.
  const shownAtRef = useRef<number | null>(null)

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        shownAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
        safeCapture('help.tooltip.shown', {
          surface_key: surfaceKey,
          trigger: 'info_icon',
        })
        return
      }
      // Close
      const start = shownAtRef.current
      shownAtRef.current = null
      if (start === null) return // close without prior open — nothing to report
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const duration_ms = Math.max(0, Math.round(now - start))
      safeCapture('help.tooltip.dismissed', {
        surface_key: surfaceKey,
        trigger: 'info_icon',
        duration_ms,
      })
    },
    [surfaceKey],
  )

  // Animation classes — omit when reduced motion is requested.
  const contentClasses = cn(
    'z-50 rounded-md px-3 py-1.5 shadow-lg',
    'bg-foreground text-background',
    !reduced &&
      'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
  )

  // delayDuration 200ms aligns with spec §4.1 hover delay; Radix grace defaults
  // to 100ms hover-out before the popover hides, which matches the spec.
  return (
    <RadixTooltip.Root delayDuration={200} onOpenChange={handleOpenChange}>
      <RadixTooltip.Trigger asChild>
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
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className={contentClasses}
          sideOffset={6}
          style={{ maxWidth: 240, fontSize: 14, lineHeight: 1.4 }}
        >
          {body}
          <RadixTooltip.Arrow className="fill-foreground" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
