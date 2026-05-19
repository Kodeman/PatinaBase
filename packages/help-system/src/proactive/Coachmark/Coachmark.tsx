'use client'

/**
 * Coachmark — Proactive-layer foundational component (spec §4.7).
 *
 * A non-blocking, anchored spotlight card with title + body, an optional CTA
 * (Next button), and a dismiss control. Composes:
 *   - D2 <TourController />  (drives multi-step tours)
 *   - D4 <FeatureAnnouncementCoachmark />  (single-shot release announcements)
 *
 * Built on Radix Popover for positioning + dismissable layer semantics, but
 * intentionally departs from Popover's defaults in two important ways per
 * spec §11.2:
 *
 *   1. role="dialog"        — coachmark is informational
 *   2. aria-modal="false"   — never blocks the underlying interface (§4.7 #6)
 *
 * Focus is NOT trapped (Radix `trapFocus={false}`). On open, focus moves to
 * the dialog content for screen-reader announcement; on close it returns to
 * the anchor for keyboard continuity. Dismissable-layer wiring catches
 * Escape + outside-clicks; both fire `help.coachmark.dismissed`.
 *
 * Content resolution:
 *   - Pulls a CoachmarkContent from Sanity via useHelpContent(key, 'coachmark').
 *   - If CMS returns nothing AND no fallback*, renders the anchor raw (silent
 *     absence — fail open per spec §13.4).
 *   - If a `fallbackHeading` / `fallbackBody` are provided, those render when
 *     CMS is empty.
 *
 * Analytics (all snake_case per R11):
 *   - help.coachmark.shown      { surface_key, step_number?, total_steps? }
 *   - help.coachmark.dismissed  { surface_key, step_number?, total_steps?,
 *                                 duration_ms, action: 'dismiss'|'next'|'skip' }
 *
 * Anchor patterns:
 *   - Wrap a child:        `<Coachmark><Button/></Coachmark>` (preferred)
 *   - External anchor ref: `<Coachmark anchorRef={ref} />`
 */

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { X } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { CoachmarkContent } from '../../contentTypes'

// Local cn() — mirrors @patina/design-system/utils/cn so this package does not
// depend on @patina/design-system's built dist for vitest/tsup. Both clsx and
// tailwind-merge are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// Spec §8: Coachmark body is capped at 120 chars in CMS authoring. Surface a
// dev warning so authors notice the overflow — the component still renders
// long copy so the cap is advisory.
const COACHMARK_BODY_MAX_CHARS = 120

// Reusable IDs for aria-labelledby + aria-describedby wiring. Each Coachmark
// instance gets a unique id pair via React.useId().

export interface CoachmarkProps {
  /** Surface key from the help-system registry (e.g. 'designer-portal/pipeline/project-list'). */
  surfaceKey: string
  /**
   * Anchor element. Wrap the trigger as a child (preferred) — the wrapper acts
   * as the Radix anchor without intercepting events. Alternatively, omit and
   * pass `anchorRef` to attach to an external element.
   */
  children?: React.ReactNode
  /**
   * External anchor ref. Used when wrapping the anchor isn't practical (e.g.
   * targeting an element rendered by a different component tree).
   */
  anchorRef?: React.RefObject<HTMLElement | null>
  /** Whether the coachmark is currently shown. Controlled by the caller. */
  open?: boolean
  /** Open-state change notification — fires for dismiss/next/Escape/outside-click. */
  onOpenChange?: (open: boolean) => void
  /** Radix side passthrough — which side of the anchor to position; default 'bottom'. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Radix align passthrough; default 'center'. */
  align?: 'start' | 'center' | 'end'
  /** Side offset in px (gap between anchor + card); default 8. */
  sideOffset?: number
  /** Current step number in a multi-step tour. Renders "{stepNumber} of {totalSteps}". */
  stepNumber?: number
  /** Total steps in the parent tour. */
  totalSteps?: number
  /** Optional Next handler — when provided, renders a primary CTA button. */
  onNext?: () => void
  /** Optional Dismiss handler — when provided, called before onOpenChange(false) on dismiss. */
  onDismiss?: () => void
  /** Fallback heading when CMS returns null. Pair with fallbackBody. */
  fallbackHeading?: string
  /** Fallback body when CMS returns null. */
  fallbackBody?: string
  /** Fallback CTA label override when CMS returns null. */
  fallbackCtaLabel?: string
  /** Forwarded to the Popover content root. */
  className?: string
}

// ─── Type guards ─────────────────────────────────────────────────────────────

