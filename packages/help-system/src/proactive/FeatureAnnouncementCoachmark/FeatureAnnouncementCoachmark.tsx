'use client'

/**
 * <FeatureAnnouncementCoachmark /> — Layer 3 · Proactive
 *
 * A single one-shot coachmark anchored to a newly shipped feature. Users see
 * each announcement exactly once: the first dismissal writes a `dismissedAt`
 * timestamp keyed by `featureKey`, and subsequent mounts render nothing.
 *
 * Spec reference:
 *   docs/prds/Guide/patina-help-guidance-engineering-handoff.md — §4.7
 *
 * Parallel-coordination notes (Sprint 3, Stream D):
 *   - D1 ships the canonical <Coachmark />. Until it lands, this component
 *     uses @radix-ui/react-popover directly. When D1 merges, swap the inline
 *     Popover wiring for <Coachmark>. See:
 *     // TODO: swap inline Popover for canonical <Coachmark>
 *   - D2 ships TourController + tourState. Persistence here lives in
 *     `featureAnnouncementState.ts` for now; consolidate once Sprint 3 lands.
 *     See:
 *     // TODO: consolidate with D2 tourState module after Sprint 3 integration
 *
 * Behaviour:
 *   - On mount, reads getFeatureAnnouncementState(featureKey).
 *     - If `dismissedAt` exists AND children were passed: render the children
 *       unchanged (no pulse, no popover, no shown event). The children ARE the
 *       consumer's feature UI — they MUST keep rendering so the user can still
 *       use the feature long after dismissing the announcement.
 *     - If `dismissedAt` exists AND no children (anchorRef path): render null.
 *       The external anchor stays wherever the host renders it.
 *   - Otherwise renders an anchor (the child or anchorRef) with a soft pulse
 *     ring and a Radix Popover card containing the heading + body + dismiss
 *     button. Pulse respects `prefers-reduced-motion: reduce`.
 *   - Fires `help.feature_announcement.shown` once per surface mount when the
 *     coachmark actually becomes visible.
 *   - Dismiss writes persistence, calls onDismiss, fires
 *     `help.feature_announcement.dismissed` with `age_days` computed from
 *     `shippedAt`.
 *
 * Content source:
 *   - useHelpContent(surfaceKey, 'coachmark'). The current discriminated
 *     union does not include a dedicated `featureAnnouncement` content type;
 *     when one is added to contentTypes.ts (heading + body + optional
 *     ctaLabel), this component should adopt it without changing its public
 *     contract. The fallback heading/body props let surfaces ship before
 *     Sanity copy exists.
 *
 * Accessibility:
 *   - The popover card carries role="dialog" with aria-modal="false" so the
 *     interface beneath remains operable (spec §4.7 critical rule 6).
 *   - The dismiss button is the close affordance and is reachable by keyboard
 *     (Tab/Enter) inside the popover.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as Popover from '@radix-ui/react-popover'
import { X } from 'lucide-react'
import { useHelpContent } from '../../hooks/useHelpContent'
import { SURFACE_KEY_REGEX } from '../../surfaceKeys'
import type { HelpContent, Persona } from '../../contentTypes'
import {
  getFeatureAnnouncementState,
  setFeatureAnnouncementState,
} from './featureAnnouncementState'

// Local cn — mirrors @patina/design-system/utils/cn so this component is
// self-contained without depending on the design-system's built dist.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const MS_PER_DAY = 86_400_000

export interface FeatureAnnouncementCoachmarkProps {
  /**
   * Unique key for persistence. Identifies the *shipped feature*. Example:
   * "v2-batch-tagging".
   */
  featureKey: string
  /**
   * Surface key for CMS content lookup. Decoupled from featureKey so multiple
   * announcements on the same surface can share one Sanity schema entry.
   */
  surfaceKey: string
  /**
   * The element to spotlight. Either render the anchor as a child here, or
   * pass `anchorRef` to point at an external element. When children are
   * provided this component wraps them in a span that carries the pulse
   * effect; when anchorRef is provided the popover anchors to that ref and
   * no wrapper is rendered.
   */
  children?: React.ReactNode
  anchorRef?: RefObject<HTMLElement>
  /**
   * Optional ISO date when the feature shipped. Used to compute `age_days`
   * on the dismiss analytics event.
   */
  shippedAt?: string
  /**
   * Persona used to resolve persona-specific CMS copy via the §7.3 fallback
   * chain. Mirrors the TourController prop of the same name. Defaults to
   * 'all'.
   */
  persona?: Persona
  /**
   * Whether to render the pulse ring on the anchor. Defaults to true.
   * `prefers-reduced-motion: reduce` forces this to off regardless of the
   * prop value.
   */
  pulse?: boolean
  /** Fired after the user clicks the dismiss button. */
  onDismiss?: () => void
  /** Inline fallback heading rendered when Sanity returns null. */
  fallbackTitle?: string
  /** Inline fallback body rendered when Sanity returns null. */
  fallbackBody?: string
  /**
   * Popover side passthrough; defaults to 'bottom'. Mirrors the Radix prop so
   * surfaces can override placement when the anchor is near a viewport edge.
   */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Optional className merged onto the popover card. */
  className?: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

