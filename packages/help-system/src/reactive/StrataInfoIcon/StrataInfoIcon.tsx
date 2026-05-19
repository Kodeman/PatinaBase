'use client'

/**
 * <StrataInfoIcon /> — Layer 2 · Reactive
 *
 * Patina-specific concept indicator built on the StrataMark glyph (three
 * descending horizontal lines, Clay/terracotta tone). Used ONLY for
 * Patina-specific concepts — Aesthete Engine, FF&E stages, Strata Mark,
 * Founding Circle, the Patina vocabulary. General "what does this number
 * mean?" questions use `<InfoIcon />` (C2) instead.
 *
 * The visual cue trains users that the Strata icon signals "this is a
 * platform concept worth learning." Mixing it with the generic `<InfoIcon />`
 * dilutes the meaning of both (spec §4.2, line 207).
 *
 * Behavior:
 *  - Renders the StrataMark glyph at default 14px in Clay/terracotta tone.
 *  - Wraps the glyph in a `<Tooltip.Root>` → `<Tooltip.Trigger>` button
 *    when CMS content or a fallback string is available.
 *  - If CMS returns null AND no fallback is provided, renders the icon
 *    without a tooltip wrapper (silent absence per spec §13.4).
 *  - Fires `help.tooltip.shown` to PostHog on open and
 *    `help.tooltip.dismissed` on close — both with snake_case property keys
 *    (R11) and `trigger: 'strata_info_icon'` to differentiate from the
 *    generic InfoIcon trigger.
 *  - Honors `prefers-reduced-motion` via a `data-reduced-motion` attribute
 *    on the tooltip content so portals can skip the fade animation.
 *  - Tooltip closes on Escape, click-outside, and trigger blur.
 *
 * NOTE on Radix vs C1 Tooltip wrapper:
 *  C1 (the canonical `<Tooltip>` wrapper) is being built in parallel. Until
 *  that ships, this component depends directly on `@radix-ui/react-tooltip`.
 *
 * TODO: After C1 Tooltip integration, swap inline Radix.Tooltip for canonical <Tooltip surfaceKey={...}> wrapper
 *
 * NOTE on inlined StrataMark SVG:
 *  The canonical glyph lives at
 *  `packages/patina-design-system/src/components/StrataMark/StrataMark.tsx`,
 *  but `@patina/design-system`'s built dist does not currently export it
 *  (verified 2026-05-19 against
 *  `packages/patina-design-system/dist/index.d.ts`). To avoid coupling our
 *  test/build cycle to a downstream dts build fix, we clone the SVG shape
 *  inline here. The shape MUST stay in sync with the canonical glyph.
 *
 * TODO: Swap inlined SVG back to `import { StrataMark } from '@patina/design-system'`
 *  once the design-system dts ships with StrataMark in its public exports.
 *
 * Spec reference: docs/prds/Guide/patina-help-guidance-engineering-handoff.md §4.2
 */

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { TooltipContent } from '../../contentTypes'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StrataInfoIconProps {
  /** Surface key that maps to a `helpContent` document in Sanity (contentType=tooltip). */
  surfaceKey: string
  /** Icon size in pixels. @default 14 */
  size?: number
  /** Additional Tailwind classes merged onto the trigger button. */
  className?: string
  /** Inline tooltip body to render when Sanity returns null. */
  fallback?: string
  /** Accessible name for the trigger button. @default "Patina concept" */
  ariaLabel?: string
}

// ─── Internals ────────────────────────────────────────────────────────────────

// Local Tailwind merge — keeps this package self-contained without a
// build-time dependency on the design-system dist output.
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

function getPosthog(): PosthogLike | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { posthog?: PosthogLike }).posthog
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Type guard for tooltip-shaped content. The component will tolerate any
 * Sanity doc that exposes a string `body` — defensively typed so a content
 * steward swapping doc types doesn't crash the runtime.
 */
function hasBody(content: unknown): content is Pick<TooltipContent, 'body' | 'eyebrow'> {
  return (
    typeof content === 'object' &&
    content !== null &&
    'body' in content &&
    typeof (content as { body: unknown }).body === 'string' &&
    (content as { body: string }).body.length > 0
  )
}

/**
 * Inlined StrataMark — clone of
 * packages/patina-design-system/src/components/StrataMark/StrataMark.tsx.
 *
 * Three descending horizontal lines: top is widest (full width), middle is
 * three-quarters, bottom is half. Cascade reads left-to-right top-to-bottom.
 */
