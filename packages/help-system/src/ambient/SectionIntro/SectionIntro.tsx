'use client'

/**
 * <SectionIntro /> — Layer 1 · Ambient
 *
 * The optional 1–2 sentence description rendered below a section header. The
 * copy itself is owned by the CMS — components only render what Sanity returns.
 *
 * Behavior:
 *  - Fetches a `fieldHelper` document by surfaceKey via useHelpContent.
 *    (`fieldHelper` is the simplest body-only content shape in the discriminated
 *    union and matches §4.4 / §8 length conventions; if a dedicated
 *    `sectionIntro` content type is later added to contentTypes.ts, this
 *    component should switch to it without changing its public contract.)
 *  - If CMS returns a body, renders a <p> using design-system typography tokens.
 *  - If CMS returns null AND a fallback is provided, renders the fallback.
 *  - If CMS returns null AND no fallback, renders nothing.
 *  - Fires `help.section_intro.shown` to PostHog exactly once per mount when
 *    CMS-backed content is shown. Fallback rendering does NOT emit the event —
 *    only confirmed CMS hits are tracked (so the dashboard reflects coverage).
 *  - Validates surfaceKey against SURFACE_KEY_REGEX; logs a dev-only warning if
 *    malformed (same convention as SurfaceKeyProvider).
 *
 * Spec reference: docs/prds/Guide/patina-help-guidance-engineering-handoff.md
 * — §3 Layer 1 (line 80), §8 Writing Standards (1-2 sentence intros enforced
 * editorially in Sanity, not in the component).
 */

import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'

export interface SectionIntroProps {
  /** Surface key that maps to a `helpContent` document in Sanity. */
  surfaceKey: string
  /**
   * Optional fallback text rendered when the CMS returns null. If the CMS
   * returns null AND no fallback is provided, the component renders nothing.
   */
  fallback?: string
  /**
   * Optional className for layout overrides. Typography (size, color,
   * leading) is owned by this component; the className is intended for
   * spacing utilities like `mb-4` or `max-w-prose`.
   */
  className?: string
}

// Local cn — keeps the component self-contained without a dist-time dependency
// on the design-system package's built output (which would otherwise require
// `pnpm build` in the design-system before tests can run here).
function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(...inputs))
}

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

/**
 * Best-effort, lazy reference to window.posthog so a missing PostHog SDK is
 * silently tolerated (Storybook, tests, server-side renders).
 */
function getPosthog(): PosthogLike | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { posthog?: PosthogLike }).posthog
}

export function SectionIntro({ surfaceKey, fallback, className }: SectionIntroProps) {
  // Dev-only validation — surfaces typos before they hit the CMS.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] SectionIntro surfaceKey="${surfaceKey}" does not match the surface-key regex. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  // The `fieldHelper` variant is body-only and is the closest match in the
  // current contentTypes.ts discriminated union. See file header.
  const { data } = useHelpContent(surfaceKey, 'fieldHelper')
  const body = data?.body ?? null
  const isCmsHit = body !== null

  // Fire help.section_intro.shown exactly once per mount when CMS content
  // becomes available. Re-renders with the same content must not re-emit.
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    if (!isCmsHit) return
    firedRef.current = true
    const posthog = getPosthog()
    posthog?.capture('help.section_intro.shown', { surface_key: surfaceKey })
  }, [isCmsHit, surfaceKey])

  // Resolve final text: CMS body wins, else fallback, else nothing.
  const text = body ?? fallback ?? null
  if (text === null) return null

  return (
    <p className={cn('text-sm text-muted-foreground leading-relaxed', className)}>
      {text}
    </p>
  )
}