function isCoachmarkShaped(content: unknown): content is CoachmarkContent {
  if (typeof content !== 'object' || content === null) return false
  const c = content as Record<string, unknown>
  return (
    typeof c.heading === 'string' &&
    c.heading.length > 0 &&
    typeof c.body === 'string' &&
    c.body.length > 0
  )
}

function getCtaLabel(content: unknown): string | undefined {
  if (typeof content !== 'object' || content === null) return undefined
  const c = content as Record<string, unknown>
  return typeof c.ctaLabel === 'string' && c.ctaLabel.length > 0 ? c.ctaLabel : undefined
}

// ─── PostHog helper — safe capture ────────────────────────────────────────────

type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => void }

function safeCapture(event: string, props: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const ph = (window as unknown as { posthog?: PostHogLike }).posthog
    ph?.capture(event, props)
  } catch {
    // analytics must never crash the UI
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Coachmark({
  surfaceKey,
  children,
  anchorRef,
  open,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  stepNumber,
  totalSteps,
  onNext,
  onDismiss,
  fallbackHeading,
  fallbackBody,
  fallbackCtaLabel,
  className,
}: CoachmarkProps) {
  // ── Dev-mode surface-key sanity check (never throws) ────────────────────────
  React.useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] Coachmark surfaceKey="${surfaceKey}" does not match SURFACE_KEY_REGEX. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  // ── CMS fetch ───────────────────────────────────────────────────────────────
  const { data, isLoading } = useHelpContent(surfaceKey, 'coachmark')

  // Resolve effective copy: CMS first, fallback strings second, null third.
  const cmsHeading = isCoachmarkShaped(data) ? data.heading : null
  const cmsBody = isCoachmarkShaped(data) ? data.body : null
  const cmsCtaLabel = getCtaLabel(data)

  const effectiveHeading = cmsHeading ?? fallbackHeading ?? null
  const effectiveBody = cmsBody ?? fallbackBody ?? null
  const effectiveCtaLabel = cmsCtaLabel ?? fallbackCtaLabel ?? 'Next'

  // ── Body-length advisory warning (spec §8) ──────────────────────────────────
  const warnedFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      cmsBody &&
      cmsBody.length > COACHMARK_BODY_MAX_CHARS &&
      warnedFor.current !== surfaceKey
    ) {
      warnedFor.current = surfaceKey
      console.warn(
        `[help-system] Coachmark body for surfaceKey="${surfaceKey}" is ${cmsBody.length} chars ` +
          `(>${COACHMARK_BODY_MAX_CHARS}). Spec §8 caps coachmark body at ${COACHMARK_BODY_MAX_CHARS} chars; ` +
          `trim the Sanity doc.`,
      )
    }
  }, [cmsBody, surfaceKey])

  // ── Open-time tracking for duration_ms ──────────────────────────────────────
  const openedAtRef = React.useRef<number | null>(null)
  const prevOpenRef = React.useRef<boolean>(false)
  // Idempotency guard — multiple paths (button, Escape, outside-click) can all
  // race to dismiss. The first one wins; the rest no-op.
  const dismissedFiredRef = React.useRef<boolean>(false)

  // No coachmark to show — silent absence per spec §13.4. Render the anchor raw.
  const hasContent = effectiveHeading != null && effectiveBody != null

  // Build aria ids — stable across rerenders
  const headingId = React.useId()
  const bodyId = React.useId()

  // ── Open / close transitions → shown analytics ──────────────────────────────
  // The shown event fires on the open transition only. The dismissed event is
  // fired from the handlers below (button click / Escape / outside click) so
  // we can attribute the action correctly — by the time Radix's onOpenChange
  // fires we've already lost the cause.
  const isOpen = Boolean(open) && hasContent && !isLoading

  React.useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isOpen

    if (!wasOpen && isOpen) {
      openedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
      // Reset the guard so a subsequent open → close round can fire again.
      dismissedFiredRef.current = false
      safeCapture('help.coachmark.shown', {
        surface_key: surfaceKey,
        ...(stepNumber !== undefined ? { step_number: stepNumber } : {}),
        ...(totalSteps !== undefined ? { total_steps: totalSteps } : {}),
      })
    } else if (wasOpen && !isOpen && !dismissedFiredRef.current) {
      // Open prop flipped to false WITHOUT one of our handlers firing first
      // (programmatic close from the parent, or controlled rerender). Treat
      // as a generic dismissal so analytics still records the close.
      fireDismissed('dismiss')
    }
    // We intentionally exclude fireDismissed / stepNumber / totalSteps from the
    // dep array — we want this effect to run on every isOpen transition with
    // the current closure values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, surfaceKey])

  /**
   * Single source of truth for the dismissed event. Guarded by
   * dismissedFiredRef so the multiple dismiss paths (button click, Escape,
   * outside click, parent state flip) all coalesce into one event.
   */
  const fireDismissed = React.useCallback(
    (action: 'dismiss' | 'next' | 'skip') => {
      if (dismissedFiredRef.current) return
      dismissedFiredRef.current = true
      const openedAt = openedAtRef.current
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const durationMs = openedAt != null ? Math.max(0, Math.round(now - openedAt)) : 0
      openedAtRef.current = null
      safeCapture('help.coachmark.dismissed', {
        surface_key: surfaceKey,
        ...(stepNumber !== undefined ? { step_number: stepNumber } : {}),
        ...(totalSteps !== undefined ? { total_steps: totalSteps } : {}),
        duration_ms: durationMs,
        action,
      })
    },
    [surfaceKey, stepNumber, totalSteps],
  )

  // ── Close handlers ──────────────────────────────────────────────────────────
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      // Radix-initiated close (Escape, outside click, programmatic) — record
      // a dismissal if not already captured.
      if (!next) {
        fireDismissed('dismiss')
      }
      onOpenChange?.(next)
    },
    [onOpenChange, fireDismissed],
  )

  const handleDismiss = React.useCallback(() => {
    fireDismissed('dismiss')
    onDismiss?.()
    onOpenChange?.(false)
  }, [fireDismissed, onDismiss, onOpenChange])

  const handleNext = React.useCallback(() => {
    fireDismissed('next')
    onNext?.()
    onOpenChange?.(false)
  }, [fireDismissed, onNext, onOpenChange])

  // ── Loading: render anchor raw (no flash of fallback) ───────────────────────
  if (isLoading) {
    return <>{children}</>
  }

  // ── Silent absence: no CMS content and no fallback → render anchor raw ─────
  if (!hasContent) {
    return <>{children}</>
  }

  // ── Render Popover-anchored coachmark ───────────────────────────────────────
  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      {children !== undefined ? (
        <PopoverPrimitive.Anchor asChild>
          {/* Wrap children in a span so we always have a real DOM element to
              attach to — Radix asChild requires a single child that can accept
              a ref. */}
          <span style={{ display: 'inline-flex' }}>{children}</span>
        </PopoverPrimitive.Anchor>
      ) : anchorRef ? (
        // External anchor — Radix supports `virtualRef` on PopoverAnchor
        <PopoverPrimitive.Anchor
          virtualRef={
            anchorRef as unknown as React.RefObject<{
              getBoundingClientRect(): DOMRect
            }>
          }
        />
      ) : null}

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          // Disable focus trap — coachmarks are non-blocking. (Spec §4.7#6 +
          // §11.2: role=dialog, aria-modal=false.)
          onOpenAutoFocus={(e) => {
            // Allow Radix to focus the content (so SRs announce the heading),
            // but do not return focus to the trigger by default — we'll let
            // Radix handle return-focus on close via onCloseAutoFocus.
            void e
          }}
          // role + aria-modal override Radix's default dialog modality
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          aria-describedby={bodyId}
          // Allow click-through on the spotlighted element (spec §4.7#6) —
          // we don't block interactions on the anchor or surrounding UI.
          // The default DismissableLayer already permits outside interactions;
          // both Escape and outside-clicks land in handleOpenChange below.
          className={cn(
            // Layout: card-like floating panel
            'z-50 max-w-[320px] rounded-lg bg-popover text-popover-foreground shadow-lg outline-none',
            'border border-border',
            'p-4',
            // Reduced motion: fade/zoom only when motion-safe; explicit
            // motion-reduce overrides ensure no animation when reduced motion.
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out',
            'motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0',
            'motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none motion-reduce:transition-none',
            className,
          )}
          style={{ animationDuration: '180ms' }}
        >
          {/* Header row: step indicator (optional) + dismiss button */}
          <div className="mb-2 flex items-start justify-between gap-2">
            {stepNumber !== undefined && totalSteps !== undefined ? (
              <span
                className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-muted-foreground"
                data-testid="coachmark-step-indicator"
              >
                {stepNumber} of {totalSteps}
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss coachmark"
              className="-mr-1 -mt-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Title (h2) — accessible name target */}
          <h2
            id={headingId}
            className="mb-1 text-sm font-semibold leading-snug text-foreground"
          >
            {effectiveHeading}
          </h2>

          {/* Body */}
          <p id={bodyId} className="text-sm leading-relaxed text-foreground/85">
            {effectiveBody}
          </p>

          {/* Optional Next CTA */}
          {onNext != null ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {effectiveCtaLabel}
              </button>
            </div>
          ) : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
