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

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
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
        <StrataMarkInline size={size} />
      </button>
    </Tooltip>
  )
}

StrataInfoIcon.displayName = 'StrataInfoIcon'
