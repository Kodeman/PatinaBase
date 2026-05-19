'use client'

import { useEffect, useRef } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { HelpContent } from '../../contentTypes'

// Local cn() — mirrors @patina/design-system/utils/cn so this package does not
// depend on @patina/design-system's built dist for vitest/tsup. Both clsx and
// tailwind-merge are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/**
 * <FieldHelper /> — Ambient-layer microcopy that anticipates user questions
 * on form fields (spec §4.4).
 *
 * Content is fetched from Sanity by `surfaceKey`; the component is portal-agnostic.
 * Analytics fire via `window.posthog?.capture(...)` when present, so this package
 * stays decoupled from per-portal analytics modules.
 *
 * Graceful degradation chain (spec §13.4):
 *   1. CMS hit  →  render Sanity-backed copy
 *   2. CMS miss + fallback prop  →  render fallback
 *   3. CMS miss + no fallback  →  render nothing (silent absence)
 *
 * The 18-words copy limit (spec §8) is a CMS-side authoring rule and is not
 * enforced here — long copy renders as-is so authoring tooling remains the
 * single source of truth for length.
 */
export interface FieldHelperProps {
  /** Surface key from the help-system registry (must match SURFACE_KEY_REGEX). */
  surfaceKey: string
  /** Inline text to render if Sanity returns no helper content. */
  fallback?: string
  /** Additional Tailwind classes merged onto the rendered <p>. */
  className?: string
}

/** Subset of HelpContent variants that expose a top-level `body` string. */
type HelperShapedContent = Extract<HelpContent, { body: string }>

/** Type guard: does this Sanity doc have a renderable `body` string? */
function hasRenderableBody(content: unknown): content is HelperShapedContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'body' in content &&
    typeof (content as { body: unknown }).body === 'string' &&
    (content as { body: string }).body.length > 0
  )
}

export function FieldHelper({ surfaceKey, fallback, className }: FieldHelperProps) {
  // Dev-mode surface-key sanity check. Never throws — bad keys still get a
  // shot at the network (which will quietly miss) and the dev sees a warning.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] FieldHelper surfaceKey="${surfaceKey}" does not match SURFACE_KEY_REGEX. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  const { data, isLoading } = useHelpContent(surfaceKey, 'fieldHelper')

  // Discriminate: only treat the result as "helper content" if it has a
  // string body. This lets the component accept tooltipContent-like shapes
  // gracefully without breaking when a non-helper variant comes back.
  const body = hasRenderableBody(data) ? data.body : null

  // Fire analytics once per surfaceKey when a real body first lands.
  // Guarded so dev/prod re-renders don't double-count.
  const firedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!body) return
    if (firedFor.current === surfaceKey) return
    firedFor.current = surfaceKey

    const ph = (
      typeof window !== 'undefined'
        ? (window as unknown as { posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void } }).posthog
        : undefined
    )
    ph?.capture?.('help.field_helper.shown', { surface_key: surfaceKey })
  }, [body, surfaceKey])

  // 1. Loading: render nothing — avoid fallback flash before CMS resolves.
  if (isLoading) return null

  // 2. CMS hit: render the Sanity body.
  if (body) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>{body}</p>
    )
  }

  // 3. CMS miss + fallback: render the inline fallback.
  if (fallback) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>{fallback}</p>
    )
  }

  // 4. CMS miss + no fallback: silent absence.
  return null
}
