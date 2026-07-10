'use client'

/**
 * WelcomeModal — Layer 3 (Proactive) first-signin orientation dialog.
 *
 * Spec references:
 *   - §4.8  — Component contract (exactly two CTAs, escape/backdrop closes, NO
 *             feature announcements or upsells — orientation only)
 *   - §6    — Surface keys (welcome variants resolve through useHelpContent)
 *   - §7.3  — Sanity 5-min stale-while-revalidate cache + persona fallback chain
 *   - §10.1 — Analytics events (snake_case property keys per Sprint 2 R11)
 *   - §13.4 — Sanity downtime must not crash the UI — `fallbackTitle` / `fallbackBody`
 *
 * The single allowed modal in the help system. This component is the only one
 * that traps focus and demands acknowledgement; every other layer is reactive
 * or ambient. Even so it remains dismissable — backdrop click and Escape both
 * close the dialog (treated as a "dismiss" action, distinct from explicit "skip").
 *
 * Behavior summary:
 *   - Controlled component: parent owns `open` and wires `onOpenChange`.
 *   - Content is fetched via `useHelpContent(surfaceKey, 'welcomeModal', persona)`,
 *     so persona-specific copy (designer / consumer / maker / admin) is resolved
 *     by the 4-step Sanity fallback chain.
 *   - Two CTAs:
 *       Primary   → onStartTour()  + analytics action='start_tour'
 *       Secondary → onSkip()       + analytics action='skip'
 *   - Escape / backdrop click   → onOpenChange(false) + analytics action='dismiss'
 *     The dismiss action is fired only once per close cycle (a CTA click does
 *     NOT also fire dismiss — the CTA handlers shortcut the close path).
 *
 * First-signin gating:
 *   - This component does NOT detect first-signin itself. The consumer is
 *     responsible for that (typically via a `user.created_at` check against
 *     a recent threshold, plus a per-user "shown once" flag persisted by the
 *     portal). The `first_signin: true` analytics property is emitted on
 *     `welcome_modal.shown` to mark the intent: this surface is for orientation
 *     only — re-triggering it from "Show me around" SHOULD pass a different
 *     `surfaceKey` (e.g. 'designer-portal/welcome/replay') so analytics can
 *     distinguish the cohorts.
 *
 * Analytics events (snake_case property keys):
 *   - help.welcome_modal.shown   { surface_key, persona, first_signin: true }
 *   - help.welcome_modal.action  { surface_key, persona,
 *                                  action: 'start_tour' | 'skip' | 'dismiss' }
 */

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { Persona, WelcomeModalContent } from '../../contentTypes'
import { HELP_EVENTS, safeCapture } from '../../analytics'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WelcomeModalProps {
  /** Surface key for the welcomeModal variant (e.g. 'designer-portal/welcome'). */
  surfaceKey: string
  /** Controlled open state — parent owns the lifecycle. */
  open: boolean
  /**
   * Fires whenever Radix wants to change open state. The component itself
   * routes Escape and backdrop dismissals through this callback; CTA clicks
   * also close via this callback after their respective handlers run.
   */
  onOpenChange: (open: boolean) => void
  /**
   * Primary CTA — typically wired to TourController.start() by the parent.
   * Runs before the modal closes; the modal still closes afterwards.
   */
  onStartTour?: () => void
  /** Secondary CTA — closes without starting a tour. */
  onSkip?: () => void
  /** Persona used by useHelpContent to resolve the Sanity content variant. */
  persona?: Persona
  /** Fallback title if Sanity returns null. */
  fallbackTitle?: string
  /** Fallback body if Sanity returns null. */
  fallbackBody?: string
  /** Forwarded onto the dialog content element. */
  className?: string
}

// Analytics route through the shared HELP_EVENTS taxonomy + safeCapture (see
// ../../analytics.ts). No local capture path.

// ─── Defaults for fallback rendering ──────────────────────────────────────────

const DEFAULT_PRIMARY_CTA = 'Take the tour'
const DEFAULT_SECONDARY_CTA = 'Skip for now'
const DEFAULT_FALLBACK_TITLE = 'Welcome to Patina'
const DEFAULT_FALLBACK_BODY =
  'Take a brief tour to see how everything fits together, or jump in and explore.'

// ─── Component ────────────────────────────────────────────────────────────────

