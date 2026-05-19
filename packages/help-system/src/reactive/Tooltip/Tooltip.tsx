'use client'

import { useCallback, useEffect, useRef } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { HelpContent, TooltipContent } from '../../contentTypes'

// Local cn() — mirrors @patina/design-system/utils/cn so this package does not
// depend on @patina/design-system's built dist for vitest/tsup. Both clsx and
// tailwind-merge are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// Spec §4.1: tooltip body is capped at 160 chars in CMS authoring. Surface a
// dev warning so authors notice the overflow — the component still renders
// long copy so the cap is advisory, not enforced.
const TOOLTIP_BODY_MAX_CHARS = 160

// Spec §12: hover-to-show defaults to 200ms; close-grace 100ms.
const DEFAULT_HOVER_DELAY_MS = 200
const TOOLTIP_HIDE_GRACE_MS = 100

/**
 * <Tooltip /> — Reactive-layer hover/focus help (spec §4.1).
 *
 * Wraps a trigger child (typically <InfoIcon /> or <StrataInfoIcon />, but any
 * focusable element works) with a Radix Tooltip primitive that pulls its body
 * copy from Sanity by `surfaceKey`. Portal-renders to escape `overflow:hidden`
 * parents; respects `prefers-reduced-motion` via the design-system token layer
 * (no inline animations defined here).
 *
 * Graceful degradation (spec §13.4):
 *   1. CMS hit  → render trigger inside Radix tooltip + Sanity body
 *   2. CMS miss + fallback prop → render trigger inside tooltip + fallback
 *   3. CMS miss + no fallback → render trigger directly (NO tooltip wrapper)
 *
 * Analytics:
 *   - `help.tooltip.shown`   on open (with surface_key, side, trigger_type)
 *   - `help.tooltip.dismissed` on close (with surface_key, duration_ms)
 *
 * Property keys use snake_case per Sprint 2 R11 decision.
 */
export interface TooltipProps {
  /** Surface key from the help-system registry (must match SURFACE_KEY_REGEX). */
  surfaceKey: string
  /** The trigger element — must be focusable. Rendered via Radix Trigger asChild. */
  children: React.ReactNode
  /** Radix side passthrough; defaults to 'top'. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Radix align passthrough; defaults to 'center'. */
  align?: 'start' | 'center' | 'end'
  /** Hover-to-show delay in ms; defaults to 200 per spec §12. */
  delayMs?: number
  /** Inline tooltip body if Sanity returns no content. */
  fallback?: string
  /** Additional Tailwind classes merged onto the rendered tooltip content. */
  className?: string
}

/** Type guard: discriminate tooltip-shaped CMS docs (has body: string). */
function isTooltipShaped(content: unknown): content is TooltipContent | Extract<HelpContent, { body: string }> {
  return (
    typeof content === 'object' &&
    content !== null &&
    'body' in content &&
    typeof (content as { body: unknown }).body === 'string' &&
    (content as { body: string }).body.length > 0
  )
}

/** Optional eyebrow — only present on TooltipContent variants. */
function getEyebrow(content: unknown): string | undefined {
  if (
    typeof content === 'object' &&
    content !== null &&
    'eyebrow' in content &&
    typeof (content as { eyebrow: unknown }).eyebrow === 'string'
  ) {
    const eyebrow = (content as { eyebrow: string }).eyebrow
    return eyebrow.length > 0 ? eyebrow : undefined
  }
  return undefined
}

/** Resolve `window.posthog?.capture` without crashing in non-browser envs. */
function captureEvent(event: string, props: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const ph = (window as unknown as {
    posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void }
  }).posthog
  ph?.capture?.(event, props)
}

export function Tooltip({
  surfaceKey,
  children,
  side = 'top',
  align = 'center',
  delayMs = DEFAULT_HOVER_DELAY_MS,
  fallback,
  className,
}: TooltipProps) {
  // Dev-mode surface-key sanity check. Never throws.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] Tooltip surfaceKey="${surfaceKey}" does not match SURFACE_KEY_REGEX. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  const { data, isLoading } = useHelpContent(surfaceKey, 'tooltip')

  const body = isTooltipShaped(data) ? data.body : null
  const eyebrow = body ? getEyebrow(data) : undefined

  // Resolve effective body — CMS first, then fallback. Null means "no wrapper".
  const effectiveBody = body ?? fallback ?? null

  // Spec §8: body should stay under 160 chars. Author-facing warning, not enforced.
  const warnedFor = useRef<string | null>(null)
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      body &&
      body.length > TOOLTIP_BODY_MAX_CHARS &&
      warnedFor.current !== surfaceKey
    ) {
      warnedFor.current = surfaceKey
      console.warn(
        `[help-system] Tooltip body for surfaceKey="${surfaceKey}" is ${body.length} chars ` +
          `(>${TOOLTIP_BODY_MAX_CHARS}). Spec §8 caps tooltip body at ${TOOLTIP_BODY_MAX_CHARS} chars; ` +
          `trim the Sanity doc.`,
      )
    }
  }, [body, surfaceKey])

  // Track open time so dismissed events can include duration_ms.
  const openedAtRef = useRef<number | null>(null)

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
        captureEvent('help.tooltip.shown', {
          surface_key: surfaceKey,
          side,
        })
      } else if (openedAtRef.current !== null) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const duration_ms = Math.max(0, Math.round(now - openedAtRef.current))
        openedAtRef.current = null
        captureEvent('help.tooltip.dismissed', {
          surface_key: surfaceKey,
          duration_ms,
        })
      }
    },
    [surfaceKey, side],
  )

  // 1. Loading: render trigger transparently — no tooltip yet, no flash of fallback.
  if (isLoading) {
    return <>{children}</>
  }

  // 2. No body and no fallback → silent absence: render trigger raw.
  if (!effectiveBody) {
    return <>{children}</>
  }

  // 3. Render Radix tooltip with the resolved body.
  return (
    <TooltipPrimitive.Provider delayDuration={delayMs} skipDelayDuration={TOOLTIP_HIDE_GRACE_MS}>
      <TooltipPrimitive.Root delayDuration={delayMs} onOpenChange={handleOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={4}
            className={cn(
              // Layout uses design-system semantic tokens — `bg-primary` /
              // `text-primary-foreground` resolve to Charcoal-on-Off-White via
              // the host portal's Tailwind config (spec §4.1 / §5.3). Maxes at
              // 240px per spec; rounded-md / shadow-md mirror the existing
              // design-system tooltip wrapper so visuals stay consistent.
              'z-50 max-w-[240px] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-md',
              // Reduced motion: only animate when prefers-reduced-motion is
              // NOT set. motion-safe:* is the Tailwind variant for that.
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
              'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95',
              className,
            )}
          >
            {eyebrow ? (
              <div className="mb-1 font-mono text-[0.45rem] uppercase tracking-[0.06em] opacity-80">
                {eyebrow}
              </div>
            ) : null}
            <div className="leading-relaxed">{effectiveBody}</div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
