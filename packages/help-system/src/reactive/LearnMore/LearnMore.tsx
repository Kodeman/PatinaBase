'use client'

/**
 * <LearnMore /> — Layer 2 · Reactive
 *
 * Inline "↓ Learn more" disclosure for concepts that need a paragraph or two,
 * without navigating away from the surface (spec §4.5).
 *
 * Built on Radix UI's Collapsible primitives so the keyboard, focus, and ARIA
 * behaviour matches the rest of the design-system disclosures. The component
 * is portal-agnostic: analytics fire via `window.posthog?.capture(...)` and
 * Sanity content is fetched through `useHelpContent` like every other piece
 * of help copy.
 *
 * Graceful degradation chain (spec §13.4):
 *   1. CMS hit                   → render Sanity body inside the panel
 *   2. CMS miss + fallback prop  → render the fallback inside the panel
 *   3. CMS miss + no fallback    → render nothing at all (silent absence)
 *
 * Content source — the component prefers the dedicated `learnMore`
 * content type (which exposes `body` as a string) and gracefully accepts any
 * other body-bearing shape (`fieldHelper`, `tooltip`) the CMS returns. This
 * matches the contract in `contentTypes.ts` where `learnMore` is the canonical
 * type but body-shaped variants are interchangeable for this surface.
 *
 * Reduced motion — when `prefers-reduced-motion: reduce` is set, the height
 * animation is skipped and the panel snaps open/closed. Implemented by gating
 * the CSS animation duration to 0ms.
 *
 * Analytics events (R11 — snake_case property keys):
 *   • help.learnmore.expanded   { surface_key }
 *   • help.learnmore.collapsed  { surface_key, duration_ms }
 *
 * `duration_ms` is the time from the most recent expand (or mount, if
 * `defaultOpen`) until the collapse. Storage is in-component state only — no
 * persistence across mounts.
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight } from 'lucide-react'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { HelpContent } from '../../contentTypes'

// Local cn — same convention as sibling ambient components. Keeps the package
// self-contained without depending on @patina/design-system's built dist for
// test runs.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export interface LearnMoreProps {
  /** Surface key from the help-system registry. */
  surfaceKey: string
  /** Trigger label. Defaults to "Learn more". */
  label?: string
  /** Additional Tailwind classes merged onto the outer container. */
  className?: string
  /** Body to render when Sanity returns nothing. */
  fallback?: string
  /** Start expanded. Defaults to false. */
  defaultOpen?: boolean
}

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

function getPosthog(): PosthogLike | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { posthog?: PosthogLike }).posthog
}

/** Subset of HelpContent variants exposing a top-level `body: string`. */
type BodyShapedContent = Extract<HelpContent, { body: string }>

function hasRenderableBody(content: unknown): content is BodyShapedContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'body' in content &&
    typeof (content as { body: unknown }).body === 'string' &&
    (content as { body: string }).body.length > 0
  )
}

/**
 * Reads the user's reduced-motion preference. Safe in SSR and tests
 * (matchMedia is stubbed by vitest.setup.ts).
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mql.matches)
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Safari < 14 needs addListener; modern browsers use addEventListener.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', listener)
      return () => mql.removeEventListener('change', listener)
    }
    mql.addListener(listener)
    return () => mql.removeListener(listener)
  }, [])
  return reduced
}

export function LearnMore({
  surfaceKey,
  label = 'Learn more',
  className,
  fallback,
  defaultOpen = false,
}: LearnMoreProps) {
  // Dev-only surfaceKey validation — typo warning, never throws.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] LearnMore surfaceKey="${surfaceKey}" does not match the surface-key regex. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  // Fetch the dedicated `learnMore` content type per contentTypes.ts.
  const { data, isLoading } = useHelpContent(surfaceKey, 'learnMore')
  const body = hasRenderableBody(data) ? data.body : null
  const effectiveBody = body ?? fallback ?? null

  // Reduced-motion handling.
  const reducedMotion = usePrefersReducedMotion()

  // Controlled open state so we can hook analytics into the transition.
  const [open, setOpen] = useState<boolean>(defaultOpen)

  // Track when the panel was opened so collapse can report duration_ms.
  // Initialised to `now` when `defaultOpen` is true so collapse from the
  // default-open state reports a sensible duration.
  const openedAtRef = useRef<number | null>(defaultOpen ? Date.now() : null)

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      const posthog = getPosthog()

      if (next) {
        openedAtRef.current = Date.now()
        posthog?.capture('help.learnmore.expanded', { surface_key: surfaceKey })
      } else {
        const openedAt = openedAtRef.current
        const durationMs = openedAt === null ? 0 : Date.now() - openedAt
        openedAtRef.current = null
        posthog?.capture('help.learnmore.collapsed', {
          surface_key: surfaceKey,
          duration_ms: durationMs,
        })
      }
    },
    [surfaceKey],
  )

  // Inline-style CSS custom property so the animation respects reduced motion
  // without needing a Tailwind plugin. Memoised so the style object identity
  // is stable across renders.
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      ['--patina-learnmore-duration' as string]: reducedMotion ? '0ms' : '200ms',
    }),
    [reducedMotion],
  )

  // 1. Loading: render nothing — avoid a fallback flash before CMS resolves.
  if (isLoading) return null

  // 2. CMS miss + no fallback: silent absence per spec §13.4.
  if (effectiveBody === null) return null

  // 3. CMS hit (or fallback): render the disclosure.
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={handleOpenChange}
      className={cn('flex flex-col items-start gap-2', className)}
      style={containerStyle}
      data-reduced-motion={reducedMotion ? 'true' : undefined}
    >
      <Collapsible.Trigger
        className={cn(
          'group inline-flex items-center gap-1 text-sm font-medium text-foreground/80',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'rounded-sm transition-colors',
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            // Rotate 90deg on open. Animation duration tied to reduced-motion.
            'transition-transform',
            'group-data-[state=open]:rotate-90',
          )}
          style={{
            transitionDuration: reducedMotion ? '0ms' : '200ms',
          }}
        />
        <span>{label}</span>
      </Collapsible.Trigger>

      <Collapsible.Content
        // Animate height on open/close using the CSS variable Radix sets while
        // the content is mounted. The keyframes are declared inline below so
        // the package ships self-contained — no Tailwind config dependency.
        className={cn(
          'overflow-hidden text-sm leading-relaxed text-muted-foreground',
          'data-[state=open]:animate-patina-learnmore-down',
          'data-[state=closed]:animate-patina-learnmore-up',
        )}
        style={{
          animationDuration: reducedMotion ? '0ms' : '200ms',
        }}
      >
        <p className="pt-1">{effectiveBody}</p>
      </Collapsible.Content>

      {/*
        Tiny inline keyframes so the component is self-contained. Scoped via
        the patina-learnmore prefix so it cannot collide with consumer styles.
        Note: these are no-ops when reducedMotion is true because the
        animationDuration above is 0ms.
      */}
      <style>{`
        @keyframes patina-learnmore-down {
          from { height: 0; opacity: 0; }
          to   { height: var(--radix-collapsible-content-height); opacity: 1; }
        }
        @keyframes patina-learnmore-up {
          from { height: var(--radix-collapsible-content-height); opacity: 1; }
          to   { height: 0; opacity: 0; }
        }
        .animate-patina-learnmore-down { animation-name: patina-learnmore-down; }
        .animate-patina-learnmore-up   { animation-name: patina-learnmore-up; }
      `}</style>
    </Collapsible.Root>
  )
}