export function WelcomeModal({
  surfaceKey,
  open,
  onOpenChange,
  onStartTour,
  onSkip,
  persona = 'all',
  fallbackTitle,
  fallbackBody,
  className,
}: WelcomeModalProps) {
  const contentQuery = useHelpContent(surfaceKey, 'welcomeModal', persona)
  const content: WelcomeModalContent | null = contentQuery.data ?? null

  const title = content?.title ?? fallbackTitle ?? DEFAULT_FALLBACK_TITLE
  const body = content?.body ?? fallbackBody ?? DEFAULT_FALLBACK_BODY
  const primaryLabel =
    (typeof content?.primaryCtaLabel === 'string' && content.primaryCtaLabel.length > 0
      ? content.primaryCtaLabel
      : DEFAULT_PRIMARY_CTA)
  const secondaryLabel =
    (typeof content?.secondaryCtaLabel === 'string' && content.secondaryCtaLabel.length > 0
      ? content.secondaryCtaLabel
      : DEFAULT_SECONDARY_CTA)

  // Track which user action triggered the close so we can emit the right
  // analytics action property. A CTA click sets this to 'start_tour' or 'skip';
  // anything else (Escape, backdrop click, programmatic close) defaults to
  // 'dismiss'. We reset to null after each capture so a fresh open cycle
  // doesn't carry stale state.
  const lastActionRef = React.useRef<'start_tour' | 'skip' | null>(null)

  // Track previous open state so we can fire the 'shown' event exactly once
  // per closed→open transition, not on every rerender while open.
  const prevOpenRef = React.useRef<boolean>(false)

  React.useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open

    if (!wasOpen && open) {
      safeCapture(HELP_EVENTS.WELCOME_MODAL_SHOWN, {
        surface_key: surfaceKey,
        persona,
        first_signin: true,
      })
      // New open cycle — reset any stale action marker.
      lastActionRef.current = null
    }
  }, [open, surfaceKey, persona])

  // ── Radix open-change handler ────────────────────────────────────────────
  //
  // Fires for: Escape, backdrop click, and our own programmatic close after
  // a CTA click. We only emit a 'dismiss' action when there's no recorded
  // CTA action — otherwise the CTA handler already emitted 'start_tour' or
  // 'skip' and we shouldn't double-fire.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        if (lastActionRef.current == null) {
          safeCapture(HELP_EVENTS.WELCOME_MODAL_ACTION, {
            surface_key: surfaceKey,
            persona,
            action: 'dismiss',
          })
        }
        // Reset so the next open cycle starts clean.
        lastActionRef.current = null
      }
      onOpenChange(next)
    },
    [surfaceKey, persona, onOpenChange],
  )

  const handleStartTour = React.useCallback(() => {
    lastActionRef.current = 'start_tour'
    safeCapture(HELP_EVENTS.WELCOME_MODAL_ACTION, {
      surface_key: surfaceKey,
      persona,
      action: 'start_tour',
    })
    try {
      onStartTour?.()
    } finally {
      // Close after the handler runs; handleOpenChange sees the action ref
      // and skips emitting 'dismiss'.
      onOpenChange(false)
    }
  }, [surfaceKey, persona, onStartTour, onOpenChange])

  const handleSkip = React.useCallback(() => {
    lastActionRef.current = 'skip'
    safeCapture(HELP_EVENTS.WELCOME_MODAL_ACTION, {
      surface_key: surfaceKey,
      persona,
      action: 'skip',
    })
    try {
      onSkip?.()
    } finally {
      onOpenChange(false)
    }
  }, [surfaceKey, persona, onSkip, onOpenChange])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="welcome-modal-overlay"
          className={[
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'motion-reduce:transition-none',
            'motion-reduce:data-[state=open]:animate-none',
            'motion-reduce:data-[state=closed]:animate-none',
          ].join(' ')}
          style={{ animationDuration: '200ms' }}
        />
        <DialogPrimitive.Content
          data-testid="welcome-modal-content"
          aria-modal="true"
          className={[
            'fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'gap-5 rounded-lg bg-background p-6 shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:transition-none',
            'motion-reduce:data-[state=open]:animate-none',
            'motion-reduce:data-[state=closed]:animate-none',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ animationDuration: '200ms' }}
        >
          <div className="flex flex-col gap-3">
            <DialogPrimitive.Title
              className="text-xl font-semibold leading-tight text-foreground"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
              {body}
            </DialogPrimitive.Description>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSkip}
              data-testid="welcome-modal-secondary"
              className={[
                'inline-flex items-center justify-center rounded-md border border-border',
                'bg-background px-4 py-2 text-sm font-medium text-foreground',
                'transition-colors hover:bg-muted/40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              ].join(' ')}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={handleStartTour}
              data-testid="welcome-modal-primary"
              className={[
                'inline-flex items-center justify-center rounded-md',
                'bg-foreground px-4 py-2 text-sm font-medium text-background',
                'transition-opacity hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              ].join(' ')}
            >
              {primaryLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

WelcomeModal.displayName = 'PatinaWelcomeModal'
