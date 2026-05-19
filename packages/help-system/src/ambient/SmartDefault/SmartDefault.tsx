'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

/**
 * SmartDefault — Ambient-layer headless wrapper (Sprint 1, v1).
 *
 * Pre-fills a form field with a sensible default and emits audit telemetry so
 * the content team can see whether the suggestion is trusted or routinely
 * overridden. The component renders **no chrome of its own around children**;
 * it uses a render-prop so the consumer keeps full control over the field
 * markup and the form library wiring.
 *
 * Telemetry (v1, fires via `window.posthog?.capture` to avoid a hard PostHog
 * SDK dependency in this package):
 *  - `help.smart_default.applied` on mount
 *      { field_name, surface_key?, reason, applied_at }
 *  - `help.smart_default.overridden` on the first user change that differs
 *    from `defaultValue` (Object.is comparison)
 *      { field_name, surface_key?, reason, time_to_override_ms }
 *
 * **v2 considerations (deferred to Sprint 2 / 3):**
 *  - Promote events into the typed `helpEvents.smartDefault.*` namespace in
 *    each portal's `lib/analytics/events.ts` once spec § 10.1 is amended.
 *  - Deeper-equality comparator prop for object-valued defaults
 *    (currently uses `Object.is`, which treats new object references as
 *    overrides — see SmartDefault.test.tsx "object T" case).
 *  - Sanity-driven `reason` copy via `surfaceKey` so the rationale can be
 *    rewritten without a code change. Today, `reason` is passed inline.
 *  - First-class tooltip integration once `<Tooltip />` (Stream C) ships.
 *  - Per-persona reasons (designer vs. client copy) via the `useHelpContent`
 *    persona axis.
 *
 * @example
 * ```tsx
 * <SmartDefault<number>
 *   fieldName="markup_pct"
 *   defaultValue={3}
 *   reason="Industry standard 3%."
 *   surfaceKey="designer-portal/pipeline/proposal/markup"
 * >
 *   {({ defaultValue, onChange, hintNode }) => (
 *     <label>
 *       <span>Markup</span>
 *       <input
 *         type="number"
 *         defaultValue={defaultValue}
 *         onChange={(e) => onChange(Number(e.target.value))}
 *       />
 *       {hintNode}
 *     </label>
 *   )}
 * </SmartDefault>
 * ```
 */
export interface SmartDefaultAPI<T> {
  /** The sensible default the wrapper supplied. Consumers seed their controlled state with this. */
  defaultValue: T
  /** Flips to true on the first onChange call with a value !== defaultValue. */
  isOverridden: boolean
  /**
   * Wire this to the underlying field's onChange. The wrapper uses it to
   * detect the first override and emit `help.smart_default.overridden`.
   */
  onChange: (newValue: T) => void
  /** Pre-rendered hint node based on the `hint` prop. Render alongside the field. */
  hintNode: ReactNode
}

export interface SmartDefaultProps<T = unknown> {
  /** Stable field identifier; flows into telemetry as `field_name`. */
  fieldName: string
  /** The default value to pre-fill. */
  defaultValue: T
  /** Human-readable rationale, e.g. "Based on similar projects you've created". */
  reason: string
  /**
   * ISO timestamp the default was applied. Defaults to `new Date().toISOString()`
   * at mount. Pass this if your back-end pre-computed the default.
   */
  appliedAt?: string
  /** Optional surface key for Sanity-driven explanation copy and dashboards. */
  surfaceKey?: string
  /**
   * Render-prop. Consumers wire the returned API to their own field markup.
   */
  children: (api: SmartDefaultAPI<T>) => ReactElement
  /**
   * Hint variant rendered as `api.hintNode`.
   *  - `'icon'` (default): a small sparkle glyph with a `title`/`aria-label`
   *    of the reason — pair with `<Tooltip />` (Stream C) for richer copy.
   *  - `'inline'`: italic helper text reading `Default: {reason}`.
   *  - `'none'`: render nothing for hint.
   */
  hint?: 'inline' | 'icon' | 'none'
}

// ─── Telemetry plumbing ───────────────────────────────────────────────────────

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

