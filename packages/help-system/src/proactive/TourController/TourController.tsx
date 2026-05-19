'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { CoachmarkContent } from '../../contentTypes'

// Local cn() — mirrors the Tooltip pattern; @patina/help-system does not
// depend on @patina/design-system's built dist for vitest/tsup.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// ─────────────────────────────────────────────────────────────────────────────
// Public contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single step in a tour. `surfaceKey` doubles as the analytics step key
 * and the Sanity content lookup key (CoachmarkContent — spec §7.2.5).
 */
export interface CoachmarkStep {
  /** Surface key — resolves CoachmarkContent in Sanity and provides analytics key. */
  surfaceKey: string
  /** CSS selector resolved at step-render time. Used when no `anchorRef` is given. */
  anchorSelector?: string
  /** React ref to the anchor element. Wins over `anchorSelector` when both supplied. */
  anchorRef?: RefObject<HTMLElement>
  /** Optional async hook fired before the step's popover opens (e.g. scrollIntoView). */
  beforeShow?: () => Promise<void> | void
  /** Radix popover side; defaults to 'bottom'. */
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * The imperative + slot API the render-prop child receives. The consumer
 * decides where to render `<CoachmarkSlot />` and which buttons to wire to
 * `next` / `prev` / `skip` / `complete`.
 */
export interface TourControllerAPI {
  currentStep: number
  totalSteps: number
  isActive: boolean
  start: () => void
  next: () => void
  prev: () => void
  skip: () => void
  complete: () => void
  /** Pre-bound coachmark for the current step. Mounts the inline Popover. */
  CoachmarkSlot: ComponentType
}

export interface TourControllerProps {
  /** Unique identifier for persistence + analytics (e.g. "first-project-walkthrough"). */
  tourId: string
  /** Ordered list of coachmark steps. */
  steps: CoachmarkStep[]
  /** Controlled active flag — when set, overrides the persistence check. */
  active?: boolean
  /** Fired after `complete()` succeeds. */
  onComplete?: () => void
  /** Fired after `skip()` succeeds. Receives the zero-based step the user was on. */
  onAbandon?: (atStep: number) => void
  /** Resume scenarios — jump to this step on first mount. Defaults to 0. */
  startAt?: number
  /** Render-prop child receives the controller API. */
  children: (api: TourControllerAPI) => ReactNode
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — the TourController calls through the module-level `tourState`
// accessors, which dispatch through the currently-installed backend (default:
// localStorage; production for signed-in users: Supabase — see
// `setTourStateBackend` in tourState.ts).
//
// For testing, this file also exposes the legacy `__setTourStateAdapterForTests`
// API. Internally it delegates to `setTourStateBackend(...)` so the test
// behaviour is identical whether the test uses the legacy adapter API or the
// new backend API.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getTourState,
  setTourState,
  setTourStateBackend,
  _resetTourStateBackendForTests,
  type TourState,
  type TourStateBackend,
} from './tourState'

/** Test-only injection point. Production callers should never invoke this. */
export function __setTourStateAdapterForTests(next: Partial<TourStateBackend>): void {
  // Build a full backend by composing the requested overrides on top of the
  // localStorage defaults (the prior shape accepted `Partial<...>` so tests
  // could override only one method).
  setTourStateBackend({
    getTourState: next.getTourState ?? getTourState,
    setTourState: next.setTourState ?? setTourState,
  })
}

/** Test-only reset. */
export function __resetTourStateAdapterForTests(): void {
  _resetTourStateBackendForTests()
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics helper — portal-agnostic capture path matching Tooltip / C-stream.
// ─────────────────────────────────────────────────────────────────────────────

function captureEvent(event: string, props: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const ph = (window as unknown as {
    posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void }
  }).posthog
  ph?.capture?.(event, props)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reduced-motion detection. Matches the convention used elsewhere in the
// help-system: a single `matchMedia` probe with a graceful fallback.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// <TourController />
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <TourController /> — Proactive-layer multi-step coachmark orchestrator
 * (spec §4.7). Drives the first-project walkthrough and any other tour we
 * ship in Sprint 3+.
 *
 * Persistence model — Sprint 4 (S4-1):
 *   • State lives in the `tourState` module, which dispatches through a
 *     backend installed via `setTourStateBackend(...)`. Default backend:
 *     `localStorage` (anon + offline + pre-hydration fallback). Signed-in
 *     portals install the Supabase backend so dismissals propagate across
 *     devices.
 *   • Once `completed === true` OR `abandoned === true`, the tour will
 *     NEVER auto-start again (spec §4.7 rule 1 — "One-shot per user").
 *   • The TourController itself NEVER reads localStorage directly — all
 *     I/O goes through the module-level `getTourState` / `setTourState`
 *     entry points.
 *
 * Coachmark rendering — Sprint 3 v1:
 *   • This component renders an inline Radix Popover for the current step's
 *     coachmark UI. The D1 Coachmark component is being built in parallel
 *     and does not yet exist in this branch.
 *
 *   // TODO: swap inline Popover for canonical <Coachmark surfaceKey={...}>
 *   //   wrapper after D1 ships. Mirrors the C2/C3 → C1 Tooltip pattern from
 *   //   Sprint 2: the parallel-built primitive will take over the popover
 *   //   surface and we lose the duplicated heading/body/CTA markup here.
 *
 * Analytics (snake_case per Sprint 2 R11 + A7 taxonomy):
 *   • help.tour.started        on start()       — { tour_key, total_steps }
 *   • help.tour.step_advanced  on next()        — { tour_key, step_number, step_surface_key }
 *   • help.tour.completed      on complete()    — { tour_key, duration_ms, steps_viewed }
 *   • help.tour.abandoned      on skip()        — { tour_key, at_step, total_steps }
 *
 * Accessibility (spec §12):
 *   • Escape skips the tour while a step is open.
 *   • Enter advances to the next step.
 *   • prefers-reduced-motion suppresses popover transitions via Tailwind
 *     `motion-safe:*` variants.
 */
export function TourController({
  tourId,
  steps,
  active: controlledActive,
  onComplete,
  onAbandon,
  startAt = 0,
  children,
}: TourControllerProps) {
  if (steps.length === 0) {
    // Empty tour is a programmer error; render-prop must still receive a
    // shape it can destructure, so we return a no-op API.
    return <>{children(makeEmptyAPI())}</>
  }

  // Initial state derived from persistence — runs once (lazy initializer).
  // Spec §4.7 rule 1: a tour that has been completed OR abandoned must NEVER
  // auto-start again. Pulling from the adapter in the lazy initializer means
  // the component renders with the correct state on first paint (no flash of
  // an active tour for users who already saw it).
  const [persistedState] = useState<TourState>(() => getTourState(tourId))
  const alreadyResolved = Boolean(
    persistedState.completed === true || persistedState.abandoned === true,
  )

  // Active state — controlled prop wins. When controlled is undefined we fall
  // back to internal state, which defaults to false (the consumer must call
  // `start()` to kick the tour off) unless the tour was already resolved, in
  // which case it stays false forever.
  const [internalActive, setInternalActive] = useState<boolean>(false)
  const isActive = controlledActive ?? internalActive

  // Effective active flag — collapses both signals + idempotency guard.
  const effectiveActive = isActive && !alreadyResolved

  // Step pointer.
  const [currentStep, setCurrentStep] = useState<number>(() =>
    clampStep(startAt, steps.length),
  )

  // For duration tracking on complete.
  const startedAtRef = useRef<number | null>(null)

  // Track which step indexes the user has actually viewed (used as
  // steps_viewed in the completed event).
  const viewedStepsRef = useRef<Set<number>>(new Set())

  // Mark the current step viewed whenever it becomes active.
  useEffect(() => {
    if (effectiveActive) {
      viewedStepsRef.current.add(currentStep)
    }
  }, [effectiveActive, currentStep])

  // Resolve current step config — guard against out-of-range writes.
  const safeIndex = clampStep(currentStep, steps.length)
  const step: CoachmarkStep = steps[safeIndex]!

  // beforeShow hook — fired when the active step changes (and is active).
  // Tracked so we know to short-circuit popover open until the promise settles.
  const [readyForStep, setReadyForStep] = useState<number | null>(null)
  useEffect(() => {
    if (!effectiveActive) {
      setReadyForStep(null)
      return
    }
    let cancelled = false
    setReadyForStep(null)
    const run = async () => {
      try {
        if (step.beforeShow) {
          await step.beforeShow()
        }
      } catch (err) {
        // beforeShow failure must not break the tour — log + continue.
        if (typeof console !== 'undefined') {
          console.warn(
            `[help-system] TourController beforeShow for step ${safeIndex} (` +
              `${step.surfaceKey}) failed: `,
            err,
          )
        }
      }
      if (!cancelled) {
        setReadyForStep(safeIndex)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [effectiveActive, safeIndex, step])

  // ── Imperative actions ─────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (alreadyResolved) return
    startedAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    viewedStepsRef.current = new Set([clampStep(startAt, steps.length)])
    setCurrentStep(clampStep(startAt, steps.length))
    setInternalActive(true)
    captureEvent('help.tour.started', {
      tour_key: tourId,
      total_steps: steps.length,
    })
  }, [alreadyResolved, startAt, steps.length, tourId])

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      const nextIndex = Math.min(prev + 1, steps.length - 1)
      // Only emit when we actually advance — re-clicking next at the final
      // step is a no-op (spec doesn't require an event for it).
      if (nextIndex !== prev) {
        const advancedStep = steps[nextIndex]!
        captureEvent('help.tour.step_advanced', {
          tour_key: tourId,
          step_number: nextIndex,
          step_surface_key: advancedStep.surfaceKey,
        })
      }
      return nextIndex
    })
  }, [steps, tourId])

  const prev = useCallback(() => {
    // Internal navigation — no analytics per spec.
    setCurrentStep((cur) => Math.max(cur - 1, 0))
  }, [])

  const skip = useCallback(() => {
    const atStep = currentStep
    captureEvent('help.tour.abandoned', {
      tour_key: tourId,
      at_step: atStep,
      total_steps: steps.length,
    })
    setTourState(tourId, {
      abandoned: true,
      atStep,
      abandonedAt: new Date().toISOString(),
    })
    setInternalActive(false)
    onAbandon?.(atStep)
  }, [currentStep, onAbandon, steps.length, tourId])

  const complete = useCallback(() => {
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    const durationMs =
      startedAtRef.current !== null
        ? Math.max(0, Math.round(now - startedAtRef.current))
        : 0
    captureEvent('help.tour.completed', {
      tour_key: tourId,
      duration_ms: durationMs,
      steps_viewed: viewedStepsRef.current.size,
    })
    setTourState(tourId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
    setInternalActive(false)
    onComplete?.()
  }, [onComplete, tourId])

  // ── CoachmarkSlot — inline Radix Popover for the current step ─────────────
  //
  // TODO: swap inline Popover for canonical <Coachmark surfaceKey={...}>
  //   wrapper after D1 ships. The Coachmark component (D1, parallel branch
  //   help-system/D1-coachmark) will own the popover surface, heading + body
  //   layout, dismiss button, "Step N of M" indicator, and the Sanity content
  //   lookup. When that lands, this section reduces to:
  //
  //     <Coachmark
  //       surfaceKey={step.surfaceKey}
  //       target={step.anchorRef ?? step.anchorSelector}
  //       position={step.side ?? 'bottom'}
  //       step={{ current: safeIndex + 1, total: steps.length }}
  //       onNext={next}
  //       onSkip={skip}
  //       onDismiss={skip}
  //     />
  //
  // For now the inline popover handles its own rendering so D2 ships
  // independently and the integration is a drop-in replacement later.
  const CoachmarkSlot = useMemo<ComponentType>(() => {
    return function CoachmarkSlotImpl() {
      return (
        <CoachmarkSlotInner
          tourId={tourId}
          step={step}
          stepIndex={safeIndex}
          totalSteps={steps.length}
          isOpen={effectiveActive && readyForStep === safeIndex}
          onNext={next}
          onSkip={skip}
          onComplete={complete}
        />
      )
    }
  }, [
    tourId,
    step,
    safeIndex,
    steps.length,
    effectiveActive,
    readyForStep,
    next,
    skip,
    complete,
  ])

  // ── Keyboard handlers (spec §12 / accessibility) ───────────────────────────
  // Escape skips, Enter advances. Wired at the document level so we don't
  // depend on which element has focus — the popover may grab focus, but the
  // page chrome behind it should also be responsive.
  useEffect(() => {
    if (!effectiveActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
      } else if (e.key === 'Enter') {
        // Enter on the last step completes; otherwise advances.
        e.preventDefault()
        if (safeIndex === steps.length - 1) {
          complete()
        } else {
          next()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [effectiveActive, safeIndex, steps.length, complete, next, skip])

  // ── Render ────────────────────────────────────────────────────────────────

  const api: TourControllerAPI = {
    currentStep: safeIndex,
    totalSteps: steps.length,
    isActive: effectiveActive,
    start,
    next,
    prev,
    skip,
    complete,
    CoachmarkSlot,
  }

  return <>{children(api)}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

function clampStep(index: number, total: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(Math.floor(index), Math.max(0, total - 1)))
}

function makeEmptyAPI(): TourControllerAPI {
  const noop = () => undefined
  return {
    currentStep: 0,
    totalSteps: 0,
    isActive: false,
    start: noop,
    next: noop,
    prev: noop,
    skip: noop,
    complete: noop,
    CoachmarkSlot: () => null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CoachmarkSlotInner — the actual Radix Popover. Pulled into a dedicated
// component so the memoized `CoachmarkSlot` factory above is stable across
// re-renders. NOTE: this is the swap-point for D1's <Coachmark />.
// ─────────────────────────────────────────────────────────────────────────────

interface CoachmarkSlotInnerProps {
  tourId: string
  step: CoachmarkStep
  stepIndex: number
  totalSteps: number
  isOpen: boolean
  onNext: () => void
  onSkip: () => void
  onComplete: () => void
}

function CoachmarkSlotInner({
  tourId,
  step,
  stepIndex,
  totalSteps,
  isOpen,
  onNext,
  onSkip,
  onComplete,
}: CoachmarkSlotInnerProps) {
  // Pull CMS content for this step's surfaceKey.
  const { data } = useHelpContent(step.surfaceKey, 'coachmark')

  // Anchor resolution: prefer the explicit ref, else querySelector. The
  // Radix Popover needs a Trigger element — we render an invisible
  // positioning anchor so the consumer can put real, click-through-able UI
  // wherever they want without us hijacking it (spec §4.7 rule 6 —
  // "Never blocks the underlying interface").
  const anchorEl = useResolvedAnchor(step)
  const reducedMotion = useReducedMotionFlag()

  // No CMS content yet → render nothing. Spec §13.4 graceful degradation:
  // proactive guidance with no copy is silently skipped, not a crash.
  // We still render the anchor wrapper so subsequent steps that DO have
  // content work — the popover just stays closed.
  const cm = data as CoachmarkContent | null
  const heading = cm?.heading ?? null
  const body = cm?.body ?? null
  const ctaLabel = cm?.ctaLabel ?? null

  // The popover opens iff: tour says we're ready AND we have either a CMS
  // hit OR were given an anchor (popover content is a no-op without one).
  const shouldShow = isOpen && Boolean(heading || body)

  const isLastStep = stepIndex === totalSteps - 1

  return (
    <PopoverPrimitive.Root open={shouldShow} onOpenChange={() => undefined}>
      {/* Anchor: invisible 1×1 positioning marker. If anchorEl resolves we */}
      {/* portal to it; otherwise fall back to viewport-centered. */}
      <PopoverPrimitive.Anchor virtualRef={anchorEl ? { current: anchorEl } : undefined} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={step.side ?? 'bottom'}
          align="center"
          sideOffset={8}
          // Spec §4.7 rule 6: a coachmark must NEVER block the underlying
          // surface. Radix Popover's `onInteractOutside` and the
          // `onOpenAutoFocus={preventDefault}` keep the host UI clickable.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'z-50 max-w-[320px] rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg',
            !reducedMotion &&
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
            !reducedMotion &&
              'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95',
          )}
          role="dialog"
          aria-labelledby={`tour-${tourId}-step-${stepIndex}-heading`}
          aria-describedby={`tour-${tourId}-step-${stepIndex}-body`}
        >
          {/* Step indicator — spec §4.7 puts it above the heading. */}
          <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.08em] opacity-75">
            Step {stepIndex + 1} of {totalSteps}
          </div>
          {heading ? (
            <div
              id={`tour-${tourId}-step-${stepIndex}-heading`}
              className="mb-1 text-sm font-semibold leading-tight"
            >
              {heading}
            </div>
          ) : null}
          {body ? (
            <div
              id={`tour-${tourId}-step-${stepIndex}-body`}
              className="text-sm leading-relaxed opacity-90"
            >
              {body}
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs underline opacity-75 hover:opacity-100"
              data-testid="tour-skip"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={isLastStep ? onComplete : onNext}
              className="rounded bg-primary-foreground px-2.5 py-1 text-xs font-medium text-primary"
              data-testid={isLastStep ? 'tour-complete' : 'tour-next'}
            >
              {ctaLabel ?? (isLastStep ? 'Done' : 'Next')}
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

// ─── Anchor resolution hook ────────────────────────────────────────────────

function useResolvedAnchor(step: CoachmarkStep): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (step.anchorRef?.current) {
      setEl(step.anchorRef.current)
      return
    }
    if (step.anchorSelector && typeof document !== 'undefined') {
      const found = document.querySelector(step.anchorSelector)
      setEl(found instanceof HTMLElement ? found : null)
      return
    }
    setEl(null)
  }, [step.anchorRef, step.anchorSelector])
  return el
}

// ─── Reduced-motion hook ───────────────────────────────────────────────────

function useReducedMotionFlag(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion())
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    let mql: MediaQueryList
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    } catch {
      return
    }
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    // Safari < 14 fallback
    if (typeof (mql as MediaQueryList & { addListener?: typeof mql.addEventListener }).addListener === 'function') {
      ;(mql as unknown as { addListener: (h: (e: MediaQueryListEvent) => void) => void }).addListener(handler)
      return () => {
        ;(mql as unknown as { removeListener: (h: (e: MediaQueryListEvent) => void) => void }).removeListener(handler)
      }
    }
    return
  }, [])
  return reduced
}