function StrataMarkInline({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      // `currentColor` lets the parent button drive tone (Clay/terracotta on
      // hover, Aged Oak at rest). The trigger button owns the color via
      // Tailwind classes.
    >
      <line
        x1="1"
        y1="3.5"
        x2="13"
        y2="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="1"
        y1="7"
        x2="10"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="1"
        y1="10.5"
        x2="7"
        y2="10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StrataInfoIcon({
  surfaceKey,
  size = 14,
  className,
  fallback,
  ariaLabel = 'Patina concept',
}: StrataInfoIconProps) {
  const { data } = useHelpContent(surfaceKey, 'tooltip')

  // Pull the renderable body off the CMS doc; fall back to the inline string
  // if Sanity returned nothing. If neither exists, we render the icon alone.
  const cmsBody = hasBody(data) ? data.body : null
  const eyebrow = hasBody(data) ? data.eyebrow : undefined
  const body = cmsBody ?? fallback ?? null

  // Reduced-motion is read at mount; portals that toggle the OS preference
  // mid-session can re-render. matchMedia listening is intentionally skipped
  // to keep this component dependency-free (parent layouts already wire
  // global prefers-reduced-motion via CSS).
  const [reducedMotion] = useState<boolean>(() => prefersReducedMotion())

  // Track tooltip open state to wire analytics + measure dismiss duration.
  const [open, setOpen] = useState(false)
  const openedAtRef = useRef<number | null>(null)

  // Fire analytics on every show / dismiss. snake_case keys per R11; the
  // `trigger` discriminator lets PostHog dashboards separate StrataInfoIcon
  // opens from InfoIcon (C2) opens for the same surface key.
  useEffect(() => {
    const posthog = getPosthog()
    if (!posthog) return
    if (open) {
      openedAtRef.current = Date.now()
      posthog.capture('help.tooltip.shown', {
        surface_key: surfaceKey,
        trigger: 'strata_info_icon',
      })
    } else if (openedAtRef.current !== null) {
      const durationMs = Date.now() - openedAtRef.current
      openedAtRef.current = null
      posthog.capture('help.tooltip.dismissed', {
        surface_key: surfaceKey,
        trigger: 'strata_info_icon',
        duration_ms: durationMs,
      })
    }
  }, [open, surfaceKey])

  // No content + no fallback → render the icon without tooltip wrapper.
  // (spec §13.4 — silent absence; the icon stays as a visual hint, but there
  // is nothing to show so we skip the interactive affordance.)
  if (body === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center text-help-clay text-[color:var(--cl,#c4a57b)]',
          className,
        )}
        // The icon is decorative when there is no content to surface.
        aria-hidden="true"
      >
        <StrataMarkInline size={size} />
      </span>
    )
  }

  return (
    <Tooltip.Root
      // 200ms hover delay per spec §4.1
      delayDuration={200}
      // 100ms grace period — Radix calls it `skipDelayDuration` at the
      // Provider level; at the Root level we rely on the Provider's default
      // (which portals should set). The 100ms close grace is enforced by
      // Radix's internal pointer-leave timer.
      open={open}
      onOpenChange={setOpen}
    >
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          // Visual: Clay/terracotta tone at rest, heavier weight on hover/focus.
          // `text-help-clay` is the canonical token A2 will ship; we provide a
          // CSS-var fallback (`--cl`) so existing portals render the right hue
          // even before the help palette ships.
          className={cn(
            'inline-flex items-center justify-center align-middle',
            'rounded-sm',
            'text-help-clay text-[color:var(--cl,#c4a57b)]',
            // Hover: heavier weight / fill via filter brightness — keeps the
            // stroke-based SVG visually emphasized without restructuring it.
            'transition-[filter,transform] duration-150',
            'hover:[filter:brightness(0.85)_saturate(1.2)]',
            'focus:[filter:brightness(0.85)_saturate(1.2)]',
            // A11y: visible focus ring on keyboard focus only.
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-help-clay focus-visible:ring-offset-1',
            // No background — the icon sits inline next to a heading.
            'bg-transparent border-0 p-0 m-0 cursor-help',
            className,
          )}
        >
          <StrataMarkInline size={size} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          // 240px max width per spec §4.1
          style={{ maxWidth: 240 }}
          // role="tooltip" is set by Radix; explicit aria-label not needed —
          // body text is the accessible name.
          sideOffset={6}
          collisionPadding={8}
          data-reduced-motion={reducedMotion ? 'true' : 'false'}
          className={cn(
            // Charcoal-on-Off-White per spec §4.1 visual; CSS-var fallbacks
            // mean the tooltip looks right even before A2 palette tokens land.
            'rounded-[5px] px-3 py-2',
            'bg-[color:var(--ch,#2c2926)] text-[color:var(--ow,#fbf9f4)]',
            'text-[0.7rem] leading-[1.5]',
            'shadow-[0_8px_24px_rgba(0,0,0,0.15)]',
            'z-50',
            // Skip animation when prefers-reduced-motion. Portals can use the
            // data-reduced-motion attr to override their own keyframes.
            !reducedMotion && 'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          )}
        >
          {eyebrow ? (
            <div
              className={cn(
                'mb-1',
                'text-[0.45rem] uppercase tracking-[0.06em]',
                'text-[color:var(--cl,#c4a57b)]',
                'font-[family-name:var(--font-meta,monospace)]',
              )}
            >
              {eyebrow}
            </div>
          ) : null}
          <div className="font-[family-name:var(--font-inter,Inter,sans-serif)]">
            {body}
          </div>
          <Tooltip.Arrow className="fill-[color:var(--ch,#2c2926)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

StrataInfoIcon.displayName = 'StrataInfoIcon'
