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
 *  - Wraps the glyph in the canonical `<Tooltip />` (C1) which handles CMS
 *    fetch, fallback resolution, portal rendering, hover delay (200ms),
 *    `prefers-reduced-motion`, and Escape/click-outside dismissal.
 *  - Fires `help.tooltip.shown` / `help.tooltip.dismissed` via the canonical
 *    Tooltip's analytics path with snake_case keys (R11) and
 *    `trigger: 'strata_info_icon'` to differentiate from the generic
 *    InfoIcon trigger.
 *
 * Spec reference: docs/prds/Guide/patina-help-guidance-engineering-handoff.md §4.2
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { StrataMark } from '@patina/design-system'
import { Tooltip } from '../Tooltip'

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

// ─── Component ────────────────────────────────────────────────────────────────

export function StrataInfoIcon({
  surfaceKey,
  size = 14,
  className,
  fallback,
  ariaLabel = 'Patina concept',
}: StrataInfoIconProps) {
  return (
    <Tooltip
      surfaceKey={surfaceKey}
      fallback={fallback}
      trigger="strata_info_icon"
    >
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
        <StrataMark size={size} />
      </button>
    </Tooltip>
  )
}

StrataInfoIcon.displayName = 'StrataInfoIcon'