function getPosthog(): PosthogLike | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { posthog?: PosthogLike }).posthog
}

/**
 * Subset of HelpContent variants exposing a heading + body shape. The
 * `coachmark` discriminator is the canonical type used here; the fallback
 * accepts any object with heading + body strings so the component can adapt
 * if Sanity returns a future `featureAnnouncement` variant.
 */
function pickAnnouncementContent(
  content: unknown,
): { heading: string; body: string } | null {
  if (typeof content !== 'object' || content === null) return null
  const c = content as Partial<{ heading: unknown; body: unknown }>
  const heading = typeof c.heading === 'string' && c.heading.length > 0 ? c.heading : null
  const body = typeof c.body === 'string' && c.body.length > 0 ? c.body : null
  if (heading === null || body === null) return null
  return { heading, body }
}

/**
 * Reads the user's reduced-motion preference. Safe in SSR and tests.
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
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', listener)
      return () => mql.removeEventListener('change', listener)
    }
    mql.addListener(listener)
    return () => mql.removeListener(listener)
  }, [])
  return reduced
}

/**
 * Reads persisted dismissal state once on mount. We deliberately do not
 * subscribe to storage changes — the same user dismissing on another tab does
 * not need to mid-flight close this surface. The next route navigation picks
 * up the new state.
 */
function useInitialDismissedAt(featureKey: string): string | null {
  const [dismissedAt] = useState<string | null>(() => {
    const state = getFeatureAnnouncementState(featureKey)
    return state?.dismissedAt ?? null
  })
  return dismissedAt
}

/**
 * Computes integer age_days from shippedAt. Returns null when shippedAt is
 * missing or unparseable.
 */
