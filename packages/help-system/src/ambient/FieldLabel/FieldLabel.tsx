import * as React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Local Tailwind class merge — equivalent to `@patina/design-system`'s `cn`.
 *
 * Inlined to avoid a build-time dependency on the design-system dist output
 * while keeping the same semantics (clsx for conditional concat, tailwind-merge
 * for last-wins token resolution).
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Props for the {@link FieldLabel} ambient component.
 *
 * See spec §4.4 — `<FieldHelper />` and `<FieldLabel />`:
 *   docs/prds/Guide/patina-help-guidance-engineering-handoff.md
 */
export interface FieldLabelProps {
  /**
   * The id of the input this label is bound to.
   * Mirrors the native `<label htmlFor>` attribute.
   */
  htmlFor: string
  /**
   * Append a Terracotta asterisk marker indicating the field is required.
   *
   * This is **visual only** — the parent input owns the accessible
   * `aria-required` / `required` semantics. The marker is hidden from
   * assistive tech via `aria-hidden`.
   *
   * If both `required` and `optional` are set, `required` wins.
   */
  required?: boolean
  /**
   * Append a muted `(optional)` marker. Mutually exclusive with `required` —
   * if both are set, `required` wins.
   */
  optional?: boolean
  /**
   * Label content. May be a plain string or a fragment that includes
   * trailing affordances such as `<InfoIcon />` or `<StrataInfoIcon />`.
   * No special handling is applied — children render verbatim.
   */
  children: React.ReactNode
  /**
   * Additional class names appended to the base label styling.
   * Use sparingly — prefer the canonical help-system label styling so
   * fields look consistent across portals.
   */
  className?: string
}

/**
 * `<FieldLabel />` — the small caps label that sits above a form field
 * in Patina's Help & Guidance System (Layer 1, Ambient).
 *
 * Per spec §4.4 typography rules:
 *   • DM Mono uppercase, very small size, generous letter-spacing
 *   • Required marker is Terracotta (`text-help-terracotta` / fallback red)
 *   • Optional marker is italic Inter, muted
 *
 * This is a pure presentational component — it does NOT fetch from Sanity,
 * emit analytics, or own input semantics. It composes with `<InfoIcon />`
 * passed as a trailing child (see spec example, line 213).
 *
 * @example Basic usage
 * ```tsx
 * <FieldLabel htmlFor="project-name">Project name</FieldLabel>
 * ```
 *
 * @example Required field
 * ```tsx
 * <FieldLabel htmlFor="project-name" required>Project name</FieldLabel>
 * ```
 *
 * @example With trailing InfoIcon (composition pattern)
 * ```tsx
 * <FieldLabel htmlFor="aesthete-score">
 *   Aesthete Score <InfoIcon surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.Score} />
 * </FieldLabel>
 * ```
 */
export function FieldLabel({
  htmlFor,
  required,
  optional,
  children,
  className,
}: FieldLabelProps) {
  // Per spec §4.4: required marker takes precedence when both flags collide.
  const showRequired = required === true
  const showOptional = optional === true && !showRequired

  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        // ── Base "help-system field label" styling ────────────────────────
        // Marker class so consumers + tests can target the canonical look.
        'help-system-field-label',
        // Typography per spec §4.4: DM Mono, very small, uppercase, wide tracking.
        // We reference the help-system mono font via the design-system CSS var
        // (--font-meta) which portals already wire to "DM Mono".
        'inline-flex items-center gap-1.5',
        'font-[family-name:var(--font-meta,monospace)]',
        'text-[0.5rem] uppercase tracking-[0.06em]',
        'leading-none',
        // Color: muted foreground stands in for the spec's "--ao" (Antique Olive).
        // When A2 ships the final help-palette CSS vars, swap to --color-help-ao.
        'text-muted-foreground',
        className,
      )}
    >
      {children}
      {showRequired ? (
        <span
          data-testid="field-label-required-marker"
          aria-hidden="true"
          // Per spec §4.4: required marker uses Terracotta. Fall back to
          // the design-system destructive token until A2 ships --color-help-te.
          className="text-destructive"
        >
          *
        </span>
      ) : null}
      {showOptional ? (
        <span
          data-testid="field-label-optional-marker"
          // Per spec §4.4: italic Inter, 0.7rem, muted — no special character.
          className="font-[family-name:var(--font-body,sans-serif)] text-[0.7rem] italic normal-case text-muted-foreground"
        >
          (optional)
        </span>
      ) : null}
    </label>
  )
}

FieldLabel.displayName = 'FieldLabel'