// ─── Inline SVG (no design-system dep on a sparkle icon yet) ──────────────────

/**
 * 12px inline sparkle glyph. Self-contained so this component has no
 * runtime asset dependency. When the design system adds a Sparkle icon, swap
 * for `<Sparkle size={12} />`.
 */
function SparkleGlyph(): ReactElement {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 0.5L7 4.5L11 5.5L7 6.5L6 10.5L5 6.5L1 5.5L5 4.5L6 0.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

// ─── Hint rendering ───────────────────────────────────────────────────────────

function renderHintNode(
  variant: 'inline' | 'icon' | 'none',
  reason: string,
): ReactNode {
  switch (variant) {
    case 'inline':
      return (
        <span
          data-testid="smart-default-hint-inline"
          style={{
            fontStyle: 'italic',
            fontSize: '0.65rem',
            color: 'var(--ao, #6b6864)',
            marginTop: 2,
          }}
        >
          Default: {reason}
        </span>
      )
    case 'icon':
      return (
        <span
          data-testid="smart-default-hint-icon"
          role="img"
          aria-label={`Smart default: ${reason}`}
          title={`Smart default: ${reason}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--cl, #b88761)',
            marginLeft: 4,
            cursor: 'help',
          }}
        >
          <SparkleGlyph />
        </span>
      )
    case 'none':
    default:
      return null
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SmartDefault<T = unknown>(props: SmartDefaultProps<T>): ReactElement {
  const {
    fieldName,
    defaultValue,
    reason,
    appliedAt,
    surfaceKey,
    children,
    hint = 'icon',
  } = props

  const [isOverridden, setIsOverridden] = useState(false)

  // Capture the default value once so consumer-side identity churn (re-renders
  // with the same literal but new reference) doesn't accidentally re-baseline
  // override detection.
  const defaultValueRef = useRef<T>(defaultValue)

  // Lock the applied-at timestamp at mount so it's stable across re-renders
  // and so `time_to_override_ms` is measured from the first paint.
  // We use Date.now() (not performance.now()) so vitest's fake-timer
  // infrastructure can drive deterministic timings in tests — telemetry only
  // needs ms-level resolution.
  const appliedAtRef = useRef<string>(appliedAt ?? new Date().toISOString())
  const mountedAtMsRef = useRef<number>(Date.now())

  // Track whether we've already fired the override event so a second
  // user-change doesn't double-count.
  const hasFiredOverrideRef = useRef(false)

  // Emit the applied event exactly once on mount.
  useEffect(() => {
    const payload: Record<string, unknown> = {
      field_name: fieldName,
      reason,
      applied_at: appliedAtRef.current,
    }
    if (surfaceKey !== undefined) {
      payload.surface_key = surfaceKey
    }
    safeCapture('help.smart_default.applied', payload)
    // We intentionally fire once on mount only; the spec treats "applied" as
    // a render-time signal and downstream dashboards de-dupe by user+field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (newValue: T): void => {
    if (hasFiredOverrideRef.current) return
    // Use Object.is so NaN === NaN and -0 vs 0 don't confuse equality.
    // Documented v2 item: deep-equality comparator for object-valued defaults.
    if (Object.is(newValue, defaultValueRef.current)) return

    hasFiredOverrideRef.current = true
    setIsOverridden(true)

    const nowMs = Date.now()
    const payload: Record<string, unknown> = {
      field_name: fieldName,
      reason,
      time_to_override_ms: Math.max(0, Math.round(nowMs - mountedAtMsRef.current)),
    }
    if (surfaceKey !== undefined) {
      payload.surface_key = surfaceKey
    }
    safeCapture('help.smart_default.overridden', payload)
  }

  const hintNode = useMemo(() => renderHintNode(hint, reason), [hint, reason])

  const api = useMemo<SmartDefaultAPI<T>>(
    () => ({
      defaultValue: defaultValueRef.current,
      isOverridden,
      onChange: handleChange,
      hintNode,
    }),
    // handleChange is stable-by-closure (uses refs); intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOverridden, hintNode],
  )

  return children(api)
}

SmartDefault.displayName = 'SmartDefault'