function computeAgeDays(shippedAt: string | undefined): number | null {
  if (!shippedAt) return null
  const ts = Date.parse(shippedAt)
  if (Number.isNaN(ts)) return null
  return Math.floor((Date.now() - ts) / MS_PER_DAY)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeatureAnnouncementCoachmark({
  featureKey,
  surfaceKey,
  children,
  anchorRef,
  shippedAt,
  persona = 'all',
  pulse = true,
  onDismiss,
  fallbackTitle,
  fallbackBody,
  side = 'bottom',
  className,
}: FeatureAnnouncementCoachmarkProps) {
  // Dev-only surfaceKey validation — typo warning, never throws.
  useEffect(() => {
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      !SURFACE_KEY_REGEX.test(surfaceKey)
    ) {
      console.warn(
        `[help-system] FeatureAnnouncementCoachmark surfaceKey="${surfaceKey}" does not match the surface-key regex. ` +
          `Add it to packages/help-system/src/surfaceKeys.ts.`,
      )
    }
  }, [surfaceKey])

  // Read persistence once. If already dismissed, render nothing forever.
  const initialDismissedAt = useInitialDismissedAt(featureKey)
  const alreadyDismissed = initialDismissedAt !== null

  // Track local dismissal so a click in this session hides the card without
  // forcing a re-mount.
  const [locallyDismissed, setLocallyDismissed] = useState(false)

  // CMS content. The current discriminated union exposes `coachmark`; if a
  // dedicated `featureAnnouncement` variant lands later, this is the only call
  // site that needs to change.
  // TODO: switch to `'featureAnnouncement'` content type when added to
  // contentTypes.ts (heading + body + optional ctaLabel + shippedAt).
  const { data, isLoading } = useHelpContent(surfaceKey, 'coachmark', persona)

  const cmsContent = useMemo(() => pickAnnouncementContent(data as HelpContent | null), [data])
  const heading = cmsContent?.heading ?? fallbackTitle ?? null
  const body = cmsContent?.body ?? fallbackBody ?? null

  const reducedMotion = usePrefersReducedMotion()
  const pulseActive = pulse && !reducedMotion

  // Track whether the shown event has fired for this mount.
  const shownFiredRef = useRef(false)
  // Open is fully controlled — closed only via user dismiss. Click-outside
  // does NOT close the announcement; the user must explicitly dismiss.
  const open = !alreadyDismissed && !locallyDismissed && heading !== null && body !== null

  useEffect(() => {
    if (shownFiredRef.current) return
    if (!open) return
    if (isLoading) return
    shownFiredRef.current = true
    const posthog = getPosthog()
    posthog?.capture('help.feature_announcement.shown', {
      feature_key: featureKey,
      surface_key: surfaceKey,
    })
  }, [open, isLoading, featureKey, surfaceKey])

  const handleDismiss = useCallback(() => {
    setLocallyDismissed(true)
    setFeatureAnnouncementState(featureKey, {
      dismissedAt: new Date().toISOString(),
    })
    const posthog = getPosthog()
    posthog?.capture('help.feature_announcement.dismissed', {
      feature_key: featureKey,
      surface_key: surfaceKey,
      age_days: computeAgeDays(shippedAt),
    })
    onDismiss?.()
  }, [featureKey, surfaceKey, shippedAt, onDismiss])

  // ─── Render guards ─────────────────────────────────────────────────────────

  // 1. Already dismissed (persisted) — keep children rendering so the feature
  //    stays usable, but skip the popover + pulse + shown event entirely.
  //    anchorRef path renders null (host owns the anchor element).
  if (alreadyDismissed) {
    if (anchorRef) return null
    return <>{children}</>
  }

  // 2. Local dismiss in this session — same treatment as persisted dismiss.
  if (locallyDismissed) {
    if (anchorRef) return null
    return <>{children}</>
  }

  // 3. CMS still loading — avoid a flash of fallback. Render the anchor
  //    untouched so the surface stays operable while content resolves.
  if (isLoading) {
    if (anchorRef) return null
    return <>{children}</>
  }

  // 4. No content (CMS miss + no fallback) — silent absence (spec §13.4).
  if (heading === null || body === null) {
    if (anchorRef) return null
    return <>{children}</>
  }

  // ─── Visible coachmark ─────────────────────────────────────────────────────

  // Pulse styles are inline so the package ships self-contained — no
  // tailwind plugin or design-system token dependency at build time. The
  // animation is gated by `data-pulse="true"`. CSS custom properties keep the
  // colour tied to the design-system Clay token when available, with a hex
  // fallback for portals that have not yet wired the tokens.
  const pulseStyle: CSSProperties = {
    ['--patina-pulse-color' as string]:
      'var(--cl, var(--clay, rgba(196,165,123,0.5)))',
  }

  return (
    <Popover.Root open={open} onOpenChange={() => undefined}>
      {/*
        Anchor path 1 — child wrapper. We must wrap children in a Radix
        Popover.Anchor span (asChild not used here because consumers pass a
        button which we want to leave clickable). The span sits inline-block
        so it does not disturb existing layout and carries the pulse ring as
        a pseudo-element via CSS keyframes declared below.
      */}
      {!anchorRef && (
        <Popover.Anchor asChild>
          <span
            className={cn(
              'relative inline-flex',
              pulseActive && 'patina-feature-pulse',
            )}
            data-pulse={pulseActive ? 'true' : 'false'}
            style={pulseActive ? pulseStyle : undefined}
          >
            {children}
          </span>
        </Popover.Anchor>
      )}

      {/*
        Anchor path 2 — external ref. Popover.Anchor accepts a virtual ref
        via `virtualRef` when no child is passed. We render no DOM here; the
        caller controls the anchor element directly.
      */}
      {anchorRef && (
        <Popover.Anchor virtualRef={anchorRef as RefObject<HTMLElement>} />
      )}

      <Popover.Portal>
        {/*
          TODO: swap inline Popover for canonical <Coachmark> (D1).
          When D1's <Coachmark> ships, this block becomes:
            <Coachmark
              role="dialog"
              ariaModal={false}
              heading={heading}
              body={body}
              onDismiss={handleDismiss}
            />
          The persistence + analytics + pulse wiring above is unchanged.
        */}
        <Popover.Content
          side={side}
          align="center"
          sideOffset={8}
          // The popover is informational, not modal — spec §4.7 #6. We do
          // not trap focus; the surface beneath remains operable. The
          // implicit Radix focus trap is suppressed by leaving auto-focus
          // behaviour at its default for a non-modal popover.
          role="dialog"
          aria-modal="false"
          aria-label={heading}
          // Prevent click-outside / Escape from closing — dismiss is the
          // explicit affordance per the spec ("Dismissed means dismissed").
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'z-50 max-w-[320px] rounded-md bg-primary text-primary-foreground shadow-lg',
            'p-4',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="mb-1 font-semibold text-base leading-tight">
                {heading}
              </div>
              <p className="text-sm leading-relaxed opacity-90">{body}</p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss announcement"
              className={cn(
                'shrink-0 rounded-sm p-1 -m-1',
                'text-primary-foreground/70 hover:text-primary-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'transition-colors',
              )}
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>

      {/*
        Inline keyframes for the pulse ring. Scoped via the patina-feature
        prefix so it cannot collide with consumer styles. Disabled by
        @media (prefers-reduced-motion: reduce) — the pulseActive flag also
        gates it from JS, this is a defence-in-depth second line.
      */}
      <style>{`
        @keyframes patina-feature-pulse {
          0%   { box-shadow: 0 0 0 0 var(--patina-pulse-color, rgba(196,165,123,0.5)); }
          70%  { box-shadow: 0 0 0 8px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
        .patina-feature-pulse {
          border-radius: 6px;
          animation: patina-feature-pulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .patina-feature-pulse { animation: none; }
        }
      `}</style>
    </Popover.Root>
  )
}
